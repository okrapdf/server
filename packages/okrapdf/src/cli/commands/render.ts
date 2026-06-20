/**
 * okra render — Generate a PDF from a ReportLab Python script, codemode JS,
 * a designed PDF spec JSON, or an HTML file. Docless by default; --save
 * persists into the user's account.
 *
 * Usage:
 *   okra render ./report.py --input data.csv -o out.pdf
 *   okra render ./spec.json -o out.pdf
 *   okra render ./user.js -o out.pdf --mode exec
 *   okra render ./invoice.html -o invoice.pdf
 *   okra render ./report.py --save -o out.pdf
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { basename, extname, resolve } from 'path';

import { OkraRuntimeError } from '../../errors';
import { createOkraServerClient, type RenderFile, type RenderResult } from '../../server/client';
import type { GlobalFlags } from '../output';
import { progress } from '../output';

export type RenderMode = 'reportlab' | 'exec' | 'designed' | 'html';

export interface RenderCliOptions extends GlobalFlags {
  mode?: RenderMode;
  input?: string;
  file?: string[];
  save?: boolean;
  fileName?: string;
}

export interface RenderCliResult {
  render_id: string;
  sha256: string;
  size: number;
  document_id: string | null;
  download_url: string | null;
  output_path: string;
  mode: RenderMode;
}

function inferMode(source: string): RenderMode | null {
  const ext = extname(source).toLowerCase();
  if (ext === '.py') return 'reportlab';
  if (ext === '.json') return 'designed';
  if (ext === '.html' || ext === '.htm') return 'html';
  return null;
}

function parseFileFlags(flags: string[] | undefined): RenderFile[] {
  if (!flags) return [];
  return flags.map((spec) => {
    const eq = spec.indexOf('=');
    if (eq === -1) {
      const message = `--file must be NAME=PATH (got "${spec}")`;
      throw new OkraRuntimeError('INVALID_REQUEST', message, 400, {
        error: 'invalid_file_flag',
        message,
        next_actions: [
          { cmd: 'okra render ./report.py --file data.csv=./data.csv -o out.pdf', why: 'Pass each extra render input as --file NAME=PATH (NAME is how the script opens it).' },
        ],
      });
    }
    const name = spec.slice(0, eq);
    const path = spec.slice(eq + 1);
    const content = readFileSync(resolve(path), 'utf-8');
    return { path: name, content, encoding: 'utf-8' };
  });
}

function reportLabFiles(primary: string | undefined, additional: RenderFile[]): RenderFile[] {
  const files = [...additional];
  if (primary) {
    const primaryName = basename(primary);
    if (files.some((f) => f.path === primaryName)) {
      const message = `--input "${primary}" collides with --file ${primaryName}=… ; use --file NAME=PATH for both, or rename.`;
      throw new OkraRuntimeError('INVALID_REQUEST', message, 400, {
        error: 'input_file_collision',
        message,
        next_actions: [
          { cmd: `okra render ./report.py --file ${primaryName}=./${primaryName} -o out.pdf`, why: 'Pass the colliding file via --file NAME=PATH instead of --input, or rename one so the names differ.' },
        ],
      });
    }
    files.unshift({
      path: primaryName,
      content: readFileSync(resolve(primary), 'utf-8'),
      encoding: 'utf-8',
    });
  }
  return files;
}

/**
 * Parse a JSON file argument with a structured envelope on failure. A bare
 * JSON.parse here throws a SyntaxError that handleError renders as the generic
 * error:"error", code:1 dead-end — same class as the redact --policy / inline
 * --payload fixes. `kind` distinguishes the designed-spec vs exec-input path.
 */
export function parseRenderJson(raw: string, source: string, kind: 'spec' | 'input'): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = `${source} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
    throw new OkraRuntimeError('INVALID_REQUEST', message, 400, {
      error: kind === 'spec' ? 'invalid_spec_json' : 'invalid_input_json',
      message,
      next_actions: [
        kind === 'spec'
          ? { cmd: 'okra render <spec.json> -o out.pdf', why: 'Point render at a valid designed-PDF spec JSON.' }
          : { cmd: 'okra render <script> --input <data.json> -o out.pdf', why: 'Pass valid JSON as the --input data file.' },
      ],
    });
  }
}

export async function render(
  source: string,
  outputPath: string,
  opts: RenderCliOptions & { apiKey: string; baseUrl?: string },
): Promise<RenderCliResult> {
  const sourceAbs = resolve(source);
  // Fail fast with a structured envelope when the source file is missing —
  // otherwise readFileSync throws a bare ENOENT that handleError renders as a
  // generic error:"error", code:1 dead-end (mirrors the extract missing-schema
  // fix). The source is always a local path (reportlab/exec/designed/html).
  if (!existsSync(sourceAbs)) {
    const message = `Render source file not found: ${source}`;
    throw new OkraRuntimeError('INVALID_REQUEST', message, 400, {
      error: 'source_not_found',
      message,
      next_actions: [
        { cmd: 'okra render <script.py|spec.json|page.html> -o out.pdf', why: 'Point render at an existing ReportLab/codemode/designed/HTML source file.' },
      ],
    });
  }
  let mode = opts.mode || inferMode(source);
  if (!mode) {
    if (extname(source).toLowerCase() === '.js' || extname(source).toLowerCase() === '.mjs') {
      const message = 'JS input is ambiguous — pass --mode exec (codemode) explicitly.';
      throw new OkraRuntimeError('INVALID_REQUEST', message, 400, {
        error: 'ambiguous_render_mode',
        message,
        next_actions: [
          { cmd: `okra render ${source} --mode exec -o out.pdf`, why: 'A .js/.mjs source runs as codemode — pass --mode exec to confirm.' },
        ],
      });
    }
    const message = 'Could not infer render mode from the file extension. Pass --mode reportlab|exec|designed|html.';
    throw new OkraRuntimeError('INVALID_REQUEST', message, 400, {
      error: 'unknown_render_mode',
      message,
      next_actions: [
        { cmd: `okra render ${source} --mode reportlab -o out.pdf`, why: 'Use .py→reportlab, .json→designed, .html→html, or set --mode explicitly for other extensions.' },
      ],
    });
  }

  if (opts.save && mode === 'designed') {
    const message = 'designed mode does not currently support --save. Omit --save, or use --mode reportlab.';
    throw new OkraRuntimeError('INVALID_REQUEST', message, 400, {
      error: 'unsupported_render_option',
      message,
      next_actions: [
        { cmd: `okra render ${source} -o out.pdf`, why: 'Render designed PDFs without --save, or switch to --mode reportlab if you need to persist into your account.' },
      ],
    });
  }

  const okra = createOkraServerClient({
    apiKey: opts.apiKey,
    ...(opts.baseUrl ? { host: opts.baseUrl } : {}),
  });
  const fileName = opts.fileName || basename(outputPath === '-' ? 'output.pdf' : outputPath);

  progress(`Rendering ${mode} from ${sourceAbs}…`, opts.quiet);

  let result: RenderResult;
  if (mode === 'reportlab') {
    const scriptBody = readFileSync(sourceAbs, 'utf-8');
    const extraFiles = parseFileFlags(opts.file);
    const files = reportLabFiles(opts.input, extraFiles);
    result = await okra.renders.reportlab({
      script: scriptBody,
      files,
      fileName,
      persist: opts.save === true,
    });
  } else if (mode === 'exec') {
    const code = readFileSync(sourceAbs, 'utf-8');
    let input: unknown = undefined;
    if (opts.input) {
      const raw = readFileSync(resolve(opts.input), 'utf-8');
      const inputExt = extname(opts.input).toLowerCase();
      if (inputExt === '.json') {
        input = parseRenderJson(raw, opts.input, 'input');
      } else if (inputExt === '.csv') {
        input = { csv: raw };
      } else {
        input = { text: raw };
      }
    }
    result = await okra.renders.exec({
      code,
      input,
      fileName,
      persist: opts.save === true,
    });
  } else if (mode === 'html') {
    const html = readFileSync(sourceAbs, 'utf-8');
    result = await okra.renders.html({
      html,
      fileName,
      persist: opts.save === true,
    });
  } else {
    const raw = readFileSync(sourceAbs, 'utf-8');
    const spec = parseRenderJson(raw, source, 'spec') as import('../../server/client').RenderDesignedSpec;
    result = await okra.renders.designed({ spec, fileName });
  }

  const written = outputPath === '-' ? '(stdout)' : resolve(outputPath);
  if (outputPath === '-') {
    process.stdout.write(Buffer.from(result.pdfBytes));
  } else {
    writeFileSync(resolve(outputPath), Buffer.from(result.pdfBytes));
  }

  progress(`Wrote ${result.size.toLocaleString()} bytes to ${written}`, opts.quiet);

  return {
    render_id: result.renderId,
    sha256: result.sha256,
    size: result.size,
    document_id: result.documentId,
    download_url: result.downloadUrl,
    output_path: written,
    mode,
  };
}
