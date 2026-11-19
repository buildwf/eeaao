import { defineRegistry } from '@buildwf/realtime';
import { analyticsEngine } from '@buildwf/realtime-analytics';
import { deleteContact, getContact, searchContacts, status } from './procedures.js';

// Built at module scope on purpose: if a procedure is incomplete this throws while the
// Worker loads, and `wrangler deploy` fails with error 10021 instead of shipping it.
export const registry = defineRegistry([getContact, searchContacts, deleteContact, status], {
  analytics: analyticsEngine({ binding: 'ANALYTICS' }),
});
