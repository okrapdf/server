#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageDir = resolve(__dirname, '..');
const binPath = resolve(packageDir, 'dist/cli/bin.js');
const outPath = resolve(packageDir, 'CLI_HELP.md');
const checkMode = process.argv.includes('--check');

if (!existsSync(binPath)) {
  process.stderr.write(
    'Missing dist/cli/bin.js. Run `npm run build` in packages/okrapdf first.\n',
  );
  process.exit(1);
}

const helpTargets = [
  [],
  ['auth', '--help'],
  ['auth', 'status', '--help'],
  ['doctor', '--help'],
  ['upload', '--help'],
  ['bridge', '--help'],
  ['select', '--help'],
  ['action', '--help'],
  ['active-doc', '--help'],
  ['events', '--help'],
  ['watch', '--help'],
  ['resources', '--help'],
  ['resources', 'show', '--help'],
  ['content-types', '--help'],
  ['content-types', 'show', '--help'],
  ['invoice', '--help'],
  ['invoice', 'extract', '--help'],
  ['receipt', '--help'],
  ['receipt', 'extract', '--help'],
  ['documents', '--help'],
  ['documents', 'read', '--help'],
  ['documents', 'wait-for', '--help'],
  ['files', '--help'],
  ['jobs', '--help'],
  ['agents', '--help'],
  ['workflows', '--help'],
  ['extract', '--help'],
  ['parse', '--help'],
  ['chat', '--help'],
  ['list', '--help'],
  ['open', '--help'],
  ['read', '--help'],
  ['delete', '--help'],
  ['collections', '--help'],
  ['collections', 'query', '--help'],
  ['collections', 'extract', '--help'],
  ['profile', '--help'],
  ['serve', '--help'],
  ['self-host', '--help'],
  ['self-host', 'validate', '--help'],
  ['self-host', 'materialize', '--help'],
  ['self-host', 'proof', '--help'],
  ['self-host', 'plan', '--help'],
  ['self-host', 'railway', '--help'],
  ['self-host', 'network-plan', '--help'],
  ['self-host', 'template', '--help'],
  ['self-host', 'template-listing', '--help'],
  ['self-host', 'template-evidence', '--help'],
  ['self-host', 'implementations', '--help'],
  ['self-host', 'capability-evidence', '--help'],
  ['self-host', 'evidence-bundle', '--help'],
  ['self-host', 'publish-pack', '--help'],
  ['self-host', 'readiness', '--help'],
  ['self-host', 'smoke', '--help'],
  ['self-host', 'env', '--help'],
  ['self-host', 'compose', '--help'],
  ['self-host', 'serve', '--help'],
];

function runHelp(args) {
  try {
    return execFileSync(process.execPath, [binPath, ...args], {
      cwd: packageDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    if (stdout.trim()) {
      return stdout.trimEnd();
    }
    if (stderr.trim()) {
      return stderr.trimEnd();
    }
    const detail = [stdout, stderr].filter(Boolean).join('\n').trim();
    const cmd = ['node', 'dist/cli/bin.js', ...args].join(' ');
    throw new Error(`Failed to run "${cmd}"\n${detail}`);
  }
}

function formatSection(args, text) {
  const title = args.length === 0 ? 'okra --help' : `okra ${args.join(' ')}`;
  return `## \`${title}\`\n\n\`\`\`text\n${text}\n\`\`\`\n`;
}

const sections = helpTargets.map((args) => formatSection(args, runHelp(args)));

const generated = [
  '# CLI Help (Generated)',
  '',
  'Generated from the live Commander command tree in `src/cli/bin.ts`.',
  'Do not edit manually. Run `npm run docs:cli` in `packages/okrapdf`.',
  '',
  ...sections,
].join('\n');

if (checkMode) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (current !== generated) {
    process.stderr.write(
      'CLI help docs are out of date. Run `npm run docs:cli` in packages/okrapdf.\n',
    );
    process.exit(1);
  }
  process.stdout.write('CLI help docs are up to date.\n');
  process.exit(0);
}

writeFileSync(outPath, generated);
process.stdout.write(`Wrote ${outPath}\n`);
