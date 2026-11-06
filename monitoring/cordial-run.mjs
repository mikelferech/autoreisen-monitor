import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {isoNow,postResult,readTrackerLatest,successfulResultToday} from './lib.mjs';
import {monitorCordial} from './cordial.mjs';

const document=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));
const config={enabled:true,scheduleTime:'06:35',scheduleTimeZone:'Europe/Madrid',...(document.cordial||{})};
const force=/^(1|true|yes)$/i.test(String(process.env.MFE_FORCE_RUN||''));
if(config.enabled===false&&!force){console.log('[cordial] Seguimiento diario desactivado; no se ejecuta el cron. Una comprobación manual forzada sí puede ejecutarse.');process.exit(0);}
if(config.enabled===false&&force){console.log('[cordial] Comprobación manual forzada: se ejecuta aunque el seguimiento diario esté desactivado.');}
if(!force){
  const previous=await readTrackerLatest('cordial');
  if(successfulResultToday(previous.result)&&Number(previous.result.targetPrice||previous.result.target?.price)>0){
    console.log(`[cordial] OMITIDO: ya existe una comprobación correcta de hoy (${previous.result.checkedAt||previous.result.receivedAt||'sin hora'}). El cron tardío no repetirá la consulta.`);
    process.exit(0);
  }
}

async function launchInstalledChrome(){
  const attempts=[];
  try{
    const browser=await chromium.launch({channel:'chrome',headless:true});
    console.log('[cordial] Navegador: Google Chrome preinstalado (channel=chrome).');
    return browser;
  }catch(error){attempts.push(`channel=chrome: ${error?.message||String(error)}`);}

  const candidates=[
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  for(const executablePath of [...new Set(candidates)]){
    try{
      await fs.access(executablePath);
      const browser=await chromium.launch({executablePath,headless:true});
      console.log(`[cordial] Navegador: ${executablePath}.`);
      return browser;
    }catch(error){attempts.push(`${executablePath}: ${error?.message||String(error)}`);}
  }
  throw new Error(`No se pudo iniciar el Chrome/Chromium preinstalado del runner. ${attempts.join(' | ')}`);
}

const browser=await launchInstalledChrome();
try{
  // Limit prolonged booking-page stalls. On timeout, report an explicit error rather than leaving the UI pending indefinitely.
  let guard;
  const result=await Promise.race([monitorCordial(browser,config),new Promise((_,reject)=>{guard=setTimeout(()=>reject(new Error('Cordial: consulta agotada tras 120 segundos. Revisa el diagnóstico de la página y vuelve a comprobar.')),120000);})]).finally(()=>clearTimeout(guard));
  await postResult('cordial',{...result,checkedAt:result.checkedAt||isoNow()});
  console.log(result.status==='partial'?'[cordial] SIN TARIFA CONFIRMADA':'[cordial] OK',JSON.stringify(result,null,2));
  if(result.status==='partial')process.exitCode=1; // Publicar diagnóstico de GitHub; el resultado parcial ya se guardó.
}catch(error){
  const result={ok:false,status:'error',error:error?.message||String(error),checkedAt:isoNow(),source:'BeCordial · GitHub Actions + Playwright'};
  console.error('[cordial] ERROR',error);
  try{await postResult('cordial',result);}catch(postError){console.error('No se pudo registrar el error de Cordial en el Worker:',postError.message);}
  process.exitCode=1;
}finally{await browser.close();}
