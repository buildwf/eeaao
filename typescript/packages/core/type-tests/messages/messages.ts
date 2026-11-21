// Decision: each line below is a mistake. scripts/type-errors.mjs compiles this file and compares
// the compiler's messages to messages.expected.txt, because these messages are what an AI tool
// reads to fix its own code. Run `bun run test:types -- --update` to accept changes.
import { z } from 'zod';
import { bearerAuth, defineRegistry, procedure } from '@builtbyfriends/realtime';

const token = bearerAuth({ verify: () => ({ id: 'u1' }) });

export const incomplete = procedure('contacts.list')
  .noAuth({ reason: 'Public directory with no user data' })
  .input(z.object({ q: z.string() }))
  .output(z.object({ ids: z.array(z.string()) }))
  .noMcp({ reason: 'Agents use the search tool instead' })
  .handler(async () => ({ ids: [] }));

procedure('a').noAuth({ reason: 'n/a' });

procedure('b').authz({ policy: 'admin', check: () => true });

procedure('c').noAuth({ reason: 'Public directory with no user data' }).auth(token);

procedure('d').noAuth({ reason: 'Public directory with no user data' }).noAuthz({ reason: 'Anyone may read the directory' })
  .noInput().output(z.object({})).errors({ BUSY: { status: 503, message: 'Busy' } })
  .noAnalytics({ reason: 'Not worth tracking at this volume' }).noMcp({ reason: 'Agents use the search tool instead' })
  .noCli({ reason: 'Not useful from a terminal' }).noAiTool({ reason: 'Agents use the search tool instead' })
  .handler(({ fail }) => fail('NOPE'));

procedure('e').mcp({ description: 'Delete everything' });

defineRegistry([procedure('f').noInput()]);
