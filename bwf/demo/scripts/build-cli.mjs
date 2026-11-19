// Bundles the realtime CLI (packages/cli) into .cli/realtime.mjs. Published, this is `npx realtime`.
import { build } from 'vite';
const src = new URL('../../../typescript/packages/', import.meta.url).pathname;
await build({
  configFile: false,
  logLevel: 'warn',
  resolve: { alias: [{ find: '@builtbyfriends/realtime', replacement: `${src}core/src/index.ts` }] },
  build: {
    ssr: `${src}cli/src/bin.ts`,
    outDir: new URL('../.cli', import.meta.url).pathname,
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'realtime.mjs' } },
  },
});
