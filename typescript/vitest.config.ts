import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (name: string, file = 'index') => fileURLToPath(new URL(`./packages/${name}/src/${file}.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@eeao/http/client', replacement: pkg('http', 'client') },
      ...['core', 'http', 'mcp', 'ai', 'analytics', 'cli'].map((n) => ({ find: `@eeao/${n}`, replacement: pkg(n) })),
    ],
  },
  test: { include: ['packages/*/test/**/*.test.ts', 'examples/*/test/**/*.test.ts'] },
});
