import {acceptCookies,clickFirst,isoNow,money,snapshot,waitNetwork} from './lib.mjs';

function escapeRegExp(value){return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

async function firstVisible(locator){
  const count=await locator.count().catch(()=>0);
  for(let i=0;i<count;i++){
    const item=locator.nth(i);
    if(await item.isVisible().catch(()=>false))return item;
  }
  return null;
}

async function lastVisible(locator){
  const count=await locator.count().catch(()=>0);
  for(let i=count-1;i>=0;i--){
    const item=locator.nth(i);
    if(await item.isVisible().catch(()=>false))return item;
  }
  return null;
}

async function airportControl(page,kind){
  const origin=kind==='origin';
  const selectors=origin?[
    'input[id*="origin" i]:not(#passengersInput)',
    'input[name*="origin" i]:not(#passengersInput)',
    'input[placeholder*="origen" i]:not(#passengersInput)',
    'input[aria-label*="origen" i]:not(#passengersInput)',
    '[role="combobox"][aria-label*="origen" i]',
    'button[aria-label*="origen" i]'
  ]:[
    'input[id*="destination" i]:not(#passengersInput)',
    'input[name*="destination" i]:not(#passengersInput)',
    'input[placeholder*="destino" i]:not(#passengersInput)',
    'input[aria-label*="destino" i]:not(#passengersInput)',
    '[role="combobox"][aria-label*="destino" i]',
    'button[aria-label*="destino" i]'
  ];
  for(const selector of selectors){
    const item=await firstVisible(page.locator(selector));
    if(item)return item;
  }
  const named=origin
    ?page.getByRole('button',{name:/origen|desde|aeropuerto de salida/i})
    :page.getByRole('button',{name:/destino|hasta|aeropuerto de llegada/i});
  return firstVisible(named);
}

async function chooseAirport(page,kind,code,name){
  const control=await airportControl(page,kind);
  if(!control)throw new Error(`Vueling: no se encontró el control de ${kind==='origin'?'origen':'destino'}.`);
  await control.click({force:true});
  await page.waitForTimeout(500);

  if(await control.isEditable().catch(()=>false)){
    await control.fill(code);
  }else{
    const editableInputs=page.locator('input:not([readonly]):not([disabled])');
    let search=null;
    const count=await editableInputs.count();
    for(let i=count-1;i>=0;i--){
      const input=editableInputs.nth(i);
      if(!await input.isVisible().catch(()=>false))continue;
      const meta=((await input.getAttribute('id').catch(()=>''))||'')+' '+((await input.getAttribute('name').catch(()=>''))||'')+' '+((await input.getAttribute('placeholder').catch(()=>''))||'');
      if(/passenger|pasaj|date|fecha|promo|email/i.test(meta))continue;
      search=input;
      break;
    }
    if(!search)throw new Error(`Vueling: el selector de ${kind==='origin'?'origen':'destino'} se abrió, pero no apareció el buscador editable.`);
    await search.fill(code);
  }

  await page.waitForTimeout(1000);
  const airportPattern=new RegExp(`${escapeRegExp(code)}|${escapeRegExp(name)}`,'i');
  const optionCandidates=[
    page.getByRole('option',{name:airportPattern}).first(),
    page.locator('[role="option"]').filter({hasText:airportPattern}).first(),
    page.locator('li').filter({hasText:airportPattern}).first(),
    page.locator('[class*="airport" i],[class*="station" i]').filter({hasText:airportPattern}).first(),
    page.getByText(airportPattern).first()
  ];
  if(!await clickFirst(page,optionCandidates,{force:true})){
    throw new Error(`Vueling: no apareció la opción ${code} / ${name} después de abrir el selector.`);
  }
  await page.waitForTimeout(700);
}

function dateLabels(value){
  const date=new Date(`${value}T12:00:00Z`);
  const day=date.getUTCDate();
  const month=String(date.getUTCMonth()+1).padStart(2,'0');
  const year=date.getUTCFullYear();
  const monthEs=new Intl.DateTimeFormat('es-ES',{month:'long',timeZone:'UTC'}).format(date);
  const monthEn=new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(date);
  const shortEs=new Intl.DateTimeFormat('es-ES',{month:'short',timeZone:'UTC'}).format(date).replace('.','');
  const shortEn=new Intl.DateTimeFormat('en-US',{month:'short',timeZone:'UTC'}).format(date).replace('.','');
  const dd=String(day).padStart(2,'0');
  return {
    day,dd,month,year,monthEs,monthEn,shortEs,shortEn,
    iso:value,
    es:`${dd}/${month}/${year}`,
    us:`${month}/${dd}/${year}`
  };
}

async function dateControl(page,kind){
  const out=kind==='out';
  const selectors=out?[
    'button[id*="departure-date" i]','button[aria-label*="departure-date" i]',
    'input[id*="departure-date" i]','input[name*="departure" i]',
    'input[type="date"][name*="depart" i]','input[type="date"][id*="depart" i]',
    'input[name*="outbound" i]','input[id*="outbound" i]'
  ]:[
    'button[id*="return-date" i]','button[aria-label*="return-date" i]',
    'input[id*="return-date" i]','input[name*="return" i]',
    'input[type="date"][name*="return" i]','input[type="date"][id*="return" i]',
    'input[name*="inbound" i]','input[id*="inbound" i]'
  ];
  for(const selector of selectors){
    const control=await firstVisible(page.locator(selector));
    if(control)return control;
  }

  const labelPattern=out?/^(ida|salida|departure|outbound)$/i:/^(vuelta|regreso|return|inbound)$/i;
  const label=await firstVisible(page.getByText(labelPattern));
  if(label){
    for(const xpath of [
      'xpath=..',
      'xpath=../..',
      'xpath=../../..'
    ]){
      const parent=label.locator(xpath);
      const button=await firstVisible(parent.getByRole('button'));
      if(button)return button;
      const input=await firstVisible(parent.locator('input'));
      if(input)return input;
    }
  }

  const dateButtons=page.getByRole('button',{name:/^\d{1,2}\/\d{1,2}\/\d{4}$/});
  return out?firstVisible(dateButtons):lastVisible(dateButtons);
}

async function forceDateValue(page,kind,value){
  const labels=dateLabels(value);
  const out=kind==='out';
  const selector=out
    ?'input[id*="depart" i],input[name*="depart" i],input[id*="outbound" i],input[name*="outbound" i]'
    :'input[id*="return" i],input[name*="return" i],input[id*="inbound" i],input[name*="inbound" i]';
  const inputs=page.locator(selector);
  const count=await inputs.count().catch(()=>0);
  for(let i=0;i<count;i++){
    const input=inputs.nth(i);
    const changed=await input.evaluate((element,values)=>{
      const candidates=[values.iso,values.es,values.us];
      const type=(element.getAttribute('type')||'').toLowerCase();
      const chosen=type==='date'?values.iso:candidates[1];
      try{
        const descriptor=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
        if(descriptor?.set)descriptor.set.call(element,chosen); else element.value=chosen;
        element.setAttribute('value',chosen);
        for(const eventName of ['input','change','blur'])element.dispatchEvent(new Event(eventName,{bubbles:true}));
        return element.value===chosen||element.getAttribute('value')===chosen;
      }catch{return false;}
    },labels).catch(()=>false);
    if(changed){
      await page.waitForTimeout(350);
      const current=await input.inputValue().catch(()=>"");
      const attr=await input.getAttribute('value').catch(()=>"");
      if([labels.iso,labels.es,labels.us].includes(current)||[labels.iso,labels.es,labels.us].includes(attr||""))return true;
    }
  }
  return false;
}

async function calendarRoots(page){
  const roots=[];
  for(const selector of [
    '[role="dialog"]',
    '[class*="datepicker" i]',
    '[class*="date-picker" i]',
    '[class*="calendar" i]',
    '[class*="overlay" i]'
  ]){
    const loc=page.locator(selector);
    const count=await loc.count().catch(()=>0);
    for(let i=0;i<count;i++){
      const item=loc.nth(i);
      if(await item.isVisible().catch(()=>false))roots.push(item);
    }
  }
  roots.push(page.locator('body'));
  return roots;
}

async function clickExactDate(page,labels){
  const fullLabelPattern=new RegExp(
    `${escapeRegExp(labels.iso)}|${escapeRegExp(labels.es)}|${labels.day}\\s+(?:de\\s+)?${escapeRegExp(labels.monthEs)}(?:\\s+de)?\\s+${labels.year}|${escapeRegExp(labels.monthEn)}\\s+${labels.day}[^0-9]+${labels.year}`,
    'i'
  );
  const selectors=[
    `[data-date="${labels.iso}"]`,`[data-date="${labels.es}"]`,`[data-value="${labels.iso}"]`,`[data-value="${labels.es}"]`,
    `[datetime="${labels.iso}"]`,`button[aria-label*="${labels.es}"]`,`button[aria-label*="${labels.iso}"]`,
    `[role="gridcell"][aria-label*="${labels.es}"]`,`[role="gridcell"][aria-label*="${labels.iso}"]`
  ];
  for(const selector of selectors){
    const item=await firstVisible(page.locator(selector));
    if(item){await item.click({force:true});await page.waitForTimeout(450);return true;}
  }
  const named=await firstVisible(page.getByRole('button',{name:fullLabelPattern}));
  if(named){await named.click({force:true});await page.waitForTimeout(450);return true;}
  const cell=await firstVisible(page.locator('[role="gridcell"]').filter({hasText:fullLabelPattern}));
  if(cell){await cell.click({force:true});await page.waitForTimeout(450);return true;}
  return false;
}

async function targetMonthVisible(page,labels){
  const pattern=new RegExp(`(?:${escapeRegExp(labels.monthEs)}|${escapeRegExp(labels.monthEn)}|${escapeRegExp(labels.shortEs)}|${escapeRegExp(labels.shortEn)})\\s*[-/]?\\s*${labels.year}`,'i');
  const textCandidates=page.getByText(pattern);
  return Boolean(await firstVisible(textCandidates));
}

async function clickDayInsideTargetMonth(page,labels){
  const monthPattern=new RegExp(`(?:${escapeRegExp(labels.monthEs)}|${escapeRegExp(labels.monthEn)}|${escapeRegExp(labels.shortEs)}|${escapeRegExp(labels.shortEn)})\\s*[-/]?\\s*${labels.year}`,'i');
  const monthHeads=page.getByText(monthPattern);
  const headCount=await monthHeads.count().catch(()=>0);
  for(let i=0;i<headCount;i++){
    const head=monthHeads.nth(i);
    if(!await head.isVisible().catch(()=>false))continue;
    for(const xpath of ['xpath=..','xpath=../..','xpath=../../..','xpath=../../../..']){
      const box=head.locator(xpath);
      const dayButton=await firstVisible(box.getByRole('button',{name:new RegExp(`^0?${labels.day}$`)}));
      if(dayButton){await dayButton.click({force:true});await page.waitForTimeout(450);return true;}
      const dayCell=await firstVisible(box.locator('[role="gridcell"]').filter({hasText:new RegExp(`^\\s*0?${labels.day}\\s*$`)}));
      if(dayCell){await dayCell.click({force:true});await page.waitForTimeout(450);return true;}
    }
  }
  return false;
}

async function clickNextMonth(page){
  const roots=await calendarRoots(page);
  const pattern=/chevron_right|navigate_next|mes siguiente|siguiente mes|next month|siguiente|›|»/i;
  for(const root of roots){
    const candidates=[
      root.getByRole('button',{name:pattern}),
      root.locator('button').filter({hasText:pattern}),
      root.locator('[aria-label*="next" i],[aria-label*="siguiente" i],[title*="next" i],[title*="siguiente" i]')
    ];
    for(const candidate of candidates){
      const button=await lastVisible(candidate);
      if(button){await button.click({force:true});await page.waitForTimeout(350);return true;}
    }
  }
  return false;
}

async function chooseDate(page,kind,value){
  const labels=dateLabels(value);
  await acceptCookies(page,{timeout:5000});
  const control=await dateControl(page,kind);
  if(!control)throw new Error(`Vueling: no se encontró el control de fecha de ${kind==='out'?'ida':'vuelta'}.`);

  const type=await control.getAttribute('type').catch(()=>null);
  if(type==='date'&&await control.isEditable().catch(()=>false)){
    await control.fill(value);
    return;
  }

  // Primer intento: actualizar el input oculto/readonly y disparar los eventos de Angular.
  if(await forceDateValue(page,kind,value))return;

  await control.click({force:true});
  await page.waitForTimeout(700);
  await snapshot(page,`vueling-calendario-${kind}-abierto`);

  for(let attempt=0;attempt<18;attempt++){
    if(await clickExactDate(page,labels))return;
    if(await targetMonthVisible(page,labels)&&await clickDayInsideTargetMonth(page,labels))return;
    if(!await clickNextMonth(page))break;
  }

  await snapshot(page,`vueling-calendario-${kind}-error`);
  throw new Error(`Vueling: no se pudo seleccionar la fecha ${value}. Se han guardado capturas y HTML del calendario para diagnóstico.`);
}

async function setAdults(page,wanted){
  const passenger=await firstVisible(page.locator('#passengersInput,[id*="passenger" i],[aria-label*="pasaj" i],[aria-label*="passenger" i]'));
  if(!passenger)return;
  await passenger.click({force:true});
  await page.waitForTimeout(400);
  const adultsText=page.getByText(/adultos|adults/i).first();
  if(!await adultsText.isVisible().catch(()=>false))return;
  const section=adultsText.locator('xpath=ancestor::*[self::div or self::li][1]');
  const plusCandidates=[
    section.getByRole('button',{name:/añadir|sumar|increase|plus|\+/i}).last(),
    section.locator('button').last()
  ];
  for(let current=1;current<wanted;current++){
    if(!await clickFirst(page,plusCandidates,{force:true}))break;
    await page.waitForTimeout(250);
  }
  await clickFirst(page,[page.getByRole('button',{name:/aceptar|listo|done|confirmar/i}).first()],{force:true});
}

function findFlightBlock(text,preferred){
  const lines=String(text).split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const ix=preferred?lines.findIndex(x=>x.includes(preferred)):-1;
  const slice=ix>=0?lines.slice(Math.max(0,ix-5),ix+18).join(' '):text;
  const prices=money(slice);
  return {
    price:prices.find(value=>value>=10&&value<=1000)||0,
    number:preferred||'',
    schedule:(slice.match(/\b\d{1,2}:\d{2}\b(?:\s*[-–]\s*\d{1,2}:\d{2})?/)||[])[0]||''
  };
}

export async function monitorVueling(browser,config){
  const context=await browser.newContext({
    locale:'es-ES',
    timezoneId:'Europe/Madrid',
    viewport:{width:1440,height:1100},
    userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'
  });
  const page=await context.newPage();
  try{
    await page.goto(process.env.VUELING_SEARCH_URL||config.searchUrl,{waitUntil:'domcontentloaded',timeout:90000});
    await waitNetwork(page);
    await acceptCookies(page,{timeout:12000});
    await waitNetwork(page);
    // OneTrust puede volver a pintar el panel después de cargar contenido diferido.
    await acceptCookies(page,{timeout:4000});
    await snapshot(page,'vueling-inicio');

    const hasResults=await page.getByText(/selecciona tu vuelo|elige tu vuelo|flight selection/i).first().isVisible().catch(()=>false);
    if(!hasResults){
      await chooseAirport(page,'origin',config.origin,config.originName);
      await chooseAirport(page,'destination',config.destination,config.destinationName);
      await chooseDate(page,'out',config.departureDate);
      await chooseDate(page,'return',config.returnDate);
      await setAdults(page,config.adults||2);
      await acceptCookies(page,{timeout:2500});
      const expectedOut=dateLabels(config.departureDate).es;
      const expectedReturn=dateLabels(config.returnDate).es;
      const actualOut=await page.locator('#outboundDate').inputValue().catch(()=>"");
      const actualReturn=await page.locator('#returnDate').inputValue().catch(()=>"");
      if(actualOut!==expectedOut||actualReturn!==expectedReturn){
        await snapshot(page,'vueling-fechas-no-confirmadas');
        throw new Error(`Vueling: las fechas no quedaron confirmadas en el formulario (ida ${actualOut||'vacía'}, vuelta ${actualReturn||'vacía'}).`);
      }
      await snapshot(page,'vueling-formulario-completado');
      if(!await clickFirst(page,[
        page.getByRole('button',{name:/buscar vuelos|buscar|search flights|fc-booking-booking-cta-label/i}).first(),
        page.locator('button[type="submit"]').first()
      ],{force:true}))throw new Error('Vueling: no se encontró el botón Buscar vuelos.');
      await page.waitForTimeout(9000);
      await waitNetwork(page);
    }

    await snapshot(page,'vueling-resultados');
    const text=await page.locator('body').innerText();
    const outbound=findFlightBlock(text,config.preferredOutboundFlight);
    const inbound=findFlightBlock(text,config.preferredReturnFlight);
    if(!outbound.price||!inbound.price)throw new Error('Vueling: se abrió la búsqueda, pero no se localizaron los precios de ida y vuelta. Revisa vueling-resultados.png y .html.');

    if(config.preferredOutboundFlight)await clickFirst(page,[page.getByText(new RegExp(escapeRegExp(config.preferredOutboundFlight),'i')).first()],{force:true});
    if(config.preferredReturnFlight)await clickFirst(page,[page.getByText(new RegExp(escapeRegExp(config.preferredReturnFlight),'i')).first()],{force:true});
    await clickFirst(page,[page.getByText(/fly light|tarifa básica|basic/i).first(),page.getByRole('button',{name:/continuar|continue/i}).first()],{force:true});
    await page.waitForTimeout(3500);

    const bagMatches=page.getByText(new RegExp(`${config.bagKg}\\s*kg`,'i'));
    const bagCount=await bagMatches.count().catch(()=>0);
    for(let i=0;i<Math.min(bagCount,2);i++){
      const bag=bagMatches.nth(i);
      if(await bag.isVisible().catch(()=>false))await bag.click({force:true}).catch(()=>{});
    }
    await page.waitForTimeout(2200);
    await snapshot(page,'vueling-equipaje');

    const finalText=await page.locator('body').innerText();
    const finalPrices=money(finalText).filter(value=>value>=10&&value<=5000);
    const base=outbound.price+inbound.price;
    const total=finalPrices.slice().reverse().find(value=>value>=base)||0;
    if(!total)throw new Error('Vueling: se localizaron vuelos, pero no el total final con equipaje. No se guardará un precio incompleto.');

    const bagTotal=Math.max(0,total-base);
    const outboundBag=bagTotal/2;
    const returnBag=bagTotal-outboundBag;
    return {
      source:'Vueling web · GitHub Actions + Playwright',
      checkedAt:isoNow(),
      outboundFlights:outbound.price,
      returnFlights:inbound.price,
      outboundBag,
      returnBag,
      total,
      outboundFlightNumber:outbound.number,
      returnFlightNumber:inbound.number,
      outboundSchedule:outbound.schedule,
      returnSchedule:inbound.schedule,
      adults:config.adults,
      fare:config.fare,
      bagKg:config.bagKg
    };
  }finally{
    await context.close();
  }
}
