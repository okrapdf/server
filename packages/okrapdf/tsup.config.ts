import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/url.ts',
    'src/browser.ts',
    'src/worker.ts',
    'src/server/index.ts',
    'src/react/index.ts',
    'src/cli/index.ts',
    'src/cli/bin.ts',
    'src/content-types/index.ts',
  ],
  format: ['esm'],
  // DTS is generated only for the public library entries. `cli/bin.ts` is
  // excluded because Commander.js types currently disagree with some call
  // sites (pre-existing, unrelated to library code); the bin only needs a JS
  // output since it's invoked via shebang.
  dts: {
    entry: [
      'src/index.ts',
      'src/url.ts',
      'src/browser.ts',
      'src/worker.ts',
      'src/server/index.ts',
      'src/react/index.ts',
      'src/cli/index.ts',
      'src/content-types/index.ts',
    ],
  },
  splitting: true,
  clean: true,
  target: 'node20',
  sourcemap: true,
  shims: true,
  external: ['react'],
  noExternal: ['@okrapdf/schemas'],
  banner: ({ format }) => {
    // bin.ts needs the shebang
    return {};
  },
});
