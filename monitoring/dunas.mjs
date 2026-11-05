// MFE_DUNAS_MONITOR_VERSION: 1.3.0
import fs from 'node:fs/promises';
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
  const selectedCount=(normalized.match(/seleccionada/g)||[]).length;
  const selectedText=new RegExp(`\\b${rooms}\\s*habitaci[oó]n(?:es)?\\s+de\\s+${rooms}\\b`,'i').test(normalized);
  if((selectedCount<rooms&&!selectedText)||/sin habitaci[oó]n seleccionada/i.test(text))return null;
  if(!new RegExp(`\\b${adults}\\s*adultos`,'i').test(normalized))return null;
  const priceStrings=[...text.matchAll(/Total\s*(?:Estancia|de\s*la\s*reserva|a\s*pagar|Reserva)\s*([\d.,]+)\s*€/gi)];
  const price=cash(priceStrings.at(-1)?.[1]);return price>0&&price<100000?price:null;
}

export async function monitorDunas(browser,config){
  const url=quoteUrl(config),ctx=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:1100}}),page=await ctx.newPage();
  try{
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:65000});
    // Keytel tarda en hidratar la disponibilidad: no asumir que 9 s bastan.
    await page.waitForTimeout(4500);
    await page.getByRole('button',{name:/Elige habitaci[oó]n/i}).first().waitFor({state:'visible',timeout:18000}).catch(()=>{});
    await page.waitForLoadState('networkidle',{timeout:5500}).catch(()=>{});
    const body=await page.locator('body').innerText({timeout:12000}),actualUrl=page.url();
    if(!actualUrl.includes('/disponibilidad.html'))throw new Error('Hotel Dunas Club no ha cargado la página de disponibilidad.');
    if(!actualUrl.includes(`start=${config.checkIn}`)||!actualUrl.includes(`end=${config.checkOut}`))throw new Error('Dunas Club ha cambiado el periodo de búsqueda. Se descarta la respuesta.');
    if(!/Dunas Club/i.test(body))throw new Error('El resultado no corresponde a Hotel Dunas Club.');
    const adults=Number(config.adults)||5,rooms=Number(config.rooms)||3;
    const candidates=[],requestedRoom=String(config.targetRoom||'Cualquier habitación');
    const seenOffers=new Map();
    await fs.mkdir('artifacts/dunas',{recursive:true}).catch(()=>{});
    await page.screenshot({path:'artifacts/dunas/resultado-inicial.png',fullPage:true}).catch(()=>{});
    for(let r=0;r<rooms;r++){
      // El motor Keytel ha cambiado sus clases CSS varias veces. Los botones
      // accesibles son más estables que «li.c0806» o «.avail».
      // La reserva puede mostrar botones como enlaces/controles de otra etiqueta.
      const buttons=page.locator('button, a, [role=button]').filter({hasText:/elige habitaci[oó]n|seleccionar habitaci[oó]n|seleccionar|elegir habitaci[oó]n/i});
      let count=Math.min(await buttons.count().catch(()=>0),100);
      if(!count){await page.waitForTimeout(3500);count=Math.min(await buttons.count().catch(()=>0),100);}
      const choices=[];
      for(let i=0;i<count;i++){
        const btn=buttons.nth(i);
        if(!await btn.isVisible().catch(()=>false))continue;
        let rate='',group='',heading='';
        try{
          rate=String(await btn.locator('xpath=ancestor::li[1]').innerText({timeout:1200})||'');
          group=String(await btn.locator('xpath=ancestor::li[3]').innerText({timeout:1200})||'');
        }catch{try{rate=String(await btn.locator('xpath=..').innerText({timeout:1200})||'');}catch{}}
        const context=group||rate;
        const roomMatch=context.match(/(?:Suites? Apartments?|Apartamento[^\n]{0,65}|Studio[^\n]{0,65}|Habitaci[oó]n[^\n]{0,65})/i);
        heading=roomMatch?.[0]?.trim()||'';
        // El título puede estar en otro nodo del motor Keytel: no descartar
        // toda la flota de habitaciones porque el botón carezca de título.
        const matching=roomMatches(heading||context,requestedRoom);
        const text=normalize(rate),contextText=normalize(context);
        // Alojamiento, sin comida. Ignorar regímenes adicionales y tarifas
        // no reembolsables si existe una alternativa con cancelación gratuita.
        const board=normalize(config.targetBoard||'Solo alojamiento');
        const free=/cancelacion gratuita|cancelacion sin gastos|cancelaci[oó]n gratuita/i.test(text);
        const nonRefundable=/no reembolsable|non refund/i.test(text);
        const extraBoard=/alojamiento y desayuno|media pension|pension completa|desayuno incluido/i.test(text);
        // No examinar todo el bloque de opciones: contiene asimismo tarifas de
        // desayuno/media pensión y provocaba excluir incorrectamente alojamiento.
        const categoryScore=/alojamiento y desayuno|media pension|pension completa/i.test(contextText)&&!extraBoard?-3:0;
        if(board.includes('alojamiento')&&extraBoard)continue;
        const score=(matching?1000:0)+(free?100:0)+(nonRefundable?-100:0)+(extraBoard?-40:25)+(roomMatch?10:0)+categoryScore;
        const offered=rate.match(/(?:Total|Precio|Desde)?[^\n]{0,50}([0-9][0-9.,]{1,12})\s*€/i);
        const offerName=heading||context.slice(0,90)||'Habitación';
        if(offered){const key=normalize(offerName)+'|'+offered[1];seenOffers.set(key,{name:offerName,shownPrice:offered[1],verifiedTotal:false});}
        choices.push({btn,heading,rate:rate.slice(0,200),score});
      }
      choices.sort((a,b)=>b.score-a.score);
      let chosen=false;
      for(const candidate of choices){
        try{
          await candidate.btn.click({timeout:7000});await page.waitForTimeout(1000);
          candidates.push({room:r+1,title:candidate.heading||'Habitación',rate:candidate.rate});
          chosen=true;break;
        }catch{}
      }
      if(!chosen){
        await page.screenshot({path:`artifacts/dunas/seleccion-${r+1}-fallida.png`,fullPage:true}).catch(()=>{});
        break;
      }
    }
    if(candidates.length!==rooms){
      const responseText=await page.locator('body').innerText().catch(()=>body);
      await fs.writeFile('artifacts/dunas/diagnostico.json',JSON.stringify({url:page.url(),adults,rooms,selected:candidates,buttons:await page.locator('button, a, [role=button]').allInnerTexts().catch(()=>[]),text:String(responseText).slice(0,18000)},null,2)).catch(()=>{});
      const noAvail=/no tenemos disponibilidad para la combinaci[oó]n|no hay disponibilidad|sin disponibilidad|no se encontraron habitaciones/i.test(responseText);
      const noRates=(await page.getByRole('button',{name:/Elige habitaci[oó]n/i}).count().catch(()=>0))===0;
      if(candidates.length===0&&noAvail){
        return {ok:true,status:'unavailable',availability:'unavailable',price:null,total:null,source:'Hotel Dunas Club · Web oficial',rooms,adults,checkIn:config.checkIn,checkOut:config.checkOut,targetRoom:config.targetRoom||'',targetBoard:config.targetBoard||'',url,reason:noAvail?'El motor de reservas indica que no hay combinación disponible para '+rooms+' habitaciones y '+adults+' adultos.':'El motor de reservas no mostró tarifas seleccionables para esta combinación; consulta de nuevo en la web oficial.'};
      }
      if(candidates.length===0&&noRates){
        const excerpt=String(responseText||'').replace(/\s+/g,' ').slice(0,320);
        throw new Error('Dunas Club: Keytel no mostró botones de selección de habitaciones para la ocupación elegida. Comprueba el motor oficial. Diagnóstico: '+excerpt);
      }
      throw new Error(`Dunas Club: solo se pudieron seleccionar ${candidates.length} de ${rooms} habitaciones para ${adults} adultos en ${config.checkIn}–${config.checkOut}. No se registra precio parcial.`);
    }
    const finalText=await page.locator('body').innerText().catch(()=>body);
    const final= parseFinal(finalText,{adults,rooms});
    if(!final)throw new Error(`Dunas Club muestra tarifas o disponibilidad parcial, pero no un total confirmable para ${adults} adultos y ${rooms} habitaciones (${config.targetRoom||'Suite'}). Se conserva el precio anterior; consulta el enlace de reserva.`);
    return {ok:true,status:'ok',price:final,total:final,offers:[{name:requestedRoom,total:final,selected:true,verifiedTotal:true}],source:'Hotel Dunas Club · Keytel · precio completo verificado',rooms,adults,checkIn:config.checkIn,checkOut:config.checkOut,targetRoom:config.targetRoom||'',targetBoard:config.targetBoard||'',url,roomChoices:candidates};
  }finally{await ctx.close();}
}

export {quoteUrl,parseFinal};
