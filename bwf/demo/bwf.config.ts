import { defineConfig } from '@builtbyfriends/bwf/config';

export default defineConfig({
  worker: { compatibility_date: '2026-11-01' },
  cloudflare: {
    name: 'realtime-contacts-demo',
    // The one line realtime needs: bwf can't infer an Analytics Engine binding from an import.
    analytics_engine_datasets: [{ binding: 'ANALYTICS', dataset: 'realtime_contacts_demo' }],
  },
});
