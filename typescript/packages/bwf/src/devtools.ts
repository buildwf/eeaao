// Dev-only call visualizers for eeao apps, served at /__eeao by the eeao middleware.
// It records every request the middleware answers (HTTP, CLI, MCP, AI tools), every
// outbound fetch the Worker makes (including model API calls), and the step-by-step
// trace of each procedure call. The middleware only loads this under `vite dev`, so
// production builds leave it out entirely.
import type { CallTrace, Registry, ToolGateTrace, TraceEvent } from '@buildwf/realtime';
// The page itself (devtools.html), inlined by the eeao() plugin as a string.
import page from 'virtual:eeao/devtools-page';

type Kind = 'rpc' | 'mcp' | 'ai' | 'llm' | 'outbound' | 'direct';

type Exchange = {
  id: number;
  rev: number;
  at: number;
  kind: Kind;
  /** For rpc: http or cli (from the x-eeao-surface header). */
  surface?: string;
  method: string;
  url: string;
  path: string;
  status?: number;
  ms?: number;
  reqHeaders: Record<string, string>;
  reqBody?: unknown;
  resHeaders?: Record<string, string>;
  resBody?: unknown;
  error?: string;
  calls: Omit<CallTrace, 'request'>[];
  gates: Omit<ToolGateTrace, 'request'>[];
};

const MAX = 400;
const SECRET_HEADERS = /^(authorization|x-api-key|cookie|set-cookie|proxy-authorization)$/i;
// Added by the dev server or the HTTP client on every request; they only add noise.
const NOISE_HEADERS = /^(cf-|x-forwarded-|sec-|accept-encoding$|accept-language$|connection$|host$|content-length$)/i;

const mask = (value: string) => {
  const [scheme, token] = value.includes(' ') ? value.split(/ (.*)/s) : ['', value];
  const t = token ?? '';
  const shown = t.length > 6 ? `${t.slice(0, 6)}…` : t;
  return scheme ? `${scheme} ${shown}` : shown;
};

const headers = (h: Headers) => {
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    if (!NOISE_HEADERS.test(k)) out[k] = SECRET_HEADERS.test(k) ? mask(v) : v;
  });
  return out;
};

/** JSON when it parses, the events of an SSE stream as an array, otherwise the text. */
function parseBody(text: string, contentType: string | null): unknown {
  if (!text) return undefined;
  if (contentType?.includes('text/event-stream')) {
    const events: unknown[] = [];
    for (const block of text.split(/\n\n+/)) {
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      try {
        events.push(JSON.parse(data));
      } catch {
        events.push(data);
      }
    }
    return { sse: events };
  }
  try {
    return JSON.parse(text);
  } catch {
    return text.length > 20_000 ? `${text.slice(0, 20_000)}… (${text.length} chars)` : text;
  }
}

export type Devtools = ReturnType<typeof createDevtools>;

export function createDevtools(registry: Registry, app: { name: string; basePath: string; mcpRoute: string }) {
  const route = '/__eeao';
  const exchanges: Exchange[] = [];
  const byRequest = new WeakMap<Request, Exchange>();
  let seq = 0;
  let rev = 0;

  const touch = (ex: Exchange) => (ex.rev = ++rev);
  const add = (ex: Omit<Exchange, 'id' | 'rev'>) => {
    const full = { ...ex, id: ++seq, rev: ++rev } as Exchange;
    exchanges.push(full);
    if (exchanges.length > MAX) exchanges.splice(0, exchanges.length - MAX);
    return full;
  };
  const kindOf = (path: string): Kind | null => {
    if (path === app.mcpRoute) return 'mcp';
    if (path.startsWith(`${app.basePath}/ai/`)) return 'ai';
    if (path === app.basePath || path.startsWith(`${app.basePath}/`)) return 'rpc';
    return null;
  };

  registry.trace.subscribe((event: TraceEvent) => {
    const { request, ...rest } = event;
    let ex = byRequest.get(request);
    if (!ex) {
      // A call made without a request the middleware saw, e.g. from a cron or queue handler.
      ex = add({ at: event.at, kind: 'direct', method: 'CALL', url: '', path: event.type === 'call' ? event.procedure : event.tool, reqHeaders: {}, calls: [], gates: [] });
      byRequest.set(request, ex);
    }
    if (rest.type === 'call') ex.calls.push(rest);
    else ex.gates.push(rest);
    touch(ex);
  });

  // Outbound fetches: model APIs show in the AI chat view, everything else in Network.
  // Kept on globalThis so a hot reload of the middleware wraps the real fetch, not our wrapper.
  const g = globalThis as typeof globalThis & { __eeaoFetch?: typeof fetch };
  const original = (g.__eeaoFetch ??= globalThis.fetch.bind(globalThis));
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const llm = request.method === 'POST' && /\/v1\/messages$/.test(url.pathname);
    const ex = add({
      at: Date.now(),
      kind: llm ? 'llm' : 'outbound',
      method: request.method,
      url: request.url,
      path: `${url.host}${url.pathname}`,
      reqHeaders: headers(request.headers),
      reqBody: parseBody(await request.clone().text().catch(() => ''), request.headers.get('content-type')),
      calls: [],
      gates: [],
    });
    try {
      const res = await original(request);
      ex.status = res.status;
      ex.ms = Date.now() - ex.at;
      ex.resHeaders = headers(res.headers);
      res
        .clone()
        .text()
        .then((t) => {
          ex.resBody = parseBody(t, res.headers.get('content-type'));
          touch(ex);
        })
        .catch(() => {});
      touch(ex);
      return res;
    } catch (e) {
      ex.error = (e as Error)?.message ?? String(e);
      ex.ms = Date.now() - ex.at;
      touch(ex);
      throw e;
    }
  };

  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

  const registryInfo = () => ({
    app,
    audit: registry.audit(),
    procedures: [...registry.procedures.values()].map((p) => ({
      name: p.name,
      toolName: p.toolName,
      mcp: p.decisions.mcp.kind === 'tool' ? { effect: p.decisions.mcp.effect, description: p.decisions.mcp.description } : null,
      aiTool: p.decisions.aiTool.kind === 'tool' ? { needsApproval: p.decisions.aiTool.needsApproval, description: p.decisions.aiTool.description } : null,
      cli: p.decisions.cli.kind === 'command' ? p.decisions.cli.command : null,
      errors: p.errors,
    })),
  });

  return {
    route,
    /** The devtools page and its data. */
    serves: (path: string) => path === route || path.startsWith(`${route}/`),
    async serve(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const sub = url.pathname.slice(route.length);
      if (sub === '/events') {
        const since = Number(url.searchParams.get('since') ?? 0);
        return json({ rev, exchanges: exchanges.filter((e) => e.rev > since), ids: exchanges.map((e) => e.id) });
      }
      if (sub === '/registry') return json(registryInfo());
      if (sub === '/clear' && request.method === 'POST') {
        exchanges.length = 0;
        rev++;
        return json({ ok: true });
      }
      return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    },
    /** Runs the middleware for one request and records it when eeao answered it. */
    async record(request: Request, waitUntil: (p: Promise<unknown>) => void, run: () => Promise<Response | null>): Promise<Response | null> {
      const url = new URL(request.url);
      const kind = kindOf(url.pathname);
      if (!kind) return run();
      const reqText = request.method === 'GET' || request.method === 'HEAD' ? '' : await request.clone().text().catch(() => '');
      const ex = add({
        at: Date.now(),
        kind,
        ...(kind === 'rpc' ? { surface: request.headers.get('x-eeao-surface') === 'cli' ? 'cli' : 'http' } : {}),
        method: request.method,
        url: request.url,
        path: url.pathname,
        reqHeaders: headers(request.headers),
        reqBody: parseBody(reqText, request.headers.get('content-type')),
        calls: [],
        gates: [],
      });
      byRequest.set(request, ex);
      try {
        const res = await run();
        ex.ms = Date.now() - ex.at;
        if (!res) {
          exchanges.splice(exchanges.indexOf(ex), 1);
          return res;
        }
        ex.status = res.status;
        ex.resHeaders = headers(res.headers);
        waitUntil(
          res
            .clone()
            .text()
            .then((t) => {
              ex.resBody = parseBody(t, res.headers.get('content-type'));
              touch(ex);
            })
            .catch(() => {}),
        );
        touch(ex);
        return res;
      } catch (e) {
        ex.error = (e as Error)?.message ?? String(e);
        ex.ms = Date.now() - ex.at;
        touch(ex);
        throw e;
      }
    },
  };
}
