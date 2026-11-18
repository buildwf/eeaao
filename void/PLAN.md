# Building eeao on Void

Written 2026-11-13. This plan is about Void and the TypeScript implementation. The Rust crates are a separate track for Roid and are not affected.

## Verdict

Void is a good host for eeao, but it replaces only the plumbing around it, not the builder. The nine-decision builder, registry, MCP, CLI, AI tools, analytics and authz all still have to come from eeao. What Void gives us is the app shell: deploys, provisioning, D1/KV/R2, secrets, and Better Auth sessions (which closes eeao's biggest "not done yet" item).

The plan is one new package, `@eeao/void`: a Vite plugin that sits next to `voidPlugin()` and does all the wiring, so an app needs no eeao setup code (see "Deep integration"). No rewrite of the existing packages.

One real risk: Void routes are an escape hatch. Any file in `routes/` is a plain endpoint that skips all nine decisions, so the plugin fails the build when one appears without a stated reason.

## What Void is

"void.dev" itself serves an empty page. The product is **Void** from VoidZero (the Vite team, now part of Cloudflare), announced 2026-10-15, docs at void.cloud, npm package `void` (1.8.0 as of 2026-11-12). It has three parts:

- **SDK**: a Vite plugin that turns a Vite app into a Cloudflare Worker. File routes in `routes/` (Hono underneath, `defineHandler(c => ...)`), `middleware/`, pages with loaders and actions, `crons/`, `queues/`, Durable Objects, WebSockets, SSE.
- **Resources by import**: `void/db` (Drizzle on D1, or Postgres/MySQL), `void/kv`, `void/storage` (R2), `void/ai` (Workers AI via AI Gateway), `void/queues`, `void/email`, `void/sandbox`. Importing one provisions the binding on deploy.
- **CLI and platform**: `void deploy` builds, provisions, migrates and publishes, either straight to your Cloudflare account or to a self-hosted "Void platform" (Workers for Platforms). Also secrets, logs, rollback, GitHub builds.

Other relevant facts: `defineHandler.withValidator({ body, query, params })` takes any Standard Schema; auth is Better Auth (`requireAuth(c)`, `getUser()`, `getAuth(c)`, customize with `defineAuth` in `auth.ts`); typed fetch client `void/client`; `void.config.ts` has a `cloudflare` block that passes any Wrangler field straight through. Void has no MCP, analytics, output validation, or OpenAPI features of its own.

## What the spike proved

Code in [spike/](spike/). It builds a Void 1.8 app with the real `@eeao/core`, `@eeao/http` and `@eeao/analytics` source, then runs the production bundle in Miniflare.

| Question | Result |
| --- | --- |
| Can eeao mount inside a Void route? | Yes. `routes/rpc/[...path].ts` exporting `GET`/`POST = defineHandler(c => rpc(c.req.raw, c.env, c.executionCtx))`. 200 with a token, 401 without, manifest served. Type-checks clean against Void's generated types. |
| Does the Analytics Engine binding survive? | Yes. `cloudflare.analytics_engine_datasets` in `void.config.ts` lands in the generated Worker config as an `analytics-engine-dataset` binding. |
| Does a broken registry still fail the deploy? | **Not by default.** Void lazy-loads each route file with `import()`, so a registry built in a route module throws on the first request (500), not at Worker startup. The Worker starts fine and would deploy. |
| Can we get the gate back? | Yes. Import the registry from a `middleware/` file. Middleware is bundled eagerly, and the broken registry then stops the Worker from starting, which is what makes Cloudflare reject the upload. |
| Compatibility flags | Void adds `nodejs_als` itself (for `getUser()` and the `void/*` helpers). It does not need `nodejs_compat`. |

Not tested: an actual `void deploy` to Cloudflare (needs an account login), MCP through a Void route, Better Auth with tokens.

## What Void replaces

| Today in eeao | With Void |
| --- | --- |
| Hand-written `wrangler.jsonc`, `wrangler deploy` | `void.config.ts` and `void deploy` (staged deploys, rollback, logs) |
| `API_TOKENS` in vars/KV, verified by `bearerAuth` | Better Auth API keys stored in D1 (see conflicts) |
| No session auth ("not done yet") | Better Auth sessions, social providers, `admin()` roles |
| Worker `fetch` that routes to rpc/mcp | Two catch-all route files |
| Example data in memory | `void/db` with Drizzle, migrations checked on deploy |
| Secrets with `wrangler secret put` | `void secret put`, typed `env.ts` |

## Deep integration: one plugin and one stub file

Added 2026-11-13 after a request for as little configuration as possible. This replaces the earlier "mount helpers" build list. Revised the same day after checking Void's docs for plugin APIs (see "Integration method").

A working app built this way, with real output from every surface and every failure mode, is in [demo/](demo/README.md).

### What the app author writes

```ts
// vite.config.ts
plugins: [voidPlugin(), eeao()]
```

```ts
// middleware/00.eeao.ts: created by `npx eeao init`, never edited
export { default } from '@eeao/void/middleware';
```

```ts
// procedures/contacts.ts: name comes from the file and export: "contacts.get"
import { procedure, signedIn } from '@eeao/void';

export const get = procedure()
  .auth(signedIn)                       // Better Auth session or API key, already wired
  .input(z.object({ id: z.string() }))
  .authz({ policy: 'same-org', check: (user, input) => ... })
  .output(Contact)
  ...                                   // the other decisions, unchanged
  .handler(({ input, env }) => ...);    // env typed from Void's generated bindings
```

Nothing else for eeao. The nine decisions stay exactly as strict: the plugin removes plumbing, never a choice.

### What `eeao()` does

| Today, by hand | With the plugin |
| --- | --- |
| `defineRegistry([...])` listing every procedure | Discovers every procedure in `procedures/` (Void already uses folders this way: `crons/`, `queues/`) |
| `procedure('contacts.get')` | Name defaults to file path plus export name; an explicit name still wins |
| Route files for `/rpc` and `/mcp` | Served by the one middleware file, which runs after Void's auth and context middleware |
| Remember to load the registry eagerly | Automatic: Void loads middleware at startup, so a broken procedure fails the deploy |
| `createProcedures<Env>()` | `Env` comes from Void's generated `VoidGeneratedEnvBindings`, so no generic |
| Write an auth provider | `signedIn`, `apiKey`, `session` and `admin` providers built on Void's Better Auth, ready to pass to `.auth()` |
| Pick analytics in code | Analytics Engine by default, binding name `ANALYTICS` |
| Route guard script | Build fails if `routes/` has a file without an `// eeao-allow: <reason>` comment |
| `@eeao/http/client` types | Also teaches `void/client` the `/rpc/*` paths, so Void's typed fetch works (optional) |
| Audit snapshot | `eeao.audit.md` written on `void dev` and checked in CI |

### Integration method

The question was whether to integrate directly with Vite or some other way. I checked Void's docs (the full set ships in `node_modules/void/docs/`) for anything plugin-like:

- **Void has no plugin, module or extension API.** `voidPlugin(options)` takes only `persistTo` and `auxiliaryWorkers`. There is no hook to add routes, middleware or bindings from a package. Its first-party add-ons (`voidReact()`, `voidVue()`, `voidMarkdown()`) are themselves plain Vite plugins listed next to `voidPlugin()`.
- **The public extension points are file conventions and config:** `routes/`, `middleware/` (default-export `defineMiddleware`, loaded eagerly, ordered by numeric prefix), `void.config.ts` (`cloudflare` passthrough for extra bindings, `inference.scanDirs`), and Hono middleware.
- **Bindings are inferred only from Void's own imports** (`void/db`, `void/kv`, and so on). Nothing lets a package add one, so the Analytics Engine binding needs a line in `void.config.ts`.

So yes, integrate with Vite, because that is how Void itself is extended. The recommended shape is **a Vite plugin plus one middleware file**:

1. `eeao()` Vite plugin: finds `procedures/`, builds the registry as a virtual module, fails the build on stray `routes/` files, writes types.
2. `middleware/00.eeao.ts`: a one-line re-export of `@eeao/void/middleware`, which imports that virtual module and serves `/rpc` and `/mcp`. Because it sits in Void's public `middleware/` folder, Void loads it at startup and runs it after its own auth middleware. That gives us the deploy gate and `getUser()` with no private APIs. If the file is missing, the plugin fails the build and says to run `npx eeao init`.

Approaches considered and rejected:

| Approach | Why not |
| --- | --- |
| Edit Void's internal route table (`virtual:void-routes`) in a `transform` hook | Works with zero files (I spiked it first), but it patches generated code that can change in any Void release. One stub file is a small price for staying on public APIs. Kept as a fallback only if VoidZero adds a public hook. |
| Generated route files in `routes/rpc` and `routes/mcp` | Void lazy-loads routes, so it needs the middleware file anyway for the deploy gate; three files instead of one. |
| `auxiliaryWorkers` (eeao as a separate Worker) | A second Worker means a second deploy and no shared request context with Void auth; it's built for separate API/dashboard Workers. |
| Wait for a Void plugin API | Doesn't exist; worth asking VoidZero for, but not worth blocking on. |

### What the spikes proved

Code in [spike-plugin/](spike-plugin/): a 32-line Vite plugin and the one-line middleware, built with Void 1.8 and run in Miniflare:

- With **no `routes/` and no registry file**, only the middleware stub, `procedures/whoami.ts` was discovered and served: 200 with a token, 401 without, manifest served.
- An unfinished procedure in `procedures/` stopped the Worker from starting with the registry's error message, so the deploy gate holds.
- The earlier route-table version also worked; it was replaced by the middleware version above.
- One trap found and fixed: discovery must also pick up unfinished builders (`~eeao: 'builder'`), otherwise a procedure that never called `.handler()` silently disappears instead of failing.

Not spiked yet: the Better Auth providers, typed `env`, MCP mount, name-from-path, `void/client` types, and the stub's `@eeao/void/middleware` re-export (the spike imports the virtual module directly).

### The configuration that is left

- **Analytics Engine binding: one line**, or zero with Void's help. Void infers bindings from imports (`void/kv` creates KV) but has no analytics import, and a Vite plugin can't add bindings to Void's config. Short term, `npx eeao init` writes `analytics_engine_datasets` into `void.config.ts` once. Long term, ask Void to infer it, for example from an `void/analytics` import; then this line disappears.
- **Auth**: zero if the app already enables Void auth. eeao doesn't turn it on for you, because adding auth tables is a schema change the developer should see.
- **MCP server name and version**: default to `package.json` `name` and `version`.

### Risks

- **Middleware order.** Void runs app middleware in numeric-prefix order, and eeao's middleware answers `/rpc` and `/mcp` itself without calling the next one. So its prefix is a choice: app middleware that should wrap API calls (request logging, rate limits) needs a lower number, and middleware that must not gate the API (such as `basicAuth`) needs a higher one. `npx eeao init` picks a prefix after reading the existing `middleware/` folder and says why. Void's own auth and context setup always runs before any app middleware, so `getUser()` works either way.
- **Void is one month old.** Pin `void` to a minor version and run the Miniflare spike as a CI test so a Void change that breaks loading or mounting shows up as a failed build.

### Build order

1. `@eeao/void`: the Vite plugin (discovery, registry, route guard, missing-stub check) and `@eeao/void/middleware` (the spike, hardened, with tests against Void's dev server and build).
2. Better Auth providers and typed `env` (needs a spike with Void auth enabled on D1).
3. MCP mount and `package.json` defaults.
4. `npx eeao init` (adds the plugin, writes the middleware stub and the Analytics Engine line, creates `procedures/`).
5. Port the contacts example to `examples/contacts-void` with D1 and Better Auth.
6. Optional: `void/client` route types, audit file on `void dev`.
7. Open the upstream asks with VoidZero: a public way for a Vite plugin to register middleware and bindings, which would remove the stub file and the config line.

Unchanged: `@eeao/core`, `@eeao/http`, `@eeao/mcp`, `@eeao/ai`, `@eeao/analytics`, `@eeao/cli`. One small core addition: a procedure without a name, named by whoever registers it.

Rough size (a guess, not measured): about a week for steps 1 to 5.

## Conflicts with earlier decisions

**Output required.** No conflict. Void has no output validation, so eeao keeps doing it. The conflict is with Void's plain routes, which have no output schema at all; the plugin's route guard handles that.

**Workers Analytics Engine.** No conflict on direct Cloudflare deploys; the binding passes through (verified in the build). Unverified on a self-hosted Void platform: the docs say the `cloudflare` block is for "direct Cloudflare builds and deployment", so platform deploys may drop custom bindings. If they do, the PostHog provider is the fallback, which is already built. Decide this only if you plan to use a Void platform.

**CLI API tokens.** Still bearer tokens through the same auth provider, but the token store moves. Today tokens are a JSON map in vars (TS) or sha256 hashes in KV (Rust). With Void the natural home is the Better Auth API key plugin, which stores hashed keys in D1, supports expiry and revocation, and lets users create their own keys. The CLI keeps sending `Authorization: Bearer`; the plugin's key header has to be configured to read it. Recommendation: switch to Better Auth keys in the Void version and keep `bearerAuth({ verify })` for apps that don't use Void.

**No `nodejs_compat`, Web APIs only.** Mostly holds. Void needs `nodejs_als` (AsyncLocalStorage only), and Better Auth and Drizzle come along as dependencies, so the Worker bundle grows. In the spike (no MCP, no auth) the bundle was about 190 KB for eeao plus Zod and 132 KB of Void runtime, before gzip.

**Registry fails `wrangler deploy` with 10021.** True only if the registry loads at startup, which Void route files do not. The middleware stub handles this, because Void loads middleware at startup. This is the one place where Void changes the design, and the plugin enforces it so nobody has to remember.

**Typed client.** Void's `void/client` fetch only knows about Void routes, so it can't see eeao procedures behind a catch-all. Keep `@eeao/http/client`. Generating one Void route per procedure would make `void/client` work, but it duplicates the client and makes the route guard harder. Not recommended.

## Things to watch

- Void is one month old (announced 2026-10-15, at 1.8.0). The route lazy-loading and config passthrough are build details that could change; the spike's Miniflare test should run in CI so we notice.
- MCP through a Void route is untested. The handler is plain `fetch`, so it should work, but the session-less Streamable HTTP DELETE and the response streaming need a check.
- OAuth for MCP clients becomes easier with Better Auth's OAuth provider plugin, but that's new scope.

## Sources

- [Cloudflare blog: Deploy with Void](https://blog.cloudflare.com/deploy-with-void/)
- [Void docs](https://void.cloud/guide/) and the copy bundled at `node_modules/void/docs/` (server-routing, auth, config, integrations/cloudflare, integrations/hono)
- [Flavio Copes: The complete guide to Void](https://flaviocopes.com/void/)
