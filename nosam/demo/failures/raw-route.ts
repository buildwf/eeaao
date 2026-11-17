// A plain Nosam route: it works, but it skips every one of the nine decisions.
import { defineHandler } from 'nosam';
import { db } from 'nosam/db';
import { contacts } from '@schema';

export const GET = defineHandler(() => db.select().from(contacts));
