import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';

const ROOT=path.resolve(process.cwd());
const TOKEN=String(process.env.CLOUDFLARE_API_TOKEN||'').trim();
const ACCOUNT_ID=String(process.env.CLOUDFLARE_ACCOUNT_ID||'').trim();
const WRANGLER_VERSION='4.119.0';
if(!TOKEN)throw new Error('Falta CLOUDFLARE_API_TOKEN.');
if(!ACCOUNT_ID)throw new Error('Falta CLOUDFLARE_ACCOUNT_ID.');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const logStep=text=>console.log(`\n==> ${text}`);

async function readWorkers(){
  try{
    const parsed=JSON.parse(await fs.readFile(path.join(ROOT,'scripts/workers-release.json'),'utf8'));
    if(Array.isArray(parsed?.workers)&&parsed.workers.length)return parsed.workers;
  }catch{}
  const ps1=await fs.readFile(path.join(ROOT,'scripts/update-workers.ps1'),'utf8');
  const rows=[];
  for(const m of ps1.matchAll(/Name='([^']+)'\s*;\s*File='([^']+)'\s*;\s*Url='([^']+)'\s*;\s*Expected='([^']+)'/g)){
    rows.push({name:m[1],file:m[2],url:m[3],expected:m[4]});
  }
  if(!rows.length)throw new Error('No se ha podido determinar qué Workers debe actualizar esta release.');
  return rows;
}

async function cfJson(url,options={}){
  const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${TOKEN}`,Accept:'application/json',...(options.headers||{})}});
  const text=await response.text();let data=null;try{data=JSON.parse(text);}catch{}
  if(!response.ok||data?.success===false){
    const details=Array.isArray(data?.errors)&&data.errors.length?data.errors.map(e=>`[${e.code??'?'}] ${e.message||'Error'}`).join('; '):(text||`HTTP ${response.status}`);
    throw new Error(`Cloudflare API HTTP ${response.status}: ${details}`);
  }
  return data;
}

function bindingSignature(settings){
  return (settings?.result?.bindings||[]).map(x=>`${x.type||''}|${x.name||''}`).filter(Boolean).sort();
}

async function uploadContent(worker){
  const source=await fs.readFile(path.join(ROOT,worker.file));
  const settingsUrl=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(ACCOUNT_ID)}/workers/scripts/${encodeURIComponent(worker.name)}/settings`;
  logStep(`Leyendo bindings actuales de ${worker.name}`);
  const before=await cfJson(settingsUrl);
  const beforeSig=bindingSignature(before);
  console.log('Bindings que se conservarán:',[...new Set((before?.result?.bindings||[]).map(x=>x.type).filter(Boolean))].join(', ')||'ninguno');

  logStep(`Publicando SOLO el código de ${worker.name} · versión ${worker.expected}`);
  const form=new FormData();
  form.append('metadata',new Blob([JSON.stringify({main_module:'worker.js'})],{type:'application/json'}),'metadata.json');
  form.append('worker.js',new Blob([source],{type:'application/javascript+module'}),'worker.js');
  const uploadUrl=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(ACCOUNT_ID)}/workers/scripts/${encodeURIComponent(worker.name)}/content`;
  await cfJson(uploadUrl,{method:'PUT',headers:{'CF-WORKER-MAIN-MODULE-PART':'worker.js'},body:form});

  const after=await cfJson(settingsUrl);
  const afterSig=bindingSignature(after);
  if(JSON.stringify(beforeSig)!==JSON.stringify(afterSig))throw new Error(`Los bindings de ${worker.name} cambiaron tras publicar. Se detiene la actualización.`);
  console.log('Código publicado. Bindings, KV, variables y secretos permanecen intactos.');
}

async function latestVersion(worker){
  const url=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(ACCOUNT_ID)}/workers/scripts/${encodeURIComponent(worker.name)}/versions?deployable=true&per_page=10`;
  for(let i=1;i<=6;i++){
    const data=await cfJson(url);
    const items=Array.isArray(data?.result?.items)?data.result.items:Array.isArray(data?.result)?data.result:Array.isArray(data?.items)?data.items:[];
    const latest=items.find(x=>x?.id);
    if(latest)return latest;
    if(i<6)await sleep(2000);
  }
  throw new Error(`Cloudflare no devolvió una versión desplegable para ${worker.name}.`);
}

function run(command,args,env={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:'inherit',env:{...process.env,...env}});
    child.on('error',reject);
    child.on('exit',code=>code===0?resolve():reject(new Error(`${command} terminó con código ${code}.`)));
  });
}

async function deployLatest(worker){
  logStep(`Activando la última versión de ${worker.name} al 100%`);
  const latest=await latestVersion(worker);
  console.log(`Versión Cloudflare localizada: ${latest.number?`#${latest.number} · `:''}${latest.id}`);
  await run('npx',['--yes',`wrangler@${WRANGLER_VERSION}`,'versions','deploy',`${latest.id}@100%`,'--name',worker.name,'--message',`MFE Viajes · ${worker.name} v${worker.expected}`,'--yes'],{
    CLOUDFLARE_API_TOKEN:TOKEN,
    CLOUDFLARE_ACCOUNT_ID:ACCOUNT_ID
  });
}

async function verify(worker){
  logStep(`Verificando ${worker.name} en workers.dev`);
  let last='';
  for(let i=1;i<=10;i++){
    try{
      const sep=worker.url.includes('?')?'&':'?';
      const response=await fetch(`${worker.url}${sep}_mfe_check=${Date.now()}-${i}`,{headers:{'Cache-Control':'no-cache','Pragma':'no-cache'}});
      const data=await response.json();const version=String(data?.version||'');
      if(version===String(worker.expected)){console.log(`${worker.name} OK · v${version}`);return;}
      last=`${worker.name} responde versión '${version}' y se esperaba '${worker.expected}'.`;
    }catch(error){last=`No se pudo comprobar ${worker.name}: ${error.message}`;}
    if(i<10){console.log(`Aún no sirve la versión esperada · reintento ${i}/10…`);await sleep(3000);}
  }
  throw new Error(last);
}

const workers=await readWorkers();
console.log('Workers que se actualizarán:',workers.map(w=>`${w.name} → ${w.expected}`).join(', '));
for(const worker of workers){await uploadContent(worker);await deployLatest(worker);await verify(worker);}
console.log('\nOK · Workers modificados actualizados y verificados.');
