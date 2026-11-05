import assert from 'node:assert/strict';
const worker=(await import(new URL('../CLOUDFLARE_WORKER_v2_2_54.js',import.meta.url))).default;

const kvMap=new Map();
const kv={
  async get(key){return kvMap.has(key)?kvMap.get(key):null;},
  async put(key,value){kvMap.set(key,String(value));},
  async delete(key){kvMap.delete(key);}
};
const dispatches=[];
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
globalThis.fetch=async(input,options={})=>{
  const url=typeof input==='string'?input:input.url;
  if(url.startsWith('https://api.github.com/')){
    if(url.includes('/actions/workflows/')&&url.includes('/runs?')){
      const workflow=decodeURIComponent(url.match(/\/actions\/workflows\/([^/]+)\/runs\?/)?.[1]||'');
      if(workflow==='cordial-monitor.yml')return Response.json({workflow_runs:[{id:22,event:'schedule',status:'completed',conclusion:'success',created_at:`${today}T04:36:00Z`,run_started_at:`${today}T04:36:10Z`,html_url:'https://example.invalid/22'}]});
      return Response.json({workflow_runs:[]});
    }
    if(url.includes('/actions/workflows/')&&url.endsWith('/dispatches')){
      dispatches.push({url,body:JSON.parse(options.body||'{}')});return new Response(null,{status:204});
    }
  }
  throw new Error(`fetch inesperado: ${url}`);
};
const env={GITHUB_TOKEN:'token',GITHUB_OWNER:'mikelferech',GITHUB_REPO:'autoreisen-monitor',GITHUB_BRANCH:'main',GITHUB_WORKFLOW_FILE:'autoreisen-monitor.yml',MFE_TRACKERS:kv};
let pending;
await worker.scheduled({scheduledTime:Date.parse(`${today}T06:20:00Z`),cron:'20 5 * * *'},env,{waitUntil(p){pending=p;}});await pending;
assert.equal(dispatches.length,2,'Debe lanzar AutoReisen y Vueling, pero no Cordial que ya se ejecutó');
assert.match(dispatches[0].url,/autoreisen-monitor\.yml\/dispatches|vueling-monitor\.yml\/dispatches/);
assert.match(dispatches[1].url,/autoreisen-monitor\.yml\/dispatches|vueling-monitor\.yml\/dispatches/);
const saved=JSON.parse(kvMap.get(`monitor:fallback:${today}`));
assert.equal(saved.completed,true);assert.equal(saved.dispatchedCount,2);assert.equal(saved.trackers.cordial.runFound,true);
await worker.scheduled({scheduledTime:Date.parse(`${today}T07:20:00Z`),cron:'20 6 * * *'},env,{waitUntil(p){pending=p;}});await pending;
assert.equal(dispatches.length,2,'La segunda ventana diaria no debe duplicar dispatches');
const res=await worker.fetch(new Request('https://worker.invalid/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'monitor-fallback-status'})}),env);
assert.equal(res.status,200);const status=await res.json();assert.equal(status.enabled,true);assert.equal(status.lastCheck.dispatchedCount,2);
console.log('OK · Respaldo Cloudflare detecta ejecuciones del día, lanza solo las ausentes y evita duplicados.');
