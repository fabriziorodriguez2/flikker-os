import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildEmailPreviewCatalog,
  buildProductEmailPreviewCatalog,
} from '../src/jobs/email-preview-catalog';
import { escapeHtml } from '../src/jobs/email-design-system';

const outputDirectory = resolve(
  process.cwd(),
  process.argv[2] ?? '.email-previews',
);
mkdirSync(outputDirectory, { recursive: true });
mkdirSync(resolve(outputDirectory, 'assets'), { recursive: true });
for (const asset of ['flikker-email-logo.png', 'flikker-wordmark.svg']) {
  copyFileSync(
    resolve(__dirname, '../../web/public', asset),
    resolve(outputDirectory, 'assets', asset),
  );
}

const previews = buildEmailPreviewCatalog();
for (const preview of previews) {
  writeFileSync(
    resolve(outputDirectory, `${preview.slug}.html`),
    preview.html.replace(
      /src="https?:\/\/[^"]+\/(flikker-email-logo\.png|flikker-wordmark\.svg)"/g,
      'src="./assets/$1"',
    ),
    'utf8',
  );
  if (preview.text) {
    writeFileSync(
      resolve(outputDirectory, `${preview.slug}.txt`),
      preview.text,
      'utf8',
    );
  }
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
  </style></head><body><header><h1>Emails de Flikker</h1><p>${previews.length} escenarios activos y variantes de estado. <a href="./product-family.html">Comparar confirmación, bienvenida y resumen semanal</a></p></header><main class="grid">${cards}</main></body></html>`,
  'utf8',
);

const comparisonCards = buildProductEmailPreviewCatalog()
  .map(
    (preview) =>
      `<article><div class="meta"><strong>${escapeHtml(preview.name)}</strong>${preview.text ? `<a href="./${preview.slug}.txt">Plain text</a>` : '<span>Referencia visual</span>'}</div><iframe title="${escapeHtml(preview.name)}" src="./${preview.slug}.html"></iframe></article>`,
  )
  .join('');
writeFileSync(
  resolve(outputDirectory, 'product-family.html'),
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Flikker · Familia de emails</title><style>
  *{box-sizing:border-box}body{margin:0;background:#ECEAF2;color:#2B2545;font:15px Arial,Helvetica,sans-serif}header{padding:24px}h1{margin:0 0 8px;font-size:24px}p{margin:0 0 16px;color:#686477}nav{display:flex;gap:8px;flex-wrap:wrap}button{padding:10px 16px;border:1px solid #DCD4F5;border-radius:10px;background:white;color:#2B2545;cursor:pointer}button[aria-pressed=true]{background:#7059D9;color:white}main{display:flex;align-items:flex-start;gap:20px;padding:0 24px 24px;overflow:auto}article{flex:0 0 auto;width:var(--preview-width,648px);background:white;border-radius:16px;overflow:hidden}.meta{padding:16px;display:flex;justify-content:space-between;gap:12px;min-height:64px;align-items:center;font-size:13px}.meta a{color:#7059D9}iframe{display:block;width:100%;height:1260px;border:0;background:#F7F6FA}
  </style></head><body><header><h1>Una misma familia de emails</h1><p>Datos de ejemplo. Comparación de las plantillas reales con assets oficiales locales. Desplazá horizontalmente para ver las cuatro.</p><nav aria-label="Ancho de la vista previa"><button data-width="648" aria-pressed="true">Desktop</button><button data-width="320" aria-pressed="false">320 px</button><button data-width="375" aria-pressed="false">375 px</button><button data-width="390" aria-pressed="false">390 px</button></nav></header><main>${comparisonCards}</main><script>document.querySelectorAll('button[data-width]').forEach(button=>button.addEventListener('click',()=>{document.documentElement.style.setProperty('--preview-width',button.dataset.width+'px');document.querySelectorAll('button[data-width]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));}));</script></body></html>`,
  'utf8',
);

console.log(`Generadas ${previews.length} previews en ${outputDirectory}`);
