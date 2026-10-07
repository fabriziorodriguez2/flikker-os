// Local visual review of the real React components with explicit fixture data.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '../../apps/web');
require('tsconfig-paths').register({ baseUrl: root, paths: { '@/*': ['./*'] } });
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => {
    let source = fs.readFileSync(filename, 'utf8');
    if (filename.endsWith('checkin-client.tsx') && !source.includes('export function PersonalScreen')) source += '\nexport { PersonalScreen };';
    module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
  };
}
const { PersonalScreen } = require(path.join(root, 'app/(public)/check-in/[token]/checkin-client.tsx'));
const ProgramDesignTab = require(path.join(root, 'app/(panel)/dashboard/programa/program-design-tab.tsx')).default;
const logo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M5 10L20 3l15 7v12c0 7-9 13-15 16C14 35 5 29 5 22Z" fill="none" stroke="#17212a" stroke-width="2"/><path d="M15 12v14m-3-14v8h6v-8m8 0v14m0-14c-5 0-5 10 0 10" fill="none" stroke="#17212a" stroke-width="2"/></svg>');
const business = { businessName: 'Bistró del barrio', logoUrl: logo, primaryColor: '#ED842B', checkinBackgroundColor: null, googleBusinessProfileUrl: null, loyaltyCardColor: '#ED842B', loyaltyCardTextColor: '#171A2B', loyaltyCardBackgroundImage: null, loyaltyStampAreaColor: '#FFFFFF', loyaltyStampColor: '#ED842B', loyaltyStampIcon: 'utensils', loyaltyShowBusinessName: true, loyaltyStampBackgroundPattern: 'none', loyaltyStampBackgroundOpacity: null };
const landing = { business, source: { name: 'Principal', type: 'qr' }, benefit: null, benefitText: null, welcomeMessage: null };
const personal = { customer: { name: 'Valentina Pérez' }, visits: { total: 2, lastAt: null }, benefit: null, rewardGoal: { unlockedNow: false, benefit: null, goal: { incentiveName: 'Una porción de pizza de la casa', progressVisits: 3, targetAdditionalVisits: 6, remainingVisits: 3 } }, reviewPrompt: { show: false, googleUrl: null }, otherBenefits: [], missions: [] };
async function main() {
  const phase = process.argv[2] || 'after';
  const css = await require('postcss')([require('@tailwindcss/postcss')({ base: root })]).process(fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8'), { from: path.join(root, 'app/globals.css') });
  const variants = {
    customer: React.createElement(PersonalScreen, { token: 'visual-fixture', landing, personal, checkinStatus: 'duplicate', onSwitchAccount() {} }),
    counted: React.createElement(PersonalScreen, { token: 'visual-fixture', landing, personal, checkinStatus: 'checked_in', onSwitchAccount() {} }),
    unlocked: React.createElement(PersonalScreen, { token: 'visual-fixture', landing, personal: { ...personal, rewardGoal: { goal: null, unlockedNow: true, benefit: { name: 'Una porción de pizza de la casa', code: 'fixture', expiresAt: null } } }, checkinStatus: 'counted', onSwitchAccount() {} }),
    off: React.createElement(PersonalScreen, { token: 'visual-fixture', landing: { ...landing, business: { ...business, logoUrl: null, loyaltyCardColor: '#173C32' } }, personal: { ...personal, rewardGoal: null }, checkinStatus: 'counted', onSwitchAccount() {} }),
    long: React.createElement(PersonalScreen, { token: 'visual-fixture', landing: { ...landing, business: { ...business, businessName: 'Un negocio con un nombre muy largo para probar el encabezado', loyaltyCardColor: '#173C32', loyaltyCardTextColor: '#FFFFFF', loyaltyStampColor: '#147A5B', loyaltyStampIcon: logo } }, personal: { ...personal, rewardGoal: { ...personal.rewardGoal, goal: { ...personal.rewardGoal.goal, incentiveName: 'Una experiencia de merienda completa para compartir con quien quieras y disfrutar en nuestro local', targetAdditionalVisits: 12 } } }, checkinStatus: 'duplicate', onSwitchAccount() {} }),
    panel: React.createElement(ProgramDesignTab, { appearance: business, businessName: business.businessName, rewardName: personal.rewardGoal.goal.incentiveName, stampsRequired: 6, canMutate: true, async onSave() {} }),
  };
  for (const [name, component] of Object.entries(variants)) {
    fs.writeFileSync(path.join(__dirname, `${phase}-${name}.html`), `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}</style><body>${renderToStaticMarkup(component)}</body></html>`);
  }
  const browser = await require('playwright').chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.route('**/flikker-wordmark.svg', route => route.fulfill({ path: path.join(root, 'public/flikker-wordmark.svg') }));
  for (const name of Object.keys(variants)) {
    for (const width of name === 'panel' ? [1024, 1440] : [320, 375, 390, 430]) {
      await page.setViewportSize({ width, height: name === 'panel' ? 1000 : 812 });
      await page.goto('file:///' + path.join(__dirname, `${phase}-${name}.html`).replaceAll('\\', '/'));
      await page.waitForTimeout(650);
      await page.screenshot({ path: path.join(__dirname, `${phase}-${name}-${width}.png`), fullPage: true });
      console.log(phase, name, width, await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth })));
    }
  }
  await browser.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
