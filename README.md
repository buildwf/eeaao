# Realtime

Realtime helps you build procedures for Cloudflare Workers. A procedure is one typed function that your app calls. For each procedure, you choose these nine things:

- authentication
- authorization
- input
- output
- errors
- analytics
- MCP
- CLI
- AI tools

The procedure doesn't compile until you choose all nine. To leave one out, you write down why. This makes each choice easy to see in a review.

The packages are named `@eeao/*`. The code is in [`typescript/`](typescript/README.md). It has the builder, an HTTP handler, MCP, AI tools, analytics, a CLI, a Durable Object data layer and live queries.

## Use it with bwf

[bwf](https://github.com/buildwf/platform) builds and deploys apps to Cloudflare Workers. `@eeao/bwf` connects Realtime to a bwf app. It's the only package here that knows about bwf, and a test checks that.

`@eeao/bwf` gives a bwf app:

- a Vite plugin that finds the procedures in `src/procedures/` and stops the build when a bwf route doesn't make the nine choices
- one middleware file that serves `/rpc`, `/mcp` and the AI tool endpoints
- live queries over bwf's live streams, and the link to `@eeao/data`

[`bwf/demo`](bwf/demo/README.md) is a full bwf app. Run `npm run demo` there to try each part against a real dev server. It needs Node.js 24.22 or newer.

## Try it

```sh
cd typescript
npm install
npm run check
```

## Folders

| Folder | What's in it |
| --- | --- |
| `typescript/` | The `@eeao/*` packages, examples and tests |
| `bwf/` | A demo bwf app and test code for the adapter |

## License

[MIT](LICENSE)
