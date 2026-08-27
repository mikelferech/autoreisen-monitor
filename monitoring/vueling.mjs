// MFE_VUELING_AUTOMATION_VERSION: 1.0.18
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ARTIFACTS=path.resolve('artifacts/vueling');
const CONFIG_FILE=new URL('./vueling-config.json',import.meta.url);
const defaults={
  enabled:true,origin:'BIO',destination:'LPA',departureDate:'2026-09-14',returnDate:'2026-09-21',
  outboundFlight:'VY3272',returnFlight:'VY3271',outboundTime:'06:50',returnTime:'16:40',directOnly:true,
  adults:2,children:0,infants:0,fare:'FLY LIGHT',underseatBag:true,sameHandBaggageAllPassengers:true,
  checkedBagKg:25,checkedBagCount:1,checkedBagPassenger:1,sameBaggageRoundTrip:true,sameBaggageAllPassengers:false,
  contactFirstName:'Fjie',contactLastName:'Kfkfr',email:'jdje@g.com',country:'España',phonePrefix:'+34',phone:'654654654',
  passenger1FirstName:'Fjie',passenger1LastName:'Kfkfr',passenger2FirstName:'Prueba',passenger2LastName:'Mfe',
  marketingConsent:false,telegramEnabled:true,telegramNotifyEveryCheck:true,telegramNotifyPriceDrop:true,
  reservedPrice:0,scheduleTime:'06:40',scheduleTimeZone:'Europe/Madrid'
};
const saved=JSON.parse(await fs.readFile(CONFIG_FILE,'utf8'));
const config={...defaults,...(saved.vueling||saved||{})};
const force=/^(1|true|yes)$/i.test(String(process.env.MFE_FORCE_RUN||''));
const telegramTest=/^(1|true|yes)$/i.test(String(process.env.MFE_TEST_TELEGRAM||''));
const dryRun=/^(1|true|yes)$/i.test(String(process.env.MFE_DRY_RUN||''));

function euroNumber(text=''){
  const raw=String(text).replace(/\u00a0/g,' ');
  const matches=[...raw.matchAll(/(?:€\s*)?(-?\d{1,3}(?:\.\d{3})*(?:,\d{2})|-?\d+(?:[.,]\d{2}))\s*€?/g)];
  if(!matches.length)return 0;
  const value=matches.at(-1)[1].replace(/\./g,'').replace(',','.');
  return Number.parseFloat(value)||0;
}
function moneyText(value){return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(value)||0);}
function moneyFromString(text=''){return euroNumber(text);}
function labeledMoney(text,labelPattern){
  const source=String(text||'').replace(/\u00a0/g,' ');
  const re=new RegExp(`(?:${labelPattern})\\s*([\\d.]+,\\d{2})\\s*€`,'i');
  const match=source.match(re);return match?euroNumber(match[1]):0;
}
function baggageMoney(text=''){
  const source=String(text||'').replace(/\u00a0/g,' ');
  const patterns=[
    /(?:maletas?\s+facturadas?|equipaje\s+facturado)[\s\S]{0,140}?([\d.]+,\d{2})\s*€/gi,
    /(?:maleta\s+de\s+\d+\s*kg)[\s\S]{0,140}?([\d.]+,\d{2})\s*€/gi
  ];
  let total=0;for(const pattern of patterns){const values=[...source.matchAll(pattern)].map(m=>euroNumber(m[1])).filter(v=>v>0);if(values.length){total=values.reduce((a,b)=>a+b,0);break;}}
  return total;
}
async function ensureArtifacts(){await fs.mkdir(ARTIFACTS,{recursive:true});}
async function snapshot(page,name){await ensureArtifacts();await page.screenshot({path:path.join(ARTIFACTS,`${name}.png`),fullPage:true}).catch(()=>{});await fs.writeFile(path.join(ARTIFACTS,`${name}.html`),await page.content().catch(()=>''),'utf8').catch(()=>{});}
async function pause(page,ms=900){await page.waitForTimeout(ms);}
async function isVisible(locator){return locator.isVisible().catch(()=>false);}
async function clickFirst(page,candidates,{required=false,label='control'}={}){
  for(const item of candidates){
    const locator=typeof item==='string'?page.locator(item).first():item.first?item.first():item;
    if(await isVisible(locator)){await locator.scrollIntoViewIfNeeded().catch(()=>{});await locator.click({timeout:8000}).catch(()=>locator.click({force:true,timeout:4000}));await pause(page);return true;}
  }
  if(required)throw new Error(`No se encontró ${label}.`);return false;
}
async function fillFirst(page,candidates,value,{required=false,label='campo'}={}){
  for(const item of candidates){const loc=typeof item==='string'?page.locator(item).first():item;if(await isVisible(loc)){await loc.fill(String(value),{timeout:7000});return true;}}
  if(required)throw new Error(`No se encontró ${label}.`);return false;
}
async function checkLabel(page,pattern,wanted=true){
  const locator=page.getByLabel(pattern).first();
  if(await isVisible(locator)){if(wanted)await locator.check({force:true}).catch(()=>locator.click({force:true}));else await locator.uncheck({force:true}).catch(()=>{});await pause(page,300);return true;}
  const text=page.getByText(pattern).first();if(await isVisible(text)){const box=text.locator('xpath=ancestor::*[self::label or self::div][1]//input[@type="checkbox" or @type="radio"]').first();if(await isVisible(box)){if(wanted)await box.check({force:true}).catch(()=>box.click({force:true}));else await box.uncheck({force:true}).catch(()=>{});return true;}}
  return false;
}
function workerCredentials(){const url=String(process.env.MFE_VUELING_WORKER_URL||'').trim();const secret=String(process.env.MFE_VUELING_MONITOR_SECRET||'').trim();if(!url||!secret)throw new Error('Faltan MFE_VUELING_WORKER_URL o MFE_VUELING_MONITOR_SECRET en GitHub Secrets.');return {url,secret};}
async function workerRequest(payload,{authenticated=false,allowError=false}={}){const {url,secret}=workerCredentials();const headers={'Content-Type':'application/json'};if(authenticated)headers.Authorization=`Bearer ${secret}`;const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(payload)});let data=null;try{data=await response.json();}catch{}if(!response.ok&&!allowError)throw new Error(`Worker ${response.status}: ${data?.error||'respuesta no válida'}`);return {response,data};}
async function postResult(result){const {response,data}=await workerRequest({action:'monitor-write',type:'vueling',result},{authenticated:true,allowError:true});if(!response.ok)throw new Error(data?.error||`Worker HTTP ${response.status}`);return data;}
async function readLatest(){const {response,data}=await workerRequest({action:'vueling'},{allowError:true});return response.ok?data?.result||null:null;}
async function sendTelegram(text){const token=String(process.env.TELEGRAM_BOT_TOKEN||'').trim(),chatId=String(process.env.TELEGRAM_CHAT_ID||'').trim();if(!token||!chatId)throw new Error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID.');const response=await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text:String(text),disable_web_page_preview:true})});let data=null;try{data=await response.json();}catch{}if(!response.ok||data?.ok===false)throw new Error(data?.description||`Telegram HTTP ${response.status}`);}
function buildVuelingDeeplink(c=config){const url=new URL('https://m.vueling.com/SB');url.searchParams.set('o',String(c.origin||'BIO').toUpperCase());url.searchParams.set('d',String(c.destination||'LPA').toUpperCase());url.searchParams.set('dd',c.departureDate);url.searchParams.set('rd',c.returnDate);url.searchParams.set('dt','0');url.searchParams.set('adt',String(Math.max(1,Number(c.adults)||1)));url.searchParams.set('chd',String(Math.max(0,Number(c.children)||0)));url.searchParams.set('inf',String(Math.max(0,Number(c.infants)||0)));url.searchParams.set('c','es-ES');url.searchParams.set('cur','EUR');if(c.outboundFlight)url.searchParams.set('ofn',String(c.outboundFlight).toUpperCase());if(c.returnFlight)url.searchParams.set('rfn',String(c.returnFlight).toUpperCase());return url.toString();}
async function acceptCookies(page){
  const accept=page.locator('#onetrust-accept-btn-handler').first();
  try{await accept.waitFor({state:'visible',timeout:15000});await accept.click({timeout:8000});await page.locator('#onetrust-banner-sdk').waitFor({state:'hidden',timeout:12000}).catch(()=>{});await pause(page,900);console.log('[vueling] Cookies aceptadas.');return true;}catch{}
  const fallback=page.getByRole('button',{name:/OK,?\s*las acepto|Aceptar todas las cookies|Aceptar todas|Acepto/i}).first();
  if(await isVisible(fallback)){await fallback.click({force:true,timeout:8000});await pause(page,900);console.log('[vueling] Cookies aceptadas por fallback.');return true;}
  console.warn('[vueling] No apareció el banner de cookies o ya estaba resuelto.');return false;
}
async function applyDirectOnlyIfNeeded(page){if(!config.directOnly||config.outboundFlight||config.returnFlight)return;await checkLabel(page,/Solo vuelos directos/i,true);}
async function pageLooksLikeFlightResults(page){
  const url=String(page.url()||'');if(/tickets\.vueling\.com\/booking\/selectFlight/i.test(url))return true;
  return await page.getByText(/SELECCIONA TU VUELO|Selecciona tu vuelo/i).first().isVisible().catch(()=>false);
}
function preselectedTextMatches(body=''){
  const text=String(body||'');
  if(!/Tu vuelo a|Modificar/i.test(text)||!/Continuar/i.test(text))return false;
  const required=[config.outboundFlight,config.returnFlight,config.outboundTime,config.returnTime].filter(Boolean);
  return required.every(value=>flightPattern(value).test(text));
}
async function pageLooksLikePreselectedItinerary(page){
  // textContent detecta el itinerario en cuanto Angular lo inserta en el DOM, incluso antes de que
  // todos los bloques hayan terminado su animación/maquetación visible.
  const body=await page.locator('body').textContent().catch(()=>'');
  return preselectedTextMatches(body);
}
async function verifyPreselectedItinerary(page){
  const body=await page.locator('body').textContent().catch(()=>'');
  const checks=[
    ['vuelo de ida',config.outboundFlight],['hora de ida',config.outboundTime],
    ['vuelo de vuelta',config.returnFlight],['hora de vuelta',config.returnTime]
  ];
  const missing=checks.filter(([,value])=>value&&!flightPattern(value).test(body)).map(([label,value])=>`${label} ${value}`);
  if(missing.length)throw new Error(`El deeplink abrió un itinerario distinto al configurado. Falta confirmar: ${missing.join(', ')}.`);
  console.log(`[vueling] Itinerario preseleccionado confirmado: ${config.outboundFlight} ${config.outboundTime} / ${config.returnFlight} ${config.returnTime}.`);
}
async function waitForVuelingEntryPage(context,originPage,{timeoutMs=130000}={}){
  const startedAt=Date.now(),deadline=startedAt+timeoutMs;let searchClicked=false,lastProgressLog=0;
  while(Date.now()<deadline){
    for(const candidate of context.pages()){
      if(candidate.isClosed())continue;
      if(await pageLooksLikeFlightResults(candidate)){
        await candidate.bringToFront().catch(()=>{});await candidate.waitForLoadState('domcontentloaded',{timeout:10000}).catch(()=>{});
        console.log(`[vueling] Pantalla de resultados detectada en ${candidate.url()}`);return {page:candidate,mode:'results'};
      }
      if(await pageLooksLikePreselectedItinerary(candidate)){
        await candidate.bringToFront().catch(()=>{});console.log(`[vueling] El deeplink ya ha preseleccionado ida y vuelta en ${candidate.url()} tras ${Math.round((Date.now()-startedAt)/1000)} s.`);return {page:candidate,mode:'preselected'};
      }
      const url=String(candidate.url()||'');
      if(/m\.vueling\.com\/SB\/YourFlight/i.test(url)&&Date.now()-lastProgressLog>15000){
        lastProgressLog=Date.now();
        const body=await candidate.locator('body').textContent().catch(()=>'');
        const found=[config.outboundFlight,config.returnFlight,config.outboundTime,config.returnTime].filter(v=>v&&flightPattern(v).test(body));
        console.log(`[vueling] Esperando a que Angular complete YourFlight (${Math.round((Date.now()-startedAt)/1000)} s). Detectado: ${found.join(', ')||'todavía nada'}.`);
      }
    }
    if(!searchClicked&&originPage&&!originPage.isClosed()){
      const searchButton=originPage.getByRole('button',{name:/^BUSCAR$|Buscar vuelos|Buscar/i}).first();
      if(await isVisible(searchButton)){
        searchClicked=true;console.log('[vueling] La búsqueda requiere pulsar BUSCAR; se acepta tanto nueva pestaña como navegación en la misma pestaña.');
        await searchButton.click({force:true}).catch(()=>{});await pause(originPage,900);
      }
    }
    await new Promise(resolve=>setTimeout(resolve,800));
  }
  const urls=context.pages().filter(x=>!x.isClosed()).map(x=>x.url()).join(' | ');
  throw new Error(`No apareció ni la selección de vuelos ni el itinerario preseleccionado de Vueling tras ${Math.round(timeoutMs/1000)} s. Páginas abiertas: ${urls||'ninguna'}.`);
}
async function waitForFarePage(context,currentPage,{timeoutMs=120000}={}){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    for(const candidate of context.pages()){
      if(candidate.isClosed())continue;
      const fare= candidate.getByText(/FLY\s*LIGHT/i).first();
      if(await isVisible(fare)){await candidate.bringToFront().catch(()=>{});console.log(`[vueling] Pantalla de tarifas detectada en ${candidate.url()}`);return candidate;}
    }
    await new Promise(resolve=>setTimeout(resolve,650));
  }
  const urls=context.pages().filter(x=>!x.isClosed()).map(x=>x.url()).join(' | ');
  throw new Error(`Después de confirmar los vuelos no apareció la pantalla de tarifas FLY LIGHT. Páginas abiertas: ${urls||'ninguna'}.`);
}
async function assertFlightSelection(page){const body=await page.locator('body').innerText();for(const value of [config.outboundFlight,config.returnFlight])if(value&&!new RegExp(String(value).replace(/\s+/g,'\\s*'),'i').test(body))console.warn(`[vueling] El número ${value} todavía no aparece en el DOM.`);}
function flightPattern(value){return new RegExp(String(value||'').trim().replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');}
async function selectFlight(page,{flight,time,label}){
  const flightRe=flightPattern(flight),timeRe=flightPattern(time);
  const flightText=page.getByText(flightRe).first();
  await flightText.waitFor({state:'visible',timeout:35000}).catch(()=>{});
  if(!(await isVisible(flightText)))throw new Error(`No aparece ${label} ${flight}${time?` a las ${time}`:''}.`);
  let card=null,cardText='';let node=flightText;
  for(let depth=0;depth<10;depth++){
    node=node.locator('xpath=..');const txt=await node.innerText().catch(()=>'');if(time&&!timeRe.test(txt))continue;
    const priced=node.getByRole('button').filter({hasText:/\d+(?:[.,]\d{1,2})?\s*€|seleccionar|elegir/i});const pricedCount=await priced.count().catch(()=>0);
    if(pricedCount===1){card=node;cardText=txt;break;}
  }
  if(!card){
    const candidates=page.locator('article, li, section, div').filter({hasText:flightRe});const count=Math.min(await candidates.count().catch(()=>0),80);
    for(let i=0;i<count;i++){const c=candidates.nth(i),txt=await c.innerText().catch(()=>'');if(time&&!timeRe.test(txt))continue;const priced=c.getByRole('button').filter({hasText:/\d+(?:[.,]\d{1,2})?\s*€|seleccionar|elegir/i});if(await priced.count().catch(()=>0)===1){card=c;cardText=txt;break;}}
  }
  if(!card)throw new Error(`No se pudo aislar la tarjeta de ${label} ${flight}${time?` ${time}`:''}.`);
  if(time&&!timeRe.test(cardText))throw new Error(`${label} ${flight} apareció, pero no se confirmó el horario ${time}.`);
  const priceButton=card.getByRole('button').filter({hasText:/\d+(?:[.,]\d{1,2})?\s*€|seleccionar|elegir/i}).last();
  const button=await isVisible(priceButton)?priceButton:card.locator('button').last();
  if(!(await isVisible(button)))throw new Error(`No se encontró el botón de precio para ${label} ${flight}.`);
  await button.scrollIntoViewIfNeeded().catch(()=>{});await button.click({timeout:10000}).catch(()=>button.click({force:true,timeout:5000}));await pause(page,1200);
  console.log(`[vueling] Seleccionado ${label}: ${flight} ${time||''}`.trim());
}
async function selectRequestedFlights(page){
  await selectFlight(page,{flight:config.outboundFlight,time:config.outboundTime,label:'vuelo de ida'});await snapshot(page,'02-ida-seleccionada');
  await selectFlight(page,{flight:config.returnFlight,time:config.returnTime,label:'vuelo de vuelta'});await snapshot(page,'03-vuelta-seleccionada');
}
async function selectFlyLight(page){
  const title=page.getByText(/FLY\s*LIGHT/i).first();await title.waitFor({state:'visible',timeout:35000}).catch(()=>{});if(!(await isVisible(title)))throw new Error('No aparece la tarifa FLY LIGHT después de seleccionar ida y vuelta.');
  const card=title.locator('xpath=ancestor::*[self::article or self::section or self::div][contains(translate(normalize-space(.),"SELECCIONADO","seleccionado"),"seleccionado") or .//button][1]');
  const cardText=await card.innerText().catch(()=>'');
  if(/Seleccionado/i.test(cardText)){console.log('[vueling] FLY LIGHT ya aparece seleccionada.');return;}
  const button=card.getByRole('button').filter({hasText:/0[,.]00|€|seleccionar|elegir/i}).last();
  if(await isVisible(button)){await button.click();await pause(page,1200);console.log('[vueling] Tarifa FLY LIGHT seleccionada mediante su botón.');return;}
  if(!(await clickFirst(page,[title],{required:true,label:'tarifa FLY LIGHT'})))throw new Error('No se pudo seleccionar FLY LIGHT.');
  console.log('[vueling] Tarifa FLY LIGHT seleccionada mediante la tarjeta.');
}
async function guestAccessOverlayActive(page){
  const guestText=page.getByText(/contin[uú]a?r? como invitado|seguir como invitado|como invitado\/a/i).first();
  if(await isVisible(guestText))return true;
  const guestInOverlay=page.locator('.cdk-overlay-container').getByText(/invitado/i).first();
  return await isVisible(guestInOverlay);
}
async function clickContinueAsGuest(page){
  const pattern=/contin[uú]a?r? como invitado|seguir como invitado|como invitado\/a/i;
  const roleButton=page.getByRole('button',{name:pattern}).first();
  const plainButton=page.locator('button').filter({hasText:pattern}).first();
  const guestText=page.getByText(pattern).first();
  let target=null;
  if(await isVisible(roleButton))target=roleButton;
  else if(await isVisible(plainButton))target=plainButton;
  else if(await isVisible(guestText)){
    const ancestor=guestText.locator('xpath=ancestor::*[self::button or self::a or @role="button"][1]');
    target=await isVisible(ancestor)?ancestor:guestText;
  }
  if(!target)return false;
  await target.scrollIntoViewIfNeeded().catch(()=>{});
  let clicked=false;
  try{await target.click({timeout:8000});clicked=true;}catch{}
  if(!clicked){try{await target.click({force:true,timeout:5000});clicked=true;}catch{}}
  if(!clicked&&await isVisible(guestText)){
    clicked=await guestText.evaluate(el=>{
      const clickable=el.closest('button,a,[role="button"],c-lib-button,.text-slim-button');
      try{(clickable||el).click();return true;}catch{return false;}
    }).catch(()=>false);
  }
  if(!clicked)return false;
  console.log('[vueling] Continuar como invitado pulsado; esperando a que cierre el overlay de acceso.');
  await guestText.waitFor({state:'hidden',timeout:15000}).catch(()=>{});
  await page.locator('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing').first().waitFor({state:'hidden',timeout:15000}).catch(()=>{});
  await pause(page,700);
  return true;
}
async function contactFormReady(page){
  // En Vueling el formulario puede estar ya renderizado por debajo del modal de acceso. No lo
  // consideramos listo mientras el overlay «Continúa como invitado/a» siga interceptando clics.
  if(await guestAccessOverlayActive(page))return false;
  const passengerPanel=page.locator('vy-passenger-form-panel').first();
  const contactPanel=page.locator('vy-contact-form-panel').first();
  if(await isVisible(passengerPanel)&&await isVisible(contactPanel))return true;
  const heading=page.getByText(/Persona de contacto|¿Quién viajará\?|Datos de contacto/i).first();
  return await isVisible(heading);
}
async function continueFareAndReachContact(page,{timeoutMs=90000}={}){
  // Tras seleccionar FLY LIGHT Vueling mantiene la pantalla de tarifas hasta pulsar el botón
  // fijo CONTINUAR. En ejecuciones anteriores intentábamos rellenar el contacto sin hacer este paso.
  const continueButton=page.getByRole('button',{name:/^CONTINUAR$|^Continuar$/i}).last();
  await continueButton.waitFor({state:'visible',timeout:30000}).catch(()=>{});
  if(!(await isVisible(continueButton)))throw new Error('FLY LIGHT está seleccionada, pero no aparece el botón CONTINUAR de tarifas.');
  await continueButton.scrollIntoViewIfNeeded().catch(()=>{});
  await continueButton.click({timeout:10000}).catch(()=>continueButton.click({force:true,timeout:5000}));
  await pause(page,900);await snapshot(page,'04b-despues-continuar-tarifa');
  const deadline=Date.now()+timeoutMs;let guestClicked=false,lastLog=0;
  while(Date.now()<deadline){
    // Primero resolvemos el modal de acceso. El formulario de contacto puede estar visible por
    // debajo y Playwright lo detecta como visible aunque el backdrop siga interceptando eventos.
    if(await guestAccessOverlayActive(page)){
      console.log('[vueling] Pantalla de acceso detectada; continuando como invitado.');
      const clicked=await clickContinueAsGuest(page);
      if(clicked){guestClicked=true;await snapshot(page,'04c-continuar-como-invitado');continue;}
    }
    if(await contactFormReady(page)){console.log('[vueling] Formulario de contacto detectado y sin overlay bloqueando.');return;}
    if(Date.now()-lastLog>15000){lastLog=Date.now();console.log(`[vueling] Esperando formulario de contacto (${Math.round((timeoutMs-(deadline-Date.now()))/1000)} s). URL: ${page.url()}`);}
    await page.waitForTimeout(600);
  }
  throw new Error(`Tras FLY LIGHT y CONTINUAR no apareció el formulario de contacto${guestClicked?' después de continuar como invitado':''}. URL: ${page.url()}`);
}
async function ensureGuestAccessClosed(page,{required=false}={}){
  if(!(await guestAccessOverlayActive(page)))return false;
  console.log('[vueling] Modal de acceso detectado durante Datos; cerrando con «Continúa como invitado/a».');
  const clicked=await clickContinueAsGuest(page);
  if(!clicked&&required)throw new Error('Apareció el modal de acceso de Vueling y no se pudo pulsar «Continúa como invitado/a».');
  if(clicked){
    await page.getByText(/RESERVA MÁS RÁPIDO/i).first().waitFor({state:'hidden',timeout:20000}).catch(()=>{});
    await page.locator('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing').first().waitFor({state:'hidden',timeout:20000}).catch(()=>{});
    await pause(page,500);
  }
  return clicked;
}
function panelField(panel,pattern,{type=''}={}){
  const field=panel.locator('mat-form-field').filter({hasText:pattern}).first();
  return type?field.locator(`input[type="${type}"]`).first():field.locator('input').first();
}
async function fillPanelField(page,panel,pattern,value,{required=true,label='campo',type=''}={}){
  await ensureGuestAccessClosed(page);
  const input=panelField(panel,pattern,{type});
  if(await isVisible(input)){
    await input.scrollIntoViewIfNeeded().catch(()=>{});
    await input.fill(String(value),{timeout:10000});
    await pause(page,250);
    await ensureGuestAccessClosed(page);
    return true;
  }
  if(required)throw new Error(`No se encontró ${label}.`);
  return false;
}
async function fillPassengerPanel(page,index,firstName,lastName){
  const panels=page.locator('vy-passenger-form-panel');
  const panel=panels.nth(index);
  if(!(await isVisible(panel)))throw new Error(`No aparece el formulario del pasajero ${index+1}.`);
  await fillPanelField(page,panel,/^Nombre\*?$/i,firstName,{label:`nombre del pasajero ${index+1}`});
  await fillPanelField(page,panel,/^Apellidos?\*?$/i,lastName,{label:`apellidos del pasajero ${index+1}`});
  await snapshot(page,`05a-pasajero-${index+1}`);
}
function normalizeAutocompleteValue(value,label=''){
  const raw=String(value??'').normalize('NFKC').trim();
  if(/prefijo/i.test(label))return raw.replace(/[^0-9+]/g,'');
  return raw.toLocaleLowerCase('es').replace(/\s+/g,' ');
}
function autocompleteValueMatches(current,wanted,label=''){
  const a=normalizeAutocompleteValue(current,label),b=normalizeAutocompleteValue(wanted,label);
  if(!a||!b)return false;
  if(/prefijo/i.test(label))return a.replace(/\D/g,'')===b.replace(/\D/g,'');
  return a===b;
}
async function chooseAutocompleteValue(page,panel,fieldPattern,value,label){
  await ensureGuestAccessClosed(page);
  const input=panelField(panel,fieldPattern);
  if(!(await isVisible(input)))throw new Error(`No se encontró ${label}.`);

  // Vueling completa automáticamente el prefijo cuando se selecciona el país. En ese caso el
  // input ya contiene +34 aunque no exista ninguna opción desplegada. No debemos borrar un valor
  // válido ni exigir que aparezca de nuevo el autocomplete.
  const initialValue=await input.inputValue().catch(()=>'');
  if(autocompleteValueMatches(initialValue,value,label)){
    console.log(`[vueling] ${label} ya seleccionado automáticamente: ${initialValue}.`);
    return true;
  }

  await input.scrollIntoViewIfNeeded().catch(()=>{});
  await input.click({timeout:8000}).catch(()=>input.click({force:true,timeout:4000}));
  await pause(page,350);
  await ensureGuestAccessClosed(page);

  // El clic puede hacer que Angular materialice/restaure el valor previamente seleccionado.
  const afterClick=await input.inputValue().catch(()=>'');
  if(autocompleteValueMatches(afterClick,value,label)){
    console.log(`[vueling] ${label} confirmado tras abrir el campo: ${afterClick}.`);
    return true;
  }

  const escaped=String(value).replace(/[.*+?^${}()|[\]\\]/g,'\$&');
  const exact=new RegExp(`^${escaped}$`,'i');
  const option=page.getByRole('option',{name:exact}).first();
  if(await isVisible(option)){await option.click({timeout:8000}).catch(()=>option.click({force:true,timeout:4000}));await pause(page,250);return true;}
  const text=page.getByText(exact).last();
  if(await isVisible(text)){await text.click({timeout:8000}).catch(()=>text.click({force:true,timeout:4000}));await pause(page,250);return true;}

  // Algunos autocompletados aceptan escribir el valor antes de seleccionar.
  await input.fill(String(value),{timeout:5000}).catch(()=>{});await pause(page,450);
  const filled=await input.inputValue().catch(()=>'');
  const ariaInvalid=await input.getAttribute('aria-invalid').catch(()=>null);
  if(autocompleteValueMatches(filled,value,label)&&ariaInvalid!=='true'){
    console.log(`[vueling] ${label} aceptado directamente por el campo: ${filled}.`);
    return true;
  }
  const retry=page.getByRole('option',{name:new RegExp(escaped,'i')}).first();
  if(await isVisible(retry)){await retry.click({force:true});await pause(page,250);return true;}

  // Última comprobación: algunos mat-autocomplete cierran su lista al validar y dejan el valor en
  // el input sin una opción visible en el DOM.
  const finalValue=await input.inputValue().catch(()=>'');
  if(autocompleteValueMatches(finalValue,value,label))return true;
  throw new Error(`No apareció la opción ${label}: ${value}. Valor actual: ${finalValue||'vacío'}.`);
}

async function privacyPolicyDialogActive(page){
  const dialog=page.locator('vy-privacy-policy-dialog').first();
  if(await isVisible(dialog))return true;
  return await page.getByText(/^\s*POLÍTICA DE PRIVACIDAD\s*$/i).first().isVisible().catch(()=>false);
}
async function acceptPrivacyPolicyIfPresent(page,{timeoutMs=6000,required=false}={}){
  const dialog=page.locator('vy-privacy-policy-dialog').first();
  try{await dialog.waitFor({state:'visible',timeout:timeoutMs});}catch{
    if(!(await privacyPolicyDialogActive(page))){if(required)throw new Error('No apareció el diálogo «Política de privacidad».');return false;}
  }
  const shell=page.locator('vy-dialog').filter({has:page.locator('vy-privacy-policy-dialog')}).first();
  const accept=(await isVisible(shell))?shell.getByRole('button',{name:/^\s*Aceptar\s*$/i}).last():page.getByRole('button',{name:/^\s*Aceptar\s*$/i}).last();
  if(!(await isVisible(accept))){if(required)throw new Error('Apareció «Política de privacidad», pero no se encontró el botón ACEPTAR.');return false;}
  await accept.scrollIntoViewIfNeeded().catch(()=>{});
  await accept.click({timeout:8000}).catch(()=>accept.click({force:true,timeout:4000}));
  await dialog.waitFor({state:'hidden',timeout:12000}).catch(()=>{});
  await page.locator('.cdk-overlay-backdrop-showing').waitFor({state:'hidden',timeout:12000}).catch(()=>{});
  await pause(page,500);
  console.log('[vueling] Política de privacidad aceptada.');
  return true;
}
async function continueAfterContact(page){
  await ensureGuestAccessClosed(page,{required:true});
  await acceptPrivacyPolicyIfPresent(page,{timeoutMs:1200});
  let continueButton=page.getByRole('button',{name:/^CONTINUAR$|^Continuar$/i}).last();
  if(!(await isVisible(continueButton)))throw new Error('No aparece CONTINUAR después de completar pasajeros y contacto.');
  await continueButton.scrollIntoViewIfNeeded().catch(()=>{});
  try{await continueButton.click({timeout:10000});}
  catch{
    await ensureGuestAccessClosed(page,{required:true});
    await acceptPrivacyPolicyIfPresent(page,{timeoutMs:1200});
    await continueButton.click({force:true,timeout:6000});
  }
  // Vueling abre aquí un diálogo obligatorio de Política de privacidad. El clic en CONTINUAR
  // puede considerarse correcto antes de que Angular inserte el overlay, así que lo esperamos
  // expresamente y lo aceptamos si aparece.
  const privacyAccepted=await acceptPrivacyPolicyIfPresent(page,{timeoutMs:7000});
  if(privacyAccepted){
    await snapshot(page,'05d-privacidad-aceptada');
    await pause(page,700);
    // Algunas variantes siguen automáticamente; otras permanecen en Datos y requieren un
    // segundo CONTINUAR después de aceptar la política.
    const contactStillVisible=await page.locator('vy-contact-form-panel').first().isVisible().catch(()=>false);
    if(contactStillVisible){
      continueButton=page.getByRole('button',{name:/^CONTINUAR$|^Continuar$/i}).last();
      if(await isVisible(continueButton)){
        await continueButton.scrollIntoViewIfNeeded().catch(()=>{});
        await continueButton.click({timeout:10000}).catch(()=>continueButton.click({force:true,timeout:5000}));
      }
    }
  }
  await pause(page,900);
}

async function fillContactAndPassengers(page){
  await ensureGuestAccessClosed(page);
  const adults=Math.max(1,Number(config.adults)||1);
  const passengerValues=[
    [config.passenger1FirstName||config.contactFirstName||'Fjie',config.passenger1LastName||config.contactLastName||'Kfkfr'],
    [config.passenger2FirstName||'Prueba',config.passenger2LastName||'Mfe']
  ];
  for(let i=0;i<adults;i++){
    const [first,last]=passengerValues[i]||[`Pasajero${i+1}`,'Mfe'];
    await fillPassengerPanel(page,i,String(first),String(last));
    // Vueling suele mostrar «Reserva más rápido» justo después de validar el primer viajero.
    await ensureGuestAccessClosed(page,{required:true});
  }
  await snapshot(page,'05b-pasajeros-rellenados');

  const contact=page.locator('vy-contact-form-panel').first();
  if(!(await isVisible(contact)))throw new Error('No aparece el bloque «Persona de contacto».');
  await ensureGuestAccessClosed(page,{required:true});

  // Si Vueling deja «Otro» como contacto aparecen Nombre y Apellidos editables. Cuando utiliza
  // automáticamente al primer viajero, esos campos se sustituyen por «Nombre y apellidos» y no
  // hace falta tocarlos.
  const contactFirst=panelField(contact,/^Nombre\*?$/i);
  if(await isVisible(contactFirst))await fillPanelField(page,contact,/^Nombre\*?$/i,config.contactFirstName,{label:'nombre de contacto'});
  const contactLast=panelField(contact,/^Apellidos?\*?$/i);
  if(await isVisible(contactLast))await fillPanelField(page,contact,/^Apellidos?\*?$/i,config.contactLastName,{label:'apellidos de contacto'});

  await fillPanelField(page,contact,/Email/i,config.email,{label:'Email',type:'email'});
  await chooseAutocompleteValue(page,contact,/País de residencia/i,config.country,'país');
  await chooseAutocompleteValue(page,contact,/Prefijo/i,config.phonePrefix||'+34','prefijo');
  await fillPanelField(page,contact,/Teléfono móvil|Móvil|Teléfono/i,config.phone,{label:'Teléfono móvil',type:'tel'});

  await ensureGuestAccessClosed(page,{required:true});
  const marketing=contact.getByText(/Quiero recibir información y ofertas/i).first();
  if(await isVisible(marketing)){
    const box=contact.locator('input[type="checkbox"]').first();
    if(await isVisible(box)){
      if(config.marketingConsent)await box.check({force:true}).catch(()=>box.click({force:true}));
      else await box.uncheck({force:true}).catch(()=>{});
    }
  }
  await snapshot(page,'05c-contacto-rellenado');
  await continueAfterContact(page);
}

async function setSwitchNearText(page,pattern,wanted,{index=0,label='interruptor'}={}){
  const texts=page.getByText(pattern);const visible=[];const count=await texts.count().catch(()=>0);
  for(let i=0;i<count;i++){const t=texts.nth(i);if(await isVisible(t))visible.push(t);}
  const text=index<0?visible.at(index):visible[index];if(!text)return false;
  const host=text.locator('xpath=ancestor::*[self::mat-slide-toggle or self::label or self::div][.//input[@type="checkbox"] or @role="switch"][1]');
  let input=host.locator('input[type="checkbox"]').first();
  if(!(await isVisible(input)))input=text.locator('xpath=ancestor::*[self::mat-slide-toggle or self::label or self::div][1]//input[@type="checkbox"]').first();
  let current=null;
  if(await input.count().catch(()=>0)){current=await input.isChecked().catch(()=>null);}
  if(current===null){const sw=host.locator('[role="switch"]').first();if(await sw.count().catch(()=>0)){const aria=await sw.getAttribute('aria-checked').catch(()=>null);if(aria!==null)current=aria==='true';}}
  if(current===wanted)return true;
  const clickable=(await isVisible(input))?input:host;
  if(await isVisible(clickable)){await clickable.click({force:true,timeout:7000}).catch(()=>text.click({force:true,timeout:5000}));await pause(page,450);return true;}
  console.warn(`[vueling] No se pudo accionar ${label}.`);return false;
}
async function seatPageActive(page){return /\/booking\/seats/i.test(String(page.url()||''))||await page.getByText(/¿DÓNDE QUIERES SENTARTE\?|Continuar sin elegir asientos/i).first().isVisible().catch(()=>false);}
async function luggagePageActive(page){return /\/booking\/services/i.test(String(page.url()||''))||await page.getByText(/SELECCIONA TU EQUIPAJE|EQUIPAJE DE MANO/i).first().isVisible().catch(()=>false);}
async function dismissSeatUpsell(page){
  const dialog=page.locator('mat-dialog-container,.cdk-overlay-pane,[role="dialog"]').filter({hasText:/¿NO VAS A ESCOGER ASIENTO\?|¿Y SI ELIGES TU ASIENTO AHORA\?|ESCOGER ASIENTOS|CONTINUAR SIN SELECCIONAR/i}).last();
  if(!(await isVisible(dialog)))return false;
  let skip=dialog.getByRole('button',{name:/CONTINUAR SIN SELECCIONAR|CONTINUAR SIN (?:ELEGIR )?ASIENTOS/i}).last();
  if(!(await isVisible(skip)))skip=dialog.getByText(/Continuar sin seleccionar/i).last();
  if(!(await isVisible(skip)))return false;
  await skip.scrollIntoViewIfNeeded().catch(()=>{});
  await skip.click({timeout:10000}).catch(()=>skip.click({force:true,timeout:5000}));
  await page.locator('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing').waitFor({state:'hidden',timeout:12000}).catch(()=>{});
  await dialog.waitFor({state:'hidden',timeout:12000}).catch(()=>{});await pause(page,700);
  console.log('[vueling] Modal «Continuar sin seleccionar» resuelto.');return true;
}
async function skipSeats(page){
  for(let attempt=0;attempt<3;attempt++){
    if(await luggagePageActive(page))return true;
    if(!(await seatPageActive(page)))await page.getByText(/¿DÓNDE QUIERES SENTARTE\?|Continuar sin elegir asientos/i).first().waitFor({state:'visible',timeout:60000}).catch(()=>{});
    const skip=page.getByRole('button',{name:/CONTINUAR SIN (?:ELEGIR )?ASIENTOS/i}).last();
    if(!(await isVisible(skip)))throw new Error('No aparece «Continuar sin elegir asientos».');
    await skip.scrollIntoViewIfNeeded().catch(()=>{});await skip.click({timeout:10000}).catch(()=>skip.click({force:true,timeout:5000}));await pause(page,500);
    // Vueling abre un segundo modal: «¿no vas a escoger asiento?» con el enlace
    // «Continuar sin seleccionar». Hay que resolverlo antes de esperar equipaje.
    const modalDeadline=Date.now()+12000;let modalHandled=false;
    while(Date.now()<modalDeadline){if(await dismissSeatUpsell(page)){modalHandled=true;break;}if(await luggagePageActive(page))return true;await pause(page,350);}
    if(!modalHandled)await dismissSeatUpsell(page).catch(()=>false);
    const deadline=Date.now()+45000;
    while(Date.now()<deadline){if(await luggagePageActive(page)){console.log('[vueling] Asientos omitidos.');return true;}if(await seatPageActive(page)&&await page.getByRole('button',{name:/CONTINUAR SIN (?:ELEGIR )?ASIENTOS/i}).last().isVisible().catch(()=>false))break;await pause(page,700);}
  }
  if(await luggagePageActive(page))return true;
  throw new Error('Vueling no avanzó desde asientos hasta equipaje.');
}
async function underseatRowSelected(row){
  return row.evaluate(el=>{
    const cls=String(el.className||'');
    return cls.includes('gcbg-option-row--selected')||
      Boolean(el.querySelector('mat-radio-button.mat-mdc-radio-checked'))||
      Boolean(el.querySelector('input[type="radio"]:checked'))||
      Boolean(el.querySelector('.gcbg-option-title .ds-icon-check-solid'));
  }).catch(()=>false);
}
async function clickUnderseatRow(row,label='trayecto'){
  if(await underseatRowSelected(row))return true;
  const targets=[
    row.locator('.gcbg-option-row__right .mdc-radio-touch-target').first(),
    row.locator('.gcbg-option-row__right .mdc-radio').first(),
    row.locator('.gcbg-option-row__right mat-radio-button').first(),
    row.locator('.gcbg-option-row__right').first(),
    row
  ];
  for(const target of targets){
    if(await target.count().catch(()=>0)){
      await target.scrollIntoViewIfNeeded().catch(()=>{});
      await target.click({force:true,timeout:5000}).catch(()=>{});
      const deadline=Date.now()+4500;
      while(Date.now()<deadline){if(await underseatRowSelected(row))return true;await pause(row.page(),160);}
    }
  }
  // Último fallback: ejecutar el click nativo sobre el control visible. En la versión
  // Angular observada el input está oculto, pero el touch target sí representa el gesto real.
  await row.evaluate(el=>{
    const target=el.querySelector('.gcbg-option-row__right .mdc-radio-touch-target')||
      el.querySelector('.gcbg-option-row__right .mdc-radio')||
      el.querySelector('.gcbg-option-row__right mat-radio-button')||
      el.querySelector('.gcbg-option-row__right')||el;
    target?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    target?.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    target?.click?.();
  }).catch(()=>{});
  const deadline=Date.now()+5000;
  while(Date.now()<deadline){if(await underseatRowSelected(row))return true;await pause(row.page(),180);}
  throw new Error(`No se pudo seleccionar la pieza bajo el asiento para ${label}.`);
}
async function selectUnderseatInJourney(page,journey,label='trayecto'){
  // El texto «1 pieza de equipaje de mano» también aparece dentro de la descripción
  // de la opción de 2 piezas. Por eso se localiza exclusivamente el TÍTULO exacto.
  // Vueling usa Angular Material: el input radio nativo está oculto y no siempre
  // responde a check({force:true}). La selección se confirma por el estado visual
  // real de la fila (gcbg-option-row--selected / mat-mdc-radio-checked).
  const title=journey.locator('.gcbg-option-title').filter({hasText:/^\s*1\s+pieza\s+de\s+equipaje\s+de\s+mano\s*$/i}).first();
  await title.waitFor({state:'attached',timeout:18000});
  const row=title.locator('xpath=ancestor::div[contains(@class,"gcbg-option-row")][1]');
  await row.waitFor({state:'attached',timeout:12000});
  if(!(await clickUnderseatRow(row,label)))throw new Error(`No se pudo seleccionar la pieza bajo el asiento para ${label}.`);
}
async function selectUnderseatForPassengerCard(page,card,passengerLabel){
  const header=card.locator('mat-expansion-panel-header').first();
  if(await isVisible(header)){
    const expanded=await header.getAttribute('aria-expanded').catch(()=>null);
    if(expanded==='false'){
      await header.click({force:true}).catch(async()=>card.locator('.gcbg-pax-header').first().click({force:true}).catch(()=>{}));
      await pause(page,500);
    }
  }
  const journeys=card.locator('.gcbg-pax-content__journey');
  const count=await journeys.count().catch(()=>0);
  if(count<2)throw new Error(`No aparecen ida y vuelta de equipaje de mano para ${passengerLabel}.`);
  for(let i=0;i<count;i++){
    const journey=journeys.nth(i);
    if(!(await isVisible(journey)))continue;
    const route=(await journey.locator('.gcbg-pax-content__journey-label').first().textContent().catch(()=>'' )).trim()||`trayecto ${i+1}`;
    await selectUnderseatInJourney(page,journey,`${passengerLabel} · ${route}`);
  }
  const headerText=await card.locator('.gcbg-pax-header').innerText().catch(()=>'');
  if(/2 piezas de equipaje/i.test(headerText))throw new Error(`${passengerLabel}: Vueling ha dejado seleccionada la opción de 2 piezas en equipaje de mano.`);
  if(/Sin seleccionar/i.test(headerText))throw new Error(`${passengerLabel}: queda algún trayecto de equipaje de mano sin seleccionar.`);
}
async function selectUnderseatOption(page){
  if(!config.underseatBag)return;
  await page.getByText(/EQUIPAJE DE MANO/i).first().waitFor({state:'visible',timeout:60000});
  const adults=Math.max(1,Number(config.adults)||1);

  // La interfaz actual de Vueling usa pestañas «PARA TODOS / POR PASAJERO», no un switch.
  // Usamos «POR PASAJERO» para poder verificar de forma inequívoca ida y vuelta de cada viajero.
  // Si la configuración pide la misma selección para todos, aplicamos exactamente la misma opción
  // a cada pasajero; el resultado económico y de equipaje es el mismo, pero evita que una variante
  // A/B de Vueling seleccione accidentalmente la opción de 2 piezas (+40 €).
  if(adults>1){
    const perPax=page.getByRole('tab',{name:/^\s*POR PASAJERO\s*$/i}).first();
    if(await isVisible(perPax)){
      if((await perPax.getAttribute('aria-selected').catch(()=>''))!=='true'){await perPax.click({force:true});await pause(page,600);}
    }else{
      const text=page.getByText(/^\s*POR PASAJERO\s*$/i).first();if(await isVisible(text)){await text.click({force:true});await pause(page,600);}
    }
  }

  let cards=page.locator('vy-gcbg-pax-card');
  const cardCount=await cards.count().catch(()=>0);
  if(cardCount>=adults){
    for(let i=0;i<adults;i++){
      const card=cards.nth(i);
      const name=(await card.locator('.gcbg-pax-header__name').first().textContent().catch(()=>'' )).trim()||`Pasajero ${i+1}`;
      await selectUnderseatForPassengerCard(page,card,name);
    }
  }else{
    // Fallback para una variante sin tarjetas por pasajero: selecciona la opción exacta
    // en cada trayecto visible, nunca el texto descriptivo de la opción de 2 piezas.
    const journeys=page.locator('.gcbg-pax-content__journey');
    const n=await journeys.count().catch(()=>0);if(n<2)throw new Error('No se localizaron los trayectos de equipaje de mano.');
    for(let i=0;i<n;i++){const journey=journeys.nth(i);if(await isVisible(journey))await selectUnderseatInJourney(page,journey,`trayecto ${i+1}`);}
  }

  const body=await page.locator('body').innerText().catch(()=>'');
  if(/2 piezas de equipaje/i.test(body)&&/Selección pendiente/i.test(body)){
    console.log('[vueling] Aviso: existe texto de 2 piezas en la página; se verifican las tarjetas de pasajero antes de continuar.');
  }
  console.log(`[vueling] Equipaje de mano: 1 pieza bajo el asiento seleccionada en ida y vuelta para ${adults} pasajero${adults===1?'':'s'}.`);
}
async function ensureCheckedBaggageVisible(page){
  const heading=page.getByText(/EQUIPAJE FACTURADO(?: EN BODEGA)?|Añade tu maleta ahora/i).first();
  await heading.waitFor({state:'visible',timeout:30000});await heading.scrollIntoViewIfNeeded().catch(()=>{});await pause(page,350);
  const kg=Number(config.checkedBagKg)||25,weightPattern=new RegExp(`(?:MALETA DE\\s*)?${kg}\\s*KG`,'i');
  const mobileRow=page.locator('bags-selector-distinct').filter({hasText:weightPattern}).first();
  if(await isVisible(mobileRow))return mobileRow;
  const weightText=page.getByText(weightPattern).first();if(await isVisible(weightText))return weightText;
  // En algunas variantes Vueling muestra antes una tarjeta «Añade tu maleta ahora».
  const add=page.getByRole('button',{name:/desde\s*\d+.*€|añade tu maleta|añadir maleta/i}).first();
  if(await isVisible(add)){await add.click({force:true});await pause(page,850);}
  await page.getByText(weightPattern).first().waitFor({state:'visible',timeout:30000});
  return page.getByText(weightPattern).first();
}
async function selectPassengerForCheckedBag(page){
  const passenger=Math.max(1,Number(config.checkedBagPassenger)||1);
  const values=[[config.passenger1FirstName,config.passenger1LastName],[config.passenger2FirstName,config.passenger2LastName]];
  const full=(values[passenger-1]||[]).filter(Boolean).join(' ').trim();
  if(full){
    const labels=page.getByText(flightPattern(full));const n=await labels.count().catch(()=>0);
    for(let i=0;i<n;i++){const loc=labels.nth(i);if(await isVisible(loc)){await loc.click({force:true}).catch(()=>{});await pause(page,350);console.log(`[vueling] Equipaje facturado asignado al pasajero ${passenger}: ${full}.`);return;}}
  }
  const tabs=page.getByRole('tab');const count=await tabs.count().catch(()=>0);if(count>=passenger){await tabs.nth(passenger-1).click({force:true});await pause(page,400);}
}
async function setTouchCounter(counter,target,label){
  const value=counter.locator('.value').first();
  await value.waitFor({state:'visible',timeout:12000});
  const read=async()=>Number.parseInt(String(await value.textContent().catch(()=>'' )).replace(/\D/g,''),10)||0;
  let current=await read(),guard=0;
  while(current!==target&&guard++<8){
    const buttons=counter.locator('button');const n=await buttons.count().catch(()=>0);if(n<2)throw new Error(`No aparecen los controles +/- de ${label}.`);
    const button=current<target?buttons.last():buttons.first();
    await button.click({force:true,timeout:7000});await new Promise(r=>setTimeout(r,350));current=await read();
  }
  if(current!==target)throw new Error(`No se pudo dejar ${label} en ${target}; valor actual ${current}.`);
}
async function setBagDirectionCounters(page,row,outboundCount,returnCount){
  const outbound=row.locator('.bags-selector--outbound touch-counter').first(),inbound=row.locator('.bags-selector--inbound touch-counter').first();
  if(await isVisible(outbound)&&await isVisible(inbound)){
    await setTouchCounter(outbound,outboundCount,'maleta IDA');
    await setTouchCounter(inbound,returnCount,'maleta VUELTA');
    return true;
  }
  // Fallback para la maquetación de escritorio: busca el bloque que contiene IDA/VUELTA y sus botones.
  for(const [pattern,target,label] of [[/^IDA$/i,outboundCount,'maleta IDA'],[/^VUELTA$/i,returnCount,'maleta VUELTA']]){
    const text=row.getByText(pattern).first();if(!(await isVisible(text)))return false;
    const group=text.locator('xpath=ancestor::*[self::div][.//button][1]');
    const value=group.locator('.value').first();let current=Number.parseInt(String(await value.textContent().catch(()=>'' )).replace(/\D/g,''),10)||0,guard=0;
    while(current!==target&&guard++<8){const buttons=group.locator('button');const n=await buttons.count().catch(()=>0);if(n<2)throw new Error(`No aparecen los controles +/- de ${label}.`);await (current<target?buttons.last():buttons.first()).click({force:true});await new Promise(r=>setTimeout(r,300));current=Number.parseInt(String(await value.textContent().catch(()=>'' )).replace(/\D/g,''),10)||0;}
    if(current!==target)throw new Error(`No se pudo dejar ${label} en ${target}.`);
  }
  return true;
}
async function configureCheckedBaggage(page){
  const count=Math.max(0,Number(config.checkedBagCount)||0);if(!count){console.log('[vueling] Sin maleta facturada configurada.');return;}
  await ensureCheckedBaggageVisible(page);
  const adults=Math.max(1,Number(config.adults)||1);
  // No usamos «Misma selección para todos»: la maleta pertenece al pasajero configurado.
  if(adults>1)await setSwitchNearText(page,/Misma selección para todos/i,false,{index:0,label:'Misma selección para todos · equipaje facturado'}).catch(()=>false);
  // Tampoco usamos el atajo «Mismo equipaje para ida y vuelta»: fijamos IDA y VUELTA por separado.
  // Así el resultado es estable en la interfaz móvil y de escritorio de Vueling.
  await setSwitchNearText(page,/Mismo equipaje para ida y vuelta/i,false,{index:0,label:'Mismo equipaje ida/vuelta'}).catch(()=>false);
  await selectPassengerForCheckedBag(page);
  const kg=Number(config.checkedBagKg)||25,weightPattern=new RegExp(`(?:MALETA DE\\s*)?${kg}\\s*KG`,'i');
  let row=page.locator('bags-selector-distinct').filter({hasText:weightPattern}).first();
  if(!(await isVisible(row))){const rowText=page.getByText(weightPattern).first();await rowText.waitFor({state:'visible',timeout:20000});row=rowText.locator('xpath=ancestor::*[self::div or self::li][.//button][1]');}
  const inboundCount=config.sameBaggageRoundTrip?count:0;
  if(!(await setBagDirectionCounters(page,row,count,inboundCount)))throw new Error(`No se pudieron localizar los contadores IDA/VUELTA para ${kg} kg.`);
  await pause(page,700);
  const body=await page.locator('body').innerText().catch(()=>'');
  console.log(`[vueling] Maleta ${kg} kg seleccionada manualmente · IDA ${count} · VUELTA ${inboundCount} · pasajero ${config.checkedBagPassenger||1}. ${/Total maletas/i.test(body)?'Total actualizado.':''}`);
}
async function dismissExtraBagUpsell(page){
  const dialog=page.locator('mat-dialog-container,.cdk-overlay-pane,[role="dialog"]').filter({hasText:/AÑADE AHORA UNA MALETA|¿Y SI NO TE CABE TODO EN TU EQUIPAJE DE MANO\?/i}).last();
  if(!(await isVisible(dialog)))return false;
  let skip=dialog.getByRole('button',{name:/CONTINUAR SIN AÑADIR MALETA/i}).first();
  if(!(await isVisible(skip)))skip=dialog.getByText(/CONTINUAR SIN AÑADIR MALETA/i).first();
  if(!(await isVisible(skip)))throw new Error('Apareció la oferta de otra maleta, pero no «Continuar sin añadir maleta».');
  await skip.click({force:true,timeout:10000});await page.locator('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing').waitFor({state:'hidden',timeout:15000}).catch(()=>{});await dialog.waitFor({state:'hidden',timeout:15000}).catch(()=>{});await pause(page,650);
  console.log('[vueling] Oferta adicional de maleta descartada.');return true;
}
async function extrasPageActive(page){
  const url=String(page.url()||'');
  if(/\/booking\/extras/i.test(url))return true;
  // La interfaz móvil observada en GitHub Actions no cambia siempre a /booking/extras:
  // muestra «Personalizar» con tarjetas Asientos, Equipaje facturado, Flex Pack, Seguros, etc.
  const body=String(await page.locator('body').textContent().catch(()=>''));
  const personalized=/\bPersonalizar\b/i.test(body)&&/\bSeguros\b/i.test(body)&&/Equipaje facturado/i.test(body);
  const insuranceDetail=/PREFIERO CONTINUAR SIN ASEGURAR MI VIAJE|\bSIN SEGURO\b|ASEGURA TU VIAJE/i.test(body);
  return personalized||insuranceDetail;
}
async function clickCheckedBagAcceptIfPresent(page){
  // En la vista específica «Equipaje facturado» Vueling muestra primero ACEPTAR.
  // Ese botón NO lleva todavía a Extras: vuelve a «Escoge tu equipaje» mostrando «Maletas añadidas».
  let accept=page.locator('footer-breakdown .cta button').filter({hasText:/^\s*ACEPTAR\s*$/i}).last();
  if(!(await isVisible(accept)))accept=page.getByRole('button',{name:/^ACEPTAR$/i}).last();
  if(!(await isVisible(accept)))return false;
  await accept.scrollIntoViewIfNeeded().catch(()=>{});
  await accept.click({timeout:10000}).catch(()=>accept.click({force:true,timeout:5000}));
  console.log('[vueling] Maleta facturada aceptada; regresando a la pantalla principal de equipaje.');
  await pause(page,650);
  return true;
}
async function clickMainLuggageContinueIfReady(page){
  // Tras ACEPTAR la maleta, Vueling vuelve a «Escoge tu equipaje». Allí hay que pulsar CONTINUAR
  // antes de que aparezca la oferta adicional «Añade ahora una maleta».
  const added=page.getByText(/Maletas añadidas/i).first();
  if(!(await isVisible(added)))return false;
  let cont=page.locator('footer-breakdown .cta button').filter({hasText:/^\s*CONTINUAR\s*$/i}).last();
  if(!(await isVisible(cont)))cont=page.getByRole('button',{name:/^CONTINUAR$/i}).last();
  if(!(await isVisible(cont)))return false;
  await cont.scrollIntoViewIfNeeded().catch(()=>{});
  await cont.click({timeout:10000}).catch(()=>cont.click({force:true,timeout:5000}));
  console.log('[vueling] Pantalla principal de equipaje confirmada; CONTINUAR pulsado.');
  await pause(page,650);
  return true;
}
async function continueFromLuggage(page){
  // Flujo real observado en Vueling (diagnóstico 15):
  // 1) ACEPTAR en «Equipaje facturado».
  // 2) Regreso a «Escoge tu equipaje» con «Maletas añadidas».
  // 3) CONTINUAR en el footer principal.
  // 4) Popup de venta adicional -> «CONTINUAR SIN AÑADIR MALETA».
  // 5) Extras.
  const deadline=Date.now()+90000;let accepted=false,mainContinued=false,lastLog=0;
  while(Date.now()<deadline){
    if(await extrasPageActive(page)){console.log('[vueling] Equipaje confirmado; pantalla de Extras abierta.');return;}
    if(await dismissExtraBagUpsell(page)){await snapshot(page,'07e-upsell-maleta-descartado').catch(()=>{});continue;}
    if(!accepted){
      accepted=await clickCheckedBagAcceptIfPresent(page);
      if(accepted){await snapshot(page,'07c-maleta-aceptada').catch(()=>{});continue;}
      // Si la ejecución ya estaba en la pantalla principal, consideramos ACEPTAR resuelto.
      if(await isVisible(page.getByText(/Maletas añadidas/i).first()))accepted=true;
    }
    if(accepted&&!mainContinued){
      mainContinued=await clickMainLuggageContinueIfReady(page);
      if(mainContinued){await snapshot(page,'07d-equipaje-continuado').catch(()=>{});continue;}
    }
    if(Date.now()-lastLog>10000){
      lastLog=Date.now();
      const state=await page.locator('body').innerText().catch(()=>'');
      console.log(`[vueling] Esperando transición Equipaje → Extras. ACEPTAR=${accepted?'sí':'no'} · CONTINUAR principal=${mainContinued?'sí':'no'} · maletas añadidas=${/Maletas añadidas/i.test(state)?'sí':'no'}.`);
    }
    await pause(page,500);
  }
  throw new Error(`Vueling no avanzó de Equipaje facturado a Extras. Estado: ACEPTAR=${accepted?'resuelto':'pendiente'}, CONTINUAR principal=${mainContinued?'pulsado':'pendiente'}.`);
}
async function insuranceDetailActive(page){
  const body=String(await page.locator('body').innerText().catch(()=>''));
  return /PREFIERO CONTINUAR SIN ASEGURAR MI VIAJE/i.test(body)||/^SIN SEGURO$/im.test(body)||(/\bSeguros\b/i.test(body)&&/Total seguros/i.test(body)&&/\bAceptar\b/i.test(body));
}
async function openInsuranceOptions(page){
  // Si ya estamos dentro de la pantalla de seguros, no hay nada que abrir.
  if(await insuranceDetailActive(page))return;

  // En GitHub Actions, tras Equipaje se abre primero «Personalizar» y hay que entrar
  // expresamente en la tarjeta «Seguros» pulsando «Contratar».
  let insurance=page.locator('vy-insurances-card').first();
  if(!(await isVisible(insurance))){
    const title=page.getByText(/^SEGUROS$/i).first();
    if(await isVisible(title))insurance=title.locator('xpath=ancestor::vy-insurances-card[1]');
  }
  if(!(await isVisible(insurance)))throw new Error('No se encontró la tarjeta «Seguros» en Personalizar.');
  let open=insurance.getByText(/^CONTRATAR$/i).first();
  if(!(await isVisible(open)))open=insurance.locator('.ssr-button').filter({hasText:/Contratar/i}).first();
  if(!(await isVisible(open)))open=insurance;
  await open.scrollIntoViewIfNeeded().catch(()=>{});
  await open.click({timeout:10000}).catch(()=>open.click({force:true,timeout:5000}));
  console.log('[vueling] Tarjeta Seguros abierta desde Personalizar.');
  const deadline=Date.now()+70000;
  while(Date.now()<deadline){if(await insuranceDetailActive(page))break;await pause(page,450);}
  if(!(await insuranceDetailActive(page)))throw new Error('Se abrió Seguros, pero no apareció la pantalla de selección/confirmación.');
  await pause(page,700);await snapshot(page,'08-seguros-abiertos').catch(()=>{});
}
async function clickInsuranceFooterAction(page,pattern){
  let button=page.locator('footer-breakdown .cta button').filter({hasText:pattern}).last();
  if(!(await isVisible(button)))button=page.getByRole('button',{name:pattern}).last();
  if(!(await isVisible(button)))button=page.getByText(pattern).last();
  if(!(await isVisible(button)))return false;
  await button.scrollIntoViewIfNeeded().catch(()=>{});
  await button.click({timeout:10000}).catch(()=>button.click({force:true,timeout:5000}));
  await pause(page,700);return true;
}
async function returnFromInsuranceAndContinue(page){
  // Después de confirmar «sin seguro», Vueling vuelve a «Personalizar»; allí hay otro CONTINUAR.
  const deadline=Date.now()+50000;
  while(Date.now()<deadline){
    const body=String(await page.locator('body').innerText().catch(()=>''));
    if(/ÚLTIMO PASO|ASÍ QUEDA TU VIAJE|¿CÓMO PREFIERES PAGAR\?/i.test(body))return;
    if(/\bPersonalizar\b/i.test(body)&&/Equipaje facturado/i.test(body)&&/\bSeguros\b/i.test(body)){
      let cont=page.locator('footer-breakdown .cta button').filter({hasText:/^\s*CONTINUAR\s*$/i}).last();
      if(!(await isVisible(cont)))cont=page.getByRole('button',{name:/^CONTINUAR$/i}).last();
      if(!(await isVisible(cont)))cont=page.getByText(/^CONTINUAR$/i).last();
      if(await isVisible(cont)){
        await cont.scrollIntoViewIfNeeded().catch(()=>{});
        await cont.click({timeout:10000}).catch(()=>cont.click({force:true,timeout:5000}));
        console.log('[vueling] Personalizar confirmado; CONTINUAR pulsado hacia Pago.');
        break;
      }
    }
    await pause(page,450);
  }
  await page.getByText(/ÚLTIMO PASO|ASÍ QUEDA TU VIAJE|¿CÓMO PREFIERES PAGAR\?/i).first().waitFor({state:'visible',timeout:80000});
}
async function selectNoInsuranceAndContinue(page){
  await page.getByText(/Personalizar|SEGUROS|PREFIERO CONTINUAR SIN ASEGURAR MI VIAJE|ASEGURA TU VIAJE|SIN SEGURO/i).first().waitFor({state:'visible',timeout:70000});
  await openInsuranceOptions(page);

  const body=String(await page.locator('body').innerText().catch(()=>''));
  const defaultZero=/Total seguros/i.test(body)&&/0[,.]00\s*€/i.test(body);

  if(defaultZero){
    // Variante móvil observada en el diagnóstico 17: no existe una tarjeta «Sin seguro».
    // Si no se ha añadido ningún seguro, el footer muestra «Total seguros 0,00 €» y basta ACEPTAR.
    const footer=String(await page.locator('footer-breakdown').innerText().catch(()=>''));
    const total=euroNumber(footer);
    if(total>0.01)throw new Error(`Vueling muestra seguros añadidos por ${moneyText(total)} cuando debería ser 0,00 €.`);
    if(!(await clickInsuranceFooterAction(page,/^\s*ACEPTAR\s*$/i)))throw new Error('Seguros está a 0,00 €, pero no apareció el botón ACEPTAR.');
    console.log('[vueling] Seguros confirmados a 0,00 €; no se ha contratado ninguna cobertura.');
  }else{
    // Variante que muestra explícitamente «Prefiero continuar sin asegurar mi viaje».
    let noInsurance=page.getByText(/PREFIERO CONTINUAR SIN ASEGURAR MI VIAJE/i).first();
    if(await isVisible(noInsurance)){
      const host=noInsurance.locator('xpath=ancestor::*[self::label or self::div or self::section][.//input[@type="radio" or @type="checkbox"]][1]');
      const input=host.locator('input[type="radio"],input[type="checkbox"]').first();
      if(await input.count().catch(()=>0))await input.check({force:true}).catch(()=>noInsurance.click({force:true}));else await noInsurance.click({force:true});
    }else{
      // Variante escritorio: tarjeta exacta «SIN SEGURO» / 0,00 €.
      noInsurance=page.getByText(/^SIN SEGURO$/i).first();
      await noInsurance.waitFor({state:'visible',timeout:40000});
      await noInsurance.scrollIntoViewIfNeeded().catch(()=>{});
      let card=noInsurance.locator('xpath=ancestor::*[self::div or self::article or self::section][.//*[contains(normalize-space(.),"0,00")]][1]');
      if(!(await card.count().catch(()=>0)))card=noInsurance.locator('xpath=ancestor::*[self::div or self::article or self::section][1]');
      let zero=card.getByRole('button',{name:/0+[,.]00\s*€/i}).first();
      if(!(await isVisible(zero)))zero=card.getByText(/0+[,.]00\s*€/i).last();
      if(await isVisible(zero))await zero.click({force:true,timeout:8000});else await noInsurance.click({force:true,timeout:8000});
    }
    await pause(page,500);
    // Según la variante, la pantalla de seguros se confirma con ACEPTAR o CONTINUAR.
    if(!(await clickInsuranceFooterAction(page,/^\s*ACEPTAR\s*$/i)))await clickInsuranceFooterAction(page,/^\s*CONTINUAR\s*$/i);
    console.log('[vueling] Seguro rechazado: continuar sin asegurar el viaje.');
  }

  await snapshot(page,'08a-sin-seguro').catch(()=>{});
  await returnFromInsuranceAndContinue(page);
  await pause(page,900);
  console.log('[vueling] Pantalla final de pago alcanzada; no se introducirá ningún medio de pago.');
}
async function finalSummaryDomText(page){
  // En la pantalla de Pago Vueling ya inserta <booking-breakdown> completo en el DOM aunque el panel
  // «Detalles de tu reserva» siga visualmente colapsado. textContent permite leer ese desglose sin
  // hacer ningún clic adicional ni depender de animaciones/overlays del footer.
  const breakdown=page.locator('booking-breakdown').first();
  if(await breakdown.count().catch(()=>0)){
    const text=String(await breakdown.textContent().catch(()=>'')).replace(/\u00a0/g,' ');
    if(/TOTAL IDA/i.test(text)&&/TOTAL VUELTA/i.test(text)&&/(?:PRECIO TOTAL|TOTAL RESERVA)/i.test(text))return text;
  }
  const footer=page.locator('footer-breakdown').first();
  if(await footer.count().catch(()=>0)){
    const text=String(await footer.textContent().catch(()=>'')).replace(/\u00a0/g,' ');
    if(/TOTAL IDA/i.test(text)&&/TOTAL VUELTA/i.test(text)&&/(?:PRECIO TOTAL|TOTAL RESERVA)/i.test(text))return text;
  }
  return String(await page.locator('body').textContent().catch(()=>'')).replace(/\u00a0/g,' ');
}
async function openFinalSummary(page){
  const domText=await finalSummaryDomText(page);
  if(/TOTAL IDA/i.test(domText)&&/TOTAL VUELTA/i.test(domText)&&/(?:PRECIO TOTAL|TOTAL RESERVA)/i.test(domText)){
    console.log('[vueling] Pantalla final alcanzada: el desglose ya está presente en el DOM aunque permanezca colapsado.');
    return false;
  }
  // Fallback para variantes en las que Vueling no inserta el desglose hasta abrir «Detalles de tu reserva».
  const candidates=[
    page.locator('footer-breakdown .breakdown-header .total').first(),
    page.locator('footer-breakdown .new-toggle').first(),
    page.locator('footer-breakdown .breakdown-header').first(),
    page.locator('sb-breakdown .breakdown-header').first(),
    page.getByText(/DETALLES DE TU RESERVA/i).first(),
    page.getByText(/TOTAL RESERVA/i).first()
  ];
  for(const trigger of candidates){
    if(!(await isVisible(trigger)))continue;
    await trigger.click({force:true,timeout:7000}).catch(()=>{});await pause(page,450);
    const text=await finalSummaryDomText(page);
    if(/TOTAL IDA/i.test(text)&&/TOTAL VUELTA/i.test(text)&&/(?:PRECIO TOTAL|TOTAL RESERVA)/i.test(text)){console.log('[vueling] Desglose final abierto desde «Detalles de tu reserva».');return true;}
  }
  throw new Error('La pantalla de Pago está abierta, pero Vueling todavía no ha insertado el desglose final en el DOM.');
}
async function waitForSummary(page){
  let body=await finalSummaryDomText(page);
  if(!(/TOTAL IDA/i.test(body)&&/TOTAL VUELTA/i.test(body)&&/(?:PRECIO TOTAL|TOTAL RESERVA)/i.test(body))){await openFinalSummary(page);body=await finalSummaryDomText(page);}
  const total=labeledMoney(body,'(?:PRECIO TOTAL|TOTAL RESERVA)')||moneyFromString((body.match(/^\s*([\d.]+,\d{2})\s*€/m)||[])[1]||'');
  const outStart=body.search(/\bIDA\b/i),retStart=body.search(/\bVUELTA\b/i);let outboundGross=labeledMoney(body,'TOTAL IDA'),returnGross=labeledMoney(body,'TOTAL VUELTA'),services=labeledMoney(body,'TOTAL SERVICIOS');
  const outText=outStart>=0&&retStart>outStart?body.slice(outStart,retStart):body;const retText=retStart>=0?body.slice(retStart):body;
  const baggageOutbound=baggageMoney(outText),baggageReturn=baggageMoney(retText),baggageLines=baggageOutbound+baggageReturn;
  let outbound=outboundGross,returnPrice=returnGross,baggage=services||baggageLines,mode='separate-services';
  const tol=.08;
  if(!(services>0&&Math.abs(total-(outboundGross+returnGross+services))<tol)){
    // Algunas variantes incluyen la maleta dentro de TOTAL IDA/TOTAL VUELTA.
    if(baggageLines>0){outbound=Math.max(0,outboundGross-baggageOutbound);returnPrice=Math.max(0,returnGross-baggageReturn);baggage=baggageLines;mode='baggage-inside-leg-totals';}
  }
  const otherServices=Math.max(0,total-(outbound+returnPrice+baggage));if(otherServices>tol)baggage+=otherServices;
  if(!(total>0&&outboundGross>0&&returnGross>0))throw new Error('La pantalla final apareció pero no se pudieron leer total, ida y vuelta del DOM.');
  if(Math.abs(total-(outbound+returnPrice+baggage))>.12)throw new Error(`El desglose no cuadra: total ${moneyText(total)} frente a ida+vuelta+maleta ${moneyText(outbound+returnPrice+baggage)}.`);
  console.log(`[vueling] Resumen final aceptado (${mode}) · ida ${moneyText(outbound)} · vuelta ${moneyText(returnPrice)} · maleta ${moneyText(baggage)} · TOTAL ${moneyText(total)}.`);
  return {total,outbound,return:returnPrice,baggage,services:baggage,outboundGross,returnGross,baggageOutbound,baggageReturn,otherServices};
}
async function monitorVueling(context,page){
  const deeplink=buildVuelingDeeplink();await page.goto(deeplink,{waitUntil:'domcontentloaded',timeout:60000});await pause(page,1200);await snapshot(page,'01a-antes-cookies');await acceptCookies(page);await snapshot(page,'01b-despues-cookies');
  const entry=await waitForVuelingEntryPage(context,page);page=entry.page;await acceptCookies(page);
  if(entry.mode==='preselected'){
    await verifyPreselectedItinerary(page);await snapshot(page,'01c-itinerario-preseleccionado');
    const continueButton=page.getByRole('button',{name:/^CONTINUAR$|^Continuar$/i}).first();
    await continueButton.waitFor({state:'visible',timeout:30000});
    await continueButton.scrollIntoViewIfNeeded().catch(()=>{});await continueButton.click({timeout:10000}).catch(()=>continueButton.click({force:true,timeout:5000}));await pause(page,1200);
    await snapshot(page,'02-itinerario-confirmado');
  }else{
    await applyDirectOnlyIfNeeded(page);await snapshot(page,'01c-resultados-vuelos');await assertFlightSelection(page);await selectRequestedFlights(page);
  }
  page=await waitForFarePage(context,page);await selectFlyLight(page);await snapshot(page,'04-fly-light');await continueFareAndReachContact(page);
  await snapshot(page,'04d-contacto-listo');await fillContactAndPassengers(page);await snapshot(page,'05-pasajeros');
  await skipSeats(page);await snapshot(page,'06a-asientos-omitidos');
  await selectUnderseatOption(page);await snapshot(page,'07a-equipaje-mano');
  await configureCheckedBaggage(page);await snapshot(page,'07b-maleta-facturada');
  await continueFromLuggage(page);await snapshot(page,'08-extras');
  await selectNoInsuranceAndContinue(page);await snapshot(page,'08b-pago');
  const prices=await waitForSummary(page);await snapshot(page,'09-resumen-final');
  const summaryBody=await finalSummaryDomText(page);
  const outboundTimeOk=!config.outboundTime||new RegExp(String(config.outboundTime).replace(':','[:h]'),'i').test(summaryBody),returnTimeOk=!config.returnTime||new RegExp(String(config.returnTime).replace(':','[:h]'),'i').test(summaryBody);
  const routesOk=new RegExp(`\\b${String(config.origin||'').toUpperCase()}\\b[\\s\\S]*\\b${String(config.destination||'').toUpperCase()}\\b`,'i').test(summaryBody)&&new RegExp(`\\b${String(config.destination||'').toUpperCase()}\\b[\\s\\S]*\\b${String(config.origin||'').toUpperCase()}\\b`,'i').test(summaryBody);
  if(!outboundTimeOk||!returnTimeOk||!routesOk)throw new Error(`El resumen final no confirma la ruta/horarios esperados (${config.origin} ${config.outboundTime} / ${config.destination} ${config.returnTime}).`);
  const outboundOk=true,returnOk=true;
  return {ok:true,status:'ok',availability:'Disponible',...prices,checkedAt:new Date().toISOString(),source:'Vueling · GitHub Actions + Playwright',deeplink,flightValidation:{outboundFlight:config.outboundFlight,returnFlight:config.returnFlight,outboundTime:config.outboundTime,returnTime:config.returnTime,outboundOk,returnOk,outboundTimeOk,returnTimeOk,routesOk,verifiedBeforeSummary:true},fare:config.fare,passengers:{adults:Number(config.adults)||1,children:Number(config.children)||0,infants:Number(config.infants)||0},baggageConfig:{underseatBag:Boolean(config.underseatBag),sameHandBaggageAllPassengers:config.sameHandBaggageAllPassengers!==false,checkedBagKg:Number(config.checkedBagKg)||0,checkedBagCount:Number(config.checkedBagCount)||0,checkedBagPassenger:Number(config.checkedBagPassenger)||1,sameBaggageRoundTrip:Boolean(config.sameBaggageRoundTrip),sameBaggageAllPassengers:Boolean(config.sameBaggageAllPassengers)}};
}

if(telegramTest){await sendTelegram(`🧪 MFE Viajes · Vueling Telegram OK\n${new Date().toLocaleString('es-ES',{timeZone:'Europe/Madrid'})}`);process.exit(0);}
if(!config.enabled&&!force){console.log('Monitor Vueling desactivado.');process.exit(0);}
const previous=await readLatest().catch(()=>null);
let browser;
try{browser=await chromium.launch({headless:true,channel:'chrome'});}catch{browser=await chromium.launch({headless:true});}
const context=await browser.newContext({locale:'es-ES',viewport:{width:430,height:932},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 16; MFE Viajes Monitor) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136 Mobile Safari/537.36'});
const page=await context.newPage();
try{
  const result=await monitorVueling(context,page);if(!dryRun)await postResult(result);else console.log('[vueling] DRY RUN: no se envía el resultado al Worker.');
  if(config.telegramEnabled&&!dryRun){const prior=Number(previous?.total)||0;const delta=prior?result.total-prior:0,drop=prior>0&&result.total<prior;const notify=Boolean(config.telegramNotifyEveryCheck)||(Boolean(config.telegramNotifyPriceDrop)&&drop);if(notify)await sendTelegram(`✈️ Vueling · MFE Viajes\n${config.outboundFlight} ${config.origin}→${config.destination} · ${config.returnFlight} ${config.destination}→${config.origin}\nIda: ${moneyText(result.outbound)}\nVuelta: ${moneyText(result.return)}\nMaleta: ${moneyText(result.baggage)}\nTOTAL: ${moneyText(result.total)}${prior?`\nCambio: ${delta>=0?'+':''}${moneyText(delta)}`:''}`);}
  console.log('[vueling] OK',JSON.stringify(result));
}catch(error){const result={ok:false,status:'error',error:error?.message||String(error),checkedAt:new Date().toISOString(),source:'Vueling · GitHub Actions + Playwright'};console.error('[vueling] ERROR',error);await snapshot(page,'99-error').catch(()=>{});if(!dryRun)await postResult(result).catch(e=>console.error('No se pudo guardar el error:',e.message));if(config.telegramEnabled&&!dryRun)await sendTelegram(`🔴 Vueling · error del monitor\n${result.error}`).catch(()=>{});process.exitCode=1;
}finally{await context.close().catch(()=>{});await browser.close().catch(()=>{});}
