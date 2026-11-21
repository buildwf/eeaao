import { defineEnv, string, url } from '@builtbyfriends/bwf/env';

export default defineEnv({
  ANTHROPIC_API_KEY: string().optional(),
  // Decision: the demo points this at a scripted stand-in model (scripts/fake-model.mjs), so it runs without an API key.
  ANTHROPIC_BASE_URL: url().default('https://api.anthropic.com'),
  ANTHROPIC_MODEL: string().default('claude-opus-5-5'),
});
