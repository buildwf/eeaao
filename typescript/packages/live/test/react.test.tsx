// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLive, type LiveTransport } from '../src/index.js';
import { createLiveHooks } from '../src/react.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(cleanup);

describe('react hooks', () => {
  it('renders loading, then data, then new data after an event, and unsubscribes on unmount', async () => {
    const handlers = new Set<() => void>();
    const transport: LiveTransport = {
      subscribe: (_t, cb) => (handlers.add(cb), () => void handlers.delete(cb)),
      onReconnect: () => () => {},
    };
    let n = 0;
    const call = vi.fn(async () => ({ count: ++n }));
    const live = createLive<any>({ client: { call }, transport, topics: { 'count.get': () => ['count'] }, debounceMs: 0 });
    const { useQuery } = createLiveHooks<any>(live);

    function Count() {
      const q = useQuery('count.get', {});
      return createElement('p', null, q.loading ? 'loading' : `count ${(q.data as any).count}`);
    }

    const view = render(createElement(Count));
    expect(screen.getByText('loading')).toBeTruthy();
    await act(async () => void (await new Promise((r) => setTimeout(r, 10))));
    expect(screen.getByText('count 1')).toBeTruthy();
    expect(handlers.size).toBe(1);

    await act(async () => {
      handlers.forEach((h) => h());
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(screen.getByText('count 2')).toBeTruthy();

    view.unmount();
    expect(handlers.size).toBe(0);
  });

  it('useMutation tracks pending and error', async () => {
    const call = vi.fn(async (name: string) => {
      if (name === 'bad') throw new Error('nope');
      return 'ok';
    });
    const live = createLive<any>({ client: { call } });
    const { useMutation } = createLiveHooks<any>(live);
    let api!: ReturnType<typeof useMutation>;
    function C() {
      api = useMutation('bad');
      return createElement('p', null, api.error?.message ?? 'fine');
    }
    render(createElement(C));
    await act(async () => void (await api.mutate({}).catch(() => {})));
    expect(screen.getByText('nope')).toBeTruthy();
    expect(api.pending).toBe(false);
  });
});
