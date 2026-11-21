// Decision: this fixture dodges the type gate with `as any` on purpose. The registry checks again
// when the Worker starts, so it still can't ship.
import { z } from 'zod';
import { procedure } from '@builtbyfriends/realtime-bwf';

export const sneaky = (procedure('contacts.sneaky') as any)
  .noAuth({ reason: 'Public because reasons' })
  .output(z.object({ ok: z.boolean() }))
  .handler(() => ({ ok: true }));

export const weak = (procedure('contacts.weak') as any)
  .noAuth({ reason: 'todo' })
  .noAuthz({ reason: 'todo' })
  .noInput()
  .output(z.object({ ok: z.boolean() }))
  .noErrors({ reason: 'todo' })
  .noAnalytics({ reason: 'todo' })
  .noMcp({ reason: 'todo' })
  .noCli({ reason: 'todo' })
  .noAiTool({ reason: 'todo' })
  .handler(() => ({ ok: true }));
