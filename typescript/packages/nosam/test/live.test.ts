import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineData, defineSchema, table } from '@eeao/data';
import { createLive } from '@eeao/live';
import { publishTopics, topicPolicy } from '../src/data.js';
import { nosamTransport, type ConnectLiveStream } from '../src/live.js';
import { memoryStorage } from '../../data/test/storage.js';

/** A stand-in for Nosam's live stream: topic pub/sub, plus EventSource opens it can trigger. */
function fakeNosam() {
  const subs = new Map<string, Map<string, (event: any) => void>>();
  let sources: any[] = [];
  const connect: ConnectLiveStream = (_url, options) => {
    const open = () => {
      const source = new options!.eventSource!('/live?connectionId=x', { withCredentials: true });
      sources.push(source);
      queueMicrotask(() => source.dispatch('open'));
    };
    open();
    return {
      subscribe: async ({ id, topic, onEvent }) => {
        (subs.get(topic) ?? subs.set(topic, new Map()).get(topic)!).set(id, onEvent!);
        return async () => void subs.get(topic)!.delete(id);
      },
      close: () => {},
      ...{ reconnect: open },
    } as any;
  };
  return {
    connect,
    publish: (topic: string) => subs.get(topic)?.forEach((cb) => cb({ topic, type: 'changed', data: null })),
    count: (topic: string) => subs.get(topic)?.size ?? 0,
    sources: () => sources,
  };
}

class FakeEventSource {
  handlers = new Map<string, Array<() => void>>();
  constructor(readonly url: string, readonly init?: unknown) {}
  addEventListener(type: string, cb: () => void) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), cb]);
  }
  dispatch(type: string) {
    this.handlers.get(type)?.forEach((cb) => cb());
  }
}

beforeEach(() => void ((globalThis as any).EventSource = FakeEventSource));
afterEach(() => void delete (globalThis as any).EventSource);

describe('nosamTransport', () => {
  it('opens one kept-open stream, routes events by topic, and unsubscribes', async () => {
    const v = fakeNosam();
    const connect = vi.fn(v.connect);
    const t = nosamTransport({ connect });
    const a = vi.fn();
    const b = vi.fn();
    const stopA = await t.subscribe('x', a);
    await t.subscribe('y', b);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect.mock.calls[0]![1]).toMatchObject({ keepOpen: true, withCredentials: true });
    v.publish('x');
    expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 0]);
    stopA();
    await Promise.resolve();
    expect(v.count('x')).toBe(0);
  });

  it('reports a reconnect only for opens after the first', async () => {
    const v = fakeNosam();
    const t = nosamTransport({ connect: v.connect });
    const reconnected = vi.fn();
    t.onReconnect(reconnected);
    await t.subscribe('x', () => {});
    await Promise.resolve();
    expect(reconnected).not.toHaveBeenCalled();
    v.sources()[0].dispatch('open'); // the stream dropped and Nosam's client opened it again
    expect(reconnected).toHaveBeenCalledTimes(1);
  });
});

describe('topicPolicy', () => {
  const policy = topicPolicy([
    { pattern: /^messages:channel:(.+)$/, allow: ([, channel], ctx) => ctx.user === `member-of-${channel}` },
    { pattern: /^public$/, allow: () => true },
  ]);
  const ctx = (topic: string, user: unknown = null) => ({ topic, user, owner: null, env: {}, request: new Request('http://x') });

  it('allows a matching rule that agrees, refuses everything else', async () => {
    expect(await policy(ctx('public'))).toBeUndefined();
    expect(await policy(ctx('messages:channel:a', 'member-of-a'))).toBeUndefined();
    expect((await policy(ctx('messages:channel:a', 'member-of-b')))?.status).toBe(403);
    expect((await policy(ctx('secrets')))?.status).toBe(403);
    expect((await policy(ctx('xmessages:channel:a', 'member-of-a')))?.status).toBe(403);
  });
});

describe('data layer to live query, end to end', () => {
  it('a mutation commits, its topics publish, and a watching query refetches the new rows', async () => {
    const v = fakeNosam();
    const published: string[] = [];
    const live = {
      withEnv: () => ({
        publish: async (topic: string) => {
          published.push(topic);
          v.publish(topic);
        },
      }),
    };
    const data = defineData({
      schema: defineSchema({ messages: table<{ channel: string; body: string }>({ indexes: { by_channel: ['channel'] }, topics: (m) => [`messages:channel:${m.channel}`] }) }),
      functions: ({ query, mutation }) => ({
        send: mutation((ctx, a: { channel: string; body: string }) => ctx.db.insert('messages', a)),
        list: query((ctx, a: { channel: string }) => ctx.db.query('messages').withIndex('by_channel', (q) => q.eq('channel', a.channel)).collect().map((m) => m.body)),
      }),
      onCommit: publishTopics(live),
    });
    const engine = data.engine(memoryStorage());
    engine.init();
    const client = {
      call: (name: string, input: any) => engine.run(name === 'messages.send' ? 'mutation' : 'query', name === 'messages.send' ? 'send' : 'list', input),
    };

    vi.useFakeTimers();
    const store = createLive<any>({ client, transport: nosamTransport({ connect: v.connect }), topics: { 'messages.list': (i: any) => [`messages:channel:${i.channel}`] }, debounceMs: 10 });
    const q = store.query('messages.list', { channel: 'general' });
    q.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(50);
    expect(q.getSnapshot().data).toEqual([]);

    await store.mutate('messages.send', { channel: 'general', body: 'hello' });
    await store.mutate('messages.send', { channel: 'random', body: 'elsewhere' });
    await vi.advanceTimersByTimeAsync(50);
    vi.useRealTimers();

    expect(q.getSnapshot().data).toEqual(['hello']);
    expect(published).toContain('messages:channel:general');
  });
});
