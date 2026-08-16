// MFE_AUTOREISEN_AUTOMATION_VERSION: 2.1.75
import {acceptCookies,clickFirst,daysBetween,fillFirst,isoNow,money,snapshot} from './lib.mjs';

const MONTH_TOKENS={
  1:['ene','jan','january','enero'],2:['feb','february','febrero'],3:['mar','march','marzo'],4:['abr','apr','april','abril'],
  5:['may','mayo'],6:['jun','june','junio'],7:['jul','july','julio'],8:['ago','aug','august','agosto'],
  9:['sep','sept','september','septiembre'],10:['oct','october','octubre'],11:['nov','november','noviembre'],12:['dic','dec','december','diciembre']
};
const OFFICE_IDS=new Map([
  ['tenerife norte','1'],['tfn','1'],['tenerife sur','2'],['tfs','2'],['lanzarote','3'],['ace','3'],
  ['gran canaria aeropuerto','18'],['gran canaria airport','18'],['gran canaria aerodrome','18'],['lpa','18'],['fuerteventura','19'],['fue','19']
]);
const MODEL_STOPWORDS=new Set(['o','or','oder','ou','similar','similaire','similarer','similaren','similarmente','tsi','reference']);
const KNOWN_CAR_IDS=new Map([['seat arona','119']]);

function normalize(value=''){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}
function dateParts(value){
  const raw=String(value||'');const d=new Date(raw);return {date:raw.slice(0,10),day:String(d.getDate()).padStart(2,'0'),month:d.getMonth()+1,year:String(d.getFullYear()),hour:String(d.getHours()).padStart(2,'0'),minute:String(d.getMinutes()).padStart(2,'0')};
}
function resultsEntryUrl(raw){
  try{
    const url=new URL(String(raw||'https://www.autoreisen.com/alquiler-coches/alquiler-de-coches.php'));
    if(/\/alquiler-coches\//i.test(url.pathname))url.pathname='/alquiler-coches/tarifas-flota.php';
    else if(/\/car-hire\//i.test(url.pathname))url.pathname='/car-hire/rates-fleet.php';
    else url.pathname='/alquiler-coches/tarifas-flota.php';
    url.search='';url.hash='';return url.toString();
  }catch{return 'https://www.autoreisen.com/alquiler-coches/tarifas-flota.php';}
}
function officeId(label=''){
  const text=normalize(label).replace(/\bde\b/g,' ').replace(/\s+/g,' ').trim();
  for(const [key,value] of OFFICE_IDS){if(text===key||text.includes(key))return value;}
  return '';
}
function knownCarId(model=''){const n=normalize(model);for(const [key,id] of KNOWN_CAR_IDS){if(n.includes(key))return id;}return '';}
function directResultUrl(config){
  const pick=dateParts(config.pickupAt),drop=dateParts(config.dropoffAt);const url=new URL(resultsEntryUrl(process.env.AUTOREISEN_SEARCH_URL||config.searchUrl));
  const rec=String(config.pickupOfficeId||'').trim()||officeId(config.pickup),dev=String(config.dropoffOfficeId||'').trim()||officeId(config.dropoff),car=String(config.carId||'').trim()||knownCarId(config.model);
  if(rec)url.searchParams.set('ofi_rec',rec);if(dev)url.searchParams.set('ofi_dev',dev);
  // AutoReisen solo entra de forma consistente en la lista de tarifas cuando la URL incluye un coche conocido.
  // El ID no se usa para leer el precio: después se vuelve a validar modelo, fechas y duración visibles.
  if(car){url.searchParams.set('coche',car);url.searchParams.set('id_coche',car);}
  url.searchParams.set('dia_inicio',String(Number(pick.day)));url.searchParams.set('mes_inicio',`${pick.month}-${pick.year}`);
  url.searchParams.set('hora_inicio',`${pick.hour}:${pick.minute}`);
  url.searchParams.set('dia_final',String(Number(drop.day)));url.searchParams.set('mes_final',`${drop.month}-${drop.year}`);
  url.searchParams.set('hora_final',`${drop.hour}:${drop.minute}`);url.searchParams.set('fin','1');
  return url.toString();
}
function modelTokens(value=''){return normalize(value).split(' ').filter(token=>token.length>1&&!MODEL_STOPWORDS.has(token));}
function targetIndex(lines,config){
  const tokens=modelTokens(config.model);
  if(tokens.length){
    const candidates=lines.map((line,index)=>({index,text:normalize(line)})).filter(item=>tokens.every(token=>item.text.includes(token)));
    return candidates.length?candidates[0].index:-1;
  }
  const group=String(config.group||'').trim().replace(/[^a-z0-9]/gi,'');
  if(group){const re=new RegExp(`^${group}\s*[-–—:]`,'i');const i=lines.findIndex(x=>re.test(x.trim()));if(i>=0)return i;}
  return -1;
}
function groupVehicleLines(lines,group){const value=String(group||'').trim().replace(/[^a-z0-9]/gi,'');if(!value)return [];const re=new RegExp(`^${value}\\s*[-–—:]`,'i');return lines.filter(line=>re.test(line.trim())).slice(0,8);}
function extractTotal(lines,index){
  if(index<0)return 0;const block=lines.slice(index,index+16).join(' ');
  const euroTotals=[...block.matchAll(/([0-9]{1,4}(?:[.,][0-9]{2}))\s*€\s*(?:Reservar|Reserve|Reserver|Reservieren)/gi)].map(m=>Number(m[1].replace(',','.'))).filter(Number.isFinite);
  if(euroTotals.length)return euroTotals[0];
  const prices=money(block).filter(v=>v>0&&v<5000);return prices.length?Math.max(...prices):0;
}
function dateAppears(text,part){
  const n=normalize(text),day=String(Number(part.day)),year=part.year,tokens=MONTH_TOKENS[part.month]||[];
  return n.includes(year)&&tokens.some(token=>new RegExp(`\\b${day}\\s*[- /]?\\s*${token}`,'i').test(n)||new RegExp(`\\b${day}\\s+${token}`,'i').test(n));
}
function expectedRentalDays(config){return Math.max(1,Math.ceil((new Date(config.dropoffAt)-new Date(config.pickupAt))/86400000));}
function rentalDurationAppears(text,config){
  const days=expectedRentalDays(config),n=normalize(text);
  return new RegExp(`\\b${days}\\s*(?:dias?|days?|jours?|tage?n?)\\b`,'i').test(n);
}
function resultsLookValid(text,config){
  const pick=dateParts(config.pickupAt),drop=dateParts(config.dropoffAt);
  return /mostrando precios|prices for|tarifas|precios para|recogida|pick up/i.test(text)&&dateAppears(text,pick)&&dateAppears(text,drop)&&rentalDurationAppears(text,config);
}
async function safeText(page){return page.locator('body').innerText({timeout:12000}).catch(()=> '');}
async function openCandidate(page,url){
  await page.goto(url,{waitUntil:'commit',timeout:45000});await page.waitForLoadState('domcontentloaded',{timeout:18000}).catch(()=>{});await page.waitForTimeout(2200);
  const text=await safeText(page);return {text,challenge:/please wait|request is being verified|verifying|comprobando su navegador|un momento/i.test(text)};
}
async function selectByPredicate(select,predicate){const options=await select.locator('option').evaluateAll(nodes=>nodes.map(o=>({value:o.value,text:(o.textContent||'').trim()}))).catch(()=>[]);const match=options.find(predicate);if(!match)return false;await select.selectOption(match.value);return true;}
async function selectOffice(select,label,id=''){const wanted=normalize(label),words=wanted.split(' ').filter(x=>x.length>2),target=String(id||'').trim();if(target){const exact=await selectByPredicate(select,o=>String(o.value).trim()===target);if(exact)return true;}return selectByPredicate(select,o=>{const text=normalize(o.text);return words.length?words.every(w=>text.includes(w)):text.includes(wanted);});}
async function selectDay(select,part){return selectByPredicate(select,o=>String(o.text).trim().replace(/^0/,'')===String(Number(part.day))||String(o.value).replace(/^0/,'')===String(Number(part.day)));}
async function selectMonth(select,part){const tokens=MONTH_TOKENS[part.month]||[];return selectByPredicate(select,o=>{const text=normalize(`${o.text} ${o.value}`).replace(/\s+/g,'');return (text.includes(part.year)&&tokens.some(t=>text.includes(t)))||String(o.value)===`${part.month}-${part.year}`;});}
async function selectTime(select,part){const wanted=`${part.hour}:${part.minute}`;const exact=await selectByPredicate(select,o=>String(o.text).trim()===wanted||String(o.value).trim()===wanted);if(exact)return true;return selectByPredicate(select,o=>String(o.text).trim().startsWith(`${part.hour}:`)||String(o.value).trim().startsWith(`${part.hour}:`));}
async function firstExisting(root,selectors){for(const selector of selectors){const loc=root.locator(selector).first();if(await loc.count().catch(()=>0))return loc;}return null;}
async function submitLegacyForm(page,form){
  if(!form||!await form.count().catch(()=>0))return false;
  const beforeUrl=page.url(),beforeText=(await safeText(page)).slice(0,5000);
  const navigation=page.waitForNavigation({waitUntil:'domcontentloaded',timeout:35000}).catch(()=>null);
  let submitted=false;
  // AutoReisen usa en algunas variantes un input type=image, que no estaba cubierto por las versiones anteriores.
  const clickable=form.locator('input[type="submit"],button[type="submit"],input[type="image"],button:not([type])').last();
  if(await clickable.count().catch(()=>0)){
    submitted=await clickable.click({force:true}).then(()=>true).catch(()=>false);
  }
  if(!submitted){
    submitted=await form.evaluate(el=>{
      try{
        if(typeof el.requestSubmit==='function'){el.requestSubmit();return true;}
        HTMLFormElement.prototype.submit.call(el);return true;
      }catch{return false;}
    }).catch(()=>false);
  }
  if(!submitted)return false;
  await navigation;await page.waitForLoadState('domcontentloaded',{timeout:12000}).catch(()=>{});await page.waitForTimeout(2500);
  const afterText=await safeText(page);
  return page.url()!==beforeUrl||afterText.slice(0,5000)!==beforeText||/mostrando precios|prices for|prix montr/i.test(afterText);
}
async function revealSearchForm(page){
  const visible=page.locator('select:visible');if(await visible.count().catch(()=>0)>=6)return;
  const trigger=page.getByText(/nueva b.squeda|new search|nouvelle recherche|cambiar|change/i).last();
  if(await trigger.isVisible().catch(()=>false)){await trigger.click().catch(()=>{});await page.waitForTimeout(700);}
}
async function formStateSummary(page){
  const form=page.locator('form').filter({has:page.locator('select')}).last();
  if(!await form.count().catch(()=>0))return '';
  return form.evaluate(el=>{
    const selects=[...el.querySelectorAll('select')].slice(0,10).map((s,i)=>{const o=s.options?.[s.selectedIndex];return `${i}:${s.name||s.id||'?'}=${s.value||''}[${(o?.textContent||'').trim()}]`;});
    const submits=[...el.querySelectorAll('input[type="submit"],input[type="image"],button')].slice(0,5).map(x=>`${x.tagName.toLowerCase()}:${x.type||''}:${x.name||x.id||x.value||''}`);
    return `form ${el.method||'get'} ${el.action||''}; ${selects.join('; ')}; submit=${submits.join(',')}`;
  }).catch(()=> '');
}
async function fillNamedLegacyForm(page,cfg){
  const pick=dateParts(cfg.pickupAt),drop=dateParts(cfg.dropoffAt);
  let form=page.locator('form').filter({has:page.locator('select[name="ofi_rec"]')}).first();
  if(!await form.count().catch(()=>0))form=page.locator('form').filter({hasText:/oficina de recogida|pick.?up office/i}).last();
  if(!await form.count().catch(()=>0))return false;
  const rec=await firstExisting(form,['select[name="ofi_rec"]','select[name*="ofi_rec" i]']);const dev=await firstExisting(form,['select[name="ofi_dev"]','select[name*="ofi_dev" i]']);
  const d1=await firstExisting(form,['select[name="dia_inicio"]','select[name*="dia_inicio" i]']);const m1=await firstExisting(form,['select[name="mes_inicio"]','select[name*="mes_inicio" i]']);const h1=await firstExisting(form,['select[name="hora_inicio"]','select[name*="hora_inicio" i]','select[name*="hora" i]']);
  const d2=await firstExisting(form,['select[name="dia_final"]','select[name*="dia_final" i]']);const m2=await firstExisting(form,['select[name="mes_final"]','select[name*="mes_final" i]']);
  let timeSelects=form.locator('select').filter({has:page.locator('option')});
  const allSelects=form.locator('select');
  const h2=await firstExisting(form,['select[name="hora_final"]','select[name*="hora_final" i]']);
  if(!rec||!dev||!d1||!m1||!d2||!m2)return false;
  const same=String(cfg.pickupOfficeId||'')&&String(cfg.pickupOfficeId||'')===String(cfg.dropoffOfficeId||'')||normalize(cfg.pickup)===normalize(cfg.dropoff);const okRec=await selectOffice(rec,cfg.pickup,cfg.pickupOfficeId);let okDev=false;
  if(same)okDev=await selectByPredicate(dev,o=>/misma oficina|same office|meme agence|gleiche/i.test(o.text));if(!okDev)okDev=await selectOffice(dev,cfg.dropoff,cfg.dropoffOfficeId);
  const ok=[okRec,okDev,await selectDay(d1,pick),await selectMonth(m1,pick),await selectDay(d2,drop),await selectMonth(m2,drop)];
  if(h1)ok.push(await selectTime(h1,pick));if(h2)ok.push(await selectTime(h2,drop));
  // Fallback for hour selects when their names are not descriptive: use select positions 4 and 7 in the search form.
  if(!h1&&await allSelects.count()>=5)ok.push(await selectTime(allSelects.nth(4),pick));if(!h2&&await allSelects.count()>=8)ok.push(await selectTime(allSelects.nth(7),drop));
  if(ok.some(v=>!v))return false;
  return submitLegacyForm(page,form);
}
async function fillPositionalLegacyForm(page,cfg){
  const selects=page.locator('select:visible');const count=await selects.count();if(count<8)return false;const pick=dateParts(cfg.pickupAt),drop=dateParts(cfg.dropoffAt),same=normalize(cfg.pickup)===normalize(cfg.dropoff);
  const okPick=await selectOffice(selects.nth(0),cfg.pickup,cfg.pickupOfficeId);let okDrop=false;if(same)okDrop=await selectByPredicate(selects.nth(1),o=>/misma oficina|same office|meme agence|gleiche/i.test(o.text));if(!okDrop)okDrop=await selectOffice(selects.nth(1),cfg.dropoff,cfg.dropoffOfficeId);
  const values=await Promise.all([selectDay(selects.nth(2),pick),selectMonth(selects.nth(3),pick),selectTime(selects.nth(4),pick),selectDay(selects.nth(5),drop),selectMonth(selects.nth(6),drop),selectTime(selects.nth(7),drop)]);
  if(!okPick||!okDrop||values.some(v=>!v))return false;const form=selects.nth(0).locator('xpath=ancestor::form[1]');if(await submitLegacyForm(page,form))return true;return clickFirst(page,[page.getByRole('button',{name:/buscar|consultar|ver precios|new search|search|presupuest/i}).first(),page.locator('input[type="image"]').last()]);
}
async function fillModernForm(page,cfg){
  const pick=dateParts(cfg.pickupAt),drop=dateParts(cfg.dropoffAt);await fillFirst(page,[page.getByLabel(/recogida|pickup/i).first(),'input[name*="pickup" i]'],cfg.pickup);await fillFirst(page,[page.getByLabel(/devolución|devolucion|drop.?off|return/i).first(),'input[name*="drop" i],input[name*="return" i]'],cfg.dropoff);
  const dates=page.locator('input[type="date"]');if(await dates.count()>=2){await dates.nth(0).fill(pick.date).catch(()=>{});await dates.nth(1).fill(drop.date).catch(()=>{});}const times=page.locator('input[type="time"]');if(await times.count()>=2){await times.nth(0).fill(`${pick.hour}:${pick.minute}`).catch(()=>{});await times.nth(1).fill(`${drop.hour}:${drop.minute}`).catch(()=>{});}return clickFirst(page,[page.getByRole('button',{name:/buscar|consultar|ver precios|continuar|new quote/i}).first(),page.locator('button[type="submit"],input[type="submit"]').first()]);
}
function fleetFromLines(lines){const out=[],seen=new Set();for(const line of lines){const m=String(line).match(/^([A-Z0-9]{1,3})\s*[-–—:]\s*(.+?)(?:\s+([0-9]{1,4}(?:[.,][0-9]{1,2}))\s*€\s*\/\s*d[ií]a|$)/i);if(!m)continue;const group=m[1].trim(),model=m[2].trim().replace(/\s+/g,' ');if(!model||model.length>130)continue;const key=`${group}\u0000${normalize(model)}`;if(seen.has(key))continue;seen.add(key);out.push({group,model,carId:knownCarId(model)});}return out;}
function parseResult(text,config){const lines=text.split(/\n+/).map(x=>x.trim()).filter(Boolean),index=targetIndex(lines,config),total=extractTotal(lines,index);return {lines,index,total,found:groupVehicleLines(lines,config.group),fleet:fleetFromLines(lines)};}
async function diagnosticSummary(page,text,parsed,config){
  const heading=text.split(/\n+/).map(x=>x.trim()).filter(Boolean).filter(x=>/mostrando precios|prices for|recogida|pick up|nueva b.squeda|new search/i.test(x)).slice(0,4).join(' | ');
  const found=parsed.found.length?` Vehículos grupo ${config.group}: ${parsed.found.join(' | ')}`:'';const formState=await formStateSummary(page);return `URL final: ${page.url()}.${heading?` Página: ${heading}.`:''}${found}${formState?` Formulario: ${formState}`:''}`;
}
export async function scanAutoReisenFleet(browser,config){
  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:1100},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'});const page=await context.newPage();
  try{
    // Para obtener la flota completa usamos un navegador real. AutoReisen protege el listado frente a peticiones HTTP directas,
    // pero el formulario normal del navegador sigue siendo la fuente correcta para una consulta puntual del usuario.
    const base=resultsEntryUrl(process.env.AUTOREISEN_SEARCH_URL||config.searchUrl);
    await openCandidate(page,base).catch(()=>{});await acceptCookies(page);
    const intro=page.getByText(/^\s*Continuar\s*$/i).first();if(await intro.isVisible().catch(()=>false))await intro.click().catch(()=>{});await revealSearchForm(page);
    let submitted=await fillNamedLegacyForm(page,config).catch(()=>false);if(!submitted)submitted=await fillPositionalLegacyForm(page,config).catch(()=>false);if(!submitted)submitted=await fillModernForm(page,config).catch(()=>false);
    if(submitted){await page.waitForLoadState('domcontentloaded',{timeout:35000}).catch(()=>{});await page.waitForTimeout(4500);}
    let text=await safeText(page);
    if(/please wait|request is being verified|verifying|comprobando su navegador|un momento/i.test(text))throw new Error('AutoReisen activó la verificación anti-bot durante la consulta con navegador.');
    let parsed=parseResult(text,{...config,group:'',model:''});
    const validDates=resultsLookValid(text,config);
    if(parsed.fleet.length&&validDates){await snapshot(page,'autoreisen-flota');return {source:'AutoReisen · flota real · GitHub Actions + Playwright',checkedAt:isoNow(),availability:'Disponible',pickupOfficeId:String(config.pickupOfficeId||officeId(config.pickup)||''),dropoffOfficeId:String(config.dropoffOfficeId||officeId(config.dropoff)||''),pickupAt:config.pickupAt,dropoffAt:config.dropoffAt,fleet:parsed.fleet};}
    if(/no hay nada disponible|no availability|cannot offer|no podemos ofrecer/i.test(text)&&validDates){await snapshot(page,'autoreisen-sin-disponibilidad');return {source:'AutoReisen · flota real · GitHub Actions + Playwright',checkedAt:isoNow(),availability:'No disponible',noAvailability:true,pickupOfficeId:String(config.pickupOfficeId||officeId(config.pickup)||''),dropoffOfficeId:String(config.dropoffOfficeId||officeId(config.dropoff)||''),pickupAt:config.pickupAt,dropoffAt:config.dropoffAt,fleet:[]};}

    // Segundo intento: URL de resultados sin fijar coche. Con Playwright puede funcionar aunque la misma URL falle desde un Worker.
    const direct=new URL(directResultUrl({...config,model:'',carId:''}));direct.searchParams.delete('coche');direct.searchParams.delete('id_coche');
    const opened=await openCandidate(page,direct.toString()).catch(()=>({text:'',challenge:false}));if(opened.challenge)throw new Error('AutoReisen activó su verificación anti-bot.');
    text=opened.text||await safeText(page);parsed=parseResult(text,{...config,group:'',model:''});
    if(parsed.fleet.length&&resultsLookValid(text,config)){await snapshot(page,'autoreisen-flota-directa');return {source:'AutoReisen · flota real · GitHub Actions + Playwright',checkedAt:isoNow(),availability:'Disponible',pickupOfficeId:String(config.pickupOfficeId||officeId(config.pickup)||''),dropoffOfficeId:String(config.dropoffOfficeId||officeId(config.dropoff)||''),pickupAt:config.pickupAt,dropoffAt:config.dropoffAt,fleet:parsed.fleet};}
    const diag=await diagnosticSummary(page,text,parsed,config);throw new Error(`AutoReisen no devolvió una lista de vehículos interpretable para esta búsqueda. ${diag}`);
  }finally{await context.close();}
}

export async function monitorAutoReisen(browser,config){
  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:1100},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'});const page=await context.newPage();
  try{
    // Strategy 1: use AutoReisen's public results query directly. This avoids fragile visual form selectors.
    const direct=directResultUrl(config);let opened=await openCandidate(page,direct).catch(()=>({text:'',challenge:false}));if(opened.challenge)opened={text:'',challenge:true};await acceptCookies(page);let text=opened.text||await safeText(page);let parsed=parseResult(text,config);
    if(parsed.index>=0&&parsed.total&&resultsLookValid(text,config)){await snapshot(page,'autoreisen-resultados');const relevant=parsed.lines.slice(parsed.index,parsed.index+16).join(' '),days=daysBetween(config.pickupAt,config.dropoffAt);return {source:'AutoReisen · consulta directa · GitHub Actions + Playwright',checkedAt:isoNow(),price:parsed.total,total:parsed.total,pricePerDay:parsed.total/days,availability:/no disponible|agotado|sold out|not available/i.test(relevant)?'No disponible':'Disponible',group:config.group,model:config.model,carId:String(config.carId||knownCarId(config.model)||''),pickupOfficeId:String(config.pickupOfficeId||rec||''),dropoffOfficeId:String(config.dropoffOfficeId||dev||''),pickupAt:config.pickupAt,dropoffAt:config.dropoffAt,fleet:parsed.fleet};}

    // Strategy 2: fill the actual named legacy fields, not the first selects in the document.
    const base=resultsEntryUrl(process.env.AUTOREISEN_SEARCH_URL||config.searchUrl);await openCandidate(page,base).catch(()=>{});await acceptCookies(page);const intro=page.getByText(/^\s*Continuar\s*$/i).first();if(await intro.isVisible().catch(()=>false))await intro.click().catch(()=>{});await revealSearchForm(page);
    let submitted=await fillNamedLegacyForm(page,config).catch(()=>false);if(!submitted)submitted=await fillPositionalLegacyForm(page,config).catch(()=>false);if(!submitted)submitted=await fillModernForm(page,config).catch(()=>false);if(submitted){await page.waitForLoadState('domcontentloaded',{timeout:35000}).catch(()=>{});await page.waitForTimeout(4000);}text=await safeText(page);
    if(/please wait|request is being verified|verifying|comprobando su navegador|un momento/i.test(text))throw new Error('AutoReisen activó la verificación anti-bot durante la consulta.');parsed=parseResult(text,config);await snapshot(page,'autoreisen-resultados');
    if(parsed.index>=0&&parsed.total&&resultsLookValid(text,config)){const relevant=parsed.lines.slice(parsed.index,parsed.index+16).join(' '),days=daysBetween(config.pickupAt,config.dropoffAt);return {source:'AutoReisen · formulario identificado · GitHub Actions + Playwright',checkedAt:isoNow(),price:parsed.total,total:parsed.total,pricePerDay:parsed.total/days,availability:/no disponible|agotado|sold out|not available/i.test(relevant)?'No disponible':'Disponible',group:config.group,model:config.model,carId:String(config.carId||knownCarId(config.model)||''),pickupOfficeId:String(config.pickupOfficeId||officeId(config.pickup)||''),dropoffOfficeId:String(config.dropoffOfficeId||officeId(config.dropoff)||''),pickupAt:config.pickupAt,dropoffAt:config.dropoffAt,fleet:parsed.fleet};}
    const diag=await diagnosticSummary(page,text,parsed,config);
    if(parsed.index>=0&&parsed.total&&!rentalDurationAppears(text,config))throw new Error(`AutoReisen devolvió un precio para una duración distinta. MFE Viajes espera ${expectedRentalDays(config)} días (${dateParts(config.pickupAt).hour}:${dateParts(config.pickupAt).minute} → ${dateParts(config.dropoffAt).hour}:${dateParts(config.dropoffAt).minute}). ${diag}`);
    if(parsed.found.length)throw new Error(`AutoReisen devolvió resultados, pero no apareció ${config.model||`el grupo ${config.group}`}. ${diag}`);
    throw new Error(`AutoReisen no llegó a una lista de vehículos válida para las fechas configuradas. ${diag}`);
  }finally{await context.close();}
}

export const __autoreisenTest={resultsEntryUrl,directResultUrl,officeId,knownCarId,targetIndex,extractTotal,normalize,modelTokens,groupVehicleLines,resultsLookValid,dateParts,expectedRentalDays,rentalDurationAppears,fleetFromLines};
