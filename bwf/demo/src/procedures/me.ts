import { z } from 'zod';
import { procedure } from '@eeao/bwf';
import { signedIn } from './_shared';

/** No input, no authz needed: the caller only ever sees themselves. */
export const me = procedure('me')
  .use(signedIn)
  .noAuthz({ reason: 'Callers only ever see their own identity' })
  .noInput()
  .output(z.object({ id: z.string(), orgId: z.string(), role: z.enum(['admin', 'member']) }))
  .noErrors({ reason: 'The only failure is a missing token, which is a 401' })
  .noAnalytics({ reason: 'Clients call this on every start; it says nothing about usage' })
  .mcp({ description: 'Who am I: the user and organization of the current token', effect: 'read', idempotent: true })
  .cli({ command: 'whoami', description: 'Print the user and organization for EEAO_TOKEN' })
  .aiTool({ description: 'Get the current user id, organization id and role', needsApproval: false })
  .handler(({ ctx }) => ctx);
