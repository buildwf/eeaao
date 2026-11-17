import type { InputOf, OutputOf, Registry } from '@eeao/core';

/**
 * What the live client needs of a registry: its procedure map, which is a type and nothing at runtime. A `Registry` has
 * one, and so does a plain `{ '~procedures': ProcedureMap }` (Nosam generates the map from the procedures folder).
 */
export type Typed = { readonly '~procedures'?: unknown };

/**
 * How a client hears about changes. Nosam's `connectLiveStream` is one (see `@eeao/nosam/live`);
 * anything with topics and a reconnect signal works. Delivery may be at most once, so the
 * store never trusts an event's payload: an event only means "this query may be stale".
 */
export interface LiveTransport {
  /** Listen to a topic. Resolves to the function that stops listening. */
  subscribe(topic: string, onEvent: () => void): Promise<() => void> | (() => void);
  /** The connection came back after a drop, so events may have been missed. Returns an unsubscribe. */
  onReconnect(callback: () => void): () => void;
}

export type QueryState<T> =
  | { status: 'loading'; data: undefined; error: undefined; fetching: true }
  | { status: 'ready'; data: T; error: undefined; fetching: boolean }
  /** `data` is the last good value, if there was one. */
  | { status: 'error'; data: T | undefined; error: Error; fetching: boolean };

export type Procs<R> = R extends { readonly '~procedures'?: infer P } ? NonNullable<P> : never;
export type TopicMap<R> = { [N in keyof Procs<R> & string]?: (input: InputOf<Procs<R>[N]>) => string[] };

export type LiveOptions<R> = {
  /** Same shape as `createClient<R>(...)` from `@eeao/http/client`. */
  client: { call: (name: any, input?: any) => Promise<any> };
  /** Without a transport, queries load once and refetch only when asked. */
  transport?: LiveTransport;
  /** Default topics per procedure, derived from its input. A query can override them. */
  topics?: TopicMap<R>;
  /** Events within this window collapse into one refetch. Default 50. */
  debounceMs?: number;
  /** How long a query nobody watches stays cached for the next mount to show. Default 30000. */
  cacheMs?: number;
  /** Also refetch when the tab becomes visible again or the browser goes back online. Default true. */
  refetchOnFocus?: boolean;
};

export type QueryOptions = {
  /** Topics for this query, replacing the defaults from `createLive`. */
  topics?: string[];
  /** False keeps the query idle (no fetch, no subscription), e.g. while an id is not known. */
  enabled?: boolean;
};

export interface QueryHandle<T = unknown> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): QueryState<T>;
  refetch(): Promise<void>;
}

type Entry = {
  key: string;
  name: string;
  input: unknown;
  topics: string[];
  state: QueryState<any>;
  listeners: Set<() => void>;
  stops: Array<() => void>;
  inFlight: boolean;
  dirty: boolean;
  timer: ReturnType<typeof setTimeout> | undefined;
  gc: ReturnType<typeof setTimeout> | undefined;
  generation: number;
};

/** Sorted-key JSON, so `{a,b}` and `{b,a}` share one cache entry. */
export function stableKey(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v,
  );
}

/**
 * The framework-free core. One entry per (procedure, input): components that ask for the same
 * query share one fetch and one set of subscriptions. An entry is live while someone listens.
 */
export function createLive<R extends Typed = Registry<any>>(options: LiveOptions<R>) {
  const entries = new Map<string, Entry>();
  const debounceMs = options.debounceMs ?? 50;
  const cacheMs = options.cacheMs ?? 30_000;
  const topicsFor = options.topics as Record<string, ((input: unknown) => string[]) | undefined> | undefined;

  async function fetchNow(e: Entry): Promise<void> {
    if (e.inFlight) {
      e.dirty = true;
      return;
    }
    e.inFlight = true;
    const generation = e.generation;
    do {
      e.dirty = false;
      if (e.state.status !== 'loading') set(e, { ...e.state, fetching: true } as QueryState<any>);
      try {
        const data = await options.client.call(e.name, e.input);
        if (generation !== e.generation) break;
        set(e, { status: 'ready', data, error: undefined, fetching: e.dirty });
      } catch (err) {
        if (generation !== e.generation) break;
        set(e, { status: 'error', data: e.state.data, error: err instanceof Error ? err : new Error(String(err)), fetching: e.dirty });
      }
    } while (e.dirty && generation === e.generation);
    e.inFlight = false;
  }

  function set(e: Entry, state: QueryState<any>) {
    e.state = state;
    for (const l of [...e.listeners]) l();
  }

  function schedule(e: Entry) {
    clearTimeout(e.timer);
    e.timer = setTimeout(() => void fetchNow(e), debounceMs);
  }

  function start(e: Entry) {
    clearTimeout(e.gc);
    if (e.stops.length) return;
    const alive = { current: true };
    const gen = e.generation;
    void fetchNow(e);
    const transport = options.transport;
    if (transport) {
      for (const topic of e.topics) {
        Promise.resolve(transport.subscribe(topic, () => schedule(e))).then(
          (stop) => (alive.current && gen === e.generation ? e.stops.push(stop) : stop()),
          (err) => console.error(`live: subscribing to "${topic}" failed`, err),
        );
      }
      e.stops.push(transport.onReconnect(() => void fetchNow(e)));
    }
    if (options.refetchOnFocus !== false && typeof document !== 'undefined') {
      const onVisible = () => document.visibilityState === 'visible' && schedule(e);
      document.addEventListener('visibilitychange', onVisible);
      window.addEventListener('online', onVisible);
      e.stops.push(() => {
        document.removeEventListener('visibilitychange', onVisible);
        window.removeEventListener('online', onVisible);
      });
    }
    e.stops.push(() => void (alive.current = false));
  }

  function stop(e: Entry) {
    clearTimeout(e.timer);
    for (const s of e.stops.splice(0)) s();
    e.generation++;
    e.inFlight = false;
    e.gc = setTimeout(() => {
      if (!e.listeners.size) entries.delete(e.key);
    }, cacheMs);
  }

  /** Watch one query. React's `useQuery` is a thin wrapper over this. */
  function query<N extends keyof Procs<R> & string>(
    name: N,
    input: InputOf<Procs<R>[N]>,
    queryOptions: QueryOptions = {},
  ): QueryHandle<OutputOf<Procs<R>[N]>> {
    const topics = queryOptions.topics ?? topicsFor?.[name]?.(input) ?? [];
    const enabled = queryOptions.enabled !== false;
    const key = `${name}:${stableKey(input)}:${stableKey(topics)}`;
    let e = entries.get(key);
    if (!e) {
      e = { key, name, input, topics, state: { status: 'loading', data: undefined, error: undefined, fetching: true }, listeners: new Set(), stops: [], inFlight: false, dirty: false, timer: undefined, gc: undefined, generation: 0 };
      entries.set(key, e);
    }
    const entry = e;
    return {
      getSnapshot: () => entry.state,
      subscribe(listener) {
        entry.listeners.add(listener);
        if (enabled && entry.listeners.size === 1) start(entry);
        return () => {
          entry.listeners.delete(listener);
          if (!entry.listeners.size) stop(entry);
        };
      },
      refetch: () => fetchNow(entry),
    };
  }

  /** Runs a procedure. The server publishes the topics the change touched, so live queries refresh themselves. */
  function mutate<N extends keyof Procs<R> & string>(name: N, input: InputOf<Procs<R>[N]>): Promise<OutputOf<Procs<R>[N]>> {
    return options.client.call(name, input);
  }

  /** Refetch every query that is currently being watched. */
  function refetchAll(): Promise<void[]> {
    return Promise.all([...entries.values()].filter((e) => e.listeners.size).map((e) => fetchNow(e)));
  }

  return { query, mutate, refetchAll };
}

export type Live<R extends Typed = Registry<any>> = ReturnType<typeof createLive<R>>;
