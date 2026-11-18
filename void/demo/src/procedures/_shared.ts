// Files starting with _ are not scanned for procedures: shared auth, profiles and schemas.
import { z } from 'zod';
import { apiTokens, profile } from '@eeao/void';
import { db, eq } from 'void/db';
import { apiTokens as tokensTable } from '@schema';

export type User = { id: string; orgId: string; role: 'admin' | 'member' };

/** Bearer tokens from the api_tokens table (hashed). The CLI and MCP clients use these. */
export const token = apiTokens<User>(async (hash) => {
  const row = await db.select().from(tokensTable).where(eq(tokensTable.hash, hash)).get();
  return row ? { id: row.userId, orgId: row.orgId, role: row.role } : null;
});

/** Signed in. Applying a profile is still an explicit choice and shows in the audit. */
export const signedIn = profile('signed-in').auth(token);

/** Signed in as an admin, and never on the CLI. Fills three decisions at once. */
export const adminOnly = profile('admin-only')
  .auth(token)
  .authz({ policy: 'admin', check: (user) => user.role === 'admin' })
  .noCli({ reason: 'Admin actions ship through the dashboard only' });

export const Contact = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  email: z.email(),
});
