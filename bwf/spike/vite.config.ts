import { defineConfig } from 'vite';
import { bwfPlugin } from '@builtbyfriends/bwf';
import { fileURLToPath } from 'node:url';
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  plugins: [bwfPlugin()],
  resolve: { alias: { '@builtbyfriends/realtime': r('./eeao/core/src/index.ts'), '@builtbyfriends/realtime-http': r('./eeao/http/src/index.ts'), '@builtbyfriends/realtime-analytics': r('./eeao/analytics/src/index.ts') } },
});
