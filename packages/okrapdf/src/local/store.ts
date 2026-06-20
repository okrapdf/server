import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { OkraRuntimeError } from '../errors.js';
import type { LocalDocumentRecord } from './types.js';

export const DEFAULT_LOCAL_DATA_DIR = join(homedir(), '.okrapdf', 'docs');

export function resolveLocalDataDir(dataDir?: string): string {
  return dataDir || process.env.OKRA_LOCAL_DATA_DIR || DEFAULT_LOCAL_DATA_DIR;
}

export function ensureLocalStore(dataDir?: string): string {
  const resolved = resolveLocalDataDir(dataDir);
  mkdirSync(join(resolved, 'docs'), { recursive: true });
  return resolved;
}

export function createLocalDocumentId(): string {
  return `doc-local-${randomUUID()}`;
}

export function getDocumentDir(documentId: string, dataDir?: string): string {
  return join(resolveLocalDataDir(dataDir), 'docs', documentId);
}

export function getDocumentMetaPath(documentId: string, dataDir?: string): string {
  return join(getDocumentDir(documentId, dataDir), 'meta.json');
}

export function getDocumentPagesDir(documentId: string, dataDir?: string): string {
  return join(getDocumentDir(documentId, dataDir), 'pages');
}

export function getDocumentPagePath(
  documentId: string,
  pageNumber: number,
  dataDir?: string,
): string {
  return join(getDocumentPagesDir(documentId, dataDir), `page-${String(pageNumber).padStart(4, '0')}.txt`);
}

export function initializeDocumentDir(documentId: string, dataDir?: string): string {
  const dir = getDocumentDir(documentId, dataDir);
  rmSync(dir, { force: true, recursive: true });
  mkdirSync(join(dir, 'pages'), { recursive: true });
  return dir;
}

export function copySourceIntoStore(
  documentId: string,
  sourcePath: string,
  dataDir?: string,
): string {
  const target = join(getDocumentDir(documentId, dataDir), 'source.pdf');
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(sourcePath, target);
  return target;
}

export function writeDocumentRecord(record: LocalDocumentRecord, dataDir?: string): void {
  const metaPath = getDocumentMetaPath(record.documentId, dataDir);
  mkdirSync(dirname(metaPath), { recursive: true });
  writeFileSync(metaPath, JSON.stringify(record, null, 2), 'utf8');
}

export function readDocumentRecord(documentId: string, dataDir?: string): LocalDocumentRecord {
  const metaPath = getDocumentMetaPath(documentId, dataDir);
  if (!existsSync(metaPath)) {
    throw new OkraRuntimeError('DOCUMENT_NOT_FOUND', `Local document not found: ${documentId}`, 404);
  }
  return JSON.parse(readFileSync(metaPath, 'utf8')) as LocalDocumentRecord;
}

export function writeDocumentPageText(
  documentId: string,
  pageNumber: number,
  text: string,
  dataDir?: string,
): string {
  const pagePath = getDocumentPagePath(documentId, pageNumber, dataDir);
  mkdirSync(dirname(pagePath), { recursive: true });
  writeFileSync(pagePath, text, 'utf8');
  return pagePath;
}

export function readDocumentPageText(
  documentId: string,
  pageNumber: number,
  dataDir?: string,
): string {
  const pagePath = getDocumentPagePath(documentId, pageNumber, dataDir);
  if (!existsSync(pagePath)) {
    throw new OkraRuntimeError(
      'DOCUMENT_NOT_FOUND',
      `Local page ${pageNumber} not found for document ${documentId}`,
      404,
    );
  }
  return readFileSync(pagePath, 'utf8');
}

