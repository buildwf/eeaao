import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// eeao is the core and knows nothing about Nosam. Only `@eeao/nosam`, the adapter, may
// import from the framework.
const packages = ['core', 'http', 'mcp', 'ai', 'analytics', 'cli', 'data', 'live'];
const nosamImport = /(?:from|import)\s*\(?\s*['"]nosam(?:\/[^'"]*)?['"]/;

describe('framework isolation', () => {
  for (const name of packages) {
    it(`@eeao/${name} does not import void`, () => {
      const dir = join(import.meta.dirname, '..', '..', name, 'src');
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
        expect(readFileSync(join(dir, file), 'utf8'), `${name}/src/${file}`).not.toMatch(nosamImport);
      }
    });
  }
});
