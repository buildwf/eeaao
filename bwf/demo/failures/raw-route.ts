// A plain bwf route: it works, but it skips every one of the nine decisions.
import { defineHandler } from '@builtbyfriends/bwf';
import { db } from '@builtbyfriends/bwf/db';
import { contacts } from '@schema';

export const GET = defineHandler(() => db.select().from(contacts));
