// Decision: a plain bwf route on purpose. It works, but it skips the nine decisions.
import { defineHandler } from '@builtbyfriends/bwf';
import { db } from '@builtbyfriends/bwf/db';
import { contacts } from '@schema';

export const GET = defineHandler(() => db.select().from(contacts));
