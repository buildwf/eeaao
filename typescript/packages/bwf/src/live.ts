import type { LiveTransport } from '@builtbyfriends/realtime-live';

/** The part of bwf's `@builtbyfriends/bwf/live/client` this adapter uses. Pass `connectLiveStream` itself. */
export type ConnectLiveStream = (
  url: string | URL,
  options?: {
    withCredentials?: boolean;
    keepOpen?: boolean;
    retryDelay?: number;
    eventSource?: new (url: string, init?: { withCredentials?: boolean }) => any;
    onError?: (error: any) => void;
  },
) => {
  subscribe(options: { id: string; topic: string; onEvent?: (event: any) => void }): Promise<() => Promise<void>>;
  close(): void;
};

export type BwfTransportOptions = {
  /** `connectLiveStream` from `@builtbyfriends/bwf/live/client`. */
  connect: ConnectLiveStream;
  /** The route that exports `live.connect` and `live.control`. Default "/live". */
  url?: string;
  /** Default true, so the session cookie rides along. */
  withCredentials?: boolean;
  retryDelay?: number;
  onError?: (error: unknown) => void;
};

/**
 * A `LiveTransport` over bwf's SSE live stream. One connection serves every query.
 *
 * bwf delivers at most once and replays nothing, so a reconnect is how this learns it may
 * have missed events: the stream is kept open (`keepOpen`), and every `open` after the first
 * is reported to the store, which refetches the queries being watched.
 */
export function bwfTransport(options: BwfTransportOptions): LiveTransport {
  const reconnects = new Set<() => void>();
  let stream: ReturnType<ConnectLiveStream> | undefined;
  let opens = 0;

  function open() {
    if (stream) return stream;
    const Native = (globalThis as any).EventSource as new (url: string, init?: { withCredentials?: boolean }) => any;
    if (!Native) throw new Error('EventSource is not available here; live queries need a browser (or a polyfill)');
    // bwf opens a fresh EventSource for each reconnect, so count `open` events across all of them.
    class Watching extends Native {
      constructor(url: string, init?: { withCredentials?: boolean }) {
        super(url, init);
        this.addEventListener('open', () => {
          if (++opens > 1) for (const cb of [...reconnects]) cb();
        });
      }
    }
    stream = options.connect(options.url ?? '/live', {
      withCredentials: options.withCredentials ?? true,
      keepOpen: true,
      retryDelay: options.retryDelay,
      eventSource: Watching,
      onError: options.onError,
    });
    return stream;
  }

  /**
   * One bwf subscription per topic, shared by every query listening to it. bwf allows a limited
   * number of subscriptions per topic and per connection (256 by default), and a page often has
   * many queries on the same topic, so one subscription each would run out.
   */
  const topics = new Map<string, { listeners: Set<() => void>; stop: Promise<() => Promise<void>> }>();

  function release(topic: string, entry: { listeners: Set<() => void>; stop: Promise<() => Promise<void>> }) {
    if (entry.listeners.size || topics.get(topic) !== entry) return;
    topics.delete(topic);
    void entry.stop.then((stop) => stop()).catch(() => {});
  }

  return {
    async subscribe(topic, onEvent) {
      let entry = topics.get(topic);
      if (!entry) {
        const listeners = new Set<() => void>();
        const stop = open().subscribe({
          id: topic,
          topic,
          onEvent: () => {
            for (const listener of [...listeners]) listener();
          },
        });
        entry = { listeners, stop };
        topics.set(topic, entry);
        // A refused subscription is forgotten, so the next query on the topic asks again.
        const failed = entry;
        stop.catch(() => {
          if (topics.get(topic) === failed) topics.delete(topic);
        });
      }
      const listener = () => onEvent();
      entry.listeners.add(listener);
      try {
        await entry.stop;
      } catch (err) {
        entry.listeners.delete(listener);
        throw err;
      }
      const current = entry;
      return () => {
        current.listeners.delete(listener);
        release(topic, current);
      };
    },
    onReconnect(callback) {
      reconnects.add(callback);
      return () => void reconnects.delete(callback);
    },
  };
}
