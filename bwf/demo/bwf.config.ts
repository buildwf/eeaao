import { defineConfig } from '@builtbyfriends/bwf/config';

export default defineConfig({
  worker: { compatibility_date: '2026-11-01' },
  cloudflare: {
    name: 'realtime-contacts-demo',
    // Decision: bwf can't infer an Analytics Engine binding from an import, so realtime needs this one line.
    analytics_engine_datasets: [{ binding: 'ANALYTICS', dataset: 'realtime_contacts_demo' }],
  },
});
