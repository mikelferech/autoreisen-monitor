import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {isoNow,postResult} from './lib.mjs';
import {monitorCordial} from './cordial.mjs';

const document=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));
const config={enabled:true,scheduleTime:'08:00',scheduleTimeZone:'Europe/Madrid',...(document.cordial||{})};
if(config.enabled===false){console.log('Monitor Cordial desactivado desde MFE Viajes.');process.exit(0);}

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
  const result=await monitorCordial(browser,config);
  await postResult('cordial',{...result,checkedAt:result.checkedAt||isoNow()});
  console.log('[cordial] OK',JSON.stringify(result,null,2));
}catch(error){
  const result={ok:false,status:'error',error:error?.message||String(error),checkedAt:isoNow(),source:'BeCordial · GitHub Actions + Playwright'};
  console.error('[cordial] ERROR',error);
  try{await postResult('cordial',result);}catch(postError){console.error('No se pudo registrar el error de Cordial en el Worker:',postError.message);}
  process.exitCode=1;
}finally{await browser.close();}
