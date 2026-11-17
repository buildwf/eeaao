import { z } from 'zod';
import { procedure } from '@eeao/nosam';

/**
 * A webhook: no user, so no auth, but it is still a procedure with a validated input,
 * output and analytics. HTTP only. (A real one would check the provider's signature.)
 */
export const paymentReceived = procedure('billing.paymentReceived')
  .noAuth({ reason: 'Called by the payment provider, which has no user token' })
  .noAuthz({ reason: 'No user; the payload is checked against the provider instead' })
  .input(z.object({ orgId: z.string(), amountCents: z.number().int().positive(), currency: z.enum(['usd', 'eur']) }))
  .output(z.object({ received: z.literal(true) }))
  .errors({ UNKNOWN_ORG: { status: 422, message: 'No such organization' } })
  .analytics({ event: 'payment.received', props: (input) => ({ orgId: input.orgId, amountCents: input.amountCents, currency: input.currency }) })
  .noMcp({ reason: 'Only the payment provider calls this endpoint' })
  .noCli({ reason: 'Only the payment provider calls this endpoint' })
  .noAiTool({ reason: 'Only the payment provider calls this endpoint' })
  .handler(({ input, fail }) => (input.orgId.startsWith('o') ? { received: true as const } : fail('UNKNOWN_ORG')));
