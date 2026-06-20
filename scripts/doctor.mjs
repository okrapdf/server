#!/usr/bin/env node
// Local toolchain check — verifies the real-extraction binaries are installed.
// Fully local: no network, no okraPDF cloud, never touches OKRA_API_KEY.

import { execFileSync } from 'node:child_process';

const tools = ['pdftotext', 'pdfinfo', 'pdftoppm', 'tesseract'];
let ok = true;

for (const t of tools) {
  try {
    execFileSync('/bin/sh', ['-c', `command -v ${t}`], { stdio: 'ignore' });
    console.log(`✓ ${t}`);
  } catch {
    console.error(`✗ ${t} — MISSING`);
    ok = false;
  }
}

if (!ok) {
  console.error('\nInstall the local extraction toolchain:');
  console.error('  macOS:   brew install poppler tesseract');
  console.error('  Debian:  sudo apt-get install -y poppler-utils tesseract-ocr');
  process.exit(1);
}

console.log('\nLocal extraction toolchain OK (poppler + tesseract).');
