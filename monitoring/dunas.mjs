// MFE_DUNAS_MONITOR_VERSION: 1.0.0
// Este lector solo acepta totales verificables para todas las habitaciones de la reserva.
// Los precios diarios del calendario NO representan el coste del viaje de cinco personas.
const DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
const MONEY=/((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*€/g;
const cash=v=>Number(String(v||'').replace(/\./g,'').replace(',','.'))||0;
function quoteUrl(config={}){
  if(!DATE_RE.test(config.checkIn||'')||!DATE_RE.test(config.checkOut||''))throw new Error('Dunas Club: faltan fechas de entrada/salida.');
  const adults=Number(config.adults)||5,rooms=Number(config.rooms)||3;
  if(adults<1||adults>8||rooms<1||rooms>8||rooms>adults)throw new Error('Dunas Club: ocupación no válida.');
  const url=new URL('https://www.hoteldunasclub.es/disponibilidad.html');
  url.searchParams.set('id_hotel','HDCCALEDONIA');url.searchParams.set('start',config.checkIn);url.searchParams.set('end',config.checkOut);
  // Para 5 adultos: 2+2+1. La web oficial reparte esta ocupación entre apartamentos.
  for(let i=0;i<rooms;i++)url.searchParams.set(`guests[${i}][adults]`,String(Math.floor(adults/rooms)+(i<adults%rooms?1:0)));
  url.hash='monoHotelAvail/EUR';return url.toString();
}
const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const roomMatches=(a,b)=>{const wanted=normalize(b||'');return !wanted||wanted.includes('cualquier')||wanted.includes('todas')||normalize(a).includes(wanted)||wanted.split(/\W+/).filter(x=>x.length>3).some(x=>normalize(a).includes(x));};
function parseFinal(body,{adults=5,rooms=3}={}){
  const text=String(body||''),normalized=normalize(text);
  const roomsSelected=new RegExp(`\\b${rooms}\\s*habitaciones?\\s+de\\s+${rooms}\\b`,'i').test(normalized);
  if(!roomsSelected||/sin habitaci[oó]n seleccionada/i.test(text))return null;
  if(!new RegExp(`${adults}\\s*adultos`,'i').test(normalized))return null;
  const priceStrings=[...text.matchAll(/Total\s*(?:Estancia|de\s*la\s*reserva|a\s*pagar|Reserva)\s*([\d.,]+)\s*€/gi)];
  const price=cash(priceStrings.at(-1)?.[1]);return price>0&&price<100000?price:null;
}

export async function monitorDunas(browser,config){
  const url=quoteUrl(config),ctx=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:1100}}),page=await ctx.newPage();
  try{
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:65000});await page.waitForTimeout(9000);
    const body=await page.locator('body').innerText({timeout:12000}),actualUrl=page.url();
    if(!actualUrl.includes('/disponibilidad.html'))throw new Error('Hotel Dunas Club no ha cargado la página de disponibilidad.');
    if(!actualUrl.includes(`start=${config.checkIn}`)||!actualUrl.includes(`end=${config.checkOut}`))throw new Error('Dunas Club ha cambiado el periodo de búsqueda. Se descarta la respuesta.');
    if(!/Dunas Club/i.test(body))throw new Error('El resultado no corresponde a Hotel Dunas Club.');
    const adults=Number(config.adults)||5,rooms=Number(config.rooms)||3;
    const candidates=[],requestedRoom=String(config.targetRoom||'Cualquier habitación');
    for(let r=0;r<rooms;r++){
      const available=page.locator('li.c0806:visible');
      const count=await available.count();let selected=null;
      for(let i=0;i<count;i++){
        const room=available.nth(i),heading=String((await room.locator('.avail').first().textContent().catch(()=>''))||'').trim();
        if(!roomMatches(heading,requestedRoom))continue;
        const rates=room.locator('li:visible');
        const nr=await rates.count();
        // Mantener una tarifa comparable en todos los intentos: solo alojamiento y cancelación gratuita.
        for(let j=0;j<nr;j++){
          const rate=rates.nth(j),text=normalize(await rate.innerText().catch(()=>''));
          if(!text.includes('elige habitacion'))continue;
          const board=normalize(config.targetBoard||'Solo alojamiento');
          if(board.includes('alojamiento')&&!text.includes('cancelacion gratuita')&&text.includes('no reembolsable'))continue;
          const btn=rate.getByRole('button',{name:/Elige habitación/i}).first();
          if(await btn.isVisible().catch(()=>false)){selected={btn,heading,rate:text.slice(0,150)};break;}
        }
        if(selected)break;
      }
      if(!selected)break;
      await selected.btn.click({timeout:7500});await page.waitForTimeout(1500);
      candidates.push({room:r+1,title:selected.heading,rate:selected.rate});
    }
    if(candidates.length!==rooms)throw new Error(`Dunas Club: se pudieron seleccionar ${candidates.length} de ${rooms} habitaciones para ${adults} adultos en ${config.checkIn}–${config.checkOut}. No se registra precio parcial.`);
    const finalText=await page.locator('body').innerText().catch(()=>body);
    const final= parseFinal(finalText,{adults,rooms});
    if(!final)throw new Error(`Dunas Club muestra tarifas o disponibilidad parcial, pero no un total confirmable para ${adults} adultos y ${rooms} habitaciones (${config.targetRoom||'Suite'}). Se conserva el precio anterior; consulta el enlace de reserva.`);
    return {ok:true,status:'ok',price:final,total:final,source:'Hotel Dunas Club · Keytel · precio completo verificado',rooms,adults,checkIn:config.checkIn,checkOut:config.checkOut,targetRoom:config.targetRoom||'',targetBoard:config.targetBoard||'',url,roomChoices:candidates};
  }finally{await ctx.close();}
}
