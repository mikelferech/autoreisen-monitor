// MFE_POOLS_AUTOMATION_VERSION: 1.0.0
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { postResult, snapshot, isoNow } from './lib.mjs';

const SOURCE_URL='https://cordial.galileus.es/gweb/siloe/diario/?token=NUEraFBKcnlEYzdUVVRobnRPMHc5Zz09';
const ARTIFACTS=path.resolve('artifacts/pools');
const clean=v=>String(v??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const metricPattern=/(temperatura|temperature|temp\.?\b|ph\b|cloro|chlorine|bromo|bromine|turbidez|turbidity|conductividad|conductivity|alcalinidad|alkalinity|redox|orp|salinidad|salinity)/i;
const measurementPattern=/(last measurement|ultima medici[oó]n|última medición|1st measurement|2nd measurement|1ª medici[oó]n|2ª medici[oó]n|primera medici[oó]n|segunda medici[oó]n)/i;
const placeholderPattern=/^(select|selecciona|seleccionar|choose|--+|piscina|pool)$/i;

function safeMetricValue(v){
  const value=clean(v);
  if(!value||/^[-–—]+$/.test(value))return '';
  return value;
}
function looksLikeMetricLabel(v){return metricPattern.test(clean(v));}
function metricClass(label=''){
  const n=norm(label);
  if(/temperatura|temperature|temp\b/.test(n))return 'temperature';
  if(/\bph\b/.test(n))return 'ph';
  if(/cloro|chlorine/.test(n))return 'chlorine';
  if(/bromo|bromine/.test(n))return 'bromine';
  return 'other';
}
function temperatureFromMetrics(metrics=[]){
  for(const m of metrics){
    if(metricClass(m.label)!=='temperature')continue;
    const hit=String(m.value||'').replace(',','.').match(/-?\d+(?:\.\d+)?/);
    const n=hit?Number(hit[0]):NaN;
    if(Number.isFinite(n)&&n>-5&&n<60)return n;
  }
  return null;
}
function makeMeasurementsFromMatrix(rows=[]){
  const cleanRows=rows.map(r=>r.map(clean).filter((v,i,a)=>i===0||v!==''||a.length>1)).filter(r=>r.some(Boolean));
  const metricRows=cleanRows.filter(r=>looksLikeMetricLabel(r[0]||''));
  if(!metricRows.length)return [];
  let headers=[];
  for(const row of cleanRows){
    if(row.some(cell=>measurementPattern.test(cell))){headers=row;break;}
  }
  const maxCols=Math.max(...metricRows.map(r=>Math.max(0,r.length-1)),1);
  const out=[];
  for(let col=0;col<maxCols;col++){
    const metrics=[];
    for(const row of metricRows){
      const value=safeMetricValue(row[col+1]);
      if(value)metrics.push({label:clean(row[0]),value});
    }
    if(!metrics.length)continue;
    const label=clean(headers[col+1])||['Última medición','1.ª medición','2.ª medición'][col]||`Medición ${col+1}`;
    out.push({measurement:label,date:'',time:'',metrics,temperature:temperatureFromMetrics(metrics)});
  }
  return out;
}
function makeMeasurementsFromLines(lines=[]){
  const rows=lines.map(clean).filter(Boolean);
  const metricIndices=[];
  for(let i=0;i<rows.length;i++)if(looksLikeMetricLabel(rows[i]))metricIndices.push(i);
  if(!metricIndices.length)return [];
  const found=[];
  let maxValues=0;
  for(const idx of metricIndices){
    const label=rows[idx];const values=[];
    for(let j=idx+1;j<Math.min(rows.length,idx+8);j++){
      if(looksLikeMetricLabel(rows[j]))break;
      if(measurementPattern.test(rows[j]))continue;
      const value=safeMetricValue(rows[j]);
      if(!value)continue;
      if(/^(pool measurements|mediciones|go back|volver)$/i.test(value))continue;
      if(/^-?\d+(?:[.,]\d+)?(?:\s*°?c|\s*ppm|\s*mg\/l|\s*ntu|\s*µs\/cm)?$/i.test(value)||/\b\d{1,2}:\d{2}\b/.test(value)||/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/.test(value))values.push(value);
      if(values.length>=3)break;
    }
    if(values.length){found.push({label,values});maxValues=Math.max(maxValues,values.length);}
  }
  const measurements=[];
  for(let col=0;col<maxValues;col++){
    const metrics=[];
    for(const row of found){const value=safeMetricValue(row.values[col]);if(value)metrics.push({label:row.label,value});}
    if(metrics.length)measurements.push({measurement:['Última medición','1.ª medición','2.ª medición'][col]||`Medición ${col+1}`,date:'',time:'',metrics,temperature:temperatureFromMetrics(metrics)});
  }
  return measurements;
}
async function extractPool(page,poolName='Piscina'){
  const tables=await page.locator('table').evaluateAll(nodes=>nodes.map(table=>[...table.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(td=>String(td.innerText||td.textContent||'').trim())).filter(row=>row.length))).catch(()=>[]);
  for(const rows of tables){const measurements=makeMeasurementsFromMatrix(rows);if(measurements.length)return {name:clean(poolName)||'Piscina',measurements};}
  const text=await page.locator('body').innerText().catch(()=> '');
  const measurements=makeMeasurementsFromLines(String(text).split(/\r?\n/));
  return measurements.length?{name:clean(poolName)||'Piscina',measurements}:null;
}
async function selectDescriptors(page){
  return page.locator('select').evaluateAll(nodes=>nodes.map((s,index)=>{
    const label=(s.labels&&s.labels[0]?.innerText)||s.getAttribute('aria-label')||s.getAttribute('name')||s.id||'';
    const parent=String(s.parentElement?.innerText||'').slice(0,350);
    return {index,name:s.getAttribute('name')||'',id:s.id||'',label:String(label).trim(),parent,options:[...s.options].map(o=>({value:String(o.value||''),text:String(o.textContent||'').trim(),disabled:Boolean(o.disabled)}))};
  })).catch(()=>[]);
}
function choosePoolSelect(selects=[]){
  const scored=selects.map(s=>{
    const options=(s.options||[]).filter(o=>!o.disabled&&clean(o.text)&&!placeholderPattern.test(clean(o.text)));
    const context=norm(`${s.name} ${s.id} ${s.label} ${s.parent}`);
    let score=options.length*5;if(/pisc|pool|vaso/.test(context))score+=100;if(/select|selecc/.test(context))score+=10;
    return {...s,options,score};
  }).filter(s=>s.options.length);
  scored.sort((a,b)=>b.score-a.score);return scored[0]||null;
}
async function customOptions(page){
  const selectTrigger=page.getByText(/^Select$/i).first();
  if(await selectTrigger.isVisible().catch(()=>false)){await selectTrigger.click({force:true}).catch(()=>{});await page.waitForTimeout(400);}
  const selectors=['[role="option"]','.dropdown-menu a','.dropdown-menu button','.dropdown-menu li','.select2-results__option','.choices__item--choice','.bootstrap-select .dropdown-menu li a'];
  const seen=new Map();
  for(const selector of selectors){
    const loc=page.locator(selector);const count=Math.min(await loc.count().catch(()=>0),50);
    for(let i=0;i<count;i++){
      const el=loc.nth(i);if(!await el.isVisible().catch(()=>false))continue;
      const text=clean(await el.innerText().catch(()=>''));if(!text||placeholderPattern.test(text)||measurementPattern.test(text)||text.length>100)continue;
      if(!seen.has(text))seen.set(text,{text,selector,index:i});
    }
  }
  return [...seen.values()];
}
async function collectNetworkResponses(page){
  const items=[];
  page.on('response',async response=>{
    try{
      const req=response.request();if(!['xhr','fetch'].includes(req.resourceType()))return;
      const url=response.url();if(!/galileus|siloe|diario|pisc|pool|medic|measure/i.test(url))return;
      const ct=response.headers()['content-type']||'';if(!/json|text|html|javascript/i.test(ct))return;
      const text=await response.text();if(text.length>160000)return;
      items.push({url,status:response.status(),contentType:ct,body:text.slice(0,160000)});
    }catch{}
  });
  return items;
}
function poolsFromNetwork(items=[]){
  const out=[];
  const walk=(value,path='')=>{
    if(Array.isArray(value)){for(const [i,v] of value.entries())walk(v,`${path}[${i}]`);return;}
    if(!value||typeof value!=='object')return;
    const entries=Object.entries(value);const flat=Object.fromEntries(entries.map(([k,v])=>[norm(k),v]));
    const name=clean(flat.piscina||flat.pool||flat.nombre||flat.name||flat.vaso||flat.descripcion||'');
    const metrics=[];
    for(const [k,v] of entries){if(looksLikeMetricLabel(k)&&['string','number'].includes(typeof v))metrics.push({label:clean(k),value:clean(v)});}
    if(name&&metrics.length)out.push({name,measurements:[{measurement:'Última medición',date:'',time:'',metrics,temperature:temperatureFromMetrics(metrics)}]});
    for(const [k,v] of entries)if(v&&typeof v==='object')walk(v,`${path}.${k}`);
  };
  for(const item of items){
    try{walk(JSON.parse(item.body));}catch{}
  }
  return out;
}
function mergePools(list=[]){
  const map=new Map();
  for(const pool of list){
    const name=clean(pool?.name)||'Piscina';const key=norm(name);if(!map.has(key))map.set(key,{name,measurements:[]});
    const target=map.get(key);
    for(const m of pool.measurements||[]){
      const sig=JSON.stringify((m.metrics||[]).map(x=>[norm(x.label),clean(x.value)]));if(!target.measurements.some(x=>JSON.stringify((x.metrics||[]).map(y=>[norm(y.label),clean(y.value)]))===sig))target.measurements.push(m);
    }
  }
  return [...map.values()].filter(p=>p.measurements.some(m=>(m.metrics||[]).length));
}
async function scrapePools(page){
  const network=await collectNetworkResponses(page);
  await page.goto(SOURCE_URL,{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(2500);
  await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});
  await snapshot(page,'pools/01-inicial').catch(()=>{});
  const diagnostics={selects:0,options:0,customOptions:0,networkResponses:0,attempted:0,mode:'',url:page.url()};
  let pools=[];
  let selects=await selectDescriptors(page);diagnostics.selects=selects.length;
  const chosen=choosePoolSelect(selects);
  if(chosen){
    diagnostics.mode='select';diagnostics.options=chosen.options.length;
    for(const option of chosen.options.slice(0,30)){
      diagnostics.attempted++;
      try{
        const current=choosePoolSelect(await selectDescriptors(page));if(!current)break;
        const loc=page.locator('select').nth(current.index);
        await loc.selectOption(option.value?{value:option.value}:{label:option.text});
        await page.waitForTimeout(900);await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});
        const pool=await extractPool(page,option.text);if(pool)pools.push(pool);
      }catch(error){diagnostics[`option${diagnostics.attempted}Error`]=String(error?.message||error).slice(0,180);}
    }
  }else{
    const options=await customOptions(page);diagnostics.customOptions=options.length;diagnostics.mode=options.length?'custom':'single';
    if(options.length){
      for(const option of options.slice(0,24)){
        diagnostics.attempted++;
        try{
          await page.goto(SOURCE_URL,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(1200);
          const trigger=page.getByText(/^Select$/i).first();if(await trigger.isVisible().catch(()=>false)){await trigger.click({force:true});await page.waitForTimeout(250);}
          const candidate=page.getByText(option.text,{exact:true}).last();if(!await candidate.isVisible().catch(()=>false))continue;
          await candidate.click({force:true});await page.waitForTimeout(900);await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});
          const pool=await extractPool(page,option.text);if(pool)pools.push(pool);
        }catch(error){diagnostics[`custom${diagnostics.attempted}Error`]=String(error?.message||error).slice(0,180);}
      }
    }else{
      const pool=await extractPool(page,'Piscina');if(pool)pools.push(pool);
    }
  }
  await page.waitForTimeout(250);diagnostics.networkResponses=network.length;
  pools.push(...poolsFromNetwork(network));
  pools=mergePools(pools);
  diagnostics.detectedPools=pools.length;
  await fs.mkdir(ARTIFACTS,{recursive:true});
  await fs.writeFile(path.join(ARTIFACTS,'diagnostic.json'),JSON.stringify({diagnostics,network:network.map(x=>({url:x.url,status:x.status,contentType:x.contentType,preview:x.body.slice(0,1000)}))},null,2),'utf8').catch(()=>{});
  await snapshot(page,'pools/99-final').catch(()=>{});
  return {source:'Galileus · SILOE · navegador real',sourceUrl:SOURCE_URL,fetchedAt:isoNow(),pools,diagnostics,warning:pools.length?'':`Galileus abrió correctamente, pero no se pudieron interpretar piscinas. Modo ${diagnostics.mode} · selectores ${diagnostics.selects} · opciones ${diagnostics.options||diagnostics.customOptions} · intentos ${diagnostics.attempted} · respuestas de red ${diagnostics.networkResponses}.`};
}

let browser;
try{
  try{browser=await chromium.launch({headless:true,channel:'chrome'});}catch{browser=await chromium.launch({headless:true});}
  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:430,height:932},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 16; GC26 Pool Monitor) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36'});
  const page=await context.newPage();
  try{
    const result=await scrapePools(page);
    result.ok=true;result.status='ok';result.checkedAt=result.fetchedAt;
    await postResult('pools',result);
    console.log('[pools] OK',JSON.stringify({count:result.pools.length,diagnostics:result.diagnostics}));
  }catch(error){
    const result={ok:false,status:'error',source:'Galileus · SILOE · navegador real',sourceUrl:SOURCE_URL,checkedAt:isoNow(),fetchedAt:isoNow(),pools:[],error:String(error?.message||error),diagnostics:{fatal:true}};
    await snapshot(page,'pools/99-error').catch(()=>{});await postResult('pools',result).catch(()=>{});console.error('[pools] ERROR',error);process.exitCode=1;
  }finally{await context.close().catch(()=>{});}
}finally{await browser?.close().catch(()=>{});}
