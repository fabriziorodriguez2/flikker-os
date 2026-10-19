/* Local HTML previews only: no API, credentials or outbound email required. */
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('@playwright/test');

const output = resolve(__dirname, '../.email-previews');
const screenshots = resolve(output, 'screenshots');
const scenarios = [
  '01-verificacion-cuenta',
  '16-bienvenida-base',
  '17-bienvenida-pro',
  '18-tu-semana-producto',
];

async function main() {
  mkdirSync(screenshots, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const checks = [];
  try {
    const page = await browser.newPage();
    for (const width of [648, 320, 375, 390]) {
      await page.setViewportSize({ width, height: 900 });
      for (const scenario of scenarios) {
        await page.goto(
          pathToFileURL(resolve(output, `${scenario}.html`)).href,
        );
        const metrics = await page.evaluate(() => {
          const shell = document.querySelector('.email-shell');
          const logo = document.querySelector('img[alt="Flikker"]');
          const cta = [...document.querySelectorAll('a')].find((link) =>
            [
              'Confirmar mi cuenta',
              'Ir a Flikker',
              'Ver todas mis estadísticas',
            ].includes(link.textContent),
          );
          const content = document.querySelector('.email-content');
          const bounds = cta.getBoundingClientRect();
          const style = getComputedStyle(content);
          return {
            viewport: innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            shellWidth: shell.getBoundingClientRect().width,
            logoLoaded: logo.complete && logo.naturalWidth > 0,
            ctaWidth: bounds.width,
            ctaHeight: bounds.height,
            contentWidth:
              content.clientWidth -
              parseFloat(style.paddingLeft) -
              parseFloat(style.paddingRight),
            footer: document.body.textContent.includes(
              'Flikker · Más motivos para volver.',
            ),
          };
        });
        assert(
          metrics.documentWidth <= width,
          `${scenario} overflows at ${width}px`,
        );
        assert(
          metrics.shellWidth <= 600,
          `${scenario} exceeds the shared 600px shell`,
        );
        assert(metrics.logoLoaded, `${scenario} official logo failed to load`);
        assert(metrics.ctaHeight >= 44, `${scenario} CTA is too short`);
        assert(
          Math.abs(metrics.ctaWidth - metrics.contentWidth) < 2,
          `${scenario} CTA is not full width`,
        );
        assert(metrics.footer, `${scenario} shared footer is missing`);
        checks.push({ scenario, ...metrics });
        await page.screenshot({
          path: resolve(screenshots, `${scenario}-${width}.png`),
          fullPage: true,
        });
      }
    }
    async function fitComparisonFrames() {
      for (const iframe of await page.locator('iframe').elementHandles()) {
        const frame = await iframe.contentFrame();
        await frame.waitForLoadState('load');
        const height = await frame.evaluate(
          () => document.documentElement.scrollHeight,
        );
        await iframe.evaluate((element, frameHeight) => {
          element.style.height = `${frameHeight}px`;
        }, height);
      }
    }
    await page.setViewportSize({ width: 2720, height: 1500 });
    await page.goto(pathToFileURL(resolve(output, 'product-family.html')).href);
    await fitComparisonFrames();
    await page.screenshot({
      path: resolve(screenshots, 'comparacion-desktop.png'),
      fullPage: true,
    });
    for (const width of [320, 375, 390]) {
      await page.setViewportSize({ width: width * 4 + 108, height: 1500 });
      await page.getByRole('button', { name: `${width} px` }).click();
      await fitComparisonFrames();
      await page.screenshot({
        path: resolve(screenshots, `comparacion-${width}.png`),
        fullPage: true,
      });
    }
    writeFileSync(
      resolve(output, 'visual-checks.json'),
      JSON.stringify(checks, null, 2),
    );
    console.log(
      `${checks.length} viewport checks passed; screenshots: ${screenshots}`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
