# Realtime

Notes for agents that work in this repository.

## Writing for people

The preferred style for text that people read: pages, docs, pull request descriptions, replies, and prompts for other agents.

- Use plain STE100 English with contractions.
- Leave out AI jargon and cheesy or inspirational phrasing.
- Stay away from rules, laws and absolutes, such as "every", "always", "never" and "the four rules". It's a common AI trap. Describe how things tend to work.
- Keep it high level and friendly, with enough technical detail to hold a reader.

This is about tone in writing. It doesn't loosen the working constraints in this file.

## Keep the code app-neutral

This repository takes an app as input and doesn't know which app it is. Code, tests, docs and manifests don't name a specific app. `typescript/packages/core/test/product-names.test.ts` checks this and fails when a tracked file contains a name from its list.
