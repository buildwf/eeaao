import { DurableObject } from 'cloudflare:workers';
import { defineData, defineSchema, table } from '@builtbyfriends/realtime-data';

export type Message = { channel: string; author: string; body: string; at: number };

export const data = defineData({
  schema: defineSchema({
    messages: table<Message>({
      indexes: { by_channel: ['channel', 'at'] },
      search: { body: { field: 'body', filters: ['channel'] } },
      topics: (m) => [`messages:channel:${m.channel}`],
    }),
  }),
  functions: ({ query, mutation }) => ({
    send: mutation((ctx, a: { channel: string; author: string; body: string }) => ctx.db.insert('messages', { ...a, at: ctx.now })),
    // Two writes and a scheduled job: all commit together or not at all.
    sendWithReminder: mutation((ctx, a: { channel: string; author: string; body: string; remindInMs: number }) => {
      const id = ctx.db.insert('messages', { channel: a.channel, author: a.author, body: a.body, at: ctx.now });
      const job = ctx.scheduler.runAfter(a.remindInMs, 'remind', { channel: a.channel, about: id });
      return { id, job };
    }),
    cancel: mutation((ctx, a: { job: string }) => ctx.scheduler.cancel(a.job)),
    list: query((ctx, a: { channel: string; limit: number }) =>
      ctx.db.query('messages').withIndex('by_channel', (q) => q.eq('channel', a.channel)).order('desc').take(a.limit),
    ),
    search: query((ctx, a: { text: string; channel: string }) => ctx.db.search('messages', 'body', a.text, { eq: { channel: a.channel } })),
  }),
  jobs: (job) => ({
    remind: job(async (ctx, a: { channel: string; about: string }) => {
      await ctx.data.mutate.send({ channel: a.channel, author: 'reminder', body: `Reminder about ${a.about}` });
    }),
  }),
});

export class Deployment extends data.durableObject(DurableObject) {}
