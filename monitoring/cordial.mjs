// MFE_CORDIAL_AUTOMATION_VERSION: 2.1.96
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
async function optionDiagnostics(page,pattern){
  const rows=[];
  const candidates=page.locator('[role="option"],li,[data-id],[data-value],[data-code],[data-hotel-code],[data-destination-id]');
  const count=Math.min(await candidates.count().catch(()=>0),250);
  for(let i=0;i<count;i++){
    const el=candidates.nth(i);
    const text=String(await el.innerText().catch(()=>'' )).replace(/\s+/g,' ').trim();
    if(!text||!pattern.test(text))continue;
    const attrs=await el.evaluate(node=>{
      const out={};for(const name of ['role','value','data-id','data-value','data-code','data-hotel-code','data-destination-id','destination_id','hotel_code','hotel_codes','data-type','id','class']){const v=node.getAttribute?.(name);if(v)out[name]=v;}return out;
    }).catch(()=>({}));
    rows.push({text,attrs,visible:await visible(el)});
    if(rows.length>=12)break;
  }
  return rows;
}
async function selectAutocompleteValue(page,input,text,pattern){
  if(!await visible(input))return false;
  try{
    await input.click({force:true});
    await input.press('Control+A').catch(()=>{});
    await input.press('Backspace').catch(()=>{});
    await input.pressSequentially(text,{delay:35}).catch(async()=>{await input.fill(text).catch(()=>{});});
    await page.waitForTimeout(700);

    const targeted=[
      page.locator('[role="option"]').filter({hasText:pattern}),
      page.locator('.ui-autocomplete li,.select2-results__option,.choices__item--choice,.tt-suggestion,.autocomplete-suggestion').filter({hasText:pattern}),
      page.getByText(pattern)
    ];
    for(const group of targeted){
      const count=await group.count().catch(()=>0);
      for(let i=count-1;i>=0;i--){
        const option=group.nth(i);
        if(!await visible(option))continue;
        const box=await option.boundingBox().catch(()=>null);
        if(!box||box.width<20||box.height<10)continue;
        if(await option.click({force:true,timeout:3000}).then(()=>true).catch(()=>false)){await page.waitForTimeout(450);return true;}
      }
    }

    // Muchos autocompletados aceptan teclado aunque sus opciones no sean fáciles de localizar.
    await input.press('ArrowDown').catch(()=>{});
    await page.waitForTimeout(120);
    await input.press('Enter').catch(()=>{});
    await page.waitForTimeout(450);
    return true;
  }catch{return false;}
}
async function deriveHiddenFromRenderedOption(page,pattern,kind){
  const info=await optionDiagnostics(page,pattern);
  const preferred=kind==='destination'
    ?['destination_id','data-destination-id','data-id','data-value','value','data-code']
    :['data-hotel-code','data-code','data-value','value','data-id'];
  for(const row of info){
    for(const key of preferred){
      const value=String(row.attrs?.[key]||'').trim();
      if(value)return {value,source:`${key} de «${row.text}»`,rows:info};
    }
  }
  return {value:'',source:'',rows:info};
}
async function chooseHotel(page,config){
  const wanted=config.hotel||'Cordial Santa Águeda & Perchel Beach Club';
  const code=page.locator('input[name="hotel_codes"]').first();
  const destination=page.locator('input[name="destination_id"]').first();
  const visual=page.locator('input[placeholder*="destino" i],input[placeholder*="hotel" i]').first();
  const before={code:await code.inputValue().catch(()=>''),destination:await destination.inputValue().catch(()=>'' )};

  // En la página específica del hotel, BeCordial precarga hotel_codes=AGUEDA pero deja
  // destination_id vacío. El servidor devuelve de nuevo el buscador si se envía así.
  // Por eso seleccionamos primero el destino y después el hotel usando el mismo autocomplete
  // que utiliza un usuario real, y verificamos los hidden antes de lanzar la búsqueda.
  let destinationSelected=false,hotelSelected=false;

  // v2.1.96: el diagnóstico real de BeCordial mostró que el selector ya deja en el DOM
  // nodos ocultos seleccionados con destination_id (p. ej. el destino y el hotel), aunque
  // el input hidden destination_id siga vacío. Recuperamos ese identificador del propio DOM
  // antes de intentar manipular visualmente el autocomplete. No se hardcodea ningún ID.
  let prefilledDestination=String(await destination.inputValue().catch(()=>'' )).trim();
  if(!prefilledDestination){
    const fromHotel=await deriveHiddenFromRenderedOption(page,/Cordial Santa Águeda.*Perchel Beach Club/i,'destination');
    const fromDestination=fromHotel.value?{value:'',source:'',rows:[]}:await deriveHiddenFromRenderedOption(page,/^Gran Canaria\s*-\s*Sur(?:\s*\(España\))?$/i,'destination');
    const derived=fromHotel.value?fromHotel:fromDestination;
    if(derived.value){
      await forceControlValue(destination,derived.value).catch(()=>false);
      prefilledDestination=String(await destination.inputValue().catch(()=>'' )).trim();
      if(prefilledDestination){
        destinationSelected=true;
        if(fromHotel.value)hotelSelected=true;
        console.log(`[cordial] destination_id recuperado del modelo interno del selector: ${prefilledDestination} (${derived.source}).`);
      }
    }
  }

  if(await visible(visual)&&!prefilledDestination){
    destinationSelected=await selectAutocompleteValue(page,visual,'Gran Canaria - Sur',/^Gran Canaria\s*-\s*Sur$/i);
    await page.waitForTimeout(350);
    let destinationValue=String(await destination.inputValue().catch(()=>'' )).trim();
    if(!destinationValue){
      // Si el widget ha dibujado una opción con el identificador en data-*, lo extraemos
      // del propio DOM. No usamos IDs inventados ni constantes externas.
      await visual.click({force:true}).catch(()=>{});
      await visual.press('Control+A').catch(()=>{});
      await visual.pressSequentially('Gran Canaria - Sur',{delay:25}).catch(()=>{});
      await page.waitForTimeout(500);
      const derived=await deriveHiddenFromRenderedOption(page,/^Gran Canaria\s*-\s*Sur$/i,'destination');
      if(derived.value){await forceControlValue(destination,derived.value).catch(()=>false);destinationValue=String(await destination.inputValue().catch(()=>'' )).trim();console.log(`[cordial] destination_id derivado del selector: ${destinationValue||'—'} (${derived.source}).`);}
      if(!destinationValue&&derived.rows.length)console.log(`[cordial] Opciones de destino detectadas: ${JSON.stringify(derived.rows.slice(0,5))}`);
    }

    // Una vez inicializado el destino, seleccionamos explícitamente Santa Águeda.
    hotelSelected=await selectAutocompleteValue(page,visual,'Cordial Santa Águeda',/Cordial Santa Águeda.*Perchel Beach Club/i);
    await page.waitForTimeout(450);
  }

  // Algunos builds exponen la opción de hotel directamente con atributos data-*.
  let currentCode=String(await code.inputValue().catch(()=>'' )).trim();
  if(!currentCode){
    const dataOption=page.locator('[data-code="AGUEDA"],[data-value="AGUEDA"],[data-hotel-code="AGUEDA"]').last();
    if(await visible(dataOption)){await dataOption.click({force:true}).catch(()=>{});hotelSelected=true;await page.waitForTimeout(250);currentCode=String(await code.inputValue().catch(()=>'' )).trim();}
  }
  if(!currentCode&&String(before.code||'').trim()){
    await forceControlValue(code,before.code).catch(()=>false);
    currentCode=String(await code.inputValue().catch(()=>'' )).trim();
  }

  let currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();
  if(!currentDestination&&String(before.destination||'').trim()){
    await forceControlValue(destination,before.destination).catch(()=>false);
    currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();
  }

  // Último intento: con el hotel ya seleccionado, abrimos de nuevo el autocomplete y
  // buscamos cualquier nodo visible que represente Gran Canaria - Sur para obtener su ID.
  if(!currentDestination&&await visible(visual)){
    await visual.click({force:true}).catch(()=>{});
    await visual.press('Control+A').catch(()=>{});
    await visual.pressSequentially('Gran Canaria - Sur',{delay:25}).catch(()=>{});
    await page.waitForTimeout(500);
    const derived=await deriveHiddenFromRenderedOption(page,/^Gran Canaria\s*-\s*Sur$/i,'destination');
    if(derived.value){await forceControlValue(destination,derived.value).catch(()=>false);currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();console.log(`[cordial] destination_id recuperado del DOM: ${currentDestination||'—'} (${derived.source}).`);}
    // Restauramos el texto visible del hotel para no enviar el formulario con el buscador mostrando destino.
    await visual.press('Control+A').catch(()=>{});
    await visual.fill(wanted).catch(()=>{});
    await visual.dispatchEvent('change').catch(()=>{});
  }

  console.log(`[cordial] Hotel preparado: code=${currentCode||'—'} · destination_id=${currentDestination||'—'} · destino=${destinationSelected?'sí':'no'} · hotel=${hotelSelected?'sí':'no'}`);
  if(!currentCode)return false;
  if(!currentDestination){
    const diag=await optionDiagnostics(page,/Gran Canaria\s*-\s*Sur|Cordial Santa Águeda/i).catch(()=>[]);
    console.log(`[cordial] No se obtuvo destination_id. Diagnóstico del selector: ${JSON.stringify(diag.slice(0,8))}`);
    return false;
  }
  // Guardamos los valores críticos en el propio formulario. El JS de BeCordial puede
  // vaciar hotel_codes al procesar el botón Buscar aunque el hotel ya estuviera elegido.
  // Estos atributos internos nos permiten restaurarlos justo antes de cada intento de envío.
  const bookingForm=code.locator('xpath=ancestor::form[1]');
  if(await bookingForm.count().catch(()=>0)){
    await bookingForm.evaluate((f,data)=>{
      f.setAttribute('data-mfe-hotel-code',data.hotelCode);
      f.setAttribute('data-mfe-destination-id',data.destinationId);
    },{hotelCode:currentCode,destinationId:currentDestination}).catch(()=>{});
  }
  return true;
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
async function syncVisibleDateRange(page,checkIn,checkOut){
  // BeCordial mantiene un campo visual de rango separado de date_from/date_to.
  // Si ese texto se queda con las fechas anteriores, su JS puede considerar la búsqueda incompleta.
  const rangeText=await page.evaluate(([from,to])=>{
    const fmt=value=>new Intl.DateTimeFormat('es-ES',{weekday:'short',day:'numeric',month:'short'}).format(new Date(`${value}T12:00:00`)).replace(/,/g,'').replace(/\./g,'').trim();
    return `${fmt(from)} - ${fmt(to)}`;
  },[checkIn,checkOut]).catch(()=>`${checkIn} - ${checkOut}`);
  const form=page.locator('input[name="hotel_codes"]').first().locator('xpath=ancestor::form[1]');
  const scope=await form.count().catch(()=>0)?form:page.locator('body');
  const inputs=scope.locator('input[type="text"]');
  const count=await inputs.count().catch(()=>0);
  for(let i=0;i<count;i++){
    const input=inputs.nth(i),value=String(await input.inputValue().catch(()=>''));
    const name=String(await input.getAttribute('name').catch(()=>''));
    const placeholder=String(await input.getAttribute('placeholder').catch(()=>''));
    if(/promo|email|password|key/i.test(`${name} ${placeholder}`))continue;
    if(!(/\b(ene|feb|mar|abr|may|jun|jul|ago|sept|sep|oct|nov|dic)\b/i.test(value)&&/\s[-–]\s/.test(value)))continue;
    try{
      await input.evaluate((el,v)=>{
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
        if(setter)setter.call(el,v);else el.value=v;
        el.dispatchEvent(new Event('input',{bubbles:true}));
        el.dispatchEvent(new Event('change',{bubbles:true}));
        el.dispatchEvent(new Event('blur',{bubbles:true}));
      },rangeText);
      console.log(`[cordial] Rango visual sincronizado: ${rangeText}`);
      return true;
    }catch{}
  }
  return false;
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
      await syncVisibleDateRange(page,checkIn,checkOut).catch(()=>false);
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
async function bookingResultReady(page){
  if(/\/booking\/process\/room/i.test(page.url()))return true;
  const result=page.getByText(/Tarifa Club Cordial|Tarifa Estándar|Classic Duplex/i).first();
  return visible(result);
}
async function waitForBookingResult(page,timeout=45000){
  const started=Date.now();
  while(Date.now()-started<timeout){
    if(await bookingResultReady(page))return true;
    await page.waitForTimeout(350);
  }
  return false;
}
async function setControlValueRaw(loc,value){
  if(!loc||await loc.count().catch(()=>0)<1)return false;
  try{
    await loc.first().evaluate((el,v)=>{
      const proto=el instanceof HTMLInputElement?HTMLInputElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:null;
      const setter=proto?Object.getOwnPropertyDescriptor(proto,'value')?.set:null;
      if(setter)setter.call(el,v);else el.value=v;
    },String(value));
    return String(await loc.first().inputValue().catch(()=>''))===String(value);
  }catch{return false;}
}

async function stabilizeBookingControls(page,form=null,fallback={}){
  const hotel=page.locator('input[name="hotel_codes"]').first();
  const destination=page.locator('input[name="destination_id"]').first();
  const targetForm=form&&await form.count().catch(()=>0)?form:hotel.locator('xpath=ancestor::form[1]');
  if(!await targetForm.count().catch(()=>0))return {ok:false,hotelCode:'',destinationId:''};
  const remembered=await targetForm.evaluate(f=>({
    hotelCode:f.getAttribute('data-mfe-hotel-code')||'',
    destinationId:f.getAttribute('data-mfe-destination-id')||''
  })).catch(()=>({hotelCode:'',destinationId:''}));
  const wantedDestination=String(fallback.destinationId||remembered.destinationId||'').trim();
  const wantedHotel=String(fallback.hotelCode||remembered.hotelCode||'').trim();
  let hotelCode=String(await hotel.inputValue().catch(()=>'' )).trim();
  let destinationId=String(await destination.inputValue().catch(()=>'' )).trim();
  let restored=false;

  // BeCordial puede reconstruir el formulario tras un submit fallido. En ese caso se
  // pierden los atributos data-mfe-* y hotel_codes queda vacío. Conservamos además una
  // copia en memoria (fallback) y restauramos SIN disparar input/change.
  // Orden importante: primero destino y después hotel.
  if(!destinationId&&wantedDestination){
    restored=await setControlValueRaw(destination,wantedDestination).catch(()=>false)||restored;
    destinationId=String(await destination.inputValue().catch(()=>'' )).trim();
  }
  if(!hotelCode&&wantedHotel){
    restored=await setControlValueRaw(hotel,wantedHotel).catch(()=>false)||restored;
    hotelCode=String(await hotel.inputValue().catch(()=>'' )).trim();
  }
  if(restored)console.log(`[cordial] Controles restaurados antes del envío: destination_id=${destinationId||'—'} · hotel_codes=${hotelCode||'—'}`);
  return {ok:Boolean(hotelCode&&destinationId),hotelCode,destinationId};
}

async function formState(page,form){
  if(!await form.count().catch(()=>0))return null;
  return form.evaluate(f=>{
    const invalid=[...f.elements].filter(el=>typeof el.checkValidity==='function'&&!el.checkValidity()).map(el=>({name:el.name||'',type:el.type||'',value:el.value||'',validation:el.validationMessage||''}));
    const data=[];for(const [key,value] of new FormData(f).entries())data.push([key,String(value)]);
    return {action:f.action||'',method:(f.method||'get').toUpperCase(),id:f.id||'',valid:f.checkValidity(),invalid,data};
  }).catch(()=>null);
}
async function postFormDirect(page,form,fallback={}){
  const stable=await stabilizeBookingControls(page,form,fallback);
  if(!stable.ok){console.log(`[cordial] POST directo cancelado: faltan controles críticos · destination_id=${stable.destinationId||'—'} · hotel_codes=${stable.hotelCode||'—'}`);return false;}
  const state=await formState(page,form);if(!state?.action)return false;
  const params=new URLSearchParams();for(const [key,value] of state.data||[])params.append(key,value);
  // Defensa adicional: forzamos los valores críticos también en el payload.
  params.set('destination_id',stable.destinationId);
  params.set('hotel_codes',stable.hotelCode);
  console.log(`[cordial] POST directo de diagnóstico: ${state.action} · valid=${state.valid?'sí':'no'} · destination_id=${params.get('destination_id')||'—'} · hotel_codes=${params.get('hotel_codes')||'—'}`);
  if(state.invalid?.length)console.log(`[cordial] Controles HTML inválidos: ${JSON.stringify(state.invalid)}`);
  try{
    const response=await page.context().request.post(state.action,{data:params.toString(),headers:{'Content-Type':'application/x-www-form-urlencoded','Referer':page.url()},maxRedirects:0,timeout:30000});
    const status=response.status(),location=response.headers()['location']||'';
    console.log(`[cordial] Respuesta POST directa: HTTP ${status}${location?` · Location=${location}`:''}`);
    if(status>=300&&status<400&&location){const next=new URL(location,state.action).href;await page.goto(next,{waitUntil:'domcontentloaded',timeout:45000});return await waitForBookingResult(page,25000);}
    const html=await response.text().catch(()=>'');
    if(/Tarifa Club Cordial|Classic Duplex|booking\/process\/room/i.test(html)){
      await page.setContent(html,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
      return true;
    }
    const plain=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
    const clues=plain.match(/.{0,90}(?:obligatorio|requerido|required|error|selecciona|seleccione|fecha|hu[eé]sped|destino|hotel).{0,160}/gi)||[];
    console.log(`[cordial] Respuesta sin resultados. Pistas: ${(clues.slice(0,6).join(' | ')||plain.slice(0,900)||'sin texto')}`);
  }catch(error){console.log(`[cordial] POST directo falló: ${error?.message||String(error)}`);}
  return false;
}

async function installCriticalPostGuard(page,critical){
  const pattern='**/booking/process/**';
  let logged=false;
  const handler=async route=>{
    const request=route.request();
    if(request.method()!=='POST')return route.continue();
    const contentType=String(request.headers()['content-type']||'');
    if(!/application\/x-www-form-urlencoded/i.test(contentType))return route.continue();
    try{
      const params=new URLSearchParams(request.postData()||'');
      const beforeDestination=params.get('destination_id')||'';
      const beforeHotel=params.get('hotel_codes')||'';
      if(critical.destinationId)params.set('destination_id',critical.destinationId);
      if(critical.hotelCode)params.set('hotel_codes',critical.hotelCode);
      const headers={...request.headers()};delete headers['content-length'];
      if(!logged&&(beforeDestination!==critical.destinationId||beforeHotel!==critical.hotelCode)){
        console.log(`[cordial] POST interceptado y corregido antes de salir: destination_id=${beforeDestination||'—'}→${critical.destinationId||'—'} · hotel_codes=${beforeHotel||'—'}→${critical.hotelCode||'—'}`);
        logged=true;
      }
      return route.continue({postData:params.toString(),headers});
    }catch{return route.continue();}
  };
  await page.route(pattern,handler);
  return async()=>{await page.unroute(pattern,handler).catch(()=>{});};
}

async function submitSearch(page){
  const bookingInput=page.locator('input[name="hotel_codes"]').first();
  const form=bookingInput.locator('xpath=ancestor::form[1]');
  const initialCritical=await stabilizeBookingControls(page,form);
  const critical={destinationId:initialCritical.destinationId,hotelCode:initialCritical.hotelCode};
  console.log(`[cordial] Controles críticos antes de enviar: destination_id=${critical.destinationId||'—'} · hotel_codes=${critical.hotelCode||'—'}`);
  if(!initialCritical.ok)return false;
  const initialState=await formState(page,form);
  if(initialState){
    console.log(`[cordial] Formulario de búsqueda: ${initialState.method} ${initialState.action||'(sin action)'}${initialState.id?` · #${initialState.id}`:''} · HTML válido=${initialState.valid?'sí':'no'}`);
    if(initialState.invalid?.length)console.log(`[cordial] Validación HTML: ${JSON.stringify(initialState.invalid)}`);
  }

  // v2.1.96: el JS de BeCordial vacía hotel_codes justo al enviar. Interceptamos únicamente
  // el POST real y reponemos los dos campos críticos, manteniendo cookies, CSRF y listeners.
  const removeGuard=await installCriticalPostGuard(page,critical);
  try{
    const candidates=[
      page.getByRole('button',{name:/^buscar$/i}).last(),
      page.locator('button').filter({hasText:/^\s*Buscar\s*$/i}).last(),
      page.locator('input[type="submit"][value*="buscar" i]').last(),
      page.locator('[role="button"]').filter({hasText:/^\s*Buscar\s*$/i}).last(),
      page.getByRole('button',{name:/reservar|ver precios|consultar disponibilidad/i}).first(),
      page.locator('button[type="submit"],input[type="submit"]').last()
    ];
    for(const button of candidates){
      if(!await visible(button))continue;
      const label=(await button.innerText().catch(()=>''))||(await button.getAttribute('value').catch(()=>''))||'botón';
      console.log(`[cordial] Intentando búsqueda con: ${String(label).trim()||'botón visible'}`);
      const stable=await stabilizeBookingControls(page,form,critical);
      if(!stable.ok)continue;
      await button.scrollIntoViewIfNeeded().catch(()=>{});
      const responsePromise=page.waitForResponse(r=>/\/booking\/process\/?(?:$|\?)/i.test(r.url())&&r.request().method()==='POST',{timeout:10000}).catch(()=>null);
      const clicked=await button.click({force:true,timeout:5000}).then(()=>true).catch(()=>false);
      if(!clicked)continue;
      const response=await responsePromise;
      if(response)console.log(`[cordial] POST del botón: HTTP ${response.status()} · ${response.url()}`);
      if(await waitForBookingResult(page,20000))return true;
    }

    if(await form.count().catch(()=>0)){
      console.log('[cordial] El botón no abrió resultados; probando requestSubmit() del formulario.');
      const stableRequest=await stabilizeBookingControls(page,form,critical);
      if(!stableRequest.ok)return false;
      const requested=await form.evaluate(f=>{try{f.requestSubmit();return true;}catch{return false;}}).catch(()=>false);
      if(requested&&await waitForBookingResult(page,16000))return true;

      console.log('[cordial] requestSubmit() no abrió resultados; probando POST directo con la sesión del navegador.');
      if(await postFormDirect(page,form,critical))return true;

      console.log('[cordial] POST directo no abrió resultados; probando submit() HTML nativo.');
      const stableNative=await stabilizeBookingControls(page,form,critical);
      if(!stableNative.ok)return false;
      const submitted=await form.evaluate(f=>{try{HTMLFormElement.prototype.submit.call(f);return true;}catch{return false;}}).catch(()=>false);
      if(submitted&&await waitForBookingResult(page,20000))return true;
    }
    await snapshot(page,'cordial-formulario-fallido').catch(()=>{});
    return false;
  }finally{await removeGuard();}
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
  const forms=await page.locator('form').evaluateAll(nodes=>nodes.slice(0,12).map(f=>({action:f.action||'',method:(f.method||'get').toUpperCase(),id:f.id||'',name:f.getAttribute('name')||''}))).catch(()=>[]);
  const actions=await page.locator('button,input[type="submit"],[role="button"]').evaluateAll(nodes=>nodes.slice(0,40).map(el=>({tag:el.tagName,text:(el.innerText||el.value||el.getAttribute('aria-label')||'').trim(),type:el.getAttribute('type')||'',visible:!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length)}))).catch(()=>[]);
  return `URL final: ${page.url()}. Controles: ${inputs.map(x=>`${x.tag}:${x.name||x.placeholder||x.type}=${x.value}`).slice(0,18).join('; ')}. Formularios: ${forms.map(x=>`${x.method} ${x.action||'(sin action)'}${x.id?`#${x.id}`:''}`).join(' | ')||'ninguno'}. Botones: ${actions.map(x=>`${x.visible?'V':'H'}:${x.tag}:${x.text||x.type}`).slice(0,18).join(' | ')||'ninguno'}`;
}
export async function monitorCordial(browser,config={}){
  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:1300},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'});const page=await context.newPage();
  try{
    const url=String(config.searchUrl||'https://www.becordial.com/gran-canaria-sur/cordial-santa-agueda/').trim();
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(1800);await acceptCookies(page);
    if(!/\/booking\/process\/room/i.test(page.url())){
      const hotelOk=await chooseHotel(page,config).catch(()=>false);
      if(!hotelOk){const d=await diagnostic(page);throw new Error(`No se pudo inicializar por completo el destino/hotel de Cordial antes de buscar. ${d}`);}
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

export const __cordialTest={parseCordialText,targetMatches,normalize,fillDateInputs,forceControlValue,syncVisibleDateRange,submitSearch,formState,stabilizeBookingControls};
