import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {workerRequest} from './lib.mjs';
import {monitorFlightOps} from './flightops.mjs';

const document=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));
const config={enabled:true,...(document.flightops||{})};
const force=/^(1|true|yes)$/i.test(String(process.env.MFE_FORCE_RUN||''));
if(config.enabled===false){console.log('[flightops] Seguimiento operativo desactivado.');process.exit(0);}

async function readPrevious(){const {response,data}=await workerRequest({action:'flightops-read'},{allowError:true});return response.ok?data:null;}
function intervalForFlight(flight,now=Date.now()){
  const dep=Date.parse(flight.departure||''),arr=Date.parse(flight.arrival||'');
  if(!Number.isFinite(dep))return Infinity;
  const until=dep-now;
  if(Number.isFinite(arr)&&now>arr+3*3600000)return Infinity;
  if(until>24*3600000)return 6*3600000;
  if(until>4*3600000)return 60*60000;
  return 10*60000;
}
function shouldRun(previous){
  if(force)return true;
  const flights=Array.isArray(config.flights)?config.flights:[];const intervals=flights.map(f=>intervalForFlight(f)).filter(Number.isFinite);
  if(!intervals.length)return false;
  const required=Math.min(...intervals),last=Date.parse(previous?.result?.checkedAt||previous?.result?.receivedAt||'');
  if(!Number.isFinite(last))return true;
  return Date.now()-last>=Math.max(8*60000,required-60000);
}
const previous=await readPrevious().catch(()=>null);
if(!shouldRun(previous)){console.log('[flightops] OMITIDO: todavía no toca una nueva consulta operativa.');process.exit(0);}

async function launchBrowser(){
  const candidates=[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
  try{return await chromium.launch({channel:'chrome',headless:true});}catch{}
  for(const executablePath of candidates){try{await fs.access(executablePath);return await chromium.launch({executablePath,headless:true});}catch{}}
  return chromium.launch({headless:true});
}
const browser=await launchBrowser();
try{
  const result=await monitorFlightOps(browser,config);
  const {response,data}=await workerRequest({action:'flightops-write',result},{authenticated:true,allowError:true});
  if(!response.ok)throw new Error(`Worker ${response.status}: ${data?.error||'no se pudo guardar flightops'}`);
  console.log('[flightops] OK',JSON.stringify(result,null,2));
}catch(error){
  const result={ok:false,status:'error',error:error?.message||String(error),checkedAt:new Date().toISOString(),source:'Aena + Vueling · GitHub Actions + Playwright'};
  console.error('[flightops] ERROR',error);
  await workerRequest({action:'flightops-write',result},{authenticated:true,allowError:true}).catch(()=>{});
  process.exitCode=1;
}finally{await browser.close();}
