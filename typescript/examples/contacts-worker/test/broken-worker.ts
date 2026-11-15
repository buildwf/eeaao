// A Worker whose procedure skipped decisions behind `as any`. The type checker is
// bypassed, so only the registry's load-time check can stop it.
import { z } from 'zod';
import { defineRegistry, procedure } from '@eeao/core';

const sneaky = (procedure('sneaky').noAuth({ reason: 'Public data with no user context' }) as any)
  .output(z.object({}))
  .handler(() => ({}));

export const registry = defineRegistry([sneaky]);
export default { fetch: () => new Response('should never serve') };
