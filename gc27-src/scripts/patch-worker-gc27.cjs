// Patch repeatible del Worker GC27 desde el ZIP original, sin modificar otras funciones.
const fs=require('node:fs');
const cp=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const file='CLOUDFLARE_WORKER_v2_2_54.js';
const destination=path.join(root,'gc27-src',file);
const zip=path.join(root,'mobile-release/MFE_Viajes_RELEASE.zip');
let code=cp.execFileSync('unzip',['-p',zip,file],{encoding:'utf8',maxBuffer:16*1024*1024});
console.log('WORKER_BASE_LENGTH:',code.length);
const read=name=>fs.readFileSync(path.join(root,'gc27-src',name),'utf8');
const embedded=(name,content)=>'const '+name+' = '+JSON.stringify(content)+';';
function swap(oldText,newText,label=oldText.slice(0,70)){
  if(!code.includes(oldText))throw new Error('No se encontró anclaje: '+label);
  code=code.replace(oldText,()=>newText); // Evita que "
}
function swapLine(prefix,replacement){
  const lines=code.split('\n'),at=lines.findIndex(x=>x.startsWith(prefix));
  if(at<0)throw new Error('No se encontró linea '+prefix);
  lines[at]=replacement;code=lines.join('\n');
}
swap('const WORKER_VERSION = "2.2.54";','const WORKER_VERSION = "2.2.55";');
swap('const POOLS_AUTOMATION_VERSION = "1.0.4";','const POOLS_AUTOMATION_VERSION = "1.0.5";');
swapLine('const DUNAS_FILE = ',embedded('DUNAS_FILE',read('monitoring/dunas.mjs')));
swapLine('const POOLS_FILE = ',embedded('POOLS_FILE',read('monitoring/pools.mjs')));
const binter=[
 embedded('BINTER_STAGE2_RUN_FILE',read('monitoring/binter-stage2-run.mjs')),
 embedded('BINTER_STAGE2_WORKFLOW_TEMPLATE',read('.github/workflows/binter-stage2.yml'))
].join('\n')+'\n';
swap('const AUTOREISEN_INSTALL_FILES = {',binter+'const AUTOREISEN_INSTALL_FILES = {');
swap('payload.action === "autoreisen-stage2" || payload.action === "dunas"',
     'payload.action === "autoreisen-stage2" || payload.action === "dunas" || payload.action === "binter-stage2"');
swap('["autoreisen","cordial","pools","autoreisen-stage2","dunas"]',
     '["autoreisen","cordial","pools","autoreisen-stage2","dunas","binter-stage2"]');
swap("if(['autoreisen-stage2','dunas'].includes(type))", "if(['autoreisen-stage2','dunas','binter-stage2'].includes(type))");
swap("const STAGE_WORKFLOWS={car:'autoreisen-stage2.yml',hotel:'dunas-monitor.yml'};",
     "const STAGE_WORKFLOWS={car:'autoreisen-stage2.yml',hotel:'dunas-monitor.yml',binter:'binter-stage2.yml'};");
swap('function stageMonitorConfig(kind,config={}){',[
 'function stageMonitorConfig(kind,config={}){',
 "  if(kind==='binter'){",
 "    const date=String(config.date||'');",
 "    if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date))throw new ApiError(400,'Fecha de Binter inválida.');",
 "    return {enabled:true,date,origin:'LPA',destination:'FUE',adults:Math.max(1,Math.min(9,Number(config.adults)||5)),resident:config.resident===true,reservedPrice:Math.max(0,Number(config.reservedPrice)||0),searchUrl:'https://www.bintercanarias.com/es/buscar-vuelos'};",
 '  }'
].join('\n'));
swap("const files=kind==='car'?{\n    'monitoring/autoreisen-stage2-run.mjs':AUTOREISEN_STAGE2_RUN_FILE,\n    '.github/workflows/autoreisen-stage2.yml':AUTOREISEN_STAGE2_WORKFLOW_TEMPLATE\n  }:{",
"const files=kind==='car'?{\n    'monitoring/autoreisen-stage2-run.mjs':AUTOREISEN_STAGE2_RUN_FILE,\n    '.github/workflows/autoreisen-stage2.yml':AUTOREISEN_STAGE2_WORKFLOW_TEMPLATE\n  }:kind==='binter'?{\n    'monitoring/binter-stage2-run.mjs':BINTER_STAGE2_RUN_FILE,\n    '.github/workflows/binter-stage2.yml':BINTER_STAGE2_WORKFLOW_TEMPLATE\n  }:{");
const configOld="const key=kind==='car'?'autoreisenStage2':'dunas',doc=await readStageMonitorConfigDocument(target,env),current=doc[key]||{};\n  if(JSON.stringify(current)!==JSON.stringify(cleaned)){\n    doc[key]=cleaned;\n    written.push(await upsertGithubFile(target,target.path,JSON.stringify(doc,null,2)+'\\n',env,\`MFE Viajes · Configurar \${key} en Fuerteventura\`));\n  }";
const configNew="const key=kind==='car'?'autoreisenStage2':kind==='binter'?'binterStage2':'dunas';\n  const update=await updateGithubConfigKey(target,key,cleaned,env,'MFE Viajes · Configurar '+key+' en Fuerteventura');\n  if(update)written.push(update);";
swap(configOld,configNew);
const atomic=[
'async function updateGithubConfigKey(target,key,configuration,env,message){',
"  const encoded=target.path.split('/').map(encodeURIComponent).join('/');",
"  const base='https://api.github.com/repos/'+encodeURIComponent(target.owner)+'/'+encodeURIComponent(target.repo)+'/contents/'+encoded;",
'  for(let attempt=0;attempt<7;attempt++){',
"    const get=await githubRequestRaw(base+'?ref='+encodeURIComponent(target.branch)+'&nonce='+Date.now(),{method:'GET',cache:'no-store'},env);",
'    if(!get.ok)throw githubApiError(get,await get.json().catch(()=>({})));',
'    const current=await get.json();',
"    let document;try{document=JSON.parse(decodeGithubContent(current.content));if(!document||typeof document!=='object'||Array.isArray(document))throw Error();}catch{throw new ApiError(500,'GitHub config.json no válido; no se sobrescribe.');}",
'    const merged={...(document[key]||{}),...configuration};',
'    if(JSON.stringify(document[key])===JSON.stringify(merged))return null;',
'    document[key]=merged;',
"    const body={message,content:encodeGithubContent(JSON.stringify(document,null,2)+'\\n'),sha:current.sha,branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}};",
"    const put=await githubRequestRaw(base,{method:'PUT',cache:'no-store',body:JSON.stringify(body)},env);",
"    if(put.ok){const result=await put.json();return {path:target.path,created:false,commitUrl:result?.commit?.html_url||''};}",
"    const details=await put.json().catch(()=>({}));",
"    if([409,422].includes(put.status)&&/sha|expected|conflict|already exists|was modified|not match/i.test(String(details.message||''))){await new Promise(resolve=>setTimeout(resolve,170*(attempt+1)));continue;}",
'    throw githubApiError(put,details);',
'  }',
"  throw new ApiError(409,'GitHub mantiene cambios simultáneos. No se ha perdido ningún dato; vuelve a intentar.');",
'}'
].join('\n');
swap('async function syncStageMonitorToGitHub(request,env,payload){',atomic+'\nasync function syncStageMonitorToGitHub(request,env,payload){');
const upsert=[
'async function upsertGithubFile(target,path,content,env,message){',
"  const encoded=String(path).split('/').map(encodeURIComponent).join('/');",
"  const base='https://api.github.com/repos/'+encodeURIComponent(target.owner)+'/'+encodeURIComponent(target.repo)+'/contents/'+encoded;",
'  for(let attempt=0;attempt<7;attempt++){',
"    const get=await githubRequestRaw(base+'?ref='+encodeURIComponent(target.branch)+'&nonce='+Date.now(),{method:'GET',cache:'no-store'},env);",
"    let sha='';if(get.ok){sha=(await get.json()).sha||'';}else if(get.status!==404)throw githubApiError(get,await get.json().catch(()=>({})));",
"    const body={message,content:encodeGithubContent(content.endsWith('\\n')?content:content+'\\n'),branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}};",
'    if(sha)body.sha=sha;',
"    const put=await githubRequestRaw(base,{method:'PUT',cache:'no-store',body:JSON.stringify(body)},env);",
"    if(put.ok){const result=await put.json();return {path,created:!sha,commitUrl:result?.commit?.html_url||''};}",
"    const details=await put.json().catch(()=>({}));",
"    if([409,422].includes(put.status)&&/sha|expected|conflict|already exists|was modified|not match/i.test(String(details.message||''))){await new Promise(resolve=>setTimeout(resolve,170*(attempt+1)));continue;}",
'    throw githubApiError(put,details);',
'  }',
"  throw new ApiError(409,'GitHub mantiene cambios simultáneos; se ha evitado sobrescribir.');",
'}',
''
].join('\n');
const begin=code.indexOf('async function upsertGithubFile(target,path,content,env,message){');
const finish=code.indexOf('async function upsertGithubBase64File(',begin);
if(begin<0||finish<0)throw new Error('Anclajes de escritura GitHub inexistentes.');
code=code.slice(0,begin)+upsert+code.slice(finish);
const syncStart=code.indexOf('async function syncAutoreisenToGitHub(request,env,payload){');
const putStart=code.indexOf('  const contentUrl=',syncStart),putEnd=code.indexOf('  let workflowTriggered=false;',putStart);
if(syncStart<0||putStart<0||putEnd<0)throw new Error('Anclajes de sincronización AutoReisen inexistentes.');
code=code.slice(0,putStart)+
 "  const update=await updateGithubConfigKey(target,'autoreisen',config,env,'Sincronizar AutoReisen desde MFE Viajes');\n"+
 code.slice(putEnd);
swap("commitUrl:update?.commit?.html_url||''","commitUrl:update?.commitUrl||''");
const pre="  if(result.status!==\"error\" && result.ok!==false){result.ok=true;result.status=\"ok\";}";
const post=[
"  if(result.status==='unavailable'&&result.ok!==false){",
"    result.ok=true;const kv=requireTrackerKv(env);",
"    await kv.put('tracker:'+type+':last-unavailable',JSON.stringify(result),{expirationTtl:60*60*24*45});",
"    await kv.delete('tracker:'+type+':last-error');",
"    return json({ok:true,type,unavailable:true,storedAt:result.receivedAt});",
"  }",
pre].join('\n');
swap(pre,post);
swap("const raw=await kv.get(\`tracker:\${type}:latest\`);const errorRaw=await kv.get(\`tracker:\${type}:last-error\`);",
"const raw=await kv.get(\`tracker:\${type}:latest\`);const errorRaw=await kv.get(\`tracker:\${type}:last-error\`);const unavailableRaw=await kv.get(\`tracker:\${type}:last-unavailable\`);");
swap("let lastError=null;if(errorRaw){try{lastError=JSON.parse(errorRaw);}catch{}}",
"let lastError=null;if(errorRaw){try{lastError=JSON.parse(errorRaw);}catch{}} let lastUnavailable=null;if(unavailableRaw){try{lastUnavailable=JSON.parse(unavailableRaw);}catch{}}");
swap("return json({ok:true,result:null,lastError,pending:!lastError});",
"return json({ok:true,result:null,lastError,lastUnavailable,pending:!lastError&&!lastUnavailable});");
swap("return json({ok:true,result,lastError,message:lastError?",
"return json({ok:true,result,lastError,lastUnavailable,message:lastError?");
fs.writeFileSync(destination,code,'utf8');
console.log('Worker GC27 parcheado:',code.length,'caracteres; Binter, reintentos SHA, Dunas y piscinas');
const line=code.split('\n').find(x=>x.startsWith('const BINTER_STAGE2_RUN_FILE = '));console.log('BINTER_LINE_LENGTH:',line?.length,'END:',JSON.stringify(line?.slice(-120)));
" en scripts incrustados inserte el resto del Worker
}
function swapLine(prefix,replacement){
  const lines=code.split('\n'),at=lines.findIndex(x=>x.startsWith(prefix));
  if(at<0)throw new Error('No se encontró linea '+prefix);
  lines[at]=replacement;code=lines.join('\n');
}
swap('const WORKER_VERSION = "2.2.54";','const WORKER_VERSION = "2.2.55";');
swap('const POOLS_AUTOMATION_VERSION = "1.0.4";','const POOLS_AUTOMATION_VERSION = "1.0.5";');
swapLine('const DUNAS_FILE = ',embedded('DUNAS_FILE',read('monitoring/dunas.mjs')));
swapLine('const POOLS_FILE = ',embedded('POOLS_FILE',read('monitoring/pools.mjs')));
const binter=[
 embedded('BINTER_STAGE2_RUN_FILE',read('monitoring/binter-stage2-run.mjs')),
 embedded('BINTER_STAGE2_WORKFLOW_TEMPLATE',read('.github/workflows/binter-stage2.yml'))
].join('\n')+'\n';
swap('const AUTOREISEN_INSTALL_FILES = {',binter+'const AUTOREISEN_INSTALL_FILES = {');
swap('payload.action === "autoreisen-stage2" || payload.action === "dunas"',
     'payload.action === "autoreisen-stage2" || payload.action === "dunas" || payload.action === "binter-stage2"');
swap('["autoreisen","cordial","pools","autoreisen-stage2","dunas"]',
     '["autoreisen","cordial","pools","autoreisen-stage2","dunas","binter-stage2"]');
swap("if(['autoreisen-stage2','dunas'].includes(type))", "if(['autoreisen-stage2','dunas','binter-stage2'].includes(type))");
swap("const STAGE_WORKFLOWS={car:'autoreisen-stage2.yml',hotel:'dunas-monitor.yml'};",
     "const STAGE_WORKFLOWS={car:'autoreisen-stage2.yml',hotel:'dunas-monitor.yml',binter:'binter-stage2.yml'};");
swap('function stageMonitorConfig(kind,config={}){',[
 'function stageMonitorConfig(kind,config={}){',
 "  if(kind==='binter'){",
 "    const date=String(config.date||'');",
 "    if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date))throw new ApiError(400,'Fecha de Binter inválida.');",
 "    return {enabled:true,date,origin:'LPA',destination:'FUE',adults:Math.max(1,Math.min(9,Number(config.adults)||5)),resident:config.resident===true,reservedPrice:Math.max(0,Number(config.reservedPrice)||0),searchUrl:'https://www.bintercanarias.com/es/buscar-vuelos'};",
 '  }'
].join('\n'));
swap("const files=kind==='car'?{\n    'monitoring/autoreisen-stage2-run.mjs':AUTOREISEN_STAGE2_RUN_FILE,\n    '.github/workflows/autoreisen-stage2.yml':AUTOREISEN_STAGE2_WORKFLOW_TEMPLATE\n  }:{",
"const files=kind==='car'?{\n    'monitoring/autoreisen-stage2-run.mjs':AUTOREISEN_STAGE2_RUN_FILE,\n    '.github/workflows/autoreisen-stage2.yml':AUTOREISEN_STAGE2_WORKFLOW_TEMPLATE\n  }:kind==='binter'?{\n    'monitoring/binter-stage2-run.mjs':BINTER_STAGE2_RUN_FILE,\n    '.github/workflows/binter-stage2.yml':BINTER_STAGE2_WORKFLOW_TEMPLATE\n  }:{");
const configOld="const key=kind==='car'?'autoreisenStage2':'dunas',doc=await readStageMonitorConfigDocument(target,env),current=doc[key]||{};\n  if(JSON.stringify(current)!==JSON.stringify(cleaned)){\n    doc[key]=cleaned;\n    written.push(await upsertGithubFile(target,target.path,JSON.stringify(doc,null,2)+'\\n',env,\`MFE Viajes · Configurar \${key} en Fuerteventura\`));\n  }";
const configNew="const key=kind==='car'?'autoreisenStage2':kind==='binter'?'binterStage2':'dunas';\n  const update=await updateGithubConfigKey(target,key,cleaned,env,'MFE Viajes · Configurar '+key+' en Fuerteventura');\n  if(update)written.push(update);";
swap(configOld,configNew);
const atomic=[
'async function updateGithubConfigKey(target,key,configuration,env,message){',
"  const encoded=target.path.split('/').map(encodeURIComponent).join('/');",
"  const base='https://api.github.com/repos/'+encodeURIComponent(target.owner)+'/'+encodeURIComponent(target.repo)+'/contents/'+encoded;",
'  for(let attempt=0;attempt<7;attempt++){',
"    const get=await githubRequestRaw(base+'?ref='+encodeURIComponent(target.branch)+'&nonce='+Date.now(),{method:'GET',cache:'no-store'},env);",
'    if(!get.ok)throw githubApiError(get,await get.json().catch(()=>({})));',
'    const current=await get.json();',
"    let document;try{document=JSON.parse(decodeGithubContent(current.content));if(!document||typeof document!=='object'||Array.isArray(document))throw Error();}catch{throw new ApiError(500,'GitHub config.json no válido; no se sobrescribe.');}",
'    const merged={...(document[key]||{}),...configuration};',
'    if(JSON.stringify(document[key])===JSON.stringify(merged))return null;',
'    document[key]=merged;',
"    const body={message,content:encodeGithubContent(JSON.stringify(document,null,2)+'\\n'),sha:current.sha,branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}};",
"    const put=await githubRequestRaw(base,{method:'PUT',cache:'no-store',body:JSON.stringify(body)},env);",
"    if(put.ok){const result=await put.json();return {path:target.path,created:false,commitUrl:result?.commit?.html_url||''};}",
"    const details=await put.json().catch(()=>({}));",
"    if([409,422].includes(put.status)&&/sha|expected|conflict|already exists|was modified|not match/i.test(String(details.message||''))){await new Promise(resolve=>setTimeout(resolve,170*(attempt+1)));continue;}",
'    throw githubApiError(put,details);',
'  }',
"  throw new ApiError(409,'GitHub mantiene cambios simultáneos. No se ha perdido ningún dato; vuelve a intentar.');",
'}'
].join('\n');
swap('async function syncStageMonitorToGitHub(request,env,payload){',atomic+'\nasync function syncStageMonitorToGitHub(request,env,payload){');
const upsert=[
'async function upsertGithubFile(target,path,content,env,message){',
"  const encoded=String(path).split('/').map(encodeURIComponent).join('/');",
"  const base='https://api.github.com/repos/'+encodeURIComponent(target.owner)+'/'+encodeURIComponent(target.repo)+'/contents/'+encoded;",
'  for(let attempt=0;attempt<7;attempt++){',
"    const get=await githubRequestRaw(base+'?ref='+encodeURIComponent(target.branch)+'&nonce='+Date.now(),{method:'GET',cache:'no-store'},env);",
"    let sha='';if(get.ok){sha=(await get.json()).sha||'';}else if(get.status!==404)throw githubApiError(get,await get.json().catch(()=>({})));",
"    const body={message,content:encodeGithubContent(content.endsWith('\\n')?content:content+'\\n'),branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}};",
'    if(sha)body.sha=sha;',
"    const put=await githubRequestRaw(base,{method:'PUT',cache:'no-store',body:JSON.stringify(body)},env);",
"    if(put.ok){const result=await put.json();return {path,created:!sha,commitUrl:result?.commit?.html_url||''};}",
"    const details=await put.json().catch(()=>({}));",
"    if([409,422].includes(put.status)&&/sha|expected|conflict|already exists|was modified|not match/i.test(String(details.message||''))){await new Promise(resolve=>setTimeout(resolve,170*(attempt+1)));continue;}",
'    throw githubApiError(put,details);',
'  }',
"  throw new ApiError(409,'GitHub mantiene cambios simultáneos; se ha evitado sobrescribir.');",
'}',
''
].join('\n');
const begin=code.indexOf('async function upsertGithubFile(target,path,content,env,message){');
const finish=code.indexOf('async function upsertGithubBase64File(',begin);
if(begin<0||finish<0)throw new Error('Anclajes de escritura GitHub inexistentes.');
code=code.slice(0,begin)+upsert+code.slice(finish);
const syncStart=code.indexOf('async function syncAutoreisenToGitHub(request,env,payload){');
const putStart=code.indexOf('  const contentUrl=',syncStart),putEnd=code.indexOf('  let workflowTriggered=false;',putStart);
if(syncStart<0||putStart<0||putEnd<0)throw new Error('Anclajes de sincronización AutoReisen inexistentes.');
code=code.slice(0,putStart)+
 "  const update=await updateGithubConfigKey(target,'autoreisen',config,env,'Sincronizar AutoReisen desde MFE Viajes');\n"+
 code.slice(putEnd);
swap("commitUrl:update?.commit?.html_url||''","commitUrl:update?.commitUrl||''");
const pre="  if(result.status!==\"error\" && result.ok!==false){result.ok=true;result.status=\"ok\";}";
const post=[
"  if(result.status==='unavailable'&&result.ok!==false){",
"    result.ok=true;const kv=requireTrackerKv(env);",
"    await kv.put('tracker:'+type+':last-unavailable',JSON.stringify(result),{expirationTtl:60*60*24*45});",
"    await kv.delete('tracker:'+type+':last-error');",
"    return json({ok:true,type,unavailable:true,storedAt:result.receivedAt});",
"  }",
pre].join('\n');
swap(pre,post);
swap("const raw=await kv.get(\`tracker:\${type}:latest\`);const errorRaw=await kv.get(\`tracker:\${type}:last-error\`);",
"const raw=await kv.get(\`tracker:\${type}:latest\`);const errorRaw=await kv.get(\`tracker:\${type}:last-error\`);const unavailableRaw=await kv.get(\`tracker:\${type}:last-unavailable\`);");
swap("let lastError=null;if(errorRaw){try{lastError=JSON.parse(errorRaw);}catch{}}",
"let lastError=null;if(errorRaw){try{lastError=JSON.parse(errorRaw);}catch{}} let lastUnavailable=null;if(unavailableRaw){try{lastUnavailable=JSON.parse(unavailableRaw);}catch{}}");
swap("return json({ok:true,result:null,lastError,pending:!lastError});",
"return json({ok:true,result:null,lastError,lastUnavailable,pending:!lastError&&!lastUnavailable});");
swap("return json({ok:true,result,lastError,message:lastError?",
"return json({ok:true,result,lastError,lastUnavailable,message:lastError?");
fs.writeFileSync(destination,code,'utf8');
console.log('Worker GC27 parcheado:',code.length,'caracteres; Binter, reintentos SHA, Dunas y piscinas');
const line=code.split('\n').find(x=>x.startsWith('const BINTER_STAGE2_RUN_FILE = '));console.log('BINTER_LINE_LENGTH:',line?.length,'END:',JSON.stringify(line?.slice(-120)));
