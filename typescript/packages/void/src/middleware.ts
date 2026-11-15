/// <reference path="./virtual.d.ts" />
import { defineMiddleware } from 'void';
import { rpcHandler } from '@eeao/http';
import { mcpHandler } from '@eeao/mcp';
import { anthropicTools, runTool, toolResultContent } from '@eeao/ai';
import { app, registry } from 'virtual:eeao/registry';
import { createDevtools } from './devtools.js';
import { setAppRegistry } from './index.js';

// Built when the Worker starts. Void loads middleware eagerly, so a registry problem
// (an unfinished procedure, a weak reason, a duplicate name) stops the Worker from
// starting, and Cloudflare rejects the deploy.
setAppRegistry(registry);
const rpc = rpcHandler(registry, { basePath: app.basePath, openapi: { title: app.name, version: app.version } });
const mcp = mcpHandler(registry, { name: app.name, version: app.version, route: app.mcpRoute });
const tools = JSON.stringify(anthropicTools(registry));
// Call visualizers at /__eeao, only under `vite dev`. The build replaces import.meta.env.DEV
// with false, so this and the devtools module are dropped from production bundles.
const devtools = import.meta.env.DEV ? createDevtools(registry, app) : null;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export default defineMiddleware(async (c, next) => {
  const request = c.req.raw;
  const waitUntil = (p: Promise<unknown>) => c.executionCtx.waitUntil(p);
  if (devtools?.serves(new URL(request.url).pathname)) return devtools.serve(request);
  const res = devtools ? await devtools.record(request, waitUntil, () => handle(request, c.env, waitUntil)) : await handle(request, c.env, waitUntil);
  if (res) return res;
  await next();
});

/** Answers /mcp, /rpc and the AI tool endpoints. Null means "not ours", so Void carries on. */
async function handle(request: Request, env: any, waitUntil: (p: Promise<unknown>) => void): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const ctx = { waitUntil };

  if (mcp.matches(request)) return mcp(request, env, ctx);

  // AI tools over HTTP, for agent runtimes outside this Worker. Inside the Worker, call
  // anthropicTools(registry) and runTool(...) from @eeao/ai directly.
  if (path === `${app.basePath}/ai/tools.json` && request.method === 'GET') return new Response(tools, { headers: { 'content-type': 'application/json' } });
  if (path === `${app.basePath}/ai/run` && request.method === 'POST') {
    const body = (await request.json().catch(() => null)) as { tool?: string; input?: unknown; approved?: boolean } | null;
    if (!body?.tool) return json({ error: { code: 'INVALID_INPUT', message: 'Send { tool, input, approved? }' } }, 400);
    const run = await runTool(registry, body.tool, body.input, { request, env, waitUntil, approved: body.approved === true });
    return json({ status: run.status, tool_result: toolResultContent(run) });
  }

  // Every decision for every procedure as a Markdown table. Dev only; the demo snapshots it.
  if (import.meta.env.DEV && path === `${app.basePath}/audit.md`) return new Response(registry.auditTable(), { headers: { 'content-type': 'text/markdown' } });

  if (rpc.matches(request)) return rpc(request, env, ctx);
  return null;
}
