import { z } from 'zod';
import { procedure } from '@eeao/nosam';
import { db, sql } from 'nosam/db';

/** Opting out of everything that can be opted out of. Each opt-out still needs a reason. */
export const status = procedure('status')
  .noAuth({ reason: 'Uptime checks run without credentials' })
  .noAuthz({ reason: 'Anyone may see whether the service is up' })
  .noInput()
  .output(z.object({ ok: z.boolean(), contacts: z.number() }))
  .noErrors({ reason: 'Status always answers; failures surface as 500s' })
  .noAnalytics({ reason: 'Health checks every few seconds would drown real events' })
  .noMcp({ reason: 'Agents have no use for an uptime probe' })
  .cli({ command: 'status', description: 'Check that the API is up' })
  .noAiTool({ reason: 'Agents have no use for an uptime probe' })
  .handler(async () => {
    const row = await db.get<{ n: number }>(sql`select count(*) as n from contacts`);
    return { ok: true, contacts: Number(row?.n ?? 0) };
  });
