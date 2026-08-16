// MFE_AUTOREISEN_AUTOMATION_VERSION: 2.1.52
import {acceptCookies,clickFirst,daysBetween,fillFirst,isoNow,money,snapshot} from './lib.mjs';

const MONTH_TOKENS={
  1:['ene','jan','january','enero'],2:['feb','february','febrero'],3:['mar','march','marzo'],4:['abr','apr','april','abril'],
  5:['may','mayo'],6:['jun','june','junio'],7:['jul','july','julio'],8:['ago','aug','august','agosto'],
  9:['sep','sept','september','septiembre'],10:['oct','october','octubre'],11:['nov','november','noviembre'],12:['dic','dec','december','diciembre']
};
function normalize(value=''){return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ' ).trim();}
function dateParts(value){const d=new Date(value);return {date:value.slice(0,10),day:String(d.getDate()).padStart(2,'0'),month:d.getMonth()+1,year:String(d.getFullYear()),hour:String(d.getHours()).padStart(2,'0'),minute:String(d.getMinutes()).padStart(2,'0')};}
function resultsEntryUrl(raw){
  try{
    const url=new URL(String(raw||'https://www.autoreisen.com/alquiler-coches/alquiler-de-coches.php'));
    if(/\/alquiler-coches\//i.test(url.pathname))url.pathname='/alquiler-coches/tarifas-flota.php';
    else if(/\/car-hire\//i.test(url.pathname))url.pathname='/car-hire/rates-fleet.php';
    else url.pathname='/alquiler-coches/tarifas-flota.php';
    url.search='';url.hash='';return url.toString();
  }catch{return 'https://www.autoreisen.com/alquiler-coches/tarifas-flota.php';}
}
async function selectByPredicate(select,predicate){
  const options=await select.locator('option').evaluateAll(nodes=>nodes.map(o=>({value:o.value,text:(o.textContent||'').trim()}))).catch(()=>[]);
  const match=options.find(predicate);if(!match)return false;await select.selectOption(match.value);return true;
}
async function selectOffice(select,label){
  const wanted=normalize(label);const words=wanted.split(' ').filter(x=>x.length>2);
  return selectByPredicate(select,o=>{const text=normalize(o.text);return words.length?words.every(w=>text.includes(w)):text.includes(wanted);});
}
async function selectDay(select,part){return selectByPredicate(select,o=>String(o.text).trim().replace(/^0/,'')===String(Number(part.day)));}
async function selectMonth(select,part){const tokens=MONTH_TOKENS[part.month]||[];return selectByPredicate(select,o=>{const text=normalize(o.text).replace(/\s+/g,'');return text.includes(part.year)&&tokens.some(t=>text.includes(t));});}
async function selectTime(select,part){const wanted=`${part.hour}:${part.minute}`;const byExact=await selectByPredicate(select,o=>String(o.text).trim()===wanted);if(byExact)return true;return selectByPredicate(select,o=>String(o.text).trim().startsWith(`${part.hour}:`));}
async function fillLegacySelectForm(page,cfg){
  const selects=page.locator('select:visible');const count=await selects.count();if(count<8)return false;
  const pick=dateParts(cfg.pickupAt),drop=dateParts(cfg.dropoffAt);
  const sameOffice=normalize(cfg.pickup)===normalize(cfg.dropoff);
  const okPick=await selectOffice(selects.nth(0),cfg.pickup);
  let okDrop=false;if(sameOffice)okDrop=await selectByPredicate(selects.nth(1),o=>/misma oficina|same office|meme agence|gleiche/i.test(o.text));
  if(!okDrop)okDrop=await selectOffice(selects.nth(1),cfg.dropoff);
  const steps=[
    selectDay(selects.nth(2),pick),selectMonth(selects.nth(3),pick),selectTime(selects.nth(4),pick),
    selectDay(selects.nth(5),drop),selectMonth(selects.nth(6),drop),selectTime(selects.nth(7),drop)
  ];
  const values=await Promise.all(steps);if(!okPick||!okDrop||values.some(v=>!v))return false;
  const form=selects.nth(0).locator('xpath=ancestor::form[1]');
  const scopedSubmit=form.locator('input[type="submit"],button[type="submit"]').last();
  if(await scopedSubmit.isVisible().catch(()=>false)){await scopedSubmit.click();return true;}
  return clickFirst(page,[page.getByRole('button',{name:/buscar|consultar|ver precios|new search|search|presupuest/i}).first(),page.locator('input[type="submit"],button[type="submit"]').last()]);
}
async function fillModernForm(page,cfg){
  const pick=dateParts(cfg.pickupAt),drop=dateParts(cfg.dropoffAt);
  await fillFirst(page,[page.getByLabel(/recogida|pickup/i).first(),'input[name*="pickup" i]'],cfg.pickup);
  await fillFirst(page,[page.getByLabel(/devolución|devolucion|drop.?off|return/i).first(),'input[name*="drop" i],input[name*="return" i]'],cfg.dropoff);
  const dateInputs=page.locator('input[type="date"]');if(await dateInputs.count()>=2){await dateInputs.nth(0).fill(pick.date).catch(()=>{});await dateInputs.nth(1).fill(drop.date).catch(()=>{});}
  await fillFirst(page,['input[name*="pickupDate" i],input[id*="pickupDate" i]'],pick.date);
  await fillFirst(page,['input[name*="returnDate" i],input[id*="returnDate" i],input[name*="dropoffDate" i]'],drop.date);
  const timeInputs=page.locator('input[type="time"]');if(await timeInputs.count()>=2){await timeInputs.nth(0).fill(`${pick.hour}:${pick.minute}`).catch(()=>{});await timeInputs.nth(1).fill(`${drop.hour}:${drop.minute}`).catch(()=>{});}
  return clickFirst(page,[page.getByRole('button',{name:/buscar|consultar|ver precios|continuar|new quote/i}).first(),page.locator('button[type="submit"],input[type="submit"]').first()]);
}
async function safeText(page){return page.locator('body').innerText({timeout:12000}).catch(()=> '');}
async function openCandidate(page,url){
  await page.goto(url,{waitUntil:'commit',timeout:45000});
  await page.waitForLoadState('domcontentloaded',{timeout:18000}).catch(()=>{});await page.waitForTimeout(2200);
  const text=await safeText(page);return {text,challenge:/please wait|request is being verified|verifying|comprobando su navegador|un momento/i.test(text)};
}
const MODEL_STOPWORDS=new Set(['o','or','oder','ou','similar','similaire','similarer','similaren','similarmente','tsi','reference']);
function modelTokens(value=''){
  return normalize(value).split(' ').filter(token=>token.length>1&&!MODEL_STOPWORDS.has(token));
}
function targetIndex(lines,config){
  const tokens=modelTokens(config.model);
  if(tokens.length){
    const candidates=lines.map((line,index)=>({index,text:normalize(line)})).filter(item=>tokens.every(token=>item.text.includes(token)));
    return candidates.length?candidates[0].index:-1;
  }
  const group=String(config.group||'').trim().replace(/[^a-z0-9]/gi,'');
  if(group){const re=new RegExp(`^${group}\\s*[-–—:]`,'i');const i=lines.findIndex(x=>re.test(x.trim()));if(i>=0)return i;}
  return -1;
}
function groupVehicleLines(lines,group){
  const value=String(group||'').trim().replace(/[^a-z0-9]/gi,'');if(!value)return [];
  const re=new RegExp(`^${value}\\s*[-–—:]`,'i');return lines.filter(line=>re.test(line.trim())).slice(0,6);
}
function extractTotal(lines,index){
  if(index<0)return 0;const block=lines.slice(index,index+14).join(' ');const prices=money(block).filter(v=>v>0);if(!prices.length)return 0;
  const euroTotals=[...block.matchAll(/([0-9]{1,4}(?:[.,][0-9]{2}))\s*€\s*(?:Reservar|Reserve|Reserver|Reservieren)/gi)].map(m=>Number(m[1].replace(',','.'))).filter(Number.isFinite);
  return euroTotals[0]||Math.max(...prices);
}
export async function monitorAutoReisen(browser,config){
  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:1100},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'});const page=await context.newPage();
  try{
    const configured=process.env.AUTOREISEN_SEARCH_URL||config.searchUrl;const candidates=[resultsEntryUrl(configured),configured].filter((v,i,a)=>v&&a.indexOf(v)===i);
    let opened=false,lastChallenge=false;
    for(const url of candidates){
      try{const result=await openCandidate(page,url);lastChallenge=result.challenge;if(!result.challenge){opened=true;break;}}catch(error){console.warn('[autoreisen] No se pudo abrir',url,error.message);}
    }
    if(!opened){throw new Error(lastChallenge?'AutoReisen está mostrando una verificación anti-bot al ejecutor de GitHub. Se intentará de nuevo en la siguiente comprobación.':'No se pudo abrir AutoReisen desde GitHub Actions.');}
    await acceptCookies(page);
    const intro=page.getByText(/^\s*Continuar\s*$/i).first();if(await intro.isVisible().catch(()=>false))await intro.click().catch(()=>{});
    const legacyFilled=await fillLegacySelectForm(page,config).catch(()=>false);if(!legacyFilled)await fillModernForm(page,config).catch(()=>false);
    if(legacyFilled){await page.waitForLoadState('domcontentloaded',{timeout:35000}).catch(()=>{});await page.waitForTimeout(3500);}else{await page.waitForTimeout(6500);}
    let text=await safeText(page);
    if(/please wait|request is being verified|verifying|comprobando su navegador|un momento/i.test(text))throw new Error('AutoReisen activó la verificación anti-bot durante la consulta.');
    await snapshot(page,'autoreisen-resultados');
    const lines=text.split(/\n+/).map(x=>x.trim()).filter(Boolean);const index=targetIndex(lines,config);const total=extractTotal(lines,index);
    if(index<0||!total){
      const found=groupVehicleLines(lines,config.group);const suffix=found.length?` Vehículos del grupo ${config.group} encontrados: ${found.join(' | ')}`:'';
      throw new Error(`No se encontró el precio de ${config.model||`grupo ${config.group}`}.${suffix||' El formulario se abrió, pero AutoReisen no devolvió ese vehículo para las fechas configuradas.'}`);
    }
    const relevant=lines.slice(index,index+14).join(' '),days=daysBetween(config.pickupAt,config.dropoffAt);
    return {source:'AutoReisen · tarifas/flota · GitHub Actions + Playwright',checkedAt:isoNow(),price:total,total,pricePerDay:total/days,availability:/no disponible|agotado|sold out|not available/i.test(relevant)?'No disponible':'Disponible',group:config.group,model:config.model,pickupAt:config.pickupAt,dropoffAt:config.dropoffAt};
  }finally{await context.close();}
}

export const __autoreisenTest={resultsEntryUrl,targetIndex,extractTotal,normalize,modelTokens,groupVehicleLines};
