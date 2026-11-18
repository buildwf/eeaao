# eeaao

A procedure builder for Cloudflare Workers. Each procedure has to decide nine things before it compiles: authentication, authorization, input, output, errors, analytics, MCP, CLI and AI tool exposure. Skipping one isn't possible by accident, and opting out takes a written reason.

That makes it a good fit for code written by AI agents, because every choice shows up in review.

The TypeScript implementation lives in [`typescript/`](typescript/README.md). It has the builder, an HTTP handler, MCP, AI tools, analytics, a CLI, a Durable Object data layer and live queries.

## Works with the bwf CLI

[bwf](https://github.com/buildwf/fif-spa) is a framework and CLI for Cloudflare Workers built on Vite. `@eeao/bwf` is the one package here that knows about it. Nothing else imports bwf, and a test keeps it that way.

`@eeao/bwf` gives a bwf app:

- a Vite plugin that finds your procedures in `src/procedures/`, builds the registry and fails the build when a plain bwf route skips the nine decisions
- one middleware file that serves `/rpc`, `/mcp` and the AI tool endpoints
- live queries over bwf's live streams, and the hookup for `@eeao/data`

The demo in [`bwf/demo`](bwf/demo/README.md) is a complete bwf app, and `npm run demo` there runs every surface against a real dev server. It needs Node 24.22 or newer, and the `@buildwf/bwf` package.

The adapter doesn't import the host package, and it accepts the generated bindings type.

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
| `bwf/` | A demo bwf app and spikes for the adapter |

## License

[MIT](LICENSE)
