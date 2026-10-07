// Real Next UI with explicit API fixtures; no fixture routes or product data writes.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base='http://127.0.0.1:3001';
const makePlace=(id,name,color,progress,target,reward=false)=>({businessId:id,businessName:name,logoUrl:id==='flikker'?'/flikker-wordmark.svg':null,primaryColor:color,loyaltyCardColor:color,loyaltyCardTextColor:null,loyaltyCardBackgroundImage:null,loyaltyStampAreaColor:null,loyaltyStampColor:null,loyaltyStampIcon:'utensils',loyaltyShowBusinessName:true,loyaltyStampBackgroundPattern:null,loyaltyStampBackgroundOpacity:null,visitsTotal:progress,lastVisitAt:null,rewardGoal:target?{incentiveName:'Un premio real',progressVisits:progress,targetAdditionalVisits:target,remainingVisits:target-progress}:null,benefitAvailable:reward?{name:'Cappuccino gratis',code:'fixture-code',expiresAt:null}:null,otherBenefits:[]});
const places=[makePlace('bar','Bar Fraternidad','#F08027',3,6),makePlace('bruno','Cafetería Bruno','#7056F5',2,5),makePlace('fabri','Cafetería Fabri','#9E1752',2,5),makePlace('clinic','Clínica Demo Flikker','#FFFFFF',0,0),makePlace('flikker','Flikker','#6348E7',5,0,true)];
const date=new Date();date.setUTCDate(date.getUTCDate()+4);
const challenge={kind:'return_challenge',businessId:'bruno',businessName:'Cafetería Bruno',logoUrl:null,challengeId:'real-challenge',timezone:'America/Montevideo',deadlineDayKey:date.toISOString().slice(0,10)};
const reward={participationId:'available',businessId:'flikker',businessName:'Flikker',businessLogo:'/flikker-wordmark.svg',benefitTitle:'Cappuccino gratis',status:'AVAILABLE',redemptionCode:'fixture',expiresAt:null,redeemedAt:null,source:'REWARD_GOAL',href:'/beneficio/available'};
const rewards=[reward,{...reward,participationId:'redeemed',status:'REDEEMED',benefitTitle:'Una merienda',redemptionCode:null,redeemedAt:'2026-08-09T12:00:00Z'},{...reward,participationId:'expired',status:'EXPIRED',benefitTitle:'Un café',redemptionCode:null,expiresAt:'2026-08-02T12:00:00Z'}];
async function main(){
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:375,height:812}});
  await context.addCookies([{name:'flk_account',value:'visual-fixture',url:base}]);
  const page=await context.newPage();let mode='normal';let logoutCalls=0;let rewardFails=false;
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/mi-flikker/**',route=>{
    const endpoint=new URL(route.request().url()).pathname.split('/').at(-1);
    if(endpoint==='logout'){logoutCalls++;return route.fulfill({json:{ok:true}});}
    if(endpoint==='rewards'&&rewardFails)return route.fulfill({status:503,json:{message:'Unavailable'}});
    let value;
    if(endpoint==='places')value=mode==='empty'?[]:mode==='long'?Array.from({length:12},(_,i)=>({...places[i%5],businessId:'place-'+i,businessName:'Un negocio con un nombre muy largo para comprobar el pase '+i})):places;
    if(endpoint==='challenges')value=mode==='empty'?[]:mode==='long'?Array.from({length:6},(_,i)=>({...challenge,challengeId:'c'+i,businessId:'b'+i,businessName:'Un local con un nombre largo '+i})): [challenge];
    if(endpoint==='rewards')value=mode==='empty'?[]:mode==='long'?Array.from({length:9},(_,i)=>({...rewards[i%3],participationId:'p'+i,benefitTitle:'Una recompensa con un nombre extenso que debe acomodarse dentro de su tarjeta '+i})):rewards;
    if(endpoint==='account')value={name:mode==='long'?'Valentina con un nombre muy largo para probar la tarjeta':'Fabrizio',phone:'+59891624988'};
    return route.fulfill({json:value??{}});
  });
  const checks=[];
  for(mode of ['normal','empty','long'])for(const tab of ['lugares','desafios','premios','cuenta']){
    await page.goto(base+'/mi-flikker'+(tab==='lugares'?'':'?tab='+tab));
    await page.locator(`[data-tab="${tab}"][data-active="true"]`).waitFor();
    if(tab==='cuenta')await page.getByText('+598 91 624 988',{exact:true}).waitFor();
    else if(tab==='desafios')await page.getByText(mode==='empty'?'No tenés desafíos activos':'Desafío de vuelta',{exact:true}).first().waitFor();
    else if(tab==='premios')await page.getByText(mode==='empty'?'No tenés premios disponibles':'Ver premio',{exact:true}).first().waitFor();
    else await page.getByText(mode==='empty'?'Todavía no tenés lugares':mode==='normal'?'Bar Fraternidad':'Un negocio con un nombre muy largo para comprobar el pase 0',{exact:true}).waitFor();
    await page.addStyleTag({content:'nextjs-portal{display:none !important}'});
    await page.evaluate(()=>document.fonts.ready);
    for(const width of [320,375,390,430]){
      await page.setViewportSize({width,height:812});await page.evaluate(()=>scrollTo(0,0));
      const layout=await page.evaluate(()=>({viewport:innerWidth,content:document.documentElement.scrollWidth,active:document.querySelector('[data-active="true"]')?.getAttribute('data-tab'),pill:getComputedStyle(document.querySelector('[data-active="true"]')).backgroundColor}));
      assert.equal(layout.viewport,layout.content);assert.equal(layout.active,tab);assert.equal(layout.pill,'rgb(255, 255, 255)');
      await page.screenshot({path:path.join(__dirname,`${mode}-${tab}-${width}.png`),fullPage:false});
      checks.push({mode,tab,width,...layout});
    }
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
    const clears=await page.evaluate(()=>{
      const target=document.querySelector('[data-place-pass]:last-child') || document.querySelector('button');
      const candidates=document.querySelectorAll('[data-place-pass], [data-reward-status], article, button');
      const last=candidates[candidates.length-1]||target;
      return !last || last.getBoundingClientRect().bottom < document.querySelector('nav ul').getBoundingClientRect().top;
    });assert(clears,'Last content obscured: '+mode+' '+tab);
  }
  mode='normal';await page.goto(base+'/mi-flikker');
  await page.locator('[data-tab="premios"]').click();await page.getByText('Ver premio',{exact:true}).waitFor();assert(page.url().endsWith('?tab=premios'));
  await page.locator('[data-tab="cuenta"]').click();await page.getByText('+598 91 624 988',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByRole('button',{name:'Enviar código',exact:true}).waitFor();assert.equal(logoutCalls,1);
  rewardFails=true;await page.goto(base+'/mi-flikker?tab=premios');await page.getByRole('button',{name:'Reintentar',exact:true}).waitFor();assert.equal(await page.getByText('No tenés premios disponibles',{exact:true}).count(),0);
  rewardFails=false;await page.getByRole('button',{name:'Reintentar',exact:true}).click();await page.getByText('Ver premio',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(__dirname,'visual-results.json'),JSON.stringify({passed:true,checks,navigation:true,logout:true,errorRetry:true},null,2));
  const html=`<!doctype html><html lang="es"><meta charset="utf-8"><title>Mi Flikker · revisión visual</title><style>body{margin:0;background:#D8D7DE;font:14px Arial;padding:32px}.grid{display:grid;grid-template-columns:repeat(4,minmax(240px,1fr));gap:28px}.screen img{width:100%;border-radius:24px;box-shadow:0 18px 30px #19191f18}.screen p{margin-bottom:12px;color:#333}h1{font-size:18px} @media(max-width:1000px){.grid{grid-template-columns:repeat(2,1fr)}}</style><h1>Mi Flikker · fixtures de revisión, componentes reales</h1><div class="grid">${['lugares','desafios','premios','cuenta'].map((tab,i)=>`<div class="screen"><p>${i+1} · ${tab}</p><img src="normal-${tab}-375.png" alt="${tab}"></div>`).join('')}</div></html>`;
  fs.writeFileSync(path.join(__dirname,'comparison.html'),html);
  await page.setViewportSize({width:1560,height:1050});await page.goto('file:///'+path.join(__dirname,'comparison.html').replaceAll('\\','/'));await page.screenshot({path:path.join(__dirname,'comparison.png'),fullPage:true});
  await browser.close();console.log('Passed '+checks.length+' viewport checks, navigation, logout and retry');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
