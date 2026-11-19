import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// realtime is the core and knows nothing about bwf. Only `@builtbyfriends/realtime-bwf`, the adapter, may
// import from the framework.
const packages = ['core', 'http', 'mcp', 'ai', 'analytics', 'cli', 'data', 'live'];
const bwfImport = /(?:from|import)\s*\(?\s*['"]@builtbyfriends\/bwf(?:\/[^'"]*)?['"]/;

describe('framework isolation', () => {
  for (const name of packages) {
    it(`${name} does not import bwf`, () => {
      const dir = join(import.meta.dirname, '..', '..', name, 'src');
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
        expect(readFileSync(join(dir, file), 'utf8'), `${name}/src/${file}`).not.toMatch(bwfImport);
      }
    });
  }
});
