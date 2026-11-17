import { defineConfig } from 'nosam/config';

export default defineConfig({
  worker: { compatibility_date: '2026-11-01' },
  cloudflare: {
    name: 'eeao-contacts-demo',
    // The one line eeao needs: Nosam can't infer an Analytics Engine binding from an import.
    analytics_engine_datasets: [{ binding: 'ANALYTICS', dataset: 'eeao_contacts_demo' }],
  },
});
