import { expect, it } from 'vitest';
import { registry } from '../src/registry.js';

// Decision: the audit is a Markdown table checked into the repo, so a change like contacts.get
// switching to noAuth shows up in the PR diff of audit.md.
it('matches the checked-in audit', async () => {
  await expect(registry.auditTable()).toMatchFileSnapshot('./audit.md');
});
