import { defineMiddleware } from 'nosam';
import { registry } from '../eeao-app';
// Importing the registry here is meant to evaluate it when the Worker starts.
void registry;
export default defineMiddleware(async (_c, next) => { await next(); });
