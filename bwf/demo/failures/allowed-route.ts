// eeao-allow: Stripe needs a raw body for signature checks
import { defineHandler } from '@builtbyfriends/bwf';

export const POST = defineHandler(async (c) => ({ bytes: (await c.req.text()).length }));
