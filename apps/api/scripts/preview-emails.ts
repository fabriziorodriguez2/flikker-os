import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildEmailPreviewCatalog } from '../src/jobs/email-preview-catalog';
import { escapeHtml } from '../src/jobs/email-design-system';

const outputDirectory = resolve(
  process.cwd(),
  process.argv[2] ?? '.email-previews',
);
mkdirSync(outputDirectory, { recursive: true });

const previews = buildEmailPreviewCatalog();
for (const preview of previews) {
  writeFileSync(
    resolve(outputDirectory, `${preview.slug}.html`),
    preview.html,
    'utf8',
  );
}

const cards = previews
  .map(
    (preview) => `<article>
      <div class="meta"><span>${escapeHtml(preview.family)}</span><strong>${escapeHtml(preview.name)}</strong><small>${escapeHtml(preview.subject)}</small></div>
      <iframe title="${escapeHtml(preview.name)}" src="./${preview.slug}.html"></iframe>
    </article>`,
  )
  .join('');

writeFileSync(
  resolve(outputDirectory, 'index.html'),
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flikker · Email previews</title><style>
  *{box-sizing:border-box}body{margin:0;background:#ececf3;color:#17162e;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif}header{padding:32px;position:sticky;top:0;z-index:2;background:rgba(236,236,243,.94);border-bottom:1px solid #d9dae5}h1{margin:0 0 6px;font-size:26px}p{margin:0;color:#686a7d}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(560px,1fr));gap:24px;padding:24px}article{overflow:hidden;background:#fff;border:1px solid #d9dae5;border-radius:14px}.meta{display:grid;gap:5px;padding:16px 18px;border-bottom:1px solid #e5e7ef}.meta span{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#5c6bc0}.meta small{color:#686a7d}iframe{display:block;width:100%;height:820px;border:0;background:#f5f6fa}@media(max-width:620px){header{padding:22px}.grid{grid-template-columns:1fr;padding:12px;gap:14px}iframe{height:720px}}
  </style></head><body><header><h1>Emails de Flikker</h1><p>${previews.length} escenarios activos y variantes de estado.</p></header><main class="grid">${cards}</main></body></html>`,
  'utf8',
);

console.log(`Generadas ${previews.length} previews en ${outputDirectory}`);
