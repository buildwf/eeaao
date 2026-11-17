import { defineConfig } from 'vite';
import { nosamPlugin } from 'nosam';
// Published, this is: import { eeao } from '@eeao/nosam/plugin';
import { eeao } from '../../typescript/packages/nosam/src/plugin.ts';

export default defineConfig({
  plugins: [nosamPlugin(), eeao()],
  // Only because the eeao packages aren't published yet: point at their source.
  resolve: {
    alias: aliases(),
    dedupe: ['nosam', 'zod', 'hono', 'agents', '@modelcontextprotocol/server', '@standard-schema/spec'],
  },
});

function aliases() {
  const pkgs = new URL('../../typescript/packages/', import.meta.url).pathname;
  return [
    { find: '@eeao/nosam/plugin', replacement: `${pkgs}nosam/src/plugin.ts` },
    { find: '@eeao/nosam/middleware', replacement: `${pkgs}nosam/src/middleware.ts` },
    { find: '@eeao/nosam', replacement: `${pkgs}nosam/src/index.ts` },
    { find: '@eeao/http/client', replacement: `${pkgs}http/src/client.ts` },
    ...['core', 'http', 'mcp', 'ai', 'analytics'].map((p) => ({ find: `@eeao/${p}`, replacement: `${pkgs}${p}/src/index.ts` })),
  ];
}
