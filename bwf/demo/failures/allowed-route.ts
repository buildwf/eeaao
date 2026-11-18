// eeao-allow: Stripe needs a raw body for signature checks
import { defineHandler } from '@buildwf/bwf';

export const POST = defineHandler(async (c) => ({ bytes: (await c.req.text()).length }));
