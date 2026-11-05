// MFE_BINTER_STAGE2_MONITOR_VERSION: 1.0.0
// Solo se guarda un total completo y comprobado; nunca se extrapola un precio por persona.
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {isoNow,postResult,readTrackerLatest,successfulResultToday,snapshot} from './lib.mjs';

const configFile=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));
const cfg={...(configFile.binterStage2||{})};
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
const money=s=>Number(String(s||'').replace(/\./g,'').replace(',','.'))||0;
const force=/^(1|true)$/i.test(String(process.env.MFE_FORCE_RUN||''));
const adults=Number(cfg.adults||5),date=String(cfg.date||'');
const identity=[date,cfg.origin||'LPA',cfg.destination||'FUE',adults,cfg.resident===true?'resident':'no-resident'].join('|');
if(cfg.enabled!==true){console.log('[binter] Seguimiento desactivado');process.exit(0);}
if(!DATE.test(date)||!(adults>=1&&adults<=9)||date<=new Date().toISOString().slice(0,10)){console.log('[binter] Fecha futura o pasajeros no válidos');process.exit(0);}
const previous=await readTrackerLatest('binter-stage2');
if(!force&&previous.result?.queryIdentity===identity&&successfulResultToday(previous.result)){console.log('[binter] Consulta de hoy ya guardada');process.exit(0);}
const diagnostics={url:'',steps:[],date,adults};
async function clickAny(page,locators,label,{required=true}={}){
  for(const loc of locators)try{if(await loc.first().isVisible({timeout:1000})){await loc.first().click({timeout:4500});diagnostics.steps.push(label);return true;}}catch{}
  if(required)throw new Error('Binter: no se encontró el control '+label+' en el buscador actual.');
  return false;
}
async function chooseIsland(page,airport,label){
  const name=airport==='LPA'?'Gran Canaria':'Fuerteventura';
  await clickAny(page,[page.getByText(name,{exact:true}),page.getByRole('option',{name:new RegExp(name,'i')}),page.getByRole('button',{name:new RegExp(name,'i')})],label);
}
async function scan(browser){
  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:900}});
  const page=await context.newPage();
  try{
    await page.goto('https://www.bintercanarias.com/es/buscar-vuelos',{waitUntil:'domcontentloaded',timeout:65000});
    await page.waitForTimeout(3500);diagnostics.url=page.url();
    await clickAny(page,[page.getByRole('button',{name:/aceptar todas|aceptar cookies|acepto/i})],'cookies',{required:false});
    await clickAny(page,[page.getByRole('button',{name:/origen/i}),page.getByText('Origen',{exact:true}),page.locator('input[placeholder*="Origen"]')],'origen');
    await chooseIsland(page,cfg.origin||'LPA','origen LPA');
    await clickAny(page,[page.getByRole('button',{name:/destino/i}),page.getByText('Destino',{exact:true}),page.locator('input[placeholder*="Destino"]')],'destino');
    await chooseIsland(page,cfg.destination||'FUE','destino FUE');
    await clickAny(page,[page.getByText('Sólo ida',{exact:true}),page.getByRole('radio',{name:/s[oó]lo ida/i})],'solo ida');
    // Rellenar fecha solo cuando existe un input editable; el calendario puede tener un control propio.
    const dateInputs=page.locator('input[type="date"]:visible');
    if(await dateInputs.count()){await dateInputs.first().fill(date);diagnostics.steps.push('fecha');}
    else {
      await clickAny(page,[page.getByText('Selecciona fecha de ida',{exact:false}),page.getByText('Ida',{exact:true})],'calendario');
      const [y,m,d]=date.split('-');const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
      const target=months[Number(m)-1]+' '+y;
      for(let i=0;i<15;i++){
        const visible=clean(await page.locator('body').innerText()).toLowerCase();
        if(visible.includes(target))break;
        const next=page.locator('[aria-label*="siguiente" i],[aria-label*="next" i],.mat-calendar-next-button,.datepicker-next');
        if(!await next.count())throw new Error('Binter: calendario sin selector de mes verificable.');
        await next.first().click();await page.waitForTimeout(150);
      }
      await clickAny(page,[page.getByRole('button',{name:new RegExp('^'+Number(d)+'$')}),page.locator('[role="gridcell"]').getByText(String(Number(d)),{exact:true})],'fecha '+date);
    }
    await clickAny(page,[page.getByText('Pasajeros',{exact:true}),page.getByText('Selecciona los pasajeros',{exact:false})],'pasajeros');
    for(let i=1;i<adults;i++){
      const adultRow=page.getByText(/Adulto/i).first().locator('xpath=..');
      if(!await clickAny(page,[adultRow.getByRole('button',{name:/a[ñn]adir|plus|add|increment|\+/i}),page.getByRole('button',{name:/a[ñn]adir adulto/i})],'adulto '+(i+1),{required:false}))throw new Error('Binter: no se pudo confirmar la selección de '+adults+' adultos.');
    }
    await clickAny(page,[page.getByRole('button',{name:/^buscar$/i})],'buscar');
    await page.waitForTimeout(6500);
    diagnostics.url=page.url();
    const body=await page.locator('body').innerText();
    const norm=clean(body).toLowerCase();
    if(/acceso denegado|captcha|verify you are human/i.test(norm))throw new Error('Binter requiere verificación humana.');
    if(!/fuerteventura/i.test(body)||!/gran canaria/i.test(body))throw new Error('Binter no confirmó el trayecto solicitado.');
    const euros=[...body.matchAll(/(?:total(?:\s+(?:a pagar|del viaje|de la reserva|importe))?)[^\d€]{0,24}([\d.,]+)\s*€/gi)]
       .map(m=>money(m[1])).filter(v=>v>0&&v<20000);
    const explicitFive=new RegExp('(?:'+adults+'\\s*(?:adultos|pasajeros|viajeros)|(?:adultos|pasajeros|viajeros)\\s*:?\\s*'+adults+')','i').test(body);
    if(!explicitFive||!euros.length)throw new Error('Binter no muestra un TOTAL verificable para '+adults+' adultos; no se registra un precio parcial.');
    const total=euros.at(-1);
    await snapshot(page,'binter/00-precio').catch(()=>{});
    return {ok:true,status:'ok',price:total,total,origin:cfg.origin||'LPA',destination:cfg.destination||'FUE',date,adults,resident:cfg.resident===true,source:'Binter · total web verificado',url:page.url(),diagnostics:{steps:diagnostics.steps}};
  }finally{await context.close();}
}
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--disable-blink-features=AutomationControlled']});
  const result=await scan(browser);
  await postResult('binter-stage2',{...result,stageId:'week-2',queryIdentity:identity,checkedAt:isoNow()});
  console.log('[binter] OK '+JSON.stringify({price:result.price,date,adults}));
}catch(e){
  console.error('[binter] ERROR '+e.message);
  await fs.mkdir(path.resolve('artifacts/binter'),{recursive:true}).catch(()=>{});
  await fs.writeFile(path.resolve('artifacts/binter/diagnostics.json'),JSON.stringify({message:e.message,...diagnostics},null,2)).catch(()=>{});
  await postResult('binter-stage2',{ok:false,status:'error',checkedAt:isoNow(),stageId:'week-2',queryIdentity:identity,error:String(e.message)}).catch(()=>{});
  process.exitCode=1;
}finally{await browser?.close();}
