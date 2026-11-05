// MFE_AUTOREISEN_STAGE2_VERSION: 1.1.0
// Segunda isla: consulta aislada de AutoReisen. Nunca sobrescribe el monitor de la primera semana.
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {isoNow,postResult,readTrackerLatest,successfulResultToday} from './lib.mjs';
import {scanAutoReisenFleet,bestFleetVehicle,monitorAutoReisen} from './autoreisen.mjs';

const configFile=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));
const config=configFile.autoreisenStage2||{};
const force=/^(true|1)$/i.test(process.env.MFE_FORCE_RUN||'');
if(config.enabled!==true){console.log('[autoreisen-stage2] Sin configurar / desactivado, no se consulta.');process.exit(0);}
if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(config.pickupAt||'')||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(config.dropoffAt||'')){
  console.log('[autoreisen-stage2] Faltan fechas de recogida/devolución válidas.');process.exit(0);
}
const previous=await readTrackerLatest('autoreisen-stage2');
const identity=String(config.pickupAt)+'|'+String(config.dropoffAt)+'|'+String(config.pickupOfficeId||'')+'|'+String(config.dropoffOfficeId||'')+'|'+String(config.model||'')+'|'+String(config.group||'');
if(!force&&previous.result?.queryIdentity===identity&&successfulResultToday(previous.result)){
  console.log('[autoreisen-stage2] Ya se comprobó hoy la reserva de esta etapa.');process.exit(0);
}
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-blink-features=AutomationControlled']}).catch(()=>chromium.launch({headless:true,args:['--disable-blink-features=AutomationControlled']}));
try{
  let scan=null,full=[],selected=null;
  try{
    scan=await scanAutoReisenFleet(browser,config);
    full=Array.isArray(scan.fleet)?scan.fleet:[];
    selected=bestFleetVehicle(full,config);
  }catch(error){console.warn('[autoreisen-stage2] Flota no disponible, probando precio de la reserva.',error.message);}
  if(!selected&&!config.model)throw new Error('No hay modelo configurado ni una flota con precios verificables para Fuerteventura.');
  let result=null;
  if(selected&&Number(selected.total)>0){result={...scan,price:Number(selected.total),total:Number(selected.total),pricePerDay:Number(selected.pricePerDay)||0,model:selected.model,group:selected.group,carId:selected.carId||'',imageUrl:selected.imageUrl||'',availability:selected.availability||'Disponible'};}
  else result=await monitorAutoReisen(browser,config);
  if(!(Number(result?.total||result?.price)>0))throw new Error('AutoReisen no devolvió un precio numérico válido para la segunda isla.');
  result={...result,fleet:full.length?full:(Array.isArray(result.fleet)?result.fleet:[]),ok:true,status:'ok',stageId:'week-2',queryIdentity:identity,searchConfig:{pickupAt:config.pickupAt,dropoffAt:config.dropoffAt,pickupOfficeId:config.pickupOfficeId,dropoffOfficeId:config.dropoffOfficeId,model:config.model,group:config.group},checkedAt:isoNow(),source:'AutoReisen · etapa 2 · GitHub Actions'};
  await postResult('autoreisen-stage2',result);
  console.log('[autoreisen-stage2] OK',JSON.stringify({price:result.price,model:result.model,group:result.group,checkedAt:result.checkedAt}));
}catch(error){
  console.error('[autoreisen-stage2] ERROR',error);
  await postResult('autoreisen-stage2',{ok:false,status:'error',error:error.message,stageId:'week-2',queryIdentity:identity,checkedAt:isoNow()}).catch(e=>console.error('[autoreisen-stage2] No se pudo guardar el error',e.message));
  process.exitCode=1;
}finally{await browser.close();}
