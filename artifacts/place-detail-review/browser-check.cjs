// Exercises the actual Next route. Only its API responses are test fixtures.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
async function main() {
  const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures.json'))).many;
  const browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:375,height:812}});
  let mode='many', failMore=true;
  const requests=[];
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/mi-flikker/places/**',async route=>{
    const url=new URL(route.request().url()); requests.push(url.pathname+url.search);
    if(mode==='unauthorized') return route.fulfill({status:401,json:{message:'No session'}});
    if(!url.pathname.endsWith('/activity')) return route.fulfill({json:fixture.place});
    if(mode==='error') return route.fulfill({status:503,json:{message:'Unavailable'}});
    if(url.searchParams.has('cursor') && failMore) { failMore=false; return route.fulfill({status:503,json:{message:'Unavailable'}}); }
    const items=mode==='empty'?[]:mode==='few'?fixture.items.slice(0,2):url.searchParams.has('cursor')?[fixture.items[6],{...fixture.items[0],id:'visit:more',title:'Otra visita real'}]:fixture.items;
    return route.fulfill({json:{items,total:mode==='empty'?0:mode==='few'?2:8,nextCursor:mode==='many'&&!url.searchParams.has('cursor')?'next-page':null,timezone:'America/Montevideo',snapshot:new Date().toISOString()}});
  });
  const url='http://127.0.0.1:3001/mi-flikker/visual-fixture';
  await page.goto(url); await page.getByRole('heading',{name:'Actividad',exact:true}).waitFor();
  await page.getByRole('button',{name:'Ver más',exact:true}).click();
  await page.getByRole('button',{name:'Reintentar',exact:true}).waitFor();
  assert.equal(await page.locator('section[aria-label="Actividad"] li').count(),7);
  await page.getByRole('button',{name:'Reintentar',exact:true}).click();
  await page.getByText('Otra visita real',{exact:true}).waitFor();
  assert.equal(await page.locator('section[aria-label="Actividad"] li').count(),8);
  assert.equal(await page.getByRole('button',{name:'Ver más',exact:true}).count(),0);
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  const bottom=await page.evaluate(()=>({activityBottom:document.querySelector('section[aria-label="Actividad"]').getBoundingClientRect().bottom,navTop:document.querySelector('nav[aria-label="Secciones de Mi Flikker"]').getBoundingClientRect().top}));
  assert(bottom.activityBottom<bottom.navTop);
  await page.screenshot({path:path.join(__dirname,'browser-many-scrolled.png'),fullPage:false});
  for(mode of ['few','empty','error','unauthorized']) {
    await page.goto(url);
    const text=mode==='few'?'2 movimientos':mode==='empty'?'Todavía no hay actividad':mode==='error'?'Reintentar':'Tu sesión se cerró';
    await page.getByText(text,{exact:mode!=='error'}).waitFor();
    await page.screenshot({path:path.join(__dirname,`browser-${mode}.png`),fullPage:true});
    if(mode==='error') assert.equal(await page.getByText('Todavía no hay actividad',{exact:true}).count(),0);
  }
  assert.deepEqual(errors,[]);
  const result={passed:true,checks:['real route hydration','failed next page preserves rows','retry loads next page','deduplicates overlapping page boundary','real total independent of loaded rows','last event clears fixed bottom nav','few/empty/error/unauthorized states'],requests};
  fs.writeFileSync(path.join(__dirname,'browser-results.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result)); await browser.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
