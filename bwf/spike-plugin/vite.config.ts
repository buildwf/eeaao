import { defineConfig } from 'vite';
import { bwfPlugin } from '@builtbyfriends/bwf';
import { realtime } from './realtime-plugin';
import { fileURLToPath } from 'node:url';
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  plugins: [bwfPlugin(), realtime()],
  resolve: { alias: { '@builtbyfriends/realtime': r('./realtime/core/src/index.ts'), '@builtbyfriends/realtime-http': r('./realtime/http/src/index.ts'), '@builtbyfriends/realtime-analytics': r('./realtime/analytics/src/index.ts') } },
});
