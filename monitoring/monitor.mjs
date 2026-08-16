import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {daysBetween,isoNow,moneyText,postResult,readLatest,sendTelegram} from './lib.mjs';
import {monitorAutoReisen} from './autoreisen.mjs';

const document=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));
const config={enabled:true,telegramEnabled:true,telegramNotifyEveryCheck:true,telegramNotifyPriceDrop:true,telegramNotifyBelowReserved:true,telegramNotifyAvailability:true,telegramNotifyError:true,telegramNotifyRecovery:true,telegramMinDropAmount:0,telegramMinDropPercent:0,...(document.autoreisen||{})};
const force=/^(1|true|yes)$/i.test(String(process.env.MFE_FORCE_RUN||''));
const telegramTest=/^(1|true|yes)$/i.test(String(process.env.MFE_TEST_TELEGRAM||''));

if(telegramTest){
  if(!config.telegramEnabled)throw new Error('Telegram está desactivado en MFE Viajes. Actívalo antes de probarlo.');
  await sendTelegram(`🧪 MFE Viajes · Telegram funciona correctamente\nAutoReisen · ${new Date().toLocaleString('es-ES',{timeZone:'Atlantic/Canary'})}`);
  console.log('Mensaje de prueba enviado a Telegram.');
  process.exit(0);
}
if(!config.enabled){console.log('Monitor AutoReisen desactivado desde MFE Viajes.');process.exit(0);}

const SCHEDULE_TIMEZONE='Europe/Madrid';
const SCHEDULE_HOUR=7;
const SCHEDULE_MINUTE=30;
const scheduledExpression=String(process.env.MFE_SCHEDULE_EVENT||'').trim();
function madridUtcOffsetHours(date=new Date()){
  const part=new Intl.DateTimeFormat('en-US',{timeZone:SCHEDULE_TIMEZONE,timeZoneName:'shortOffset',hour:'2-digit'}).formatToParts(date).find(x=>x.type==='timeZoneName')?.value||'GMT+1';
  const m=part.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/i);
  if(!m)return 1;const sign=m[1]==='-'?-1:1;return sign*(Number(m[2])+(Number(m[3]||0)/60));
}
function expectedDailyCron(date=new Date()){
  const offset=madridUtcOffsetHours(date);const utcHour=(SCHEDULE_HOUR-offset+24)%24;
  return `${SCHEDULE_MINUTE} ${Math.trunc(utcHour)} * * *`;
}
if(!force){
  const expected=expectedDailyCron();
  if(!scheduledExpression||scheduledExpression!==expected){
    console.log(`Ejecución programada descartada. La comprobación automática es diaria a las 07:30 (${SCHEDULE_TIMEZONE}). Cron esperado hoy: ${expected}. Evento recibido: ${scheduledExpression||'ninguno'}.`);
    process.exit(0);
  }
  console.log(`Comprobación automática diaria de las 07:30 (${SCHEDULE_TIMEZONE}).`);
}
const previous=await readLatest();

const browser=await chromium.launch({headless:true});
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
    try{await sendTelegram(lines.join('\n'));}catch(error){console.error('Telegram:',error.message);}
  }
  console.log('[autoreisen] OK',result);
}catch(error){
  const result={ok:false,status:'error',error:error?.message||String(error),checkedAt:isoNow(),source:'GitHub Actions + Playwright'};
  console.error('[autoreisen] ERROR',error);
  try{await postResult('autoreisen',result);}catch(postError){console.error('No se pudo registrar el error en el Worker:',postError.message);}
  if(config.telegramEnabled&&config.telegramNotifyError){try{await sendTelegram(`🔴 MFE Viajes · Error AutoReisen\n${result.error}`);}catch(telegramError){console.error('Telegram:',telegramError.message);}}
  process.exitCode=1;
}finally{await browser.close();}
