import { defineEnv, string, url } from '@builtbyfriends/bwf/env';

// Only the in-app assistant (src/procedures/assistant.ts) uses these.
export default defineEnv({
  ANTHROPIC_API_KEY: string().optional(),
  // The demo points this at a scripted stand-in model (scripts/fake-model.mjs).
  ANTHROPIC_BASE_URL: url().default('https://api.anthropic.com'),
  ANTHROPIC_MODEL: string().default('claude-opus-5-5'),
});
