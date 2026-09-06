// MFE_FLIGHTOPS_AUTOMATION_VERSION: 1.0.0
import fs from 'node:fs/promises';
import path from 'node:path';

const ARTIFACTS=path.resolve('artifacts');
const VUELING_STATUS_URL='https://www.vueling.com/es/servicios-vueling/informacion-de-vuelos/estado-de-vuelos';
const AENA_INFO_URL='https://www.aena.es/es/infovuelos.html';

const clean=v=>String(v??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
const upper=v=>clean(v).toUpperCase();
const normalize=v=>upper(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const flightDigits=v=>upper(v).replace(/\s+/g,'');
const airportCode=v=>upper(v).match(/\b([A-Z]{3})\b/)?.[1]||'';
const localDate=v=>String(v||'').slice(0,10);
const localTime=v=>String(v||'').match(/T(\d{2}:\d{2})/)?.[1]||'';

async function ensureArtifacts(){await fs.mkdir(ARTIFACTS,{recursive:true});}
async function snapshot(page,name){await ensureArtifacts();await page.screenshot({path:path.join(ARTIFACTS,`${name}.png`),fullPage:true}).catch(()=>{});await fs.writeFile(path.join(ARTIFACTS,`${name}.html`),await page.content().catch(()=>''),'utf8').catch(()=>{});}
async function acceptCookies(page){
  for(const label of [/aceptar todas/i,/aceptar todo/i,/aceptar/i,/allow all/i,/accept all/i,/continuar sin aceptar/i]){
    const button=page.getByRole('button',{name:label}).first();
    if(await button.isVisible().catch(()=>false)){await button.click({timeout:2500}).catch(()=>{});await page.waitForTimeout(500);break;}
  }
}
async function bodyText(page){return clean(await page.locator('body').innerText({timeout:10000}).catch(()=>''));}
function lines(text=''){return String(text).split(/\r?\n/).map(clean).filter(Boolean);}
function segmentAround(text,needle,radius=1800){
  const raw=String(text||''), n=normalize(needle);
  if(!n)return raw.slice(0,radius*2);
  const norm=normalize(raw), index=norm.indexOf(n);
  if(index<0)return raw.slice(0,radius*2);
  return raw.slice(Math.max(0,index-radius),Math.min(raw.length,index+needle.length+radius));
}
function valueAfterLabel(text,labelPatterns,{maxAhead=3,allowSameLine=true}={}){
  const rows=lines(text);
  for(let i=0;i<rows.length;i++){
    for(const pattern of labelPatterns){
      const match=rows[i].match(pattern);
      if(!match)continue;
      if(allowSameLine){
        const tail=clean(rows[i].slice(match.index+match[0].length).replace(/^[:\-·]+/,'').trim());
        if(tail&&tail!=='--'&&tail!=='-')return tail;
      }
      for(let j=1;j<=maxAhead&&i+j<rows.length;j++){
        const candidate=clean(rows[i+j]);
        if(candidate&&candidate!=='--'&&candidate!=='-'&&!labelPatterns.some(p=>p.test(candidate)))return candidate;
      }
    }
  }
  return '';
}
function timeAfterLabel(text,patterns){
  const value=valueAfterLabel(text,patterns,{maxAhead:4});
  return value.match(/\b([0-2]?\d:[0-5]\d)\b/)?.[1]||'';
}
function compactCode(value,max=18){
  const v=clean(value).replace(/^(?:Nº|NUMERO|NÚMERO)\s*/i,'');
  if(!v||v==='--')return '';
  return v.length<=max?v:v.slice(0,max);
}
function statusFromText(text=''){
  const n=normalize(text);
  const known=[
    ['CANCELADO','Cancelado'],['CANCELLED','Cancelado'],['RETRASADO','Retrasado'],['DELAYED','Retrasado'],
    ['EMBARCANDO','Embarcando'],['BOARDING','Embarcando'],['ULTIMA LLAMADA','Última llamada'],['LAST CALL','Última llamada'],
    ['PUERTA CERRADA','Puerta cerrada'],['GATE CLOSED','Puerta cerrada'],['EN HORA','En hora'],['ON TIME','En hora'],
    ['ATERRIZADO','Aterrizado'],['LANDED','Aterrizado'],['DESPEGADO','Despegado'],['DEPARTED','Despegado']
  ];
  return known.find(([needle])=>n.includes(needle))?.[1]||'';
}
function parseOperationalText(text='',flight={},kind='generic'){
  const seg=segmentAround(text,flight.number||'',2200);
  const terminal=compactCode(valueAfterLabel(seg,[/^terminal\b/i,/\bterminal\b/i],{maxAhead:3}),12);
  const gate=compactCode(valueAfterLabel(seg,[/^puerta(?:\s+de\s+embarque)?\b/i,/^gate\b/i,/\bpuerta\b/i],{maxAhead:3}),12);
  const counters=compactCode(valueAfterLabel(seg,[/^mostradores?(?:\s+de\s+facturaci[oó]n)?\b/i,/^facturaci[oó]n\b/i,/^check[- ]?in(?:\s+counters?)?\b/i],{maxAhead:4}),22);
  const belt=compactCode(valueAfterLabel(seg,[/^cinta(?:\s+(?:de\s+)?(?:maletas|equipajes))?\b/i,/^baggage(?:\s+belt)?\b/i,/^belt\b/i],{maxAhead:4}),14);
  const boardingStart=timeAfterLabel(seg,[/^inicio\b/i,/^embarque(?:\s+inicio)?\b/i,/^boarding(?:\s+starts?)?\b/i]);
  const boardingClose=timeAfterLabel(seg,[/^cierre\b/i,/^embarque\s+cierre\b/i,/^boarding\s+closes?\b/i,/^boarding\s+close\b/i]);
  const scheduledDeparture=timeAfterLabel(seg,[/^salida\b/i,/^hora\s+salida\b/i,/^departure\b/i])||localTime(flight.departure);
  const scheduledArrival=timeAfterLabel(seg,[/^llegada\b/i,/^hora\s+llegada\b/i,/^arrival\b/i])||localTime(flight.arrival);
  return {found:normalize(seg).includes(normalize(flight.number||'')),status:statusFromText(seg),terminal,gate,checkInCounters:counters,baggageBelt:belt,boardingStart,boardingClose,scheduledDeparture,scheduledArrival,kind,rawSegment:seg.slice(0,5000)};
}
async function tryFill(locator,value){
  if(!value)return false;
  if(await locator.count().catch(()=>0)<1)return false;
  const el=locator.first();if(!await el.isVisible().catch(()=>false))return false;
  try{await el.fill(String(value));return true;}catch{return false;}
}
async function fillDateLike(locator,date){
  if(!date)return false;
  if(await locator.count().catch(()=>0)<1)return false;
  const el=locator.first();if(!await el.isVisible().catch(()=>false))return false;
  const [y,m,d]=date.split('-');
  for(const value of [date,`${d}/${m}/${y}`,`${d}-${m}-${y}`]){
    try{await el.fill(value);return true;}catch{}
  }
  return false;
}
async function submitLikelySearch(page){
  const candidates=[
    page.getByRole('button',{name:/buscar|consultar|ver vuelo|estado del vuelo|search|consult/i}),
    page.locator('button[type="submit"]'),page.locator('input[type="submit"]')
  ];
  for(const loc of candidates){const btn=loc.first();if(await btn.isVisible().catch(()=>false)){await btn.click({timeout:4000}).catch(()=>{});await page.waitForTimeout(2600);return true;}}
  return false;
}
async function fillGenericFlightSearch(page,flight){
  const number=flight.number,date=localDate(flight.date||flight.departure);
  const flightInputs=[
    page.getByLabel(/n[uú]mero.*vuelo|vuelo|flight number/i),
    page.locator('input[placeholder*="vuelo" i],input[placeholder*="flight" i],input[name*="flight" i],input[id*="flight" i],input[name*="vuelo" i],input[id*="vuelo" i]')
  ];
  let filled=false;for(const loc of flightInputs){if(await tryFill(loc,number)){filled=true;break;}}
  const dateInputs=[page.getByLabel(/fecha|date/i),page.locator('input[type="date"],input[placeholder*="fecha" i],input[name*="date" i],input[id*="date" i],input[name*="fecha" i],input[id*="fecha" i]')];
  for(const loc of dateInputs){if(await fillDateLike(loc,date))break;}
  if(filled)await submitLikelySearch(page);
  return filled;
}
async function openPage(browser,url,name){
  const context=await browser.newContext({locale:'es-ES',timezoneId:'Europe/Madrid',viewport:{width:1440,height:1200},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'});
  const page=await context.newPage();
  try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});await acceptCookies(page);await page.waitForTimeout(1800);return {context,page};}
  catch(error){await context.close();throw error;}
}
async function queryAena(browser,flight,mode='departure'){
  const origin=airportCode(flight.origin||flight.from),destination=airportCode(flight.destination||flight.to);
  const airport=mode==='departure'?origin:destination;
  if(!airport)return {ok:false,source:'Aena',mode,error:'Código de aeropuerto no disponible'};
  const param=mode==='departure'?'origin':'destination';
  const url=`${AENA_INFO_URL}?Buscar=Buscar&accion=Inicio&${param}=${encodeURIComponent(airport)}`;
  let opened;
  try{
    opened=await openPage(browser,url,`aena-${mode}-${flightDigits(flight.number)}`);const {context,page}=opened;
    let text=await bodyText(page);
    if(!normalize(text).includes(normalize(flight.number||''))){await fillGenericFlightSearch(page,flight);text=await bodyText(page);}
    const parsed=parseOperationalText(text,flight,`aena-${mode}`);
    await snapshot(page,`flightops-aena-${mode}-${flightDigits(flight.number)}`);
    await context.close();
    return {ok:true,source:'Aena',mode,url,...parsed};
  }catch(error){await opened?.context?.close().catch(()=>{});return {ok:false,source:'Aena',mode,url,error:error?.message||String(error)};}
}
async function queryVueling(browser,flight){
  let opened;
  try{
    opened=await openPage(browser,VUELING_STATUS_URL,`vueling-${flightDigits(flight.number)}`);const {context,page}=opened;
    let text=await bodyText(page);
    if(!normalize(text).includes(normalize(flight.number||''))||!statusFromText(segmentAround(text,flight.number||''))){await fillGenericFlightSearch(page,flight);text=await bodyText(page);}
    const parsed=parseOperationalText(text,flight,'vueling');
    await snapshot(page,`flightops-vueling-${flightDigits(flight.number)}`);
    await context.close();
    return {ok:true,source:'Vueling',mode:'flight-status',url:VUELING_STATUS_URL,...parsed};
  }catch(error){await opened?.context?.close().catch(()=>{});return {ok:false,source:'Vueling',mode:'flight-status',url:VUELING_STATUS_URL,error:error?.message||String(error)};}
}
function choose(primary,secondary,key){return clean(primary?.[key])||clean(secondary?.[key])||'';}
function sameValue(a,b){return Boolean(clean(a)&&clean(b)&&normalize(a)===normalize(b));}
function mergeFlight(flight,aenaDeparture,aenaArrival,vueling){
  const dep=aenaDeparture||{},arr=aenaArrival||{},v=vueling||{};
  const status=choose(dep,v,'status')||choose(arr,v,'status');
  const terminal=choose(dep,v,'terminal');
  const gate=choose(dep,v,'gate');
  const checkInCounters=choose(dep,v,'checkInCounters');
  const baggageBelt=choose(arr,v,'baggageBelt');
  const boardingStart=choose(v,dep,'boardingStart');
  const boardingClose=choose(v,dep,'boardingClose');
  const scheduledDeparture=choose(v,dep,'scheduledDeparture')||localTime(flight.departure);
  const scheduledArrival=choose(v,arr,'scheduledArrival')||localTime(flight.arrival);
  const sources=[dep,arr,v].filter(x=>x?.ok).map(x=>({name:x.source,mode:x.mode,found:Boolean(x.found),url:x.url,error:x.error||''}));
  const confirmations=[];
  if(sameValue(dep.gate,v.gate))confirmations.push('gate');
  if(sameValue(dep.terminal,v.terminal))confirmations.push('terminal');
  if(sameValue(dep.status,v.status))confirmations.push('status');
  return {
    id:String(flight.id||flight.number||''),number:String(flight.number||''),date:localDate(flight.date||flight.departure),origin:airportCode(flight.origin||flight.from),destination:airportCode(flight.destination||flight.to),
    departure:flight.departure||'',arrival:flight.arrival||'',status,terminal,gate,checkInCounters,baggageBelt,boardingStart,boardingClose,scheduledDeparture,scheduledArrival,
    confirmations,sources,hasOperationalData:Boolean(status||terminal||gate||checkInCounters||baggageBelt||boardingStart||boardingClose)
  };
}
export async function monitorFlightOps(browser,config={}){
  const flights=(Array.isArray(config.flights)?config.flights:[]).filter(f=>f?.number&&f?.departure);
  if(!flights.length)throw new Error('No hay vuelos configurados para seguimiento operativo.');
  const results=[];
  for(const flight of flights){
    const [dep,arr,vueling]=await Promise.all([queryAena(browser,flight,'departure'),queryAena(browser,flight,'arrival'),queryVueling(browser,flight)]);
    results.push(mergeFlight(flight,dep,arr,vueling));
  }
  return {ok:true,status:'ok',checkedAt:new Date().toISOString(),source:'Aena + Vueling · GitHub Actions + Playwright',flights:results};
}

export const __flightOpsTest={parseOperationalText,statusFromText,valueAfterLabel,mergeFlight,airportCode};
