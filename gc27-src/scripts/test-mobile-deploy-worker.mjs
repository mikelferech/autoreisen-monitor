import assert from 'node:assert/strict';
import {generateKeyPairSync, createSign} from 'node:crypto';

const workerModule=await import(new URL('../CLOUDFLARE_WORKER_v2_2_54.js',import.meta.url));
const worker=workerModule.default;
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const publicJwk=publicKey.export({format:'jwk'});publicJwk.kid='test-kid';publicJwk.alg='RS256';publicJwk.use='sig';
const b64url=value=>Buffer.from(value).toString('base64url');
const now=Math.floor(Date.now()/1000),header=b64url(JSON.stringify({alg:'RS256',typ:'JWT',kid:'test-kid'})),payload=b64url(JSON.stringify({aud:'demo-project',iss:'https://securetoken.google.com/demo-project',sub:'admin-uid',iat:now-10,exp:now+3600}));
const signingInput=`${header}.${payload}`,signer=createSign('RSA-SHA256');signer.update(signingInput);signer.end();const token=`${signingInput}.${signer.sign(privateKey).toString('base64url')}`;

const workflowPath='.github/workflows/mfe-mobile-deploy.yml',releasePath='mobile-release/MFE_Viajes_RELEASE.zip';
const files=new Map([[releasePath,'UEsDBOLDRELEASE']]);
let workflowDispatches=0,lastRequestId='';
function ghPath(url){const u=new URL(url),marker='/contents/',i=u.pathname.indexOf(marker);if(i<0)return null;return u.pathname.slice(i+marker.length).split('/').map(decodeURIComponent).join('/');}

globalThis.fetch=async(input,options={})=>{
  const url=typeof input==='string'?input:input.url,method=String(options.method||'GET').toUpperCase();
  if(url.startsWith('https://www.googleapis.com/service_accounts/v1/jwk/'))return Response.json({keys:[publicJwk]});
  if(!url.startsWith('https://api.github.com/'))throw new Error(`fetch inesperado: ${url}`);
  if(url.includes('/git/ref/heads/main'))return Response.json({object:{sha:'release-commit-202abcdef'}});
  if(url.includes('/actions/workflows/mfe-mobile-deploy.yml/dispatches')){
    assert.equal(method,'POST');const body=JSON.parse(options.body||'{}');assert.equal(body.ref,'main');
    lastRequestId=String(body.inputs?.request_id||'');assert.ok(lastRequestId.startsWith('mfe-'));
    workflowDispatches++;return new Response(null,{status:204});
  }
  if(url.includes('/actions/workflows/mfe-mobile-deploy.yml/runs?')){
    assert.match(url,/event=workflow_dispatch/);
    const runs=lastRequestId?[{id:993,name:'Actualizar MFE Viajes · móvil',display_title:`MFE móvil · ${lastRequestId}`,status:'queued',conclusion:null,event:'workflow_dispatch',head_sha:'branch-head',created_at:new Date().toISOString(),run_started_at:'',updated_at:new Date().toISOString(),html_url:'https://example.invalid/actions/runs/993'}]:[];
    return Response.json({workflow_runs:runs});
  }
  if(url.includes('/actions/runs/993/jobs?'))return Response.json({jobs:[]});
  const path=ghPath(url);
  if(path){
    if(method==='GET'){
      if(!files.has(path))return Response.json({message:'Not Found'},{status:404});
      const value=files.get(path),content=path===releasePath?value:Buffer.from(value).toString('base64');
      return Response.json({sha:`sha-${path.length}`,content,size:path===releasePath?Math.max(1,Math.floor(String(value).length*3/4)):String(value).length});
    }
    if(method==='PUT'){
      const body=JSON.parse(options.body||'{}');
      if(path===releasePath){assert.equal(body.sha,`sha-${path.length}`,'Debe sustituir el RELEASE existente, no crear otro');files.set(path,body.content);return Response.json({commit:{sha:'release-commit-202abcdef',html_url:'https://example.invalid/commit/release'},content:{sha:'zip-sha'}});}
      files.set(path,Buffer.from(body.content,'base64').toString('utf8'));return Response.json({commit:{sha:`commit-${path.length}`,html_url:'https://example.invalid/commit/workflow'},content:{sha:`sha-${path.length}`}});
    }
  }
  throw new Error(`GitHub mock no contempla ${method} ${url}`);
};

const env={FIREBASE_PROJECT_ID:'demo-project',INTEGRATION_ADMIN_UIDS:'admin-uid',GITHUB_TOKEN:'test-token',GITHUB_OWNER:'owner',GITHUB_REPO:'repo',GITHUB_BRANCH:'main'};
const headers={'Content-Type':'application/json','X-Requested-With':'XmlHttpRequest',Authorization:`Bearer ${token}`};
const zipBase64='UEsDBFAKEZIPDATA202';
const uploadReq=new Request('https://worker.invalid/',{method:'POST',headers,body:JSON.stringify({action:'github-mobile-release-upload',releaseName:'MFE_Viajes_2026_v2_2_202_COMPLETA.zip',releaseBase64:zipBase64})});
const uploadRes=await worker.fetch(uploadReq,env),uploadText=await uploadRes.text(),data=JSON.parse(uploadText);
assert.equal(uploadRes.status,200,uploadText);assert.equal(data.ok,true,uploadText);assert.equal(data.uploaded,true);assert.equal(data.workflowTriggered,true);assert.equal(data.triggerMode,'workflow_dispatch');assert.ok(data.requestId.startsWith('mfe-'));assert.equal(workflowDispatches,1);assert.equal(files.get(releasePath),zipBase64);assert.equal(data.commitSha,'release-commit-202abcdef');assert.ok(data.verifiedBytes>0);
assert.ok(files.has(workflowPath));assert.match(files.get(workflowPath),/workflow_dispatch:/);assert.match(files.get(workflowPath),/ref: \${{ github\.ref_name }}/);assert.doesNotMatch(files.get(workflowPath),/repository_dispatch:/);
console.log('OK · ZIP sustituido y workflow_dispatch aceptado con el flujo estable.');

const statusReq=new Request('https://worker.invalid/',{method:'POST',headers,body:JSON.stringify({action:'github-mobile-deploy-run-status',requestId:data.requestId})});
const statusRes=await worker.fetch(statusReq,env),statusText=await statusRes.text(),status=JSON.parse(statusText);assert.equal(status.runFound,true,statusText);assert.equal(String(status.run.id),'993');assert.equal(status.run.event,'workflow_dispatch');
console.log('OK · ejecución localizada por request_id mediante polling posterior.');

const retryReq=new Request('https://worker.invalid/',{method:'POST',headers,body:JSON.stringify({action:'github-mobile-deploy-trigger',requestId:data.requestId})});
const retryRes=await worker.fetch(retryReq,env),retryText=await retryRes.text(),retry=JSON.parse(retryText);assert.equal(retry.workflowTriggered,true,retryText);assert.equal(retry.triggerMode,'workflow_dispatch');assert.equal(workflowDispatches,2);
console.log('OK · reintento workflow_dispatch sin volver a subir ZIP.');
