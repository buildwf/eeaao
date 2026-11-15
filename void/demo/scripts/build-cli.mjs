// Bundles the eeao CLI (packages/cli) into .cli/eeao.mjs. Published, this is `npx eeao`.
import { build } from 'vite';
const src = new URL('../../../typescript/packages/', import.meta.url).pathname;
await build({
  configFile: false,
  logLevel: 'warn',
  resolve: { alias: [{ find: '@eeao/core', replacement: `${src}core/src/index.ts` }] },
  build: {
    ssr: `${src}cli/src/bin.ts`,
    outDir: new URL('../.cli', import.meta.url).pathname,
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'eeao.mjs' } },
  },
});
