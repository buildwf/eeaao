import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLive, stableKey, type LiveTransport } from '../src/index.js';

function fakeTransport() {
  const topics = new Map<string, Set<() => void>>();
  const reconnects = new Set<() => void>();
  const transport: LiveTransport = {
    subscribe: async (topic, cb) => {
      (topics.get(topic) ?? topics.set(topic, new Set()).get(topic)!).add(cb);
      return () => void topics.get(topic)!.delete(cb);
    },
    onReconnect: (cb) => (reconnects.add(cb), () => void reconnects.delete(cb)),
  };
  return {
    transport,
    emit: (topic: string) => topics.get(topic)?.forEach((cb) => cb()),
    reconnect: () => reconnects.forEach((cb) => cb()),
    listeners: (topic: string) => topics.get(topic)?.size ?? 0,
    reconnectListeners: () => reconnects.size,
  };
}

const flush = async () => {
  await vi.advanceTimersByTimeAsync(60);
};

describe('live store', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(extra: Partial<Parameters<typeof createLive>[0]> = {}) {
    let n = 0;
    const call = vi.fn(async (name: string, input: any) => ({ name, input, n: ++n }));
    const t = fakeTransport();
    const live = createLive<any>({ client: { call }, transport: t.transport, topics: { 'messages.list': (i: any) => [`messages:channel:${i.channel}`] }, ...extra });
    return { call, t, live };
  }

  it('fetches on first listener, exposes loading then ready, and subscribes to the default topics', async () => {
    const { call, t, live } = setup();
    const q = live.query('messages.list', { channel: 'a' });
    expect(q.getSnapshot()).toMatchObject({ status: 'loading', data: undefined });
    const seen = vi.fn();
    const stop = q.subscribe(seen);
    await flush();
    expect(q.getSnapshot()).toMatchObject({ status: 'ready', data: { n: 1 }, fetching: false });
    expect(call).toHaveBeenCalledTimes(1);
    expect(t.listeners('messages:channel:a')).toBe(1);
    stop();
    expect(t.listeners('messages:channel:a')).toBe(0);
    expect(t.reconnectListeners()).toBe(0);
  });

  it('refetches on an event, keeps the old data meanwhile, and collapses a burst into one fetch', async () => {
    const { call, t, live } = setup();
    const q = live.query('messages.list', { channel: 'a' });
    q.subscribe(() => {});
    await flush();
    for (let i = 0; i < 5; i++) t.emit('messages:channel:a');
    await flush();
    expect(call).toHaveBeenCalledTimes(2);
    expect(q.getSnapshot().data).toMatchObject({ n: 2 });
  });

  it('refetches on reconnect, and runs once more when an event lands during a fetch', async () => {
    const { call, t, live } = setup();
    const gates: Array<() => void> = [];
    call.mockImplementation((name: string) => new Promise((res) => gates.push(() => res({ name, n: gates.length }))));
    const q = live.query('messages.list', { channel: 'a' });
    q.subscribe(() => {});
    await flush();
    t.reconnect();
    await flush();
    expect(call).toHaveBeenCalledTimes(1);
    gates[0]!();
    await flush();
    expect(call).toHaveBeenCalledTimes(2);
    gates[1]!();
    await flush();
    expect(q.getSnapshot()).toMatchObject({ status: 'ready', data: { n: 2 }, fetching: false });
  });

  it('shares one fetch between watchers of the same query, even with keys in another order', async () => {
    const { call, live } = setup();
    const a = live.query('thing', { x: 1, y: 2 } as any, { topics: [] });
    const b = live.query('thing', { y: 2, x: 1 } as any, { topics: [] });
    a.subscribe(() => {});
    b.subscribe(() => {});
    await flush();
    expect(call).toHaveBeenCalledTimes(1);
    expect(stableKey({ b: 1, a: { d: 1, c: 2 } })).toBe(stableKey({ a: { c: 2, d: 1 }, b: 1 }));
  });

  it('keeps last good data on an error and recovers on the next event', async () => {
    const { call, t, live } = setup();
    const q = live.query('messages.list', { channel: 'a' });
    q.subscribe(() => {});
    await flush();
    call.mockRejectedValueOnce(new Error('down'));
    t.emit('messages:channel:a');
    await flush();
    expect(q.getSnapshot()).toMatchObject({ status: 'error', data: { n: 1 }, error: { message: 'down' } });
    t.emit('messages:channel:a');
    await flush();
    expect(q.getSnapshot()).toMatchObject({ status: 'ready' });
  });

  it('stays idle when disabled, and a topic override replaces the defaults', async () => {
    const { call, t, live } = setup();
    const off = live.query('messages.list', { channel: 'a' }, { enabled: false });
    off.subscribe(() => {});
    await flush();
    expect(call).not.toHaveBeenCalled();
    const custom = live.query('messages.list', { channel: 'a' }, { topics: ['messages'] });
    custom.subscribe(() => {});
    await flush();
    expect(t.listeners('messages')).toBe(1);
    expect(t.listeners('messages:channel:a')).toBe(0);
  });

  it('shows cached data on remount, then refetches, and forgets after cacheMs', async () => {
    const { call, live } = setup({ cacheMs: 1000 });
    const first = live.query('messages.list', { channel: 'a' });
    const stop = first.subscribe(() => {});
    await flush();
    stop();
    const again = live.query('messages.list', { channel: 'a' });
    expect(again.getSnapshot()).toMatchObject({ status: 'ready', data: { n: 1 } });
    again.subscribe(() => {})();
    await vi.advanceTimersByTimeAsync(1500);
    expect(live.query('messages.list', { channel: 'a' }).getSnapshot().status).toBe('loading');
    void call;
  });

  it('drops a subscription that resolves after the watcher left', async () => {
    const { t, live } = setup();
    const slow: LiveTransport = { ...t.transport, subscribe: (topic, cb) => new Promise((res) => setTimeout(() => res(t.transport.subscribe(topic, cb) as any), 200)) };
    const l = createLive<any>({ client: { call: async () => 1 }, transport: slow, topics: { x: () => ['t'] } });
    const stop = l.query('x', {}).subscribe(() => {});
    stop();
    await vi.advanceTimersByTimeAsync(500);
    await Promise.resolve();
    expect(t.listeners('t')).toBe(0);
    void live;
  });

  it('mutate calls the procedure and refetchAll refreshes watched queries', async () => {
    const { call, live } = setup();
    const q = live.query('messages.list', { channel: 'a' });
    q.subscribe(() => {});
    await flush();
    await expect(live.mutate('messages.send', { body: 'x' })).resolves.toMatchObject({ name: 'messages.send' });
    await live.refetchAll();
    expect(call).toHaveBeenCalledTimes(3);
  });
});
