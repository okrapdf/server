import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(__dirname, '..', '..');

function resolvePnpmPackagePath(packageName: string, majorVersion: number): string {
  const localPath = resolve(__dirname, 'node_modules', packageName);
  if (existsSync(localPath)) {
    return localPath;
  }

  const pnpmStoreDir = resolve(workspaceRoot, 'node_modules/.pnpm');
  const match = readdirSync(pnpmStoreDir).find((entry) => entry.startsWith(`${packageName}@${majorVersion}.`));
  if (!match) {
    throw new Error(`Unable to resolve ${packageName}@${majorVersion} for Vitest aliases.`);
  }

  return resolve(pnpmStoreDir, match, 'node_modules', packageName);
}

const reactPath = resolvePnpmPackagePath('react', 18);
const reactDomPath = resolvePnpmPackagePath('react-dom', 18);

export default defineConfig({
  resolve: {
    alias: {
      react: reactPath,
      'react/jsx-runtime': resolve(reactPath, 'jsx-runtime.js'),
      'react/jsx-dev-runtime': resolve(reactPath, 'jsx-dev-runtime.js'),
      'react-dom': reactDomPath,
      'react-dom/client': resolve(reactDomPath, 'client.js'),
      'react-dom/test-utils': resolve(reactDomPath, 'test-utils.js'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
});
