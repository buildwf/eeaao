import { defineHandler } from '@builtbyfriends/bwf';
import { rpc } from '../../realtime-app';
const mount = defineHandler((c) => rpc(c.req.raw, c.env, c.executionCtx));
export const GET = mount;
export const POST = mount;
