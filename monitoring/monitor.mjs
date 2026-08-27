import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {daysBetween,isoNow,moneyText,postResult,readLatest,sendTelegram} from './lib.mjs';
import {monitorAutoReisen,scanAutoReisenFleet} from './autoreisen.mjs';

const document=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));

async function launchAutoReisenBrowser(){
  const base={headless:true,args:['--disable-blink-features=AutomationControlled']};
  try{return await chromium.launch({...base,channel:'chrome'});}catch(error){
    console.warn('[autoreisen] Chrome estable no disponible; se usa Chromium de Playwright.',error?.message||error);
    return chromium.launch(base);
  }
}

const defaults={enabled:true,telegramEnabled:true,telegramNotifyEveryCheck:true,telegramNotifyPriceDrop:true,telegramNotifyBelowReserved:true,telegramNotifyAvailability:true,telegramNotifyError:true,telegramNotifyRecovery:true,telegramMinDropAmount:0,telegramMinDropPercent:0};
let config={...defaults,...(document.autoreisen||{})};
const force=/^(1|true|yes)$/i.test(String(process.env.MFE_FORCE_RUN||''));
const telegramTest=/^(1|true|yes)$/i.test(String(process.env.MFE_TEST_TELEGRAM||''));
const fleetOnly=/^(1|true|yes)$/i.test(String(process.env.MFE_FLEET_ONLY||''));
const requestId=String(process.env.MFE_REQUEST_ID||'').trim();
const fleetConfigJson=String(process.env.MFE_FLEET_CONFIG_JSON||'').trim();
if(fleetOnly&&fleetConfigJson){
  try{const temporary=JSON.parse(fleetConfigJson);config={...config,...temporary};console.log('[autoreisen-fleet] Configuración temporal recibida; monitoring/config.json no se modifica.');}
  catch(error){throw new Error(`La configuración temporal de flota no es JSON válido: ${error.message}`);}
}

if(telegramTest){
  if(!config.telegramEnabled)throw new Error('Telegram está desactivado en MFE Viajes. Actívalo antes de probarlo.');
  await sendTelegram(`🧪 MFE Viajes · Telegram funciona correctamente\nAutoReisen · ${new Date().toLocaleString('es-ES',{timeZone:'Atlantic/Canary'})}`);
  console.log('Mensaje de prueba enviado a Telegram.');
  process.exit(0);
}
if(fleetOnly){
  const browser=await launchAutoReisenBrowser();
  try{
    const result=await scanAutoReisenFleet(browser,config);
    await postResult('autoreisen',{...result,ok:true,status:'ok',scanMode:'fleet',requestId,checkedAt:result.checkedAt||isoNow()});
    console.log('[autoreisen-fleet] OK',result);
  }catch(error){
    const result={ok:false,status:'error',scanMode:'fleet',requestId,error:error?.message||String(error),checkedAt:isoNow(),source:'GitHub Actions + Playwright'};
    console.error('[autoreisen-fleet] ERROR',error);
    try{await postResult('autoreisen',result);}catch(postError){console.error('No se pudo registrar el error de flota en el Worker:',postError.message);}
    process.exitCode=1;
  }finally{await browser.close();}
  process.exit(process.exitCode||0);
}
if(!config.enabled){console.log('Monitor AutoReisen desactivado desde MFE Viajes.');process.exit(0);}

if(!force)console.log('Comprobación automática diaria de las 06:30 (Europe/Madrid).');
const previous=await readLatest();

const browser=await launchAutoReisenBrowser();
try{
  const result=await monitorAutoReisen(browser,config);
  const notices=[];const current=Number(result.total||result.price)||0;const prior=Number(previous.result?.total||previous.result?.price)||0;const reserved=Number(config.reservedPrice)||0;
  const hadPreviousError=Boolean(previous.lastError);
  const dropAmount=prior>current?prior-current:0,dropPercent=prior>0?dropAmount/prior*100:0,minDropAmount=Math.max(0,Number(config.telegramMinDropAmount)||0),minDropPercent=Math.max(0,Number(config.telegramMinDropPercent)||0);
  const dropMeetsLimits=dropAmount>0&&(minDropAmount<=0||dropAmount>=minDropAmount)&&(minDropPercent<=0||dropPercent>=minDropPercent);
  if(config.telegramNotifyPriceDrop&&prior>0&&current>0&&current<prior&&dropMeetsLimits)notices.push(`📉 Baja de precio: ${moneyText(prior)} → ${moneyText(current)} (-${moneyText(dropAmount)}, -${dropPercent.toFixed(1)}%)`);
  if(config.telegramNotifyBelowReserved&&reserved>0&&current>0&&current<reserved&&(prior<=0||prior>=reserved))notices.push(`✅ Por debajo de tu reserva: ${moneyText(current)} (reservado ${moneyText(reserved)})`);
  if(config.telegramNotifyAvailability&&previous.result?.availability&&result.availability!==previous.result.availability)notices.push(`🚗 Disponibilidad: ${previous.result.availability} → ${result.availability}`);
  if(config.telegramNotifyRecovery&&hadPreviousError)notices.push(`🟢 Monitor recuperado tras el error anterior.`);
  await postResult('autoreisen',{...result,ok:true,status:'ok',checkedAt:result.checkedAt||isoNow()});
  if(config.telegramEnabled&&(config.telegramNotifyEveryCheck||notices.length)){
    const difference=reserved>0?current-reserved:0;
    const trend=prior<=0?'ℹ️ Primera comprobación correcta.':current<prior?`📉 Precio ${moneyText(prior-current)} más bajo que en la comprobación anterior.`:current>prior?`📈 Precio ${moneyText(current-prior)} más alto que en la comprobación anterior.`:'➖ Sin cambio respecto a la comprobación anterior.';
    const formatPoint=value=>{const [date,time='']=String(value||'').split('T');const [year,month,day]=date.split('-');return year&&month&&day?`${day}/${month} ${time.slice(0,5)}`:String(value||'');};
    const days=daysBetween(config.pickupAt,config.dropoffAt);
    const differenceText=reserved>0?`${difference>=0?'+':''}${moneyText(difference)}`:'—';
    const lines=[
      '🚗 MFE Viajes · AutoReisen',
      ...(notices.length?notices:['✅ Comprobación correcta']),
      `Precio actual: ${moneyText(current)}`,
      `Reserva: ${reserved>0?moneyText(reserved):'—'}`,
      `Diferencia vs reserva: ${differenceText}`,
      trend,
      `${config.model||'Vehículo'}${config.group?` · Grupo ${config.group}`:''}`,
      `${days} ${days===1?'día':'días'} · ${formatPoint(config.pickupAt)} → ${formatPoint(config.dropoffAt)}`,
      `Disponibilidad: ${result.availability||'Disponible'}`
    ];
    try{await sendTelegram(lines.join('\n'));}catch(error){console.error('Telegram:',error.message);process.exitCode=1;}
  }
  console.log('[autoreisen] OK',result);
}catch(error){
  const result={ok:false,status:'error',error:error?.message||String(error),checkedAt:isoNow(),source:'GitHub Actions + Playwright'};
  console.error('[autoreisen] ERROR',error);
  try{await postResult('autoreisen',result);}catch(postError){console.error('No se pudo registrar el error en el Worker:',postError.message);}
  if(config.telegramEnabled&&config.telegramNotifyError){try{await sendTelegram(`🔴 MFE Viajes · Error AutoReisen\n${result.error}`);}catch(telegramError){console.error('Telegram:',telegramError.message);}}
  process.exitCode=1;
}finally{await browser.close();}
