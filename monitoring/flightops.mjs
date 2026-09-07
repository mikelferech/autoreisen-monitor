// MFE_FLIGHTOPS_AUTOMATION_VERSION: 1.0.1
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
  if(!v||v==='--'||v==='-')return '';
  const n=normalize(v);
  // Evita arrastrar la siguiente etiqueta cuando el valor real todavía es "--".
  // Ej.: Terminal -- / Puerta -- nunca puede convertirse en "Terminal: Puerta --".
  if(/^(TERMINAL|PUERTA|GATE|FACTURACION|CHECK.?IN|EMBARQUE|BOARDING|CINTA|BAGGAGE|ESTADO|STATUS|SALIDA|LLEGADA|INICIO|CIERRE)\b/.test(n))return '';
  if(/\b(?:DEL?|DE LA|ESTADO DEL VUELO|INFORMACION|AYUDA)\b/.test(n)&&v.length>8)return '';
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
function monthTokens(month){
  const es=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  const en=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const idx=Math.max(0,Math.min(11,Number(month)-1));return [es[idx],en[idx]];
}
function flightDateSignals(text,flight={}){
  const date=localDate(flight.date||flight.departure);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];
  const [y,m,d]=date.split('-'),shortY=y.slice(-2),day=String(Number(d));
  return [date,`${d}/${m}/${y}`,`${d}-${m}-${y}`,`${d}/${m}/${shortY}`,`${day}/${Number(m)}/${y}`,...monthTokens(m).flatMap(mon=>[`${day} ${mon}`,`${d} ${mon}`,`${day} DE ${mon}`])].map(normalize);
}
function placeSignals(value=''){
  const n=normalize(value),code=airportCode(value),words=n.replace(/\([^)]*\)/g,' ').split(/[^A-Z0-9]+/).filter(w=>w.length>=4&&!['AEROPUERTO','AIRPORT','GRAN'].includes(w));
  return [...new Set([code,...words].filter(Boolean))];
}
function identityEvidence(text='',flight={}){
  const n=normalize(text),number=normalize(flight.number||'');
  const numberMatch=Boolean(number&&n.includes(number));
  const dateMatch=flightDateSignals(text,flight).some(token=>token&&n.includes(token));
  const originSignals=placeSignals(flight.origin||flight.from),destinationSignals=placeSignals(flight.destination||flight.to);
  const originMatch=originSignals.some(token=>token&&n.includes(token));
  const destinationMatch=destinationSignals.some(token=>token&&n.includes(token));
  const depTime=localTime(flight.departure),timeMatch=Boolean(depTime&&n.includes(normalize(depTime)));
  const routePair=originMatch&&destinationMatch;
  const strong=numberMatch&&(dateMatch||routePair||(timeMatch&&(originMatch||destinationMatch)));
  const score=(numberMatch?3:0)+(dateMatch?2:0)+(originMatch?1:0)+(destinationMatch?1:0)+(timeMatch?1:0);
  return {numberMatch,dateMatch,originMatch,destinationMatch,timeMatch,routePair,strong,score};
}
function nearestFlightSegment(text='',flight={},radius=850){
  const raw=String(text||''),number=normalize(flight.number||'');if(!number)return {segment:'',evidence:identityEvidence('',flight)};
  const n=normalize(raw);let from=0,best=null;
  while(true){const index=n.indexOf(number,from);if(index<0)break;const segment=raw.slice(Math.max(0,index-radius),Math.min(raw.length,index+number.length+radius)),evidence=identityEvidence(segment,flight);if(!best||evidence.score>best.evidence.score)best={segment,evidence};from=index+number.length;}
  return best||{segment:'',evidence:identityEvidence('',flight)};
}
function verifiedStatus(segment='',flight={},evidence=identityEvidence(segment,flight)){
  if(!evidence.strong)return {status:'',verified:false};
  const status=statusFromText(segment);if(!status)return {status:'',verified:false};
  // Una cancelación es un dato crítico: además del nº de vuelo exigimos fecha y
  // otra señal operativa (ruta o hora) en el mismo bloque cercano. Así palabras
  // genéricas de ayuda/FAQ nunca pueden cancelar un vuelo en la app.
  if(status==='Cancelado'){
    const strictCancel=evidence.numberMatch&&evidence.dateMatch&&(evidence.routePair||evidence.timeMatch||(evidence.originMatch&&evidence.destinationMatch));
    return {status:strictCancel?status:'',verified:strictCancel};
  }
  return {status,verified:true};
}
function parseOperationalText(text='',flight={},kind='generic'){
  const nearby=nearestFlightSegment(text,flight,850),seg=nearby.segment,evidence=nearby.evidence;
  if(!evidence.strong){
    return {found:Boolean(evidence.numberMatch),identityVerified:false,identityScore:evidence.score,status:'',statusVerified:false,terminal:'',gate:'',checkInCounters:'',baggageBelt:'',boardingStart:'',boardingClose:'',scheduledDeparture:localTime(flight.departure),scheduledArrival:localTime(flight.arrival),kind,rawSegment:seg.slice(0,5000)};
  }
  const terminal=compactCode(valueAfterLabel(seg,[/^terminal\b/i,/\bterminal\b/i],{maxAhead:3}),12);
  const gate=compactCode(valueAfterLabel(seg,[/^puerta(?:\s+de\s+embarque)?\b/i,/^gate\b/i,/\bpuerta\b/i],{maxAhead:3}),12);
  const counters=compactCode(valueAfterLabel(seg,[/^mostradores?(?:\s+de\s+facturaci[oó]n)?\b/i,/^facturaci[oó]n\b/i,/^check[- ]?in(?:\s+counters?)?\b/i],{maxAhead:4}),22);
  const belt=compactCode(valueAfterLabel(seg,[/^cinta(?:\s+(?:de\s+)?(?:maletas|equipajes))?\b/i,/^baggage(?:\s+belt)?\b/i,/^belt\b/i],{maxAhead:4}),14);
  const boardingStart=timeAfterLabel(seg,[/^inicio\b/i,/^embarque(?:\s+inicio)?\b/i,/^boarding(?:\s+starts?)?\b/i]);
  const boardingClose=timeAfterLabel(seg,[/^cierre\b/i,/^embarque\s+cierre\b/i,/^boarding\s+closes?\b/i,/^boarding\s+close\b/i]);
  const scheduledDeparture=timeAfterLabel(seg,[/^salida\b/i,/^hora\s+salida\b/i,/^departure\b/i])||localTime(flight.departure);
  const scheduledArrival=timeAfterLabel(seg,[/^llegada\b/i,/^hora\s+llegada\b/i,/^arrival\b/i])||localTime(flight.arrival);
  const verified=verifiedStatus(seg,flight,evidence);
  return {found:true,identityVerified:true,identityScore:evidence.score,status:verified.status,statusVerified:verified.verified,terminal,gate,checkInCounters:counters,baggageBelt:belt,boardingStart,boardingClose,scheduledDeparture,scheduledArrival,kind,rawSegment:seg.slice(0,5000)};
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
  const verifiedSources=[dep,arr,v].filter(x=>x?.ok&&x?.identityVerified===true);
  const statusCandidates=verifiedSources.filter(x=>x.statusVerified===true&&clean(x.status));
  const cancelCandidates=statusCandidates.filter(x=>normalize(x.status)==='CANCELADO');
  // Cancelado solo se acepta si una fuente tiene evidencia estricta del vuelo;
  // para el resto de estados basta con una fuente verificada. Si dos fuentes
  // coinciden, se registra además en confirmations.
  const status=cancelCandidates[0]?.status||statusCandidates[0]?.status||'';
  const pickVerified=(primary,secondary,key)=>clean(primary?.identityVerified===true?primary?.[key]:'')||clean(secondary?.identityVerified===true?secondary?.[key]:'')||'';
  const terminal=pickVerified(dep,v,'terminal');
  const gate=pickVerified(dep,v,'gate');
  const checkInCounters=pickVerified(dep,v,'checkInCounters');
  const baggageBelt=pickVerified(arr,v,'baggageBelt');
  const boardingStart=pickVerified(v,dep,'boardingStart');
  const boardingClose=pickVerified(v,dep,'boardingClose');
  const scheduledDeparture=pickVerified(v,dep,'scheduledDeparture')||localTime(flight.departure);
  const scheduledArrival=pickVerified(v,arr,'scheduledArrival')||localTime(flight.arrival);
  const sources=[dep,arr,v].filter(x=>x?.ok).map(x=>({name:x.source,mode:x.mode,found:Boolean(x.found),identityVerified:x.identityVerified===true,statusVerified:x.statusVerified===true,identityScore:Number(x.identityScore)||0,url:x.url,error:x.error||''}));
  const confirmations=[];
  if(dep.identityVerified===true&&v.identityVerified===true&&sameValue(dep.gate,v.gate))confirmations.push('gate');
  if(dep.identityVerified===true&&v.identityVerified===true&&sameValue(dep.terminal,v.terminal))confirmations.push('terminal');
  if(dep.statusVerified===true&&v.statusVerified===true&&sameValue(dep.status,v.status))confirmations.push('status');
  const identityVerified=verifiedSources.length>0,statusVerified=Boolean(status&&statusCandidates.length);
  return {
    id:String(flight.id||flight.number||''),number:String(flight.number||''),date:localDate(flight.date||flight.departure),origin:airportCode(flight.origin||flight.from),destination:airportCode(flight.destination||flight.to),
    departure:flight.departure||'',arrival:flight.arrival||'',status,statusVerified,identityVerified,terminal,gate,checkInCounters,baggageBelt,boardingStart,boardingClose,scheduledDeparture,scheduledArrival,
    confirmations,sources,hasOperationalData:Boolean(identityVerified&&(status||terminal||gate||checkInCounters||baggageBelt||boardingStart||boardingClose))
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

export const __flightOpsTest={parseOperationalText,statusFromText,valueAfterLabel,mergeFlight,airportCode,identityEvidence,nearestFlightSegment,verifiedStatus};
