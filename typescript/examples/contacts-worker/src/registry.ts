import { defineRegistry } from '@builtbyfriends/realtime';
import { analyticsEngine } from '@builtbyfriends/realtime-analytics';
import { deleteContact, getContact, searchContacts, status } from './procedures.js';

// Decision: built at module scope, so an incomplete procedure throws while the Worker loads and
// `wrangler deploy` fails with error 10021 instead of shipping it.
export const registry = defineRegistry([getContact, searchContacts, deleteContact, status], {
  analytics: analyticsEngine({ binding: 'ANALYTICS' }),
});
