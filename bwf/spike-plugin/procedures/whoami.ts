import { z } from 'zod';
import { bearerAuth, createProcedures } from '@buildwf/realtime';
type User = { id: string; orgId: string };
type Env = { API_TOKENS: string };
const { procedure } = createProcedures<Env>();
const token = bearerAuth<User, Env>({ verify: (t, env) => (JSON.parse(env.API_TOKENS) as Record<string, User>)[t] ?? null, actorId: (u) => u.id });
export const whoami = procedure('whoami')
  .auth(token)
  .noAuthz({ reason: 'Anyone signed in may see themselves' })
  .noInput()
  .output(z.object({ id: z.string(), orgId: z.string() }))
  .noErrors({ reason: 'Only auth can fail and that is a 401' })
  .analytics({ event: 'whoami.called' })
  .noMcp({ reason: 'Spike only tests the HTTP path' })
  .cli({ command: 'whoami', description: 'Print the caller' })
  .noAiTool({ reason: 'Spike only tests the HTTP path' })
  .handler(({ ctx }) => ({ id: ctx.id, orgId: ctx.orgId }));
