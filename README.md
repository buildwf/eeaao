# eeaao

A procedure builder for Cloudflare Workers. Each procedure has to decide nine things before it compiles: authentication, authorization, input, output, errors, analytics, MCP, CLI and AI tool exposure. Skipping one isn't possible by accident, and opting out takes a written reason.

That makes it a good fit for code written by AI agents, because every choice shows up in review.

The TypeScript implementation lives in [`typescript/`](typescript/README.md). It has the builder, an HTTP handler, MCP, AI tools, analytics, a CLI, a Durable Object data layer and live queries.

## Works with Void

[Void](https://void.cloud) (npm package `void`, from VoidZero) is a framework for Cloudflare Workers built on Vite. `@eeao/void` is the one package that knows about it. Nothing else here imports Void, and a test keeps it that way.

`@eeao/void` gives a Void app:

- a Vite plugin that finds your procedures in `src/procedures/`, builds the registry and fails the build when a plain Void route skips the nine decisions
- one middleware file that serves `/rpc`, `/mcp` and the AI tool endpoints
- live queries over Void's live streams, and the hookup for `@eeao/data`

It's tested against stock Void 1.10. The demo in [`void/demo`](void/demo/README.md) is a complete Void app, and `npm run demo` there runs every surface against a real dev server. Void needs Node 24.22 or newer.

Forks of Void that rename the package still work. The adapter doesn't import the host package, and it accepts either generated bindings type.

## Try it

```sh
cd typescript
npm install
npm run check
```

## Layout

| Folder | What's in it |
| --- | --- |
| `typescript/` | The packages (`@eeao/*`), examples and tests |
| `void/` | The plan for the Void adapter and a demo Void app |

## License

[MIT](LICENSE)
