/**
 * An `EventSource` that can send headers, built on `fetch`.
 *
 * The browser's `EventSource` can't set an `Authorization` header, so it only works with cookie
 * sessions. This stand-in takes the same constructor shape and the same three events
 * (`open`, `message`, `error`), so it drops into bwf's `connectLiveStream` as `eventSource`.
 * It doesn't reconnect: bwf's client closes a failed source and opens a new one itself.
 */
export type FetchEventSourceOptions = {
  /** Headers for each stream request. Called every time a stream opens, so a token can be refreshed. */
  headers: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  fetch?: typeof fetch;
};

type Listener = (event: any) => void;

export type FetchEventSourceConstructor = new (
  url: string,
  init?: unknown,
) => {
  readonly url: string;
  addEventListener(type: string, listener: Listener): void;
  removeEventListener(type: string, listener: Listener): void;
  close(): void;
};

export function fetchEventSource(options: FetchEventSourceOptions): FetchEventSourceConstructor {
  return class FetchEventSource {
    #listeners = new Map<string, Set<Listener>>();
    #abort = new AbortController();
    #closed = false;

    constructor(readonly url: string, _init?: unknown) {
      void this.#run();
    }

    addEventListener(type: string, listener: Listener) {
      (this.#listeners.get(type) ?? this.#listeners.set(type, new Set()).get(type)!).add(listener);
    }

    removeEventListener(type: string, listener: Listener) {
      this.#listeners.get(type)?.delete(listener);
    }

    close() {
      this.#closed = true;
      this.#abort.abort();
    }

    #emit(type: string, event: object = {}) {
      if (this.#closed) return;
      for (const listener of [...(this.#listeners.get(type) ?? [])]) listener({ type, ...event });
    }

    async #run() {
      try {
        const headers = new Headers(typeof options.headers === 'function' ? await options.headers() : options.headers);
        headers.set('accept', 'text/event-stream');
        const response = await (options.fetch ?? fetch)(this.url, { headers, signal: this.#abort.signal, cache: 'no-store' });
        if (!response.ok || !response.body) throw new Error(`live: stream answered ${response.status}`);
        this.#emit('open');
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        let data: string[] = [];
        let name = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let newline: number;
          while ((newline = buffer.search(/\r\n|\n|\r/)) !== -1) {
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + (buffer.startsWith('\r\n', newline) ? 2 : 1));
            if (line === '') {
              if (data.length > 0) this.#emit(name || 'message', { data: data.join('\n') });
              data = [];
              name = '';
            } else if (!line.startsWith(':')) {
              const colon = line.indexOf(':');
              const field = colon === -1 ? line : line.slice(0, colon);
              const text = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
              if (field === 'data') data.push(text);
              else if (field === 'event') name = text;
            }
          }
        }
        this.#emit('error'); // the server ended the stream
      } catch (error) {
        this.#emit('error', { error });
      }
    }
  };
}
