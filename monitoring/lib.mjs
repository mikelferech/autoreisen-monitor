import fs from 'node:fs/promises';
import path from 'node:path';

export const ARTIFACTS = path.resolve('artifacts');

export async function ensureArtifacts(){
  await fs.mkdir(ARTIFACTS,{recursive:true});
}

export function money(text=''){
  const matches=String(text).match(/(?:€\s*)?([0-9]{1,4}(?:[.,][0-9]{2}))\s*€?/g)||[];
  return matches
    .map(v=>Number.parseFloat(v.replace(/[^0-9,.-]/g,'').replace(/\./g,'').replace(',','.')))
    .filter(Number.isFinite);
}

export async function snapshot(page,name){
  await ensureArtifacts();
  await page.screenshot({path:path.join(ARTIFACTS,`${name}.png`),fullPage:true}).catch(()=>{});
  await fs.writeFile(path.join(ARTIFACTS,`${name}.html`),await page.content().catch(()=>''),'utf8').catch(()=>{});
}

export async function acceptCookies(page){
  for(const label of [/permitir todas/i,/aceptar todas/i,/aceptar/i,/allow all/i,/accept all/i,/consentir/i]){
    const btn=page.getByRole('button',{name:label}).first();
    if(await btn.isVisible().catch(()=>false)){
      await btn.click({force:true}).catch(()=>{});
      await page.waitForTimeout(700);
      break;
    }
  }
}

export async function fillFirst(page,selectors,value){
  for(const selector of selectors){
    const loc=typeof selector==='string'?page.locator(selector).first():selector;
    if(!await loc.isVisible().catch(()=>false))continue;
    const editable=await loc.isEditable().catch(()=>false);
    if(!editable)continue;
    await loc.fill(String(value));
    return true;
  }
  return false;
}

export async function clickFirst(page,locators,options={}){
  for(const loc0 of locators){
    const loc=typeof loc0==='string'?page.locator(loc0).first():loc0;
    if(await loc.isVisible().catch(()=>false)){
      await loc.click(options);
      return true;
    }
  }
  return false;
}

export async function selectOptionContaining(selectLocator,wanted){
  const selected=await selectLocator.evaluate((select,wantedText)=>{
    const wanted=String(wantedText).toLocaleLowerCase().trim();
    const options=[...select.options];
    const option=options.find(item=>item.textContent.toLocaleLowerCase().trim().includes(wanted));
    if(!option)return null;
    select.value=option.value;
    option.selected=true;
    select.dispatchEvent(new Event('input',{bubbles:true}));
    select.dispatchEvent(new Event('change',{bubbles:true}));
    return option.textContent.trim();
  },wanted).catch(()=>null);
  if(!selected)throw new Error(`No se encontró la opción “${wanted}” en el desplegable.`);
  return selected;
}

export async function postResult(type,result){
  const url=process.env.MFE_WORKER_URL;
  const secret=process.env.MFE_MONITOR_SECRET;
  if(!url||!secret)throw new Error('Faltan MFE_WORKER_URL o MFE_MONITOR_SECRET en los secretos de GitHub.');
  const response=await fetch(url,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':`Bearer ${secret}`},
    body:JSON.stringify({action:'monitor-write',type,result})
  });
  const text=await response.text();
  if(!response.ok)throw new Error(`Worker ${response.status}: ${text}`);
  return text;
}

export function isoNow(){return new Date().toISOString();}

export async function runWithResult(type,fn){
  try{
    const result=await fn();
    await postResult(type,{...result,ok:true,status:'ok',checkedAt:result.checkedAt||isoNow()});
    console.log(`[${type}] OK`,result);
    return true;
  }catch(error){
    const result={ok:false,status:'error',error:error?.message||String(error),checkedAt:isoNow(),source:'GitHub Actions + Playwright'};
    console.error(`[${type}] ERROR`,error);
    try{await postResult(type,result);}catch(postError){console.error('No se pudo registrar el error en el Worker:',postError);}
    return false;
  }
}

export function daysBetween(a,b){return Math.max(1,Math.ceil((new Date(b)-new Date(a))/86400000));}
export async function waitNetwork(page){
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1800);
}
