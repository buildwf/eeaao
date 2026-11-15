import { defineConfig } from 'vite';
import { voidPlugin } from 'void';
// Published, this is: import { eeao } from '@eeao/void/plugin';
import { eeao } from '../../typescript/packages/void/src/plugin.ts';

export default defineConfig({
  plugins: [voidPlugin(), eeao()],
  // Only because the eeao packages aren't published yet: point at their source.
  resolve: {
    alias: aliases(),
    dedupe: ['void', 'zod', 'hono', 'agents', '@modelcontextprotocol/server', '@standard-schema/spec'],
  },
});

function aliases() {
  const pkgs = new URL('../../typescript/packages/', import.meta.url).pathname;
  return [
    { find: '@eeao/void/plugin', replacement: `${pkgs}void/src/plugin.ts` },
    { find: '@eeao/void/middleware', replacement: `${pkgs}void/src/middleware.ts` },
    { find: '@eeao/void', replacement: `${pkgs}void/src/index.ts` },
    { find: '@eeao/http/client', replacement: `${pkgs}http/src/client.ts` },
    ...['core', 'http', 'mcp', 'ai', 'analytics'].map((p) => ({ find: `@eeao/${p}`, replacement: `${pkgs}${p}/src/index.ts` })),
  ];
}
