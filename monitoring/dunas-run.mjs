// MFE_DUNAS_RUN_VERSION: 1.0.0
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {isoNow,postResult,readTrackerLatest,successfulResultToday} from './lib.mjs';
import {monitorDunas} from './dunas.mjs';
const configuration=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));
const config=configuration.dunas||{};
const force=/^(true|1)$/i.test(String(process.env.MFE_FORCE_RUN||''));
if(config.enabled!==true){console.log('[dunas] Aún sin configurar.');process.exit(0);}
if(!/^\d{4}-\d{2}-\d{2}$/.test(config.checkIn||'')||!/^\d{4}-\d{2}-\d{2}$/.test(config.checkOut||'')){console.log('[dunas] Faltan fechas; no se realiza consulta.');process.exit(0);}
const adults=Math.max(1,Number(config.adults)||5),rooms=Math.max(1,Number(config.rooms)||1);
const queryIdentity=[config.checkIn,config.checkOut,String(adults),String(rooms),config.targetRoom||'Suite'].join('|');
const previous=await readTrackerLatest('dunas');
if(!force&&previous.result?.queryIdentity===queryIdentity&&successfulResultToday(previous.result)){console.log('[dunas] Ya se comprobó este periodo hoy.');process.exit(0);}
let browser;
try{
  browser=await chromium.launch({headless:true,args:['--disable-blink-features=AutomationControlled']});
  const result=await monitorDunas(browser,{...config,adults,rooms});
  await postResult('dunas',{...result,checkedAt:isoNow(),queryIdentity,stageId:'week-2'});
  console.log(result.status==='unavailable'?'[dunas] SIN TARIFA DISPONIBLE':'[dunas] TARIFAS VERIFICADAS',JSON.stringify({status:result.status,reason:result.reason||'',price:result.price,checkIn:config.checkIn,checkOut:config.checkOut,adults,rooms}));
}catch(error){
  console.error('[dunas] ERROR',error);
  await postResult('dunas',{ok:false,status:'error',checkedAt:isoNow(),queryIdentity,stageId:'week-2',error:error.message}).catch(e=>console.error('No se pudo registrar el error:',e.message));
  process.exitCode=1;
}finally{await browser?.close();}
