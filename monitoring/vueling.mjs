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
    // Vueling usa un combobox visual y abre un buscador editable en un panel.
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
  const year=date.getUTCFullYear();
  const monthEs=new Intl.DateTimeFormat('es-ES',{month:'long',timeZone:'UTC'}).format(date);
  const monthEn=new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(date);
  return {day,year,monthEs,monthEn};
}

async function nativeDateInput(page,kind){
  const selectors=kind==='out'?[
    'input[type="date"][name*="depart" i]','input[type="date"][id*="depart" i]',
    'input[name*="departure" i]','input[id*="departure" i]','input[name*="outbound" i]','input[id*="outbound" i]'
  ]:[
    'input[type="date"][name*="return" i]','input[type="date"][id*="return" i]',
    'input[name*="return" i]','input[id*="return" i]','input[name*="inbound" i]','input[id*="inbound" i]'
  ];
  for(const selector of selectors){
    const input=await firstVisible(page.locator(selector));
    if(input)return input;
  }
  return null;
}

async function chooseDate(page,kind,value){
  const input=await nativeDateInput(page,kind);
  if(input){
    const type=await input.getAttribute('type').catch(()=>null);
    if(type==='date'&&await input.isEditable().catch(()=>false)){
      await input.fill(value);
      return;
    }
    // Algunos campos son readonly: se abre el calendario al pulsarlos.
    await input.click({force:true}).catch(()=>{});
  }else{
    const button=kind==='out'
      ?await firstVisible(page.getByRole('button',{name:/fecha de ida|salida|departure|outbound/i}))
      :await firstVisible(page.getByRole('button',{name:/fecha de vuelta|regreso|return|inbound/i}));
    if(!button)throw new Error(`Vueling: no se encontró el control de fecha de ${kind==='out'?'ida':'vuelta'}.`);
    await button.click({force:true});
  }

  const {day,year,monthEs,monthEn}=dateLabels(value);
  const exactSelectors=[
    `[data-date="${value}"]`,
    `[data-value="${value}"]`,
    `button[aria-label*="${day}"][aria-label*="${year}"]`,
    `[role="gridcell"][aria-label*="${day}"][aria-label*="${year}"]`
  ];
  for(let attempt=0;attempt<20;attempt++){
    for(const selector of exactSelectors){
      const items=page.locator(selector);
      const count=await items.count().catch(()=>0);
      for(let i=0;i<count;i++){
        const item=items.nth(i);
        if(!await item.isVisible().catch(()=>false))continue;
        const label=((await item.getAttribute('aria-label').catch(()=>''))||'')+' '+((await item.textContent().catch(()=>''))||'');
        if(new RegExp(`${monthEs}|${monthEn}`,'i').test(label)||selector.includes('data-')){
          await item.click({force:true});
          await page.waitForTimeout(500);
          return;
        }
      }
    }
    const next=await firstVisible(page.getByRole('button',{name:/mes siguiente|siguiente mes|next month|siguiente/i}));
    if(!next)break;
    await next.click({force:true});
    await page.waitForTimeout(250);
  }
  throw new Error(`Vueling: no se pudo seleccionar la fecha ${value} en el calendario.`);
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
  // El buscador suele partir de 1 adulto.
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
    await acceptCookies(page);
    await waitNetwork(page);
    await snapshot(page,'vueling-inicio');

    const hasResults=await page.getByText(/selecciona tu vuelo|elige tu vuelo|flight selection/i).first().isVisible().catch(()=>false);
    if(!hasResults){
      await chooseAirport(page,'origin',config.origin,config.originName);
      await chooseAirport(page,'destination',config.destination,config.destinationName);
      await chooseDate(page,'out',config.departureDate);
      await chooseDate(page,'return',config.returnDate);
      await setAdults(page,config.adults||2);
      await snapshot(page,'vueling-formulario-completado');
      if(!await clickFirst(page,[
        page.getByRole('button',{name:/buscar vuelos|buscar|search flights/i}).first(),
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
