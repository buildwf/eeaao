import { defineConfig } from 'vite';
import { bwfPlugin } from '@buildwf/bwf';
import { fileURLToPath } from 'node:url';
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  plugins: [bwfPlugin()],
  resolve: { alias: { '@buildwf/realtime': r('./eeao/core/src/index.ts'), '@buildwf/realtime-http': r('./eeao/http/src/index.ts'), '@buildwf/realtime-analytics': r('./eeao/analytics/src/index.ts') } },
});
