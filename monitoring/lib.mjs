import fs from 'node:fs/promises';
import path from 'node:path';

export const ARTIFACTS = path.resolve('artifacts');
export async function ensureArtifacts(){await fs.mkdir(ARTIFACTS,{recursive:true});}
export function money(text=''){
  const matches=String(text).match(/(?:€\s*)?([0-9]{1,4}(?:[.,][0-9]{2}))\s*€?/g)||[];
  return matches.map(v=>Number.parseFloat(v.replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.'))).filter(Number.isFinite);
}
export async function snapshot(page,name){await ensureArtifacts();await page.screenshot({path:path.join(ARTIFACTS,`${name}.png`),fullPage:true}).catch(()=>{});await fs.writeFile(path.join(ARTIFACTS,`${name}.html`),await page.content().catch(()=>''),'utf8').catch(()=>{});}
export async function acceptCookies(page){
  for(const label of [/aceptar todas/i,/aceptar/i,/allow all/i,/accept all/i,/consentir/i]){
    const btn=page.getByRole('button',{name:label}).first();if(await btn.isVisible().catch(()=>false)){await btn.click().catch(()=>{});break;}
  }
}
export async function fillFirst(page,selectors,value){
  for(const selector of selectors){const loc=typeof selector==='string'?page.locator(selector).first():selector; if(await loc.isVisible().catch(()=>false)){await loc.fill(String(value));return true;}}
  return false;
}
export async function clickFirst(page,locators){
  for(const loc0 of locators){const loc=typeof loc0==='string'?page.locator(loc0).first():loc0;if(await loc.isVisible().catch(()=>false)){await loc.click();return true;}}
  return false;
}
export function workerCredentials(){
  const url=String(process.env.MFE_WORKER_URL||'').trim();const secret=String(process.env.MFE_MONITOR_SECRET||'').trim();
  if(!url||!secret)throw new Error('Faltan MFE_WORKER_URL o MFE_MONITOR_SECRET en los secretos de GitHub.');
  return {url,secret};
}
export async function workerRequest(payload,{authenticated=false,allowError=false}={}){
  const {url,secret}=workerCredentials();
  const headers={'Content-Type':'application/json'};if(authenticated)headers.Authorization=`Bearer ${secret}`;
  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(payload)});
  let data=null;try{data=await response.json();}catch{}
  if(!response.ok&&!allowError)throw new Error(`Worker ${response.status}: ${data?.error||'respuesta no válida'}`);
  return {response,data};
}
export async function readLatest(){
  const {response,data}=await workerRequest({action:'autoreisen'},{allowError:true});
  if(response.ok&&data?.result)return {result:data.result,lastError:data.lastError||null};
  return {result:null,lastError:data?.lastError||null};
}
export async function postResult(type,result){
  const {response,data}=await workerRequest({action:'monitor-write',type,result},{authenticated:true,allowError:true});
  if(!response.ok)throw new Error(`Worker ${response.status}: ${data?.error||'no se pudo guardar el resultado'}`);
  return data;
}
export function isoNow(){return new Date().toISOString();}
export function daysBetween(a,b){return Math.max(1,Math.ceil((new Date(b)-new Date(a))/86400000));}
export async function waitNetwork(page){await page.waitForLoadState('domcontentloaded');await page.waitForTimeout(1800);}
export function hoursSince(value){const t=Date.parse(String(value||''));return Number.isFinite(t)?Math.max(0,(Date.now()-t)/3600000):Infinity;}
export function moneyText(value){return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(value)||0);}
export async function sendTelegram(text){
  const token=String(process.env.TELEGRAM_BOT_TOKEN||'').trim();
  const chatId=String(process.env.TELEGRAM_CHAT_ID||'').trim();
  if(!token||!chatId)throw new Error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en los secretos de GitHub.');
  const response=await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text:String(text),disable_web_page_preview:true})});
  let data=null;try{data=await response.json();}catch{}
  if(!response.ok||data?.ok===false)throw new Error(data?.description||`Telegram respondió HTTP ${response.status}`);
  return data;
}
