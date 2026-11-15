import { expect, it } from 'vitest';
import { registry } from '../src/registry.js';

// Every decision for every procedure, as a Markdown table checked into the repo.
// A change that flips contacts.get to noAuth shows up in the PR diff of audit.md.
it('matches the checked-in audit', async () => {
  await expect(registry.auditTable()).toMatchFileSnapshot('./audit.md');
});
