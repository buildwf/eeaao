// Each export below is a mistake an agent might make. `tsc` rejects every one.
import { z } from 'zod';
import { procedure } from '@builtbyfriends/realtime-bwf';
import { signedIn } from './_shared';

// 1. Forgot several decisions. The handler won't accept a function and says what's missing.
export const forgot = procedure('contacts.count')
  .use(signedIn)
  .input(z.object({ orgId: z.string() }))
  .output(z.object({ count: z.number() }))
  .mcp({ description: 'Count contacts', effect: 'read' })
  .handler(async () => ({ count: 0 }));

// 2. A lazy opt-out reason.
export const lazy = procedure('lazy')
  .noAuth({ reason: 'n/a' });

// 3. fail() with an error code that was never declared.
export const undeclared = procedure('contacts.archive')
  .use(signedIn)
  .noAuthz({ reason: 'Archiving only touches the caller\'s own org' })
  .input(z.object({ id: z.string() }))
  .output(z.object({ ok: z.boolean() }))
  .errors({ NOT_FOUND: { status: 404, message: 'No such contact' } })
  .noAnalytics({ reason: 'Covered by the audit log instead' })
  .noMcp({ reason: 'Dashboard-only action for now' })
  .noCli({ reason: 'Dashboard-only action for now' })
  .noAiTool({ reason: 'Dashboard-only action for now' })
  .handler(({ fail }) => fail('ALREADY_ARCHIVED'));

// 4. authz before deciding who the caller is.
export const authzFirst = procedure('authz.first')
  .authz({ policy: 'admin', check: (user: any) => user.role === 'admin' });

// 5. Deciding the same concern twice (the method is gone once decided).
export const twice = procedure('twice')
  .input(z.object({ a: z.string() }))
  .input(z.object({ b: z.string() }));

// 6. MCP exposure without saying whether it reads, writes or destroys.
export const noEffect = procedure('no.effect')
  .mcp({ description: 'Does something' });

// 7. An AI tool without saying whether a person must approve it.
export const noApproval = procedure('no.approval')
  .aiTool({ description: 'Does something' });

// 8. Returning something that doesn't match the output schema.
export const wrongOutput = procedure('wrong.output')
  .noAuth({ reason: 'Public read of static data' })
  .noAuthz({ reason: 'Public read of static data' })
  .noInput()
  .output(z.object({ count: z.number() }))
  .noErrors({ reason: 'Static data cannot fail' })
  .noAnalytics({ reason: 'Static data is not worth tracking' })
  .noMcp({ reason: 'Not useful to agents at all' })
  .noCli({ reason: 'Not useful from a terminal' })
  .noAiTool({ reason: 'Not useful to agents at all' })
  .handler(() => ({ count: 'three' }));
