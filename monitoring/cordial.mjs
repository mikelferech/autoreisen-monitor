// MFE_CORDIAL_AUTOMATION_VERSION: 2.1.89
import {isoNow,snapshot,acceptCookies} from './lib.mjs';

const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const visible=loc=>loc.isVisible().catch(()=>false);
const eur=text=>{
  const raw=String(text||'').replace(/\u00a0/g,' ');
  const rows=[];
  for(const m of raw.matchAll(/([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{2})|[0-9]+(?:,[0-9]{2}))\s*€/g)){
    const value=Number.parseFloat(m[1].replace(/\./g,'').replace(',','.'));if(Number.isFinite(value))rows.push(value);
  }
  return rows;
};
function targetMatches(row,config){
  const room=normalize(config.targetRoom||'Classic Duplex'),rate=normalize(config.targetRate||'Club Cordial - Reserva Online'),board=normalize(config.targetBoard||'SOLO ALOJAMIENTO');
  return (!room||normalize(row.roomType).includes(room))&&(!rate||normalize(row.rateName).includes(rate))&&(!board||normalize(row.board).includes(board));
}
async function chooseHotel(page,config){
  const existingCode=page.locator('input[name="hotel_codes"]').first();
  const currentCode=await existingCode.inputValue().catch(()=> '');
  if(String(currentCode||'').trim())return true;
  const wanted=config.hotel||'Cordial Santa Águeda & Perchel Beach Club';
  const candidates=[
    page.locator('input[placeholder*="destino" i],input[placeholder*="hotel" i]').first(),
    page.locator('input[name*="hotel" i],input[name*="destination" i]').first()
  ];
  for(const input of candidates){
    if(!await visible(input))continue;
    await input.click().catch(()=>{});await input.fill(wanted).catch(()=>{});await page.waitForTimeout(350);
    const option=page.getByText(/Cordial Santa Águeda.*Perchel Beach Club/i).last();if(await visible(option)){await option.click().catch(()=>{});return true;}
  }
  const hotelOption=page.getByText(/Cordial Santa Águeda.*Perchel Beach Club/i).last();if(await visible(hotelOption)){await hotelOption.click().catch(()=>{});return true;}
  return false;
}
async function forceControlValue(loc,value){
  if(!loc||await loc.count().catch(()=>0)<1)return false;
  try{
    await loc.first().evaluate((el,v)=>{
      const proto=el instanceof HTMLInputElement?HTMLInputElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:null;
      const setter=proto?Object.getOwnPropertyDescriptor(proto,'value')?.set:null;
      if(setter)setter.call(el,v);else el.value=v;
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
    },String(value));
    return String(await loc.first().inputValue().catch(()=>''))===String(value);
  }catch{return false;}
}
async function fillDateInputs(page,config){
  const checkIn=String(config.checkIn||''),checkOut=String(config.checkOut||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)||!/^\d{4}-\d{2}-\d{2}$/.test(checkOut))throw new Error('Las fechas de Cordial no son válidas.');

  // El formulario público de BeCordial usa actualmente date_from/date_to como campos ocultos.
  // Debemos escribirlos aunque no sean visibles: el formulario los envía al motor de reservas.
  const exactIn=page.locator('input[name="date_from"],input#date_from');
  const exactOut=page.locator('input[name="date_to"],input#date_to');
  const hasExactIn=await exactIn.count().catch(()=>0)>0,hasExactOut=await exactOut.count().catch(()=>0)>0;
  if(hasExactIn&&hasExactOut){
    const okIn=await forceControlValue(exactIn,checkIn),okOut=await forceControlValue(exactOut,checkOut);
    if(okIn&&okOut){
      console.log(`[cordial] Fechas aplicadas al formulario: ${checkIn} → ${checkOut}`);
      return true;
    }
  }

  const dateInputs=page.locator('input[type="date"]');
  if(await dateInputs.count()>=2){
    const okIn=await forceControlValue(dateInputs.nth(0),checkIn),okOut=await forceControlValue(dateInputs.nth(1),checkOut);
    if(okIn&&okOut)return true;
  }
  const inSelectors=['input[name="date_from"]','input[name*="checkin" i]','input[name*="arrival" i]','input[name*="entrada" i]','input[name*="start" i]','input[placeholder*="entrada" i]'];
  const outSelectors=['input[name="date_to"]','input[name*="checkout" i]','input[name*="departure" i]','input[name*="salida" i]','input[name*="end" i]','input[placeholder*="salida" i]'];
  let inOk=false,outOk=false;
  for(const selector of inSelectors){const loc=page.locator(selector).first();if(await loc.count().catch(()=>0)&&await forceControlValue(loc,checkIn)){inOk=true;break;}}
  for(const selector of outSelectors){const loc=page.locator(selector).first();if(await loc.count().catch(()=>0)&&await forceControlValue(loc,checkOut)){outOk=true;break;}}
  if(inOk&&outOk)return true;

  // Último recurso: campo visual único “Entrada / Salida”.
  const dateLabel=page.getByText(/Entrada\s*\/\s*Salida/i).first();
  if(await visible(dateLabel)){
    const input=dateLabel.locator('xpath=following::input[not(@type="hidden")][1]').first();
    if(await visible(input)){
      const [yi,mi,di]=checkIn.split('-'),[yo,mo,do_]=checkOut.split('-');
      for(const value of [`${di}/${mi}/${yi} - ${do_}/${mo}/${yo}`,`${di}/${mi}/${yi} – ${do_}/${mo}/${yo}`]){
        try{await input.fill(value);await input.dispatchEvent('change').catch(()=>{});return true;}catch{}
        try{await input.evaluate((el,v)=>{el.removeAttribute('readonly');el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);return true;}catch{}
      }
    }
  }
  return false;
}
async function setAdults(page,config){
  const adults=Math.max(1,Number(config.adults)||2);
  const inputs=page.locator('input[name*="adult" i],select[name*="adult" i]');
  if(await inputs.count()){
    const el=inputs.first();if((await el.evaluate(e=>e.tagName)).toLowerCase()==='select')await el.selectOption(String(adults)).catch(()=>{});else await el.fill(String(adults)).catch(()=>{});
    return true;
  }
  // El formulario público de Cordial parte normalmente de 2 adultos. Si ya lo muestra, no tocamos el contador.
  const text=await page.locator('body').innerText().catch(()=> '');if(new RegExp(`\\b${adults}\\s+adultos?\\b`,'i').test(text))return true;
  return false;
}
async function submitSearch(page){
  const candidates=[page.getByRole('button',{name:/^buscar$/i}).last(),page.getByRole('button',{name:/reservar|ver precios|consultar disponibilidad/i}).first(),page.locator('button[type="submit"],input[type="submit"]').last()];
  for(const button of candidates){
    if(!await visible(button))continue;
    await button.click().catch(()=>{});
    await Promise.race([
      page.waitForURL(/\/booking\/process\/room/i,{timeout:45000}).catch(()=>{}),
      page.getByText(/Tarifa Club Cordial|Tarifa Estándar|Classic Duplex/i).first().waitFor({state:'visible',timeout:45000}).catch(()=>{})
    ]);
    await page.waitForLoadState('domcontentloaded',{timeout:15000}).catch(()=>{});
    await page.waitForTimeout(2500);
    return true;
  }
  return false;
}
async function selectClubTab(page){
  const tab=page.getByText(/Tarifa Club Cordial/i).first();if(await visible(tab)){await tab.click().catch(()=>{});await page.waitForTimeout(800);return true;}return false;
}
function isBoard(line){return /^(SOLO ALOJAMIENTO|DESAYUNO|MEDIA PENSI[ÓO]N|PENSI[ÓO]N COMPLETA|TODO INCLUIDO|ALOJAMIENTO Y DESAYUNO)$/i.test(String(line).trim());}
function isRate(line){return /^(Club Cordial\s*-|Tarifa Est[aá]ndar|Oferta .*Online|Reserva Online)/i.test(String(line).trim());}
function isCancellation(line){return /cancelaci[oó]n|reembolsable|no reembolsable/i.test(String(line));}
function looksRoom(line,headings){const n=normalize(line);if(!n||n.length>75)return false;if(headings.has(n)&&!/resumen|habitaci[oó]n 1|cordial santa|m[aá]s informaci[oó]n|tarifa|filtro|ordenar/i.test(line))return true;return /^(classic|deluxe|ocean|premium|superior|villa|suite|duplex|d[uú]plex)/i.test(line);}
export function parseCordialText(text,headingTexts=[],config={}){
  const lines=String(text||'').split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);const headings=new Set(headingTexts.map(normalize));
  const out=[];let room='',rate='',cancellation='',availability='';
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(looksRoom(line,headings)){room=line;rate='';cancellation='';availability='';continue;}
    if(isRate(line)){rate=line;cancellation='';availability='';continue;}
    if(isCancellation(line)){cancellation=line;continue;}
    if(/queda\s+\d+\s+habitaci[oó]n|agotad|no disponible|sold out/i.test(line)){availability=line;continue;}
    if(!isBoard(line)||!room)continue;
    const money=[];for(let j=i+1;j<Math.min(lines.length,i+8);j++){
      if(isBoard(lines[j])||isRate(lines[j])||looksRoom(lines[j],headings))break;
      money.push(...eur(lines[j]));
      if(/reservar/i.test(lines[j])&&money.length)break;
    }
    if(!money.length)continue;
    const price=money[money.length-1],crossedPrice=money.length>1?money[0]:0;
    const row={roomType:room,rateName:rate||'Tarifa Club Cordial',cancellation,board:line.toUpperCase(),price,crossedPrice,availability:availability||'Disponible'};
    row.target=targetMatches(row,config);out.push(row);
  }
  // Quita duplicados que algunos layouts responsive repiten.
  const map=new Map();for(const row of out){const key=[normalize(row.roomType),normalize(row.rateName),normalize(row.board),row.price].join('|');if(!map.has(key))map.set(key,row);}return [...map.values()];
}
async function diagnostic(page){
  const inputs=await page.locator('input,select').evaluateAll(nodes=>nodes.slice(0,50).map(el=>({tag:el.tagName,name:el.getAttribute('name')||'',type:el.getAttribute('type')||'',placeholder:el.getAttribute('placeholder')||'',value:el.value||''}))).catch(()=>[]);
  return `URL final: ${page.url()}. Controles: ${inputs.map(x=>`${x.tag}:${x.name||x.placeholder||x.type}=${x.value}`).slice(0,18).join('; ')}`;
}
export async function monitorCordial(browser,config={}){
  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:1300},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'});const page=await context.newPage();
  try{
    const url=String(config.searchUrl||'https://www.becordial.com/gran-canaria-sur/cordial-santa-agueda/').trim();
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(1800);await acceptCookies(page);
    if(!/\/booking\/process\/room/i.test(page.url())){
      await chooseHotel(page,config).catch(()=>false);
      const datesOk=await fillDateInputs(page,config).catch(()=>false);await setAdults(page,config).catch(()=>false);
      if(!datesOk){const d=await diagnostic(page);throw new Error(`No se localizaron de forma fiable los campos de fechas del formulario público de Cordial. ${d}`);}
      const submitted=await submitSearch(page);if(!submitted){const d=await diagnostic(page);throw new Error(`No se pudo enviar el formulario de reserva de Cordial. ${d}`);}
    }
    await page.waitForTimeout(2500);await selectClubTab(page).catch(()=>false);
    const body=await page.locator('body').innerText().catch(()=> '');
    if(/captcha|verify you are human|comprobando su navegador|access denied/i.test(body))throw new Error('Cordial ha mostrado una verificación anti-bot durante la consulta.');
    const headings=await page.locator('h1,h2,h3,h4,h5').allTextContents().catch(()=>[]);const options=parseCordialText(body,headings,config);
    if(!options.length){await snapshot(page,'cordial-sin-opciones');const d=await diagnostic(page);throw new Error(`Cordial abrió el motor de reservas, pero no se pudieron interpretar tarifas. ${d}`);}
    const target=options.find(row=>row.target)||null;
    await snapshot(page,'cordial-resultados');
    return {ok:true,status:'ok',source:'BeCordial · navegador real · GitHub Actions + Playwright',checkedAt:isoNow(),hotel:config.hotel||'Cordial Santa Águeda & Perchel Beach Club',checkIn:config.checkIn,checkOut:config.checkOut,adults:Number(config.adults)||2,options,target,targetPrice:Number(target?.price)||0,availability:target?'Disponible':'Objetivo no encontrado',resultUrl:page.url()};
  }finally{await context.close();}
}

export const __cordialTest={parseCordialText,targetMatches,normalize,fillDateInputs,forceControlValue};
