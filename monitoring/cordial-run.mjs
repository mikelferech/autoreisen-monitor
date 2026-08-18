import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {isoNow,postResult} from './lib.mjs';
import {monitorCordial} from './cordial.mjs';

const document=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));
const config={enabled:true,scheduleTime:'08:00',scheduleTimeZone:'Europe/Madrid',...(document.cordial||{})};
if(config.enabled===false){console.log('Monitor Cordial desactivado desde MFE Viajes.');process.exit(0);}
const browser=await chromium.launch({headless:true});
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
