import { defineConfig } from 'vite';
import { bwfPlugin } from '@builtbyfriends/bwf';
// Published, this is: import { eeao } from '@builtbyfriends/realtime-bwf/plugin';
import { eeao } from '../../typescript/packages/bwf/src/plugin.ts';

export default defineConfig({
  plugins: [bwfPlugin(), eeao()],
  // Only because the eeao packages aren't published yet: point at their source.
  resolve: {
    alias: aliases(),
    dedupe: ['@builtbyfriends/bwf', 'zod', 'hono', 'agents', '@modelcontextprotocol/server', '@standard-schema/spec'],
  },
});

function aliases() {
  const pkgs = new URL('../../typescript/packages/', import.meta.url).pathname;
  return [
    { find: '@builtbyfriends/realtime-bwf/plugin', replacement: `${pkgs}bwf/src/plugin.ts` },
    { find: '@builtbyfriends/realtime-bwf/middleware', replacement: `${pkgs}bwf/src/middleware.ts` },
    { find: '@builtbyfriends/realtime-bwf', replacement: `${pkgs}bwf/src/index.ts` },
    { find: '@builtbyfriends/realtime-http/client', replacement: `${pkgs}http/src/client.ts` },
    ...['core', 'http', 'mcp', 'ai', 'analytics'].map((p) => ({ find: p === 'core' ? '@builtbyfriends/realtime' : `@builtbyfriends/realtime-${p}`, replacement: `${pkgs}${p}/src/index.ts` })),
  ];
}
