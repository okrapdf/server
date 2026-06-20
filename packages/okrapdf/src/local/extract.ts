import { mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { OkraRuntimeError } from '../errors.js';
import type { LocalDoctorReport, LocalToolAvailability } from './types.js';

const TOOL_NAMES = ['pdftotext', 'pdfinfo', 'pdftoppm', 'tesseract'] as const;

type ToolName = (typeof TOOL_NAMES)[number];

interface ExtractedPage {
  pageNumber: number;
  text: string;
  ocrApplied: boolean;
}

export interface ExtractedDocument {
  pageCount: number;
  charCount: number;
  ocrUsed: boolean;
  pages: ExtractedPage[];
  tools: LocalDoctorReport['tools'];
}

function runCommand(command: string, args: string[]): string {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.error) {
    throw new OkraRuntimeError(
      'INVALID_REQUEST',
      `Failed to run ${command}: ${result.error.message}`,
      500,
    );
  }

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new OkraRuntimeError(
      'INVALID_REQUEST',
      stderr ? `${command} failed: ${stderr}` : `${command} exited with code ${result.status}`,
      500,
    );
  }

  return result.stdout ?? '';
}

function detectTool(name: ToolName): LocalToolAvailability {
  const result = spawnSync('/bin/sh', ['-lc', `command -v ${name}`], { encoding: 'utf8' });
  const path = result.status === 0 ? (result.stdout || '').trim() : '';
  return {
    available: path.length > 0,
    path: path || null,
  };
}

function splitPages(raw: string, pageCount: number): string[] {
  const pages = raw
    .split('\f')
    .map((value) => value.replace(/\r/g, '').trimEnd());

  while (pages.length > 0 && pages[pages.length - 1]?.trim() === '') {
    pages.pop();
  }

  if (pages.length < pageCount) {
    return [...pages, ...new Array(pageCount - pages.length).fill('')];
  }

  return pages.slice(0, pageCount);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function needsOcr(text: string): boolean {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return true;
  const alphaNumeric = (normalized.match(/[A-Za-z0-9]/g) || []).length;
  return normalized.length < 80 || alphaNumeric / normalized.length < 0.35;
}

function extractPageCount(sourcePath: string): number {
  const output = runCommand('pdfinfo', [sourcePath]);
  const match = output.match(/^Pages:\s+(\d+)$/m);
  if (!match) {
    throw new OkraRuntimeError('INVALID_RESPONSE', `Unable to determine page count for ${sourcePath}`, 500);
  }
  return Number.parseInt(match[1]!, 10);
}

function ocrPage(sourcePath: string, pageNumber: number): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'okra-local-ocr-'));
  const prefix = join(tempDir, `page-${pageNumber}`);
  try {
    runCommand('pdftoppm', ['-f', String(pageNumber), '-l', String(pageNumber), '-png', sourcePath, prefix]);
    // pdftoppm zero-pads the page suffix based on the document's page count
    // (e.g. page-09.png in a 59-page doc), so resolve whatever PNG it actually
    // wrote rather than guessing the exact filename.
    const produced = readdirSync(tempDir)
      .filter((name) => name.endsWith('.png'))
      .sort();
    if (produced.length === 0) {
      throw new OkraRuntimeError(
        'INVALID_RESPONSE',
        `pdftoppm did not produce an image for page ${pageNumber}`,
        500,
      );
    }
    const imagePath = join(tempDir, produced[0]!);
    return normalizeWhitespace(runCommand('tesseract', [imagePath, 'stdout', '--psm', '6']));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function localToolReport(dataDir: string): LocalDoctorReport {
  const tools = {
    pdftotext: detectTool('pdftotext'),
    pdfinfo: detectTool('pdfinfo'),
    pdftoppm: detectTool('pdftoppm'),
    tesseract: detectTool('tesseract'),
  };

  return {
    ok: tools.pdftotext.available && tools.pdfinfo.available,
    dataDir,
    tools,
  };
}

export function extractLocalDocument(sourcePath: string, dataDir: string): ExtractedDocument {
  const report = localToolReport(dataDir);
  if (!report.tools.pdftotext.available || !report.tools.pdfinfo.available) {
    throw new OkraRuntimeError(
      'INVALID_REQUEST',
      'Local PDF extraction requires pdftotext and pdfinfo to be installed',
      500,
      report.tools,
    );
  }

  const pageCount = extractPageCount(sourcePath);
  const raw = runCommand('pdftotext', ['-layout', '-enc', 'UTF-8', sourcePath, '-']);
  const split = splitPages(raw, pageCount);

  let charCount = 0;
  let ocrUsed = false;
  const pages = split.map((pageText, index) => {
    const pageNumber = index + 1;
    let text = normalizeWhitespace(pageText);
    let ocrApplied = false;

    if (needsOcr(text) && report.tools.pdftoppm.available && report.tools.tesseract.available) {
      try {
        const ocrText = ocrPage(sourcePath, pageNumber);
        if (ocrText.length > text.length) {
          text = ocrText;
        }
        ocrApplied = ocrText.length > 0;
        ocrUsed = ocrUsed || ocrApplied;
      } catch {
        // Per-page OCR failure is non-fatal: keep the text-layer result for this
        // page rather than aborting extraction of the whole document.
      }
    }

    charCount += text.length;
    return { pageNumber, text, ocrApplied };
  });

  return {
    pageCount,
    charCount,
    ocrUsed,
    pages,
    tools: {
      ...report.tools,
      tesseract: report.tools.tesseract,
      pdftoppm: report.tools.pdftoppm,
      pdftotext: report.tools.pdftotext,
      pdfinfo: report.tools.pdfinfo,
    },
  };
}

