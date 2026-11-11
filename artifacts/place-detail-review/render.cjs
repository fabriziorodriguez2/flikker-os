// Explicit visual fixtures rendered through the production detail component.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname,'../../apps/web');
require('tsconfig-paths').register({ baseUrl:root, paths:{'@/*':['./*']} });
for (const ext of ['.ts','.tsx']) require.extensions[ext] = (module,filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const { PlaceDetailView } = require(path.join(root,'app/(public)/mi-flikker/[businessId]/place-detail-client.tsx'));
const now = new Date();
const iso = (days,hour) => { const d=new Date(now); d.setUTCDate(d.getUTCDate()-days); d.setUTCHours(hour,0,0,0); return d.toISOString(); };
const place = { businessId:'visual-fixture',businessName:'Bar Fraternidad',logoUrl:null,primaryColor:'#F08027',loyaltyCardColor:'#F08027',loyaltyStampColor:'#F08027',loyaltyStampIcon:'utensils',visitsTotal:2,lastVisitAt:now.toISOString(),rewardGoal:{incentiveName:'1 porción de muzza',progressVisits:3,targetAdditionalVisits:6,remainingVisits:3},benefitAvailable:null,expiredBenefit:null,otherBenefits:[],missions:[],streak:null,returnChallenge:null };
const items = [
  ['VISIT','Registraste una visita','Visitaste Bar Fraternidad',iso(0,14)],
  ['STAMP_EARNED','Sumaste 1 sello','Visitaste Bar Fraternidad',iso(0,12)],
  ['BENEFIT_UNLOCKED','Desbloqueaste un beneficio','1 porción de muzza',iso(1,20)],
  ['BENEFIT_REDEEMED','Canjeaste tu beneficio','1 porción de muzza',iso(40,21)],
  ['MISSION_COMPLETED','Completaste el desafío','Volvé antes de que termine el mes',iso(45,18)],
  ['FEEDBACK_SENT','Enviaste tu opinión','Tu opinión llegó a Bar Fraternidad',iso(50,20)],
  ['BENEFIT_EXPIRED','Venció tu beneficio','1 porción de muzza',iso(58,23)],
].map(([type,title,description,occurredAt],i)=>({id:`fixture:${i}`,type,title,description,occurredAt}));
async function main() {
  const css = await require('postcss')([require('@tailwindcss/postcss')({base:root})]).process(fs.readFileSync(path.join(root,'app/globals.css'),'utf8'),{from:path.join(root,'app/globals.css')});
  const fontFile = path.join(root,'.next/dev/static/media/e8f2fbee2754df70-s.p.0fzkl03jw-sdz.woff2');
  const fontCss = fs.existsSync(fontFile) ? `@font-face{font-family:Montserrat;src:url(data:font/woff2;base64,${fs.readFileSync(fontFile).toString('base64')}) format('woff2');font-weight:100 900} :root{--font-montserrat:Montserrat;--font-syne:Montserrat}` : ':root{--font-montserrat:Arial;--font-syne:Arial}';
  const variants={many:{place,items},few:{place:{...place,rewardGoal:{...place.rewardGoal,progressVisits:1}},items:items.slice(0,2)},empty:{place:{...place,rewardGoal:{...place.rewardGoal,progressVisits:0}},items:[]},long:{place:{...place,businessName:'Un negocio con un nombre muy largo que debe seguir siendo legible',rewardGoal:{...place.rewardGoal,incentiveName:'Una merienda completa para compartir con quien quieras en nuestro local',targetAdditionalVisits:12}},items:items.map(i=>({...i,title:i.title+' con un texto largo que se acomoda',description:(i.description+' ').repeat(3)}))}};
  const browser=await require('playwright').chromium.launch({headless:true}); const page=await browser.newPage();
  fs.writeFileSync(path.join(__dirname,'fixtures.json'),JSON.stringify(variants));
  const checks=[];
  for(const [name,data] of Object.entries(variants)) {
    const component=React.createElement(PlaceDetailView,{place:data.place,brand:'#F08027',activity:{items:data.items,total:data.items.length,nextCursor:null,timezone:'America/Montevideo',snapshot:now.toISOString()}});
    fs.writeFileSync(path.join(__dirname,`${name}.html`),`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css.css}\n${fontCss}</style><body>${renderToStaticMarkup(component)}</body></html>`);
    for(const width of [320,375,390,430]) {
      await page.setViewportSize({width,height:812}); await page.goto('file:///'+path.join(__dirname,`${name}.html`).replaceAll('\\','/'));
      await page.evaluate(()=>document.fonts.ready);
      await page.screenshot({path:path.join(__dirname,`${name}-${width}.png`),fullPage:true});
      const check=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth,activeTab:document.querySelector('[data-active="true"]')?.getAttribute('data-tab'),cardBeforeActivity:document.querySelector('[data-loyalty-layout="compact"]').getBoundingClientRect().top < document.querySelector('section[aria-label="Actividad"]').getBoundingClientRect().top}));
      if(check.content>check.viewport || check.activeTab!=='lugares' || !check.cardBeforeActivity) throw new Error(JSON.stringify(check));
      checks.push({name,width,...check});
    }
  }
  fs.writeFileSync(path.join(__dirname,'visual-results.json'),JSON.stringify(checks,null,2));
  await browser.close(); console.log(`Passed ${checks.length} responsive checks`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
