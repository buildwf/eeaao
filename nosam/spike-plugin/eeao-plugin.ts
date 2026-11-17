import type { Plugin } from 'vite';
import { globSync } from 'node:fs';
import { join, relative } from 'node:path';

const REGISTRY = 'virtual:eeao-registry';
const RESOLVED = '\0' + REGISTRY;

/** Zero-config eeao for Nosam: discovers procedures/, builds the registry, mounts /rpc and /mcp. */
export function eeao(opts: { dir?: string; analytics?: string } = {}): Plugin {
  const root = process.cwd();
  const dir = opts.dir ?? 'procedures';
  return {
    name: 'eeao:void',
    enforce: 'post',
    resolveId(id) { if (id === REGISTRY) return RESOLVED; },
    load(id) {
      if (id !== RESOLVED) return;
      const files = globSync(`${dir}/**/*.{ts,tsx,js}`, { cwd: root }).filter((f) => !/\.(test|spec)\./.test(f)).sort();
      const imports = files.map((f, i) => `import * as m${i} from ${JSON.stringify(join(root, f))};`);
      return [
        `import { defineRegistry } from '@eeao/core';`,
        `import { analyticsEngine } from '@eeao/analytics';`,
        `import { rpcHandler } from '@eeao/http';`,
        ...imports,
        `const found = [${files.map((_, i) => `...Object.values(m${i})`).join(', ')}].filter((v) => v && (v['~eeao'] === 'procedure' || v['~eeao'] === 'builder'));`,
        `export const registry = defineRegistry(found, { analytics: analyticsEngine({ binding: ${JSON.stringify(opts.analytics ?? 'ANALYTICS')} }) });`,
        `const rpc = rpcHandler(registry);`,
        `export const eeaoMiddleware = async (c, next) => rpc.matches(c.req.raw) ? rpc(c.req.raw, c.env, c.executionCtx) : next();`,
      ].join('\n');
    },
  };
}
