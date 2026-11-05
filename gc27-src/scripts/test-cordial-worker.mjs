import assert from 'node:assert/strict';
import {generateKeyPairSync, createSign} from 'node:crypto';
import {writeFile, unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const workerModule = await import(new URL('../CLOUDFLARE_WORKER_v2_2_54.js', import.meta.url));
const worker = workerModule.default;

const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const publicJwk = publicKey.export({format:'jwk'});
publicJwk.kid = 'test-kid';
publicJwk.alg = 'RS256';
publicJwk.use = 'sig';

const b64url = value => Buffer.from(value).toString('base64url');
const now = Math.floor(Date.now()/1000);
const header = b64url(JSON.stringify({alg:'RS256',typ:'JWT',kid:'test-kid'}));
const payload = b64url(JSON.stringify({
  aud:'demo-project',
  iss:'https://securetoken.google.com/demo-project',
  sub:'admin-uid',
  email:'admin@example.com',
  iat:now-10,
  exp:now+3600
}));
const signingInput = `${header}.${payload}`;
const signer = createSign('RSA-SHA256');
signer.update(signingInput); signer.end();
const token = `${signingInput}.${signer.sign(privateKey).toString('base64url')}`;

const files = new Map();
const shaFor = path => `sha-${Buffer.from(path).toString('hex').slice(0,18)}`;
let dispatches = 0;
function ghPath(url){
  const u = new URL(url);
  const marker = '/contents/';
  const i = u.pathname.indexOf(marker);
  if(i < 0) return null;
  return u.pathname.slice(i+marker.length).split('/').map(decodeURIComponent).join('/');
}

globalThis.fetch = async (input, options={}) => {
  const url = typeof input === 'string' ? input : input.url;
  if(url.startsWith('https://www.googleapis.com/service_accounts/v1/jwk/')){
    return Response.json({keys:[publicJwk]});
  }
  if(url.startsWith('https://api.github.com/')){
    const method = String(options.method||'GET').toUpperCase();
    if(url.includes('/actions/workflows/') && url.endsWith('/dispatches')){
      assert.equal(method,'POST');
      dispatches++;
      return new Response(null,{status:204});
    }
    const path = ghPath(url);
    if(path){
      if(method==='GET'){
        if(!files.has(path)) return Response.json({message:'Not Found'},{status:404});
        return Response.json({sha:shaFor(path),content:Buffer.from(files.get(path)).toString('base64')});
      }
      if(method==='PUT'){
        const body = JSON.parse(options.body||'{}');
        assert.ok(body.content, `PUT ${path} debe llevar content`);
        files.set(path, Buffer.from(body.content,'base64').toString('utf8'));
        return Response.json({commit:{html_url:`https://example.invalid/commit/${encodeURIComponent(path)}`},content:{sha:shaFor(path)}});
      }
    }
    throw new Error(`GitHub mock no contempla ${method} ${url}`);
  }
  throw new Error(`fetch inesperado: ${url}`);
};

const env = {
  FIREBASE_PROJECT_ID:'demo-project',
  INTEGRATION_ADMIN_UIDS:'admin-uid',
  GITHUB_TOKEN:'test-token',
  GITHUB_OWNER:'owner',
  GITHUB_REPO:'repo',
  GITHUB_BRANCH:'main',
  GITHUB_CONFIG_PATH:'monitoring/config.json'
};
const config = {
  hotel:'Cordial Santa Águeda & Perchel Beach Club',
  checkIn:'2026-09-14',checkOut:'2026-09-21',adults:2,children:0,
  targetRoom:'Classic Duplex',targetRate:'Club Cordial - Reserva Online',targetBoard:'SOLO ALOJAMIENTO',
  searchUrl:'https://www.becordial.com/gran-canaria-sur/cordial-santa-agueda/'
};
async function call(action, extra={}){
  const req = new Request('https://worker.invalid/',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({action,...extra})
  });
  const res = await worker.fetch(req,env);
  const text = await res.text();
  let data; try{data=JSON.parse(text);}catch{data={raw:text};}
  assert.equal(res.status,200, `${action} HTTP ${res.status}: ${text}`);
  assert.equal(data.ok,true, `${action} no devolvió ok=true: ${text}`);
  return data;
}

// 1. Instalación realista con edición de la app bloqueada: el Worker solo necesita auth válida.
const installed = await call('github-cordial-install',{config});
assert.equal(installed.installed,true);
for(const path of ['monitoring/lib.mjs','monitoring/cordial.mjs','monitoring/cordial-run.mjs','.github/workflows/cordial-monitor.yml','monitoring/config.json']){
  assert.ok(files.has(path),`Falta ${path} tras instalar`);
}

// 2. Los archivos que el Worker escribe en GitHub deben ser sintácticamente válidos.
for(const path of ['monitoring/lib.mjs','monitoring/cordial.mjs','monitoring/cordial-run.mjs']){
  const temp = new URL(`../.tmp-${path.split('/').pop()}`,import.meta.url);
  await writeFile(temp,files.get(path));
  const check = spawnSync(process.execPath,['--check',temp.pathname],{encoding:'utf8'});
  await unlink(temp).catch(()=>{});
  assert.equal(check.status,0,`${path} no pasa node --check:\n${check.stderr}`);
}
assert.match(files.get('monitoring/cordial.mjs'),/MFE_CORDIAL_AUTOMATION_VERSION:\s*2\.2\.12/);
assert.match(files.get('monitoring/lib.mjs'),/export async function readTrackerLatest/,'lib.mjs debe exportar readTrackerLatest para Cordial');

// 3. Simular exactamente la regresión anterior: mismo encabezado de versión, cuerpo corrupto.
files.set('monitoring/cordial.mjs',`// MFE_CORDIAL_AUTOMATION_VERSION: 2.2.12\nconst broken = '\\const CORDIAL_FILE = \n`);
const run = await call('github-cordial-run',{config});
assert.equal(run.workflowTriggered,true);
assert.equal(run.automationUpdate?.updated,true,'Comprobar ahora debe reparar un archivo corrupto aunque conserve la versión');
assert.equal(dispatches,1,'Debe lanzar un workflow tras autorreparar');
const repaired = files.get('monitoring/cordial.mjs');
assert.ok(!repaired.includes('\\const CORDIAL_FILE ='),'El archivo corrupto no se reparó');
assert.match(repaired,/MFE_CORDIAL_AUTOMATION_VERSION:\s*2\.2\.12/);
const repairedTemp = new URL('../.tmp-cordial-repaired.mjs',import.meta.url);
await writeFile(repairedTemp,repaired);
const repairedCheck = spawnSync(process.execPath,['--check',repairedTemp.pathname],{encoding:'utf8'});
await unlink(repairedTemp).catch(()=>{});
assert.equal(repairedCheck.status,0,`El Cordial autorreparado no pasa node --check:\n${repairedCheck.stderr}`);

// 4. El estado debe detectar contenido exacto, no solo un número de versión.
const status = await call('github-cordial-status');
assert.equal(status.installed,true);
assert.equal(status.automationVersion,'2.2.12');
assert.equal(status.expectedAutomationVersion,'2.2.12');
assert.deepEqual(status.matches,{cordial:true,runner:true,lib:true,workflow:true});


// 5. La tarifa usada por los resúmenes debe ser Reserva Online / Solo alojamiento,
// incluso si el parser arrastra por error «Cancelación con gastos» desde Prepago.
const {__cordialTest} = await import(new URL('../monitoring/cordial.mjs', import.meta.url));
const sampleRates = [
  {roomType:'Classic Duplex',rateName:'Club Cordial - Oferta Prepago Online',cancellation:'Cancelación con gastos',board:'SOLO ALOJAMIENTO',price:1083.48},
  {roomType:'Classic Duplex',rateName:'Club Cordial - Oferta Prepago Online',cancellation:'Cancelación con gastos',board:'DESAYUNO',price:1275.96},
  {roomType:'Classic Duplex',rateName:'Club Cordial - Reserva Online',cancellation:'Cancelación con gastos',board:'SOLO ALOJAMIENTO',price:1094.40},
  {roomType:'Classic Duplex',rateName:'Club Cordial - Reserva Online',cancellation:'Cancelación con gastos',board:'DESAYUNO',price:1288.80}
];
const normalizedRates=__cordialTest.normalizeCancellationLabels(sampleRates);
const selectedRate=__cordialTest.selectTargetOption(normalizedRates,config);
assert.equal(selectedRate?.price,1094.40,'Debe seleccionar Reserva Online · Solo alojamiento, no Prepago');
assert.equal(selectedRate?.cancellation,'Cancelación sin gastos','Reserva Online debe quedar identificada como cancelación sin gastos');

console.log('OK · Cordial installer, self-heal, tarifa flexible, dispatch y status validados.');
