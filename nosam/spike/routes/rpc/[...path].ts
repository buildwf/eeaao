import { defineHandler } from 'nosam';
import { rpc } from '../../eeao-app';
const mount = defineHandler((c) => rpc(c.req.raw, c.env, c.executionCtx));
export const GET = mount;
export const POST = mount;
