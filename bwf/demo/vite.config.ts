import { defineConfig } from 'vite';
import { bwfPlugin } from '@buildwf/bwf';
// Published, this is: import { eeao } from '@eeao/bwf/plugin';
import { eeao } from '../../typescript/packages/bwf/src/plugin.ts';

export default defineConfig({
  plugins: [bwfPlugin(), eeao()],
  // Only because the eeao packages aren't published yet: point at their source.
  resolve: {
    alias: aliases(),
    dedupe: ['@buildwf/bwf', 'zod', 'hono', 'agents', '@modelcontextprotocol/server', '@standard-schema/spec'],
  },
});

function aliases() {
  const pkgs = new URL('../../typescript/packages/', import.meta.url).pathname;
  return [
    { find: '@eeao/bwf/plugin', replacement: `${pkgs}bwf/src/plugin.ts` },
    { find: '@eeao/bwf/middleware', replacement: `${pkgs}bwf/src/middleware.ts` },
    { find: '@eeao/bwf', replacement: `${pkgs}bwf/src/index.ts` },
    { find: '@eeao/http/client', replacement: `${pkgs}http/src/client.ts` },
    ...['core', 'http', 'mcp', 'ai', 'analytics'].map((p) => ({ find: `@eeao/${p}`, replacement: `${pkgs}${p}/src/index.ts` })),
  ];
}
