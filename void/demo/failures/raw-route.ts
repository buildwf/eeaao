// A plain Void route: it works, but it skips every one of the nine decisions.
import { defineHandler } from 'void';
import { db } from 'void/db';
import { contacts } from '@schema';

export const GET = defineHandler(() => db.select().from(contacts));
