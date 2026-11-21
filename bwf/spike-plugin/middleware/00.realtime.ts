import { defineMiddleware } from '@builtbyfriends/bwf';
import { realtimeMiddleware } from 'virtual:realtime-registry';
export default defineMiddleware(realtimeMiddleware);
