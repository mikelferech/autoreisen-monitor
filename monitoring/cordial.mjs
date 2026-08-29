// MFE_CORDIAL_AUTOMATION_VERSION: 2.2.09
import {isoNow,snapshot,acceptCookies} from './lib.mjs';

const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const visible=loc=>loc.isVisible().catch(()=>false);
async function acceptCordialCookies(page){
  // BeCordial abre su gestor de cookies dentro de un iframe (/cookies/manager)
  // y lo cubre con Magnific Popup. En agosto de 2026 el iframe empezó a tardar
  // más en estar interactivo en GitHub Actions: el overlay podía estar visible
  // aunque todavía no hubiera ningún botón detectable. Intentamos primero el
  // consentimiento normal y, si el panel sigue bloqueando, cerramos únicamente
  // la capa visual conservando las cookies necesarias del sitio.
  await acceptCookies(page).catch(()=>{});
  const overlay='.cookiepanel-container-wrap,.popup-cookiepanel-wrapper,.mfp-wrap.cookiepanel-container-wrap,.mfp-bg';
  const iframe='#cookie_panel_iframe, iframe[src*="/cookies/manager"]';
  const framePresent=await page.locator(iframe).count().catch(()=>0);
  let clicked=false,forcedClose=false;

  if(framePresent){
    const frameLocator=page.frameLocator(iframe).first();
    // Esperamos explícitamente a que el iframe haya pintado su contenido.
    await frameLocator.locator('body').waitFor({state:'attached',timeout:8000}).catch(()=>{});
    await page.waitForTimeout(350);
    const labels=[/^aceptar$/i,/aceptar todas/i,/aceptar todo/i,/accept all/i,/^accept$/i,/allow all/i,/consentir/i];
    for(const label of labels){
      const candidates=[
        frameLocator.getByRole('button',{name:label}).first(),
        frameLocator.getByText(label,{exact:true}).first(),
        frameLocator.locator('button,input[type="button"],input[type="submit"],a').filter({hasText:label}).first()
      ];
      for(const btn of candidates){
        if(!await btn.isVisible().catch(()=>false))continue;
        clicked=await btn.click({timeout:5000,force:true}).then(()=>true).catch(()=>false);
        if(clicked)break;
      }
      if(clicked)break;
    }
  }

  if(clicked){
    await page.waitForTimeout(500);
    await page.locator('.cookiepanel-container-wrap,.popup-cookiepanel-wrapper').first()
      .waitFor({state:'hidden',timeout:5000}).catch(()=>{});
  }

  let overlayVisible=await page.locator('.cookiepanel-container-wrap,.popup-cookiepanel-wrapper').first()
    .isVisible().catch(()=>false);

  // Respaldo robusto: la captura diagnóstica del 29/08/2026 mostró el iframe
  // presente pero sin botón accionable. El propio sitio expone RolCookies y
  // Magnific Popup; intentamos cerrar mediante sus APIs y, como último recurso,
  // retiramos solo la capa bloqueante del DOM. Esto no altera el formulario ni
  // inyecta datos: únicamente permite interactuar con la página ya cargada.
  if(overlayVisible){
    forcedClose=await page.evaluate(()=>{
      let changed=false;
      try{
        const manager=window.RolCookies?.Manager;
        if(manager&&typeof manager.save==='function'){manager.save();changed=true;}
      }catch{}
      try{
        const jq=window.jQuery||window.$;
        if(jq?.magnificPopup&&typeof jq.magnificPopup.close==='function'){jq.magnificPopup.close();changed=true;}
      }catch{}
      for(const el of document.querySelectorAll('.cookiepanel-container-wrap,.popup-cookiepanel-wrapper,.mfp-wrap.cookiepanel-container-wrap,.mfp-bg')){
        try{el.remove();changed=true;}catch{}
      }
      try{document.documentElement.style.overflow='';document.body.style.overflow='';document.body.style.paddingRight='';}catch{}
      return changed;
    }).catch(()=>false);
    await page.waitForTimeout(300);
    overlayVisible=await page.locator('.cookiepanel-container-wrap,.popup-cookiepanel-wrapper').first()
      .isVisible().catch(()=>false);
  }

  if(framePresent||overlayVisible||clicked||forcedClose){
    console.log(`[cordial] Cookies: iframe=${framePresent?'sí':'no'} · acción=${clicked?'aceptar':forcedClose?'cierre de respaldo':'no detectada'} · overlay=${overlayVisible?'visible':'cerrado'}.`);
  }else{
    console.log('[cordial] Cookies: sin panel bloqueante.');
  }
  return !overlayVisible;
}
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
function positiveCancellation(row){
  const text=normalize(row?.cancellation||'');
  if(!text)return false;
  if(/no reembolsable|con gastos/.test(text))return false;
  return /cancelacion gratuita|reembolsable|cancelacion/.test(text);
}
function selectTargetOption(options=[],config={}){
  const exact=options.find(row=>targetMatches(row,config));
  if(exact){exact.target=true;exact.targetMatch='exact';return exact;}
  const room=normalize(config.targetRoom||'Classic Duplex');
  const rate=normalize(config.targetRate||'Club Cordial - Reserva Online');
  const board=normalize(config.targetBoard||'SOLO ALOJAMIENTO');
  const candidates=[];
  for(const row of options){
    const rowRoom=normalize(row?.roomType),rowRate=normalize(row?.rateName),rowBoard=normalize(row?.board);
    if(board&&!rowBoard.includes(board))continue;
    let score=50;
    const roomMatch=!room||rowRoom.includes(room)||rowRate.includes(room);
    const rateMatch=!rate||rowRate.includes(rate)||rowRoom.includes(rate);
    if(roomMatch)score+=100;
    if(rateMatch)score+=80;
    if(rate.includes('reserva online')&&(rowRate.includes('reserva online')||rowRoom.includes('reserva online')))score+=35;
    if(positiveCancellation(row))score+=30;
    if(/tarifa club cordial/.test(rowRate))score+=10;
    if(score<150)continue;
    candidates.push({row,score,price:Number(row?.price)||Number.POSITIVE_INFINITY});
  }
  candidates.sort((a,b)=>b.score-a.score||a.price-b.price);
  const chosen=candidates[0]?.row||null;
  if(chosen){chosen.target=true;chosen.targetMatch='inferred';}
  return chosen;
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

async function selectHotelThroughUi(page,wanted){
  const visual=page.locator('input[placeholder*="destino" i],input[placeholder*="hotel" i]').first();
  const code=page.locator('input[name="hotel_codes"]').first();
  const destination=page.locator('input[name="destination_id"]').first();
  if(!await visible(visual))return false;
  const wantedPattern=/Cordial Santa Águeda.*Perchel Beach Club/i;
  try{
    // v2.1.98: antes de tocar hidden inputs intentamos reproducir la selección humana real.
    // El JS de BeCordial mantiene estado interno asociado al autocomplete y, si únicamente
    // escribimos hotel_codes/destination_id, puede vaciar hotel_codes justo al pulsar Buscar.
    await visual.click({force:true});
    await visual.press('Control+A').catch(()=>{});
    await visual.press('Backspace').catch(()=>{});
    await visual.pressSequentially(wanted,{delay:22}).catch(async()=>{await visual.fill(wanted).catch(()=>{});});
    await page.waitForTimeout(650);

    const selector='[role="option"],.ui-autocomplete li,.select2-results__option,.choices__item--choice,.tt-suggestion,.autocomplete-suggestion,[data-hotel-code],[hotel_code],[hotel_codes],[data-code]';
    const options=page.locator(selector).filter({hasText:wantedPattern});
    const count=Math.min(await options.count().catch(()=>0),30);
    for(let i=count-1;i>=0;i--){
      const option=options.nth(i);
      if(!await visible(option))continue;
      const text=String(await option.innerText().catch(()=>'' )).replace(/\s+/g,' ').trim();
      if(!wantedPattern.test(text))continue;
      const clicked=await option.click({timeout:3500}).then(()=>true).catch(async()=>option.click({force:true,timeout:3500}).then(()=>true).catch(()=>false));
      if(!clicked)continue;
      await page.waitForTimeout(650);
      const hotelCode=String(await code.inputValue().catch(()=>'' )).trim();
      const destinationId=String(await destination.inputValue().catch(()=>'' )).trim();
      const visualValue=String(await visual.inputValue().catch(()=>'' )).trim();
      console.log(`[cordial] Selección real del hotel: visual=${visualValue||'—'} · destination_id=${destinationId||'—'} · hotel_codes=${hotelCode||'—'}`);
      if(hotelCode){
        // El elemento de hotel contiene actualmente el destination_id en su modelo interno.
        // Si el listener rellenó hotel_codes pero no el hidden destino, recuperamos solo ese ID.
        if(!destinationId){
          const derived=await deriveHiddenFromRenderedOption(page,wantedPattern,'destination');
          if(derived.value)await forceControlValue(destination,derived.value).catch(()=>false);
        }
        const finalDestination=String(await destination.inputValue().catch(()=>'' )).trim();
        if(finalDestination)return true;
      }
    }

    // Algunos widgets no exponen una opción clicable pero sí aceptan teclado.
    await visual.press('ArrowDown').catch(()=>{});
    await page.waitForTimeout(120);
    await visual.press('Enter').catch(()=>{});
    await page.waitForTimeout(650);
    const hotelCode=String(await code.inputValue().catch(()=>'' )).trim();
    let destinationId=String(await destination.inputValue().catch(()=>'' )).trim();
    if(hotelCode&&!destinationId){
      const derived=await deriveHiddenFromRenderedOption(page,wantedPattern,'destination');
      if(derived.value){await forceControlValue(destination,derived.value).catch(()=>false);destinationId=String(await destination.inputValue().catch(()=>'' )).trim();}
    }
    if(hotelCode&&destinationId){
      console.log(`[cordial] Selección real del hotel mediante teclado: visual=${String(await visual.inputValue().catch(()=>'' )).trim()||'—'} · destination_id=${destinationId} · hotel_codes=${hotelCode}`);
      return true;
    }
  }catch(error){console.log(`[cordial] No se pudo completar la selección interactiva del hotel: ${error?.message||String(error)}`);}
  return false;
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
async function selectHotelFromNativePopup(page,wanted='Cordial Santa Águeda & Perchel Beach Club',wantedCode='AGUEDA'){
  // El diagnóstico real de BeCordial muestra que el selector NO es un autocomplete clásico:
  // #where_popup contiene <li class="hotel" data-hotel="AGUEDA">. Pulsar ese elemento es
  // la forma más fiel de reproducir la selección humana y permite que el JS propio del motor
  // rellene hotel_codes/destination_id y cualquier estado interno asociado.
  const form=page.locator('#booking_process_form').first();
  const code=form.locator('input[name="hotel_codes"]').first();
  const destination=form.locator('input[name="destination_id"]').first();
  const visual=form.locator('#id_search_text,input.search_text,input[placeholder*="destino" i],input[placeholder*="hotel" i]').first();
  const opener=form.locator('.input-like.where').first();
  const popup=form.locator('#where_popup').first();
  const destinationOption=popup.locator('li.destination[data-destination="220"]').first();
  const hotelOption=popup.locator(`li.hotel[data-hotel="${wantedCode}"]`).first();
  if(!await form.count().catch(()=>0)||!await hotelOption.count().catch(()=>0))return false;
  try{
    if(await opener.count().catch(()=>0))await opener.click({timeout:3500}).catch(async()=>{await visual.click({force:true,timeout:2500}).catch(()=>{});});
    await page.waitForTimeout(220);
    // Si el destino no está ya marcado, lo seleccionamos desde el mismo popup nativo.
    if(await destinationOption.count().catch(()=>0)){
      const selected=await destinationOption.evaluate(el=>el.classList.contains('li_selected')).catch(()=>false);
      if(!selected){
        await destinationOption.click({timeout:3000}).catch(async()=>destinationOption.click({force:true,timeout:3000}).catch(()=>{}));
        await page.waitForTimeout(220);
      }
    }
    const clicked=await hotelOption.click({timeout:3500}).then(()=>true).catch(async()=>hotelOption.click({force:true,timeout:3500}).then(()=>true).catch(()=>false));
    if(!clicked)return false;
    await page.waitForTimeout(550);
    const hotelCode=String(await code.inputValue().catch(()=>'' )).trim();
    const destinationId=String(await destination.inputValue().catch(()=>'' )).trim();
    const visualValue=String(await visual.inputValue().catch(()=>'' )).trim();
    console.log(`[cordial] Selector nativo de hotel: visual=${visualValue||'—'} · destination_id=${destinationId||'—'} · hotel_codes=${hotelCode||'—'}`);
    if(hotelCode===wantedCode&&destinationId){
      await form.evaluate((f,data)=>{f.setAttribute('data-mfe-hotel-code',data.hotelCode);f.setAttribute('data-mfe-destination-id',data.destinationId);},{hotelCode,destinationId}).catch(()=>{});
      return true;
    }
  }catch(error){console.log(`[cordial] Selector nativo de hotel no pudo completarse: ${error?.message||String(error)}`);}
  return false;
}

async function chooseHotel(page,config){
  const wanted=config.hotel||'Cordial Santa Águeda & Perchel Beach Club';
  const code=page.locator('input[name="hotel_codes"]').first();
  const destination=page.locator('input[name="destination_id"]').first();
  const visual=page.locator('input[placeholder*="destino" i],input[placeholder*="hotel" i]').first();
  const before={code:await code.inputValue().catch(()=>''),destination:await destination.inputValue().catch(()=>'' )};

  // Primera opción: usar el selector nativo real que descubrimos en el HTML de diagnóstico.
  const selectedNative=await selectHotelFromNativePopup(page,wanted,'AGUEDA').catch(()=>false);
  if(selectedNative){
    const currentCode=String(await code.inputValue().catch(()=>'' )).trim();
    const currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();
    console.log(`[cordial] Hotel preparado con selector nativo: code=${currentCode||'—'} · destination_id=${currentDestination||'—'}`);
    return Boolean(currentCode&&currentDestination);
  }

  // Segundo intento: selección real mediante el autocomplete/entrada visual, porque ese clic ejecuta
  // los listeners internos de BeCordial y prepara más estado que los hidden por sí solos.
  const selectedThroughUi=await selectHotelThroughUi(page,wanted).catch(()=>false);
  if(selectedThroughUi){
    const currentCode=String(await code.inputValue().catch(()=>'' )).trim();
    const currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();
    const visualValue=String(await visual.inputValue().catch(()=>'' )).trim();
    console.log(`[cordial] Hotel preparado mediante interfaz: code=${currentCode||'—'} · destination_id=${currentDestination||'—'} · visual=${visualValue||'—'}`);
    const bookingForm=code.locator('xpath=ancestor::form[1]');
    if(await bookingForm.count().catch(()=>0)){
      await bookingForm.evaluate((f,data)=>{f.setAttribute('data-mfe-hotel-code',data.hotelCode);f.setAttribute('data-mfe-destination-id',data.destinationId);},{hotelCode:currentCode,destinationId:currentDestination}).catch(()=>{});
    }
    return Boolean(currentCode&&currentDestination);
  }
  console.log('[cordial] El autocomplete no confirmó una selección real; usando compatibilidad por hidden como respaldo.');

  // En la página específica del hotel, BeCordial precarga hotel_codes=AGUEDA pero deja
  // destination_id vacío. El servidor devuelve de nuevo el buscador si se envía así.
  // Por eso seleccionamos primero el destino y después el hotel usando el mismo autocomplete
  // que utiliza un usuario real, y verificamos los hidden antes de lanzar la búsqueda.
  let destinationSelected=false,hotelSelected=false;

  // v2.1.95: el diagnóstico real de BeCordial mostró que el selector ya deja en el DOM
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

  // El motor de BeCordial puede mantener la URL en /booking/process/ aunque ya haya
  // renderizado las habitaciones. En las ejecuciones reales v2.1.98 se observan varios
  // botones visibles "Reservar" tras el submit nativo, pero la comprobación antigua
  // seguía interpretándolo como formulario fallido. Detectamos también esa firma real.
  const resultText=page.getByText(/Tarifa Club Cordial|Tarifa Estándar|Classic Duplex|Solo alojamiento|Desayuno/i);
  const resultCount=await resultText.count().catch(()=>0);
  for(let i=0;i<Math.min(resultCount,12);i++){if(await visible(resultText.nth(i)))return true;}

  const reserveButtons=page.getByRole('button',{name:/^reservar$/i});
  const count=await reserveButtons.count().catch(()=>0);
  let visibleReserve=0;
  for(let i=0;i<Math.min(count,30);i++){if(await visible(reserveButtons.nth(i)))visibleReserve++;}
  if(visibleReserve>=2){
    const body=await page.locator('body').innerText().catch(()=> '');
    const hotelListSignature=['Cordial Green Golf','Cordial Sandy Golf','Cordial Mogán Valle','Cordial Mogán Playa'].filter(name=>body.includes(name)).length>=2;
    const hasRoomContent=/SOLO ALOJAMIENTO|DESAYUNO|Classic|Duplex|Dúplex|Deluxe|Ocean|Tarifa Club Cordial|Tarifa Estándar/i.test(body);
    if(hotelListSignature){
      console.log(`[cordial] Resultados intermedios detectados: lista de hoteles (${visibleReserve} botones Reservar).`);
      return true;
    }
    if(hasRoomContent){
      console.log(`[cordial] Resultados de habitaciones detectados en /booking/process/ por ${visibleReserve} botones Reservar visibles.`);
      return true;
    }
  }
  return false;
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

  // v2.1.98: el JS de BeCordial vacía hotel_codes justo al enviar. Interceptamos únicamente
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
async function visibleReserveCount(page){
  const reserves=page.getByRole('button',{name:/^reservar$/i});
  const count=Math.min(await reserves.count().catch(()=>0),60);let visibleCount=0;
  for(let i=0;i<count;i++)if(await visible(reserves.nth(i)))visibleCount++;
  return visibleCount;
}
async function roomRatesReady(page,config={}){
  const wantedRoom=String(config.targetRoom||'Classic Duplex').trim();
  const body=await page.locator('body').innerText().catch(()=> '');
  if(wantedRoom&&new RegExp(wantedRoom.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i').test(body))return true;
  if(/Tarifa Club Cordial|Tarifa Est[aá]ndar|Club Cordial\s*-\s*(?:Oferta Prepago Online|Reserva Online)|SOLO ALOJAMIENTO/i.test(body))return true;
  return /\/booking\/process\/room/i.test(page.url())&&await visibleReserveCount(page)>0;
}
async function destinationHotelListReady(page){
  const cards=page.locator('.hotel_list .hotel,.hotels_list .hotel,.hotel-list .hotel');
  let visibleCards=0;const count=Math.min(await cards.count().catch(()=>0),40);
  for(let i=0;i<count;i++)if(await visible(cards.nth(i)))visibleCards++;
  if(visibleCards>=2)return true;
  const body=await page.locator('body').innerText().catch(()=> '');
  const signatures=['Cordial Green Golf','Cordial Sandy Golf','Cordial Mogán Valle','Cordial Mogán Playa'];
  return signatures.filter(name=>body.includes(name)).length>=2&&await visibleReserveCount(page)>=2;
}
async function clickTargetHotelFromResults(page,config={}){
  if(!await destinationHotelListReady(page))return false;
  const wanted=String(config.hotel||'Cordial Santa Águeda & Perchel Beach Club').trim();
  const wantedPattern=/Cordial Santa Águeda.*Perchel Beach Club/i;
  const directCards=[
    page.locator('.hotel_list .hotel').filter({hasText:wantedPattern}),
    page.locator('.hotels_list .hotel').filter({hasText:wantedPattern}),
    page.locator('.hotel-list .hotel').filter({hasText:wantedPattern})
  ];
  for(const group of directCards){
    const count=Math.min(await group.count().catch(()=>0),8);
    for(let i=0;i<count;i++){
      const card=group.nth(i);if(!await visible(card))continue;
      const btn=card.getByRole('button',{name:/^reservar$/i}).first();
      if(!await visible(btn))continue;
      console.log(`[cordial] Resultado intermedio: seleccionando hotel «${wanted}» desde la lista de hoteles.`);
      const clicked=await btn.click({timeout:5000}).then(()=>true).catch(async()=>btn.click({force:true,timeout:5000}).then(()=>true).catch(()=>false));
      if(!clicked)continue;
      const started=Date.now();while(Date.now()-started<30000){if(await roomRatesReady(page,config))return true;await page.waitForTimeout(350);}
    }
  }
  // Respaldo: localizamos qué botón Reservar pertenece a un ancestro cuyo texto contiene el hotel.
  const reserves=page.getByRole('button',{name:/^reservar$/i});
  const count=Math.min(await reserves.count().catch(()=>0),50);
  for(let i=0;i<count;i++){
    const btn=reserves.nth(i);if(!await visible(btn))continue;
    const belongs=await btn.evaluate((el,name)=>{
      const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const target=norm(name);let node=el.parentElement;
      for(let depth=0;node&&depth<7;depth++,node=node.parentElement){
        const text=norm(node.innerText||'');if(text.includes(target))return true;
        if(text.length>8000)break;
      }return false;
    },wanted).catch(()=>false);
    if(!belongs)continue;
    console.log(`[cordial] Resultado intermedio: hotel objetivo localizado por contexto; pulsando Reservar.`);
    const clicked=await btn.click({timeout:5000}).then(()=>true).catch(async()=>btn.click({force:true,timeout:5000}).then(()=>true).catch(()=>false));
    if(!clicked)continue;
    const started=Date.now();while(Date.now()-started<30000){if(await roomRatesReady(page,config))return true;await page.waitForTimeout(350);}
  }
  await snapshot(page,'cordial-lista-hoteles-sin-seleccionar').catch(()=>{});
  console.log(`[cordial] Se obtuvo una lista de hoteles, pero no se pudo abrir «${wanted}».`);
  return false;
}
async function ensureRoomResults(page,config={}){
  if(await roomRatesReady(page,config))return true;
  if(await destinationHotelListReady(page))return await clickTargetHotelFromResults(page,config);
  return false;
}

async function selectClubTab(page){
  const tabs=page.getByText(/Tarifa Club Cordial/i);
  const count=await tabs.count().catch(()=>0);
  for(let i=0;i<Math.min(count,12);i++){
    const tab=tabs.nth(i);
    if(!await visible(tab))continue;
    await tab.click().catch(()=>{});
    await page.waitForTimeout(800);
    return true;
  }
  return false;
}
function isBoard(line){return /^(SOLO ALOJAMIENTO|DESAYUNO|MEDIA PENSI[ÓO]N|PENSI[ÓO]N COMPLETA|TODO INCLUIDO|ALOJAMIENTO Y DESAYUNO)$/i.test(String(line).trim());}
function isRate(line){return /^(Club Cordial\s*-|Tarifa Est[aá]ndar|Oferta .*Online|Reserva Online)/i.test(String(line).trim());}
function isCancellation(line){return /cancelaci[oó]n|reembolsable|no reembolsable/i.test(String(line));}
function looksRoom(line,headings){const n=normalize(line);if(!n||n.length>75)return false;if(/club cordial\s*-|reserva online|oferta prepago online|tarifa est[aá]ndar/i.test(line))return false;if(headings.has(n)&&!/resumen|habitaci[oó]n 1|cordial santa|m[aá]s informaci[oó]n|tarifa|filtro|ordenar/i.test(line))return true;return /^(classic|deluxe|ocean|premium|superior|villa|suite|duplex|d[uú]plex)/i.test(line);}
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

function contextLines(text){return String(text||'').split(/\n+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);}
function extractRateLine(text){
  const lines=contextLines(text);
  for(const line of lines){if(isRate(line))return line;}
  const flat=String(text||'').replace(/\s+/g,' ').trim();
  const m=flat.match(/Club Cordial\s*-\s*(?:Oferta Prepago Online|Reserva Online)/i);
  if(m)return m[0];
  return /Tarifa Club Cordial/i.test(flat)?'Tarifa Club Cordial':'';
}
function extractCancellation(text){return contextLines(text).find(isCancellation)||'';}
function extractAvailability(text){return contextLines(text).find(line=>/queda\s+\d+\s+habitaci[oó]n|agotad|no disponible|sold out/i.test(line))||'';}
function roomFromContext(context,headings){
  const headingSet=new Set((headings||[]).map(normalize));
  // La web de BeCordial no usa siempre H1-H6 para el nombre de la habitación.
  // v2.2.02: reserveContexts también captura etiquetas de habitación visibles
  // por su texto directo y las priorizamos para no asignar todas las tarifas al
  // último H2/H3 encontrado (p. ej. Deluxe Duplex).
  for(const h of [...(context.precedingRoomLabels||[])].reverse()){if(looksRoom(h,headingSet))return h;}
  const candidates=[];
  for(const ancestor of context.ancestors||[])for(const h of ancestor.headings||[])candidates.push(h);
  for(const h of [...candidates].reverse()){if(looksRoom(h,headingSet))return h;}
  for(const h of [...(context.precedingHeadings||[])].reverse()){if(looksRoom(h,headingSet))return h;}
  for(const ancestor of [...(context.ancestors||[])].reverse()){
    for(const line of contextLines(ancestor.text)){if(looksRoom(line,headingSet))return line;}
  }
  return '';
}
export function parseReserveContext(context,headingTexts=[],config={}){
  const ancestors=Array.isArray(context?.ancestors)?context.ancestors:[];
  let tariffIndex=-1,board='',money=[];
  for(let i=0;i<ancestors.length;i++){
    const lines=contextLines(ancestors[i].text);
    const foundBoard=lines.find(isBoard)||'';
    const foundMoney=eur(ancestors[i].text);
    if(foundBoard&&foundMoney.length){tariffIndex=i;board=foundBoard;money=foundMoney;break;}
  }
  if(tariffIndex<0)return null;
  let rate='',cancellation='',availability='';
  for(let i=tariffIndex;i<ancestors.length;i++){
    const text=ancestors[i].text||'';
    if(!rate)rate=extractRateLine(text);
    if(!cancellation)cancellation=extractCancellation(text);
    if(!availability)availability=extractAvailability(text);
    if(rate&&cancellation)break;
  }
  const room=roomFromContext(context,headingTexts);
  if(!room)return null;
  const price=money[money.length-1],crossedPrice=money.length>1?money[0]:0;
  if(!Number.isFinite(price)||price<=0)return null;
  const row={roomType:room,rateName:rate||'Tarifa Club Cordial',cancellation,board:String(board).toUpperCase(),price,crossedPrice,availability:availability||'Disponible'};
  row.target=targetMatches(row,config);
  return row;
}
function dedupeOptions(rows=[]){
  const map=new Map();
  for(const row of rows.filter(Boolean)){
    const key=[normalize(row.roomType),normalize(row.rateName),normalize(row.board),Number(row.price)||0].join('|');
    if(!map.has(key)||row.target)map.set(key,row);
  }
  return [...map.values()];
}
function mergeCordialOptions(domRows=[],textRows=[]){
  // El parser de texto recorre la página en orden y suele acertar mejor el nombre
  // de habitación; el parser DOM aporta cancelación/disponibilidad de cada botón.
  // Cuando ambos describen la misma tarifa, fusionamos y conservamos roomType del
  // parser de texto. Así evitamos duplicados del tipo "Deluxe Duplex / Club Cordial".
  const merged=textRows.map(row=>({...row}));
  const sig=row=>[normalize(row?.rateName),normalize(row?.board),Number(row?.price||0).toFixed(2)].join('|');
  const index=new Map();
  merged.forEach((row,i)=>{const key=sig(row);if(!index.has(key))index.set(key,[]);index.get(key).push(i);});
  for(const row of domRows){
    const matches=index.get(sig(row))||[];
    if(matches.length===1){
      const target=merged[matches[0]];
      if(!target.cancellation&&row.cancellation)target.cancellation=row.cancellation;
      if(!target.availability&&row.availability)target.availability=row.availability;
      if(!target.crossedPrice&&row.crossedPrice)target.crossedPrice=row.crossedPrice;
      target.target=Boolean(target.target||row.target);
      continue;
    }
    merged.push({...row});
  }
  return dedupeOptions(merged);
}
async function reserveContexts(page){
  return page.locator('button,input[type="button"],input[type="submit"],a').evaluateAll(nodes=>{
    const visible=el=>!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length);
    const label=el=>String(el.innerText||el.value||el.getAttribute('aria-label')||'').replace(/\s+/g,' ').trim();
    const reserve=nodes.filter(el=>visible(el)&&/^reservar$/i.test(label(el))).slice(0,80);
    const allHeadings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible);
    const ownText=el=>[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>String(n.textContent||'')).join(' ').replace(/\s+/g,' ').trim();
    const roomLike=text=>{
      const t=String(text||'').replace(/\s+/g,' ').trim();
      if(!t||t.length>75||/club cordial\s*-|reserva online|oferta prepago online|tarifa est[aá]ndar|solo alojamiento|desayuno/i.test(t))return false;
      return /^(classic|deluxe|ocean|premium|superior|villa|suite|duplex|d[uú]plex)(?:\s+[\p{L}0-9&+\-]+){0,6}$/iu.test(t);
    };
    // Capturamos nombres de habitación aunque sean <div>/<span>/<strong> y no headings.
    // El texto directo evita que un contenedor enorme herede el texto de todas sus tarifas.
    const roomNodes=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p,strong,b')]
      .filter(visible).map(el=>({el,text:ownText(el)||label(el)})).filter(x=>roomLike(x.text));
    return reserve.map((button,index)=>{
      const ancestors=[];let node=button.parentElement;
      for(let depth=0;node&&depth<11;depth++,node=node.parentElement){
        const text=String(node.innerText||'').trim();
        const headings=[...node.querySelectorAll(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6,h1,h2,h3,h4,h5,h6')]
          .filter(visible).slice(0,8).map(h=>String(h.innerText||'').replace(/\s+/g,' ').trim()).filter(Boolean);
        ancestors.push({tag:node.tagName,id:node.id||'',className:String(node.className||'').slice(0,180),text:text.slice(0,5000),headings});
        if(text.length>12000)break;
      }
      const precedingHeadings=allHeadings.filter(h=>(h.compareDocumentPosition(button)&Node.DOCUMENT_POSITION_FOLLOWING)!==0)
        .slice(-12).map(h=>String(h.innerText||'').replace(/\s+/g,' ').trim()).filter(Boolean);
      const precedingRoomLabels=roomNodes.filter(x=>(x.el.compareDocumentPosition(button)&Node.DOCUMENT_POSITION_FOLLOWING)!==0)
        .slice(-8).map(x=>x.text);
      return {index,label:label(button),ancestors,precedingHeadings,precedingRoomLabels};
    });
  }).catch(()=>[]);
}
async function parseCordialDom(page,headingTexts=[],config={}){
  const contexts=await reserveContexts(page);
  const rows=dedupeOptions(contexts.map(ctx=>parseReserveContext(ctx,headingTexts,config)));
  console.log(`[cordial] Parser DOM: ${contexts.length} botones Reservar analizados · ${rows.length} tarifas interpretadas.`);
  if(rows.length){
    for(const row of rows.slice(0,24))console.log(`[cordial] Tarifa: ${row.roomType} · ${row.rateName} · ${row.board} · ${row.price.toFixed(2)} €${row.target?' · OBJETIVO':''}`);
  }else if(contexts.length){
    const summary=contexts.slice(0,8).map(ctx=>({index:ctx.index,precedingRoomLabels:(ctx.precedingRoomLabels||[]).slice(-4),precedingHeadings:ctx.precedingHeadings.slice(-4),ancestors:ctx.ancestors.slice(0,5).map(a=>({tag:a.tag,id:a.id,className:a.className,text:String(a.text||'').replace(/\s+/g,' ').slice(0,700)}))}));
    console.log(`[cordial] Contextos Reservar no interpretados: ${JSON.stringify(summary)}`);
  }
  return {rows,contexts};
}
async function extractRoomMeta(page){
  const fallback='https://www.becordial.com/gran-canaria-sur/cordial-santa-agueda/viviendas/';
  return page.evaluate((fallbackUrl)=>{
    const wanted=['Classic','Classic Duplex','Deluxe','Deluxe Duplex','Ocean Front','Beach Club House'];
    const norm=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
    const visible=el=>!!(el&&(el.offsetWidth||el.offsetHeight||el.getClientRects().length));
    const ownText=el=>[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>String(n.textContent||'')).join(' ').replace(/\s+/g,' ').trim();
    const result={};
    for(const room of wanted){
      const target=norm(room);
      const candidates=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p,strong,b')].filter(visible).filter(el=>norm(ownText(el)||el.textContent)===target);
      let imageUrl='',detailUrl='';
      for(const el of candidates){
        let node=el;
        for(let depth=0;node&&depth<7;depth++,node=node.parentElement){
          if(!imageUrl){
            const img=[...node.querySelectorAll('img')].find(visible);
            if(img)imageUrl=String(img.currentSrc||img.src||'').trim();
            if(!imageUrl){
              const bg=[node,...node.querySelectorAll('*')].find(x=>{const v=getComputedStyle(x).backgroundImage;return visible(x)&&v&&v!=='none'&&/url\(/i.test(v);});
              const m=bg?String(getComputedStyle(bg).backgroundImage||'').match(/url\(["']?([^"')]+)["']?\)/i):null;
              if(m)imageUrl=m[1];
            }
          }
          if(!detailUrl){
            const link=[...node.querySelectorAll('a[href]')].find(a=>/m[aá]s detalles|ver detalle|detalle/i.test(String(a.textContent||'')));
            if(link)detailUrl=String(link.href||'').trim();
          }
          if(imageUrl&&detailUrl)break;
          if(String(node.innerText||'').length>12000)break;
        }
        if(imageUrl||detailUrl)break;
      }
      result[room]={name:room,imageUrl,detailUrl:detailUrl||fallbackUrl};
    }
    return result;
  },fallback).catch(()=>({}));
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
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(1800);const cookiesReady=await acceptCordialCookies(page);if(!cookiesReady){await snapshot(page,'cordial-cookies-bloqueando').catch(()=>{});throw new Error('El panel de cookies de BeCordial sigue bloqueando el formulario y no se pudo cerrar automáticamente.');}
    if(!/\/booking\/process\/room/i.test(page.url())){
      const hotelOk=await chooseHotel(page,config).catch(()=>false);
      if(!hotelOk){const d=await diagnostic(page);throw new Error(`No se pudo inicializar por completo el destino/hotel de Cordial antes de buscar. ${d}`);}
      const datesOk=await fillDateInputs(page,config).catch(()=>false);await setAdults(page,config).catch(()=>false);
      if(!datesOk){const d=await diagnostic(page);throw new Error(`No se localizaron de forma fiable los campos de fechas del formulario público de Cordial. ${d}`);}
      const submitted=await submitSearch(page);if(!submitted){const d=await diagnostic(page);throw new Error(`No se pudo enviar el formulario de reserva de Cordial. ${d}`);}
    }
    await page.waitForTimeout(900);
    const roomReady=await ensureRoomResults(page,config).catch(()=>false);
    if(!roomReady){await snapshot(page,'cordial-sin-llegar-habitaciones').catch(()=>{});const d=await diagnostic(page);throw new Error(`Cordial respondió a la búsqueda, pero no se pudo llegar a las habitaciones del hotel objetivo. ${d}`);}
    console.log('[cordial] Hotel objetivo abierto: pantalla de habitaciones/tarifas disponible.');
    await page.waitForTimeout(900);await selectClubTab(page).catch(()=>false);await page.waitForTimeout(650);
    // Guardamos la pantalla REAL de resultados antes de interpretar nada. Si el lector vuelve
    // a fallar, el artefacto contendrá por fin el DOM de las tarifas y no solo el buscador.
    await snapshot(page,'cordial-resultados-bruto').catch(()=>{});
    const body=await page.locator('body').innerText().catch(()=> '');
    if(/captcha|verify you are human|comprobando su navegador|access denied/i.test(body))throw new Error('Cordial ha mostrado una verificación anti-bot durante la consulta.');
    const headings=await page.locator('h1,h2,h3,h4,h5,h6').allTextContents().catch(()=>[]);
    const domParsed=await parseCordialDom(page,headings,config);
    const textOptions=parseCordialText(body,headings,config);
    const options=mergeCordialOptions(domParsed.rows,textOptions);
    const roomMeta=await extractRoomMeta(page);
    console.log(`[cordial] Parser combinado: DOM=${domParsed.rows.length} · texto=${textOptions.length} · final=${options.length} · fichas habitación=${Object.values(roomMeta||{}).filter(x=>x?.imageUrl||x?.detailUrl).length}.`);
    if(!options.length){await snapshot(page,'cordial-sin-opciones');const d=await diagnostic(page);throw new Error(`Cordial abrió el motor de reservas, pero no se pudieron interpretar tarifas. Se analizaron ${domParsed.contexts.length} botones Reservar. ${d}`);}
    for(const row of options)row.target=false;
    const target=selectTargetOption(options,config);
    if(target)console.log(`[cordial] Objetivo ${target.targetMatch==='exact'?'exacto':'inferido'}: ${target.roomType} · ${target.rateName} · ${target.board} · ${Number(target.price).toFixed(2)} €`);
    await snapshot(page,'cordial-resultados');
    return {ok:true,status:'ok',source:'BeCordial · navegador real · GitHub Actions + Playwright',checkedAt:isoNow(),hotel:config.hotel||'Cordial Santa Águeda & Perchel Beach Club',checkIn:config.checkIn,checkOut:config.checkOut,adults:Number(config.adults)||2,options,roomMeta,target,targetPrice:Number(target?.price)||0,availability:target?'Disponible':'No encontrado',resultUrl:page.url()};
  }finally{await context.close();}
}

export const __cordialTest={parseCordialText,parseReserveContext,targetMatches,selectTargetOption,mergeCordialOptions,normalize,fillDateInputs,forceControlValue,syncVisibleDateRange,submitSearch,formState,stabilizeBookingControls,bookingResultReady,roomRatesReady,destinationHotelListReady};
