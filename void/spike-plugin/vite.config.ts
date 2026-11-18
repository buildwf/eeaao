import { defineConfig } from 'vite';
import { voidPlugin } from 'void';
import { eeao } from './eeao-plugin';
import { fileURLToPath } from 'node:url';
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export default defineConfig({
  plugins: [voidPlugin(), eeao()],
  resolve: { alias: { '@eeao/core': r('./eeao/core/src/index.ts'), '@eeao/http': r('./eeao/http/src/index.ts'), '@eeao/analytics': r('./eeao/analytics/src/index.ts') } },
});
