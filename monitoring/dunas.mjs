// MFE_DUNAS_MONITOR_VERSION: 1.4.0
// Browser visit: official booking engine for one Suite Apartments, five adults.
// Never place a booking, and never treat successful navigation as a successful tariff lookup.
import fs from 'node:fs/promises';
const iso=/^\d{4}-\d{2}-\d{2}$/;
const money=/((?:\d{1,3}(?:[.\s]\d{3})*|\d+),\d{2})\s*€/g;
const cash=value=>Number(String(value||'').replace(/\s/g,'').replace(/\./g,'').replace(',','.'))||0;
const normal=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export function quoteUrl(config={}){
 if(!iso.test(config.checkIn||'')||!iso.test(config.checkOut||''))throw Error('Dunas: fechas inválidas.');
 const adults=Number(config.adults)||5, rooms=Number(config.rooms)||1;
 if(adults<1||adults>8||rooms!==1)throw Error('Dunas: este seguimiento es para una suite de 5 adultos (1 habitación).');
 const url=new URL('https://www.hoteldunasclub.es/disponibilidad.html');
 url.searchParams.set('id_hotel','HDCCALEDONIA');url.searchParams.set('start',config.checkIn);url.searchParams.set('end',config.checkOut);
 url.searchParams.set('guests[0][adults]',String(adults));url.hash='monoHotelAvail/EUR';
 return url.toString();
}
// Extract the price rows and their rate descriptions from the actual rendered Keytel DOM.
// This deliberately does not press “Elige habitación”: the price is already displayed.
export function parseVisibleRates(rows=[]){
 const offers=new Map();
 for(const row of rows){
   const text=String(row.text||''); const prices=[...text.matchAll(money)].map(m=>cash(m[1])).filter(v=>v>0&&v<100000);
   const total=Number(row.price)||prices.at(-1)||0;
   if(!total||!Number.isFinite(total))continue;
   const n=normal(text);
   const board=/alojamiento y desayuno|bed\s*(?:&|and)\s*breakfast|desayuno incluido/i.test(n)?'Alojamiento y desayuno':/media pension/i.test(n)?'Media pensión':'Solo alojamiento';
   const cancellable=/cancelaci[oó]n gratuita|cancelacion gratuita|cancelaci[oó]n gratis|free cancellation/i.test(text);
   const nonRefund=/non refund|no reembolsable|no reembols|non-refundable|sin devoluci[oó]n/i.test(n);
   const rate=nonRefund?'No reembolsable':cancellable?'Cancelación gratuita':(row.rate||'Tarifa web');
   const roomName=row.roomName||'Suites Apartments (5 adultos)';
   const key=[roomName,board,rate,total].join('|');
   offers.set(key,{name:`${roomName} · ${board} · ${rate}`,roomName,board,rate,total,verifiedTotal:true,selected:false,source:'Hotel Dunas Club · web oficial'});
 }
 return [...offers.values()].sort((a,b)=>a.total-b.total);
}
async function renderedRows(page){
 return page.evaluate(()=>{
   const rx=/(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}\s*€/;
   const controls=[...document.querySelectorAll('button,a,[role="button"],input[type="button"]')].filter(e=>/elige habitaci[oó]n|elegir habitaci[oó]n/i.test(e.innerText||e.value||''));
   const rows=[];
   for(const button of controls){
     let node=button.parentElement, best=null,score=-1;
     for(let depth=0;node&&depth<6;node=node.parentElement,depth++){
       const text=String(node.innerText||'').trim();
       const matches=[...text.matchAll(/(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}\s*€/g)];
       if(matches.length>=1&&text.length<1100){
         const hasRate=/cancelaci[oó]n|refund|tarifa|alojamiento|desayuno/i.test(text);
         const quality=(hasRate?30:0)+(matches.length<=2?15:0)-depth*2-Math.floor(text.length/200);
         if(quality>score){best=text;score=quality;}
         if(hasRate&&matches.length<=2)break;
       }
     }
     if(best)rows.push({text:best});
   }
   // Some Keytel releases render a list of offers without button elements.
   if(!rows.length){
     const elements=[...document.querySelectorAll('li,article,[class*="rate"],[class*="tariff"],[class*="precio"]')];
     for(const el of elements){const txt=String(el.innerText||'').trim();if(txt.length>25&&txt.length<600&&rx.test(txt)&&/tarifa|cancelaci[oó]n|refund|alojamiento|desayuno|web/i.test(txt))rows.push({text:txt});}
   }
   return rows;
 });
}
export async function monitorDunas(browser,config){
 const url=quoteUrl(config),adults=Number(config.adults)||5,rooms=1;
 const ctx=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1500,height:1100}});
 const page=await ctx.newPage();await fs.mkdir('artifacts/dunas',{recursive:true});
 try{
   await page.goto(url,{waitUntil:'domcontentloaded',timeout:65000});
   await page.waitForTimeout(4000);
   await page.getByRole('button',{name:/Elige habitaci[oó]n/i}).first().waitFor({state:'visible',timeout:28000}).catch(()=>{});
   await page.waitForLoadState('networkidle',{timeout:7000}).catch(()=>{});
   const body=await page.locator('body').innerText({timeout:15000});
   await page.screenshot({path:'artifacts/dunas/tarifas.png',fullPage:true}).catch(()=>{});
   await fs.writeFile('artifacts/dunas/texto-visible.txt',body.slice(0,60000)).catch(()=>{});
   if(!/Dunas Club|Suites? Apartments/i.test(body))throw Error('La web no ha cargado los resultados de Dunas Club.');
   const actualUrl=page.url();
   if(!actualUrl.includes('disponibilidad.html'))throw Error('La búsqueda ha redirigido fuera del motor de disponibilidad: '+actualUrl);
   if(!actualUrl.includes(`start=${config.checkIn}`)||!actualUrl.includes(`end=${config.checkOut}`))throw Error('La página ha cambiado las fechas solicitadas.');
   const rows=await renderedRows(page);
   let offers=parseVisibleRates(rows);
   // A receipt containing 5 adults is required; do not attach a two-person rate to 5 people.
   const occupancy=normal(body.slice(0,3000));
   const matchesOccupancy=/5\s*adultos?\s*[-–·]\s*1\s*hab|5\s*adultos?\s*1\s*habitaci[oó]n|suites? apartments\s*\(5\s*adultos?\)/i.test(occupancy)||/suites? apartments\s*\(5\s*adultos?\)/i.test(normal(body));
   if(!matchesOccupancy)throw Error('Keytel no ha confirmado Suites Apartments para 5 adultos y 1 habitación; no se atribuyen las tarifas.');
   // Ignore prices from alternative rooms if a visible card identifies them.
   offers=offers.filter(x=>!x.roomName||/suite/i.test(x.roomName));
   await fs.writeFile('artifacts/dunas/diagnostico.json',JSON.stringify({url:actualUrl,checkIn:config.checkIn,checkOut:config.checkOut,adults,rooms,occupancyConfirmed:matchesOccupancy,rawRows:rows,offers},null,2));
   if(!offers.length)throw Error('La búsqueda se cargó, pero no se pudieron extraer importes de las tarifas de la suite para 5 adultos. Revisar artifacts/dunas/diagnostico.json.');
   const preferred=offers.find(x=>x.board==='Solo alojamiento'&&x.rate==='Cancelación gratuita')||offers.find(x=>x.board==='Solo alojamiento')||offers[0];
   preferred.selected=true;
   return {ok:true,status:'ok',price:preferred.total,total:preferred.total,offers,source:'Hotel Dunas Club · Keytel · tarifas visibles',rooms,adults,checkIn:config.checkIn,checkOut:config.checkOut,targetRoom:config.targetRoom||'Suites Apartments',targetBoard:config.targetBoard||'Solo alojamiento',url:actualUrl};
 }finally{await ctx.close();}
}
