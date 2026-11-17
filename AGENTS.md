# eeaao

Notes for agents that work in this repository.

## Writing for people

Zack's preference (2026-11-17) for text that people read: pages, docs, pull request descriptions, replies, and prompts for other agents.

- Use plain STE100 English with contractions.
- Leave out AI jargon and cheesy or inspirational phrasing.
- Stay away from rules, laws and absolutes, such as "every", "always", "never" and "the four rules". Zack calls this a common AI trap. Describe how things tend to work.
- Keep it high level and friendly, with enough technical detail to hold a reader.

This is about tone in writing. It doesn't loosen the working constraints in this file.

## The product and our own setup

This repository is part of the product. It's what people get for the apps they build, so it takes an app as input and doesn't know which app it is. dedworc is one of those apps, and the first one. The things only dedworc needs as that first user are our own setup, and they live in the dedworc repository.

So dedworc uses the product, and the product doesn't use, import or name anything from our own setup. `typescript/packages/core/test/product-names.test.ts` checks this by failing when a tracked file here contains the app's name. A deliberate mention, such as this section, goes in the test's `allowed` list with a reason.

The full explanation is `docs/scopes.md` in the dedworc repository (https://github.com/buildwf/dedworc/blob/main/docs/scopes.md). The page for people is https://claude.ai/artifact/B6rVb55NfCuUenLokzrp6c.
