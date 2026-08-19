// MFE_VUELING_AUTOMATION_VERSION: 1.0.2
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ARTIFACTS=path.resolve('artifacts/vueling');
const CONFIG_FILE=new URL('./vueling-config.json',import.meta.url);
const defaults={
  enabled:true,origin:'BIO',destination:'LPA',departureDate:'2026-09-14',returnDate:'2026-09-21',
  outboundFlight:'VY3272',returnFlight:'VY3271',outboundTime:'06:50',returnTime:'16:40',directOnly:true,
  adults:2,children:0,infants:0,fare:'FLY LIGHT',underseatBag:true,
  checkedBagKg:25,checkedBagCount:1,checkedBagPassenger:1,sameBaggageRoundTrip:true,sameBaggageAllPassengers:false,
  contactFirstName:'Fjie',contactLastName:'Kfkfr',email:'jdje@g.com',country:'España',phonePrefix:'+34',phone:'654654654',
  passenger1FirstName:'Fjie',passenger1LastName:'Kfkfr',passenger2FirstName:'Prueba',passenger2LastName:'Mfe',
  marketingConsent:false,telegramEnabled:true,telegramNotifyEveryCheck:true,telegramNotifyPriceDrop:true,
  reservedPrice:0,scheduleTime:'09:00',scheduleTimeZone:'Europe/Madrid'
};
const saved=JSON.parse(await fs.readFile(CONFIG_FILE,'utf8'));
const config={...defaults,...(saved.vueling||saved||{})};
const force=/^(1|true|yes)$/i.test(String(process.env.MFE_FORCE_RUN||''));
const telegramTest=/^(1|true|yes)$/i.test(String(process.env.MFE_TEST_TELEGRAM||''));

function euroNumber(text=''){
  const raw=String(text).replace(/\u00a0/g,' ');
  const matches=[...raw.matchAll(/(?:€\s*)?(-?\d{1,3}(?:\.\d{3})*(?:,\d{2})|-?\d+(?:[.,]\d{2}))\s*€?/g)];
  if(!matches.length)return 0;
  const value=matches.at(-1)[1].replace(/\./g,'').replace(',','.');
  return Number.parseFloat(value)||0;
}
function moneyText(value){return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(value)||0);}
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
async function pageLooksLikePreselectedItinerary(page){
  const body=await page.locator('body').innerText().catch(()=>'');
  if(!/Tu vuelo a|Modificar/i.test(body)||!/Continuar/i.test(body))return false;
  const required=[config.outboundFlight,config.returnFlight,config.outboundTime,config.returnTime].filter(Boolean);
  return required.every(value=>flightPattern(value).test(body));
}
async function verifyPreselectedItinerary(page){
  const body=await page.locator('body').innerText().catch(()=>'');
  const checks=[
    ['vuelo de ida',config.outboundFlight],['hora de ida',config.outboundTime],
    ['vuelo de vuelta',config.returnFlight],['hora de vuelta',config.returnTime]
  ];
  const missing=checks.filter(([,value])=>value&&!flightPattern(value).test(body)).map(([label,value])=>`${label} ${value}`);
  if(missing.length)throw new Error(`El deeplink abrió un itinerario distinto al configurado. Falta confirmar: ${missing.join(', ')}.`);
  console.log(`[vueling] Itinerario preseleccionado confirmado: ${config.outboundFlight} ${config.outboundTime} / ${config.returnFlight} ${config.returnTime}.`);
}
async function waitForVuelingEntryPage(context,originPage,{timeoutMs=50000}={}){
  const deadline=Date.now()+timeoutMs;let searchClicked=false;
  while(Date.now()<deadline){
    for(const candidate of context.pages()){
      if(candidate.isClosed())continue;
      if(await pageLooksLikeFlightResults(candidate)){
        await candidate.bringToFront().catch(()=>{});await candidate.waitForLoadState('domcontentloaded',{timeout:10000}).catch(()=>{});
        console.log(`[vueling] Pantalla de resultados detectada en ${candidate.url()}`);return {page:candidate,mode:'results'};
      }
      if(await pageLooksLikePreselectedItinerary(candidate)){
        await candidate.bringToFront().catch(()=>{});console.log(`[vueling] El deeplink ya ha preseleccionado ida y vuelta en ${candidate.url()}`);return {page:candidate,mode:'preselected'};
      }
    }
    if(!searchClicked&&originPage&&!originPage.isClosed()){
      const searchButton=originPage.getByRole('button',{name:/^BUSCAR$|Buscar vuelos|Buscar/i}).first();
      if(await isVisible(searchButton)){
        searchClicked=true;console.log('[vueling] La búsqueda requiere pulsar BUSCAR; se acepta tanto nueva pestaña como navegación en la misma pestaña.');
        await searchButton.click({force:true}).catch(()=>{});await pause(originPage,900);
      }
    }
    await new Promise(resolve=>setTimeout(resolve,650));
  }
  const urls=context.pages().filter(x=>!x.isClosed()).map(x=>x.url()).join(' | ');
  throw new Error(`No apareció ni la selección de vuelos ni el itinerario preseleccionado de Vueling. Páginas abiertas: ${urls||'ninguna'}.`);
}
async function waitForFarePage(context,currentPage,{timeoutMs=45000}={}){
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
  const card=title.locator('xpath=ancestor::*[self::article or self::section or self::div][.//button][1]');
  const button=card.getByRole('button').filter({hasText:/0[,.]00|€|seleccionar|elegir/i}).last();
  if(await isVisible(button)){await button.click();await pause(page,1200);return;}
  if(!(await clickFirst(page,[title],{required:true,label:'tarifa FLY LIGHT'})))throw new Error('No se pudo seleccionar FLY LIGHT.');
}
async function continueAsGuest(page){await clickFirst(page,[page.getByRole('button',{name:/continuar como invitado|seguir como invitado|invitado/i}),page.getByText(/continuar como invitado/i)],{});}
async function fillContactAndPassengers(page){
  await fillFirst(page,[page.getByLabel(/^Nombre\*?$/i).first(),page.locator('input[placeholder^="Nombre"]:not([placeholder*="apellidos"])').first()],config.contactFirstName,{required:true,label:'Nombre de contacto'});
  await fillFirst(page,[page.getByLabel(/^Apellidos?\*?$/i).first(),page.locator('input[placeholder^="Apellidos"]').first()],config.contactLastName,{required:true,label:'Apellidos de contacto'});
  await fillFirst(page,[page.getByLabel(/Email/i),page.locator('input[type="email"]')],config.email,{required:true,label:'Email'});
  const country=page.getByLabel(/País de residencia/i).first();if(await isVisible(country)){await country.click();await pause(page,300);await clickFirst(page,[page.getByRole('option',{name:new RegExp(config.country,'i')}),page.getByText(new RegExp(`^${config.country}$`,'i'))],{required:true,label:`país ${config.country}`});}
  const prefix=page.getByLabel(/Prefijo/i).first();if(await isVisible(prefix)){await prefix.click();await pause(page,200);await clickFirst(page,[page.getByText(new RegExp(String(config.phonePrefix||'+34').replace('+','\\+')))],{});}
  await fillFirst(page,[page.getByLabel(/Teléfono móvil|Móvil|Teléfono/i),page.locator('input[type="tel"]')],config.phone,{required:true,label:'Teléfono móvil'});
  if(config.marketingConsent)await checkLabel(page,/Quiero recibir información y ofertas/i,true);else await checkLabel(page,/Quiero recibir información y ofertas/i,false);
  await checkLabel(page,/política de privacidad|acepto.*condiciones|he leído.*privacidad/i,true);
  // Rellena datos de viajeros adicionales si Vueling los solicita en esta misma pantalla.
  const visibleNames=page.locator('input').filter({has:page.locator('xpath=..')});
  const nameInputs=page.locator('input').filter({hasNot:page.locator('[type="hidden"]')});
  const all=await nameInputs.count().catch(()=>0);let travellerIndex=0;
  for(let i=0;i<all;i++){
    const el=nameInputs.nth(i),ph=String(await el.getAttribute('placeholder').catch(()=>'')),val=await el.inputValue().catch(()=>''),type=String(await el.getAttribute('type').catch(()=>''));
    if(val||type==='email'||type==='tel'||!/(^|\s)Nombre(\*|$)/i.test(ph))continue;
    travellerIndex++;const first=travellerIndex===1?config.passenger1FirstName:config.passenger2FirstName||`Pasajero${travellerIndex}`;await el.fill(String(first||'Prueba'));
  }
  const surnameInputs=page.locator('input[placeholder^="Apellidos"]');const sc=await surnameInputs.count().catch(()=>0);for(let i=1;i<sc;i++){const el=surnameInputs.nth(i);if(!(await el.inputValue().catch(()=>'')))await el.fill(i===1?String(config.passenger1LastName||'Kfkfr'):String(config.passenger2LastName||'Mfe'));}
  await clickFirst(page,[page.getByRole('button',{name:/CONTINUAR|Continuar/i})],{required:true,label:'Continuar después de pasajeros'});
}
async function skipSeatsAndExtras(page){
  await clickFirst(page,[page.getByRole('button',{name:/continuar sin asientos/i}),page.getByText(/continuar sin asientos/i)],{});
  await clickFirst(page,[page.getByRole('button',{name:/continuar sin seleccionar/i}),page.getByText(/continuar sin seleccionar/i)],{});
}
async function chooseUnderseatBag(page){
  if(!config.underseatBag)return;
  const matches=page.getByText(/Solo 1 pieza bajo el asiento|1 pieza de equipaje de mano bajo el asiento|40x30x20/i);const count=await matches.count().catch(()=>0);
  for(let i=0;i<Math.min(count,2);i++){
    const txt=matches.nth(i);if(!(await isVisible(txt)))continue;const card=txt.locator('xpath=ancestor::*[self::label or self::button or self::div][1]');await card.click({force:true}).catch(()=>txt.click({force:true}));await pause(page,250);
  }
}
async function openCheckedBaggage(page){
  const section=page.getByText(/Añade tu maleta ahora/i).first();if(await isVisible(section)){const box=section.locator('xpath=ancestor::*[self::section or self::div][.//button][1]');const b=box.getByRole('button').filter({hasText:/desde|€|añadir/i}).first();if(await isVisible(b)){await b.click();await pause(page);return;}}
  await clickFirst(page,[page.getByRole('button',{name:/desde\s*\d+.*€|añade.*maleta|añadir maleta/i})],{required:true,label:'Añade tu maleta ahora'});
}
async function configureCheckedBaggage(page){
  await checkLabel(page,/Mismo equipaje para ida y vuelta/i,Boolean(config.sameBaggageRoundTrip));
  await checkLabel(page,/Mismo equipaje para todos los viajeros/i,Boolean(config.sameBaggageAllPassengers));
  // Si hay pestañas por pasajero, selecciona el pasajero configurado.
  const passenger=Number(config.checkedBagPassenger)||1;if(passenger>1){const tabs=page.getByRole('tab');const count=await tabs.count().catch(()=>0);if(count>=passenger)await tabs.nth(passenger-1).click().catch(()=>{});}
  const kg=Number(config.checkedBagKg)||25;const rowText=page.getByText(new RegExp(`^${kg}\\s*KG$`,'i')).first();if(!(await isVisible(rowText)))throw new Error(`No aparece la opción de maleta de ${kg} kg.`);
  const row=rowText.locator('xpath=ancestor::*[self::div or self::li][.//button][1]');
  let plus=row.getByRole('button',{name:/\+|añadir|incrementar/i}).last();if(!(await isVisible(plus)))plus=row.locator('button').last();
  const count=Math.max(0,Number(config.checkedBagCount)||0);for(let i=0;i<count;i++){await plus.click({force:true});await pause(page,250);}
  await clickFirst(page,[page.getByRole('button',{name:/ACEPTAR|Aceptar/i})],{required:true,label:'Aceptar equipaje facturado'});
  await clickFirst(page,[page.getByRole('button',{name:/CONTINUAR|Continuar/i})],{});
  await clickFirst(page,[page.getByRole('button',{name:/continuar sin|no gracias|omitir/i}),page.getByText(/continuar sin/i)],{});
}
async function extractMoneyNear(page,labelPattern){
  const label=page.getByText(labelPattern).last();if(!(await isVisible(label)))return 0;
  const parent=label.locator('xpath=ancestor::*[self::div or self::section or self::li][1]');const text=await parent.innerText().catch(()=>label.innerText());return euroNumber(text);
}
async function waitForSummary(page){
  const totalLabel=page.getByText(/PRECIO TOTAL/i).last();await totalLabel.waitFor({state:'visible',timeout:45000});await pause(page,800);
  const total=await extractMoneyNear(page,/PRECIO TOTAL/i),outbound=await extractMoneyNear(page,/TOTAL IDA/i),returnPrice=await extractMoneyNear(page,/TOTAL VUELTA/i),services=await extractMoneyNear(page,/TOTAL SERVICIOS/i);
  if(!(total>0))throw new Error('La pantalla final apareció pero no se pudo leer PRECIO TOTAL.');
  const tolerance=.05;if(outbound>0&&returnPrice>0&&Math.abs(total-(outbound+returnPrice+services))>tolerance)console.warn('[vueling] El desglose no suma exactamente el total. Se guardará con advertencia.');
  return {total,outbound,return:returnPrice,baggage:services,services};
}
async function monitorVueling(context,page){
  const deeplink=buildVuelingDeeplink();await page.goto(deeplink,{waitUntil:'domcontentloaded',timeout:60000});await pause(page,1200);await snapshot(page,'01a-antes-cookies');await acceptCookies(page);await snapshot(page,'01b-despues-cookies');
  const entry=await waitForVuelingEntryPage(context,page);page=entry.page;await acceptCookies(page);
  if(entry.mode==='preselected'){
    await verifyPreselectedItinerary(page);await snapshot(page,'01c-itinerario-preseleccionado');
    await clickFirst(page,[page.getByRole('button',{name:/^CONTINUAR$|^Continuar$/i})],{required:true,label:'Continuar desde el itinerario preseleccionado'});
    await snapshot(page,'02-itinerario-confirmado');
  }else{
    await applyDirectOnlyIfNeeded(page);await snapshot(page,'01c-resultados-vuelos');await assertFlightSelection(page);await selectRequestedFlights(page);
  }
  page=await waitForFarePage(context,page);await selectFlyLight(page);await snapshot(page,'04-fly-light');await continueAsGuest(page);
  await fillContactAndPassengers(page);await snapshot(page,'05-pasajeros');
  await skipSeatsAndExtras(page);await snapshot(page,'06-sin-asientos');
  await chooseUnderseatBag(page);await openCheckedBaggage(page);await snapshot(page,'07-equipaje');
  await configureCheckedBaggage(page);const prices=await waitForSummary(page);await snapshot(page,'08-resumen-final');
  const body=await page.locator('body').innerText();
  const outboundOk=!config.outboundFlight||new RegExp(config.outboundFlight,'i').test(body),returnOk=!config.returnFlight||new RegExp(config.returnFlight,'i').test(body);
  const outboundTimeOk=!config.outboundTime||new RegExp(String(config.outboundTime).replace(':','[:h]'),'i').test(body),returnTimeOk=!config.returnTime||new RegExp(String(config.returnTime).replace(':','[:h]'),'i').test(body);
  if(!outboundOk||!returnOk||!outboundTimeOk||!returnTimeOk)throw new Error(`El resumen final no confirma los vuelos/horarios esperados (${config.outboundFlight} ${config.outboundTime} / ${config.returnFlight} ${config.returnTime}).`);
  return {ok:true,status:'ok',availability:'Disponible',...prices,checkedAt:new Date().toISOString(),source:'Vueling · GitHub Actions + Playwright',deeplink,flightValidation:{outboundFlight:config.outboundFlight,returnFlight:config.returnFlight,outboundTime:config.outboundTime,returnTime:config.returnTime,outboundOk,returnOk,outboundTimeOk,returnTimeOk},fare:config.fare,passengers:{adults:Number(config.adults)||1,children:Number(config.children)||0,infants:Number(config.infants)||0},baggageConfig:{underseatBag:Boolean(config.underseatBag),checkedBagKg:Number(config.checkedBagKg)||0,checkedBagCount:Number(config.checkedBagCount)||0,checkedBagPassenger:Number(config.checkedBagPassenger)||1,sameBaggageRoundTrip:Boolean(config.sameBaggageRoundTrip)}};
}

if(telegramTest){await sendTelegram(`🧪 MFE Viajes · Vueling Telegram OK\n${new Date().toLocaleString('es-ES',{timeZone:'Europe/Madrid'})}`);process.exit(0);}
if(!config.enabled&&!force){console.log('Monitor Vueling desactivado.');process.exit(0);}
const previous=await readLatest().catch(()=>null);
let browser;
try{browser=await chromium.launch({headless:true,channel:'chrome'});}catch{browser=await chromium.launch({headless:true});}
const context=await browser.newContext({locale:'es-ES',viewport:{width:430,height:932},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 16; MFE Viajes Monitor) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136 Mobile Safari/537.36'});
const page=await context.newPage();
try{
  const result=await monitorVueling(context,page);await postResult(result);
  if(config.telegramEnabled){const prior=Number(previous?.total)||0;const delta=prior?result.total-prior:0,drop=prior>0&&result.total<prior;const notify=Boolean(config.telegramNotifyEveryCheck)||(Boolean(config.telegramNotifyPriceDrop)&&drop);if(notify)await sendTelegram(`✈️ Vueling · MFE Viajes\n${config.outboundFlight} ${config.origin}→${config.destination} · ${config.returnFlight} ${config.destination}→${config.origin}\nIda: ${moneyText(result.outbound)}\nVuelta: ${moneyText(result.return)}\nMaleta/servicios: ${moneyText(result.baggage)}\nTOTAL: ${moneyText(result.total)}${prior?`\nCambio: ${delta>=0?'+':''}${moneyText(delta)}`:''}`);}
  console.log('[vueling] OK',JSON.stringify(result));
}catch(error){const result={ok:false,status:'error',error:error?.message||String(error),checkedAt:new Date().toISOString(),source:'Vueling · GitHub Actions + Playwright'};console.error('[vueling] ERROR',error);await snapshot(page,'99-error').catch(()=>{});await postResult(result).catch(e=>console.error('No se pudo guardar el error:',e.message));if(config.telegramEnabled)await sendTelegram(`🔴 Vueling · error del monitor\n${result.error}`).catch(()=>{});process.exitCode=1;
}finally{await context.close().catch(()=>{});await browser.close().catch(()=>{});}
