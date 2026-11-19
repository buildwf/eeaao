import { defineConfig } from '@builtbyfriends/bwf/config';
export default defineConfig({
  worker: { compatibility_date: '2026-11-01' },
  cloudflare: {
    name: 'realtime-bwf-spike',
    analytics_engine_datasets: [{ binding: 'ANALYTICS', dataset: 'realtime_spike' }],
    vars: { API_TOKENS: '{"t-alice":{"id":"u-alice","orgId":"o1","role":"admin"}}' },
  },
});
