/** Run from repo root: node apps/api/node_modules/ts-node/dist/bin.js --project apps/api/tsconfig.json apps/api/scripts/preview-owner-emails.ts */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  renderWelcomeEmail,
  renderWeeklyProductEmail,
} from '../src/jobs/owner-product-email-templates';

const output = resolve('artifacts/owner-emails');
mkdirSync(output, { recursive: true });
const welcome = renderWelcomeEmail({ businessName: 'Café de la esquina' });
const weekly = renderWeeklyProductEmail({
  businessName: 'Café de la esquina',
  report: {
    week_range: '21–27 sep 2026',
    active_customers: 42,
    returning_customers: 18,
    total_interactions: 68,
    new_customers: 12,
    recurring_customers: 9,
    top_benefit_name: 'Café de regalo',
    top_benefit_redemptions: 7,
    best_day_name: 'vie',
    best_day_count: 20,
    days: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map(
      (name, index) => ({ name, count: [5, 7, 8, 9, 20, 12, 7][index] }),
    ),
  },
});
writeFileSync(resolve(output, 'bienvenido.html'), welcome.html);
writeFileSync(resolve(output, 'tu-semana.html'), weekly.html);
console.log(`Previews (datos de ejemplo): ${output}`);
