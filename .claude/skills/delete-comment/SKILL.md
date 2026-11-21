---
name: delete-comment
description: Audit the code comments in this repository, sort each one, delete the ones that don't earn their place, keep decision records, and file issues for hacks the comments excused. Use when asked to clean up comments or when the comment lint fails.
---

# Delete comments

Comments in this repository tend to drift. Some repeat the code, some go stale, and some excuse a shortcut that then gets copied. This skill sorts each comment and acts on it. The `realtime/no-comments` lint rule (`lint/comments.mjs`, configured in `.oxlintrc.json`, run with `bun run lint` in `typescript/`) keeps new ones out.

## What the lint rule allows

- A decision record: a line comment that starts with `Decision:`. Line comments right under it, on their own lines, continue it.
- A tool directive: `@ts-expect-error <why>`, `/// <reference ...>`, `realtime-allow: <why>`, `@vitest-environment`, `oxlint-disable`, and a `#!` line.
- JSDoc (`/** ... */`) on the published API: in `typescript/packages/*/src`, on an export or on a type or interface the published `.d.ts` carries. It's what people see on hover from npm.

Everything else fails, including trailing comments and JSDoc on private helpers. The rule doesn't read Swift or Kotlin, so check `swift/` and `kotlin/` by hand. There, `///` and KDoc on `public` declarations stay as the public API docs.

## Steps

1. Pull main first. Other threads may be working in the same files.
2. List the comments. `bun run lint` (from `typescript/`) lists the TypeScript and JavaScript ones that break the rule. For a full audit, including the allowed ones, parse each tracked file with `oxc-parser` (`parseSync(file, src).comments`) and grep `swift/` and `kotlin/` for `//` and `/*`. Count the lines each own-line comment takes, so you can say how many lines go.
3. Sort each comment into one of these:
   - **Tautology**: it says what the code already shows. Section dividers, numbered step labels and a file header that sums up the file belong here. Delete it.
   - **Stale**: it names code, commands, files or plans that no longer exist (for example `npx realtime init` or `PLAN.md`). Delete it. If the code it describes is also wrong, say so in your report.
   - **Excuse**: it admits a shortcut ("a real app would...", "until X is published", "for now"). Delete it and file a Linear issue (team key DED) that names the file, what the shortcut is, and what done looks like. Write the issue for people, with file details in an "Agent notes" section.
   - **Decision record**: it says why the code is this way, and the reason isn't clear from the code. Keep it, start it with `Decision:`, and say the reason plainly, in one or two lines.
   - **Public API doc**: JSDoc, `///` or KDoc on the published API. Keep it, and take out any stale sentence.
4. Watch for files whose line numbers show up in snapshots. Deleting lines in `typescript/packages/core/type-tests/messages/messages.ts` moves the positions in `messages.expected.txt`: run `bun run test:types -- --update` and check that only positions changed. `bwf/demo/output/failures.txt` quotes line numbers from `bwf/demo/failures/type-mistakes.ts`, so shift them by hand.
5. Keep sample text and decision records app-neutral. The product-names test fails on an app's name.
6. Verify in `typescript/`: `bun run typecheck`, `bun run test`, `bun run test:types` and `bun run lint`.
7. Report the counts per category, the lines removed, the issues filed, and any comment you weren't sure about.

## Writing a decision record

Lead with the decision, then the reason after "so" or "because":

```ts
// Decision: authorization runs after input, so policies can check ownership.
```

Leave out what the next line of code already says. If the reason needs more than about three lines, it likely belongs in `docs/` with a one-line `Decision:` that points there.
