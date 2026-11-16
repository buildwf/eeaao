# eeao built into Void (fif-spa)

Written 2026-11-15. This replaces the external-plugin design in [PLAN.md](PLAN.md) for our fork. PLAN.md was written while Void was upstream-only, so it worked around a missing plugin API. We now own the fork, so eeao becomes a Void convention like `crons/` and `queues/`.

The base is `~/Projects/fif-spa`, which supports React single-page apps on Cloudflare only. Source facts below come from fif-spa `HEAD` (0005133), with paths relative to `packages/void/src/`. Work starts after the in-flight SSR/framework cut is committed, because that cut touches most of the files listed here.

## What an app author writes

```ts
// procedures/contacts.ts  ->  contacts.get, contacts.list
import { procedure, signedIn } from 'void/procedure';

export const get = procedure()
  .auth(signedIn)
  .input(z.object({ id: z.string() }))
  ...                                    // the nine decisions, exactly as strict as today
  .handler(({ input, env }) => ...);     // env typed from Void's generated bindings
```

```tsx
// src/ (the SPA)
import { rpc, useCall } from 'void/rpc/react';

const contact = useCall(rpc.contacts.get, { id });
await rpc.contacts.update({ id, name });
```

There is no `vite.config.ts` change, no middleware stub, no registry file, no `void.config.ts` line, and no `npx eeao init`.

## How it works

| Piece | Today (PLAN.md, external plugin) | Native in the fork | Where |
| --- | --- | --- | --- |
| Discovery | `eeao()` Vite plugin globs `src/procedures` | `procedures/` at `sourceRoot`, a sibling of `crons/` and `queues/`, scanned with the shared `listConventionFiles` (which skips `_` files) | `project-paths.ts:98-102`, `shared/convention-files.ts:46`, new `procedures/scan.ts` |
| Name | `procedure('contacts.get')` | File path plus export name: `procedures/billing/invoices.ts` export `list` becomes `billing.invoices.list`, and `index.ts` collapses. An explicit name still wins. A duplicate name fails the build, like the duplicate check for queues. | `queues/scan.ts:104-126` is the model |
| Registry | Virtual module plus a middleware stub, because only middleware loads eagerly | `compileRouteTable` emits static imports of every procedure file and a top-level `defineRegistry(...)` in `virtual:void-routes`. A broken procedure stops the Worker from starting, which is the deploy gate, with no stub file. | `router/compile.ts:236-240` (where middleware is imported eagerly) |
| Mount | Middleware returns early on `/rpc` and `/mcp`, so its numeric prefix was a choice | Real Hono routes `app.all('/rpc/*')` and `app.all('/mcp')`, registered where file routes go today: after Better Auth and after user middleware. Middleware for logging and rate limits wraps the API by default, with no ordering decision. | `router/compile.ts:320-399` |
| Env type | `createProcedures<VoidEnv>()` in `@eeao/void` | `void/procedure` exports `procedure` and `profile` typed with `CloudBindings` | `runtime/handler.ts:46-69` |
| Analytics binding | Hand-written `analytics_engine_datasets` line | Inferred: a non-empty `procedures/` sets `needsAnalytics`, which binds `ANALYTICS` to the dataset `<worker name>_events`. Datasets need no provisioning (they are created on first write; check this before relying on it). | `inference/walk.ts:8-18,208`, `plugin-worker-bindings.ts:65`, `cli/package.ts:380` (managed manifest), `codegen/binding-types.ts:18` (types already exist) |
| Route guard | Build fails on a `routes/` file without `// eeao-allow:` | Same rule, moved into Void's route scan (see "Raw routes") | `router/scan.ts:52-104` |
| Devtools | `/__eeao`, dev only | `/__void/eeao`, dev only; keep the visualizers | `router/compile.ts:850` (`/__void/*`) |
| Audit | `rpc/audit.md` in dev | `.void/eeao.audit.md`, written on `void dev` and `void prepare`, committed to the repo, and compared by `void prepare --check` in CI | `codegen/prepare.ts` |

Ceiling: every procedure module loads at Worker startup instead of lazily, as routes do. That is the price of the deploy gate. Middleware already pays it, and the spike bundle was about 190 KB. Revisit only if cold start becomes measurable. One option then is to validate the registry at build time and load handlers lazily.

## Auth

Void's Better Auth middleware already runs before user middleware and procedure routes (`router/compile.ts:320-326`). It puts the user in AsyncLocalStorage (`runtime/auth.ts:69-89`), so the providers are thin:

| Provider | Resolves | Built on |
| --- | --- | --- |
| `session` | The Better Auth user, or null | `getUser()` |
| `apiKey` | A hashed bearer token, then the user | `apiTokens(lookup)` from today's `@eeao/void`, until a Better Auth API-key plugin is added (there is none in the fork, `packages/void/src`) |
| `signedIn` | `anyOf(session, apiKey)` | `@eeao/core` `anyOf` |
| `admin` | `signedIn` with an admin role | Better Auth `admin()` role |

The browser client sends cookies with same-origin `fetch`, so the SPA never handles tokens. The CLI and agents use bearer tokens.

Watch out: the fork builds a Better Auth instance on every request (`runtime/better-auth-shared.ts:614-621`). Procedures don't make this worse, but a hot `/rpc` path will show it.

## Client

- `void/rpc` is a typed proxy over `@eeao/http/client`: `rpc.contacts.get(input)` posts to `/rpc/contacts.get`. Types come from a generated `.void/procedures.d.ts` (`typeof import(...)` per file, type-only, the same technique as `codegen/route-types.ts`), so no server code reaches the browser.
- `void/rpc/react` adds `useCall(proc, input)` for loading state, errors and refetch, and nothing else. Apps that want caching wrap `rpc.*` in TanStack Query themselves. Add more hooks when a second app needs them.
- Inside the Worker, `void/rpc` calls `registry.call(...)` in-process and forwards the request, the same pattern as `createServerFetch` (`runtime/fetch-server.ts:5-44`).
- `RpcError` keeps the typed `code`, so `catch (e) { if (e.code === 'NOT_FOUND') ... }` type-checks against the procedure's declared errors.

## Remote dev

Procedures run locally against the proxied D1, KV and R2 like any other Worker code (`runtime/remote/`), so remote dev needs nothing new. Analytics Engine has no proxy. In dev, events go to the console provider instead, which is today's `logEventsInDev` behaviour, so a remote session never writes to production analytics.

## Raw routes and removing REST

The fork's scope says REST routes and typed fetch get replaced by procedures. Three things still need a raw request, and eeao procedures (JSON over `POST /rpc/<name>`) can't express them:

- WebSocket routes, which live in `routes/` (`router/websocket.ts:177`).
- OAuth and auth callbacks that redirect, such as the dashboard's `routes/auth/callback.ts` and `routes/logout.ts`.
- Signed webhooks that need the exact raw body to verify a signature.

**Recommendation:** keep `routes/` as an escape hatch, not an API surface. Every file needs `// eeao-allow: <reason>`, and Void's scan fails the build otherwise. That keeps PLAN.md's guard, enforced by the framework instead of a plugin. Remove the typed fetch client (`void/client`, `codegen/route-types.ts` route maps, `runtime/fetch*.ts`, `void gen route`, `docs/guide/typed-fetch.md`) once nothing in the repo uses it.

**Entanglement to check after the SSR cut lands:** `defineHandler.withValidator` and `.void/routes.d.ts` are shared with Pages loaders and actions (`pages/protocol.ts:329-343`), and `void/routes` is imported by `pages/*`, `runtime/ws.ts`, `runtime/isr.ts` and `config.ts`. The SSR cut should remove most of those users. Whatever remains decides how much of the typed fetch code can go.

## Migration order

1. **Core in the fork.** Add `procedures/` scanning, path naming, the eager registry, the `/rpc` and `/mcp` mounts, `void/procedure`, the auth providers and the inferred analytics binding. Port the Miniflare spike as a test with three cases: a broken procedure stops the Worker, a 401 without a session, and a 200 with one.
2. **Client.** `void/rpc`, `void/rpc/react`, `.void/procedures.d.ts`, and `void gen procedure`.
3. **Dashboard (first real user).** Replace the three `TODO(eeao)` endpoints: `routes/api/page/{home,login,account}.ts` become procedures `page.home`, `page.login`, `page.account` and `account.update`. `src/main.tsx:14` `loadPage` then calls `rpc.page.*`. `routes/auth/callback.ts` and `routes/logout.ts` stay as allowed raw routes.
4. **Route guard on.** Enforce the `// eeao-allow:` rule and remove the typed fetch client.
5. **Platform API** (`platform/packages/api`, about 300 handlers). It is a plain Hono Worker, not a Void app, so it doesn't get the conventions. Use `@eeao/http` and `@eeao/mcp` directly per sub-app, starting with `/me` and `/projects`, which the dashboard calls through `hc<ApiRoutes>` (`dashboard/lib/api.ts`). Remove each Hono route only after the dashboard, admin and CLI no longer call it. Converting the API into a Void app is a separate decision; this order doesn't need it.
6. **Admin UI.** Replace the `X-VoidPages` page-object endpoints (`admin/react/server.ts:43`, `spa.tsx:5`, about 24 `renderAdminPage` call sites) with one procedure per view.

Rough size, a guess: steps 1–2 take about a week, and step 3 takes a day. Steps 5–6 are the long tail and depend on how many of the ~300 handlers need to be callable from outside.

## Decisions for Zack

1. **Where the eeao TypeScript packages live.** Decided 2026-11-15: move them. I recommend moving `core`, `http`, `mcp`, `ai`, `analytics` and `cli` into the fif-spa pnpm workspace, so `void` depends on them by workspace path. Then one repo, one test run and one release. `@eeao/void` is deleted because its job is now Void's. The eeaao repo keeps the design history. The alternative is to publish from eeaao and have the fork depend on versions, which adds a release step for every change.
2. **Raw routes.** Keep `routes/` with a required reason (recommended above), or remove it entirely and give WebSockets and callbacks their own conventions.
3. **The `@eeao/cli` binary.** It is a client for an app's procedures, not a deploy tool. Keep it as its own `eeao` command for now. Merging it into `void` (`void call contacts.get`) can wait.

## Not verified

- An Analytics Engine dataset being created on first write, and whether self-hosted Void platform deploys keep the binding (`cli/package.ts` is the managed manifest; PLAN.md raised the same question).
- MCP over the fork's Hono app, including streaming and the session-less `DELETE`.
- Better Auth sessions reaching procedures through `getUser()`. The ordering in `router/compile.ts` says they will, but no spike has run it.
- What the SSR cut leaves of Pages' use of `withValidator` and `void/routes`.
