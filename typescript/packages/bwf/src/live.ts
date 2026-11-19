import type { LiveTransport } from '@buildwf/realtime-live';

/** The part of bwf's `@buildwf/bwf/live/client` this adapter uses. Pass `connectLiveStream` itself. */
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
  /** `connectLiveStream` from `@buildwf/bwf/live/client`. */
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

  return {
    async subscribe(topic, onEvent) {
      const stop = await open().subscribe({ id: crypto.randomUUID(), topic, onEvent: () => onEvent() });
      return () => void stop().catch(() => {});
    },
    onReconnect(callback) {
      reconnects.add(callback);
      return () => void reconnects.delete(callback);
    },
  };
}
