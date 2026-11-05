import assert from 'node:assert/strict';
import {generateKeyPairSync, createSign} from 'node:crypto';
import {writeFile, unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';

const workerModule = await import(new URL('../CLOUDFLARE_WORKER_v2_2_54.js', import.meta.url));
const worker = workerModule.default;
const arModule = await import(new URL('../monitoring/autoreisen.mjs', import.meta.url));
const {sameVehicle,enrichFleetImage,fleetFromLines,filterFleetForTracking,bestFleetVehicle,fleetResultPageLooksValid,AUTOREISEN_VERIFY_RE}=arModule.__autoreisenTest;
assert.equal(AUTOREISEN_VERIFY_RE.test('Espere mientras se verifica su solicitud…'),true);
assert.equal(AUTOREISEN_VERIFY_RE.test('Un momento…'),true);

assert.equal(sameVehicle({group:'E',model:'Seat Arona TSI Reference o similar'},{group:'E',model:'Seat Arona o similar'}),true);
assert.equal(sameVehicle({group:'G',model:'Citröen C3 Aircross Family'},{group:'E',model:'Seat Arona o similar'}),false);
const enriched=enrichFleetImage([{group:'E',model:'Seat Arona TSI Reference',carId:'119'},{group:'G',model:'C3 Aircross'}],{group:'E',model:'Seat Arona o similar'},'https://www.autoreisen.com/images/cars/arona.jpg');
assert.equal(enriched[0].imageUrl,'https://www.autoreisen.com/images/cars/arona.jpg');
assert.equal(enriched[1].imageUrl,undefined);
const fleetPricing=fleetFromLines(['A - Citröen C3 5P A/C 21,50 € / día','172,00 € Reservar','C - Seat Ibiza 5P A/C 25,00 € / día','200,00 € Reservar'],{pickupAt:'2026-10-01T09:00',dropoffAt:'2026-10-08T09:00'});
assert.equal(fleetPricing[0].pricePerDay,21.5);assert.equal(fleetPricing[0].total,172);assert.equal(fleetPricing[1].total,200);
assert.equal(filterFleetForTracking(fleetPricing,{fleetTrackAll:false,fleetTrackGroups:['C']}).length,1);
assert.equal(bestFleetVehicle(fleetPricing,{group:'C',model:'Seat Ibiza o similar'}).group,'C');
assert.equal(fleetResultPageLooksValid('Mostrando precios para la búsqueda',{pickupAt:'2026-10-14T09:00',dropoffAt:'2026-10-21T15:00'},{submitted:true}),true);

const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const publicJwk = publicKey.export({format:'jwk'});publicJwk.kid='test-kid';publicJwk.alg='RS256';publicJwk.use='sig';
const b64url = value => Buffer.from(value).toString('base64url');
const now=Math.floor(Date.now()/1000);
const header=b64url(JSON.stringify({alg:'RS256',typ:'JWT',kid:'test-kid'}));
const payload=b64url(JSON.stringify({aud:'demo-project',iss:'https://securetoken.google.com/demo-project',sub:'admin-uid',email:'admin@example.com',iat:now-10,exp:now+3600}));
const signingInput=`${header}.${payload}`;const signer=createSign('RSA-SHA256');signer.update(signingInput);signer.end();const token=`${signingInput}.${signer.sign(privateKey).toString('base64url')}`;

const files=new Map();let dispatches=0;
const shaFor = path => `sha-${Buffer.from(path).toString('hex').slice(0,18)}`;
function ghPath(url){const u=new URL(url),marker='/contents/',i=u.pathname.indexOf(marker);if(i<0)return null;return u.pathname.slice(i+marker.length).split('/').map(decodeURIComponent).join('/');}

globalThis.fetch=async(input,options={})=>{
  const url=typeof input==='string'?input:input.url;
  if(url.startsWith('https://www.googleapis.com/service_accounts/v1/jwk/'))return Response.json({keys:[publicJwk]});
  if(url.startsWith('https://api.github.com/')){
    const method=String(options.method||'GET').toUpperCase();
    if(url.includes('/actions/secrets?')) return Response.json({secrets:[]});
    if(url.includes('/actions/workflows/')&&url.endsWith('/dispatches')){assert.equal(method,'POST');dispatches++;return new Response(null,{status:204});}
    const path=ghPath(url);
    if(path){
      if(method==='GET'){
        if(!files.has(path))return Response.json({message:'Not Found'},{status:404});
        return Response.json({sha:shaFor(path),content:Buffer.from(files.get(path)).toString('base64')});
      }
      if(method==='PUT'){
        const body=JSON.parse(options.body||'{}');assert.ok(body.content,`PUT ${path} sin content`);files.set(path,Buffer.from(body.content,'base64').toString('utf8'));
        return Response.json({commit:{html_url:`https://example.invalid/commit/${encodeURIComponent(path)}`},content:{sha:shaFor(path)}});
      }
    }
    throw new Error(`GitHub mock no contempla ${method} ${url}`);
  }
  throw new Error(`fetch inesperado: ${url}`);
};

const env={FIREBASE_PROJECT_ID:'demo-project',INTEGRATION_ADMIN_UIDS:'admin-uid',GITHUB_TOKEN:'test-token',GITHUB_OWNER:'owner',GITHUB_REPO:'repo',GITHUB_BRANCH:'main',GITHUB_CONFIG_PATH:'monitoring/config.json',GITHUB_WORKFLOW_FILE:'autoreisen-monitor.yml'};
const config={pickup:'Gran Canaria - Aeropuerto',dropoff:'Gran Canaria - Aeropuerto',pickupOfficeId:'18',dropoffOfficeId:'18',pickupAt:'2026-09-14T09:00',dropoffAt:'2026-09-21T15:00',group:'E',model:'Seat Arona o similar',carId:'119',reservedPrice:137.03,searchUrl:'https://www.autoreisen.com/alquiler-coches/alquiler-de-coches.php'};
async function call(action,extra={}){const req=new Request('https://worker.invalid/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({action,...extra})});const res=await worker.fetch(req,env);const text=await res.text();let data;try{data=JSON.parse(text);}catch{data={raw:text};}assert.equal(res.status,200,`${action} HTTP ${res.status}: ${text}`);assert.equal(data.ok,true,`${action} no ok: ${text}`);return data;}

// Instalar y verificar todos los archivos canónicos.
const installed=await call('github-autoreisen-install',{config});assert.equal(installed.installed,true);assert.equal(installed.automationVersion,'2.2.23');
for(const path of ['monitoring/lib.mjs','monitoring/monitor.mjs','monitoring/autoreisen.mjs','monitoring/package.json','.github/workflows/autoreisen-monitor.yml','monitoring/config.json'])assert.ok(files.has(path),`Falta ${path}`);
for(const path of ['monitoring/lib.mjs','monitoring/monitor.mjs','monitoring/autoreisen.mjs']){const temp=new URL(`../.tmp-${path.split('/').pop()}`,import.meta.url);await writeFile(temp,files.get(path));const check=spawnSync(process.execPath,['--check',temp.pathname],{encoding:'utf8'});await unlink(temp).catch(()=>{});assert.equal(check.status,0,`${path} no pasa node --check:\n${check.stderr}`);}
assert.match(files.get('monitoring/autoreisen.mjs'),/MFE_AUTOREISEN_AUTOMATION_VERSION:\s*2\.2\.23/);
assert.match(files.get('monitoring/autoreisen.mjs'),/selectedVehicleImage/);
assert.match(files.get('monitoring/autoreisen.mjs'),/prepareAutoReisenContext/);
assert.match(files.get('monitoring/autoreisen.mjs'),/webdriver/);
assert.match(files.get('monitoring/monitor.mjs'),/disable-blink-features=AutomationControlled/);

// Misma versión, contenido corrupto: Comprobar ahora debe reparar ANTES del dispatch.
files.set('monitoring/autoreisen.mjs',`// MFE_AUTOREISEN_AUTOMATION_VERSION: 2.2.19\nconst broken = true;\n`);
const run=await call('github-autoreisen-run',{config,force:true,mode:'monitor'});
assert.equal(run.workflowTriggered,true);assert.equal(run.automationUpdate?.updated,true);assert.equal(dispatches,1);
assert.match(files.get('.github/workflows/autoreisen-monitor.yml'),/runs-on: ubuntu-24\.04/,'El instalador no debe restaurar ubuntu-latest');
const repaired=files.get('monitoring/autoreisen.mjs');assert.match(repaired,/selectedVehicleImage/);assert.doesNotMatch(repaired,/const broken = true/);
const temp=new URL('../.tmp-autoreisen-repaired.mjs',import.meta.url);await writeFile(temp,repaired);const check=spawnSync(process.execPath,['--check',temp.pathname],{encoding:'utf8'});await unlink(temp).catch(()=>{});assert.equal(check.status,0,`AutoReisen reparado no pasa node --check:\n${check.stderr}`);

const status=await call('github-autoreisen-status');assert.equal(status.installed,true);assert.equal(status.automationVersion,'2.2.23');assert.equal(status.expectedAutomationVersion,'2.2.23');assert.ok(Object.values(status.matches).every(Boolean));

// Etapa 2: los dos seguimientos deben instalarse sin reemplazar AutoReisen etapa 1.
const secondCar={...config,pickup:'Fuerteventura (FUE)',dropoff:'Fuerteventura (FUE)',pickupOfficeId:'19',dropoffOfficeId:'19',pickupAt:'2027-06-13T12:00',dropoffAt:'2027-06-20T12:00',model:'Seat Arona',group:'E'};
const syncStageCar=await call('github-stage-monitor-sync',{kind:'car',config:secondCar});
assert.equal(syncStageCar.synced,true);assert.equal(syncStageCar.workflow,'autoreisen-stage2.yml');
assert.match(files.get('.github/workflows/autoreisen-stage2.yml'),/ubuntu-24\.04/);
assert.ok(files.has('monitoring/autoreisen-stage2-run.mjs'));
const configAfterCar=JSON.parse(files.get('monitoring/config.json'));assert.equal(configAfterCar.autoreisen.pickupOfficeId,'18');assert.equal(configAfterCar.autoreisenStage2.pickupOfficeId,'19');
const syncDunas=await call('github-stage-monitor-sync',{kind:'hotel',config:{checkIn:'2027-06-13',checkOut:'2027-06-20',adults:5,rooms:3,targetRoom:'Cualquier habitación',targetBoard:'Solo alojamiento'}});
assert.equal(syncDunas.synced,true);assert.equal(syncDunas.workflow,'dunas-monitor.yml');
assert.ok(files.has('monitoring/dunas.mjs'));assert.ok(files.has('monitoring/dunas-run.mjs'));
assert.match(files.get('.github/workflows/dunas-monitor.yml'),/ubuntu-24\.04/);
const cfg=JSON.parse(files.get('monitoring/config.json'));assert.equal(cfg.autoreisenStage2.pickupOfficeId,'19');assert.equal(cfg.dunas.adults,5);assert.equal(cfg.dunas.rooms,3);
const runSecond=await call('github-stage-monitor-run',{kind:'car'});assert.equal(runSecond.workflowTriggered,true);
const runHotel=await call('github-stage-monitor-run',{kind:'hotel'});assert.equal(runHotel.workflowTriggered,true);
console.log('OK · AutoReisen imagen, installer, self-heal, dispatch y status validados.');
