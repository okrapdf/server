#!/usr/bin/env node
// Re-sync the vendored packages + runtime bundle from the okraPDF monorepo.
//
//   node scripts/sync-from-monorepo.mjs /path/to/okra
//
// Copies packages/okrapdf (@okrapdf/sdk) + packages/schemas + examples/self-host-runtime
// into this repo, excluding build output and internal orchestration artifacts. This repo
// is a public extract of the monorepo's self-host runtime; this script is the provenance.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mono = resolve(process.argv[2] ?? '');

if (!mono || !existsSync(join(mono, 'packages/okrapdf/package.json'))) {
  console.error('usage: node scripts/sync-from-monorepo.mjs <path-to-okra-monorepo>');
  process.exit(1);
}

const PKG_EXCLUDES = ['node_modules', 'dist', '.turbo', 'coverage', '*.tsbuildinfo'];
const BUNDLE_EXCLUDES = [
  'node_modules',
  '.runtime-data', // local runtime state written by `okra serve` — never ship it
  '*.handoff.json', '*.evidence.json', '*.proof.json', '*.readiness.json', 'railway-publish.pack.json',
  // root-level deploy files are owned by this repo, not the bundle copy
  'Dockerfile', 'docker-compose.yml', '.env.example', 'LICENSE', 'README.md',
];

function rsync(from, to, excludes) {
  const args = ['-a', '--delete'];
  for (const e of excludes) args.push(`--exclude=${e}`);
  args.push(from.endsWith('/') ? from : `${from}/`, to.endsWith('/') ? to : `${to}/`);
  execFileSync('rsync', args, { stdio: 'inherit' });
}

console.log(`syncing from ${mono} →  ${repoRoot}`);
rsync(join(mono, 'packages/okrapdf'), join(repoRoot, 'packages/okrapdf'), PKG_EXCLUDES);
rsync(join(mono, 'packages/schemas'), join(repoRoot, 'packages/schemas'), PKG_EXCLUDES);
rsync(join(mono, 'examples/self-host-runtime'), join(repoRoot, 'runtime'), BUNDLE_EXCLUDES);
console.log('done. review `git status`, then: pnpm install && pnpm build && pnpm test');
