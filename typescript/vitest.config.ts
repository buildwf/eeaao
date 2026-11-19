import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (name: string, file = 'index') => fileURLToPath(new URL(`./packages/${name}/src/${file}.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@buildwf/realtime-live/react', replacement: pkg('live', 'react') },
      { find: '@buildwf/realtime-http/client', replacement: pkg('http', 'client') },
      ...['core', 'http', 'mcp', 'ai', 'analytics', 'cli', 'data', 'live'].map((n) => ({ find: n === 'core' ? '@buildwf/realtime' : `@buildwf/realtime-${n}`, replacement: pkg(n) })),
    ],
  },
  test: { include: ['packages/*/test/**/*.test.{ts,tsx}', 'examples/*/test/**/*.test.ts'] },
});
