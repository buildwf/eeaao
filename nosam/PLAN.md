# Building eeao on Nosam

Written 2026-11-13. This plan is about Nosam and the TypeScript implementation. The Rust crates are a separate track for Roid and are not affected.

## Verdict

Nosam is a good host for eeao, but it replaces only the plumbing around it, not the builder. The nine-decision builder, registry, MCP, CLI, AI tools, analytics and authz all still have to come from eeao. What Nosam gives us is the app shell: deploys, provisioning, D1/KV/R2, secrets, and Better Auth sessions (which closes eeao's biggest "not done yet" item).

The plan is one new package, `@eeao/nosam`: a Vite plugin that sits next to `nosamPlugin()` and does all the wiring, so an app needs no eeao setup code (see "Deep integration"). No rewrite of the existing packages.

One real risk: Nosam routes are an escape hatch. Any file in `routes/` is a plain endpoint that skips all nine decisions, so the plugin fails the build when one appears without a stated reason.

## What Nosam is

"nosam.dev" itself serves an empty page. The product is **Nosam** from VoidZero (the Vite team, now part of Cloudflare), announced 2026-10-15, docs at void.cloud, npm package `nosam` (1.8.0 as of 2026-11-12). It has three parts:

- **SDK**: a Vite plugin that turns a Vite app into a Cloudflare Worker. File routes in `routes/` (Hono underneath, `defineHandler(c => ...)`), `middleware/`, pages with loaders and actions, `crons/`, `queues/`, Durable Objects, WebSockets, SSE.
- **Resources by import**: `nosam/db` (Drizzle on D1, or Postgres/MySQL), `nosam/kv`, `nosam/storage` (R2), `nosam/ai` (Workers AI via AI Gateway), `nosam/queues`, `nosam/email`, `nosam/sandbox`. Importing one provisions the binding on deploy.
- **CLI and platform**: `nosam deploy` builds, provisions, migrates and publishes, either straight to your Cloudflare account or to a self-hosted "Nosam platform" (Workers for Platforms). Also secrets, logs, rollback, GitHub builds.

Other relevant facts: `defineHandler.withValidator({ body, query, params })` takes any Standard Schema; auth is Better Auth (`requireAuth(c)`, `getUser()`, `getAuth(c)`, customize with `defineAuth` in `auth.ts`); typed fetch client `nosam/client`; `nosam.config.ts` has a `cloudflare` block that passes any Wrangler field straight through. Nosam has no MCP, analytics, output validation, or OpenAPI features of its own.

## What the spike proved

Code in [spike/](spike/). It builds a Nosam 1.8 app with the real `@eeao/core`, `@eeao/http` and `@eeao/analytics` source, then runs the production bundle in Miniflare.

| Question | Result |
| --- | --- |
| Can eeao mount inside a Nosam route? | Yes. `routes/rpc/[...path].ts` exporting `GET`/`POST = defineHandler(c => rpc(c.req.raw, c.env, c.executionCtx))`. 200 with a token, 401 without, manifest served. Type-checks clean against Nosam's generated types. |
| Does the Analytics Engine binding survive? | Yes. `cloudflare.analytics_engine_datasets` in `nosam.config.ts` lands in the generated Worker config as an `analytics-engine-dataset` binding. |
| Does a broken registry still fail the deploy? | **Not by default.** Nosam lazy-loads each route file with `import()`, so a registry built in a route module throws on the first request (500), not at Worker startup. The Worker starts fine and would deploy. |
| Can we get the gate back? | Yes. Import the registry from a `middleware/` file. Middleware is bundled eagerly, and the broken registry then stops the Worker from starting, which is what makes Cloudflare reject the upload. |
| Compatibility flags | Nosam adds `nodejs_als` itself (for `getUser()` and the `nosam/*` helpers). It does not need `nodejs_compat`. |

Not tested: an actual `nosam deploy` to Cloudflare (needs an account login), MCP through a Nosam route, Better Auth with tokens.

## What Nosam replaces

| Today in eeao | With Nosam |
| --- | --- |
| Hand-written `wrangler.jsonc`, `wrangler deploy` | `nosam.config.ts` and `nosam deploy` (staged deploys, rollback, logs) |
| `API_TOKENS` in vars/KV, verified by `bearerAuth` | Better Auth API keys stored in D1 (see conflicts) |
| No session auth ("not done yet") | Better Auth sessions, social providers, `admin()` roles |
| Worker `fetch` that routes to rpc/mcp | Two catch-all route files |
| Example data in memory | `nosam/db` with Drizzle, migrations checked on deploy |
| Secrets with `wrangler secret put` | `nosam secret put`, typed `env.ts` |

## Deep integration: one plugin and one stub file

Added 2026-11-13 after Zack asked for as little configuration as possible. This replaces the earlier "mount helpers" build list. Revised the same day after checking Nosam's docs for plugin APIs (see "Integration method").

A working app built this way, with real output from every surface and every failure mode, is in [demo/](demo/README.md).

### What the app author writes

```ts
// vite.config.ts
plugins: [nosamPlugin(), eeao()]
```

```ts
// middleware/00.eeao.ts: created by `npx eeao init`, never edited
export { default } from '@eeao/nosam/middleware';
```

```ts
// procedures/contacts.ts: name comes from the file and export: "contacts.get"
import { procedure, signedIn } from '@eeao/nosam';

export const get = procedure()
  .auth(signedIn)                       // Better Auth session or API key, already wired
  .input(z.object({ id: z.string() }))
  .authz({ policy: 'same-org', check: (user, input) => ... })
  .output(Contact)
  ...                                   // the other decisions, unchanged
  .handler(({ input, env }) => ...);    // env typed from Nosam's generated bindings
```

Nothing else for eeao. The nine decisions stay exactly as strict: the plugin removes plumbing, never a choice.

### What `eeao()` does

| Today, by hand | With the plugin |
| --- | --- |
| `defineRegistry([...])` listing every procedure | Discovers every procedure in `procedures/` (Nosam already uses folders this way: `crons/`, `queues/`) |
| `procedure('contacts.get')` | Name defaults to file path plus export name; an explicit name still wins |
| Route files for `/rpc` and `/mcp` | Served by the one middleware file, which runs after Nosam's auth and context middleware |
| Remember to load the registry eagerly | Automatic: Nosam loads middleware at startup, so a broken procedure fails the deploy |
| `createProcedures<Env>()` | `Env` comes from Nosam's generated `NosamGeneratedEnvBindings`, so no generic |
| Write an auth provider | `signedIn`, `apiKey`, `session` and `admin` providers built on Nosam's Better Auth, ready to pass to `.auth()` |
| Pick analytics in code | Analytics Engine by default, binding name `ANALYTICS` |
| Route guard script | Build fails if `routes/` has a file without an `// eeao-allow: <reason>` comment |
| `@eeao/http/client` types | Also teaches `nosam/client` the `/rpc/*` paths, so Nosam's typed fetch works (optional) |
| Audit snapshot | `eeao.audit.md` written on `nosam dev` and checked in CI |

### Integration method

Zack asked whether to integrate directly with Vite or some other way. I checked Nosam's docs (the full set ships in `node_modules/nosam/docs/`) for anything plugin-like:

- **Nosam has no plugin, module or extension API.** `nosamPlugin(options)` takes only `persistTo` and `auxiliaryWorkers`. There is no hook to add routes, middleware or bindings from a package. Its first-party add-ons (`nosamReact()`, `nosamVue()`, `nosamMarkdown()`) are themselves plain Vite plugins listed next to `nosamPlugin()`.
- **The public extension points are file conventions and config:** `routes/`, `middleware/` (default-export `defineMiddleware`, loaded eagerly, ordered by numeric prefix), `nosam.config.ts` (`cloudflare` passthrough for extra bindings, `inference.scanDirs`), and Hono middleware.
- **Bindings are inferred only from Nosam's own imports** (`nosam/db`, `nosam/kv`, and so on). Nothing lets a package add one, so the Analytics Engine binding needs a line in `nosam.config.ts`.

So yes, integrate with Vite, because that is how Nosam itself is extended. The recommended shape is **a Vite plugin plus one middleware file**:

1. `eeao()` Vite plugin: finds `procedures/`, builds the registry as a virtual module, fails the build on stray `routes/` files, writes types.
2. `middleware/00.eeao.ts`: a one-line re-export of `@eeao/nosam/middleware`, which imports that virtual module and serves `/rpc` and `/mcp`. Because it sits in Nosam's public `middleware/` folder, Nosam loads it at startup and runs it after its own auth middleware. That gives us the deploy gate and `getUser()` with no private APIs. If the file is missing, the plugin fails the build and says to run `npx eeao init`.

Approaches considered and rejected:

| Approach | Why not |
| --- | --- |
| Edit Nosam's internal route table (`virtual:nosam-routes`) in a `transform` hook | Works with zero files (I spiked it first), but it patches generated code that can change in any Nosam release. One stub file is a small price for staying on public APIs. Kept as a fallback only if VoidZero adds a public hook. |
| Generated route files in `routes/rpc` and `routes/mcp` | Nosam lazy-loads routes, so it needs the middleware file anyway for the deploy gate; three files instead of one. |
| `auxiliaryWorkers` (eeao as a separate Worker) | A second Worker means a second deploy and no shared request context with Nosam auth; it's built for separate API/dashboard Workers. |
| Wait for a Nosam plugin API | Doesn't exist; worth asking VoidZero for, but not worth blocking on. |

### What the spikes proved

Code in [spike-plugin/](spike-plugin/): a 32-line Vite plugin and the one-line middleware, built with Nosam 1.8 and run in Miniflare:

- With **no `routes/` and no registry file**, only the middleware stub, `procedures/whoami.ts` was discovered and served: 200 with a token, 401 without, manifest served.
- An unfinished procedure in `procedures/` stopped the Worker from starting with the registry's error message, so the deploy gate holds.
- The earlier route-table version also worked; it was replaced by the middleware version above.
- One trap found and fixed: discovery must also pick up unfinished builders (`~eeao: 'builder'`), otherwise a procedure that never called `.handler()` silently disappears instead of failing.

Not spiked yet: the Better Auth providers, typed `env`, MCP mount, name-from-path, `nosam/client` types, and the stub's `@eeao/nosam/middleware` re-export (the spike imports the virtual module directly).

### The configuration that is left

- **Analytics Engine binding: one line**, or zero with Nosam's help. Nosam infers bindings from imports (`nosam/kv` creates KV) but has no analytics import, and a Vite plugin can't add bindings to Nosam's config. Short term, `npx eeao init` writes `analytics_engine_datasets` into `nosam.config.ts` once. Long term, ask Nosam to infer it, for example from an `nosam/analytics` import; then this line disappears.
- **Auth**: zero if the app already enables Nosam auth. eeao doesn't turn it on for you, because adding auth tables is a schema change the developer should see.
- **MCP server name and version**: default to `package.json` `name` and `version`.

### Risks

- **Middleware order.** Nosam runs app middleware in numeric-prefix order, and eeao's middleware answers `/rpc` and `/mcp` itself without calling the next one. So its prefix is a choice: app middleware that should wrap API calls (request logging, rate limits) needs a lower number, and middleware that must not gate the API (such as `basicAuth`) needs a higher one. `npx eeao init` picks a prefix after reading the existing `middleware/` folder and says why. Nosam's own auth and context setup always runs before any app middleware, so `getUser()` works either way.
- **Nosam is one month old.** Pin `nosam` to a minor version and run the Miniflare spike as a CI test so a Nosam change that breaks loading or mounting shows up as a failed build.

### Build order

1. `@eeao/nosam`: the Vite plugin (discovery, registry, route guard, missing-stub check) and `@eeao/nosam/middleware` (the spike, hardened, with tests against Nosam's dev server and build).
2. Better Auth providers and typed `env` (needs a spike with Nosam auth enabled on D1).
3. MCP mount and `package.json` defaults.
4. `npx eeao init` (adds the plugin, writes the middleware stub and the Analytics Engine line, creates `procedures/`).
5. Port the contacts example to `examples/contacts-nosam` with D1 and Better Auth.
6. Optional: `nosam/client` route types, audit file on `nosam dev`.
7. Open the upstream asks with VoidZero: a public way for a Vite plugin to register middleware and bindings, which would remove the stub file and the config line.

Unchanged: `@eeao/core`, `@eeao/http`, `@eeao/mcp`, `@eeao/ai`, `@eeao/analytics`, `@eeao/cli`. One small core addition: a procedure without a name, named by whoever registers it.

Rough size (a guess, not measured): about a week for steps 1 to 5.

## Conflicts with earlier decisions

**Output required.** No conflict. Nosam has no output validation, so eeao keeps doing it. The conflict is with Nosam's plain routes, which have no output schema at all; the plugin's route guard handles that.

**Workers Analytics Engine.** No conflict on direct Cloudflare deploys; the binding passes through (verified in the build). Unverified on a self-hosted Nosam platform: the docs say the `cloudflare` block is for "direct Cloudflare builds and deployment", so platform deploys may drop custom bindings. If they do, the PostHog provider is the fallback, which is already built. Decide this only if Zack plans to use a Nosam platform.

**CLI API tokens.** Still bearer tokens through the same auth provider, but the token store moves. Today tokens are a JSON map in vars (TS) or sha256 hashes in KV (Rust). With Nosam the natural home is the Better Auth API key plugin, which stores hashed keys in D1, supports expiry and revocation, and lets users create their own keys. The CLI keeps sending `Authorization: Bearer`; the plugin's key header has to be configured to read it. Recommendation: switch to Better Auth keys in the Nosam version and keep `bearerAuth({ verify })` for apps that don't use Nosam.

**No `nodejs_compat`, Web APIs only.** Mostly holds. Nosam needs `nodejs_als` (AsyncLocalStorage only), and Better Auth and Drizzle come along as dependencies, so the Worker bundle grows. In the spike (no MCP, no auth) the bundle was about 190 KB for eeao plus Zod and 132 KB of Nosam runtime, before gzip.

**Registry fails `wrangler deploy` with 10021.** True only if the registry loads at startup, which Nosam route files do not. The middleware stub handles this, because Nosam loads middleware at startup. This is the one place where Nosam changes the design, and the plugin enforces it so nobody has to remember.

**Typed client.** Nosam's `nosam/client` fetch only knows about Nosam routes, so it can't see eeao procedures behind a catch-all. Keep `@eeao/http/client`. Generating one Nosam route per procedure would make `nosam/client` work, but it duplicates the client and makes the route guard harder. Not recommended.

## Things to watch

- Nosam is one month old (announced 2026-10-15, at 1.8.0). The route lazy-loading and config passthrough are build details that could change; the spike's Miniflare test should run in CI so we notice.
- MCP through a Nosam route is untested. The handler is plain `fetch`, so it should work, but the session-less Streamable HTTP DELETE and the response streaming need a check.
- OAuth for MCP clients becomes easier with Better Auth's OAuth provider plugin, but that's new scope.

## Sources

- [Cloudflare blog: Deploy with Nosam](https://blog.cloudflare.com/deploy-with-nosam/)
- [Nosam docs](https://void.cloud/guide/) and the copy bundled at `node_modules/nosam/docs/` (server-routing, auth, config, integrations/cloudflare, integrations/hono)
- [Flavio Copes: The complete guide to Nosam](https://flaviocopes.com/nosam/)
