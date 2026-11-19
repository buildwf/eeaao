import { sqliteTable, text, integer } from '@builtbyfriends/bwf/schema-d1';

export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  orgId: text('org_id').notNull(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** API tokens for the CLI and agents. Only the SHA-256 of the token is stored. */
export const apiTokens = sqliteTable('api_tokens', {
  hash: text('hash').primaryKey(),
  userId: text('user_id').notNull(),
  orgId: text('org_id').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull(),
});
