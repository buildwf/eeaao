import { defineMiddleware } from '@builtbyfriends/bwf';
import { registry } from '../realtime-app';
// Decision: import the registry so it's evaluated when the Worker starts.
void registry;
export default defineMiddleware(async (_c, next) => { await next(); });
