import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {runWithResult} from './lib.mjs';
import {monitorVueling} from './vueling.mjs';
import {monitorAutoReisen} from './autoreisen.mjs';

const config=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));
const only=process.argv[2]||'';const browser=await chromium.launch({headless:true});let ok=true;
try{
  if((!only||only==='vueling')&&config.vueling.enabled)ok=(await runWithResult('vueling',()=>monitorVueling(browser,config.vueling)))&&ok;
  if((!only||only==='autoreisen')&&config.autoreisen.enabled)ok=(await runWithResult('autoreisen',()=>monitorAutoReisen(browser,config.autoreisen)))&&ok;
}finally{await browser.close();}
process.exitCode=ok?0:1;
