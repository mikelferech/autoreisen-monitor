import {acceptCookies,clickFirst,fillFirst,isoNow,money,snapshot,waitNetwork} from './lib.mjs';

async function selectAirport(page,kind,code,name){
  const origin=kind==='origin';
  const inputs=origin?
    [page.getByLabel(/origen|desde|origin|from/i).first(),page.locator('input[placeholder*="Origen" i],input[placeholder*="Desde" i],input[name*="origin" i]').first()]:
    [page.getByLabel(/destino|hasta|destination|to/i).first(),page.locator('input[placeholder*="Destino" i],input[placeholder*="Hasta" i],input[name*="destination" i]').first()];
  if(!await fillFirst(page,inputs,code))return false;
  await page.waitForTimeout(800);
  return clickFirst(page,[page.getByText(new RegExp(`${code}|${name}`,'i')).first(),page.locator('[role="option"]').filter({hasText:new RegExp(code,'i')}).first()]);
}
async function fillDate(page,kind,value){
  const re=kind==='out'?/ida|salida|departure|outbound/i:/vuelta|regreso|return|inbound/i;
  const input=page.getByLabel(re).first();
  if(await input.isVisible().catch(()=>false)){await input.fill(value).catch(()=>{});return true;}
  const css=kind==='out'?'input[name*="departure" i],input[id*="departure" i]':'input[name*="return" i],input[id*="return" i]';
  return fillFirst(page,[css],value);
}
function findFlightBlock(text,preferred){
  const lines=String(text).split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const ix=preferred?lines.findIndex(x=>x.includes(preferred)):-1;
  const slice=ix>=0?lines.slice(Math.max(0,ix-5),ix+15).join(' '):text;
  const prices=money(slice);return {price:prices[0]||0,number:preferred||'',schedule:(slice.match(/\b\d{1,2}:\d{2}\b(?:\s*[-–]\s*\d{1,2}:\d{2})?/)||[])[0]||''};
}
export async function monitorVueling(browser,config){
  const context=await browser.newContext({locale:'es-ES',timezoneId:'Europe/Madrid',viewport:{width:1440,height:1100}});const page=await context.newPage();
  try{
    await page.goto(process.env.VUELING_SEARCH_URL||config.searchUrl,{waitUntil:'domcontentloaded',timeout:90000});await acceptCookies(page);await waitNetwork(page);
    // When VUELING_SEARCH_URL points directly to an already configured search, the form steps are skipped.
    const hasResults=await page.getByText(/selecciona tu vuelo|elige tu vuelo|flight selection/i).first().isVisible().catch(()=>false);
    if(!hasResults){
      await selectAirport(page,'origin',config.origin,config.originName);
      await selectAirport(page,'destination',config.destination,config.destinationName);
      await fillDate(page,'out',config.departureDate);await fillDate(page,'return',config.returnDate);
      await clickFirst(page,[page.getByRole('button',{name:/buscar vuelos|buscar|search flights/i}).first(),page.locator('button[type="submit"]').first()]);
      await page.waitForTimeout(8000);await waitNetwork(page);
    }
    await snapshot(page,'vueling-resultados');
    const text=await page.locator('body').innerText();
    const outbound=findFlightBlock(text,config.preferredOutboundFlight);const inbound=findFlightBlock(text,config.preferredReturnFlight);
    if(!outbound.price||!inbound.price)throw new Error('No se han podido localizar los precios de ida y vuelta. Revisa la captura de la ejecución y actualiza VUELING_SEARCH_URL o los selectores.');

    // Select preferred flights when visible, then Fly Light and one 25 kg bag each direction.
    if(config.preferredOutboundFlight)await clickFirst(page,[page.getByText(new RegExp(config.preferredOutboundFlight,'i')).first()]);
    if(config.preferredReturnFlight)await clickFirst(page,[page.getByText(new RegExp(config.preferredReturnFlight,'i')).first()]);
    await clickFirst(page,[page.getByText(/fly light|tarifa básica|basic/i).first(),page.getByRole('button',{name:/continuar|continue/i}).first()]);
    await page.waitForTimeout(3500);
    const beforeBags=money(await page.locator('body').innerText()).slice(-8);
    const bagChoice=page.getByText(new RegExp(`${config.bagKg}\\s*kg`,'i')).first();
    if(await bagChoice.isVisible().catch(()=>false)){await bagChoice.click().catch(()=>{});await page.waitForTimeout(900);}
    // Some Vueling screens ask separately for outbound and return. Select the matching option up to twice.
    const bagMatches=page.getByText(new RegExp(`${config.bagKg}\\s*kg`,'i'));
    const count=await bagMatches.count().catch(()=>0);for(let i=1;i<Math.min(count,3);i++)await bagMatches.nth(i).click().catch(()=>{});
    await page.waitForTimeout(2000);await snapshot(page,'vueling-equipaje');
    const finalText=await page.locator('body').innerText();const finalPrices=money(finalText);
    const total=finalPrices.slice().reverse().find(v=>v>=outbound.price+inbound.price)||0;
    if(!total)throw new Error('Se localizaron vuelos, pero no el total final con equipaje. No se guardará un precio incompleto.');
    const bagTotal=Math.max(0,total-outbound.price-inbound.price);const outboundBag=bagTotal/2,returnBag=bagTotal-outboundBag;
    return {source:'Vueling web · GitHub Actions + Playwright',checkedAt:isoNow(),outboundFlights:outbound.price,returnFlights:inbound.price,outboundBag,returnBag,total,outboundFlightNumber:outbound.number,returnFlightNumber:inbound.number,outboundSchedule:outbound.schedule,returnSchedule:inbound.schedule,adults:config.adults,fare:config.fare,bagKg:config.bagKg};
  }finally{await context.close();}
}
