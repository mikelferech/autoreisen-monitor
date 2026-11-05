const ALLOWED_SHOPS = [
  "mercadona.es", "hiperdino.es", "carrefour.es", "dia.es", "eroski.es",
  "alcampo.es", "elcorteingles.es", "lidl.es", "aldi.es", "spargrancanaria.es"
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store"
};

const WORKER_VERSION = "2.2.54";
const CORDIAL_AUTOMATION_VERSION = "2.2.12";
const AUTOREISEN_AUTOMATION_VERSION = "2.2.23";
const FLIGHTOPS_AUTOMATION_VERSION = "1.0.3";
const FLIGHTOPS_FILE = "// MFE_FLIGHTOPS_AUTOMATION_VERSION: 1.0.3\nimport fs from 'node:fs/promises';\nimport path from 'node:path';\n\nconst ARTIFACTS=path.resolve('artifacts');\nconst VUELING_STATUS_URL='https://www.vueling.com/es/servicios-vueling/informacion-de-vuelos/estado-de-vuelos';\nconst AENA_INFO_URL='https://www.aena.es/es/infovuelos.html';\nconst AENA_WEBSITE_API='https://www.aena.es/sites/Satellite';\n\nconst clean=v=>String(v??'').replace(/\\u00a0/g,' ').replace(/[ \\t]+/g,' ').trim();\nconst upper=v=>clean(v).toUpperCase();\nconst normalize=v=>upper(v).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'');\nconst flightDigits=v=>upper(v).replace(/\\s+/g,'');\nconst airportCode=v=>upper(v).match(/\\b([A-Z]{3})\\b/)?.[1]||'';\nconst localDate=v=>String(v||'').slice(0,10);\nconst localTime=v=>String(v||'').match(/T(\\d{2}:\\d{2})/)?.[1]||'';\n\nasync function ensureArtifacts(){await fs.mkdir(ARTIFACTS,{recursive:true});}\nasync function snapshot(page,name){await ensureArtifacts();await page.screenshot({path:path.join(ARTIFACTS,`${name}.png`),fullPage:true}).catch(()=>{});await fs.writeFile(path.join(ARTIFACTS,`${name}.html`),await page.content().catch(()=>''),'utf8').catch(()=>{});}\nasync function acceptCookies(page){\n  for(const label of [/aceptar todas/i,/aceptar todo/i,/aceptar/i,/allow all/i,/accept all/i,/continuar sin aceptar/i]){\n    const button=page.getByRole('button',{name:label}).first();\n    if(await button.isVisible().catch(()=>false)){await button.click({timeout:2500}).catch(()=>{});await page.waitForTimeout(500);break;}\n  }\n}\nasync function bodyText(page){return clean(await page.locator('body').innerText({timeout:10000}).catch(()=>''));}\nfunction lines(text=''){return String(text).split(/\\r?\\n/).map(clean).filter(Boolean);}\nfunction segmentAround(text,needle,radius=1800){\n  const raw=String(text||''), n=normalize(needle);\n  if(!n)return raw.slice(0,radius*2);\n  const norm=normalize(raw), index=norm.indexOf(n);\n  if(index<0)return raw.slice(0,radius*2);\n  return raw.slice(Math.max(0,index-radius),Math.min(raw.length,index+needle.length+radius));\n}\nfunction valueAfterLabel(text,labelPatterns,{maxAhead=3,allowSameLine=true}={}){\n  const rows=lines(text);\n  for(let i=0;i<rows.length;i++){\n    for(const pattern of labelPatterns){\n      const match=rows[i].match(pattern);\n      if(!match)continue;\n      if(allowSameLine){\n        const tail=clean(rows[i].slice(match.index+match[0].length).replace(/^[:\\-·]+/,'').trim());\n        if(tail&&tail!=='--'&&tail!=='-')return tail;\n      }\n      for(let j=1;j<=maxAhead&&i+j<rows.length;j++){\n        const candidate=clean(rows[i+j]);\n        if(candidate&&candidate!=='--'&&candidate!=='-'&&!labelPatterns.some(p=>p.test(candidate)))return candidate;\n      }\n    }\n  }\n  return '';\n}\nfunction timeAfterLabel(text,patterns){\n  const value=valueAfterLabel(text,patterns,{maxAhead:4});\n  return value.match(/\\b([0-2]?\\d:[0-5]\\d)\\b/)?.[1]||'';\n}\nfunction compactCode(value,max=18){\n  const v=clean(value).replace(/^(?:Nº|NUMERO|NÚMERO)\\s*/i,'');\n  if(!v||v==='--'||v==='-')return '';\n  const n=normalize(v);\n  // Evita arrastrar la siguiente etiqueta cuando el valor real todavía es \"--\".\n  // Ej.: Terminal -- / Puerta -- nunca puede convertirse en \"Terminal: Puerta --\".\n  if(/^(TERMINAL|PUERTA|GATE|FACTURACION|CHECK.?IN|EMBARQUE|BOARDING|CINTA|BAGGAGE|ESTADO|STATUS|SALIDA|LLEGADA|INICIO|CIERRE)\\b/.test(n))return '';\n  if(/\\b(?:DEL?|DE LA|ESTADO DEL VUELO|INFORMACION|AYUDA)\\b/.test(n)&&v.length>8)return '';\n  return v.length<=max?v:v.slice(0,max);\n}\nfunction statusFromText(text=''){\n  const n=normalize(text);\n  const known=[\n    ['CANCELADO','Cancelado'],['CANCELLED','Cancelado'],['RETRASADO','Retrasado'],['DELAYED','Retrasado'],\n    ['EMBARCANDO','Embarcando'],['BOARDING','Embarcando'],['ULTIMA LLAMADA','Última llamada'],['LAST CALL','Última llamada'],\n    ['PUERTA CERRADA','Puerta cerrada'],['GATE CLOSED','Puerta cerrada'],['EN HORA','En hora'],['ON TIME','En hora'],\n    ['ATERRIZADO','Aterrizado'],['LANDED','Aterrizado'],['DESPEGADO','Despegado'],['DEPARTED','Despegado']\n  ];\n  return known.find(([needle])=>n.includes(needle))?.[1]||'';\n}\nfunction monthTokens(month){\n  const es=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];\n  const en=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];\n  const idx=Math.max(0,Math.min(11,Number(month)-1));return [es[idx],en[idx]];\n}\nfunction flightDateSignals(text,flight={}){\n  const date=localDate(flight.date||flight.departure);if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date))return [];\n  const [y,m,d]=date.split('-'),shortY=y.slice(-2),day=String(Number(d));\n  return [date,`${d}/${m}/${y}`,`${d}-${m}-${y}`,`${d}/${m}/${shortY}`,`${day}/${Number(m)}/${y}`,...monthTokens(m).flatMap(mon=>[`${day} ${mon}`,`${d} ${mon}`,`${day} DE ${mon}`])].map(normalize);\n}\nfunction placeSignals(value=''){\n  const n=normalize(value),code=airportCode(value),words=n.replace(/\\([^)]*\\)/g,' ').split(/[^A-Z0-9]+/).filter(w=>w.length>=4&&!['AEROPUERTO','AIRPORT','GRAN'].includes(w));\n  return [...new Set([code,...words].filter(Boolean))];\n}\nfunction identityEvidence(text='',flight={}){\n  const n=normalize(text),number=normalize(flight.number||'');\n  const numberMatch=Boolean(number&&n.includes(number));\n  const dateMatch=flightDateSignals(text,flight).some(token=>token&&n.includes(token));\n  const originSignals=placeSignals(flight.origin||flight.from),destinationSignals=placeSignals(flight.destination||flight.to);\n  const originMatch=originSignals.some(token=>token&&n.includes(token));\n  const destinationMatch=destinationSignals.some(token=>token&&n.includes(token));\n  const depTime=localTime(flight.departure),timeMatch=Boolean(depTime&&n.includes(normalize(depTime)));\n  const routePair=originMatch&&destinationMatch;\n  const strong=numberMatch&&(dateMatch||routePair||(timeMatch&&(originMatch||destinationMatch)));\n  const score=(numberMatch?3:0)+(dateMatch?2:0)+(originMatch?1:0)+(destinationMatch?1:0)+(timeMatch?1:0);\n  return {numberMatch,dateMatch,originMatch,destinationMatch,timeMatch,routePair,strong,score};\n}\nfunction nearestFlightSegment(text='',flight={},radius=850){\n  const raw=String(text||''),number=normalize(flight.number||'');if(!number)return {segment:'',evidence:identityEvidence('',flight)};\n  const n=normalize(raw);let from=0,best=null;\n  while(true){const index=n.indexOf(number,from);if(index<0)break;const segment=raw.slice(Math.max(0,index-radius),Math.min(raw.length,index+number.length+radius)),evidence=identityEvidence(segment,flight);if(!best||evidence.score>best.evidence.score)best={segment,evidence};from=index+number.length;}\n  return best||{segment:'',evidence:identityEvidence('',flight)};\n}\nfunction verifiedStatus(segment='',flight={},evidence=identityEvidence(segment,flight)){\n  if(!evidence.strong)return {status:'',verified:false};\n  const status=statusFromText(segment);if(!status)return {status:'',verified:false};\n  // Una cancelación es un dato crítico: además del nº de vuelo exigimos fecha y\n  // otra señal operativa (ruta o hora) en el mismo bloque cercano. Así palabras\n  // genéricas de ayuda/FAQ nunca pueden cancelar un vuelo en la app.\n  if(status==='Cancelado'){\n    const strictCancel=evidence.numberMatch&&evidence.dateMatch&&(evidence.routePair||evidence.timeMatch||(evidence.originMatch&&evidence.destinationMatch));\n    return {status:strictCancel?status:'',verified:strictCancel};\n  }\n  return {status,verified:true};\n}\nfunction parseOperationalText(text='',flight={},kind='generic'){\n  const nearby=nearestFlightSegment(text,flight,850),seg=nearby.segment,evidence=nearby.evidence;\n  if(!evidence.strong){\n    return {found:Boolean(evidence.numberMatch),identityVerified:false,identityScore:evidence.score,status:'',statusVerified:false,terminal:'',gate:'',checkInCounters:'',baggageBelt:'',boardingStart:'',boardingClose:'',scheduledDeparture:localTime(flight.departure),scheduledArrival:localTime(flight.arrival),kind,rawSegment:seg.slice(0,5000)};\n  }\n  const terminal=compactCode(valueAfterLabel(seg,[/^terminal\\b/i,/\\bterminal\\b/i],{maxAhead:3}),12);\n  const gate=compactCode(valueAfterLabel(seg,[/^puerta(?:\\s+de\\s+embarque)?\\b/i,/^gate\\b/i,/\\bpuerta\\b/i],{maxAhead:3}),12);\n  const counters=compactCode(valueAfterLabel(seg,[/^mostradores?(?:\\s+de\\s+facturaci[oó]n)?\\b/i,/^facturaci[oó]n\\b/i,/^check[- ]?in(?:\\s+counters?)?\\b/i],{maxAhead:4}),22);\n  const belt=compactCode(valueAfterLabel(seg,[/^cinta(?:\\s+(?:de\\s+)?(?:maletas|equipajes))?\\b/i,/^baggage(?:\\s+belt)?\\b/i,/^belt\\b/i],{maxAhead:4}),14);\n  const boardingStart=timeAfterLabel(seg,[/^inicio\\b/i,/^embarque(?:\\s+inicio)?\\b/i,/^boarding(?:\\s+starts?)?\\b/i]);\n  const boardingClose=timeAfterLabel(seg,[/^cierre\\b/i,/^embarque\\s+cierre\\b/i,/^boarding\\s+closes?\\b/i,/^boarding\\s+close\\b/i]);\n  const scheduledDeparture=timeAfterLabel(seg,[/^salida\\b/i,/^hora\\s+salida\\b/i,/^departure\\b/i])||localTime(flight.departure);\n  const scheduledArrival=timeAfterLabel(seg,[/^llegada\\b/i,/^hora\\s+llegada\\b/i,/^arrival\\b/i])||localTime(flight.arrival);\n  const verified=verifiedStatus(seg,flight,evidence);\n  return {found:true,identityVerified:true,identityScore:evidence.score,status:verified.status,statusVerified:verified.verified,terminal,gate,checkInCounters:counters,baggageBelt:belt,boardingStart,boardingClose,scheduledDeparture,scheduledArrival,kind,rawSegment:seg.slice(0,5000)};\n}\n\nconst AENA_STATUS_LABELS={SCH:'Programado',INI:'Programado',HOR:'En hora',RET:'Retrasado',EMB:'Embarcando',ULL:'Última llamada',NPT:'Cambio de puerta',CER:'Puerta cerrada',FLY:'Despegado',FNL:'En aproximación',LND:'Aterrizado',ATE:'Aterrizado',OPE:'Equipaje en cinta',OPF:'Equipaje en cinta',IBK:'Equipaje en cinta',BOR:'Finalizado',CAN:'Cancelado',DES:'Desviado'};\nfunction aenaStatusLabel(code=''){return AENA_STATUS_LABELS[upper(code)]||clean(code);}\nfunction digitsOnly(v=''){return String(v||'').replace(/\\D+/g,'');}\nfunction dateEsFromIso(v=''){const m=String(v||'').match(/^(\\d{4})-(\\d{2})-(\\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:'';}\nfunction scalarText(v){return ['string','number'].includes(typeof v)?clean(v):'';}\nfunction deepValueByKey(obj,patterns,depth=0){\n  if(!obj||typeof obj!=='object'||depth>3)return '';\n  for(const [key,value] of Object.entries(obj)){\n    const nk=normalize(key);\n    if(patterns.some(p=>p.test(nk))){const s=scalarText(value);if(s)return s;}\n  }\n  for(const value of Object.values(obj)){const found=deepValueByKey(value,patterns,depth+1);if(found)return found;}\n  return '';\n}\nfunction rangeValue(first,last){const a=clean(first),b=clean(last);if(a&&b&&a!==b)return `${a}-${b}`;return a||b||'';}\nfunction aenaRowFlightNumber(r={}){return `${clean(r.iataCompania)||clean(r.compania)||''}${clean(r.numVuelo)||''}`.replace(/\\s+/g,'');}\nfunction aenaRowDate(r={}){return clean(r.fecha)||clean(r.fechaVuelo)||'';}\nfunction aenaRowScheduled(r={}){return clean(r.horaProgramada)||clean(r.horaProg)||clean(r.horaPrevista)||'';}\nfunction aenaRowOtherAirport(r={}){return upper(r.iataOtro||r.aeropuertoIataOtro||r.iataDestino||r.iataOrigen||'');}\nfunction scoreAenaRow(r={},flight={},mode='departure'){\n  const targetDigits=digitsOnly(flight.number),rowDigits=digitsOnly(aenaRowFlightNumber(r));\n  if(!targetDigits||targetDigits!==rowDigits)return -1;\n  const expectedDate=dateEsFromIso(localDate(flight.date||flight.departure));\n  const rowDate=aenaRowDate(r);\n  // La API de Aena devuelve vuelos de una ventana corta. Nunca aceptamos el mismo\n  // número/ruta si la fecha completa (incluido el año) no coincide exactamente.\n  if(!expectedDate||!rowDate||normalize(expectedDate)!==normalize(rowDate))return -1;\n  let score=16;\n  const expectedOther=airportCode(mode==='departure'?(flight.destination||flight.to):(flight.origin||flight.from));\n  const rowOther=aenaRowOtherAirport(r);if(expectedOther&&rowOther===expectedOther)score+=4;\n  const expectedTime=localTime(mode==='departure'?flight.departure:flight.arrival),rowTime=aenaRowScheduled(r);if(expectedTime&&rowTime&&rowTime.startsWith(expectedTime))score+=3;\n  const rowCode=normalize(aenaRowFlightNumber(r)),targetCode=normalize(flight.number||'');if(rowCode===targetCode)score+=2;\n  return score;\n}\nfunction parseAenaWebsiteRow(r={},flight={},mode='departure'){\n  const firstCounter=deepValueByKey(r,[/MOSTRADOR.*(?:PRIM|INI)/,/FACTUR.*(?:PRIM|INI)/,/CHECK.*(?:FIRST|START)/]);\n  const lastCounter=deepValueByKey(r,[/MOSTRADOR.*(?:ULT|FIN)/,/FACTUR.*(?:ULT|FIN)/,/CHECK.*(?:LAST|END)/]);\n  const counters=rangeValue(firstCounter,lastCounter)||deepValueByKey(r,[/MOSTRADOR/,/FACTURACION/,/CHECKINCOUNTER/,/CHECKIN/]);\n  const boardingStart=deepValueByKey(r,[/HORA.*EMBAR/,/EMBAR.*HORA/,/BOARDING.*(?:START|TIME)/]);\n  const boardingClose=deepValueByKey(r,[/CIERRE.*EMBAR/,/EMBAR.*CIERRE/,/BOARDING.*CLOSE/]);\n  const status=aenaStatusLabel(r.estado||r.estadoVuelo||'');\n  return {found:true,identityVerified:true,identityScore:99,status,statusVerified:Boolean(status),terminal:compactCode(r.terminal||r.terminalPrimera||'',12),gate:compactCode(r.puertaPrimera||r.puerta||'',12),checkInCounters:compactCode(counters,22),baggageBelt:compactCode(r.cintaPrimera||r.cinta||'',14),boardingStart:String(boardingStart||'').match(/\\b([0-2]?\\d:[0-5]\\d)\\b/)?.[1]||'',boardingClose:String(boardingClose||'').match(/\\b([0-2]?\\d:[0-5]\\d)\\b/)?.[1]||'',scheduledDeparture:mode==='departure'?(aenaRowScheduled(r)||localTime(flight.departure)):localTime(flight.departure),scheduledArrival:mode==='arrival'?(aenaRowScheduled(r)||localTime(flight.arrival)):localTime(flight.arrival),kind:`aena-api-${mode}`,rawSegment:JSON.stringify(r).slice(0,5000)};\n}\nasync function queryAenaWebsiteApi(flight,mode='departure'){\n  const origin=airportCode(flight.origin||flight.from),destination=airportCode(flight.destination||flight.to),airport=mode==='departure'?origin:destination;\n  if(!airport)return {ok:false,source:'Aena',mode,error:'Código de aeropuerto no disponible'};\n  const flightType=mode==='departure'?'S':'L';\n  const url=`${AENA_WEBSITE_API}?pagename=AENA_ConsultarVuelos&airport=${encodeURIComponent(airport)}&flightType=${flightType}&dosDias=si`;\n  try{\n    const response=await fetch(url,{headers:{Accept:'application/json,text/plain,*/*','User-Agent':'Mozilla/5.0 MFE-Viajes/GC26'},signal:AbortSignal.timeout(18000)});\n    if(!response.ok)throw new Error(`HTTP ${response.status}`);\n    const rows=await response.json();if(!Array.isArray(rows))throw new Error('Respuesta JSON inesperada');\n    const ranked=rows.map(r=>({r,score:scoreAenaRow(r,flight,mode)})).filter(x=>x.score>=10).sort((a,b)=>b.score-a.score);\n    if(!ranked.length)return {ok:true,source:'Aena',mode,url,found:false,identityVerified:false,identityScore:0,status:'',statusVerified:false,terminal:'',gate:'',checkInCounters:'',baggageBelt:'',boardingStart:'',boardingClose:'',scheduledDeparture:localTime(flight.departure),scheduledArrival:localTime(flight.arrival),kind:`aena-api-${mode}`};\n    return {ok:true,source:'Aena',mode,url,...parseAenaWebsiteRow(ranked[0].r,flight,mode),apiScore:ranked[0].score};\n  }catch(error){return {ok:false,source:'Aena',mode,url,error:`API pública Aena: ${error?.message||String(error)}`};}\n}\n\nasync function tryFill(locator,value){\n  if(!value)return false;\n  if(await locator.count().catch(()=>0)<1)return false;\n  const el=locator.first();if(!await el.isVisible().catch(()=>false))return false;\n  try{await el.fill(String(value));return true;}catch{return false;}\n}\nasync function fillDateLike(locator,date){\n  if(!date)return false;\n  if(await locator.count().catch(()=>0)<1)return false;\n  const el=locator.first();if(!await el.isVisible().catch(()=>false))return false;\n  const [y,m,d]=date.split('-');\n  for(const value of [date,`${d}/${m}/${y}`,`${d}-${m}-${y}`]){\n    try{await el.fill(value);return true;}catch{}\n  }\n  return false;\n}\nasync function submitLikelySearch(page){\n  const candidates=[\n    page.getByRole('button',{name:/buscar|consultar|ver vuelo|estado del vuelo|search|consult/i}),\n    page.locator('button[type=\"submit\"]'),page.locator('input[type=\"submit\"]')\n  ];\n  for(const loc of candidates){const btn=loc.first();if(await btn.isVisible().catch(()=>false)){await btn.click({timeout:4000}).catch(()=>{});await page.waitForTimeout(2600);return true;}}\n  return false;\n}\nasync function fillGenericFlightSearch(page,flight){\n  const number=flight.number,date=localDate(flight.date||flight.departure);\n  const flightInputs=[\n    page.getByLabel(/n[uú]mero.*vuelo|vuelo|flight number/i),\n    page.locator('input[placeholder*=\"vuelo\" i],input[placeholder*=\"flight\" i],input[name*=\"flight\" i],input[id*=\"flight\" i],input[name*=\"vuelo\" i],input[id*=\"vuelo\" i]')\n  ];\n  let filled=false;for(const loc of flightInputs){if(await tryFill(loc,number)){filled=true;break;}}\n  const dateInputs=[page.getByLabel(/fecha|date/i),page.locator('input[type=\"date\"],input[placeholder*=\"fecha\" i],input[name*=\"date\" i],input[id*=\"date\" i],input[name*=\"fecha\" i],input[id*=\"fecha\" i]')];\n  for(const loc of dateInputs){if(await fillDateLike(loc,date))break;}\n  if(filled)await submitLikelySearch(page);\n  return filled;\n}\nasync function openPage(browser,url,name){\n  const context=await browser.newContext({locale:'es-ES',timezoneId:'Europe/Madrid',viewport:{width:1440,height:1200},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'});\n  const page=await context.newPage();\n  try{await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});await acceptCookies(page);await page.waitForTimeout(1800);return {context,page};}\n  catch(error){await context.close();throw error;}\n}\nasync function queryAena(browser,flight,mode='departure'){\n  const api=await queryAenaWebsiteApi(flight,mode);\n  if(api?.ok&&api?.identityVerified===true)return api;\n  const origin=airportCode(flight.origin||flight.from),destination=airportCode(flight.destination||flight.to);\n  const airport=mode==='departure'?origin:destination;\n  if(!airport)return api?.ok?api:{ok:false,source:'Aena',mode,error:'Código de aeropuerto no disponible'};\n  const param=mode==='departure'?'origin':'destination';\n  const url=`${AENA_INFO_URL}?Buscar=Buscar&accion=Inicio&${param}=${encodeURIComponent(airport)}`;\n  let opened;\n  try{\n    opened=await openPage(browser,url,`aena-${mode}-${flightDigits(flight.number)}`);const {context,page}=opened;\n    let text=await bodyText(page);\n    if(!normalize(text).includes(normalize(flight.number||''))){await fillGenericFlightSearch(page,flight);text=await bodyText(page);}\n    const parsed=parseOperationalText(text,flight,`aena-${mode}`);\n    await snapshot(page,`flightops-aena-${mode}-${flightDigits(flight.number)}`);\n    await context.close();\n    if(parsed.identityVerified===true)return {ok:true,source:'Aena',mode,url,...parsed};\n    return api?.ok?api:{ok:true,source:'Aena',mode,url,...parsed,error:api?.error||''};\n  }catch(error){await opened?.context?.close().catch(()=>{});return api?.ok?api:{ok:false,source:'Aena',mode,url,error:[api?.error,error?.message||String(error)].filter(Boolean).join(' · ')};}\n}\nasync function queryVueling(browser,flight){\n  let opened;\n  try{\n    opened=await openPage(browser,VUELING_STATUS_URL,`vueling-${flightDigits(flight.number)}`);const {context,page}=opened;\n    let text=await bodyText(page);\n    if(!normalize(text).includes(normalize(flight.number||''))||!statusFromText(segmentAround(text,flight.number||''))){await fillGenericFlightSearch(page,flight);text=await bodyText(page);}\n    const parsed=parseOperationalText(text,flight,'vueling');\n    await snapshot(page,`flightops-vueling-${flightDigits(flight.number)}`);\n    await context.close();\n    return {ok:true,source:'Vueling',mode:'flight-status',url:VUELING_STATUS_URL,...parsed};\n  }catch(error){await opened?.context?.close().catch(()=>{});return {ok:false,source:'Vueling',mode:'flight-status',url:VUELING_STATUS_URL,error:error?.message||String(error)};}\n}\nfunction choose(primary,secondary,key){return clean(primary?.[key])||clean(secondary?.[key])||'';}\nfunction sameValue(a,b){return Boolean(clean(a)&&clean(b)&&normalize(a)===normalize(b));}\nfunction mergeFlight(flight,aenaDeparture,aenaArrival,vueling){\n  const dep=aenaDeparture||{},arr=aenaArrival||{},v=vueling||{};\n  const verifiedSources=[dep,arr,v].filter(x=>x?.ok&&x?.identityVerified===true);\n  const statusCandidates=verifiedSources.filter(x=>x.statusVerified===true&&clean(x.status));\n  const cancelCandidates=statusCandidates.filter(x=>normalize(x.status)==='CANCELADO');\n  // Cancelado solo se acepta si una fuente tiene evidencia estricta del vuelo;\n  // para el resto de estados basta con una fuente verificada. Si dos fuentes\n  // coinciden, se registra además en confirmations.\n  const status=cancelCandidates[0]?.status||statusCandidates[0]?.status||'';\n  const pickVerified=(primary,secondary,key)=>clean(primary?.identityVerified===true?primary?.[key]:'')||clean(secondary?.identityVerified===true?secondary?.[key]:'')||'';\n  const terminal=pickVerified(dep,v,'terminal');\n  const gate=pickVerified(dep,v,'gate');\n  const checkInCounters=pickVerified(dep,v,'checkInCounters');\n  const baggageBelt=pickVerified(arr,v,'baggageBelt');\n  const boardingStart=pickVerified(v,dep,'boardingStart');\n  const boardingClose=pickVerified(v,dep,'boardingClose');\n  const scheduledDeparture=pickVerified(v,dep,'scheduledDeparture')||localTime(flight.departure);\n  const scheduledArrival=pickVerified(v,arr,'scheduledArrival')||localTime(flight.arrival);\n  const sources=[dep,arr,v].filter(x=>x?.ok).map(x=>({name:x.source,mode:x.mode,found:Boolean(x.found),identityVerified:x.identityVerified===true,statusVerified:x.statusVerified===true,identityScore:Number(x.identityScore)||0,url:x.url,error:x.error||''}));\n  const confirmations=[];\n  if(dep.identityVerified===true&&v.identityVerified===true&&sameValue(dep.gate,v.gate))confirmations.push('gate');\n  if(dep.identityVerified===true&&v.identityVerified===true&&sameValue(dep.terminal,v.terminal))confirmations.push('terminal');\n  if(dep.statusVerified===true&&v.statusVerified===true&&sameValue(dep.status,v.status))confirmations.push('status');\n  const hints=flight?.operationalHints||{};\n  const liveIdentity=verifiedSources.length>0;\n  const hinted=Boolean(hints.terminal||hints.gate||hints.checkInCounters||hints.baggageBelt||hints.boardingStart||hints.boardingClose);\n  const finalTerminal=terminal||clean(hints.terminal),finalGate=gate||clean(hints.gate),finalCounters=checkInCounters||clean(hints.checkInCounters),finalBelt=baggageBelt||clean(hints.baggageBelt),finalBoarding=boardingStart||clean(hints.boardingStart),finalBoardingClose=boardingClose||clean(hints.boardingClose);\n  const identityVerified=liveIdentity||hinted,statusVerified=Boolean(status&&statusCandidates.length);\n  if(hinted)sources.push({name:hints.source||'Aena app · última info confirmada',mode:'snapshot',found:true,identityVerified:true,statusVerified:false,identityScore:100,url:'',error:''});\n  return {\n    id:String(flight.id||flight.number||''),number:String(flight.number||''),date:localDate(flight.date||flight.departure),origin:airportCode(flight.origin||flight.from),destination:airportCode(flight.destination||flight.to),\n    departure:flight.departure||'',arrival:flight.arrival||'',status,statusVerified,identityVerified,terminal:finalTerminal,gate:finalGate,checkInCounters:finalCounters,baggageBelt:finalBelt,boardingStart:finalBoarding,boardingClose:finalBoardingClose,scheduledDeparture,scheduledArrival,\n    confirmations,sources,hasOperationalData:Boolean(identityVerified&&(status||finalTerminal||finalGate||finalCounters||finalBelt||finalBoarding||finalBoardingClose))\n  };\n}\nexport async function monitorFlightOps(browser,config={}){\n  const flights=(Array.isArray(config.flights)?config.flights:[]).filter(f=>f?.number&&f?.departure);\n  if(!flights.length)throw new Error('No hay vuelos configurados para seguimiento operativo.');\n  const results=[];\n  for(const flight of flights){\n    // API pública de Aena primero y sin navegador. Evita los bloqueos de 5-7 minutos\n    // que provocaba Playwright justo cuando más interesa (horas previas al vuelo).\n    const [dep,arr]=await Promise.all([queryAenaWebsiteApi(flight,'departure'),queryAenaWebsiteApi(flight,'arrival')]);\n    results.push(mergeFlight(flight,dep,arr,{ok:false,source:'Vueling',mode:'omitido',error:'Consulta web omitida: Aena API prioritaria'}));\n  }\n  return {ok:true,status:'ok',checkedAt:new Date().toISOString(),source:'Aena API pública · GitHub Actions',flights:results};\n}\n\nexport const __flightOpsTest={parseOperationalText,statusFromText,valueAfterLabel,mergeFlight,airportCode,identityEvidence,nearestFlightSegment,verifiedStatus,parseAenaWebsiteRow,scoreAenaRow,aenaStatusLabel};\n";
const FLIGHTOPS_RUN_FILE = "import fs from 'node:fs/promises';\nimport {workerRequest} from './lib.mjs';\nimport {monitorFlightOps} from './flightops.mjs';\n\nconst document=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));\nconst config={enabled:true,...(document.flightops||{})};\nconst force=/^(1|true|yes)$/i.test(String(process.env.MFE_FORCE_RUN||''));\nif(config.enabled===false){console.log('[flightops] Seguimiento operativo desactivado.');process.exit(0);}\n\nasync function readPrevious(){const {response,data}=await workerRequest({action:'flightops-read'},{allowError:true});return response.ok?data:null;}\nfunction intervalForFlight(flight,now=Date.now()){\n  const dep=Date.parse(flight.departure||''),arr=Date.parse(flight.arrival||'');\n  if(!Number.isFinite(dep))return Infinity;\n  const until=dep-now;\n  if(Number.isFinite(arr)&&now>arr+3*3600000)return Infinity;\n  if(until>14*24*3600000)return Infinity;\n  if(until>24*3600000)return 6*3600000;\n  if(until>4*3600000)return 60*60000;\n  return 10*60000;\n}\nfunction shouldRun(previous){\n  if(force)return true;\n  const flights=Array.isArray(config.flights)?config.flights:[];const intervals=flights.map(f=>intervalForFlight(f)).filter(Number.isFinite);\n  if(!intervals.length)return false;\n  const required=Math.min(...intervals),last=Date.parse(previous?.result?.checkedAt||previous?.result?.receivedAt||'');\n  if(!Number.isFinite(last))return true;\n  return Date.now()-last>=Math.max(8*60000,required-60000);\n}\nconst previous=await readPrevious().catch(()=>null);\nif(!shouldRun(previous)){console.log('[flightops] OMITIDO: todavía no toca una nueva consulta operativa.');process.exit(0);}\n\ntry{\n  const result=await monitorFlightOps(null,config);\n  const {response,data}=await workerRequest({action:'flightops-write',result},{authenticated:true,allowError:true});\n  if(!response.ok)throw new Error(`Worker ${response.status}: ${data?.error||'no se pudo guardar flightops'}`);\n  console.log('[flightops] OK',JSON.stringify(result,null,2));\n}catch(error){\n  const result={ok:false,status:'error',error:error?.message||String(error),checkedAt:new Date().toISOString(),source:'Aena API pública · GitHub Actions'};\n  console.error('[flightops] ERROR',error);\n  await workerRequest({action:'flightops-write',result},{authenticated:true,allowError:true}).catch(()=>{});\n  process.exitCode=1;\n}\n";
const FLIGHTOPS_WORKFLOW_FILE = "flightops-monitor.yml";
const FLIGHTOPS_WORKFLOW_TEMPLATE = "name: Estado vuelos · MFE Viajes\n\non:\n  schedule:\n    - cron: '*/10 * * * *'\n  workflow_dispatch:\n    inputs:\n      force:\n        description: 'Forzar consulta ahora'\n        required: false\n        default: true\n        type: boolean\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: flightops-monitor\n  cancel-in-progress: false\n\njobs:\n  monitor:\n    runs-on: ubuntu-latest\n    timeout-minutes: 3\n    defaults:\n      run:\n        working-directory: monitoring\n    env:\n      MFE_WORKER_URL: ${{ secrets.MFE_WORKER_URL }}\n      MFE_MONITOR_SECRET: ${{ secrets.MFE_MONITOR_SECRET }}\n      MFE_FORCE_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.force || false }}\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n          cache: npm\n          cache-dependency-path: monitoring/package-lock.json\n      - name: Instalar dependencias Node\n        run: npm ci\n      - name: Consultar Aena\n        run: node flightops-run.mjs\n      - name: Guardar diagnóstico si falla\n        if: failure()\n        uses: actions/upload-artifact@v4\n        with:\n          name: flightops-diagnostico\n          path: monitoring/artifacts/\n          if-no-files-found: ignore\n          retention-days: 7\n";

const AUTOREISEN_FILE_0 = "import fs from 'node:fs/promises';\nimport path from 'node:path';\n\nexport const ARTIFACTS = path.resolve('artifacts');\nexport async function ensureArtifacts(){await fs.mkdir(ARTIFACTS,{recursive:true});}\nexport function money(text=''){\n  const matches=String(text).match(/(?:€\\s*)?([0-9]{1,4}(?:[.,][0-9]{2}))\\s*€?/g)||[];\n  return matches.map(v=>Number.parseFloat(v.replace(/[^0-9,.-]/g,'').replace(/\\./g,'').replace(',','.'))).filter(Number.isFinite);\n}\nexport async function snapshot(page,name){await ensureArtifacts();await page.screenshot({path:path.join(ARTIFACTS,`${name}.png`),fullPage:true}).catch(()=>{});await fs.writeFile(path.join(ARTIFACTS,`${name}.html`),await page.content().catch(()=>''),'utf8').catch(()=>{});}\nexport async function acceptCookies(page){\n  for(const label of [/aceptar todas/i,/aceptar/i,/allow all/i,/accept all/i,/consentir/i]){\n    const btn=page.getByRole('button',{name:label}).first();if(await btn.isVisible().catch(()=>false)){await btn.click().catch(()=>{});break;}\n  }\n}\nexport async function fillFirst(page,selectors,value){\n  for(const selector of selectors){const loc=typeof selector==='string'?page.locator(selector).first():selector; if(await loc.isVisible().catch(()=>false)){await loc.fill(String(value));return true;}}\n  return false;\n}\nexport async function clickFirst(page,locators){\n  for(const loc0 of locators){const loc=typeof loc0==='string'?page.locator(loc0).first():loc0;if(await loc.isVisible().catch(()=>false)){await loc.click();return true;}}\n  return false;\n}\nexport function workerCredentials(){\n  const url=String(process.env.MFE_WORKER_URL||'').trim();const secret=String(process.env.MFE_MONITOR_SECRET||'').trim();\n  if(!url||!secret)throw new Error('Faltan MFE_WORKER_URL o MFE_MONITOR_SECRET en los secretos de GitHub.');\n  return {url,secret};\n}\nexport async function workerRequest(payload,{authenticated=false,allowError=false}={}){\n  const {url,secret}=workerCredentials();\n  const headers={'Content-Type':'application/json'};if(authenticated)headers.Authorization=`Bearer ${secret}`;\n  const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(payload)});\n  let data=null;try{data=await response.json();}catch{}\n  if(!response.ok&&!allowError)throw new Error(`Worker ${response.status}: ${data?.error||'respuesta no válida'}`);\n  return {response,data};\n}\nexport async function readTrackerLatest(type='autoreisen'){\n  const action=String(type||'autoreisen').trim().toLowerCase();\n  const {response,data}=await workerRequest({action},{allowError:true});\n  if(response.ok&&data?.result)return {result:data.result,lastError:data.lastError||null};\n  return {result:null,lastError:data?.lastError||null};\n}\nexport async function readLatest(){return readTrackerLatest('autoreisen');}\nexport function dateInTimeZone(value=new Date(),timeZone='Europe/Madrid'){\n  const stamp=value instanceof Date?value:new Date(value);\n  if(Number.isNaN(stamp.getTime()))return '';\n  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(stamp);\n  const get=type=>parts.find(x=>x.type===type)?.value||'';\n  return `${get('year')}-${get('month')}-${get('day')}`;\n}\nexport function successfulResultToday(result,{timeZone='Europe/Madrid',now=new Date()}={}){\n  if(!result||result.ok===false||String(result.status||'').toLowerCase()==='error')return false;\n  const checkedAt=result.checkedAt||result.receivedAt||result.updatedAt||'';\n  return Boolean(checkedAt)&&dateInTimeZone(checkedAt,timeZone)===dateInTimeZone(now,timeZone);\n}\nexport async function postResult(type,result){\n  const {response,data}=await workerRequest({action:'monitor-write',type,result},{authenticated:true,allowError:true});\n  if(!response.ok)throw new Error(`Worker ${response.status}: ${data?.error||'no se pudo guardar el resultado'}`);\n  return data;\n}\nexport function isoNow(){return new Date().toISOString();}\nexport function daysBetween(a,b){return Math.max(1,Math.ceil((new Date(b)-new Date(a))/86400000));}\nexport async function waitNetwork(page){await page.waitForLoadState('domcontentloaded');await page.waitForTimeout(1800);}\nexport function hoursSince(value){const t=Date.parse(String(value||''));return Number.isFinite(t)?Math.max(0,(Date.now()-t)/3600000):Infinity;}\nexport function moneyText(value){return new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR'}).format(Number(value)||0);}\nexport async function sendTelegram(text){\n  const token=String(process.env.TELEGRAM_BOT_TOKEN||'').trim();\n  const chatId=String(process.env.TELEGRAM_CHAT_ID||'').trim();\n  if(!token||!chatId)throw new Error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en los secretos de GitHub.');\n  const response=await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text:String(text),disable_web_page_preview:true})});\n  let data=null;try{data=await response.json();}catch{}\n  if(!response.ok||data?.ok===false)throw new Error(data?.description||`Telegram respondió HTTP ${response.status}`);\n  return data;\n}\n";
const AUTOREISEN_FILE_1 = "import fs from 'node:fs/promises';\nimport {chromium} from 'playwright';\nimport {daysBetween,isoNow,moneyText,postResult,readLatest,sendTelegram,successfulResultToday} from './lib.mjs';\nimport {bestFleetVehicle,filterFleetForTracking,monitorAutoReisen,scanAutoReisenFleet} from './autoreisen.mjs';\n\nconst document=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));\n\nasync function launchAutoReisenBrowser(){\n  const base={headless:true,args:['--disable-blink-features=AutomationControlled']};\n  try{return await chromium.launch({...base,channel:'chrome'});}catch(error){\n    console.warn('[autoreisen] Chrome estable no disponible; se usa Chromium de Playwright.',error?.message||error);\n    return chromium.launch(base);\n  }\n}\n\nconst defaults={enabled:true,fleetTrackAll:true,fleetTrackGroups:[],telegramEnabled:true,telegramNotifyEveryCheck:true,telegramNotifyPriceDrop:true,telegramNotifyBelowReserved:true,telegramNotifyAvailability:true,telegramNotifyError:true,telegramNotifyRecovery:true,telegramMinDropAmount:0,telegramMinDropPercent:0};\nlet config={...defaults,...(document.autoreisen||{})};\nconst force=/^(1|true|yes)$/i.test(String(process.env.MFE_FORCE_RUN||''));\nconst telegramTest=/^(1|true|yes)$/i.test(String(process.env.MFE_TEST_TELEGRAM||''));\nconst fleetOnly=/^(1|true|yes)$/i.test(String(process.env.MFE_FLEET_ONLY||''));\nconst requestId=String(process.env.MFE_REQUEST_ID||'').trim();\nconst fleetConfigJson=String(process.env.MFE_FLEET_CONFIG_JSON||'').trim();\nif(fleetOnly&&fleetConfigJson){\n  try{const temporary=JSON.parse(fleetConfigJson);config={...config,...temporary};console.log('[autoreisen-fleet] Configuración temporal recibida; monitoring/config.json no se modifica.');}\n  catch(error){throw new Error(`La configuración temporal de flota no es JSON válido: ${error.message}`);}\n}\n\nif(telegramTest){\n  if(!config.telegramEnabled)throw new Error('Telegram está desactivado en MFE Viajes. Actívalo antes de probarlo.');\n  await sendTelegram(`🧪 MFE Viajes · Telegram funciona correctamente\\nAutoReisen · ${new Date().toLocaleString('es-ES',{timeZone:'Atlantic/Canary'})}`);\n  console.log('Mensaje de prueba enviado a Telegram.');\n  process.exit(0);\n}\nif(fleetOnly){\n  const browser=await launchAutoReisenBrowser();\n  try{\n    const result=await scanAutoReisenFleet(browser,config);\n    await postResult('autoreisen',{...result,ok:true,status:'ok',scanMode:'fleet',requestId,checkedAt:result.checkedAt||isoNow()});\n    console.log('[autoreisen-fleet] OK',result);\n  }catch(error){\n    const result={ok:false,status:'error',scanMode:'fleet',requestId,error:error?.message||String(error),checkedAt:isoNow(),source:'GitHub Actions + Playwright'};\n    console.error('[autoreisen-fleet] ERROR',error);\n    try{await postResult('autoreisen',result);}catch(postError){console.error('No se pudo registrar el error de flota en el Worker:',postError.message);}\n    process.exitCode=1;\n  }finally{await browser.close();}\n  process.exit(process.exitCode||0);\n}\nif(!config.enabled){console.log('Monitor AutoReisen desactivado desde MFE Viajes.');process.exit(0);}\n\nif(!force)console.log('Comprobación automática diaria de las 06:30 (Europe/Madrid).');\nconst previous=await readLatest();\nif(!force&&successfulResultToday(previous.result)){\n  console.log(`[autoreisen] OMITIDO: ya existe una comprobación correcta de hoy (${previous.result.checkedAt||previous.result.receivedAt||'sin hora'}). El cron tardío no repetirá la consulta.`);\n  process.exit(0);\n}\n\nconst browser=await launchAutoReisenBrowser();\ntry{\n  let result=null,fleetScan=null,fleetError='';\n  try{\n    fleetScan=await scanAutoReisenFleet(browser,config);\n    const fullFleet=Array.isArray(fleetScan?.fleet)?fleetScan.fleet:[],selected=bestFleetVehicle(fullFleet,config);\n    if(selected&&Number(selected.total||0)>0){\n      result={...fleetScan,price:Number(selected.total)||0,total:Number(selected.total)||0,pricePerDay:Number(selected.pricePerDay)||0,availability:selected.availability||fleetScan.availability||'Disponible',group:selected.group||config.group,model:selected.model||config.model,carId:selected.carId||config.carId||'',imageUrl:selected.imageUrl||fleetScan.imageUrl||'',fleet:fullFleet,fleetTotalCount:fullFleet.length,fleetSelection:{all:config.fleetTrackAll!==false,groups:Array.isArray(config.fleetTrackGroups)?config.fleetTrackGroups:[]}};\n    }\n  }catch(error){fleetError=error?.message||String(error);console.warn('[autoreisen] No se pudo leer la flota completa; se conserva la consulta del coche reservado.',fleetError);}\n  if(!result){\n    result=await monitorAutoReisen(browser,config);\n    if(fleetScan?.fleet?.length){result.fleet=fleetScan.fleet;result.fleetTotalCount=fleetScan.fleet.length;result.fleetSelection={all:config.fleetTrackAll!==false,groups:Array.isArray(config.fleetTrackGroups)?config.fleetTrackGroups:[]};}\n    if(fleetError)result.fleetWarning=fleetError;\n  }\n  const notices=[];const current=Number(result.total||result.price)||0;const prior=Number(previous.result?.total||previous.result?.price)||0;const reserved=Number(config.reservedPrice)||0;\n  const hadPreviousError=Boolean(previous.lastError);\n  const dropAmount=prior>current?prior-current:0,dropPercent=prior>0?dropAmount/prior*100:0,minDropAmount=Math.max(0,Number(config.telegramMinDropAmount)||0),minDropPercent=Math.max(0,Number(config.telegramMinDropPercent)||0);\n  const dropMeetsLimits=dropAmount>0&&(minDropAmount<=0||dropAmount>=minDropAmount)&&(minDropPercent<=0||dropPercent>=minDropPercent);\n  if(config.telegramNotifyPriceDrop&&prior>0&&current>0&&current<prior&&dropMeetsLimits)notices.push(`📉 Baja de precio: ${moneyText(prior)} → ${moneyText(current)} (-${moneyText(dropAmount)}, -${dropPercent.toFixed(1)}%)`);\n  if(config.telegramNotifyBelowReserved&&reserved>0&&current>0&&current<reserved&&(prior<=0||prior>=reserved))notices.push(`✅ Por debajo de tu reserva: ${moneyText(current)} (reservado ${moneyText(reserved)})`);\n  if(config.telegramNotifyAvailability&&previous.result?.availability&&result.availability!==previous.result.availability)notices.push(`🚗 Disponibilidad: ${previous.result.availability} → ${result.availability}`);\n  if(config.telegramNotifyRecovery&&hadPreviousError)notices.push(`🟢 Monitor recuperado tras el error anterior.`);\n  await postResult('autoreisen',{...result,ok:true,status:'ok',checkedAt:result.checkedAt||isoNow()});\n  if(config.telegramEnabled&&(config.telegramNotifyEveryCheck||notices.length)){\n    const difference=reserved>0?current-reserved:0;\n    const trend=prior<=0?'ℹ️ Primera comprobación correcta.':current<prior?`📉 Precio ${moneyText(prior-current)} más bajo que en la comprobación anterior.`:current>prior?`📈 Precio ${moneyText(current-prior)} más alto que en la comprobación anterior.`:'➖ Sin cambio respecto a la comprobación anterior.';\n    const formatPoint=value=>{const [date,time='']=String(value||'').split('T');const [year,month,day]=date.split('-');return year&&month&&day?`${day}/${month} ${time.slice(0,5)}`:String(value||'');};\n    const days=daysBetween(config.pickupAt,config.dropoffAt);\n    const differenceText=reserved>0?`${difference>=0?'+':''}${moneyText(difference)}`:'—';\n    const lines=[\n      '🚗 MFE Viajes · AutoReisen',\n      ...(notices.length?notices:['✅ Comprobación correcta']),\n      `Precio actual: ${moneyText(current)}`,\n      `Reserva: ${reserved>0?moneyText(reserved):'—'}`,\n      `Diferencia vs reserva: ${differenceText}`,\n      trend,\n      `${config.model||'Vehículo'}${config.group?` · Grupo ${config.group}`:''}`,\n      `${days} ${days===1?'día':'días'} · ${formatPoint(config.pickupAt)} → ${formatPoint(config.dropoffAt)}`,\n      `Disponibilidad: ${result.availability||'Disponible'}`\n    ];\n    const fleetRows=filterFleetForTracking((Array.isArray(result.fleet)?result.fleet:[]),config).filter(x=>Number(x?.total||0)>0).sort((a,b)=>Number(a.total)-Number(b.total));\n    if(fleetRows.length){const cheapest=fleetRows[0];lines.push(`Flota visible: ${fleetRows.length} vehículos${result.fleetTotalCount&&result.fleetTotalCount!==fleetRows.length?` de ${result.fleetTotalCount}`:''}`);lines.push(`Más barato: Grupo ${cheapest.group} · ${cheapest.model} · ${moneyText(cheapest.total)}`);}\n    try{await sendTelegram(lines.join('\\n'));}catch(error){console.error('Telegram:',error.message);process.exitCode=1;}\n  }\n  console.log('[autoreisen] OK',result);\n}catch(error){\n  const result={ok:false,status:'error',error:error?.message||String(error),checkedAt:isoNow(),source:'GitHub Actions + Playwright'};\n  console.error('[autoreisen] ERROR',error);\n  try{await postResult('autoreisen',result);}catch(postError){console.error('No se pudo registrar el error en el Worker:',postError.message);}\n  if(config.telegramEnabled&&config.telegramNotifyError){try{await sendTelegram(`🔴 MFE Viajes · Error AutoReisen\\n${result.error}`);}catch(telegramError){console.error('Telegram:',telegramError.message);}}\n  process.exitCode=1;\n}finally{await browser.close();}\n";
const AUTOREISEN_FILE_2 = "// MFE_AUTOREISEN_AUTOMATION_VERSION: 2.2.23\nimport {acceptCookies,clickFirst,daysBetween,fillFirst,isoNow,money,snapshot} from './lib.mjs';\n\nconst MONTH_TOKENS={\n  1:['ene','jan','january','enero'],2:['feb','february','febrero'],3:['mar','march','marzo'],4:['abr','apr','april','abril'],\n  5:['may','mayo'],6:['jun','june','junio'],7:['jul','july','julio'],8:['ago','aug','august','agosto'],\n  9:['sep','sept','september','septiembre'],10:['oct','october','octubre'],11:['nov','november','noviembre'],12:['dic','dec','december','diciembre']\n};\nconst OFFICE_IDS=new Map([\n  ['tenerife norte','1'],['tfn','1'],['tenerife sur','2'],['tfs','2'],['lanzarote','3'],['ace','3'],\n  ['gran canaria aeropuerto','18'],['gran canaria airport','18'],['gran canaria aerodrome','18'],['lpa','18'],['fuerteventura','19'],['fue','19']\n]);\nconst MODEL_STOPWORDS=new Set(['o','or','oder','ou','similar','similaire','similarer','similaren','similarmente','tsi','reference']);\nconst KNOWN_CAR_IDS=new Map([['seat arona','119']]);\n\nfunction normalize(value=''){return String(value).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();}\nfunction dateParts(value){\n  const raw=String(value||'');const d=new Date(raw);return {date:raw.slice(0,10),day:String(d.getDate()).padStart(2,'0'),month:d.getMonth()+1,year:String(d.getFullYear()),hour:String(d.getHours()).padStart(2,'0'),minute:String(d.getMinutes()).padStart(2,'0')};\n}\nfunction resultsEntryUrl(raw){\n  try{\n    const url=new URL(String(raw||'https://www.autoreisen.com/alquiler-coches/alquiler-de-coches.php'));\n    if(/\\/alquiler-coches\\//i.test(url.pathname))url.pathname='/alquiler-coches/tarifas-flota.php';\n    else if(/\\/car-hire\\//i.test(url.pathname))url.pathname='/car-hire/rates-fleet.php';\n    else url.pathname='/alquiler-coches/tarifas-flota.php';\n    url.search='';url.hash='';return url.toString();\n  }catch{return 'https://www.autoreisen.com/alquiler-coches/tarifas-flota.php';}\n}\nfunction officeId(label=''){\n  const text=normalize(label).replace(/\\bde\\b/g,' ').replace(/\\s+/g,' ').trim();\n  for(const [key,value] of OFFICE_IDS){if(text===key||text.includes(key))return value;}\n  return '';\n}\nfunction knownCarId(model=''){const n=normalize(model);for(const [key,id] of KNOWN_CAR_IDS){if(n.includes(key))return id;}return '';}\nfunction directResultUrl(config){\n  const pick=dateParts(config.pickupAt),drop=dateParts(config.dropoffAt);const url=new URL(resultsEntryUrl(process.env.AUTOREISEN_SEARCH_URL||config.searchUrl));\n  const rec=String(config.pickupOfficeId||'').trim()||officeId(config.pickup),dev=String(config.dropoffOfficeId||'').trim()||officeId(config.dropoff),car=String(config.carId||'').trim()||knownCarId(config.model);\n  if(rec)url.searchParams.set('ofi_rec',rec);if(dev)url.searchParams.set('ofi_dev',dev);\n  // AutoReisen solo entra de forma consistente en la lista de tarifas cuando la URL incluye un coche conocido.\n  // El ID no se usa para leer el precio: después se vuelve a validar modelo, fechas y duración visibles.\n  if(car){url.searchParams.set('coche',car);url.searchParams.set('id_coche',car);}\n  url.searchParams.set('dia_inicio',String(Number(pick.day)));url.searchParams.set('mes_inicio',`${pick.month}-${pick.year}`);\n  url.searchParams.set('hora_inicio',`${pick.hour}:${pick.minute}`);\n  url.searchParams.set('dia_final',String(Number(drop.day)));url.searchParams.set('mes_final',`${drop.month}-${drop.year}`);\n  url.searchParams.set('hora_final',`${drop.hour}:${drop.minute}`);url.searchParams.set('fin','1');\n  return url.toString();\n}\nfunction modelTokens(value=''){return normalize(value).split(' ').filter(token=>token.length>1&&!MODEL_STOPWORDS.has(token));}\nfunction targetIndex(lines,config){\n  const tokens=modelTokens(config.model);\n  if(tokens.length){\n    const candidates=lines.map((line,index)=>({index,text:normalize(line)})).filter(item=>tokens.every(token=>item.text.includes(token)));\n    return candidates.length?candidates[0].index:-1;\n  }\n  const group=String(config.group||'').trim().replace(/[^a-z0-9]/gi,'');\n  if(group){const re=new RegExp(`^${group}\\s*[-–—:]`,'i');const i=lines.findIndex(x=>re.test(x.trim()));if(i>=0)return i;}\n  return -1;\n}\nfunction groupVehicleLines(lines,group){const value=String(group||'').trim().replace(/[^a-z0-9]/gi,'');if(!value)return [];const re=new RegExp(`^${value}\\\\s*[-–—:]`,'i');return lines.filter(line=>re.test(line.trim())).slice(0,8);}\nfunction extractTotal(lines,index){\n  if(index<0)return 0;const block=lines.slice(index,index+16).join(' ');\n  const euroTotals=[...block.matchAll(/([0-9]{1,4}(?:[.,][0-9]{2}))\\s*€\\s*(?:Reservar|Reserve|Reserver|Reservieren)/gi)].map(m=>Number(m[1].replace(',','.'))).filter(Number.isFinite);\n  if(euroTotals.length)return euroTotals[0];\n  const prices=money(block).filter(v=>v>0&&v<5000);return prices.length?Math.max(...prices):0;\n}\nfunction dateAppears(text,part){\n  const n=normalize(text),day=String(Number(part.day)),year=part.year,tokens=MONTH_TOKENS[part.month]||[];\n  return n.includes(year)&&tokens.some(token=>new RegExp(`\\\\b${day}\\\\s*[- /]?\\\\s*${token}`,'i').test(n)||new RegExp(`\\\\b${day}\\\\s+${token}`,'i').test(n));\n}\nfunction expectedRentalDays(config){return Math.max(1,Math.ceil((new Date(config.dropoffAt)-new Date(config.pickupAt))/86400000));}\nfunction rentalDurationAppears(text,config){\n  const days=expectedRentalDays(config),n=normalize(text);\n  return new RegExp(`\\\\b${days}\\\\s*(?:dias?|days?|jours?|tage?n?)\\\\b`,'i').test(n);\n}\nfunction resultsLookValid(text,config){\n  const pick=dateParts(config.pickupAt),drop=dateParts(config.dropoffAt);\n  return /mostrando precios|prices for|tarifas|precios para|recogida|pick up/i.test(text)&&dateAppears(text,pick)&&dateAppears(text,drop)&&rentalDurationAppears(text,config);\n}\nfunction fleetResultPageLooksValid(text,config,{submitted=false,url=''}={}){\n  const pick=dateParts(config.pickupAt),drop=dateParts(config.dropoffAt),marker=/mostrando precios|prices for|tarifas|precios para|recogida|pick up|reservar|reserve/i.test(text);\n  const datesVisible=dateAppears(text,pick)&&dateAppears(text,drop);\n  let queryMatches=false;\n  try{\n    const u=new URL(String(url||''));\n    const month=(part,key)=>String(u.searchParams.get(key)||'').replace(/^0+/,'')===`${Number(part.month)}-${part.year}`;\n    const day=(part,key)=>String(u.searchParams.get(key)||'').replace(/^0+/,'')===String(Number(part.day));\n    const time=(part,key)=>String(u.searchParams.get(key)||'').slice(0,5)===`${part.hour}:${part.minute}`;\n    queryMatches=day(pick,'dia_inicio')&&month(pick,'mes_inicio')&&time(pick,'hora_inicio')&&day(drop,'dia_final')&&month(drop,'mes_final')&&time(drop,'hora_final');\n  }catch{}\n  // En la flota completa no exigimos que AutoReisen imprima literalmente “8 días”.\n  // La página ha sido enviada por nosotros con los selectores exactos y algunas variantes\n  // no muestran la duración como texto aunque sí respeten fechas y horas.\n  return marker&&(datesVisible||queryMatches||submitted);\n}\nasync function safeText(page){return page.locator('body').innerText({timeout:12000}).catch(()=> '');}\nconst AUTOREISEN_VERIFY_RE=/please wait|request is being verified|verifying|comprobando su navegador|un momento|espere mientras se verifica|verifica(?:ndo)? su solicitud/i;\nasync function prepareAutoReisenContext(context){\n  await context.addInitScript(()=>{\n    try{Object.defineProperty(Navigator.prototype,'webdriver',{get:()=>false,configurable:true});}catch{}\n    try{Object.defineProperty(navigator,'webdriver',{get:()=>false,configurable:true});}catch{}\n  }).catch(()=>{});\n}\nasync function waitThroughAutoReisenVerification(page,{timeoutMs=30000}={}){\n  const started=Date.now();let text='';let seen=false;\n  while(Date.now()-started<timeoutMs){\n    text=await safeText(page);\n    const title=await page.title().catch(()=> '');\n    const challenged=AUTOREISEN_VERIFY_RE.test(`${title}\n${text}`);\n    if(!challenged)return {text,challenge:false,seen};\n    seen=true;\n    await page.waitForLoadState('domcontentloaded',{timeout:3500}).catch(()=>{});\n    await page.waitForTimeout(1800);\n  }\n  text=await safeText(page);\n  return {text,challenge:AUTOREISEN_VERIFY_RE.test(`${await page.title().catch(()=> '')}\n${text}`),seen};\n}\nasync function openCandidate(page,url){\n  await page.goto(url,{waitUntil:'commit',timeout:45000});await page.waitForLoadState('domcontentloaded',{timeout:18000}).catch(()=>{});\n  const verified=await waitThroughAutoReisenVerification(page,{timeoutMs:30000});\n  if(verified.challenge)await snapshot(page,'autoreisen-verificacion').catch(()=>{});\n  else await page.waitForTimeout(1200);\n  return verified;\n}\nasync function selectByPredicate(select,predicate){const options=await select.locator('option').evaluateAll(nodes=>nodes.map(o=>({value:o.value,text:(o.textContent||'').trim()}))).catch(()=>[]);const match=options.find(predicate);if(!match)return false;await select.selectOption(match.value);return true;}\nasync function selectOffice(select,label,id=''){const wanted=normalize(label),words=wanted.split(' ').filter(x=>x.length>2),target=String(id||'').trim();if(target){const exact=await selectByPredicate(select,o=>String(o.value).trim()===target);if(exact)return true;}return selectByPredicate(select,o=>{const text=normalize(o.text);return words.length?words.every(w=>text.includes(w)):text.includes(wanted);});}\nasync function selectDay(select,part){return selectByPredicate(select,o=>String(o.text).trim().replace(/^0/,'')===String(Number(part.day))||String(o.value).replace(/^0/,'')===String(Number(part.day)));}\nasync function selectMonth(select,part){const tokens=MONTH_TOKENS[part.month]||[];return selectByPredicate(select,o=>{const text=normalize(`${o.text} ${o.value}`).replace(/\\s+/g,'');return (text.includes(part.year)&&tokens.some(t=>text.includes(t)))||String(o.value)===`${part.month}-${part.year}`;});}\nasync function selectTime(select,part){const wanted=`${part.hour}:${part.minute}`;const exact=await selectByPredicate(select,o=>String(o.text).trim()===wanted||String(o.value).trim()===wanted);if(exact)return true;return selectByPredicate(select,o=>String(o.text).trim().startsWith(`${part.hour}:`)||String(o.value).trim().startsWith(`${part.hour}:`));}\nasync function firstExisting(root,selectors){for(const selector of selectors){const loc=root.locator(selector).first();if(await loc.count().catch(()=>0))return loc;}return null;}\nasync function submitLegacyForm(page,form){\n  if(!form||!await form.count().catch(()=>0))return false;\n  const beforeUrl=page.url(),beforeText=(await safeText(page)).slice(0,5000);\n  const navigation=page.waitForNavigation({waitUntil:'domcontentloaded',timeout:35000}).catch(()=>null);\n  let submitted=false;\n  // AutoReisen usa en algunas variantes un input type=image, que no estaba cubierto por las versiones anteriores.\n  const clickable=form.locator('input[type=\"submit\"],button[type=\"submit\"],input[type=\"image\"],button:not([type])').last();\n  if(await clickable.count().catch(()=>0)){\n    submitted=await clickable.click({force:true}).then(()=>true).catch(()=>false);\n  }\n  if(!submitted){\n    submitted=await form.evaluate(el=>{\n      try{\n        if(typeof el.requestSubmit==='function'){el.requestSubmit();return true;}\n        HTMLFormElement.prototype.submit.call(el);return true;\n      }catch{return false;}\n    }).catch(()=>false);\n  }\n  if(!submitted)return false;\n  await navigation;await page.waitForLoadState('domcontentloaded',{timeout:12000}).catch(()=>{});await page.waitForTimeout(2500);\n  const afterText=await safeText(page);\n  return page.url()!==beforeUrl||afterText.slice(0,5000)!==beforeText||/mostrando precios|prices for|prix montr/i.test(afterText);\n}\nasync function revealSearchForm(page){\n  const visible=page.locator('select:visible');if(await visible.count().catch(()=>0)>=6)return;\n  const trigger=page.getByText(/nueva b.squeda|new search|nouvelle recherche|cambiar|change/i).last();\n  if(await trigger.isVisible().catch(()=>false)){await trigger.click().catch(()=>{});await page.waitForTimeout(700);}\n}\nasync function formStateSummary(page){\n  const form=page.locator('form').filter({has:page.locator('select')}).last();\n  if(!await form.count().catch(()=>0))return '';\n  return form.evaluate(el=>{\n    const selects=[...el.querySelectorAll('select')].slice(0,10).map((s,i)=>{const o=s.options?.[s.selectedIndex];return `${i}:${s.name||s.id||'?'}=${s.value||''}[${(o?.textContent||'').trim()}]`;});\n    const submits=[...el.querySelectorAll('input[type=\"submit\"],input[type=\"image\"],button')].slice(0,5).map(x=>`${x.tagName.toLowerCase()}:${x.type||''}:${x.name||x.id||x.value||''}`);\n    return `form ${el.method||'get'} ${el.action||''}; ${selects.join('; ')}; submit=${submits.join(',')}`;\n  }).catch(()=> '');\n}\nasync function fillNamedLegacyForm(page,cfg){\n  const pick=dateParts(cfg.pickupAt),drop=dateParts(cfg.dropoffAt);\n  let form=page.locator('form').filter({has:page.locator('select[name=\"ofi_rec\"]')}).first();\n  if(!await form.count().catch(()=>0))form=page.locator('form').filter({hasText:/oficina de recogida|pick.?up office/i}).last();\n  if(!await form.count().catch(()=>0))return false;\n  const rec=await firstExisting(form,['select[name=\"ofi_rec\"]','select[name*=\"ofi_rec\" i]']);const dev=await firstExisting(form,['select[name=\"ofi_dev\"]','select[name*=\"ofi_dev\" i]']);\n  const d1=await firstExisting(form,['select[name=\"dia_inicio\"]','select[name*=\"dia_inicio\" i]']);const m1=await firstExisting(form,['select[name=\"mes_inicio\"]','select[name*=\"mes_inicio\" i]']);const h1=await firstExisting(form,['select[name=\"hora_inicio\"]','select[name*=\"hora_inicio\" i]','select[name*=\"hora\" i]']);\n  const d2=await firstExisting(form,['select[name=\"dia_final\"]','select[name*=\"dia_final\" i]']);const m2=await firstExisting(form,['select[name=\"mes_final\"]','select[name*=\"mes_final\" i]']);\n  let timeSelects=form.locator('select').filter({has:page.locator('option')});\n  const allSelects=form.locator('select');\n  const h2=await firstExisting(form,['select[name=\"hora_final\"]','select[name*=\"hora_final\" i]']);\n  if(!rec||!dev||!d1||!m1||!d2||!m2)return false;\n  const same=String(cfg.pickupOfficeId||'')&&String(cfg.pickupOfficeId||'')===String(cfg.dropoffOfficeId||'')||normalize(cfg.pickup)===normalize(cfg.dropoff);const okRec=await selectOffice(rec,cfg.pickup,cfg.pickupOfficeId);let okDev=false;\n  if(same)okDev=await selectByPredicate(dev,o=>/misma oficina|same office|meme agence|gleiche/i.test(o.text));if(!okDev)okDev=await selectOffice(dev,cfg.dropoff,cfg.dropoffOfficeId);\n  const ok=[okRec,okDev,await selectDay(d1,pick),await selectMonth(m1,pick),await selectDay(d2,drop),await selectMonth(m2,drop)];\n  if(h1)ok.push(await selectTime(h1,pick));if(h2)ok.push(await selectTime(h2,drop));\n  // Fallback for hour selects when their names are not descriptive: use select positions 4 and 7 in the search form.\n  if(!h1&&await allSelects.count()>=5)ok.push(await selectTime(allSelects.nth(4),pick));if(!h2&&await allSelects.count()>=8)ok.push(await selectTime(allSelects.nth(7),drop));\n  if(ok.some(v=>!v))return false;\n  return submitLegacyForm(page,form);\n}\nasync function fillPositionalLegacyForm(page,cfg){\n  const selects=page.locator('select:visible');const count=await selects.count();if(count<8)return false;const pick=dateParts(cfg.pickupAt),drop=dateParts(cfg.dropoffAt),same=normalize(cfg.pickup)===normalize(cfg.dropoff);\n  const okPick=await selectOffice(selects.nth(0),cfg.pickup,cfg.pickupOfficeId);let okDrop=false;if(same)okDrop=await selectByPredicate(selects.nth(1),o=>/misma oficina|same office|meme agence|gleiche/i.test(o.text));if(!okDrop)okDrop=await selectOffice(selects.nth(1),cfg.dropoff,cfg.dropoffOfficeId);\n  const values=await Promise.all([selectDay(selects.nth(2),pick),selectMonth(selects.nth(3),pick),selectTime(selects.nth(4),pick),selectDay(selects.nth(5),drop),selectMonth(selects.nth(6),drop),selectTime(selects.nth(7),drop)]);\n  if(!okPick||!okDrop||values.some(v=>!v))return false;const form=selects.nth(0).locator('xpath=ancestor::form[1]');if(await submitLegacyForm(page,form))return true;return clickFirst(page,[page.getByRole('button',{name:/buscar|consultar|ver precios|new search|search|presupuest/i}).first(),page.locator('input[type=\"image\"]').last()]);\n}\nasync function fillModernForm(page,cfg){\n  const pick=dateParts(cfg.pickupAt),drop=dateParts(cfg.dropoffAt);await fillFirst(page,[page.getByLabel(/recogida|pickup/i).first(),'input[name*=\"pickup\" i]'],cfg.pickup);await fillFirst(page,[page.getByLabel(/devolución|devolucion|drop.?off|return/i).first(),'input[name*=\"drop\" i],input[name*=\"return\" i]'],cfg.dropoff);\n  const dates=page.locator('input[type=\"date\"]');if(await dates.count()>=2){await dates.nth(0).fill(pick.date).catch(()=>{});await dates.nth(1).fill(drop.date).catch(()=>{});}const times=page.locator('input[type=\"time\"]');if(await times.count()>=2){await times.nth(0).fill(`${pick.hour}:${pick.minute}`).catch(()=>{});await times.nth(1).fill(`${drop.hour}:${drop.minute}`).catch(()=>{});}return clickFirst(page,[page.getByRole('button',{name:/buscar|consultar|ver precios|continuar|new quote/i}).first(),page.locator('button[type=\"submit\"],input[type=\"submit\"]').first()]);\n}\nfunction sameVehicle(row,config){\n  const wanted=modelTokens(config?.model||'');\n  const rowTokens=modelTokens(row?.model||'');\n  if(wanted.length&&wanted.every(token=>rowTokens.includes(token)||normalize(row?.model).includes(token)))return true;\n  const group=normalize(config?.group||'').replace(/\\s+/g,'');\n  return Boolean(group)&&normalize(row?.group||'').replace(/\\s+/g,'')===group;\n}\nfunction enrichFleetImage(fleet=[],config={},imageUrl=''){\n  const url=String(imageUrl||'').trim();if(!url)return fleet;\n  let used=false;return (Array.isArray(fleet)?fleet:[]).map(row=>{\n    if(!used&&sameVehicle(row,config)){used=true;return {...row,imageUrl:url};}\n    return row;\n  });\n}\nasync function vehicleDomMeta(page,config={}){\n  return page.evaluate(({model,group,strictModel})=>{\n    const norm=value=>String(value||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();\n    const stop=new Set(['o','or','oder','ou','similar','similaire','similarer','similaren','similarmente','tsi','reference']);\n    const tokens=norm(model).split(' ').filter(x=>x.length>1&&!stop.has(x));\n    const groupText=norm(group).replace(/\\s+/g,'');\n    strictModel=Boolean(strictModel);\n    const matchesText=text=>{\n      const n=norm(text);if(!n)return false;\n      if(tokens.length&&tokens.every(token=>n.includes(token)))return true;\n      if(strictModel&&tokens.length)return false;\n      if(groupText){const compact=n.replace(/\\s+/g,'');if(compact.startsWith(groupText))return true;}\n      return false;\n    };\n    const badImage=/\\b(?:ico|icon|logo|magnifier|lupa|facebook|twitter|youtube|instagram|spinner|loading|cookie|flag|bandera|mp3|air|ac-|puerta|plaza|direccion)\\b/i;\n    const scoreImg=img=>{\n      const src=String(img.currentSrc||img.src||'').trim();if(!/^https?:/i.test(src)||badImage.test(src))return null;\n      const r=img.getBoundingClientRect();const w=Math.max(Number(img.naturalWidth)||0,r.width||0),h=Math.max(Number(img.naturalHeight)||0,r.height||0);\n      let score=Math.min(60,(w*h)/6000);if(w>=180&&h>=80)score+=35;if(w>h*1.2)score+=15;\n      const text=norm(`${img.alt||''} ${img.title||''} ${img.className||''} ${src}`);if(/coche|car|vehic|fleet|flota|arona|seat/.test(text))score+=35;\n      return {url:src,score};\n    };\n    const anchors=[...document.querySelectorAll('a[href*=\"lightbox01.php\"],a[href*=\"lightbox\" i]')];\n    const candidates=[];\n    for(const anchor of anchors){\n      let node=anchor,bestNode=null,bestText='';\n      for(let depth=0;node&&depth<9;depth++,node=node.parentElement){\n        const text=String(node.innerText||node.textContent||'').replace(/\\s+/g,' ').trim();\n        if(matchesText(text)&&text.length<2600){bestNode=node;bestText=text;break;}\n      }\n      if(!bestNode)continue;\n      let image=null;for(const img of bestNode.querySelectorAll('img')){const row=scoreImg(img);if(row&&(!image||row.score>image.score))image=row;}\n      let score=1000-Math.min(700,bestText.length/3);if(tokens.length&&tokens.every(x=>norm(bestText).includes(x)))score+=250;if(/reservar|reserve|precio|día|dia/i.test(bestText))score+=80;if(image)score+=image.score;\n      candidates.push({score,lightboxUrl:String(anchor.href||''),directImageUrl:image?.url||''});\n    }\n    if(!candidates.length){\n      const nodes=[...document.querySelectorAll('h1,h2,h3,h4,strong,b,div,td,span,p')].filter(el=>matchesText(el.innerText||el.textContent||'')).sort((a,b)=>String(a.innerText||'').length-String(b.innerText||'').length).slice(0,25);\n      for(const start of nodes){\n        let node=start;\n        for(let depth=0;node&&depth<7;depth++,node=node.parentElement){\n          const text=String(node.innerText||node.textContent||'').replace(/\\s+/g,' ').trim();if(text.length>3500)break;\n          const link=node.querySelector('a[href*=\"lightbox01.php\"],a[href*=\"lightbox\" i]');\n          let image=null;for(const img of node.querySelectorAll('img')){const row=scoreImg(img);if(row&&(!image||row.score>image.score))image=row;}\n          if(link||image){candidates.push({score:700-Math.min(500,text.length/4)+(image?.score||0),lightboxUrl:String(link?.href||''),directImageUrl:image?.url||''});break;}\n        }\n      }\n    }\n    candidates.sort((a,b)=>b.score-a.score);return candidates[0]||{lightboxUrl:'',directImageUrl:''};\n  },{model:String(config.model||''),group:String(config.group||''),strictModel:Boolean(config.strictModel)}).catch(()=>({lightboxUrl:'',directImageUrl:''}));\n}\nasync function bestVisualUrl(page){\n  return page.evaluate(()=>{\n    const bad=/\\b(?:ico|icon|logo|magnifier|lupa|facebook|twitter|youtube|instagram|spinner|loading|cookie|flag|bandera|mp3|air|ac-|puerta|plaza|direccion)\\b/i;\n    const rows=[];\n    const add=(url,w=0,h=0,text='')=>{try{const abs=new URL(String(url||''),location.href).href;if(!/^https?:/i.test(abs)||bad.test(abs))return;let score=Math.min(120,(Math.max(0,w)*Math.max(0,h))/5000);if(w>=250&&h>=120)score+=70;if(w>h*1.15)score+=25;if(/coche|car|vehic|fleet|flota|arona|seat/i.test(`${text} ${abs}`))score+=50;rows.push({url:abs,score});}catch{}};\n    for(const img of document.images){const r=img.getBoundingClientRect();add(img.currentSrc||img.src,Math.max(img.naturalWidth||0,r.width||0),Math.max(img.naturalHeight||0,r.height||0),`${img.alt||''} ${img.title||''} ${img.className||''}`);}\n    for(const el of document.querySelectorAll('*')){const r=el.getBoundingClientRect();if(r.width<180||r.height<80)continue;const bg=getComputedStyle(el).backgroundImage||'';const m=bg.match(/url\\([\"']?([^\"')]+)[\"']?\\)/i);if(m)add(m[1],r.width,r.height,`${el.className||''} ${el.id||''}`);}\n    rows.sort((a,b)=>b.score-a.score);return rows[0]?.url||'';\n  }).catch(()=>'');\n}\nasync function selectedVehicleImage(page,config={}){\n  const meta=await vehicleDomMeta(page,config);if(meta.directImageUrl)return meta.directImageUrl;\n  if(!meta.lightboxUrl)return '';\n  const detail=await page.context().newPage();\n  try{\n    await detail.goto(meta.lightboxUrl,{waitUntil:'domcontentloaded',timeout:30000});await detail.waitForTimeout(1200);\n    return await bestVisualUrl(detail);\n  }catch{return '';}finally{await detail.close().catch(()=>{});}\n}\nasync function fleetImagesFromDom(page,fleet=[]){\n  if(!Array.isArray(fleet)||!fleet.length)return new Map();\n  const rows=await page.evaluate(items=>{\n    const norm=v=>String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();\n    const stop=new Set(['o','or','similar','tsi','reference','automatic','family','hybrid','pax','puretech','connect']);\n    const wanted=items.map((row,index)=>({index,group:norm(row.group),model:norm(row.model),tokens:norm(row.model).split(' ').filter(t=>t.length>1&&!stop.has(t))}));\n    const bad=/\\b(?:ico|icon|logo|magnifier|lupa|facebook|twitter|youtube|instagram|spinner|loading|cookie|flag|bandera|mp3|air|ac-|puerta|plaza|direccion)\\b/i;\n    const candidates=[];\n    for(const img of document.images){\n      const raw=String(img.currentSrc||img.src||'').trim();if(!raw)continue;let src='';try{src=new URL(raw,location.href).href;}catch{continue;}if(!/^https?:/i.test(src)||bad.test(src))continue;\n      const rect=img.getBoundingClientRect(),w=Math.max(img.naturalWidth||0,rect.width||0),h=Math.max(img.naturalHeight||0,rect.height||0);if(w<120||h<55)continue;\n      let node=img,localText='';\n      for(let depth=0;node&&depth<6;depth++,node=node.parentElement){const text=String(node.innerText||node.textContent||'').replace(/\\s+/g,' ').trim();if(text&&text.length<=1100){localText=text;if(text.length>=25)break;}}\n      const n=norm(`${localText} ${img.alt||''} ${img.title||''}`);if(!n)continue;\n      for(const row of wanted){const matched=row.tokens.filter(t=>n.includes(t)).length;const exact=row.tokens.length>0&&matched===row.tokens.length;const sufficient=row.tokens.length===1?matched===1:matched>=Math.min(2,row.tokens.length);if(!exact&&!sufficient)continue;let score=matched*70+(exact?180:0);if(row.group&&new RegExp(`(?:^| )${row.group}(?: |$)`).test(n))score+=25;if(w>=180&&h>=80)score+=30;if(w>h*1.1)score+=15;if(/coche|car|vehic|flota|fleet/.test(n))score+=10;candidates.push({index:row.index,url:src,score});}\n    }\n    candidates.sort((a,b)=>b.score-a.score);const assignedRows=new Set(),usedUrls=new Set(),out=[];\n    for(const candidate of candidates){if(assignedRows.has(candidate.index)||usedUrls.has(candidate.url))continue;assignedRows.add(candidate.index);usedUrls.add(candidate.url);out.push(candidate);}\n    return out;\n  },fleet.map(row=>({group:row.group,model:row.model}))).catch(()=>[]);\n  return new Map(rows.map(row=>[Number(row.index),String(row.url||'')]).filter(([,url])=>url));\n}\nasync function fleetLightboxesFromDom(page,fleet=[]){\n  if(!Array.isArray(fleet)||!fleet.length)return new Map();\n  const rows=await page.evaluate(items=>{\n    const norm=v=>String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();\n    const stop=new Set(['o','or','oder','ou','similar','similaire','similarer','similaren','similarmente','tsi','reference','automatic','family','hybrid','pax','puretech','connect','auto']);\n    const wanted=items.map((row,index)=>({index,group:norm(row.group),model:norm(row.model),tokens:norm(row.model).split(' ').filter(t=>t.length>1&&!stop.has(t))}));\n    const candidates=[];\n    for(const anchor of document.querySelectorAll('a[href*=\"lightbox01.php\"],a[href*=\"lightbox\" i]')){\n      const href=String(anchor.href||'').trim();if(!href)continue;\n      let node=anchor,bestText='';\n      for(let depth=0;node&&depth<9;depth++,node=node.parentElement){const text=String(node.innerText||node.textContent||'').replace(/\\s+/g,' ').trim();if(text&&text.length<=1800){bestText=text;if(text.length>=20)break;}}\n      const n=norm(bestText);if(!n)continue;\n      for(const row of wanted){const matched=row.tokens.filter(t=>n.includes(t)).length;const exact=row.tokens.length>0&&matched===row.tokens.length;const enough=row.tokens.length<=2?matched===row.tokens.length:matched>=Math.min(2,row.tokens.length);if(!exact&&!enough)continue;let score=matched*90+(exact?260:0);if(row.group&&new RegExp(`(?:^| )${row.group}(?: |$)`).test(n))score+=35;if(/reservar|reserve|precio|dia|día/.test(n))score+=20;candidates.push({index:row.index,url:href,score});}\n    }\n    candidates.sort((a,b)=>b.score-a.score);const out=[],usedRows=new Set(),usedUrls=new Set();for(const row of candidates){if(usedRows.has(row.index)||usedUrls.has(row.url))continue;usedRows.add(row.index);usedUrls.add(row.url);out.push(row);}return out;\n  },fleet.map(row=>({group:row.group,model:row.model}))).catch(()=>[]);\n  return new Map(rows.map(row=>[Number(row.index),String(row.url||'')]).filter(([,url])=>url));\n}\nasync function imageFromLightboxUrl(page,url=''){\n  const href=String(url||'').trim();if(!href)return '';\n  const detail=await page.context().newPage();try{await detail.goto(href,{waitUntil:'domcontentloaded',timeout:30000});await detail.waitForTimeout(850);return await bestVisualUrl(detail);}catch{return '';}finally{await detail.close().catch(()=>{});}\n}\nasync function enrichFleetImages(page,fleet=[],config={},selectedImage=''){\n  const rows=(Array.isArray(fleet)?fleet:[]).map(row=>({...row,imageUrl:''}));\n  const images=await fleetImagesFromDom(page,rows).catch(()=>new Map()),usedUrls=new Set();\n  rows.forEach((row,index)=>{const url=String(images.get(index)||'').trim();if(url&&!usedUrls.has(url)){row.imageUrl=url;usedUrls.add(url);}});\n  // AutoReisen enlaza cada ficha a un lightbox distinto. Resolvemos esos enlaces en lote\n  // para obtener la foto real del modelo incluso cuando la miniatura no está expuesta como <img>.\n  const lightboxes=await fleetLightboxesFromDom(page,rows).catch(()=>new Map());\n  for(let index=0;index<rows.length;index++){if(String(rows[index]?.imageUrl||'').trim())continue;const href=String(lightboxes.get(index)||'').trim();if(!href)continue;const url=String(await imageFromLightboxUrl(page,href).catch(()=>'' )||'').trim();if(url&&!usedUrls.has(url)){rows[index].imageUrl=url;usedUrls.add(url);}}\n  // Si una miniatura no está en el DOM, buscamos el lightbox por el nombre exacto del modelo.\n  // Una misma URL nunca se puede asignar a dos coches: es preferible dejar una ficha sin foto\n  // que repetir incorrectamente la imagen de otro modelo.\n  for(let index=0;index<rows.length;index++){\n    if(String(rows[index]?.imageUrl||'').trim())continue;const row=rows[index];\n    const url=String(await selectedVehicleImage(page,{...config,group:row.group,model:row.model,carId:row.carId||'',strictModel:true}).catch(()=>'')||'').trim();\n    if(url&&!usedUrls.has(url)){rows[index].imageUrl=url;usedUrls.add(url);}\n  }\n  const selectedUrl=String(selectedImage||'').trim();if(selectedUrl&&!usedUrls.has(selectedUrl)){\n    const selected=rows.find(row=>sameVehicle(row,config));if(selected&&!String(selected.imageUrl||'').trim()){selected.imageUrl=selectedUrl;usedUrls.add(selectedUrl);}\n  }\n  return rows;\n}\nfunction fleetFromLines(lines,config={}){\n  const out=[],seen=new Set(),days=expectedRentalDays(config),vehicleRe=/^([A-Z0-9]{1,3})\\s*[-–—:]\\s*(.+?)(?:\\s+([0-9]{1,4}(?:[.,][0-9]{1,2}))\\s*€\\s*\\/\\s*d[ií]a|$)/i;\n  for(let index=0;index<lines.length;index++){\n    const m=String(lines[index]).match(vehicleRe);if(!m)continue;\n    const group=m[1].trim(),model=m[2].trim().replace(/\\s+/g,' ');if(!model||model.length>130)continue;\n    const key=`${group}\\u0000${normalize(model)}`;if(seen.has(key))continue;seen.add(key);\n    const pricePerDay=Number(String(m[3]||'').replace(',','.'))||0;\n    let next=index+1;while(next<lines.length&&!vehicleRe.test(String(lines[next])))next++;\n    const vehicleBlock=lines.slice(index,next);let total=extractTotal(vehicleBlock,0);\n    // Si la página solo expone €/día, calculamos el total según los periodos de 24 h que ya usa el monitor.\n    if(pricePerDay>0&&(total<=0||Math.abs(total-pricePerDay)<0.02))total=Math.round(pricePerDay*days*100)/100;\n    out.push({group,model,carId:knownCarId(model),pricePerDay,total:total>0?total:0,availability:'Disponible'});\n  }\n  return out;\n}\nfunction parseResult(text,config){const lines=text.split(/\\n+/).map(x=>x.trim()).filter(Boolean),index=targetIndex(lines,config),total=extractTotal(lines,index);return {lines,index,total,found:groupVehicleLines(lines,config.group),fleet:fleetFromLines(lines,config)};}\nfunction selectedFleetGroups(config={}){return [...new Set((Array.isArray(config.fleetTrackGroups)?config.fleetTrackGroups:[]).map(x=>String(x||'').trim()).filter(Boolean))];}\nexport function filterFleetForTracking(fleet=[],config={}){\n  const rows=Array.isArray(fleet)?fleet:[];if(config.fleetTrackAll!==false)return rows;\n  const groups=selectedFleetGroups(config);if(!groups.length&&config.group)groups.push(String(config.group).trim());const wanted=new Set(groups.map(normalize));\n  return rows.filter(row=>wanted.has(normalize(row?.group||'')));\n}\nexport function bestFleetVehicle(fleet=[],config={}){\n  const rows=Array.isArray(fleet)?fleet:[],wanted=modelTokens(config.model||''),group=normalize(config.group||'').replace(/\\s+/g,'');\n  let best=null,bestScore=-1;\n  for(const row of rows){const text=normalize(row?.model||''),rowTokens=modelTokens(row?.model||''),sameGroup=Boolean(group)&&normalize(row?.group||'').replace(/\\s+/g,'')===group;let score=sameGroup?20:0;\n    if(wanted.length){const matched=wanted.filter(token=>rowTokens.includes(token)||text.includes(token)).length;score+=matched*25;if(matched===wanted.length)score+=120;}\n    if(String(config.carId||'')&&String(row?.carId||'')===String(config.carId))score+=180;\n    if(score>bestScore){best=row;bestScore=score;}\n  }\n  return bestScore>=20?best:null;\n}\nasync function diagnosticSummary(page,text,parsed,config){\n  const heading=text.split(/\\n+/).map(x=>x.trim()).filter(Boolean).filter(x=>/mostrando precios|prices for|recogida|pick up|nueva b.squeda|new search/i.test(x)).slice(0,4).join(' | ');\n  const found=parsed.found.length?` Vehículos grupo ${config.group}: ${parsed.found.join(' | ')}`:'';const formState=await formStateSummary(page);return `URL final: ${page.url()}.${heading?` Página: ${heading}.`:''}${found}${formState?` Formulario: ${formState}`:''}`;\n}\nexport async function scanAutoReisenFleet(browser,config){\n  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:1100},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'});await prepareAutoReisenContext(context);const page=await context.newPage();\n  try{\n    // Para obtener la flota completa usamos un navegador real. AutoReisen protege el listado frente a peticiones HTTP directas,\n    // pero el formulario normal del navegador sigue siendo la fuente correcta para una consulta puntual del usuario.\n    const base=resultsEntryUrl(process.env.AUTOREISEN_SEARCH_URL||config.searchUrl);\n    await openCandidate(page,base).catch(()=>{});await acceptCookies(page);\n    const intro=page.getByText(/^\\s*Continuar\\s*$/i).first();if(await intro.isVisible().catch(()=>false))await intro.click().catch(()=>{});await revealSearchForm(page);\n    let submitted=await fillNamedLegacyForm(page,config).catch(()=>false);if(!submitted)submitted=await fillPositionalLegacyForm(page,config).catch(()=>false);if(!submitted)submitted=await fillModernForm(page,config).catch(()=>false);\n    if(submitted){await page.waitForLoadState('domcontentloaded',{timeout:35000}).catch(()=>{});await page.waitForTimeout(4500);}\n    let text=await safeText(page);\n    if(AUTOREISEN_VERIFY_RE.test(text))throw new Error('AutoReisen mantiene activa la verificación de navegador tras 30 s. Se conserva el último precio válido y se adjunta diagnóstico.');\n    let parsed=parseResult(text,{...config,group:'',model:''});\n    const validDates=fleetResultPageLooksValid(text,config,{submitted,url:page.url()});\n    if(parsed.fleet.length&&validDates){const imageUrl=await selectedVehicleImage(page,config).catch(()=>'');const fleet=await enrichFleetImages(page,parsed.fleet,config,imageUrl);await snapshot(page,'autoreisen-flota');return {source:'AutoReisen · flota real · GitHub Actions + Playwright',checkedAt:isoNow(),availability:'Disponible',pickupOfficeId:String(config.pickupOfficeId||officeId(config.pickup)||''),dropoffOfficeId:String(config.dropoffOfficeId||officeId(config.dropoff)||''),pickupAt:config.pickupAt,dropoffAt:config.dropoffAt,imageUrl,fleet};}\n    if(/no hay nada disponible|no availability|cannot offer|no podemos ofrecer/i.test(text)&&validDates){await snapshot(page,'autoreisen-sin-disponibilidad');return {source:'AutoReisen · flota real · GitHub Actions + Playwright',checkedAt:isoNow(),availability:'No disponible',noAvailability:true,pickupOfficeId:String(config.pickupOfficeId||officeId(config.pickup)||''),dropoffOfficeId:String(config.dropoffOfficeId||officeId(config.dropoff)||''),pickupAt:config.pickupAt,dropoffAt:config.dropoffAt,fleet:[]};}\n\n    // Segundo intento: URL de resultados sin fijar coche. Con Playwright puede funcionar aunque la misma URL falle desde un Worker.\n    const direct=new URL(directResultUrl({...config,model:'',carId:''}));direct.searchParams.delete('coche');direct.searchParams.delete('id_coche');\n    const opened=await openCandidate(page,direct.toString()).catch(()=>({text:'',challenge:false}));if(opened.challenge)throw new Error('AutoReisen mantiene activa la verificación de navegador tras 30 s. Se conserva el último precio válido y se adjunta diagnóstico.');\n    text=opened.text||await safeText(page);parsed=parseResult(text,{...config,group:'',model:''});\n    if(parsed.fleet.length&&fleetResultPageLooksValid(text,config,{url:page.url()})){const imageUrl=await selectedVehicleImage(page,config).catch(()=>'');const fleet=await enrichFleetImages(page,parsed.fleet,config,imageUrl);await snapshot(page,'autoreisen-flota-directa');return {source:'AutoReisen · flota real · GitHub Actions + Playwright',checkedAt:isoNow(),availability:'Disponible',pickupOfficeId:String(config.pickupOfficeId||officeId(config.pickup)||''),dropoffOfficeId:String(config.dropoffOfficeId||officeId(config.dropoff)||''),pickupAt:config.pickupAt,dropoffAt:config.dropoffAt,imageUrl,fleet};}\n    const diag=await diagnosticSummary(page,text,parsed,config);throw new Error(`AutoReisen no devolvió una lista de vehículos interpretable para esta búsqueda. ${diag}`);\n  }finally{await context.close();}\n}\n\nexport async function monitorAutoReisen(browser,config){\n  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:1100},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'});await prepareAutoReisenContext(context);const page=await context.newPage();\n  try{\n    // Strategy 1: use AutoReisen's public results query directly. This avoids fragile visual form selectors.\n    const direct=directResultUrl(config);let opened=await openCandidate(page,direct).catch(()=>({text:'',challenge:false}));if(opened.challenge)opened={text:'',challenge:true};await acceptCookies(page);let text=opened.text||await safeText(page);let parsed=parseResult(text,config);\n    if(parsed.index>=0&&parsed.total&&resultsLookValid(text,config)){const imageUrl=await selectedVehicleImage(page,config).catch(()=>'');await snapshot(page,'autoreisen-resultados');const relevant=parsed.lines.slice(parsed.index,parsed.index+16).join(' '),days=daysBetween(config.pickupAt,config.dropoffAt),fleet=await enrichFleetImages(page,parsed.fleet,config,imageUrl);return {source:'AutoReisen · consulta directa · GitHub Actions + Playwright',checkedAt:isoNow(),price:parsed.total,total:parsed.total,pricePerDay:parsed.total/days,availability:/no disponible|agotado|sold out|not available/i.test(relevant)?'No disponible':'Disponible',group:config.group,model:config.model,carId:String(config.carId||knownCarId(config.model)||''),pickupOfficeId:String(config.pickupOfficeId||officeId(config.pickup)||''),dropoffOfficeId:String(config.dropoffOfficeId||officeId(config.dropoff)||''),pickupAt:config.pickupAt,dropoffAt:config.dropoffAt,imageUrl,fleet};}\n\n    // Strategy 2: fill the actual named legacy fields, not the first selects in the document.\n    const base=resultsEntryUrl(process.env.AUTOREISEN_SEARCH_URL||config.searchUrl);await openCandidate(page,base).catch(()=>{});await acceptCookies(page);const intro=page.getByText(/^\\s*Continuar\\s*$/i).first();if(await intro.isVisible().catch(()=>false))await intro.click().catch(()=>{});await revealSearchForm(page);\n    let submitted=await fillNamedLegacyForm(page,config).catch(()=>false);if(!submitted)submitted=await fillPositionalLegacyForm(page,config).catch(()=>false);if(!submitted)submitted=await fillModernForm(page,config).catch(()=>false);if(submitted){await page.waitForLoadState('domcontentloaded',{timeout:35000}).catch(()=>{});await page.waitForTimeout(4000);}text=await safeText(page);\n    if(AUTOREISEN_VERIFY_RE.test(text))throw new Error('AutoReisen mantiene activa la verificación de navegador tras 30 s. Se conserva el último precio válido y se adjunta diagnóstico.');parsed=parseResult(text,config);await snapshot(page,'autoreisen-resultados');\n    if(parsed.index>=0&&parsed.total&&resultsLookValid(text,config)){const imageUrl=await selectedVehicleImage(page,config).catch(()=>''),relevant=parsed.lines.slice(parsed.index,parsed.index+16).join(' '),days=daysBetween(config.pickupAt,config.dropoffAt),fleet=await enrichFleetImages(page,parsed.fleet,config,imageUrl);return {source:'AutoReisen · formulario identificado · GitHub Actions + Playwright',checkedAt:isoNow(),price:parsed.total,total:parsed.total,pricePerDay:parsed.total/days,availability:/no disponible|agotado|sold out|not available/i.test(relevant)?'No disponible':'Disponible',group:config.group,model:config.model,carId:String(config.carId||knownCarId(config.model)||''),pickupOfficeId:String(config.pickupOfficeId||officeId(config.pickup)||''),dropoffOfficeId:String(config.dropoffOfficeId||officeId(config.dropoff)||''),pickupAt:config.pickupAt,dropoffAt:config.dropoffAt,imageUrl,fleet};}\n    const diag=await diagnosticSummary(page,text,parsed,config);\n    if(parsed.index>=0&&parsed.total&&!rentalDurationAppears(text,config))throw new Error(`AutoReisen devolvió un precio para una duración distinta. MFE Viajes espera ${expectedRentalDays(config)} días (${dateParts(config.pickupAt).hour}:${dateParts(config.pickupAt).minute} → ${dateParts(config.dropoffAt).hour}:${dateParts(config.dropoffAt).minute}). ${diag}`);\n    if(parsed.found.length)throw new Error(`AutoReisen devolvió resultados, pero no apareció ${config.model||`el grupo ${config.group}`}. ${diag}`);\n    throw new Error(`AutoReisen no llegó a una lista de vehículos válida para las fechas configuradas. ${diag}`);\n  }finally{await context.close();}\n}\n\nexport const __autoreisenTest={resultsEntryUrl,directResultUrl,officeId,knownCarId,targetIndex,extractTotal,normalize,modelTokens,groupVehicleLines,resultsLookValid,fleetResultPageLooksValid,dateParts,expectedRentalDays,rentalDurationAppears,fleetFromLines,filterFleetForTracking,bestFleetVehicle,sameVehicle,enrichFleetImage,fleetImagesFromDom,fleetLightboxesFromDom,enrichFleetImages,AUTOREISEN_VERIFY_RE};\n";
const AUTOREISEN_FILE_3 = "{\n  \"name\": \"mfe-viajes-monitores\",\n  \"private\": true,\n  \"version\": \"2.1.1\",\n  \"type\": \"module\",\n  \"scripts\": {\n    \"monitor\": \"node monitor.mjs\",\n    \"monitor:autoreisen\": \"node monitor.mjs\",\n    \"monitor:cordial\": \"node cordial-run.mjs\"\n  },\n  \"dependencies\": {\n    \"playwright\": \"1.54.1\"\n  }\n}\n";
const AUTOREISEN_WORKFLOW_TEMPLATE = "name: AutoReisen · MFE Viajes\n\non:\n  schedule:\n    # Una sola ejecución diaria a las 06:30 de Madrid. GitHub gestiona automáticamente CET/CEST.\n    - cron: '30 6 * * *'\n      timezone: \"Europe/Madrid\"\n  workflow_dispatch:\n    inputs:\n      force:\n        description: 'Forzar comprobación aunque todavía no toque'\n        required: false\n        default: true\n        type: boolean\n      telegram_test:\n        description: 'Enviar solo un mensaje de prueba por Telegram'\n        required: false\n        default: false\n        type: boolean\n      fleet_only:\n        description: 'Consultar únicamente la flota disponible para una búsqueda puntual'\n        required: false\n        default: false\n        type: boolean\n      request_id:\n        description: 'Identificador de la consulta puntual de flota'\n        required: false\n        default: ''\n        type: string\n      fleet_config_json:\n        description: 'Configuración temporal de la consulta puntual; no modifica la reserva del monitor diario'\n        required: false\n        default: ''\n        type: string\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: autoreisen-monitor\n  cancel-in-progress: false\n\njobs:\n  monitor:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 15\n    defaults:\n      run:\n        working-directory: monitoring\n    env:\n      MFE_WORKER_URL: ${{ secrets.MFE_WORKER_URL }}\n      MFE_MONITOR_SECRET: ${{ secrets.MFE_MONITOR_SECRET }}\n      TELEGRAM_BOT_TOKEN: ${{ secrets.TELEGRAM_BOT_TOKEN || secrets.TELEGRAM_TOKEN || secrets.BOT_TOKEN }}\n      TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID || secrets.TELEGRAM_CHAT || secrets.CHAT_ID }}\n      MFE_FORCE_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.force || false }}\n      MFE_TEST_TELEGRAM: ${{ github.event_name == 'workflow_dispatch' && inputs.telegram_test || false }}\n      MFE_FLEET_ONLY: ${{ github.event_name == 'workflow_dispatch' && inputs.fleet_only || false }}\n      MFE_REQUEST_ID: ${{ github.event_name == 'workflow_dispatch' && inputs.request_id || '' }}\n      MFE_FLEET_CONFIG_JSON: ${{ github.event_name == 'workflow_dispatch' && inputs.fleet_config_json || '' }}\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n          cache: npm\n          cache-dependency-path: monitoring/package-lock.json\n      - run: npm ci\n      - run: npx playwright install --with-deps chromium\n      - run: node monitor.mjs\n      - name: Guardar diagnóstico si falla\n        if: failure()\n        uses: actions/upload-artifact@v4\n        with:\n          name: autoreisen-diagnostico\n          path: monitoring/artifacts/\n          if-no-files-found: ignore\n          retention-days: 7\n";
const AUTOREISEN_STAGE2_RUN_FILE = "// MFE_AUTOREISEN_STAGE2_VERSION: 1.0.0\n// Segunda isla: consulta aislada de AutoReisen. Nunca sobrescribe el monitor de la primera semana.\nimport fs from 'node:fs/promises';\nimport {chromium} from 'playwright';\nimport {isoNow,postResult,readTrackerLatest,successfulResultToday} from './lib.mjs';\nimport {scanAutoReisenFleet,bestFleetVehicle,monitorAutoReisen} from './autoreisen.mjs';\n\nconst configFile=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));\nconst config=configFile.autoreisenStage2||{};\nconst force=/^(true|1)$/i.test(process.env.MFE_FORCE_RUN||'');\nif(config.enabled!==true){console.log('[autoreisen-stage2] Sin configurar / desactivado, no se consulta.');process.exit(0);}\nif(!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}/.test(config.pickupAt||'')||!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}/.test(config.dropoffAt||'')){\n  console.log('[autoreisen-stage2] Faltan fechas de recogida/devolución válidas.');process.exit(0);\n}\nconst previous=await readTrackerLatest('autoreisen-stage2');\nconst identity=String(config.pickupAt)+'|'+String(config.dropoffAt)+'|'+String(config.pickupOfficeId||'')+'|'+String(config.dropoffOfficeId||'')+'|'+String(config.model||'')+'|'+String(config.group||'');\nif(!force&&previous.result?.queryIdentity===identity&&successfulResultToday(previous.result)){\n  console.log('[autoreisen-stage2] Ya se comprobó hoy la reserva de esta etapa.');process.exit(0);\n}\nconst browser=await chromium.launch({headless:true,channel:'chrome',args:['--disable-blink-features=AutomationControlled']}).catch(()=>chromium.launch({headless:true,args:['--disable-blink-features=AutomationControlled']}));\ntry{\n  let scan=null,full=[],selected=null;\n  try{\n    scan=await scanAutoReisenFleet(browser,config);\n    full=Array.isArray(scan.fleet)?scan.fleet:[];\n    selected=bestFleetVehicle(full,config);\n  }catch(error){console.warn('[autoreisen-stage2] Flota no disponible, probando precio de la reserva.',error.message);}\n  if(!selected&&!config.model)throw new Error('No hay modelo configurado ni una flota con precios verificables para Fuerteventura.');\n  let result=null;\n  if(selected&&Number(selected.total)>0){result={...scan,price:Number(selected.total),total:Number(selected.total),model:selected.model,group:selected.group,carId:selected.carId||'',availability:selected.availability||'Disponible'};}\n  else result=await monitorAutoReisen(browser,config);\n  if(!(Number(result?.total||result?.price)>0))throw new Error('AutoReisen no devolvió un precio numérico válido para la segunda isla.');\n  result={...result,ok:true,status:'ok',stageId:'week-2',queryIdentity:identity,searchConfig:{pickupAt:config.pickupAt,dropoffAt:config.dropoffAt,pickupOfficeId:config.pickupOfficeId,dropoffOfficeId:config.dropoffOfficeId,model:config.model,group:config.group},checkedAt:isoNow(),source:'AutoReisen · etapa 2 · GitHub Actions'};\n  await postResult('autoreisen-stage2',result);\n  console.log('[autoreisen-stage2] OK',JSON.stringify({price:result.price,model:result.model,group:result.group,checkedAt:result.checkedAt}));\n}catch(error){\n  console.error('[autoreisen-stage2] ERROR',error);\n  await postResult('autoreisen-stage2',{ok:false,status:'error',error:error.message,stageId:'week-2',queryIdentity:identity,checkedAt:isoNow()}).catch(e=>console.error('[autoreisen-stage2] No se pudo guardar el error',e.message));\n  process.exitCode=1;\n}finally{await browser.close();}\n";
const AUTOREISEN_STAGE2_WORKFLOW_TEMPLATE = "name: AutoReisen · Fuerteventura · etapa 2\non:\n  schedule:\n    - cron: '40 6 * * *'\n      timezone: 'Europe/Madrid'\n  workflow_dispatch:\n    inputs:\n      force:\n        type: boolean\n        default: true\n        required: false\npermissions:\n  contents: read\nconcurrency:\n  group: autoreisen-stage2\n  cancel-in-progress: false\njobs:\n  monitor:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 15\n    defaults:\n      run:\n        working-directory: monitoring\n    env:\n      MFE_WORKER_URL: ${{ secrets.MFE_WORKER_URL }}\n      MFE_MONITOR_SECRET: ${{ secrets.MFE_MONITOR_SECRET }}\n      MFE_FORCE_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.force || false }}\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n          cache: npm\n          cache-dependency-path: monitoring/package-lock.json\n      - run: npm ci\n      - run: npx playwright install --with-deps chromium\n      - run: node autoreisen-stage2-run.mjs\n      - name: Diagnóstico\n        if: failure()\n        uses: actions/upload-artifact@v4\n        with:\n          name: autoreisen-etapa2-diagnostico\n          path: monitoring/artifacts/\n          if-no-files-found: ignore\n          retention-days: 7\n";
const DUNAS_FILE = "// MFE_DUNAS_MONITOR_VERSION: 1.0.0\n// Este lector solo acepta totales verificables para todas las habitaciones de la reserva.\n// Los precios diarios del calendario NO representan el coste del viaje de cinco personas.\nconst DATE_RE=/^\\d{4}-\\d{2}-\\d{2}$/;\nconst MONEY=/((?:\\d{1,3}(?:\\.\\d{3})*|\\d+),\\d{2})\\s*€/g;\nconst cash=v=>Number(String(v||'').replace(/\\./g,'').replace(',','.'))||0;\nfunction quoteUrl(config={}){\n  if(!DATE_RE.test(config.checkIn||'')||!DATE_RE.test(config.checkOut||''))throw new Error('Dunas Club: faltan fechas de entrada/salida.');\n  const adults=Number(config.adults)||5,rooms=Number(config.rooms)||3;\n  if(adults<1||adults>8||rooms<1||rooms>8||rooms>adults)throw new Error('Dunas Club: ocupación no válida.');\n  const url=new URL('https://www.hoteldunasclub.es/disponibilidad.html');\n  url.searchParams.set('id_hotel','HDCCALEDONIA');url.searchParams.set('start',config.checkIn);url.searchParams.set('end',config.checkOut);\n  // Para 5 adultos: 2+2+1. La web oficial reparte esta ocupación entre apartamentos.\n  for(let i=0;i<rooms;i++)url.searchParams.set(`guests[${i}][adults]`,String(Math.floor(adults/rooms)+(i<adults%rooms?1:0)));\n  url.hash='monoHotelAvail/EUR';return url.toString();\n}\nconst normalize=v=>String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/\\s+/g,' ').trim();\nconst roomMatches=(a,b)=>{const wanted=normalize(b||'');return !wanted||wanted.includes('cualquier')||wanted.includes('todas')||normalize(a).includes(wanted)||wanted.split(/\\W+/).filter(x=>x.length>3).some(x=>normalize(a).includes(x));};\nfunction parseFinal(body,{adults=5,rooms=3}={}){\n  const text=String(body||''),normalized=normalize(text);\n  const roomsSelected=new RegExp(`\\\\b${rooms}\\\\s*habitaciones?\\\\s+de\\\\s+${rooms}\\\\b`,'i').test(normalized);\n  if(!roomsSelected||/sin habitaci[oó]n seleccionada/i.test(text))return null;\n  if(!new RegExp(`${adults}\\\\s*adultos`,'i').test(normalized))return null;\n  const priceStrings=[...text.matchAll(/Total\\s*(?:Estancia|de\\s*la\\s*reserva|a\\s*pagar|Reserva)\\s*([\\d.,]+)\\s*€/gi)];\n  const price=cash(priceStrings.at(-1)?.[1]);return price>0&&price<100000?price:null;\n}\n\nexport async function monitorDunas(browser,config){\n  const url=quoteUrl(config),ctx=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:1100}}),page=await ctx.newPage();\n  try{\n    await page.goto(url,{waitUntil:'domcontentloaded',timeout:65000});await page.waitForTimeout(9000);\n    const body=await page.locator('body').innerText({timeout:12000}),actualUrl=page.url();\n    if(!actualUrl.includes('/disponibilidad.html'))throw new Error('Hotel Dunas Club no ha cargado la página de disponibilidad.');\n    if(!actualUrl.includes(`start=${config.checkIn}`)||!actualUrl.includes(`end=${config.checkOut}`))throw new Error('Dunas Club ha cambiado el periodo de búsqueda. Se descarta la respuesta.');\n    if(!/Dunas Club/i.test(body))throw new Error('El resultado no corresponde a Hotel Dunas Club.');\n    const adults=Number(config.adults)||5,rooms=Number(config.rooms)||3;\n    const candidates=[],requestedRoom=String(config.targetRoom||'Cualquier habitación');\n    for(let r=0;r<rooms;r++){\n      const available=page.locator('li.c0806:visible');\n      const count=await available.count();let selected=null;\n      for(let i=0;i<count;i++){\n        const room=available.nth(i),heading=String((await room.locator('.avail').first().textContent().catch(()=>''))||'').trim();\n        if(!roomMatches(heading,requestedRoom))continue;\n        const rates=room.locator('li:visible');\n        const nr=await rates.count();\n        // Mantener una tarifa comparable en todos los intentos: solo alojamiento y cancelación gratuita.\n        for(let j=0;j<nr;j++){\n          const rate=rates.nth(j),text=normalize(await rate.innerText().catch(()=>''));\n          if(!text.includes('elige habitacion'))continue;\n          const board=normalize(config.targetBoard||'Solo alojamiento');\n          if(board.includes('alojamiento')&&!text.includes('cancelacion gratuita')&&text.includes('no reembolsable'))continue;\n          const btn=rate.getByRole('button',{name:/Elige habitación/i}).first();\n          if(await btn.isVisible().catch(()=>false)){selected={btn,heading,rate:text.slice(0,150)};break;}\n        }\n        if(selected)break;\n      }\n      if(!selected)break;\n      await selected.btn.click({timeout:7500});await page.waitForTimeout(1500);\n      candidates.push({room:r+1,title:selected.heading,rate:selected.rate});\n    }\n    if(candidates.length!==rooms)throw new Error(`Dunas Club: se pudieron seleccionar ${candidates.length} de ${rooms} habitaciones para ${adults} adultos en ${config.checkIn}–${config.checkOut}. No se registra precio parcial.`);\n    const finalText=await page.locator('body').innerText().catch(()=>body);\n    const final= parseFinal(finalText,{adults,rooms});\n    if(!final)throw new Error(`Dunas Club muestra tarifas o disponibilidad parcial, pero no un total confirmable para ${adults} adultos y ${rooms} habitaciones (${config.targetRoom||'Suite'}). Se conserva el precio anterior; consulta el enlace de reserva.`);\n    return {ok:true,status:'ok',price:final,total:final,source:'Hotel Dunas Club · Keytel · precio completo verificado',rooms,adults,checkIn:config.checkIn,checkOut:config.checkOut,targetRoom:config.targetRoom||'',targetBoard:config.targetBoard||'',url,roomChoices:candidates};\n  }finally{await ctx.close();}\n}\n";
const DUNAS_RUN_FILE = "// MFE_DUNAS_RUN_VERSION: 1.0.0\nimport fs from 'node:fs/promises';\nimport {chromium} from 'playwright';\nimport {isoNow,postResult,readTrackerLatest,successfulResultToday} from './lib.mjs';\nimport {monitorDunas} from './dunas.mjs';\nconst configuration=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));\nconst config=configuration.dunas||{};\nconst force=/^(true|1)$/i.test(String(process.env.MFE_FORCE_RUN||''));\nif(config.enabled!==true){console.log('[dunas] Aún sin configurar.');process.exit(0);}\nif(!/^\\d{4}-\\d{2}-\\d{2}$/.test(config.checkIn||'')||!/^\\d{4}-\\d{2}-\\d{2}$/.test(config.checkOut||'')){console.log('[dunas] Faltan fechas; no se realiza consulta.');process.exit(0);}\nconst adults=Math.max(1,Number(config.adults)||5),rooms=Math.max(1,Number(config.rooms)||3);\nconst queryIdentity=[config.checkIn,config.checkOut,String(adults),String(rooms),config.targetRoom||'Suite'].join('|');\nconst previous=await readTrackerLatest('dunas');\nif(!force&&previous.result?.queryIdentity===queryIdentity&&successfulResultToday(previous.result)){console.log('[dunas] Ya se comprobó este periodo hoy.');process.exit(0);}\nlet browser;\ntry{\n  browser=await chromium.launch({headless:true,args:['--disable-blink-features=AutomationControlled']});\n  const result=await monitorDunas(browser,{...config,adults,rooms});\n  await postResult('dunas',{...result,checkedAt:isoNow(),queryIdentity,stageId:'week-2'});\n  console.log('[dunas] OK',JSON.stringify({price:result.price,checkIn:config.checkIn,checkOut:config.checkOut,adults,rooms}));\n}catch(error){\n  console.error('[dunas] ERROR',error);\n  await postResult('dunas',{ok:false,status:'error',checkedAt:isoNow(),queryIdentity,stageId:'week-2',error:error.message}).catch(e=>console.error('No se pudo registrar el error:',e.message));\n  process.exitCode=1;\n}finally{await browser?.close();}\n";
const DUNAS_WORKFLOW_TEMPLATE = "name: Hotel Dunas Club · Fuerteventura · etapa 2\non:\n  schedule:\n    - cron: '50 6 * * *'\n      timezone: 'Europe/Madrid'\n  workflow_dispatch:\n    inputs:\n      force:\n        description: 'Forzar consulta'\n        type: boolean\n        default: true\n        required: false\npermissions:\n  contents: read\nconcurrency:\n  group: dunas-stage2\n  cancel-in-progress: false\njobs:\n  monitor:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 15\n    defaults:\n      run:\n        working-directory: monitoring\n    env:\n      MFE_WORKER_URL: ${{ secrets.MFE_WORKER_URL }}\n      MFE_MONITOR_SECRET: ${{ secrets.MFE_MONITOR_SECRET }}\n      MFE_FORCE_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.force || false }}\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n          cache: npm\n          cache-dependency-path: monitoring/package-lock.json\n      - run: npm ci\n      - run: npx playwright install --with-deps chromium\n      - run: node dunas-run.mjs\n      - name: Guardar diagnóstico si falla\n        if: failure()\n        uses: actions/upload-artifact@v4\n        with:\n          name: dunas-monitor-diagnostico\n          path: monitoring/artifacts/\n          if-no-files-found: ignore\n          retention-days: 7\n";

const BINTER_STAGE2_RUN_FILE = "// MFE_BINTER_STAGE2_MONITOR_VERSION: 1.0.0\n// Solo se guarda un total completo y comprobado; nunca se extrapola un precio por persona.\nimport fs from 'node:fs/promises';\nimport path from 'node:path';\nimport {chromium} from 'playwright';\nimport {isoNow,postResult,readTrackerLatest,successfulResultToday,snapshot} from './lib.mjs';\n\nconst configFile=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));\nconst cfg={...(configFile.binterStage2||{})};\nconst DATE=/^\\d{4}-\\d{2}-\\d{2}$/;\nconst clean=s=>String(s||'').replace(/\\s+/g,' ').trim();\nconst money=s=>Number(String(s||'').replace(/\\./g,'').replace(',','.'))||0;\nconst force=/^(1|true)$/i.test(String(process.env.MFE_FORCE_RUN||''));\nconst adults=Number(cfg.adults||5),date=String(cfg.date||'');\nconst identity=[date,cfg.origin||'LPA',cfg.destination||'FUE',adults,cfg.resident===true?'resident':'no-resident'].join('|');\nif(cfg.enabled!==true){console.log('[binter] Seguimiento desactivado');process.exit(0);}\nif(!DATE.test(date)||!(adults>=1&&adults<=9)||date<=new Date().toISOString().slice(0,10)){console.log('[binter] Fecha futura o pasajeros no válidos');process.exit(0);}\nconst previous=await readTrackerLatest('binter-stage2');\nif(!force&&previous.result?.queryIdentity===identity&&successfulResultToday(previous.result)){console.log('[binter] Consulta de hoy ya guardada');process.exit(0);}\nconst diagnostics={url:'',steps:[],date,adults};\nasync function clickAny(page,locators,label,{required=true}={}){\n  for(const loc of locators)try{if(await loc.first().isVisible({timeout:1000})){await loc.first().click({timeout:4500});diagnostics.steps.push(label);return true;}}catch{}\n  if(required)throw new Error('Binter: no se encontró el control '+label+' en el buscador actual.');\n  return false;\n}\nasync function chooseIsland(page,airport,label){\n  const name=airport==='LPA'?'Gran Canaria':'Fuerteventura';\n  await clickAny(page,[page.getByText(name,{exact:true}),page.getByRole('option',{name:new RegExp(name,'i')}),page.getByRole('button',{name:new RegExp(name,'i')})],label);\n}\nasync function scan(browser){\n  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:900}});\n  const page=await context.newPage();\n  try{\n    await page.goto('https://www.bintercanarias.com/es/buscar-vuelos',{waitUntil:'domcontentloaded',timeout:65000});\n    await page.waitForTimeout(3500);diagnostics.url=page.url();\n    await clickAny(page,[page.getByRole('button',{name:/aceptar todas|aceptar cookies|acepto/i})],'cookies',{required:false});\n    await clickAny(page,[page.getByRole('button',{name:/origen/i}),page.getByText('Origen',{exact:true}),page.locator('input[placeholder*=\"Origen\"]')],'origen');\n    await chooseIsland(page,cfg.origin||'LPA','origen LPA');\n    await clickAny(page,[page.getByRole('button',{name:/destino/i}),page.getByText('Destino',{exact:true}),page.locator('input[placeholder*=\"Destino\"]')],'destino');\n    await chooseIsland(page,cfg.destination||'FUE','destino FUE');\n    await clickAny(page,[page.getByText('Sólo ida',{exact:true}),page.getByRole('radio',{name:/s[oó]lo ida/i})],'solo ida');\n    // Rellenar fecha solo cuando existe un input editable; el calendario puede tener un control propio.\n    const dateInputs=page.locator('input[type=\"date\"]:visible');\n    if(await dateInputs.count()){await dateInputs.first().fill(date);diagnostics.steps.push('fecha');}\n    else {\n      await clickAny(page,[page.getByText('Selecciona fecha de ida',{exact:false}),page.getByText('Ida',{exact:true})],'calendario');\n      const [y,m,d]=date.split('-');const months=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];\n      const target=months[Number(m)-1]+' '+y;\n      for(let i=0;i<15;i++){\n        const visible=clean(await page.locator('body').innerText()).toLowerCase();\n        if(visible.includes(target))break;\n        const next=page.locator('[aria-label*=\"siguiente\" i],[aria-label*=\"next\" i],.mat-calendar-next-button,.datepicker-next');\n        if(!await next.count())throw new Error('Binter: calendario sin selector de mes verificable.');\n        await next.first().click();await page.waitForTimeout(150);\n      }\n      await clickAny(page,[page.getByRole('button',{name:new RegExp('^'+Number(d)+'
  "monitoring/lib.mjs": AUTOREISEN_FILE_0,
  "monitoring/monitor.mjs": AUTOREISEN_FILE_1,
  "monitoring/autoreisen.mjs": AUTOREISEN_FILE_2,
  "monitoring/package.json": AUTOREISEN_FILE_3
};

const CORDIAL_FILE = "// MFE_CORDIAL_AUTOMATION_VERSION: 2.2.12\nimport {isoNow,snapshot,acceptCookies} from './lib.mjs';\n\nconst normalize=value=>String(value||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/\\s+/g,' ').trim();\nconst visible=loc=>loc.isVisible().catch(()=>false);\nasync function acceptCordialCookies(page){\n  // BeCordial abre su gestor de cookies dentro de un iframe (/cookies/manager)\n  // y lo cubre con Magnific Popup. En agosto de 2026 el iframe empezó a tardar\n  // más en estar interactivo en GitHub Actions: el overlay podía estar visible\n  // aunque todavía no hubiera ningún botón detectable. Intentamos primero el\n  // consentimiento normal y, si el panel sigue bloqueando, cerramos únicamente\n  // la capa visual conservando las cookies necesarias del sitio.\n  await acceptCookies(page).catch(()=>{});\n  const overlay='.cookiepanel-container-wrap,.popup-cookiepanel-wrapper,.mfp-wrap.cookiepanel-container-wrap,.mfp-bg';\n  const iframe='#cookie_panel_iframe, iframe[src*=\"/cookies/manager\"]';\n  const framePresent=await page.locator(iframe).count().catch(()=>0);\n  let clicked=false,forcedClose=false;\n\n  if(framePresent){\n    const frameLocator=page.frameLocator(iframe).first();\n    // Esperamos explícitamente a que el iframe haya pintado su contenido.\n    await frameLocator.locator('body').waitFor({state:'attached',timeout:8000}).catch(()=>{});\n    await page.waitForTimeout(350);\n    const labels=[/^aceptar$/i,/aceptar todas/i,/aceptar todo/i,/accept all/i,/^accept$/i,/allow all/i,/consentir/i];\n    for(const label of labels){\n      const candidates=[\n        frameLocator.getByRole('button',{name:label}).first(),\n        frameLocator.getByText(label,{exact:true}).first(),\n        frameLocator.locator('button,input[type=\"button\"],input[type=\"submit\"],a').filter({hasText:label}).first()\n      ];\n      for(const btn of candidates){\n        if(!await btn.isVisible().catch(()=>false))continue;\n        clicked=await btn.click({timeout:5000,force:true}).then(()=>true).catch(()=>false);\n        if(clicked)break;\n      }\n      if(clicked)break;\n    }\n  }\n\n  if(clicked){\n    await page.waitForTimeout(500);\n    await page.locator('.cookiepanel-container-wrap,.popup-cookiepanel-wrapper').first()\n      .waitFor({state:'hidden',timeout:5000}).catch(()=>{});\n  }\n\n  let overlayVisible=await page.locator('.cookiepanel-container-wrap,.popup-cookiepanel-wrapper').first()\n    .isVisible().catch(()=>false);\n\n  // Respaldo robusto: la captura diagnóstica del 29/08/2026 mostró el iframe\n  // presente pero sin botón accionable. El propio sitio expone RolCookies y\n  // Magnific Popup; intentamos cerrar mediante sus APIs y, como último recurso,\n  // retiramos solo la capa bloqueante del DOM. Esto no altera el formulario ni\n  // inyecta datos: únicamente permite interactuar con la página ya cargada.\n  if(overlayVisible){\n    forcedClose=await page.evaluate(()=>{\n      let changed=false;\n      try{\n        const manager=window.RolCookies?.Manager;\n        if(manager&&typeof manager.save==='function'){manager.save();changed=true;}\n      }catch{}\n      try{\n        const jq=window.jQuery||window.$;\n        if(jq?.magnificPopup&&typeof jq.magnificPopup.close==='function'){jq.magnificPopup.close();changed=true;}\n      }catch{}\n      for(const el of document.querySelectorAll('.cookiepanel-container-wrap,.popup-cookiepanel-wrapper,.mfp-wrap.cookiepanel-container-wrap,.mfp-bg')){\n        try{el.remove();changed=true;}catch{}\n      }\n      try{document.documentElement.style.overflow='';document.body.style.overflow='';document.body.style.paddingRight='';}catch{}\n      return changed;\n    }).catch(()=>false);\n    await page.waitForTimeout(300);\n    overlayVisible=await page.locator('.cookiepanel-container-wrap,.popup-cookiepanel-wrapper').first()\n      .isVisible().catch(()=>false);\n  }\n\n  if(framePresent||overlayVisible||clicked||forcedClose){\n    console.log(`[cordial] Cookies: iframe=${framePresent?'sí':'no'} · acción=${clicked?'aceptar':forcedClose?'cierre de respaldo':'no detectada'} · overlay=${overlayVisible?'visible':'cerrado'}.`);\n  }else{\n    console.log('[cordial] Cookies: sin panel bloqueante.');\n  }\n  return !overlayVisible;\n}\nconst eur=text=>{\n  const raw=String(text||'').replace(/\\u00a0/g,' ');\n  const rows=[];\n  for(const m of raw.matchAll(/([0-9]{1,3}(?:\\.[0-9]{3})*(?:,[0-9]{2})|[0-9]+(?:,[0-9]{2}))\\s*€/g)){\n    const value=Number.parseFloat(m[1].replace(/\\./g,'').replace(',','.'));if(Number.isFinite(value))rows.push(value);\n  }\n  return rows;\n};\nfunction targetMatches(row,config){\n  const room=normalize(config.targetRoom||'Classic Duplex'),rate=normalize(config.targetRate||'Club Cordial - Reserva Online'),board=normalize(config.targetBoard||'SOLO ALOJAMIENTO');\n  return (!room||normalize(row.roomType).includes(room))&&(!rate||normalize(row.rateName).includes(rate))&&(!board||normalize(row.board).includes(board));\n}\nfunction reservationOnline(row){\n  const rate=normalize(row?.rateName||''),room=normalize(row?.roomType||'');\n  return (rate.includes('reserva online')||room.includes('reserva online'))&&!rate.includes('prepago')&&!room.includes('prepago');\n}\nfunction positiveCancellation(row){\n  // «Club Cordial - Reserva Online» es la opción flexible/sin gastos. El motor\n  // ha mezclado en ocasiones el texto de cancelación de la fila Prepago anterior.\n  if(reservationOnline(row))return true;\n  const text=normalize(row?.cancellation||'');\n  if(!text)return false;\n  if(/no reembolsable|con gastos/.test(text))return false;\n  return /cancelacion gratuita|reembolsable|sin gastos|cancelacion/.test(text);\n}\nfunction normalizeCancellationLabels(rows=[]){\n  return (Array.isArray(rows)?rows:[]).map(row=>{\n    if(!row||typeof row!=='object'||!reservationOnline(row))return row;\n    const current=normalize(row.cancellation||'');\n    if(!current||/con gastos|gastos de cancelacion/.test(current))return {...row,cancellation:'Cancelación sin gastos'};\n    return row;\n  });\n}\nfunction selectTargetOption(options=[],config={}){\n  const exact=options.find(row=>targetMatches(row,config));\n  if(exact){exact.target=true;exact.targetMatch='exact';return exact;}\n  const room=normalize(config.targetRoom||'Classic Duplex');\n  const rate=normalize(config.targetRate||'Club Cordial - Reserva Online');\n  const board=normalize(config.targetBoard||'SOLO ALOJAMIENTO');\n  const candidates=[];\n  for(const row of options){\n    const rowRoom=normalize(row?.roomType),rowRate=normalize(row?.rateName),rowBoard=normalize(row?.board);\n    if(board&&!rowBoard.includes(board))continue;\n    let score=50;\n    const roomMatch=!room||rowRoom.includes(room)||rowRate.includes(room);\n    const rateMatch=!rate||rowRate.includes(rate)||rowRoom.includes(rate);\n    if(roomMatch)score+=100;\n    if(rateMatch)score+=80;\n    if(rate.includes('reserva online')&&(rowRate.includes('reserva online')||rowRoom.includes('reserva online')))score+=35;\n    if(positiveCancellation(row))score+=30;\n    if(/tarifa club cordial/.test(rowRate))score+=10;\n    if(score<150)continue;\n    candidates.push({row,score,price:Number(row?.price)||Number.POSITIVE_INFINITY});\n  }\n  candidates.sort((a,b)=>b.score-a.score||a.price-b.price);\n  const chosen=candidates[0]?.row||null;\n  if(chosen){chosen.target=true;chosen.targetMatch='inferred';}\n  return chosen;\n}\nasync function optionDiagnostics(page,pattern){\n  const rows=[];\n  const candidates=page.locator('[role=\"option\"],li,[data-id],[data-value],[data-code],[data-hotel-code],[data-destination-id]');\n  const count=Math.min(await candidates.count().catch(()=>0),250);\n  for(let i=0;i<count;i++){\n    const el=candidates.nth(i);\n    const text=String(await el.innerText().catch(()=>'' )).replace(/\\s+/g,' ').trim();\n    if(!text||!pattern.test(text))continue;\n    const attrs=await el.evaluate(node=>{\n      const out={};for(const name of ['role','value','data-id','data-value','data-code','data-hotel-code','data-destination-id','destination_id','hotel_code','hotel_codes','data-type','id','class']){const v=node.getAttribute?.(name);if(v)out[name]=v;}return out;\n    }).catch(()=>({}));\n    rows.push({text,attrs,visible:await visible(el)});\n    if(rows.length>=12)break;\n  }\n  return rows;\n}\nasync function selectAutocompleteValue(page,input,text,pattern){\n  if(!await visible(input))return false;\n  try{\n    await input.click({force:true});\n    await input.press('Control+A').catch(()=>{});\n    await input.press('Backspace').catch(()=>{});\n    await input.pressSequentially(text,{delay:35}).catch(async()=>{await input.fill(text).catch(()=>{});});\n    await page.waitForTimeout(700);\n\n    const targeted=[\n      page.locator('[role=\"option\"]').filter({hasText:pattern}),\n      page.locator('.ui-autocomplete li,.select2-results__option,.choices__item--choice,.tt-suggestion,.autocomplete-suggestion').filter({hasText:pattern}),\n      page.getByText(pattern)\n    ];\n    for(const group of targeted){\n      const count=await group.count().catch(()=>0);\n      for(let i=count-1;i>=0;i--){\n        const option=group.nth(i);\n        if(!await visible(option))continue;\n        const box=await option.boundingBox().catch(()=>null);\n        if(!box||box.width<20||box.height<10)continue;\n        if(await option.click({force:true,timeout:3000}).then(()=>true).catch(()=>false)){await page.waitForTimeout(450);return true;}\n      }\n    }\n\n    // Muchos autocompletados aceptan teclado aunque sus opciones no sean fáciles de localizar.\n    await input.press('ArrowDown').catch(()=>{});\n    await page.waitForTimeout(120);\n    await input.press('Enter').catch(()=>{});\n    await page.waitForTimeout(450);\n    return true;\n  }catch{return false;}\n}\n\nasync function selectHotelThroughUi(page,wanted){\n  const visual=page.locator('input[placeholder*=\"destino\" i],input[placeholder*=\"hotel\" i]').first();\n  const code=page.locator('input[name=\"hotel_codes\"]').first();\n  const destination=page.locator('input[name=\"destination_id\"]').first();\n  if(!await visible(visual))return false;\n  const wantedPattern=/Cordial Santa Águeda.*Perchel Beach Club/i;\n  try{\n    // v2.1.98: antes de tocar hidden inputs intentamos reproducir la selección humana real.\n    // El JS de BeCordial mantiene estado interno asociado al autocomplete y, si únicamente\n    // escribimos hotel_codes/destination_id, puede vaciar hotel_codes justo al pulsar Buscar.\n    await visual.click({force:true});\n    await visual.press('Control+A').catch(()=>{});\n    await visual.press('Backspace').catch(()=>{});\n    await visual.pressSequentially(wanted,{delay:22}).catch(async()=>{await visual.fill(wanted).catch(()=>{});});\n    await page.waitForTimeout(650);\n\n    const selector='[role=\"option\"],.ui-autocomplete li,.select2-results__option,.choices__item--choice,.tt-suggestion,.autocomplete-suggestion,[data-hotel-code],[hotel_code],[hotel_codes],[data-code]';\n    const options=page.locator(selector).filter({hasText:wantedPattern});\n    const count=Math.min(await options.count().catch(()=>0),30);\n    for(let i=count-1;i>=0;i--){\n      const option=options.nth(i);\n      if(!await visible(option))continue;\n      const text=String(await option.innerText().catch(()=>'' )).replace(/\\s+/g,' ').trim();\n      if(!wantedPattern.test(text))continue;\n      const clicked=await option.click({timeout:3500}).then(()=>true).catch(async()=>option.click({force:true,timeout:3500}).then(()=>true).catch(()=>false));\n      if(!clicked)continue;\n      await page.waitForTimeout(650);\n      const hotelCode=String(await code.inputValue().catch(()=>'' )).trim();\n      const destinationId=String(await destination.inputValue().catch(()=>'' )).trim();\n      const visualValue=String(await visual.inputValue().catch(()=>'' )).trim();\n      console.log(`[cordial] Selección real del hotel: visual=${visualValue||'—'} · destination_id=${destinationId||'—'} · hotel_codes=${hotelCode||'—'}`);\n      if(hotelCode){\n        // El elemento de hotel contiene actualmente el destination_id en su modelo interno.\n        // Si el listener rellenó hotel_codes pero no el hidden destino, recuperamos solo ese ID.\n        if(!destinationId){\n          const derived=await deriveHiddenFromRenderedOption(page,wantedPattern,'destination');\n          if(derived.value)await forceControlValue(destination,derived.value).catch(()=>false);\n        }\n        const finalDestination=String(await destination.inputValue().catch(()=>'' )).trim();\n        if(finalDestination)return true;\n      }\n    }\n\n    // Algunos widgets no exponen una opción clicable pero sí aceptan teclado.\n    await visual.press('ArrowDown').catch(()=>{});\n    await page.waitForTimeout(120);\n    await visual.press('Enter').catch(()=>{});\n    await page.waitForTimeout(650);\n    const hotelCode=String(await code.inputValue().catch(()=>'' )).trim();\n    let destinationId=String(await destination.inputValue().catch(()=>'' )).trim();\n    if(hotelCode&&!destinationId){\n      const derived=await deriveHiddenFromRenderedOption(page,wantedPattern,'destination');\n      if(derived.value){await forceControlValue(destination,derived.value).catch(()=>false);destinationId=String(await destination.inputValue().catch(()=>'' )).trim();}\n    }\n    if(hotelCode&&destinationId){\n      console.log(`[cordial] Selección real del hotel mediante teclado: visual=${String(await visual.inputValue().catch(()=>'' )).trim()||'—'} · destination_id=${destinationId} · hotel_codes=${hotelCode}`);\n      return true;\n    }\n  }catch(error){console.log(`[cordial] No se pudo completar la selección interactiva del hotel: ${error?.message||String(error)}`);}\n  return false;\n}\nasync function deriveHiddenFromRenderedOption(page,pattern,kind){\n  const info=await optionDiagnostics(page,pattern);\n  const preferred=kind==='destination'\n    ?['destination_id','data-destination-id','data-id','data-value','value','data-code']\n    :['data-hotel-code','data-code','data-value','value','data-id'];\n  for(const row of info){\n    for(const key of preferred){\n      const value=String(row.attrs?.[key]||'').trim();\n      if(value)return {value,source:`${key} de «${row.text}»`,rows:info};\n    }\n  }\n  return {value:'',source:'',rows:info};\n}\nasync function selectHotelFromNativePopup(page,wanted='Cordial Santa Águeda & Perchel Beach Club',wantedCode='AGUEDA'){\n  // El diagnóstico real de BeCordial muestra que el selector NO es un autocomplete clásico:\n  // #where_popup contiene <li class=\"hotel\" data-hotel=\"AGUEDA\">. Pulsar ese elemento es\n  // la forma más fiel de reproducir la selección humana y permite que el JS propio del motor\n  // rellene hotel_codes/destination_id y cualquier estado interno asociado.\n  const form=page.locator('#booking_process_form').first();\n  const code=form.locator('input[name=\"hotel_codes\"]').first();\n  const destination=form.locator('input[name=\"destination_id\"]').first();\n  const visual=form.locator('#id_search_text,input.search_text,input[placeholder*=\"destino\" i],input[placeholder*=\"hotel\" i]').first();\n  const opener=form.locator('.input-like.where').first();\n  const popup=form.locator('#where_popup').first();\n  const destinationOption=popup.locator('li.destination[data-destination=\"220\"]').first();\n  const hotelOption=popup.locator(`li.hotel[data-hotel=\"${wantedCode}\"]`).first();\n  if(!await form.count().catch(()=>0)||!await hotelOption.count().catch(()=>0))return false;\n  try{\n    if(await opener.count().catch(()=>0))await opener.click({timeout:3500}).catch(async()=>{await visual.click({force:true,timeout:2500}).catch(()=>{});});\n    await page.waitForTimeout(220);\n    // Si el destino no está ya marcado, lo seleccionamos desde el mismo popup nativo.\n    if(await destinationOption.count().catch(()=>0)){\n      const selected=await destinationOption.evaluate(el=>el.classList.contains('li_selected')).catch(()=>false);\n      if(!selected){\n        await destinationOption.click({timeout:3000}).catch(async()=>destinationOption.click({force:true,timeout:3000}).catch(()=>{}));\n        await page.waitForTimeout(220);\n      }\n    }\n    const clicked=await hotelOption.click({timeout:3500}).then(()=>true).catch(async()=>hotelOption.click({force:true,timeout:3500}).then(()=>true).catch(()=>false));\n    if(!clicked)return false;\n    await page.waitForTimeout(550);\n    const hotelCode=String(await code.inputValue().catch(()=>'' )).trim();\n    const destinationId=String(await destination.inputValue().catch(()=>'' )).trim();\n    const visualValue=String(await visual.inputValue().catch(()=>'' )).trim();\n    console.log(`[cordial] Selector nativo de hotel: visual=${visualValue||'—'} · destination_id=${destinationId||'—'} · hotel_codes=${hotelCode||'—'}`);\n    if(hotelCode===wantedCode&&destinationId){\n      await form.evaluate((f,data)=>{f.setAttribute('data-mfe-hotel-code',data.hotelCode);f.setAttribute('data-mfe-destination-id',data.destinationId);},{hotelCode,destinationId}).catch(()=>{});\n      return true;\n    }\n  }catch(error){console.log(`[cordial] Selector nativo de hotel no pudo completarse: ${error?.message||String(error)}`);}\n  return false;\n}\n\nasync function chooseHotel(page,config){\n  const wanted=config.hotel||'Cordial Santa Águeda & Perchel Beach Club';\n  const code=page.locator('input[name=\"hotel_codes\"]').first();\n  const destination=page.locator('input[name=\"destination_id\"]').first();\n  const visual=page.locator('input[placeholder*=\"destino\" i],input[placeholder*=\"hotel\" i]').first();\n  const before={code:await code.inputValue().catch(()=>''),destination:await destination.inputValue().catch(()=>'' )};\n\n  // Primera opción: usar el selector nativo real que descubrimos en el HTML de diagnóstico.\n  const selectedNative=await selectHotelFromNativePopup(page,wanted,'AGUEDA').catch(()=>false);\n  if(selectedNative){\n    const currentCode=String(await code.inputValue().catch(()=>'' )).trim();\n    const currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();\n    console.log(`[cordial] Hotel preparado con selector nativo: code=${currentCode||'—'} · destination_id=${currentDestination||'—'}`);\n    return Boolean(currentCode&&currentDestination);\n  }\n\n  // Segundo intento: selección real mediante el autocomplete/entrada visual, porque ese clic ejecuta\n  // los listeners internos de BeCordial y prepara más estado que los hidden por sí solos.\n  const selectedThroughUi=await selectHotelThroughUi(page,wanted).catch(()=>false);\n  if(selectedThroughUi){\n    const currentCode=String(await code.inputValue().catch(()=>'' )).trim();\n    const currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();\n    const visualValue=String(await visual.inputValue().catch(()=>'' )).trim();\n    console.log(`[cordial] Hotel preparado mediante interfaz: code=${currentCode||'—'} · destination_id=${currentDestination||'—'} · visual=${visualValue||'—'}`);\n    const bookingForm=code.locator('xpath=ancestor::form[1]');\n    if(await bookingForm.count().catch(()=>0)){\n      await bookingForm.evaluate((f,data)=>{f.setAttribute('data-mfe-hotel-code',data.hotelCode);f.setAttribute('data-mfe-destination-id',data.destinationId);},{hotelCode:currentCode,destinationId:currentDestination}).catch(()=>{});\n    }\n    return Boolean(currentCode&&currentDestination);\n  }\n  console.log('[cordial] El autocomplete no confirmó una selección real; usando compatibilidad por hidden como respaldo.');\n\n  // En la página específica del hotel, BeCordial precarga hotel_codes=AGUEDA pero deja\n  // destination_id vacío. El servidor devuelve de nuevo el buscador si se envía así.\n  // Por eso seleccionamos primero el destino y después el hotel usando el mismo autocomplete\n  // que utiliza un usuario real, y verificamos los hidden antes de lanzar la búsqueda.\n  let destinationSelected=false,hotelSelected=false;\n\n  // v2.1.95: el diagnóstico real de BeCordial mostró que el selector ya deja en el DOM\n  // nodos ocultos seleccionados con destination_id (p. ej. el destino y el hotel), aunque\n  // el input hidden destination_id siga vacío. Recuperamos ese identificador del propio DOM\n  // antes de intentar manipular visualmente el autocomplete. No se hardcodea ningún ID.\n  let prefilledDestination=String(await destination.inputValue().catch(()=>'' )).trim();\n  if(!prefilledDestination){\n    const fromHotel=await deriveHiddenFromRenderedOption(page,/Cordial Santa Águeda.*Perchel Beach Club/i,'destination');\n    const fromDestination=fromHotel.value?{value:'',source:'',rows:[]}:await deriveHiddenFromRenderedOption(page,/^Gran Canaria\\s*-\\s*Sur(?:\\s*\\(España\\))?$/i,'destination');\n    const derived=fromHotel.value?fromHotel:fromDestination;\n    if(derived.value){\n      await forceControlValue(destination,derived.value).catch(()=>false);\n      prefilledDestination=String(await destination.inputValue().catch(()=>'' )).trim();\n      if(prefilledDestination){\n        destinationSelected=true;\n        if(fromHotel.value)hotelSelected=true;\n        console.log(`[cordial] destination_id recuperado del modelo interno del selector: ${prefilledDestination} (${derived.source}).`);\n      }\n    }\n  }\n\n  if(await visible(visual)&&!prefilledDestination){\n    destinationSelected=await selectAutocompleteValue(page,visual,'Gran Canaria - Sur',/^Gran Canaria\\s*-\\s*Sur$/i);\n    await page.waitForTimeout(350);\n    let destinationValue=String(await destination.inputValue().catch(()=>'' )).trim();\n    if(!destinationValue){\n      // Si el widget ha dibujado una opción con el identificador en data-*, lo extraemos\n      // del propio DOM. No usamos IDs inventados ni constantes externas.\n      await visual.click({force:true}).catch(()=>{});\n      await visual.press('Control+A').catch(()=>{});\n      await visual.pressSequentially('Gran Canaria - Sur',{delay:25}).catch(()=>{});\n      await page.waitForTimeout(500);\n      const derived=await deriveHiddenFromRenderedOption(page,/^Gran Canaria\\s*-\\s*Sur$/i,'destination');\n      if(derived.value){await forceControlValue(destination,derived.value).catch(()=>false);destinationValue=String(await destination.inputValue().catch(()=>'' )).trim();console.log(`[cordial] destination_id derivado del selector: ${destinationValue||'—'} (${derived.source}).`);}\n      if(!destinationValue&&derived.rows.length)console.log(`[cordial] Opciones de destino detectadas: ${JSON.stringify(derived.rows.slice(0,5))}`);\n    }\n\n    // Una vez inicializado el destino, seleccionamos explícitamente Santa Águeda.\n    hotelSelected=await selectAutocompleteValue(page,visual,'Cordial Santa Águeda',/Cordial Santa Águeda.*Perchel Beach Club/i);\n    await page.waitForTimeout(450);\n  }\n\n  // Algunos builds exponen la opción de hotel directamente con atributos data-*.\n  let currentCode=String(await code.inputValue().catch(()=>'' )).trim();\n  if(!currentCode){\n    const dataOption=page.locator('[data-code=\"AGUEDA\"],[data-value=\"AGUEDA\"],[data-hotel-code=\"AGUEDA\"]').last();\n    if(await visible(dataOption)){await dataOption.click({force:true}).catch(()=>{});hotelSelected=true;await page.waitForTimeout(250);currentCode=String(await code.inputValue().catch(()=>'' )).trim();}\n  }\n  if(!currentCode&&String(before.code||'').trim()){\n    await forceControlValue(code,before.code).catch(()=>false);\n    currentCode=String(await code.inputValue().catch(()=>'' )).trim();\n  }\n\n  let currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();\n  if(!currentDestination&&String(before.destination||'').trim()){\n    await forceControlValue(destination,before.destination).catch(()=>false);\n    currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();\n  }\n\n  // Último intento: con el hotel ya seleccionado, abrimos de nuevo el autocomplete y\n  // buscamos cualquier nodo visible que represente Gran Canaria - Sur para obtener su ID.\n  if(!currentDestination&&await visible(visual)){\n    await visual.click({force:true}).catch(()=>{});\n    await visual.press('Control+A').catch(()=>{});\n    await visual.pressSequentially('Gran Canaria - Sur',{delay:25}).catch(()=>{});\n    await page.waitForTimeout(500);\n    const derived=await deriveHiddenFromRenderedOption(page,/^Gran Canaria\\s*-\\s*Sur$/i,'destination');\n    if(derived.value){await forceControlValue(destination,derived.value).catch(()=>false);currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();console.log(`[cordial] destination_id recuperado del DOM: ${currentDestination||'—'} (${derived.source}).`);}\n    // Restauramos el texto visible del hotel para no enviar el formulario con el buscador mostrando destino.\n    await visual.press('Control+A').catch(()=>{});\n    await visual.fill(wanted).catch(()=>{});\n    await visual.dispatchEvent('change').catch(()=>{});\n  }\n\n  console.log(`[cordial] Hotel preparado: code=${currentCode||'—'} · destination_id=${currentDestination||'—'} · destino=${destinationSelected?'sí':'no'} · hotel=${hotelSelected?'sí':'no'}`);\n  if(!currentCode)return false;\n  if(!currentDestination){\n    const diag=await optionDiagnostics(page,/Gran Canaria\\s*-\\s*Sur|Cordial Santa Águeda/i).catch(()=>[]);\n    console.log(`[cordial] No se obtuvo destination_id. Diagnóstico del selector: ${JSON.stringify(diag.slice(0,8))}`);\n    return false;\n  }\n  // Guardamos los valores críticos en el propio formulario. El JS de BeCordial puede\n  // vaciar hotel_codes al procesar el botón Buscar aunque el hotel ya estuviera elegido.\n  // Estos atributos internos nos permiten restaurarlos justo antes de cada intento de envío.\n  const bookingForm=code.locator('xpath=ancestor::form[1]');\n  if(await bookingForm.count().catch(()=>0)){\n    await bookingForm.evaluate((f,data)=>{\n      f.setAttribute('data-mfe-hotel-code',data.hotelCode);\n      f.setAttribute('data-mfe-destination-id',data.destinationId);\n    },{hotelCode:currentCode,destinationId:currentDestination}).catch(()=>{});\n  }\n  return true;\n}\nasync function forceControlValue(loc,value){\n  if(!loc||await loc.count().catch(()=>0)<1)return false;\n  try{\n    await loc.first().evaluate((el,v)=>{\n      const proto=el instanceof HTMLInputElement?HTMLInputElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:null;\n      const setter=proto?Object.getOwnPropertyDescriptor(proto,'value')?.set:null;\n      if(setter)setter.call(el,v);else el.value=v;\n      el.dispatchEvent(new Event('input',{bubbles:true}));\n      el.dispatchEvent(new Event('change',{bubbles:true}));\n    },String(value));\n    return String(await loc.first().inputValue().catch(()=>''))===String(value);\n  }catch{return false;}\n}\nasync function syncVisibleDateRange(page,checkIn,checkOut){\n  // BeCordial mantiene un campo visual de rango separado de date_from/date_to.\n  // Si ese texto se queda con las fechas anteriores, su JS puede considerar la búsqueda incompleta.\n  const rangeText=await page.evaluate(([from,to])=>{\n    const fmt=value=>new Intl.DateTimeFormat('es-ES',{weekday:'short',day:'numeric',month:'short'}).format(new Date(`${value}T12:00:00`)).replace(/,/g,'').replace(/\\./g,'').trim();\n    return `${fmt(from)} - ${fmt(to)}`;\n  },[checkIn,checkOut]).catch(()=>`${checkIn} - ${checkOut}`);\n  const form=page.locator('input[name=\"hotel_codes\"]').first().locator('xpath=ancestor::form[1]');\n  const scope=await form.count().catch(()=>0)?form:page.locator('body');\n  const inputs=scope.locator('input[type=\"text\"]');\n  const count=await inputs.count().catch(()=>0);\n  for(let i=0;i<count;i++){\n    const input=inputs.nth(i),value=String(await input.inputValue().catch(()=>''));\n    const name=String(await input.getAttribute('name').catch(()=>''));\n    const placeholder=String(await input.getAttribute('placeholder').catch(()=>''));\n    if(/promo|email|password|key/i.test(`${name} ${placeholder}`))continue;\n    if(!(/\\b(ene|feb|mar|abr|may|jun|jul|ago|sept|sep|oct|nov|dic)\\b/i.test(value)&&/\\s[-–]\\s/.test(value)))continue;\n    try{\n      await input.evaluate((el,v)=>{\n        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;\n        if(setter)setter.call(el,v);else el.value=v;\n        el.dispatchEvent(new Event('input',{bubbles:true}));\n        el.dispatchEvent(new Event('change',{bubbles:true}));\n        el.dispatchEvent(new Event('blur',{bubbles:true}));\n      },rangeText);\n      console.log(`[cordial] Rango visual sincronizado: ${rangeText}`);\n      return true;\n    }catch{}\n  }\n  return false;\n}\nasync function fillDateInputs(page,config){\n  const checkIn=String(config.checkIn||''),checkOut=String(config.checkOut||'');\n  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(checkIn)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(checkOut))throw new Error('Las fechas de Cordial no son válidas.');\n\n  // El formulario público de BeCordial usa actualmente date_from/date_to como campos ocultos.\n  // Debemos escribirlos aunque no sean visibles: el formulario los envía al motor de reservas.\n  const exactIn=page.locator('input[name=\"date_from\"],input#date_from');\n  const exactOut=page.locator('input[name=\"date_to\"],input#date_to');\n  const hasExactIn=await exactIn.count().catch(()=>0)>0,hasExactOut=await exactOut.count().catch(()=>0)>0;\n  if(hasExactIn&&hasExactOut){\n    const okIn=await forceControlValue(exactIn,checkIn),okOut=await forceControlValue(exactOut,checkOut);\n    if(okIn&&okOut){\n      await syncVisibleDateRange(page,checkIn,checkOut).catch(()=>false);\n      console.log(`[cordial] Fechas aplicadas al formulario: ${checkIn} → ${checkOut}`);\n      return true;\n    }\n  }\n\n  const dateInputs=page.locator('input[type=\"date\"]');\n  if(await dateInputs.count()>=2){\n    const okIn=await forceControlValue(dateInputs.nth(0),checkIn),okOut=await forceControlValue(dateInputs.nth(1),checkOut);\n    if(okIn&&okOut)return true;\n  }\n  const inSelectors=['input[name=\"date_from\"]','input[name*=\"checkin\" i]','input[name*=\"arrival\" i]','input[name*=\"entrada\" i]','input[name*=\"start\" i]','input[placeholder*=\"entrada\" i]'];\n  const outSelectors=['input[name=\"date_to\"]','input[name*=\"checkout\" i]','input[name*=\"departure\" i]','input[name*=\"salida\" i]','input[name*=\"end\" i]','input[placeholder*=\"salida\" i]'];\n  let inOk=false,outOk=false;\n  for(const selector of inSelectors){const loc=page.locator(selector).first();if(await loc.count().catch(()=>0)&&await forceControlValue(loc,checkIn)){inOk=true;break;}}\n  for(const selector of outSelectors){const loc=page.locator(selector).first();if(await loc.count().catch(()=>0)&&await forceControlValue(loc,checkOut)){outOk=true;break;}}\n  if(inOk&&outOk)return true;\n\n  // Último recurso: campo visual único “Entrada / Salida”.\n  const dateLabel=page.getByText(/Entrada\\s*\\/\\s*Salida/i).first();\n  if(await visible(dateLabel)){\n    const input=dateLabel.locator('xpath=following::input[not(@type=\"hidden\")][1]').first();\n    if(await visible(input)){\n      const [yi,mi,di]=checkIn.split('-'),[yo,mo,do_]=checkOut.split('-');\n      for(const value of [`${di}/${mi}/${yi} - ${do_}/${mo}/${yo}`,`${di}/${mi}/${yi} – ${do_}/${mo}/${yo}`]){\n        try{await input.fill(value);await input.dispatchEvent('change').catch(()=>{});return true;}catch{}\n        try{await input.evaluate((el,v)=>{el.removeAttribute('readonly');el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);return true;}catch{}\n      }\n    }\n  }\n  return false;\n}\nasync function setAdults(page,config){\n  const adults=Math.max(1,Number(config.adults)||2);\n  const inputs=page.locator('input[name*=\"adult\" i],select[name*=\"adult\" i]');\n  if(await inputs.count()){\n    const el=inputs.first();if((await el.evaluate(e=>e.tagName)).toLowerCase()==='select')await el.selectOption(String(adults)).catch(()=>{});else await el.fill(String(adults)).catch(()=>{});\n    return true;\n  }\n  // El formulario público de Cordial parte normalmente de 2 adultos. Si ya lo muestra, no tocamos el contador.\n  const text=await page.locator('body').innerText().catch(()=> '');if(new RegExp(`\\\\b${adults}\\\\s+adultos?\\\\b`,'i').test(text))return true;\n  return false;\n}\nasync function bookingResultReady(page){\n  if(/\\/booking\\/process\\/room/i.test(page.url()))return true;\n\n  // El motor de BeCordial puede mantener la URL en /booking/process/ aunque ya haya\n  // renderizado las habitaciones. En las ejecuciones reales v2.1.98 se observan varios\n  // botones visibles \"Reservar\" tras el submit nativo, pero la comprobación antigua\n  // seguía interpretándolo como formulario fallido. Detectamos también esa firma real.\n  const resultText=page.getByText(/Tarifa Club Cordial|Tarifa Estándar|Classic Duplex|Solo alojamiento|Desayuno/i);\n  const resultCount=await resultText.count().catch(()=>0);\n  for(let i=0;i<Math.min(resultCount,12);i++){if(await visible(resultText.nth(i)))return true;}\n\n  const reserveButtons=page.getByRole('button',{name:/^reservar$/i});\n  const count=await reserveButtons.count().catch(()=>0);\n  let visibleReserve=0;\n  for(let i=0;i<Math.min(count,30);i++){if(await visible(reserveButtons.nth(i)))visibleReserve++;}\n  if(visibleReserve>=2){\n    const body=await page.locator('body').innerText().catch(()=> '');\n    const hotelListSignature=['Cordial Green Golf','Cordial Sandy Golf','Cordial Mogán Valle','Cordial Mogán Playa'].filter(name=>body.includes(name)).length>=2;\n    const hasRoomContent=/SOLO ALOJAMIENTO|DESAYUNO|Classic|Duplex|Dúplex|Deluxe|Ocean|Tarifa Club Cordial|Tarifa Estándar/i.test(body);\n    if(hotelListSignature){\n      console.log(`[cordial] Resultados intermedios detectados: lista de hoteles (${visibleReserve} botones Reservar).`);\n      return true;\n    }\n    if(hasRoomContent){\n      console.log(`[cordial] Resultados de habitaciones detectados en /booking/process/ por ${visibleReserve} botones Reservar visibles.`);\n      return true;\n    }\n  }\n  return false;\n}\nasync function waitForBookingResult(page,timeout=45000){\n  const started=Date.now();\n  while(Date.now()-started<timeout){\n    if(await bookingResultReady(page))return true;\n    await page.waitForTimeout(350);\n  }\n  return false;\n}\nasync function setControlValueRaw(loc,value){\n  if(!loc||await loc.count().catch(()=>0)<1)return false;\n  try{\n    await loc.first().evaluate((el,v)=>{\n      const proto=el instanceof HTMLInputElement?HTMLInputElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:null;\n      const setter=proto?Object.getOwnPropertyDescriptor(proto,'value')?.set:null;\n      if(setter)setter.call(el,v);else el.value=v;\n    },String(value));\n    return String(await loc.first().inputValue().catch(()=>''))===String(value);\n  }catch{return false;}\n}\n\nasync function stabilizeBookingControls(page,form=null,fallback={}){\n  const hotel=page.locator('input[name=\"hotel_codes\"]').first();\n  const destination=page.locator('input[name=\"destination_id\"]').first();\n  const targetForm=form&&await form.count().catch(()=>0)?form:hotel.locator('xpath=ancestor::form[1]');\n  if(!await targetForm.count().catch(()=>0))return {ok:false,hotelCode:'',destinationId:''};\n  const remembered=await targetForm.evaluate(f=>({\n    hotelCode:f.getAttribute('data-mfe-hotel-code')||'',\n    destinationId:f.getAttribute('data-mfe-destination-id')||''\n  })).catch(()=>({hotelCode:'',destinationId:''}));\n  const wantedDestination=String(fallback.destinationId||remembered.destinationId||'').trim();\n  const wantedHotel=String(fallback.hotelCode||remembered.hotelCode||'').trim();\n  let hotelCode=String(await hotel.inputValue().catch(()=>'' )).trim();\n  let destinationId=String(await destination.inputValue().catch(()=>'' )).trim();\n  let restored=false;\n\n  // BeCordial puede reconstruir el formulario tras un submit fallido. En ese caso se\n  // pierden los atributos data-mfe-* y hotel_codes queda vacío. Conservamos además una\n  // copia en memoria (fallback) y restauramos SIN disparar input/change.\n  // Orden importante: primero destino y después hotel.\n  if(!destinationId&&wantedDestination){\n    restored=await setControlValueRaw(destination,wantedDestination).catch(()=>false)||restored;\n    destinationId=String(await destination.inputValue().catch(()=>'' )).trim();\n  }\n  if(!hotelCode&&wantedHotel){\n    restored=await setControlValueRaw(hotel,wantedHotel).catch(()=>false)||restored;\n    hotelCode=String(await hotel.inputValue().catch(()=>'' )).trim();\n  }\n  if(restored)console.log(`[cordial] Controles restaurados antes del envío: destination_id=${destinationId||'—'} · hotel_codes=${hotelCode||'—'}`);\n  return {ok:Boolean(hotelCode&&destinationId),hotelCode,destinationId};\n}\n\nasync function formState(page,form){\n  if(!await form.count().catch(()=>0))return null;\n  return form.evaluate(f=>{\n    const invalid=[...f.elements].filter(el=>typeof el.checkValidity==='function'&&!el.checkValidity()).map(el=>({name:el.name||'',type:el.type||'',value:el.value||'',validation:el.validationMessage||''}));\n    const data=[];for(const [key,value] of new FormData(f).entries())data.push([key,String(value)]);\n    return {action:f.action||'',method:(f.method||'get').toUpperCase(),id:f.id||'',valid:f.checkValidity(),invalid,data};\n  }).catch(()=>null);\n}\nasync function postFormDirect(page,form,fallback={}){\n  const stable=await stabilizeBookingControls(page,form,fallback);\n  if(!stable.ok){console.log(`[cordial] POST directo cancelado: faltan controles críticos · destination_id=${stable.destinationId||'—'} · hotel_codes=${stable.hotelCode||'—'}`);return false;}\n  const state=await formState(page,form);if(!state?.action)return false;\n  const params=new URLSearchParams();for(const [key,value] of state.data||[])params.append(key,value);\n  // Defensa adicional: forzamos los valores críticos también en el payload.\n  params.set('destination_id',stable.destinationId);\n  params.set('hotel_codes',stable.hotelCode);\n  console.log(`[cordial] POST directo de diagnóstico: ${state.action} · valid=${state.valid?'sí':'no'} · destination_id=${params.get('destination_id')||'—'} · hotel_codes=${params.get('hotel_codes')||'—'}`);\n  if(state.invalid?.length)console.log(`[cordial] Controles HTML inválidos: ${JSON.stringify(state.invalid)}`);\n  try{\n    const response=await page.context().request.post(state.action,{data:params.toString(),headers:{'Content-Type':'application/x-www-form-urlencoded','Referer':page.url()},maxRedirects:0,timeout:30000});\n    const status=response.status(),location=response.headers()['location']||'';\n    console.log(`[cordial] Respuesta POST directa: HTTP ${status}${location?` · Location=${location}`:''}`);\n    if(status>=300&&status<400&&location){const next=new URL(location,state.action).href;await page.goto(next,{waitUntil:'domcontentloaded',timeout:45000});return await waitForBookingResult(page,25000);}\n    const html=await response.text().catch(()=>'');\n    if(/Tarifa Club Cordial|Classic Duplex|booking\\/process\\/room/i.test(html)){\n      await page.setContent(html,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});\n      return true;\n    }\n    const plain=html.replace(/<script[\\s\\S]*?<\\/script>/gi,' ').replace(/<style[\\s\\S]*?<\\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\\s+/g,' ').trim();\n    const clues=plain.match(/.{0,90}(?:obligatorio|requerido|required|error|selecciona|seleccione|fecha|hu[eé]sped|destino|hotel).{0,160}/gi)||[];\n    console.log(`[cordial] Respuesta sin resultados. Pistas: ${(clues.slice(0,6).join(' | ')||plain.slice(0,900)||'sin texto')}`);\n  }catch(error){console.log(`[cordial] POST directo falló: ${error?.message||String(error)}`);}\n  return false;\n}\n\nasync function installCriticalPostGuard(page,critical){\n  const pattern='**/booking/process/**';\n  let logged=false;\n  const handler=async route=>{\n    const request=route.request();\n    if(request.method()!=='POST')return route.continue();\n    const contentType=String(request.headers()['content-type']||'');\n    if(!/application\\/x-www-form-urlencoded/i.test(contentType))return route.continue();\n    try{\n      const params=new URLSearchParams(request.postData()||'');\n      const beforeDestination=params.get('destination_id')||'';\n      const beforeHotel=params.get('hotel_codes')||'';\n      if(critical.destinationId)params.set('destination_id',critical.destinationId);\n      if(critical.hotelCode)params.set('hotel_codes',critical.hotelCode);\n      const headers={...request.headers()};delete headers['content-length'];\n      if(!logged&&(beforeDestination!==critical.destinationId||beforeHotel!==critical.hotelCode)){\n        console.log(`[cordial] POST interceptado y corregido antes de salir: destination_id=${beforeDestination||'—'}→${critical.destinationId||'—'} · hotel_codes=${beforeHotel||'—'}→${critical.hotelCode||'—'}`);\n        logged=true;\n      }\n      return route.continue({postData:params.toString(),headers});\n    }catch{return route.continue();}\n  };\n  await page.route(pattern,handler);\n  return async()=>{await page.unroute(pattern,handler).catch(()=>{});};\n}\n\nasync function submitSearch(page){\n  const bookingInput=page.locator('input[name=\"hotel_codes\"]').first();\n  const form=bookingInput.locator('xpath=ancestor::form[1]');\n  const initialCritical=await stabilizeBookingControls(page,form);\n  const critical={destinationId:initialCritical.destinationId,hotelCode:initialCritical.hotelCode};\n  console.log(`[cordial] Controles críticos antes de enviar: destination_id=${critical.destinationId||'—'} · hotel_codes=${critical.hotelCode||'—'}`);\n  if(!initialCritical.ok)return false;\n  const initialState=await formState(page,form);\n  if(initialState){\n    console.log(`[cordial] Formulario de búsqueda: ${initialState.method} ${initialState.action||'(sin action)'}${initialState.id?` · #${initialState.id}`:''} · HTML válido=${initialState.valid?'sí':'no'}`);\n    if(initialState.invalid?.length)console.log(`[cordial] Validación HTML: ${JSON.stringify(initialState.invalid)}`);\n  }\n\n  // v2.1.98: el JS de BeCordial vacía hotel_codes justo al enviar. Interceptamos únicamente\n  // el POST real y reponemos los dos campos críticos, manteniendo cookies, CSRF y listeners.\n  const removeGuard=await installCriticalPostGuard(page,critical);\n  try{\n    const candidates=[\n      page.getByRole('button',{name:/^buscar$/i}).last(),\n      page.locator('button').filter({hasText:/^\\s*Buscar\\s*$/i}).last(),\n      page.locator('input[type=\"submit\"][value*=\"buscar\" i]').last(),\n      page.locator('[role=\"button\"]').filter({hasText:/^\\s*Buscar\\s*$/i}).last(),\n      page.getByRole('button',{name:/reservar|ver precios|consultar disponibilidad/i}).first(),\n      page.locator('button[type=\"submit\"],input[type=\"submit\"]').last()\n    ];\n    for(const button of candidates){\n      if(!await visible(button))continue;\n      const label=(await button.innerText().catch(()=>''))||(await button.getAttribute('value').catch(()=>''))||'botón';\n      console.log(`[cordial] Intentando búsqueda con: ${String(label).trim()||'botón visible'}`);\n      const stable=await stabilizeBookingControls(page,form,critical);\n      if(!stable.ok)continue;\n      await button.scrollIntoViewIfNeeded().catch(()=>{});\n      const responsePromise=page.waitForResponse(r=>/\\/booking\\/process\\/?(?:$|\\?)/i.test(r.url())&&r.request().method()==='POST',{timeout:10000}).catch(()=>null);\n      const clicked=await button.click({force:true,timeout:5000}).then(()=>true).catch(()=>false);\n      if(!clicked)continue;\n      const response=await responsePromise;\n      if(response)console.log(`[cordial] POST del botón: HTTP ${response.status()} · ${response.url()}`);\n      if(await waitForBookingResult(page,20000))return true;\n    }\n\n    if(await form.count().catch(()=>0)){\n      console.log('[cordial] El botón no abrió resultados; probando requestSubmit() del formulario.');\n      const stableRequest=await stabilizeBookingControls(page,form,critical);\n      if(!stableRequest.ok)return false;\n      const requested=await form.evaluate(f=>{try{f.requestSubmit();return true;}catch{return false;}}).catch(()=>false);\n      if(requested&&await waitForBookingResult(page,16000))return true;\n\n      console.log('[cordial] requestSubmit() no abrió resultados; probando POST directo con la sesión del navegador.');\n      if(await postFormDirect(page,form,critical))return true;\n\n      console.log('[cordial] POST directo no abrió resultados; probando submit() HTML nativo.');\n      const stableNative=await stabilizeBookingControls(page,form,critical);\n      if(!stableNative.ok)return false;\n      const submitted=await form.evaluate(f=>{try{HTMLFormElement.prototype.submit.call(f);return true;}catch{return false;}}).catch(()=>false);\n      if(submitted&&await waitForBookingResult(page,20000))return true;\n    }\n    await snapshot(page,'cordial-formulario-fallido').catch(()=>{});\n    return false;\n  }finally{await removeGuard();}\n}\nasync function visibleReserveCount(page){\n  const reserves=page.getByRole('button',{name:/^reservar$/i});\n  const count=Math.min(await reserves.count().catch(()=>0),60);let visibleCount=0;\n  for(let i=0;i<count;i++)if(await visible(reserves.nth(i)))visibleCount++;\n  return visibleCount;\n}\nasync function roomRatesReady(page,config={}){\n  const wantedRoom=String(config.targetRoom||'Classic Duplex').trim();\n  const body=await page.locator('body').innerText().catch(()=> '');\n  if(wantedRoom&&new RegExp(wantedRoom.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'),'i').test(body))return true;\n  if(/Tarifa Club Cordial|Tarifa Est[aá]ndar|Club Cordial\\s*-\\s*(?:Oferta Prepago Online|Reserva Online)|SOLO ALOJAMIENTO/i.test(body))return true;\n  return /\\/booking\\/process\\/room/i.test(page.url())&&await visibleReserveCount(page)>0;\n}\nasync function destinationHotelListReady(page){\n  const cards=page.locator('.hotel_list .hotel,.hotels_list .hotel,.hotel-list .hotel');\n  let visibleCards=0;const count=Math.min(await cards.count().catch(()=>0),40);\n  for(let i=0;i<count;i++)if(await visible(cards.nth(i)))visibleCards++;\n  if(visibleCards>=2)return true;\n  const body=await page.locator('body').innerText().catch(()=> '');\n  const signatures=['Cordial Green Golf','Cordial Sandy Golf','Cordial Mogán Valle','Cordial Mogán Playa'];\n  return signatures.filter(name=>body.includes(name)).length>=2&&await visibleReserveCount(page)>=2;\n}\nasync function clickTargetHotelFromResults(page,config={}){\n  if(!await destinationHotelListReady(page))return false;\n  const wanted=String(config.hotel||'Cordial Santa Águeda & Perchel Beach Club').trim();\n  const wantedPattern=/Cordial Santa Águeda.*Perchel Beach Club/i;\n  const directCards=[\n    page.locator('.hotel_list .hotel').filter({hasText:wantedPattern}),\n    page.locator('.hotels_list .hotel').filter({hasText:wantedPattern}),\n    page.locator('.hotel-list .hotel').filter({hasText:wantedPattern})\n  ];\n  for(const group of directCards){\n    const count=Math.min(await group.count().catch(()=>0),8);\n    for(let i=0;i<count;i++){\n      const card=group.nth(i);if(!await visible(card))continue;\n      const btn=card.getByRole('button',{name:/^reservar$/i}).first();\n      if(!await visible(btn))continue;\n      console.log(`[cordial] Resultado intermedio: seleccionando hotel «${wanted}» desde la lista de hoteles.`);\n      const clicked=await btn.click({timeout:5000}).then(()=>true).catch(async()=>btn.click({force:true,timeout:5000}).then(()=>true).catch(()=>false));\n      if(!clicked)continue;\n      const started=Date.now();while(Date.now()-started<30000){if(await roomRatesReady(page,config))return true;await page.waitForTimeout(350);}\n    }\n  }\n  // Respaldo: localizamos qué botón Reservar pertenece a un ancestro cuyo texto contiene el hotel.\n  const reserves=page.getByRole('button',{name:/^reservar$/i});\n  const count=Math.min(await reserves.count().catch(()=>0),50);\n  for(let i=0;i<count;i++){\n    const btn=reserves.nth(i);if(!await visible(btn))continue;\n    const belongs=await btn.evaluate((el,name)=>{\n      const norm=v=>String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();\n      const target=norm(name);let node=el.parentElement;\n      for(let depth=0;node&&depth<7;depth++,node=node.parentElement){\n        const text=norm(node.innerText||'');if(text.includes(target))return true;\n        if(text.length>8000)break;\n      }return false;\n    },wanted).catch(()=>false);\n    if(!belongs)continue;\n    console.log(`[cordial] Resultado intermedio: hotel objetivo localizado por contexto; pulsando Reservar.`);\n    const clicked=await btn.click({timeout:5000}).then(()=>true).catch(async()=>btn.click({force:true,timeout:5000}).then(()=>true).catch(()=>false));\n    if(!clicked)continue;\n    const started=Date.now();while(Date.now()-started<30000){if(await roomRatesReady(page,config))return true;await page.waitForTimeout(350);}\n  }\n  await snapshot(page,'cordial-lista-hoteles-sin-seleccionar').catch(()=>{});\n  console.log(`[cordial] Se obtuvo una lista de hoteles, pero no se pudo abrir «${wanted}».`);\n  return false;\n}\nasync function ensureRoomResults(page,config={}){\n  if(await roomRatesReady(page,config))return true;\n  if(await destinationHotelListReady(page))return await clickTargetHotelFromResults(page,config);\n  return false;\n}\n\nasync function selectClubTab(page){\n  const tabs=page.getByText(/Tarifa Club Cordial/i);\n  const count=await tabs.count().catch(()=>0);\n  for(let i=0;i<Math.min(count,12);i++){\n    const tab=tabs.nth(i);\n    if(!await visible(tab))continue;\n    await tab.click().catch(()=>{});\n    await page.waitForTimeout(800);\n    return true;\n  }\n  return false;\n}\nfunction isBoard(line){return /^(SOLO ALOJAMIENTO|DESAYUNO|MEDIA PENSI[ÓO]N|PENSI[ÓO]N COMPLETA|TODO INCLUIDO|ALOJAMIENTO Y DESAYUNO)$/i.test(String(line).trim());}\nfunction isRate(line){return /^(Club Cordial\\s*-|Tarifa Est[aá]ndar|Oferta .*Online|Reserva Online)/i.test(String(line).trim());}\nfunction isCancellation(line){return /cancelaci[oó]n|reembolsable|no reembolsable/i.test(String(line));}\nfunction looksRoom(line,headings){const n=normalize(line);if(!n||n.length>75)return false;if(/club cordial\\s*-|reserva online|oferta prepago online|tarifa est[aá]ndar/i.test(line))return false;if(headings.has(n)&&!/resumen|habitaci[oó]n 1|cordial santa|m[aá]s informaci[oó]n|tarifa|filtro|ordenar/i.test(line))return true;return /^(classic|deluxe|ocean|premium|superior|villa|suite|duplex|d[uú]plex)/i.test(line);}\nexport function parseCordialText(text,headingTexts=[],config={}){\n  const lines=String(text||'').split(/\\n+/).map(x=>x.replace(/\\s+/g,' ').trim()).filter(Boolean);const headings=new Set(headingTexts.map(normalize));\n  const out=[];let room='',rate='',cancellation='',availability='';\n  for(let i=0;i<lines.length;i++){\n    const line=lines[i];\n    if(looksRoom(line,headings)){room=line;rate='';cancellation='';availability='';continue;}\n    if(isRate(line)){rate=line;cancellation='';availability='';continue;}\n    if(isCancellation(line)){cancellation=line;continue;}\n    if(/queda\\s+\\d+\\s+habitaci[oó]n|agotad|no disponible|sold out/i.test(line)){availability=line;continue;}\n    if(!isBoard(line)||!room)continue;\n    const money=[];for(let j=i+1;j<Math.min(lines.length,i+8);j++){\n      if(isBoard(lines[j])||isRate(lines[j])||looksRoom(lines[j],headings))break;\n      money.push(...eur(lines[j]));\n      if(/reservar/i.test(lines[j])&&money.length)break;\n    }\n    if(!money.length)continue;\n    const price=money[money.length-1],crossedPrice=money.length>1?money[0]:0;\n    const row={roomType:room,rateName:rate||'Tarifa Club Cordial',cancellation,board:line.toUpperCase(),price,crossedPrice,availability:availability||'Disponible'};\n    row.target=targetMatches(row,config);out.push(row);\n  }\n  // Quita duplicados que algunos layouts responsive repiten.\n  const map=new Map();for(const row of out){const key=[normalize(row.roomType),normalize(row.rateName),normalize(row.board),row.price].join('|');if(!map.has(key))map.set(key,row);}return [...map.values()];\n}\n\nfunction contextLines(text){return String(text||'').split(/\\n+/).map(x=>x.replace(/\\s+/g,' ').trim()).filter(Boolean);}\nfunction extractRateLine(text){\n  const lines=contextLines(text);\n  for(const line of lines){if(isRate(line))return line;}\n  const flat=String(text||'').replace(/\\s+/g,' ').trim();\n  const m=flat.match(/Club Cordial\\s*-\\s*(?:Oferta Prepago Online|Reserva Online)/i);\n  if(m)return m[0];\n  return /Tarifa Club Cordial/i.test(flat)?'Tarifa Club Cordial':'';\n}\nfunction extractCancellation(text){return contextLines(text).find(isCancellation)||'';}\nfunction extractAvailability(text){return contextLines(text).find(line=>/queda\\s+\\d+\\s+habitaci[oó]n|agotad|no disponible|sold out/i.test(line))||'';}\nfunction roomFromContext(context,headings){\n  const headingSet=new Set((headings||[]).map(normalize));\n  // La web de BeCordial no usa siempre H1-H6 para el nombre de la habitación.\n  // v2.2.02: reserveContexts también captura etiquetas de habitación visibles\n  // por su texto directo y las priorizamos para no asignar todas las tarifas al\n  // último H2/H3 encontrado (p. ej. Deluxe Duplex).\n  for(const h of [...(context.precedingRoomLabels||[])].reverse()){if(looksRoom(h,headingSet))return h;}\n  const candidates=[];\n  for(const ancestor of context.ancestors||[])for(const h of ancestor.headings||[])candidates.push(h);\n  for(const h of [...candidates].reverse()){if(looksRoom(h,headingSet))return h;}\n  for(const h of [...(context.precedingHeadings||[])].reverse()){if(looksRoom(h,headingSet))return h;}\n  for(const ancestor of [...(context.ancestors||[])].reverse()){\n    for(const line of contextLines(ancestor.text)){if(looksRoom(line,headingSet))return line;}\n  }\n  return '';\n}\nexport function parseReserveContext(context,headingTexts=[],config={}){\n  const ancestors=Array.isArray(context?.ancestors)?context.ancestors:[];\n  let tariffIndex=-1,board='',money=[];\n  for(let i=0;i<ancestors.length;i++){\n    const lines=contextLines(ancestors[i].text);\n    const foundBoard=lines.find(isBoard)||'';\n    const foundMoney=eur(ancestors[i].text);\n    if(foundBoard&&foundMoney.length){tariffIndex=i;board=foundBoard;money=foundMoney;break;}\n  }\n  if(tariffIndex<0)return null;\n  let rate='',cancellation='',availability='';\n  for(let i=tariffIndex;i<ancestors.length;i++){\n    const text=ancestors[i].text||'';\n    if(!rate)rate=extractRateLine(text);\n    if(!cancellation)cancellation=extractCancellation(text);\n    if(!availability)availability=extractAvailability(text);\n    if(rate&&cancellation)break;\n  }\n  const room=roomFromContext(context,headingTexts);\n  if(!room)return null;\n  const price=money[money.length-1],crossedPrice=money.length>1?money[0]:0;\n  if(!Number.isFinite(price)||price<=0)return null;\n  const row={roomType:room,rateName:rate||'Tarifa Club Cordial',cancellation,board:String(board).toUpperCase(),price,crossedPrice,availability:availability||'Disponible'};\n  row.target=targetMatches(row,config);\n  return row;\n}\nfunction dedupeOptions(rows=[]){\n  const map=new Map();\n  for(const row of rows.filter(Boolean)){\n    const key=[normalize(row.roomType),normalize(row.rateName),normalize(row.board),Number(row.price)||0].join('|');\n    if(!map.has(key)||row.target)map.set(key,row);\n  }\n  return [...map.values()];\n}\nfunction mergeCordialOptions(domRows=[],textRows=[]){\n  // El parser de texto recorre la página en orden y suele acertar mejor el nombre\n  // de habitación; el parser DOM aporta cancelación/disponibilidad de cada botón.\n  // Cuando ambos describen la misma tarifa, fusionamos y conservamos roomType del\n  // parser de texto. Así evitamos duplicados del tipo \"Deluxe Duplex / Club Cordial\".\n  const merged=textRows.map(row=>({...row}));\n  const sig=row=>[normalize(row?.rateName),normalize(row?.board),Number(row?.price||0).toFixed(2)].join('|');\n  const index=new Map();\n  merged.forEach((row,i)=>{const key=sig(row);if(!index.has(key))index.set(key,[]);index.get(key).push(i);});\n  for(const row of domRows){\n    const matches=index.get(sig(row))||[];\n    if(matches.length===1){\n      const target=merged[matches[0]];\n      if(!target.cancellation&&row.cancellation)target.cancellation=row.cancellation;\n      if(!target.availability&&row.availability)target.availability=row.availability;\n      if(!target.crossedPrice&&row.crossedPrice)target.crossedPrice=row.crossedPrice;\n      target.target=Boolean(target.target||row.target);\n      continue;\n    }\n    merged.push({...row});\n  }\n  return dedupeOptions(merged);\n}\nasync function reserveContexts(page){\n  return page.locator('button,input[type=\"button\"],input[type=\"submit\"],a').evaluateAll(nodes=>{\n    const visible=el=>!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length);\n    const label=el=>String(el.innerText||el.value||el.getAttribute('aria-label')||'').replace(/\\s+/g,' ').trim();\n    const reserve=nodes.filter(el=>visible(el)&&/^reservar$/i.test(label(el))).slice(0,80);\n    const allHeadings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible);\n    const ownText=el=>[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>String(n.textContent||'')).join(' ').replace(/\\s+/g,' ').trim();\n    const roomLike=text=>{\n      const t=String(text||'').replace(/\\s+/g,' ').trim();\n      if(!t||t.length>75||/club cordial\\s*-|reserva online|oferta prepago online|tarifa est[aá]ndar|solo alojamiento|desayuno/i.test(t))return false;\n      return /^(classic|deluxe|ocean|premium|superior|villa|suite|duplex|d[uú]plex)(?:\\s+[\\p{L}0-9&+\\-]+){0,6}$/iu.test(t);\n    };\n    // Capturamos nombres de habitación aunque sean <div>/<span>/<strong> y no headings.\n    // El texto directo evita que un contenedor enorme herede el texto de todas sus tarifas.\n    const roomNodes=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p,strong,b')]\n      .filter(visible).map(el=>({el,text:ownText(el)||label(el)})).filter(x=>roomLike(x.text));\n    return reserve.map((button,index)=>{\n      const ancestors=[];let node=button.parentElement;\n      for(let depth=0;node&&depth<11;depth++,node=node.parentElement){\n        const text=String(node.innerText||'').trim();\n        const headings=[...node.querySelectorAll(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6,h1,h2,h3,h4,h5,h6')]\n          .filter(visible).slice(0,8).map(h=>String(h.innerText||'').replace(/\\s+/g,' ').trim()).filter(Boolean);\n        ancestors.push({tag:node.tagName,id:node.id||'',className:String(node.className||'').slice(0,180),text:text.slice(0,5000),headings});\n        if(text.length>12000)break;\n      }\n      const precedingHeadings=allHeadings.filter(h=>(h.compareDocumentPosition(button)&Node.DOCUMENT_POSITION_FOLLOWING)!==0)\n        .slice(-12).map(h=>String(h.innerText||'').replace(/\\s+/g,' ').trim()).filter(Boolean);\n      const precedingRoomLabels=roomNodes.filter(x=>(x.el.compareDocumentPosition(button)&Node.DOCUMENT_POSITION_FOLLOWING)!==0)\n        .slice(-8).map(x=>x.text);\n      return {index,label:label(button),ancestors,precedingHeadings,precedingRoomLabels};\n    });\n  }).catch(()=>[]);\n}\nasync function parseCordialDom(page,headingTexts=[],config={}){\n  const contexts=await reserveContexts(page);\n  const rows=dedupeOptions(contexts.map(ctx=>parseReserveContext(ctx,headingTexts,config)));\n  console.log(`[cordial] Parser DOM: ${contexts.length} botones Reservar analizados · ${rows.length} tarifas interpretadas.`);\n  if(rows.length){\n    for(const row of rows.slice(0,24))console.log(`[cordial] Tarifa: ${row.roomType} · ${row.rateName} · ${row.board} · ${row.price.toFixed(2)} €${row.target?' · OBJETIVO':''}`);\n  }else if(contexts.length){\n    const summary=contexts.slice(0,8).map(ctx=>({index:ctx.index,precedingRoomLabels:(ctx.precedingRoomLabels||[]).slice(-4),precedingHeadings:ctx.precedingHeadings.slice(-4),ancestors:ctx.ancestors.slice(0,5).map(a=>({tag:a.tag,id:a.id,className:a.className,text:String(a.text||'').replace(/\\s+/g,' ').slice(0,700)}))}));\n    console.log(`[cordial] Contextos Reservar no interpretados: ${JSON.stringify(summary)}`);\n  }\n  return {rows,contexts};\n}\nasync function extractRoomMeta(page){\n  const fallback='https://www.becordial.com/gran-canaria-sur/cordial-santa-agueda/viviendas/';\n  return page.evaluate((fallbackUrl)=>{\n    const wanted=['Classic','Classic Duplex','Deluxe','Deluxe Duplex','Ocean Front','Beach Club House'];\n    const norm=value=>String(value||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/\\s+/g,' ').trim();\n    const visible=el=>!!(el&&(el.offsetWidth||el.offsetHeight||el.getClientRects().length));\n    const ownText=el=>[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>String(n.textContent||'')).join(' ').replace(/\\s+/g,' ').trim();\n    const result={};\n    for(const room of wanted){\n      const target=norm(room);\n      const candidates=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p,strong,b')].filter(visible).filter(el=>norm(ownText(el)||el.textContent)===target);\n      let imageUrl='',detailUrl='';\n      for(const el of candidates){\n        let node=el;\n        for(let depth=0;node&&depth<7;depth++,node=node.parentElement){\n          if(!imageUrl){\n            const img=[...node.querySelectorAll('img')].find(visible);\n            if(img)imageUrl=String(img.currentSrc||img.src||'').trim();\n            if(!imageUrl){\n              const bg=[node,...node.querySelectorAll('*')].find(x=>{const v=getComputedStyle(x).backgroundImage;return visible(x)&&v&&v!=='none'&&/url\\(/i.test(v);});\n              const m=bg?String(getComputedStyle(bg).backgroundImage||'').match(/url\\([\"']?([^\"')]+)[\"']?\\)/i):null;\n              if(m)imageUrl=m[1];\n            }\n          }\n          if(!detailUrl){\n            const link=[...node.querySelectorAll('a[href]')].find(a=>/m[aá]s detalles|ver detalle|detalle/i.test(String(a.textContent||'')));\n            if(link)detailUrl=String(link.href||'').trim();\n          }\n          if(imageUrl&&detailUrl)break;\n          if(String(node.innerText||'').length>12000)break;\n        }\n        if(imageUrl||detailUrl)break;\n      }\n      result[room]={name:room,imageUrl,detailUrl:detailUrl||fallbackUrl};\n    }\n    return result;\n  },fallback).catch(()=>({}));\n}\n\nasync function diagnostic(page){\n  const inputs=await page.locator('input,select').evaluateAll(nodes=>nodes.slice(0,50).map(el=>({tag:el.tagName,name:el.getAttribute('name')||'',type:el.getAttribute('type')||'',placeholder:el.getAttribute('placeholder')||'',value:el.value||''}))).catch(()=>[]);\n  const forms=await page.locator('form').evaluateAll(nodes=>nodes.slice(0,12).map(f=>({action:f.action||'',method:(f.method||'get').toUpperCase(),id:f.id||'',name:f.getAttribute('name')||''}))).catch(()=>[]);\n  const actions=await page.locator('button,input[type=\"submit\"],[role=\"button\"]').evaluateAll(nodes=>nodes.slice(0,40).map(el=>({tag:el.tagName,text:(el.innerText||el.value||el.getAttribute('aria-label')||'').trim(),type:el.getAttribute('type')||'',visible:!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length)}))).catch(()=>[]);\n  return `URL final: ${page.url()}. Controles: ${inputs.map(x=>`${x.tag}:${x.name||x.placeholder||x.type}=${x.value}`).slice(0,18).join('; ')}. Formularios: ${forms.map(x=>`${x.method} ${x.action||'(sin action)'}${x.id?`#${x.id}`:''}`).join(' | ')||'ninguno'}. Botones: ${actions.map(x=>`${x.visible?'V':'H'}:${x.tag}:${x.text||x.type}`).slice(0,18).join(' | ')||'ninguno'}`;\n}\nexport async function monitorCordial(browser,config={}){\n  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:1300},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'});const page=await context.newPage();\n  try{\n    const url=String(config.searchUrl||'https://www.becordial.com/gran-canaria-sur/cordial-santa-agueda/').trim();\n    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(1800);const cookiesReady=await acceptCordialCookies(page);if(!cookiesReady){await snapshot(page,'cordial-cookies-bloqueando').catch(()=>{});throw new Error('El panel de cookies de BeCordial sigue bloqueando el formulario y no se pudo cerrar automáticamente.');}\n    if(!/\\/booking\\/process\\/room/i.test(page.url())){\n      const hotelOk=await chooseHotel(page,config).catch(()=>false);\n      if(!hotelOk){const d=await diagnostic(page);throw new Error(`No se pudo inicializar por completo el destino/hotel de Cordial antes de buscar. ${d}`);}\n      const datesOk=await fillDateInputs(page,config).catch(()=>false);await setAdults(page,config).catch(()=>false);\n      if(!datesOk){const d=await diagnostic(page);throw new Error(`No se localizaron de forma fiable los campos de fechas del formulario público de Cordial. ${d}`);}\n      const submitted=await submitSearch(page);if(!submitted){const d=await diagnostic(page);throw new Error(`No se pudo enviar el formulario de reserva de Cordial. ${d}`);}\n    }\n    await page.waitForTimeout(900);\n    const roomReady=await ensureRoomResults(page,config).catch(()=>false);\n    if(!roomReady){await snapshot(page,'cordial-sin-llegar-habitaciones').catch(()=>{});const d=await diagnostic(page);throw new Error(`Cordial respondió a la búsqueda, pero no se pudo llegar a las habitaciones del hotel objetivo. ${d}`);}\n    console.log('[cordial] Hotel objetivo abierto: pantalla de habitaciones/tarifas disponible.');\n    await page.waitForTimeout(900);await selectClubTab(page).catch(()=>false);await page.waitForTimeout(650);\n    // Guardamos la pantalla REAL de resultados antes de interpretar nada. Si el lector vuelve\n    // a fallar, el artefacto contendrá por fin el DOM de las tarifas y no solo el buscador.\n    await snapshot(page,'cordial-resultados-bruto').catch(()=>{});\n    const body=await page.locator('body').innerText().catch(()=> '');\n    if(/captcha|verify you are human|comprobando su navegador|access denied/i.test(body))throw new Error('Cordial ha mostrado una verificación anti-bot durante la consulta.');\n    const headings=await page.locator('h1,h2,h3,h4,h5,h6').allTextContents().catch(()=>[]);\n    const domParsed=await parseCordialDom(page,headings,config);\n    const textOptions=parseCordialText(body,headings,config);\n    const options=normalizeCancellationLabels(mergeCordialOptions(domParsed.rows,textOptions));\n    const roomMeta=await extractRoomMeta(page);\n    console.log(`[cordial] Parser combinado: DOM=${domParsed.rows.length} · texto=${textOptions.length} · final=${options.length} · fichas habitación=${Object.values(roomMeta||{}).filter(x=>x?.imageUrl||x?.detailUrl).length}.`);\n    if(!options.length){await snapshot(page,'cordial-sin-opciones');const d=await diagnostic(page);throw new Error(`Cordial abrió el motor de reservas, pero no se pudieron interpretar tarifas. Se analizaron ${domParsed.contexts.length} botones Reservar. ${d}`);}\n    for(const row of options)row.target=false;\n    const target=selectTargetOption(options,config);\n    if(target)console.log(`[cordial] Objetivo ${target.targetMatch==='exact'?'exacto':'inferido'}: ${target.roomType} · ${target.rateName} · ${target.board} · ${Number(target.price).toFixed(2)} €`);\n    await snapshot(page,'cordial-resultados');\n    return {ok:true,status:'ok',source:'BeCordial · navegador real · GitHub Actions + Playwright',checkedAt:isoNow(),hotel:config.hotel||'Cordial Santa Águeda & Perchel Beach Club',checkIn:config.checkIn,checkOut:config.checkOut,adults:Number(config.adults)||2,options,roomMeta,target,targetPrice:Number(target?.price)||0,availability:target?'Disponible':'No encontrado',resultUrl:page.url()};\n  }finally{await context.close();}\n}\n\nexport const __cordialTest={parseCordialText,parseReserveContext,targetMatches,selectTargetOption,mergeCordialOptions,normalizeCancellationLabels,reservationOnline,positiveCancellation,normalize,fillDateInputs,forceControlValue,syncVisibleDateRange,submitSearch,formState,stabilizeBookingControls,bookingResultReady,roomRatesReady,destinationHotelListReady};\n";
const CORDIAL_RUN_FILE = "import fs from 'node:fs/promises';\nimport {chromium} from 'playwright';\nimport {isoNow,postResult,readTrackerLatest,successfulResultToday} from './lib.mjs';\nimport {monitorCordial} from './cordial.mjs';\n\nconst document=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));\nconst config={enabled:true,scheduleTime:'06:35',scheduleTimeZone:'Europe/Madrid',...(document.cordial||{})};\nconst force=/^(1|true|yes)$/i.test(String(process.env.MFE_FORCE_RUN||''));\nif(config.enabled===false){console.log('Monitor Cordial desactivado desde MFE Viajes.');process.exit(0);}\nif(!force){\n  const previous=await readTrackerLatest('cordial');\n  if(successfulResultToday(previous.result)){\n    console.log(`[cordial] OMITIDO: ya existe una comprobación correcta de hoy (${previous.result.checkedAt||previous.result.receivedAt||'sin hora'}). El cron tardío no repetirá la consulta.`);\n    process.exit(0);\n  }\n}\n\nasync function launchInstalledChrome(){\n  const attempts=[];\n  try{\n    const browser=await chromium.launch({channel:'chrome',headless:true});\n    console.log('[cordial] Navegador: Google Chrome preinstalado (channel=chrome).');\n    return browser;\n  }catch(error){attempts.push(`channel=chrome: ${error?.message||String(error)}`);}\n\n  const candidates=[\n    process.env.CHROME_BIN,\n    '/usr/bin/google-chrome',\n    '/usr/bin/google-chrome-stable',\n    '/usr/bin/chromium',\n    '/usr/bin/chromium-browser'\n  ].filter(Boolean);\n  for(const executablePath of [...new Set(candidates)]){\n    try{\n      await fs.access(executablePath);\n      const browser=await chromium.launch({executablePath,headless:true});\n      console.log(`[cordial] Navegador: ${executablePath}.`);\n      return browser;\n    }catch(error){attempts.push(`${executablePath}: ${error?.message||String(error)}`);}\n  }\n  throw new Error(`No se pudo iniciar el Chrome/Chromium preinstalado del runner. ${attempts.join(' | ')}`);\n}\n\nconst browser=await launchInstalledChrome();\ntry{\n  const result=await monitorCordial(browser,config);\n  await postResult('cordial',{...result,checkedAt:result.checkedAt||isoNow()});\n  console.log('[cordial] OK',JSON.stringify(result,null,2));\n}catch(error){\n  const result={ok:false,status:'error',error:error?.message||String(error),checkedAt:isoNow(),source:'BeCordial · GitHub Actions + Playwright'};\n  console.error('[cordial] ERROR',error);\n  try{await postResult('cordial',result);}catch(postError){console.error('No se pudo registrar el error de Cordial en el Worker:',postError.message);}\n  process.exitCode=1;\n}finally{await browser.close();}\n";
const CORDIAL_WORKFLOW_TEMPLATE = "name: Cordial · MFE Viajes\n\non:\n  schedule:\n    - cron: '35 6 * * *'\n      timezone: \"Europe/Madrid\"\n  workflow_dispatch:\n    inputs:\n      force:\n        description: 'Forzar comprobación aunque ya exista una correcta hoy'\n        required: false\n        default: true\n        type: boolean\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: cordial-monitor\n  cancel-in-progress: false\n\njobs:\n  monitor:\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n    defaults:\n      run:\n        working-directory: monitoring\n    env:\n      MFE_WORKER_URL: ${{ secrets.MFE_WORKER_URL }}\n      MFE_MONITOR_SECRET: ${{ secrets.MFE_MONITOR_SECRET }}\n      MFE_FORCE_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.force || false }}\n      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n          cache: npm\n          cache-dependency-path: monitoring/package-lock.json\n      - name: Instalar dependencias Node\n        run: npm ci\n      - name: Comprobar Chrome preinstalado\n        shell: bash\n        run: |\n          set -e\n          if command -v google-chrome >/dev/null 2>&1; then\n            google-chrome --version\n          elif command -v google-chrome-stable >/dev/null 2>&1; then\n            google-chrome-stable --version\n          elif command -v chromium >/dev/null 2>&1; then\n            chromium --version\n          elif command -v chromium-browser >/dev/null 2>&1; then\n            chromium-browser --version\n          else\n            echo \"::error::El runner no tiene Chrome/Chromium preinstalado.\"\n            exit 1\n          fi\n      - name: Ejecutar monitor Cordial\n        run: node cordial-run.mjs\n      - name: Guardar diagnóstico si falla\n        if: failure()\n        uses: actions/upload-artifact@v4\n        with:\n          name: cordial-diagnostico\n          path: monitoring/artifacts/\n          if-no-files-found: ignore\n          retention-days: 7\n";
const CORDIAL_WORKFLOW_FILE = "cordial-monitor.yml";
const VUELING_WORKFLOW_FILE = "vueling-monitor.yml";
const MOBILE_DEPLOY_WORKFLOW_FILE = "mfe-mobile-deploy.yml";
const MOBILE_DEPLOY_RELEASE_PATH = "mobile-release/MFE_Viajes_RELEASE.zip";
const MOBILE_DEPLOY_WORKFLOW_TEMPLATE = "name: Actualizar MFE Viajes · móvil\nrun-name: \"MFE móvil · ${{ inputs.request_id }}\"\n\non:\n  workflow_dispatch:\n    inputs:\n      request_id:\n        description: \"Identificador interno de MFE Viajes\"\n        required: false\n        type: string\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: mfe-viajes-mobile-deploy\n  cancel-in-progress: false\n\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    timeout-minutes: 25\n    env:\n      RELEASE_ZIP: mobile-release/MFE_Viajes_RELEASE.zip\n    steps:\n      - name: Descargar repositorio\n        uses: actions/checkout@v4\n        with:\n          ref: ${{ github.ref_name }}\n          fetch-depth: 1\n\n      - name: Preparar Node\n        uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n\n      - name: Comprobar ZIP recibido desde MFE Viajes\n        shell: bash\n        run: |\n          set -euo pipefail\n          if [[ ! -f \"$RELEASE_ZIP\" ]]; then\n            echo \"::error::No existe $RELEASE_ZIP. Sube primero el ZIP desde Configuración → Servicios e integraciones → Actualización desde Android.\"\n            exit 1\n          fi\n          echo \"ZIP localizado: $(du -h \"$RELEASE_ZIP\" | cut -f1)\"\n\n      - name: Extraer versión\n        shell: bash\n        run: |\n          set -euo pipefail\n          RELEASE_DIR=\"$RUNNER_TEMP/mfe-release\"\n          rm -rf \"$RELEASE_DIR\"\n          mkdir -p \"$RELEASE_DIR\"\n          unzip -q \"$RELEASE_ZIP\" -d \"$RELEASE_DIR\"\n          test -f \"$RELEASE_DIR/firebase.json\"\n          test -f \"$RELEASE_DIR/public/index.html\"\n          echo \"RELEASE_DIR=$RELEASE_DIR\" >> \"$GITHUB_ENV\"\n\n      - name: Validar MFE Viajes antes de publicar\n        shell: bash\n        run: |\n          set -euo pipefail\n          cd \"$RELEASE_DIR\"\n          node scripts/validate-release.mjs\n\n      - name: Detectar si hay Workers modificados\n        id: workers\n        shell: bash\n        run: |\n          set -euo pipefail\n          if [[ -f \"$RELEASE_DIR/ACTUALIZAR_WORKERS.bat\" ]]; then\n            echo \"changed=true\" >> \"$GITHUB_OUTPUT\"\n            echo \"La release incluye cambios de Workers.\"\n          else\n            echo \"changed=false\" >> \"$GITHUB_OUTPUT\"\n            echo \"La release no requiere actualizar Workers.\"\n          fi\n\n      - name: Comprobar secretos Cloudflare\n        if: steps.workers.outputs.changed == 'true'\n        shell: bash\n        env:\n          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}\n        run: |\n          set -euo pipefail\n          [[ -n \"$CLOUDFLARE_API_TOKEN\" ]] || { echo \"::error::Falta el secret CLOUDFLARE_API_TOKEN.\"; exit 1; }\n          [[ -n \"$CLOUDFLARE_ACCOUNT_ID\" ]] || { echo \"::error::Falta el secret CLOUDFLARE_ACCOUNT_ID.\"; exit 1; }\n\n      - name: Actualizar Workers modificados\n        if: steps.workers.outputs.changed == 'true'\n        shell: bash\n        env:\n          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}\n        run: |\n          set -euo pipefail\n          cd \"$RELEASE_DIR\"\n          node scripts/update-workers-ci.mjs\n\n      - name: Comprobar credencial Firebase\n        shell: bash\n        env:\n          FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_MFE_VIAJES || secrets.FIREBASE_SERVICE_ACCOUNT_PRESUPUESTO_HOGAR_9DEAD }}\n        run: |\n          set -euo pipefail\n          [[ -n \"$FIREBASE_SERVICE_ACCOUNT_JSON\" ]] || { echo \"::error::Falta el secret FIREBASE_SERVICE_ACCOUNT_MFE_VIAJES (o el secret Firebase ya existente del proyecto).\"; exit 1; }\n\n      - name: Autenticar Google / Firebase\n        uses: google-github-actions/auth@v3\n        with:\n          credentials_json: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_MFE_VIAJES || secrets.FIREBASE_SERVICE_ACCOUNT_PRESUPUESTO_HOGAR_9DEAD }}\n\n      - name: Publicar Firebase Hosting\n        shell: bash\n        run: |\n          set -euo pipefail\n          cd \"$RELEASE_DIR\"\n          npx --yes firebase-tools@latest deploy --only hosting:viajes --project presupuesto-hogar-9dead --non-interactive\n\n      - name: Resumen\n        if: success()\n        shell: bash\n        run: |\n          VERSION=$(grep -oE 'MFE Viajes · v[0-9]+\\.[0-9]+\\.[0-9]+' \"$RELEASE_DIR/public/index.html\" | head -1 || true)\n          {\n            echo \"## ✅ MFE Viajes actualizada\"\n            echo\n            echo \"${VERSION:-Versión publicada correctamente.}\"\n            echo\n            if [[ \"${{ steps.workers.outputs.changed }}\" == \"true\" ]]; then\n              echo \"- Cloudflare Workers: actualizados y verificados\"\n            else\n              echo \"- Cloudflare Workers: sin cambios\"\n            fi\n            echo \"- Firebase Hosting: publicado\"\n          } >> \"$GITHUB_STEP_SUMMARY\"\n";
const POOLS_AUTOMATION_VERSION = "1.0.4";
const POOLS_WORKFLOW_FILE = "pools-monitor.yml";
const POOLS_FILE = "// MFE_POOLS_AUTOMATION_VERSION: 1.0.4\nimport fs from 'node:fs/promises';\nimport path from 'node:path';\nimport { chromium } from 'playwright';\nimport { postResult, snapshot, isoNow } from './lib.mjs';\n\nconst SOURCE_URL='https://cordial.galileus.es/gweb/siloe/diario/?token=NUEraFBKcnlEYzdUVVRobnRPMHc5Zz09';\nconst ARTIFACTS=path.resolve('artifacts/pools');\nconst clean=v=>String(v??'').replace(/\\u00a0/g,' ').replace(/\\s+/g,' ').trim();\nconst norm=v=>clean(v).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();\nconst metricPattern=/(temperatura|temperature|temp\\.?\\b|ph\\b|cloro|chlorine|bromo|bromine|turbidez|turbidity|recirculaci[oó]n|recirculation|conductividad|conductivity|alcalinidad|alkalinity|redox|orp|salinidad|salinity)/i;\nconst measurementPattern=/(last measurement|ultima medici[oó]n|última medición|1st measurement|2nd measurement|1ª medici[oó]n|2ª medici[oó]n|primera medici[oó]n|segunda medici[oó]n)/i;\nconst placeholderPattern=/^(select|selecciona|seleccionar|choose|--+|piscina|pool)$/i;\n\nfunction safeMetricValue(v){\n  const value=clean(v);\n  if(!value||/^[-–—]+$/.test(value))return '';\n  return value;\n}\nfunction looksLikeMetricLabel(v){return metricPattern.test(clean(v));}\nfunction metricClass(label=''){\n  const n=norm(label);\n  if(/temperatura|temperature|temp\\b/.test(n))return 'temperature';\n  if(/\\bph\\b/.test(n))return 'ph';\n  if(/cloro|chlorine/.test(n))return 'chlorine';\n  if(/bromo|bromine/.test(n))return 'bromine';\n  return 'other';\n}\nfunction temperatureFromMetrics(metrics=[]){\n  for(const m of metrics){\n    if(metricClass(m.label)!=='temperature')continue;\n    const hit=String(m.value||'').replace(',','.').match(/-?\\d+(?:\\.\\d+)?/);\n    const n=hit?Number(hit[0]):NaN;\n    if(Number.isFinite(n)&&n>-5&&n<60)return n;\n  }\n  return null;\n}\nfunction metricNumber(value=''){\n  const hit=String(value??'').replace(',','.').match(/-?\\d+(?:\\.\\d+)?/);\n  return hit?Number(hit[0]):NaN;\n}\nfunction repairRecirculationMeasurements(measurements=[]){\n  const cloned=(measurements||[]).map(m=>({...m,metrics:(m.metrics||[]).map(metric=>({...metric}))}));\n  const latest=cloned.find(m=>/ultima|última|last/i.test(clean(m.measurement)))||cloned[0]||null;\n  const latestTurbidity=(latest?.metrics||[]).find(metric=>/turbidez|turbidity/i.test(clean(metric.label)));\n  const latestTurbidityValue=metricNumber(latestTurbidity?.value);\n  for(const measurement of cloned){\n    if(/ultima|última|last/i.test(clean(measurement.measurement)))continue;\n    const metrics=measurement.metrics||[];\n    if(metrics.some(metric=>/recirculaci[oó]n|recirculation/i.test(clean(metric.label))))continue;\n    // Galileus/SILOE ordena visualmente el índice de recirculación junto a la\n    // primera medición. En la vista móvil el DOM puede dejar el valor (p.ej. 4)\n    // bajo la etiqueta anterior \"Turbidez (UNF)\". Lo reparamos solo cuando el\n    // bloque no contiene otros parámetros, el valor es una hora entera plausible\n    // y la última turbidez real es un valor bajo/decimal.\n    if(metrics.length!==1)continue;\n    const metric=metrics[0];\n    if(!/turbidez|turbidity/i.test(clean(metric.label)))continue;\n    const value=metricNumber(metric.value);\n    if(!Number.isFinite(value)||!Number.isInteger(value)||value<1||value>24)continue;\n    if(!Number.isFinite(latestTurbidityValue)||latestTurbidityValue>=1)continue;\n    metric.label='Índice de recirculación (h)';\n  }\n  return cloned;\n}\nfunction makeMeasurementsFromMatrix(rows=[]){\n  const cleanRows=rows.map(r=>r.map(clean).filter((v,i,a)=>i===0||v!==''||a.length>1)).filter(r=>r.some(Boolean));\n  const metricRows=cleanRows.filter(r=>looksLikeMetricLabel(r[0]||''));\n  if(!metricRows.length)return [];\n  let headers=[];\n  for(const row of cleanRows){\n    if(row.some(cell=>measurementPattern.test(cell))){headers=row;break;}\n  }\n  const maxCols=Math.max(...metricRows.map(r=>Math.max(0,r.length-1)),1);\n  const out=[];\n  for(let col=0;col<maxCols;col++){\n    const metrics=[];\n    for(const row of metricRows){\n      const value=safeMetricValue(row[col+1]);\n      if(value)metrics.push({label:clean(row[0]),value});\n    }\n    if(!metrics.length)continue;\n    const label=clean(headers[col+1])||['Última medición','1.ª medición','2.ª medición'][col]||`Medición ${col+1}`;\n    out.push({measurement:label,date:'',time:'',metrics,temperature:temperatureFromMetrics(metrics)});\n  }\n  return out;\n}\nfunction makeMeasurementsFromLines(lines=[]){\n  const rows=lines.map(clean).filter(Boolean);\n  const metricIndices=[];\n  for(let i=0;i<rows.length;i++)if(looksLikeMetricLabel(rows[i]))metricIndices.push(i);\n  if(!metricIndices.length)return [];\n  const found=[];\n  let maxValues=0;\n  for(const idx of metricIndices){\n    const label=rows[idx];const values=[];\n    for(let j=idx+1;j<Math.min(rows.length,idx+8);j++){\n      if(looksLikeMetricLabel(rows[j]))break;\n      if(measurementPattern.test(rows[j]))continue;\n      const value=safeMetricValue(rows[j]);\n      if(!value)continue;\n      if(/^(pool measurements|mediciones|go back|volver)$/i.test(value))continue;\n      if(/^-?\\d+(?:[.,]\\d+)?(?:\\s*°?c|\\s*ppm|\\s*mg\\/l|\\s*(?:ntu|unf|fnu|unt)|\\s*µs\\/cm)?$/i.test(value)||/\\b\\d{1,2}:\\d{2}\\b/.test(value)||/\\b\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{2,4}\\b/.test(value))values.push(value);\n      if(values.length>=3)break;\n    }\n    if(values.length){found.push({label,values});maxValues=Math.max(maxValues,values.length);}\n  }\n  const measurements=[];\n  for(let col=0;col<maxValues;col++){\n    const metrics=[];\n    for(const row of found){const value=safeMetricValue(row.values[col]);if(value)metrics.push({label:row.label,value});}\n    if(metrics.length)measurements.push({measurement:['Última medición','1.ª medición','2.ª medición'][col]||`Medición ${col+1}`,date:'',time:'',metrics,temperature:temperatureFromMetrics(metrics)});\n  }\n  return measurements;\n}\nasync function extractPool(page,poolName='Piscina'){\n  const tables=await page.locator('table').evaluateAll(nodes=>nodes.map(table=>[...table.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(td=>String(td.innerText||td.textContent||'').trim())).filter(row=>row.length))).catch(()=>[]);\n  for(const rows of tables){const measurements=makeMeasurementsFromMatrix(rows);if(measurements.length)return {name:clean(poolName)||'Piscina',measurements};}\n  const text=await page.locator('body').innerText().catch(()=> '');\n  const measurements=makeMeasurementsFromLines(String(text).split(/\\r?\\n/));\n  return measurements.length?{name:clean(poolName)||'Piscina',measurements}:null;\n}\nasync function selectDescriptors(page){\n  return page.locator('select').evaluateAll(nodes=>nodes.map((s,index)=>{\n    const label=(s.labels&&s.labels[0]?.innerText)||s.getAttribute('aria-label')||s.getAttribute('name')||s.id||'';\n    const parent=String(s.parentElement?.innerText||'').slice(0,350);\n    return {index,name:s.getAttribute('name')||'',id:s.id||'',label:String(label).trim(),parent,options:[...s.options].map(o=>({value:String(o.value||''),text:String(o.textContent||'').trim(),disabled:Boolean(o.disabled)}))};\n  })).catch(()=>[]);\n}\nfunction choosePoolSelect(selects=[]){\n  const scored=selects.map(s=>{\n    const options=(s.options||[]).filter(o=>!o.disabled&&clean(o.text)&&!placeholderPattern.test(clean(o.text)));\n    const context=norm(`${s.name} ${s.id} ${s.label} ${s.parent}`);\n    let score=options.length*5;if(/pisc|pool|vaso/.test(context))score+=100;if(/select|selecc/.test(context))score+=10;\n    return {...s,options,score};\n  }).filter(s=>s.options.length);\n  scored.sort((a,b)=>b.score-a.score);return scored[0]||null;\n}\nasync function customOptions(page){\n  const selectTrigger=page.getByText(/^Select$/i).first();\n  if(await selectTrigger.isVisible().catch(()=>false)){await selectTrigger.click({force:true}).catch(()=>{});await page.waitForTimeout(400);}\n  const selectors=['[role=\"option\"]','.dropdown-menu a','.dropdown-menu button','.dropdown-menu li','.select2-results__option','.choices__item--choice','.bootstrap-select .dropdown-menu li a'];\n  const seen=new Map();\n  for(const selector of selectors){\n    const loc=page.locator(selector);const count=Math.min(await loc.count().catch(()=>0),50);\n    for(let i=0;i<count;i++){\n      const el=loc.nth(i);if(!await el.isVisible().catch(()=>false))continue;\n      const text=clean(await el.innerText().catch(()=>''));if(!text||placeholderPattern.test(text)||measurementPattern.test(text)||text.length>100)continue;\n      if(!seen.has(text))seen.set(text,{text,selector,index:i});\n    }\n  }\n  return [...seen.values()];\n}\nasync function collectNetworkResponses(page){\n  const items=[];\n  page.on('response',async response=>{\n    try{\n      const req=response.request();if(!['xhr','fetch'].includes(req.resourceType()))return;\n      const url=response.url();if(!/galileus|siloe|diario|pisc|pool|medic|measure/i.test(url))return;\n      const ct=response.headers()['content-type']||'';if(!/json|text|html|javascript/i.test(ct))return;\n      const text=await response.text();if(text.length>160000)return;\n      items.push({url,status:response.status(),contentType:ct,body:text.slice(0,160000)});\n    }catch{}\n  });\n  return items;\n}\nfunction poolsFromNetwork(items=[]){\n  const out=[];\n  const walk=(value,path='')=>{\n    if(Array.isArray(value)){for(const [i,v] of value.entries())walk(v,`${path}[${i}]`);return;}\n    if(!value||typeof value!=='object')return;\n    const entries=Object.entries(value);const flat=Object.fromEntries(entries.map(([k,v])=>[norm(k),v]));\n    const name=clean(flat.piscina||flat.pool||flat.nombre||flat.name||flat.vaso||flat.descripcion||'');\n    const metrics=[];\n    for(const [k,v] of entries){if(looksLikeMetricLabel(k)&&['string','number'].includes(typeof v))metrics.push({label:clean(k),value:clean(v)});}\n    if(name&&metrics.length)out.push({name,measurements:[{measurement:'Última medición',date:'',time:'',metrics,temperature:temperatureFromMetrics(metrics)}]});\n    for(const [k,v] of entries)if(v&&typeof v==='object')walk(v,`${path}.${k}`);\n  };\n  for(const item of items){\n    try{walk(JSON.parse(item.body));}catch{}\n  }\n  return out;\n}\nfunction mergePools(list=[]){\n  const map=new Map();\n  for(const pool of list){\n    const name=clean(pool?.name)||'Piscina';const key=norm(name);if(!map.has(key))map.set(key,{name,measurements:[]});\n    const target=map.get(key);\n    for(const m of pool.measurements||[]){\n      const sig=JSON.stringify((m.metrics||[]).map(x=>[norm(x.label),clean(x.value)]));if(!target.measurements.some(x=>JSON.stringify((x.metrics||[]).map(y=>[norm(y.label),clean(y.value)]))===sig))target.measurements.push(m);\n    }\n  }\n  return [...map.values()].filter(p=>p.measurements.some(m=>(m.metrics||[]).length)).map(p=>{const measurements=repairRecirculationMeasurements(p.measurements);const latest=measurements.find(m=>/ultima|última|last/i.test(clean(m.measurement)))||measurements[0]||{};const temperature=latest.temperature??temperatureFromMetrics(latest.metrics||[]);return {...p,measurements,latest,temperature};});\n}\nasync function scrapePools(page){\n  const network=await collectNetworkResponses(page);\n  await page.goto(SOURCE_URL,{waitUntil:'domcontentloaded',timeout:45000});\n  await page.waitForTimeout(2500);\n  await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});\n  await snapshot(page,'pools/01-inicial').catch(()=>{});\n  const diagnostics={selects:0,options:0,customOptions:0,networkResponses:0,attempted:0,mode:'',url:page.url()};\n  let pools=[];\n  let selects=await selectDescriptors(page);diagnostics.selects=selects.length;\n  const chosen=choosePoolSelect(selects);\n  if(chosen){\n    diagnostics.mode='select';diagnostics.options=chosen.options.length;\n    for(const option of chosen.options.slice(0,30)){\n      diagnostics.attempted++;\n      try{\n        const current=choosePoolSelect(await selectDescriptors(page));if(!current)break;\n        const loc=page.locator('select').nth(current.index);\n        await loc.selectOption(option.value?{value:option.value}:{label:option.text});\n        await page.waitForTimeout(900);await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});\n        const pool=await extractPool(page,option.text);if(pool)pools.push(pool);\n      }catch(error){diagnostics[`option${diagnostics.attempted}Error`]=String(error?.message||error).slice(0,180);}\n    }\n  }else{\n    const options=await customOptions(page);diagnostics.customOptions=options.length;diagnostics.mode=options.length?'custom':'single';\n    if(options.length){\n      for(const option of options.slice(0,24)){\n        diagnostics.attempted++;\n        try{\n          await page.goto(SOURCE_URL,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(1200);\n          const trigger=page.getByText(/^Select$/i).first();if(await trigger.isVisible().catch(()=>false)){await trigger.click({force:true});await page.waitForTimeout(250);}\n          const candidate=page.getByText(option.text,{exact:true}).last();if(!await candidate.isVisible().catch(()=>false))continue;\n          await candidate.click({force:true});await page.waitForTimeout(900);await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});\n          const pool=await extractPool(page,option.text);if(pool)pools.push(pool);\n        }catch(error){diagnostics[`custom${diagnostics.attempted}Error`]=String(error?.message||error).slice(0,180);}\n      }\n    }else{\n      const pool=await extractPool(page,'Piscina');if(pool)pools.push(pool);\n    }\n  }\n  await page.waitForTimeout(250);diagnostics.networkResponses=network.length;\n  pools.push(...poolsFromNetwork(network));\n  pools=mergePools(pools);\n  diagnostics.detectedPools=pools.length;\n  await fs.mkdir(ARTIFACTS,{recursive:true});\n  await fs.writeFile(path.join(ARTIFACTS,'diagnostic.json'),JSON.stringify({diagnostics,network:network.map(x=>({url:x.url,status:x.status,contentType:x.contentType,preview:x.body.slice(0,1000)}))},null,2),'utf8').catch(()=>{});\n  await snapshot(page,'pools/99-final').catch(()=>{});\n  return {source:'Galileus · SILOE · navegador real',sourceUrl:SOURCE_URL,fetchedAt:isoNow(),pools,diagnostics,warning:pools.length?'':`Galileus abrió correctamente, pero no se pudieron interpretar piscinas. Modo ${diagnostics.mode} · selectores ${diagnostics.selects} · opciones ${diagnostics.options||diagnostics.customOptions} · intentos ${diagnostics.attempted} · respuestas de red ${diagnostics.networkResponses}.`};\n}\n\nlet browser;\ntry{\n  try{browser=await chromium.launch({headless:true,channel:'chrome'});}catch{browser=await chromium.launch({headless:true});}\n  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:430,height:932},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 16; GC26 Pool Monitor) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36'});\n  const page=await context.newPage();\n  try{\n    const result=await scrapePools(page);\n    result.ok=true;result.status='ok';result.checkedAt=result.fetchedAt;\n    await postResult('pools',result);\n    console.log('[pools] OK',JSON.stringify({count:result.pools.length,diagnostics:result.diagnostics}));\n  }catch(error){\n    const result={ok:false,status:'error',source:'Galileus · SILOE · navegador real',sourceUrl:SOURCE_URL,checkedAt:isoNow(),fetchedAt:isoNow(),pools:[],error:String(error?.message||error),diagnostics:{fatal:true}};\n    await snapshot(page,'pools/99-error').catch(()=>{});await postResult('pools',result).catch(()=>{});console.error('[pools] ERROR',error);process.exitCode=1;\n  }finally{await context.close().catch(()=>{});}\n}finally{await browser?.close().catch(()=>{});}\n";
const POOLS_WORKFLOW_TEMPLATE = "name: Piscinas \u00b7 MFE Viajes\n\non:\n  schedule:\n    - cron: '10 8,12,16,20 * * *'\n      timezone: \"Atlantic/Canary\"\n  workflow_dispatch:\n    inputs:\n      force:\n        description: \"Forzar comprobaci\u00f3n\"\n        required: false\n        default: \"true\"\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: mfe-pools-monitor\n  cancel-in-progress: false\n\njobs:\n  monitor:\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n    defaults:\n      run:\n        working-directory: monitoring\n    env:\n      MFE_WORKER_URL: ${{ secrets.MFE_WORKER_URL }}\n      MFE_MONITOR_SECRET: ${{ secrets.MFE_MONITOR_SECRET }}\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n          cache: npm\n          cache-dependency-path: monitoring/package-lock.json\n      - name: Instalar dependencias Node\n        run: npm ci\n      - name: Comprobar Chrome preinstalado\n        shell: bash\n        run: |\n          set -e\n          if command -v google-chrome >/dev/null 2>&1; then\n            google-chrome --version\n          elif command -v google-chrome-stable >/dev/null 2>&1; then\n            google-chrome-stable --version\n          else\n            echo \"::error::El runner no tiene Google Chrome preinstalado.\"\n            exit 1\n          fi\n      - name: Leer piscinas de Galileus\n        run: node pools.mjs\n      - name: Guardar diagn\u00f3stico siempre\n        if: always()\n        uses: actions/upload-artifact@v4\n        with:\n          name: piscinas-diagnostico-${{ github.run_number }}\n          path: monitoring/artifacts/pools/\n          if-no-files-found: ignore\n          retention-days: 7\n";

const MONITOR_FALLBACK_TIME_ZONE = "Europe/Madrid";
const MONITOR_FALLBACK_LOCAL_HOUR = 7;
const MONITOR_FALLBACK_LOCAL_MINUTE = 15;
const MONITOR_FALLBACK_TRACKERS = [
  {id:"autoreisen",label:"AutoReisen",workflowEnv:"GITHUB_WORKFLOW_FILE",workflowDefault:"autoreisen-monitor.yml",inputs:{force:"true",telegram_test:"false",fleet_only:"false",request_id:"",fleet_config_json:""}},
  {id:"cordial",label:"Cordial",workflowEnv:"GITHUB_CORDIAL_WORKFLOW_FILE",workflowDefault:CORDIAL_WORKFLOW_FILE,inputs:{force:"true"}},
  {id:"vueling",label:"Vueling",workflowEnv:"GITHUB_VUELING_WORKFLOW_FILE",workflowDefault:VUELING_WORKFLOW_FILE,inputs:{force:"true",telegram_test:"false"}}
];

const TRAVEL_WEBCAM_PAGES = {
  "santa-agueda": {
    title:"Santa Águeda · El Pajar",
    provider:"in2theBeach",
    urls:["https://in2thebeach.es/webcam/71/el-pajar-santa-agueda-arguineguin/"]
  },
  "el-perchel": {
    title:"Playa de El Perchel",
    provider:"SkylineWebcams",
    urls:[
      "https://www.skylinewebcams.com/es/webcam/espana/canarias/las-palmas-gran-canaria/arguineguin-playa-de-el-perchel.html"
    ]
  }
};
function webcamAbsoluteUrl(value,base){try{return new URL(String(value||'').replace(/&amp;/g,'&').replace(/\\\//g,'/'),base).href;}catch{return '';}}
function webcamUnsafeAsset(url=''){
  try{const u=new URL(url),p=u.pathname.toLowerCase();return /\.(?:js|mjs|css|json|map|txt|xml|woff2?|ttf|otf)(?:$|\?)/i.test(p);}catch{return true;}
}
function webcamCandidatesFromHtml(html,pageUrl){
  const text=String(html||'').replace(/\\u0026/g,'&').replace(/\\\//g,'/'),items=[];
  const add=(raw,mode,score,note='')=>{
    const url=webcamAbsoluteUrl(raw,pageUrl);if(!url||!/^https?:/i.test(url)||webcamUnsafeAsset(url))return;
    const lower=url.toLowerCase();
    if(/doubleclick|googlesyndication|analytics|googletagmanager|facebook|instagram|twitter|cookie|windy|windguru|google\.com\/maps|maps\.google/.test(lower))return;
    if(/logo|favicon|sprite|avatar|sponsor|banner|icon-|\.svg(?:$|\?)/i.test(lower))score-=80;
    if(/\.m3u8(?:$|\?)/i.test(url)){mode='video';score+=160;}
    else if(/\.mp4(?:$|\?)/i.test(url)){mode='video';score+=130;}
    else if(/\.(?:jpe?g|webp|png)(?:$|\?)/i.test(url)){mode='image';score+=25;}
    if(/youtube\.com\/embed|youtu\.be/i.test(url)){mode='iframe';score+=110;}
    if(/(?:^|\.)embed\./i.test(new URL(url).hostname)||/\/(?:embed|player|stream)(?:\/|$|[?_-])/i.test(new URL(url).pathname)){if(mode==='iframe')score+=140;}
    if(/embed|stream|live|webcam|camera|snapshot|photogram|player/.test(lower))score+=55;
    if(/embed\.skylinewebcams\.com\/img\/\d+\.(?:jpe?g|webp)/i.test(url)){mode='image';score+=220;note=note||'Fotograma oficial de Skyline, actualizado periódicamente.';}
    if(/canariaslife\.com/.test(lower)&&/webcam|camara|camera/.test(lower))score+=20;
    items.push({url,mode,score,note,sourcePage:pageUrl});
  };
  for(const match of text.matchAll(/<iframe[^>]+(?:src|data-src)=['\"]([^'\"]+)['\"][^>]*>/gi))add(match[1],'iframe',120,'Reproductor oficial incrustado.');
  for(const match of text.matchAll(/<(?:video|source)[^>]+(?:src|data-src)=['\"]([^'\"]+)['\"][^>]*>/gi))add(match[1],'video',110);
  for(const match of text.matchAll(/<(?:div|a|button|section)[^>]+(?:data-url|data-src|data-video|data-player|data-embed|data-stream)=['\"]([^'\"]+)['\"][^>]*>/gi))add(match[1],'iframe',80,'Reproductor detectado en el widget de la cámara.');
  for(const match of text.matchAll(/['\"](?:src|url|embed|player|stream|file|videoUrl|embedUrl)['\"]\s*:\s*['\"]([^'\"]+)['\"]/gi))add(match[1],'iframe',65,'Reproductor detectado en la configuración de la página.');
  for(const match of text.matchAll(/<meta[^>]+(?:property|name)=['\"](?:og:image|twitter:image)['\"][^>]+content=['\"]([^'\"]+)['\"][^>]*>/gi))add(match[1],'image',45,'Imagen publicada por el proveedor.');
  for(const match of text.matchAll(/<meta[^>]+content=['\"]([^'\"]+)['\"][^>]+(?:property|name)=['\"](?:og:image|twitter:image)['\"][^>]*>/gi))add(match[1],'image',45,'Imagen publicada por el proveedor.');
  for(const match of text.matchAll(/<img[^>]+(?:src|data-src|data-original)=['\"]([^'\"]+)['\"][^>]*>/gi))add(match[1],'image',10);
  for(const match of text.matchAll(/https?:[^\"'<>\s]+?\.m3u8(?:\?[^\"'<>\s]*)?/gi))add(match[0],'video',150);
  for(const match of text.matchAll(/https?:[^\"'<>\s]+?\.mp4(?:\?[^\"'<>\s]*)?/gi))add(match[0],'video',125);
  for(const match of text.matchAll(/(?:https?:)?\/\/embed\.skylinewebcams\.com\/img\/\d+\.(?:jpe?g|webp)(?:\?[^\"'<>\s]*)?/gi))add(match[0].startsWith('//')?'https:'+match[0]:match[0],'image',240,'Fotograma oficial de Skyline, actualizado periódicamente.');
  for(const match of text.matchAll(/https?:[^\"'<>\s]+?(?:youtube\.com\/embed)[^\"'<>\s]*/gi))add(match[0],'iframe',100);
  const uniq=new Map();for(const item of items){const prev=uniq.get(item.url);if(!prev||item.score>prev.score)uniq.set(item.url,item);}return [...uniq.values()].sort((a,b)=>b.score-a.score);
}
async function fetchWebcamSource(url){
  const response=await fetch(url,{redirect:'follow',headers:{
    'User-Agent':'Mozilla/5.0 (Linux; Android 16; GC26) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
    'Accept':'text/html,application/xhtml+xml',
    'Accept-Language':'es-ES,es;q=0.9,en;q=0.6'
  }});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  return {url:response.url||url,html:await response.text()};
}
async function collectWebcamCandidates(def){
  const rows=[],errors=[];
  for(const url of def.urls||[]){
    try{const page=await fetchWebcamSource(url);rows.push(...webcamCandidatesFromHtml(page.html,page.url));}
    catch(error){errors.push(`${url}: ${error?.message||error}`);}
  }
  const uniq=new Map();for(const item of rows){const prev=uniq.get(item.url);if(!prev||item.score>prev.score)uniq.set(item.url,item);}return {candidates:[...uniq.values()].sort((a,b)=>b.score-a.score),errors};
}
function webcamIsOrdinaryPage(item){
  try{
    const target=new URL(String(item?.url||'')),source=new URL(String(item?.sourcePage||item?.url||''));
    const path=target.pathname.replace(/\/+$/,'').toLowerCase(),sourcePath=source.pathname.replace(/\/+$/,'').toLowerCase();
    if(target.origin===source.origin&&path===sourcePath)return true;
    if(/(^|\.)canariaslife\.com$/i.test(target.hostname)&&/^\/camaras-de-gran-canaria\//i.test(path))return true;
    if(/(^|\.)skylinewebcams\.com$/i.test(target.hostname)&&/\/(?:[a-z]{2}\/)?webcam\//i.test(path))return true;
    if(/\.html?$/i.test(path)&&!/embed|player|stream|live/i.test(path))return true;
    return false;
  }catch{return true;}
}
function webcamPlayableCandidate(candidates=[],key=''){
  const videos=candidates.filter(item=>item.mode==='video'&&!webcamIsOrdinaryPage(item)&&/\.(?:m3u8|mp4)(?:$|\?)/i.test(item.url||''));
  if(videos.length)return videos[0];
  const frames=candidates.filter(item=>item.mode==='iframe'&&!webcamIsOrdinaryPage(item));
  if(key==='el-perchel'){
    // Skyline no permite a terceros incrustar la emisión salvo a los hosts. Solo aceptar un embed oficial inequívoco;
    // jamás una página normal de Skyline/CanariasLife.
    return frames.find(item=>{try{const u=new URL(item.url);return /(^|\.)embed\.skylinewebcams\.com$/i.test(u.hostname)&&u.pathname!=='/'&&!/\/img\//i.test(u.pathname);}catch{return false;}})||null;
  }
  return frames[0]||null;
}
function webcamImageCandidate(candidates=[]){
  const images=candidates.filter(item=>item.mode==='image'&&!webcamUnsafeAsset(item.url)&&!/logo|favicon|sprite|avatar|sponsor|banner|icon-/i.test(item.url));
  return images.find(item=>/embed\.skylinewebcams\.com\/img\//i.test(item.url))
    ||images.find(item=>/snapshot|photogram|webcam|camera|live/i.test(item.url))
    ||images.find(item=>/skylinewebcams\.com|canariaslife\.com/i.test(item.url))
    ||null;
}
async function travelWebcamImageProxy(payload){
  const key=String(payload?.key||'').trim(),def=TRAVEL_WEBCAM_PAGES[key];if(!def)throw new ApiError(400,'Webcam no válida.');
  const {candidates}=await collectWebcamCandidates(def),best=webcamImageCandidate(candidates);
  if(!best)throw new ApiError(404,'No se ha encontrado ahora un fotograma válido de la webcam.');
  // Skyline/CDN puede conservar durante horas la misma respuesta para la URL estable del JPG.
  // Pedimos cada fotograma con una URL única y desactivamos la caché tanto en origen como en Cloudflare.
  const upstream=new URL(best.url);
  upstream.searchParams.set('_mfe',String(Date.now()));
  const response=await fetch(upstream.href,{redirect:'follow',headers:{
    'User-Agent':'Mozilla/5.0 (Linux; Android 16; GC26) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
    'Accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Referer':best.sourcePage||def.urls?.[0]||'',
    'Cache-Control':'no-cache, no-store, max-age=0',
    'Pragma':'no-cache'
  },cf:{cacheTtl:0,cacheEverything:false}});
  if(!response.ok)throw new ApiError(502,`El fotograma respondió HTTP ${response.status}.`);
  const contentType=response.headers.get('content-type')||'image/jpeg';
  if(!/^image\//i.test(contentType))throw new ApiError(502,'El proveedor no devolvió una imagen válida.');
  return new Response(response.body,{status:200,headers:{
    ...CORS_HEADERS,
    'Content-Type':contentType,
    'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',
    'CDN-Cache-Control':'no-store',
    'Surrogate-Control':'no-store',
    'X-MFE-Webcam-Source':best.sourcePage||''
  }});
}
async function travelWebcamResponse(payload,request){
  const key=String(payload?.key||'').trim(),def=TRAVEL_WEBCAM_PAGES[key];if(!def)throw new ApiError(400,'Webcam no válida.');
  const {candidates,errors}=await collectWebcamCandidates(def);
  const preferImage=payload?.preferImage===true||String(payload?.preferImage||'').toLowerCase()==='true';
  let best=preferImage?null:webcamPlayableCandidate(candidates,key),live=Boolean(best),refreshMs=0,note='';
  if(!best){
    const image=webcamImageCandidate(candidates);
    if(image){
      const proxy=new URL(request.url);proxy.search='';proxy.searchParams.set('action','webcam-image');proxy.searchParams.set('key',key);
      best={...image,mode:'image',url:proxy.href};live=false;refreshMs=300000;note='Fotograma oficial de Skyline servido por GC 26. Skyline reserva la incrustación del vídeo en directo a los anfitriones de la cámara.';
    }
  }
  if(!best)throw new ApiError(404,`${def.provider} no expone ahora un reproductor o imagen compatible.${errors.length?` ${errors.join(' · ')}`:''}`);
  return json({ok:true,key,title:def.title,provider:def.provider,sourcePage:best.sourcePage||def.urls?.[0]||'',mode:best.mode,url:best.url,note:note||best.note||'',refreshMs,live,workerVersion:WORKER_VERSION});
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runMonitorFallbackCheck(env,{scheduledAt:new Date(controller?.scheduledTime||Date.now()),source:`cron:${String(controller?.cron||"")}`}));
  },
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    try {
      const payload = await readPayload(request);
      if (payload.action === "image") return await proxyImage(payload.url);
      if (payload.action === "product-image") return await proxyProductImage(payload.url, payload.productName||"");
      if (payload.action === "fuel") return await fuelResponse();
      if (payload.action === "autoreisen" || payload.action === "cordial" || payload.action === "pools" || payload.action === "autoreisen-stage2" || payload.action === "dunas" || payload.action === "binter-stage2") {
        return await readTrackerResult(env, payload.action);
      }
      if (payload.action === "webcam") {
        return await travelWebcamResponse(payload, request);
      }
      if (payload.action === "webcam-image") {
        return await travelWebcamImageProxy(payload);
      }
      if (payload.action === "monitor-write") {
        return await writeTrackerResult(request, env, payload);
      }
      if (payload.action === "monitor-history") {
        return await readTrackerHistory(env, payload.type);
      }
      if (payload.action === "monitor-health") {
        return json({ok:true,service:"MFE Viajes · Seguimientos",version:WORKER_VERSION,kvConfigured:Boolean(env?.MFE_TRACKERS),fallbackCron:true,fallbackLocalTime:"07:15",fallbackTimeZone:MONITOR_FALLBACK_TIME_ZONE});
      }
      if (payload.action === "monitor-fallback-status") {
        return await monitorFallbackStatus(env);
      }
      if (payload.action === "monitor-fallback-run") {
        await verifyFirebaseUser(request,env);
        return json(await runMonitorFallbackCheck(env,{scheduledAt:new Date(),source:"manual",force:true}));
      }
      if (payload.action === "integration-health") {
        return integrationHealth(env);
      }
      if (payload.action === "drive-auth-status") {
        return await driveAuthStatus(request, env);
      }
      if (payload.action === "drive-auth-exchange") {
        return await driveAuthExchange(request, env, payload);
      }
      if (payload.action === "drive-auth-token") {
        return await driveAuthToken(request, env);
      }
      if (payload.action === "drive-auth-disconnect") {
        return await driveAuthDisconnect(request, env);
      }
      if (payload.action === "autoreisen-options") {
        return await autoreisenOptionsResponse(request, env, payload);
      }
      if (payload.action === "autoreisen-fleet-result") {
        return await readAutoreisenFleetResult(request, env, payload);
      }
      if (payload.action === "github-sync-autoreisen") {
        return await syncAutoreisenToGitHub(request, env, payload);
      }
      if (payload.action === "github-autoreisen-install") {
        return await installAutoreisenAutomation(request, env, payload);
      }
      if (payload.action === "github-autoreisen-run") {
        return await runAutoreisenWorkflow(request, env, payload);
      }
      if (payload.action === "github-stage-monitor-sync") {
        return await syncStageMonitorToGitHub(request,env,payload);
      }
      if (payload.action === "github-stage-monitor-run") {
        return await dispatchStageMonitor(request,env,payload);
      }
      if (payload.action === "github-autoreisen-status") {
        return await autoreisenAutomationStatus(request, env);
      }
      if (payload.action === "github-sync-cordial") {
        return await syncCordialToGitHub(request, env, payload);
      }
      if (payload.action === "github-cordial-install") {
        return await installCordialAutomation(request, env, payload);
      }
      if (payload.action === "github-cordial-run") {
        return await runCordialWorkflow(request, env, payload);
      }
      if (payload.action === "github-cordial-status") {
        return await cordialAutomationStatus(request, env);
      }
      if (payload.action === "github-pools-install") {
        return await installPoolsAutomation(request, env);
      }
      if (payload.action === "github-pools-run") {
        return await runPoolsWorkflow(request, env);
      }
      if (payload.action === "github-pools-status") {
        return await poolsAutomationStatus(request, env);
      }
      if (payload.action === "flightops-read") {
        return await readFlightOpsResult(env);
      }
      if (payload.action === "flightops-live") {
        return await liveFlightOpsResult(request, env, payload);
      }
      if (payload.action === "flightops-write") {
        return await writeFlightOpsResult(request, env, payload);
      }
      if (payload.action === "github-flightops-sync") {
        return await syncFlightOpsToGitHub(request, env, payload);
      }
      if (payload.action === "github-flightops-install") {
        return await installFlightOpsAutomation(request, env, payload);
      }
      if (payload.action === "github-flightops-run") {
        return await runFlightOpsWorkflow(request, env, payload);
      }
      if (payload.action === "github-flightops-status") {
        return await flightOpsAutomationStatus(request, env);
      }
      if (payload.action === "github-remove-vueling-workflows") {
        return await removeLegacyVuelingWorkflows(request, env);
      }
      if (payload.action === "github-mobile-deploy-status") {
        return await mobileDeployStatus(request, env);
      }
      if (payload.action === "github-mobile-deploy-install") {
        return await installMobileDeployWorkflow(request, env);
      }
      if (payload.action === "github-mobile-release-upload-init") {
        return await initMobileReleaseUpload(request, env, payload);
      }
      if (payload.action === "github-mobile-release-upload-chunk") {
        return await storeMobileReleaseChunk(request, env, payload);
      }
      if (payload.action === "github-mobile-release-upload-finalize") {
        return await finalizeMobileReleaseUpload(request, env, payload);
      }
      if (payload.action === "github-mobile-release-upload") {
        return await uploadMobileReleaseAndDispatch(request, env, payload);
      }
      if (payload.action === "github-mobile-deploy-trigger") {
        return await triggerMobileDeployWorkflow(request, env, payload);
      }
      if (payload.action === "github-mobile-deploy-run-status") {
        return await mobileDeployRunStatus(request, env, payload);
      }
      if (payload.action === "github-tracker-run-status") {
        return await trackerRunStatus(request, env, payload);
      }
      if (payload.action === "github-auth-diagnostic") {
        return await githubAuthDiagnostic(request, env);
      }
      if (!payload.url) {
        return json({ok:true,service:"MFE Viajes · Worker",version:WORKER_VERSION,message:"Worker activo."});
      }
      const target = new URL(payload.url);
      if (!['http:', 'https:'].includes(target.protocol)) throw new ApiError(400, "Solo se admiten enlaces http o https.");
      if (!isAllowedShop(target.hostname)) throw new ApiError(400, `Tienda no autorizada: ${target.hostname}`);
      const product = await readProductFromUrl(target, {hintName:payload.productName||"",postalCode:payload.postalCode||""});
      return json({ok:true,source:target.hostname,name:product.name||"",image:product.image||"",price:Number.isFinite(product.price)?product.price:null,currency:product.currency||"EUR",message:product.message||"",diagnostic:product.diagnostic||null});
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      return json({ok:false,error:error?.message||"Error interno del Worker."}, status);
    }
  }
};

async function readPayload(request) {
  const requestUrl = new URL(request.url);
  if (request.method === "GET") {
    return {
      action: requestUrl.searchParams.get("action") || "",
      key: requestUrl.searchParams.get("key") || "",
      type: requestUrl.searchParams.get("type") || "",
      url: requestUrl.searchParams.get("url") || "",
      postalCode: requestUrl.searchParams.get("postalCode") || "",
      productName: requestUrl.searchParams.get("productName") || ""
    };
  }
  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { throw new ApiError(400, "El cuerpo debe ser JSON válido."); }
    return {
      action:String(body?.action||"").trim(), kind:String(body?.kind||"").trim(), key:String(body?.key||"").trim(), type:String(body?.type||body?.tracker||"").trim(),
      result:body?.result||null, config:body?.config||{}, settings:body?.settings||{}, runWorkflow:Boolean(body?.runWorkflow),
      mode:String(body?.mode||"").trim(), force:Boolean(body?.force), telegramTest:Boolean(body?.telegramTest), requestId:String(body?.requestId||"").trim(),
      code:String(body?.code||"").trim(), clientId:String(body?.clientId||"").trim(), redirectUri:String(body?.redirectUri||"").trim(),
      url:String(body?.url||"").trim(), postalCode:String(body?.postalCode||"").trim(), productName:String(body?.productName||"").trim(),
      releaseBase64:String(body?.releaseBase64||"").replace(/\s/g,''), releaseName:String(body?.releaseName||"").trim(),
      uploadId:String(body?.uploadId||"").trim(), chunkBase64:String(body?.chunkBase64||"").replace(/\s/g,''),
      index:Number(body?.index), totalChunks:Number(body?.totalChunks), totalBytes:Number(body?.totalBytes)
    };
  }
  throw new ApiError(405, "Método no permitido.");
}

function integrationHealth(env){
  const githubConfigured=Boolean(env?.GITHUB_TOKEN&&env?.GITHUB_OWNER&&env?.GITHUB_REPO);
  return json({
    ok:true,
    service:"MFE Viajes · Centro de integraciones",
    version:WORKER_VERSION,
    drivePersistentAuthConfigured:Boolean(env?.GOOGLE_DRIVE_CLIENT_SECRET),
    driveOAuthClientIdConfigured:Boolean(env?.GOOGLE_DRIVE_CLIENT_ID),
    githubConfigured,
    githubBranch:String(env?.GITHUB_BRANCH||"main"),
    githubConfigPath:String(env?.GITHUB_CONFIG_PATH||"monitoring/config.json"),
    githubWorkflowFile:String(env?.GITHUB_WORKFLOW_FILE||"autoreisen-monitor.yml"),
    firebaseAuthConfigured:Boolean(env?.FIREBASE_PROJECT_ID),
    adminRestrictionConfigured:Boolean(env?.INTEGRATION_ADMIN_UIDS||env?.INTEGRATION_ADMIN_EMAILS),
    kvConfigured:Boolean(env?.MFE_TRACKERS),
    autoreisenControl:true,
    autoreisenInstaller:true,
    autoreisenDynamicOptions:true,
    autoreisenFleetPricing:true,
    cordialControl:true,
    cordialInstaller:true,
    poolsControl:true,
    poolsInstaller:true,
    poolsAutomationVersion:POOLS_AUTOMATION_VERSION,
    poolsWorkflowFile:POOLS_WORKFLOW_FILE,
    flightOpsControl:true,
    flightOpsInstaller:true,
    flightOpsAutomationVersion:FLIGHTOPS_AUTOMATION_VERSION,
    mobileDeployControl:true,
    mobileDeployWorkflowFile:MOBILE_DEPLOY_WORKFLOW_FILE,
    mobileDeployReleasePath:MOBILE_DEPLOY_RELEASE_PATH,
    monitorFallback:true,
    monitorFallbackLocalTime:"07:15",
    monitorFallbackTimeZone:MONITOR_FALLBACK_TIME_ZONE
  });
}
function driveOAuthSecret(env){
  const secret=String(env?.GOOGLE_DRIVE_CLIENT_SECRET||"").trim();
  if(!secret)throw new ApiError(503,"GOOGLE_DRIVE_CLIENT_SECRET no está configurado en el Worker.");
  return secret;
}
function driveOAuthClientId(env,payloadClientId=""){
  const configured=String(env?.GOOGLE_DRIVE_CLIENT_ID||"").trim();
  const supplied=String(payloadClientId||"").trim();
  const clientId=configured||supplied;
  if(!clientId)throw new ApiError(503,"Falta GOOGLE_DRIVE_CLIENT_ID o el Client ID enviado por MFE Viajes.");
  if(configured&&supplied&&configured!==supplied)throw new ApiError(400,"El Client ID de Google Drive no coincide con el configurado en Cloudflare.");
  return clientId;
}
function driveAuthKey(uid){return `drive:oauth:${String(uid||"").trim()}`;}
async function readDriveAuth(env,uid){
  const raw=await requireTrackerKv(env).get(driveAuthKey(uid));
  if(!raw)return null;
  try{return JSON.parse(raw);}catch{return null;}
}
async function writeDriveAuth(env,uid,value){
  await requireTrackerKv(env).put(driveAuthKey(uid),JSON.stringify(value));
}
function driveTokenSeconds(tokenData={}){
  return Math.max(300,Number(tokenData.expires_in)||3300);
}
async function googleTokenRequest(params){
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(params).toString()});
  let data=null;try{data=await response.json();}catch{}
  if(!response.ok||data?.error)throw new ApiError(502,data?.error_description||data?.error||`Google OAuth respondió HTTP ${response.status}.`);
  return data||{};
}
async function driveGoogleProfile(accessToken){
  if(!accessToken)return {};
  try{
    const response=await fetch("https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)",{headers:{Authorization:`Bearer ${accessToken}`}});
    if(!response.ok)return {};
    const data=await response.json();
    return {email:String(data?.user?.emailAddress||""),name:String(data?.user?.displayName||"")};
  }catch{return {};}
}
function validateDriveRedirectUri(request,redirectUri=""){
  const origin=String(request.headers.get("Origin")||"").trim();
  const supplied=String(redirectUri||"").trim();
  if(!origin||!supplied)throw new ApiError(400,"No se ha podido validar el origen de la autorización de Google Drive.");
  let expected,actual;try{expected=new URL(origin).origin;actual=new URL(supplied).origin;}catch{throw new ApiError(400,"Origen OAuth no válido.");}
  if(expected!==actual)throw new ApiError(400,"El origen OAuth no coincide con la app que inició la autorización.");
  return actual;
}
async function driveAuthStatus(request,env){
  const user=await verifyFirebaseUser(request,env);
  const configured=Boolean(String(env?.GOOGLE_DRIVE_CLIENT_SECRET||"").trim());
  const saved=await readDriveAuth(env,user.sub);
  return json({ok:true,configured,connected:Boolean(saved?.refreshToken),email:String(saved?.email||""),name:String(saved?.name||""),updatedAt:String(saved?.updatedAt||"")});
}
async function driveAuthExchange(request,env,payload){
  if(String(request.headers.get("X-Requested-With")||"")!=="XmlHttpRequest")throw new ApiError(400,"Cabecera CSRF de Google Drive no válida.");
  const user=await verifyFirebaseUser(request,env);
  const code=String(payload.code||"").trim();if(!code)throw new ApiError(400,"Google no ha devuelto un código de autorización.");
  const clientId=driveOAuthClientId(env,payload.clientId);
  const clientSecret=driveOAuthSecret(env);
  const redirectUri=validateDriveRedirectUri(request,payload.redirectUri);
  const existing=await readDriveAuth(env,user.sub);
  const tokenData=await googleTokenRequest({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:"authorization_code"});
  const refreshToken=String(tokenData.refresh_token||existing?.refreshToken||"");
  if(!refreshToken)throw new ApiError(400,"Google no devolvió un refresh token. Revoca el acceso anterior de MFE Viajes en tu cuenta de Google y vuelve a conectar Drive una vez.");
  const accessToken=String(tokenData.access_token||"");if(!accessToken)throw new ApiError(502,"Google no devolvió un access token.");
  const profile=await driveGoogleProfile(accessToken);
  const expiresIn=driveTokenSeconds(tokenData),now=Date.now();
  const saved={clientId,refreshToken,accessToken,accessTokenExpiresAt:now+expiresIn*1000,email:profile.email||String(existing?.email||""),name:profile.name||String(existing?.name||""),updatedAt:new Date(now).toISOString()};
  await writeDriveAuth(env,user.sub,saved);
  return json({ok:true,connected:true,accessToken,expiresIn,email:saved.email,name:saved.name});
}
async function driveAuthToken(request,env){
  const user=await verifyFirebaseUser(request,env);
  const saved=await readDriveAuth(env,user.sub);
  if(!saved?.refreshToken)throw new ApiError(401,"Google Drive todavía no está conectado de forma persistente.");
  const now=Date.now();
  if(saved.accessToken&&Number(saved.accessTokenExpiresAt)>now+90000){
    const expiresIn=Math.max(300,Math.round((Number(saved.accessTokenExpiresAt)-now)/1000));
    return json({ok:true,connected:true,accessToken:saved.accessToken,expiresIn,email:String(saved.email||""),name:String(saved.name||"")});
  }
  const clientId=driveOAuthClientId(env,saved.clientId);
  const clientSecret=driveOAuthSecret(env);
  let tokenData;
  try{tokenData=await googleTokenRequest({client_id:clientId,client_secret:clientSecret,refresh_token:String(saved.refreshToken),grant_type:"refresh_token"});}
  catch(error){
    if(error instanceof ApiError&&/invalid_grant|revoked|expired/i.test(error.message)){await requireTrackerKv(env).delete(driveAuthKey(user.sub));throw new ApiError(401,"La autorización persistente de Google Drive ha caducado o fue revocada. Conecta Drive de nuevo.");}
    throw error;
  }
  const accessToken=String(tokenData.access_token||"");if(!accessToken)throw new ApiError(502,"Google no devolvió un access token al renovar Drive.");
  const expiresIn=driveTokenSeconds(tokenData);
  const updated={...saved,accessToken,accessTokenExpiresAt:now+expiresIn*1000,updatedAt:new Date(now).toISOString()};
  await writeDriveAuth(env,user.sub,updated);
  return json({ok:true,connected:true,accessToken,expiresIn,email:String(updated.email||""),name:String(updated.name||"")});
}
async function driveAuthDisconnect(request,env){
  const user=await verifyFirebaseUser(request,env);
  const kv=requireTrackerKv(env),saved=await readDriveAuth(env,user.sub);
  const token=String(saved?.refreshToken||saved?.accessToken||"");
  if(token){
    try{await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"}});}catch{}
  }
  await kv.delete(driveAuthKey(user.sub));
  return json({ok:true,connected:false});
}

function decodeBase64Url(value){
  const base64=String(value||"").replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(String(value||"").length/4)*4,"=");
  const raw=atob(base64);return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function decodeJwtJson(value){return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));}
let FIREBASE_JWKS_CACHE=null;
let FIREBASE_JWKS_CACHE_AT=0;
const FIREBASE_WEB_API_KEY_FALLBACK="AIzaSyBC8CmDyQxtagvdBOmjMxzoybhLPYbqxQw";
async function fetchWithDeadline(url,options={},timeoutMs=6500){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||6500));
  try{return await fetch(url,{...options,signal:controller.signal});}finally{clearTimeout(timer);}
}
async function firebaseLookupToken(token,env){
  const apiKey=String(env?.FIREBASE_WEB_API_KEY||FIREBASE_WEB_API_KEY_FALLBACK).trim();
  if(!apiKey)throw new ApiError(503,"No hay API key de Firebase para validar la sesión.");
  let response;try{response=await fetchWithDeadline(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:token})},9000);}
  catch(error){throw new ApiError(504,"Firebase ha tardado demasiado en validar la sesión.");}
  let data=null;try{data=await response.json();}catch{}
  if(!response.ok)throw new ApiError(response.status===400?401:502,"Firebase no ha podido validar la sesión.");
  const user=Array.isArray(data?.users)?data.users[0]:null;if(!user?.localId)throw new ApiError(401,"La sesión de Firebase no es válida.");
  return {sub:String(user.localId),email:String(user.email||"")};
}
async function firebaseJwks(){
  const now=Date.now();if(FIREBASE_JWKS_CACHE&&now-FIREBASE_JWKS_CACHE_AT<55*60*1000)return FIREBASE_JWKS_CACHE;
  try{
    const response=await fetchWithDeadline('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',{cf:{cacheTtl:3600,cacheEverything:true}},5500);
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();if(!Array.isArray(data?.keys)||!data.keys.length)throw new Error('Sin claves');
    FIREBASE_JWKS_CACHE=data;FIREBASE_JWKS_CACHE_AT=now;return data;
  }catch(error){if(FIREBASE_JWKS_CACHE)return FIREBASE_JWKS_CACHE;throw error;}
}
async function verifyFirebaseUser(request,env){
  const projectId=String(env?.FIREBASE_PROJECT_ID||"").trim();
  if(!projectId)throw new ApiError(503,"FIREBASE_PROJECT_ID no está configurado en el Worker.");
  const token=bearerToken(request);if(!token)throw new ApiError(401,"Falta el token de Firebase.");
  const parts=token.split('.');if(parts.length!==3)throw new ApiError(401,"Token de Firebase no válido.");
  let header,payload;try{header=decodeJwtJson(parts[0]);payload=decodeJwtJson(parts[1]);}catch{throw new ApiError(401,"Token de Firebase no válido.");}
  if(header.alg!=="RS256"||!header.kid)throw new ApiError(401,"Firma de Firebase no válida.");
  const now=Math.floor(Date.now()/1000);
  if(payload.aud!==projectId||payload.iss!==`https://securetoken.google.com/${projectId}`||Number(payload.exp)<=now||Number(payload.iat)>now+60||!payload.sub)throw new ApiError(401,"El token de Firebase ha caducado o no pertenece al proyecto.");
  let verified=false;
  try{
    const jwks=await firebaseJwks(),jwk=jwks.keys?.find(key=>key.kid===header.kid);
    if(jwk){const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodeBase64Url(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));}
  }catch{}
  if(!verified){
    const lookup=await firebaseLookupToken(token,env);
    verified=lookup.sub===String(payload.sub)&&(!lookup.email||!payload.email||lookup.email.toLowerCase()===String(payload.email).toLowerCase());
  }
  if(!verified)throw new ApiError(401,"No se pudo verificar la firma de Firebase.");
  const allowedUids=String(env?.INTEGRATION_ADMIN_UIDS||"").split(',').map(x=>x.trim()).filter(Boolean);
  const allowedEmails=String(env?.INTEGRATION_ADMIN_EMAILS||"").split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!allowedUids.length&&!allowedEmails.length)throw new ApiError(503,"Configura INTEGRATION_ADMIN_UIDS o INTEGRATION_ADMIN_EMAILS en Cloudflare.");
  const permitted=allowedUids.includes(String(payload.sub))||allowedEmails.includes(String(payload.email||"").toLowerCase());
  if(!permitted)throw new ApiError(403,"Tu usuario no está autorizado para modificar GitHub desde la app.");
  return payload;
}
async function verifyFirebaseUserMobileStable(request,env){
  const projectId=String(env?.FIREBASE_PROJECT_ID||"").trim();
  if(!projectId)throw new ApiError(503,"FIREBASE_PROJECT_ID no está configurado en el Worker.");
  const token=bearerToken(request);if(!token)throw new ApiError(401,"Falta el token de Firebase.");
  const parts=token.split('.');if(parts.length!==3)throw new ApiError(401,"Token de Firebase no válido.");
  let header,payload;try{header=decodeJwtJson(parts[0]);payload=decodeJwtJson(parts[1]);}catch{throw new ApiError(401,"Token de Firebase no válido.");}
  if(header.alg!=="RS256"||!header.kid)throw new ApiError(401,"Firma de Firebase no válida.");
  const response=await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',{cf:{cacheTtl:3600,cacheEverything:true}});
  if(!response.ok)throw new ApiError(502,"No se pudieron obtener las claves públicas de Firebase.");
  const jwks=await response.json();const jwk=jwks.keys?.find(key=>key.kid===header.kid);if(!jwk)throw new ApiError(401,"La clave de firma de Firebase no coincide.");
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodeBase64Url(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const now=Math.floor(Date.now()/1000);
  if(!verified||payload.aud!==projectId||payload.iss!==`https://securetoken.google.com/${projectId}`||Number(payload.exp)<=now||Number(payload.iat)>now+60||!payload.sub)throw new ApiError(401,"El token de Firebase ha caducado o no pertenece al proyecto.");
  const allowedUids=String(env?.INTEGRATION_ADMIN_UIDS||"").split(',').map(x=>x.trim()).filter(Boolean);
  const allowedEmails=String(env?.INTEGRATION_ADMIN_EMAILS||"").split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!allowedUids.length&&!allowedEmails.length)throw new ApiError(503,"Configura INTEGRATION_ADMIN_UIDS o INTEGRATION_ADMIN_EMAILS en Cloudflare.");
  const permitted=allowedUids.includes(String(payload.sub))||allowedEmails.includes(String(payload.email||"").toLowerCase());
  if(!permitted)throw new ApiError(403,"Tu usuario no está autorizado para modificar GitHub desde la app.");
  return payload;
}
function githubHeaders(env){
  const token=String(env?.GITHUB_TOKEN||"").trim();if(!token)throw new ApiError(503,"GITHUB_TOKEN no está configurado.");
  return {Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'MFE-Viajes-Integration/2.2.15','Content-Type':'application/json'};
}
function githubTarget(env){
  const owner=String(env?.GITHUB_OWNER||"").trim(),repo=String(env?.GITHUB_REPO||"").trim();
  if(!owner||!repo)throw new ApiError(503,"Configura GITHUB_OWNER y GITHUB_REPO en Cloudflare.");
  return {owner,repo,branch:String(env?.GITHUB_BRANCH||'main').trim()||'main',path:String(env?.GITHUB_CONFIG_PATH||'monitoring/config.json').replace(/^\/+/,''),workflow:String(env?.GITHUB_WORKFLOW_FILE||'autoreisen-monitor.yml').trim()};
}
function decodeGithubContent(value){
  const binary=atob(String(value||'').replace(/\s/g,''));const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);
}
function encodeGithubContent(value){
  const bytes=new TextEncoder().encode(value);let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);
}
function cleanAutoreisenConfig(config={}){
  const allowed=['pickup','dropoff','pickupOfficeId','dropoffOfficeId','pickupAt','dropoffAt','group','model','carId','reservedPrice','searchUrl','enabled','intervalHours','scheduleMode','scheduleTime','scheduleTimeZone','fleetTrackAll','fleetTrackGroups','telegramEnabled','telegramNotifyEveryCheck','telegramNotifyPriceDrop','telegramNotifyBelowReserved','telegramNotifyAvailability','telegramNotifyError','telegramNotifyRecovery','telegramMinDropAmount','telegramMinDropPercent'];const result={};
  for(const key of allowed)if(config[key]!==undefined)result[key]=config[key];
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(result.pickupAt||''))||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(result.dropoffAt||'')))throw new ApiError(400,"Las fechas de AutoReisen no son válidas.");
  result.enabled=result.enabled!==false;
  result.fleetTrackAll=result.fleetTrackAll!==false;
  result.fleetTrackGroups=[...new Set((Array.isArray(result.fleetTrackGroups)?result.fleetTrackGroups:[]).map(x=>String(x||'').trim()).filter(Boolean))].slice(0,40);
  if(!result.fleetTrackAll&&!result.fleetTrackGroups.length&&result.group)result.fleetTrackGroups=[String(result.group).trim()];
  result.intervalHours=Math.min(24,Math.max(1,Number(result.intervalHours)||24));
  result.scheduleMode='daily';result.scheduleTime='06:30';result.scheduleTimeZone='Europe/Madrid';
  result.telegramMinDropAmount=Math.max(0,Number(result.telegramMinDropAmount)||0);result.telegramMinDropPercent=Math.max(0,Number(result.telegramMinDropPercent)||0);
  for(const key of ['telegramEnabled','telegramNotifyEveryCheck','telegramNotifyPriceDrop','telegramNotifyBelowReserved','telegramNotifyAvailability','telegramNotifyError','telegramNotifyRecovery'])result[key]=result[key]!==false;
  return result;
}
function cleanCordialConfig(config={}){
  const allowed=['hotel','checkIn','checkOut','adults','children','targetRoom','targetRate','targetBoard','reservedPrice','searchUrl','enabled','scheduleMode','scheduleTime','scheduleTimeZone','title','color','gradient1','gradient2'];const result={};
  for(const key of allowed)if(config[key]!==undefined)result[key]=config[key];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(result.checkIn||''))||!/^\d{4}-\d{2}-\d{2}$/.test(String(result.checkOut||'')))throw new ApiError(400,'Las fechas de Cordial no son válidas.');
  result.adults=Math.max(1,Math.min(8,Number(result.adults)||2));result.children=Math.max(0,Math.min(8,Number(result.children)||0));result.reservedPrice=Math.max(0,Number(result.reservedPrice)||0);
  result.enabled=result.enabled!==false;result.scheduleMode='daily';result.scheduleTime=String(result.scheduleTime||'06:35');result.scheduleTimeZone='Europe/Madrid';
  result.hotel=String(result.hotel||'Cordial Santa Águeda & Perchel Beach Club').trim();result.targetRoom=String(result.targetRoom||'Classic Duplex').trim();result.targetRate=String(result.targetRate||'Club Cordial - Reserva Online').trim();result.targetBoard=String(result.targetBoard||'SOLO ALOJAMIENTO').trim();
  result.searchUrl=String(result.searchUrl||'https://www.becordial.com/gran-canaria-sur/cordial-santa-agueda/').trim();
  return result;
}

function cleanFlightOpsConfig(config={}){
  const flights=(Array.isArray(config?.flights)?config.flights:[]).slice(0,12).map((flight,index)=>{
    const number=String(flight?.number||'').trim().toUpperCase(),departure=String(flight?.departure||'').trim(),arrival=String(flight?.arrival||'').trim();
    const code=value=>String(value||'').toUpperCase().match(/\b([A-Z]{3})\b/)?.[1]||'';
    return {
      id:String(flight?.id||`flight-${index+1}`).trim(),number,date:String(flight?.date||departure.slice(0,10)).slice(0,10),departure,arrival,
      origin:code(flight?.origin||flight?.from),destination:code(flight?.destination||flight?.to),from:String(flight?.from||'').trim(),to:String(flight?.to||'').trim()
    };
  }).filter(f=>/^\w{2,3}\d{2,5}$/.test(f.number.replace(/\s+/g,''))&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(f.departure)&&f.origin&&f.destination);
  if(!flights.length)throw new ApiError(400,'No hay vuelos válidos para configurar el seguimiento operativo.');
  return {enabled:config?.enabled!==false,flights};
}

const AUTOREISEN_VERIFIED_OFFICES=[
  {id:'1',label:'Tenerife Norte (TFN)'},{id:'2',label:'Tenerife Sur (TFS)'},{id:'3',label:'Lanzarote (ACE)'},{id:'18',label:'Gran Canaria - Aeropuerto (LPA)'},{id:'19',label:'Fuerteventura (FUE)'}
];
const AUTOREISEN_REFERENCE_FLEET=[
  {group:'A',model:'Citröen C3 5P A/C',carId:''},
  {group:'C',model:'Seat Ibiza 5P A/C',carId:''},
  {group:'C',model:'VW Polo A/C',carId:''},
  {group:'D',model:'Seat Ibiza AUTOMATIC',carId:''},
  {group:'D',model:'Golf TSI AUTOMATIC',carId:''},
  {group:'E',model:'Hyundai i30',carId:''},
  {group:'E',model:'Seat Arona TSI Reference',carId:'119'},
  {group:'G',model:'Citröen C3 Aircross Family',carId:''},
  {group:'G',model:'D.Jogger 5 Pax Family',carId:''},
  {group:'H',model:'VW Golf 5P A/C',carId:''},
  {group:'H',model:'Citröen C4 PureTech',carId:''},
  {group:'H',model:'VW T-Cross',carId:''},
  {group:'H',model:'VW Taigo',carId:''},
  {group:'H',model:'VW T-Roc',carId:''}
];
const AUTOREISEN_GROUP_SUGGESTIONS=[...new Set(AUTOREISEN_REFERENCE_FLEET.map(x=>x.group))];
function autoreisenDateParts(value=''){const [date,time='00:00']=String(value).split('T');const [year,month,day]=date.split('-');return {year,month:String(Number(month||0)),day:String(Number(day||0)),time:time.slice(0,5)};}
function autoreisenResultsUrl(config={},options={}){const p=autoreisenDateParts(config.pickupAt),d=autoreisenDateParts(config.dropoffAt);const url=new URL('https://www.autoreisen.com/alquiler-coches/tarifas-flota.php');const rec=String(config.pickupOfficeId||'18').trim(),dev=String(config.dropoffOfficeId||rec).trim(),car=String(config.carId||'').trim();url.searchParams.set('ofi_rec',rec);url.searchParams.set('ofi_dev',dev);url.searchParams.set('dia_inicio',p.day);url.searchParams.set('mes_inicio',`${p.month}-${p.year}`);url.searchParams.set('hora_inicio',p.time);url.searchParams.set('dia_final',d.day);url.searchParams.set('mes_final',`${d.month}-${d.year}`);url.searchParams.set('hora_final',d.time);if(options.includeCar===true&&car){url.searchParams.set('coche',car);url.searchParams.set('id_coche',car);}url.searchParams.set('fin','1');return url.toString();}
function autoreisenPlainText(html=''){return decodeHtml(String(html).replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(?:div|p|li|tr|td|h[1-6])>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/\r/g,'').replace(/[\t ]+/g,' ').replace(/\n\s+/g,'\n').trim();}
function autoreisenParseSelect(html,name){const safe=String(name).replace(/[^a-z0-9_-]/gi,'');const m=String(html).match(new RegExp(`<select\\b[^>]*(?:name|id)\\s*=\\s*["']?${safe}["']?[^>]*>([\\s\\S]*?)<\\/select>`,'i'));if(!m)return [];const rows=[];for(const match of m[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)){const attrs=match[1]||'',label=autoreisenPlainText(match[2]).trim(),vm=attrs.match(/\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i),id=String(vm?.[1]??vm?.[2]??vm?.[3]??'').trim();if(!id||!label||/seleccion|select|elige|oficina de/i.test(label))continue;rows.push({id,label});}return rows;}
function autoreisenParseOffices(html){const rows=autoreisenParseSelect(html,'ofi_rec'),map=new Map();for(const x of rows)if(x.id&&x.label)map.set(x.id,x);return [...map.values()];}
function autoreisenKnownCarId(model=''){const n=String(model).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(n.includes('seat arona'))return '119';return '';}
function autoreisenParseFleet(html){const text=autoreisenPlainText(html),rows=[],seen=new Set();const re=/(?:^|\n)\s*([A-Z][A-Z0-9]{0,2})\s*[-–—:]\s*([^\n€]{3,130}?)\s+([0-9]{1,4}(?:[.,][0-9]{1,2}))\s*€\s*\/\s*d[ií]a/gim;for(const m of text.matchAll(re)){const group=String(m[1]).trim(),model=String(m[2]).replace(/\s+/g,' ').trim();if(!group||!model||/plazas|puertas|radio|aire acondicionado/i.test(model.slice(0,25)))continue;const key=`${group}\u0000${model.toLowerCase()}`;if(seen.has(key))continue;seen.add(key);const index=String(html).toLowerCase().indexOf(model.toLowerCase()),segment=index>=0?String(html).slice(Math.max(0,index-1800),index+2500):'',idMatch=segment.match(/(?:id_coche|coche)=(\d+)/i);rows.push({group,model,carId:idMatch?.[1]||autoreisenKnownCarId(model),pricePerDay:Number(m[3].replace(',','.'))});}return rows;}
function autoreisenHeaders(extra={}){return {Accept:'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8','Accept-Language':'es-ES,es;q=0.9','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36',...extra};}
function autoreisenAssertHtml(html){if(/please wait|request is being verified|verifying|comprobando su navegador|un momento/i.test(autoreisenPlainText(html)))throw new Error('AutoReisen ha activado su verificación temporal');return html;}
function autoreisenNoAvailability(html=''){return /no hay nada disponible para la combinación|no hay nada disponible para la combinacion|no availability for the combination|we are sorry we cannot offer/i.test(autoreisenPlainText(html));}
function autoreisenResponseMentionsRequestedDates(html='',config={}){const text=autoreisenPlainText(html).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();const p=autoreisenDateParts(config.pickupAt),d=autoreisenDateParts(config.dropoffAt);const months={1:['ene','jan'],2:['feb'],3:['mar'],4:['abr','apr'],5:['may'],6:['jun'],7:['jul'],8:['ago','aug'],9:['sep'],10:['oct'],11:['nov'],12:['dic','dec']};const has=(part)=>{const day=String(Number(part.day||0));return Boolean(day)&&String(part.year||'')&&text.includes(String(part.year))&&(months[Number(part.month)]||[]).some(m=>text.includes(`${day}-${m}`)||text.includes(`${day} ${m}`)||text.includes(`${day}/${String(part.month).padStart(2,'0')}`));};return has(p)&&has(d);}
async function autoreisenPublicHtml(url,options={}){const response=await fetchWithTimeout(url,{redirect:'follow',...options,headers:autoreisenHeaders(options.headers||{})});if(!response.ok)throw new Error(`AutoReisen respondió HTTP ${response.status}`);return autoreisenAssertHtml(await response.text());}
function autoreisenCookies(response){try{const values=typeof response.headers?.getSetCookie==='function'?response.headers.getSetCookie():[response.headers?.get('set-cookie')].filter(Boolean);return values.map(x=>String(x).split(';')[0].trim()).filter(Boolean).join('; ');}catch{return '';}}
function autoreisenFormBody(config={}){const p=autoreisenDateParts(config.pickupAt),d=autoreisenDateParts(config.dropoffAt),rec=String(config.pickupOfficeId||'18').trim(),dev=String(config.dropoffOfficeId||rec).trim();const body=new URLSearchParams();body.set('ofi_rec',rec);body.set('ofi_dev',dev);body.set('dia_inicio',p.day);body.set('mes_inicio',`${p.month}-${p.year}`);body.set('hora_inicio',p.time);body.set('dia_final',d.day);body.set('mes_final',`${d.month}-${d.year}`);body.set('hora_final',d.time);body.set('fin','1');return body;}
async function autoreisenSubmittedFleetHtml(config={}){const start='https://www.autoreisen.com/alquiler-coches/alquiler-de-coches.php',target='https://www.autoreisen.com/alquiler-coches/tarifas-flota.php';const bootstrap=await fetchWithTimeout(start,{redirect:'follow',headers:autoreisenHeaders()});if(!bootstrap.ok)throw new Error(`AutoReisen respondió HTTP ${bootstrap.status} al iniciar la búsqueda`);const bootstrapHtml=autoreisenAssertHtml(await bootstrap.text()),cookie=autoreisenCookies(bootstrap);const response=await fetchWithTimeout(target,{method:'POST',redirect:'follow',headers:autoreisenHeaders({'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',Origin:'https://www.autoreisen.com',Referer:start,...(cookie?{Cookie:cookie}:{})}),body:autoreisenFormBody(config).toString()});if(!response.ok)throw new Error(`AutoReisen respondió HTTP ${response.status} al consultar la flota`);const html=autoreisenAssertHtml(await response.text());return {html,bootstrapHtml};}
async function autoreisenCachedFleet(env,config={}){try{const kv=requireTrackerKv(env),raw=await kv.get('tracker:autoreisen:latest');if(!raw)return [];const result=JSON.parse(raw);const sameOffice=String(result?.pickupOfficeId||'')===String(config?.pickupOfficeId||'')&&String(result?.dropoffOfficeId||'')===String(config?.dropoffOfficeId||'');const sameDates=String(result?.pickupAt||'').slice(0,16)===String(config?.pickupAt||'').slice(0,16)&&String(result?.dropoffAt||'').slice(0,16)===String(config?.dropoffAt||'').slice(0,16);if(!sameOffice||!sameDates)return [];return Array.isArray(result?.fleet)?result.fleet:[];}catch{return [];}}
function autoreisenFleetGroupCount(fleet=[]){return new Set((Array.isArray(fleet)?fleet:[]).map(x=>String(x?.group||'').trim()).filter(Boolean)).size;}
function autoreisenMergeFleet(primary=[],secondary=[]){const map=new Map();for(const row of [...primary,...secondary]){const group=String(row?.group||'').trim(),model=String(row?.model||'').trim();if(!group||!model)continue;const key=`${group}\u0000${model.toLowerCase()}`;if(!map.has(key))map.set(key,row);}return [...map.values()];}
async function autoreisenOptionsResponse(request,env,payload){
  await verifyFirebaseUser(request,env);
  const mode=String(payload.mode||'offices').toLowerCase(),config=payload.config||{};
  let warning='';let offices=[];
  try{offices=autoreisenParseOffices(await autoreisenPublicHtml('https://www.autoreisen.com/alquiler-coches/alquiler-de-coches.php'));}
  catch(error){warning=`No se pudo refrescar el formulario de oficinas (${error.message}). Se usa la lista verificada incluida como respaldo.`;}
  if(!offices.length)offices=AUTOREISEN_VERIFIED_OFFICES;
  if(mode==='offices')return json({ok:true,offices,source:warning?'Lista verificada de respaldo':'AutoReisen · formulario actual',warning});
  let fleet=[],exactSource='',noAvailability=false,responseMatchedDates=false;
  try{
    const submitted=await autoreisenSubmittedFleetHtml(config);
    responseMatchedDates=autoreisenResponseMentionsRequestedDates(submitted.html,config);
    noAvailability=autoreisenNoAvailability(submitted.html)&&responseMatchedDates;
    fleet=autoreisenParseFleet(submitted.html);exactSource='formulario POST';
    if(!fleet.length&&!noAvailability)warning=[warning,'AutoReisen aceptó la búsqueda, pero el HTML devuelto no expone vehículos en un formato que el Worker pueda interpretar.'].filter(Boolean).join(' ');
  }catch(error){warning=[warning,`No se pudo consultar la flota mediante el formulario (${error.message}).`].filter(Boolean).join(' ');}
  if(!fleet.length&&!noAvailability){
    try{
      const directHtml=await autoreisenPublicHtml(autoreisenResultsUrl(config,{includeCar:false}));
      const directMatches=autoreisenResponseMentionsRequestedDates(directHtml,config);
      if(directMatches){noAvailability=autoreisenNoAvailability(directHtml);responseMatchedDates=true;}
      fleet=autoreisenParseFleet(directHtml);if(fleet.length)exactSource='consulta directa';
    }catch(error){warning=[warning,`La consulta directa tampoco devolvió una flota interpretable (${error.message}).`].filter(Boolean).join(' ');}
  }
  if(fleet.length&&autoreisenFleetGroupCount(fleet)<=1){
    try{
      const catalog=autoreisenParseFleet(await autoreisenPublicHtml('https://www.autoreisen.com/alquiler-coches/tarifas-flota.php'));
      if(autoreisenFleetGroupCount(catalog)>autoreisenFleetGroupCount(fleet)){
        fleet=autoreisenMergeFleet(fleet,catalog);
        warning=[warning,'Las sugerencias se han completado con el catálogo público; la disponibilidad definitiva se valida al consultar el modelo.'].filter(Boolean).join(' ');
      }
    }catch(error){warning=[warning,`No se pudo completar el catálogo general (${error.message}).`].filter(Boolean).join(' ');}
  }
  if(!fleet.length&&!noAvailability){
    const cached=await autoreisenCachedFleet(env,config);
    if(cached.length){fleet=cached;warning=[warning,'Se muestran como sugerencia los últimos vehículos obtenidos por el monitor para esas mismas condiciones.'].filter(Boolean).join(' ');exactSource='caché del monitor';}
  }
  if(!fleet.length){
    const fallback=AUTOREISEN_REFERENCE_FLEET.map(x=>({...x}));
    const fallbackWarning=noAvailability&&responseMatchedDates
      ?'AutoReisen indica que no hay disponibilidad para las fechas y oficinas solicitadas. El catálogo devuelto es solo de referencia y no implica disponibilidad.'
      :'AutoReisen está bloqueando o no expone una lista interpretable al Worker. Se devuelve el catálogo público de referencia para que grupo y modelo sigan siendo seleccionables; la disponibilidad debe confirmarse en la web o mediante el monitor.';
    return json({ok:true,offices,fleet:fallback,groups:autoreisenFleetGroupCount(fallback),fallbackGroups:AUTOREISEN_GROUP_SUGGESTIONS,manualEntry:true,catalogFallback:true,availabilityConfirmed:false,noAvailability,responseMatchedDates,source:'AutoReisen · catálogo público de referencia',warning:[warning,fallbackWarning].filter(Boolean).join(' ')});
  }
  return json({ok:true,offices,fleet,groups:autoreisenFleetGroupCount(fleet),fallbackGroups:AUTOREISEN_GROUP_SUGGESTIONS,manualEntry:false,catalogFallback:false,availabilityConfirmed:true,noAvailability:false,responseMatchedDates,source:`AutoReisen · ${exactSource||'resultados actuales'}`,warning});
}

function githubApiError(response,data){
  const raw=String(data?.message||`GitHub respondió HTTP ${response.status}.`);
  if(response.status===401||/bad credentials/i.test(raw))return new ApiError(401,'GitHub ha rechazado GITHUB_TOKEN: credenciales no válidas. El token puede haber caducado, sido revocado o sustituido. Genera/renueva el token de GitHub y vuelve a guardar el secreto GITHUB_TOKEN en el Worker mfe-viajes-precios.');
  if(response.status===403&&/resource not accessible|forbidden|permission/i.test(raw))return new ApiError(403,'GitHub ha aceptado el token, pero no tiene permisos suficientes para este repositorio o para Actions/Contents. Revisa los permisos del token GITHUB_TOKEN.');
  return new ApiError(response.status===404?502:response.status,raw);
}
async function githubJson(url,options,env){
  const response=await fetch(url,{...options,headers:{...githubHeaders(env),...(options?.headers||{})}});let data=null;try{data=await response.json();}catch{}
  if(!response.ok)throw githubApiError(response,data);return data;
}
// v2.2.54 · Gestor independiente de seguimientos para la segunda isla.
const STAGE_WORKFLOWS={car:'autoreisen-stage2.yml',hotel:'dunas-monitor.yml',binter:'binter-stage2.yml'};
function stageMonitorConfig(kind,config={}){
  if(kind==='binter'){
    const date=String(config.date||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new ApiError(400,'Fecha de Binter inválida.');
    return {enabled:true,date,origin:'LPA',destination:'FUE',adults:Math.max(1,Math.min(9,Number(config.adults)||5)),resident:config.resident===true,reservedPrice:Math.max(0,Number(config.reservedPrice)||0),searchUrl:'https://www.bintercanarias.com/es/buscar-vuelos'};
  }
  const data=config&&typeof config==='object'?config:{};
  if(kind==='car'){
    const res=cleanAutoreisenConfig({...data,enabled:true});
    res.pickupOfficeId=String(res.pickupOfficeId||'19');res.dropoffOfficeId=String(res.dropoffOfficeId||'19');
    return res;
  }
  if(kind!=='hotel')throw new ApiError(400,'Seguimiento de segunda isla desconocido.');
  const checkIn=String(data.checkIn||''),checkOut=String(data.checkOut||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)||!/^\d{4}-\d{2}-\d{2}$/.test(checkOut)||checkOut<=checkIn)throw new ApiError(400,'Fechas de Dunas Club no válidas.');
  const adults=Math.max(1,Math.min(5,Number(data.adults)||5)),rooms=Math.max(1,Math.min(adults,Number(data.rooms)||3));
  return {enabled:true,hotel:'Hotel Dunas Club',checkIn,checkOut,adults,rooms,
    targetRoom:String(data.targetRoom||'Cualquier habitación').slice(0,100),targetBoard:String(data.targetBoard||'Solo alojamiento').slice(0,100),
    reservedPrice:Math.max(0,Number(data.reservedPrice)||0),searchUrl:'https://www.hoteldunasclub.es/reservar.html'};
}
async function readStageMonitorConfigDocument(target,env){
  const raw=await githubTextFile(target,target.path,env);
  if(!raw.exists)return {};
  try{const doc=JSON.parse(raw.content);if(!doc||typeof doc!=='object'||Array.isArray(doc))throw new Error();return doc;}
  catch{throw new ApiError(500,'monitoring/config.json tiene contenido no válido; no se sobrescribe por seguridad.');}
}
async function updateGithubConfigKey(target,key,configuration,env,message){
  const path=target.path;
  const encodedPath=path.split('/').map(encodeURIComponent).join('/');
  const base=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encodedPath}`;
  for(let attempt=0;attempt<6;attempt++){
    const get=await githubRequestRaw(`${base}?ref=${encodeURIComponent(target.branch)}&nonce=${Date.now()}`,{method:'GET',cache:'no-store'},env);
    if(!get.ok){const data=await get.json().catch(()=>({}));throw githubApiError(get,data);}
    const current=await get.json();
    let doc;try{doc=JSON.parse(decodeGithubContent(current.content||''));if(!doc||typeof doc!=='object'||Array.isArray(doc))throw new Error();}catch{throw new ApiError(500,'El JSON de configuración de GitHub no es válido.');}
    const merged={...(doc[key]||{}),...configuration};
    if(JSON.stringify(doc[key])===JSON.stringify(merged))return null;
    doc[key]=merged;
    const body={message,sha:current.sha,content:encodeGithubContent(JSON.stringify(doc,null,2)+'\n'),branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}};
    const put=await githubRequestRaw(base,{method:'PUT',body:JSON.stringify(body),cache:'no-store'},env);
    if(put.ok){const updated=await put.json();return {path,created:false,commitUrl:updated?.commit?.html_url||''};}
    const data=await put.json().catch(()=>({}));
    if([409,422].includes(put.status)&&/sha|expected|conflict|already exists|was modified|not match/i.test(String(data.message||''))){
      await new Promise(resolve=>setTimeout(resolve,150*(attempt+1)));continue;
    }
    throw githubApiError(put,data);
  }
  throw new ApiError(409,'GitHub sigue actualizando simultáneamente la configuración. Vuelve a intentarlo.');
}

async function syncStageMonitorToGitHub(request,env,payload){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),kind=String(payload.kind||''),workflow=STAGE_WORKFLOWS[kind];
  if(!workflow)throw new ApiError(400,'Monitor de etapa 2 no válido.');
  const cleaned=stageMonitorConfig(kind,payload.config||{});
  const files=kind==='car'?{
    'monitoring/autoreisen-stage2-run.mjs':AUTOREISEN_STAGE2_RUN_FILE,
    '.github/workflows/autoreisen-stage2.yml':AUTOREISEN_STAGE2_WORKFLOW_TEMPLATE
  }:kind==='binter'?{
    'monitoring/binter-stage2-run.mjs':BINTER_STAGE2_RUN_FILE,
    '.github/workflows/binter-stage2.yml':BINTER_STAGE2_WORKFLOW_TEMPLATE
  }:{
    'monitoring/dunas.mjs':DUNAS_FILE,
    'monitoring/dunas-run.mjs':DUNAS_RUN_FILE,
    '.github/workflows/dunas-monitor.yml':DUNAS_WORKFLOW_TEMPLATE
  };
  const written=[];
  for(const [path,content] of Object.entries(files)){
    const remote=await githubTextFile(target,path,env);
    if(!remote.exists||remote.content.trimEnd()!==content.trimEnd())written.push(await upsertGithubFile(target,path,content,env,`MFE Viajes · segundo monitor ${kind} v${WORKER_VERSION}`));
  }
  const key=kind==='car'?'autoreisenStage2':kind==='binter'?'binterStage2':'dunas';
  const configWrite=await updateGithubConfigKey(target,key,cleaned,env,`MFE Viajes · Configurar ${key} en Fuerteventura`);
  if(configWrite)written.push(configWrite);
  return json({ok:true,synced:true,workflow,changed:written.length>0,written,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub});
}
async function dispatchStageMonitor(request,env,payload){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),kind=String(payload.kind||''),workflow=STAGE_WORKFLOWS[kind];
  if(!workflow)throw new ApiError(400,'Monitor de etapa 2 no válido.');
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  await githubJson(url,{method:'POST',body:JSON.stringify({ref:target.branch,inputs:{force:'true'}})},env);
  return json({ok:true,workflowTriggered:true,kind,workflow,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub});
}

async function syncAutoreisenToGitHub(request,env,payload){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env),config=cleanAutoreisenConfig(payload.config||{});const automationUpdate=await ensureAutoreisenAutomationCurrent(target,env);
  const contentUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${target.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(target.branch)}`;
  const current=await githubJson(contentUrl,{method:'GET'},env);let document;try{document=JSON.parse(decodeGithubContent(current.content));}catch{throw new ApiError(502,"monitoring/config.json no contiene JSON válido.");}
  document.autoreisen={...(document.autoreisen||{}),...config};
  const update=await githubJson(contentUrl.replace(/\?ref=.*/,''),{method:'PUT',body:JSON.stringify({message:`Sincronizar AutoReisen desde MFE Viajes (${config.pickupAt.slice(0,10)}–${config.dropoffAt.slice(0,10)})`,content:encodeGithubContent(`${JSON.stringify(document,null,2)}\n`),sha:current.sha,branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}})},env);
  let workflowTriggered=false;
  if(payload.runWorkflow&&target.workflow){await dispatchAutoreisenWorkflow(target,env,{force:true});workflowTriggered=true;}
  return json({ok:true,updated:true,workflowTriggered,commitUrl:update?.commit?.html_url||'',repository:`${target.owner}/${target.repo}`,path:target.path,branch:target.branch,authorizedUid:user.sub,automationUpdate,updatedAt:new Date().toISOString()});
}


async function githubRequestRaw(url,options,env){
  return fetch(url,{...options,headers:{...githubHeaders(env),...(options?.headers||{})}});
}
async function upsertGithubFile(target,path,content,env,message){
  const encodedPath=String(path).split('/').map(encodeURIComponent).join('/');
  const base=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encodedPath}`;
  for(let attempt=0;attempt<6;attempt++){
    const get=await githubRequestRaw(`${base}?ref=${encodeURIComponent(target.branch)}&nonce=${Date.now()}`,{method:'GET',cache:'no-store'},env);
    let sha='';if(get.ok){const current=await get.json();sha=current.sha||'';}
    else if(get.status!==404){const data=await get.json().catch(()=>({}));throw githubApiError(get,data);}
    const body={message,content:encodeGithubContent(content.endsWith('\n')?content:`${content}\n`),branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}};
    if(sha)body.sha=sha;
    const put=await githubRequestRaw(base,{method:'PUT',body:JSON.stringify(body),cache:'no-store'},env);
    if(put.ok){const updated=await put.json();return {path,created:!sha,commitUrl:updated?.commit?.html_url||''};}
    const data=await put.json().catch(()=>({}));
    if([409,422].includes(put.status)&&/sha|expected|conflict|already exists|was modified|not match/i.test(String(data.message||''))){await new Promise(resolve=>setTimeout(resolve,150*(attempt+1)));continue;}
    throw githubApiError(put,data);
  }
  throw new ApiError(409,'GitHub modificó el fichero varias veces durante la actualización.');
}
async function upsertGithubBase64File(target,path,base64Content,env,message){
  const content=String(base64Content||'').replace(/\s/g,'');
  if(!content)throw new ApiError(400,'El archivo ZIP está vacío.');
  const encodedPath=String(path).split('/').map(encodeURIComponent).join('/');
  const base=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encodedPath}`;
  const get=await githubRequestRaw(`${base}?ref=${encodeURIComponent(target.branch)}`,{method:'GET'},env);
  let sha='';if(get.ok){const current=await get.json();sha=current.sha||'';}else if(get.status!==404){let data=null;try{data=await get.json();}catch{}throw githubApiError(get,data);}
  const body={message,content,branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}};if(sha)body.sha=sha;
  const updated=await githubJson(base,{method:'PUT',body:JSON.stringify(body)},env);return {path,created:!sha,commitUrl:updated?.commit?.html_url||'',commitSha:String(updated?.commit?.sha||'')};
}
async function githubBranchHeadSha(target,env){
  const branch=String(target.branch||'main').trim();
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`;
  const data=await githubJson(url,{method:'GET'},env);
  return String(data?.object?.sha||'').trim();
}
async function waitForGithubBranchCommit(target,env,expectedSha,{attempts=24,delayMs=500}={}){
  const expected=String(expectedSha||'').trim();
  if(!expected)throw new ApiError(502,'GitHub no devolvió el commit de la release móvil.');
  let last='';
  for(let attempt=1;attempt<=attempts;attempt++){
    try{last=await githubBranchHeadSha(target,env);}catch{}
    if(last===expected){
      // GitHub Actions puede tardar unas décimas en resolver el nuevo HEAD aunque la API de refs ya lo vea.
      await new Promise(resolve=>setTimeout(resolve,1200));
      return expected;
    }
    if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
  throw new ApiError(502,`GitHub todavía no ha publicado el commit nuevo en ${target.branch}. Esperado ${expected.slice(0,12)}, visible ${last.slice(0,12)||'ninguno'}.`);
}
async function verifyGithubReleaseAtCommit(target,path,commitSha,env){
  const encodedPath=String(path).split('/').map(encodeURIComponent).join('/');
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(commitSha)}`;
  const data=await githubJson(url,{method:'GET'},env);
  if(!data?.sha||!Number(data?.size))throw new ApiError(502,'GitHub creó el commit, pero no permite leer todavía el ZIP de la release.');
  return {blobSha:String(data.sha),size:Number(data.size)||0};
}
async function mobileDeployWorkflowInspection(target,env){
  const path=`.github/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`;
  const remote=await githubTextFile(target,path,env);
  const normalized=value=>String(value||'').replace(/\r\n/g,'\n').trim();
  return {path,exists:Boolean(remote.exists),current:Boolean(remote.exists&&normalized(remote.content)===normalized(MOBILE_DEPLOY_WORKFLOW_TEMPLATE))};
}
async function mobileDeployWorkflowMeta(target,env){
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows?per_page=100`;
  const data=await githubJson(url,{method:'GET'},env),rows=Array.isArray(data?.workflows)?data.workflows:[];
  return rows.find(item=>String(item.path||'').endsWith(`/.github/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`)||String(item.path||'')===`.github/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`||String(item.name||'').trim()==='Actualizar MFE Viajes · móvil')||null;
}
async function waitForMobileDeployWorkflowReady(target,env,{attempts=12,delayMs=1200}={}){
  let meta=null;
  for(let attempt=1;attempt<=attempts;attempt++){
    meta=await mobileDeployWorkflowMeta(target,env).catch(()=>null);
    if(meta?.id)return meta;
    if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
  throw new ApiError(502,'GitHub todavía no ha indexado el workflow móvil. Espera unos segundos y vuelve a intentarlo.');
}
async function mobileDeployStatus(request,env){
  const user=await verifyFirebaseUserMobileStable(request,env),target=githubTarget(env),inspection=await mobileDeployWorkflowInspection(target,env);
  return json({ok:true,...inspection,repository:`${target.owner}/${target.repo}`,branch:target.branch,actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`,authorizedUid:user.sub});
}
async function installMobileDeployWorkflow(request,env){
  const user=await verifyFirebaseUserMobileStable(request,env),target=githubTarget(env),inspection=await mobileDeployWorkflowInspection(target,env);
  let written=null;if(!inspection.current)written=await upsertGithubFile(target,inspection.path,MOBILE_DEPLOY_WORKFLOW_TEMPLATE,env,`Preparar actualización móvil · MFE Viajes v${WORKER_VERSION}`);
  const verified=await mobileDeployWorkflowInspection(target,env);
  if(!verified.current)throw new ApiError(502,'GitHub recibió el workflow móvil, pero la verificación posterior no coincide.');
  return json({ok:true,installed:true,updated:Boolean(written),workflow:MOBILE_DEPLOY_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,branch:target.branch,actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`,authorizedUid:user.sub});
}
async function dispatchMobileDeployWorkflow(target,env,requestId=''){
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(MOBILE_DEPLOY_WORKFLOW_FILE)}/dispatches`;
  const body={ref:target.branch};if(requestId)body.inputs={request_id:String(requestId)};
  await githubJson(url,{method:'POST',body:JSON.stringify(body)},env);
  return true;
}
async function mobileDeployRunStatus(request,env,payload={}){
  const user=await verifyFirebaseUserMobileStable(request,env),target=githubTarget(env),requestId=String(payload.requestId||'').trim();
  const runsUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(MOBILE_DEPLOY_WORKFLOW_FILE)}/runs?branch=${encodeURIComponent(target.branch)}&event=workflow_dispatch&per_page=20`;
  const runsData=await githubJson(runsUrl,{method:'GET'},env),runs=Array.isArray(runsData?.workflow_runs)?runsData.workflow_runs:[];
  const run=requestId?runs.find(item=>String(item.display_title||item.name||'').includes(requestId)):runs[0];
  const actionsUrl=`https://github.com/${target.owner}/${target.repo}/actions/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`;
  if(!run)return json({ok:true,runFound:false,requestId,actionsUrl,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub});
  const jobsUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/runs/${encodeURIComponent(run.id)}/jobs?per_page=100`;
  const jobsData=await githubJson(jobsUrl,{method:'GET'},env);
  const jobs=(Array.isArray(jobsData?.jobs)?jobsData.jobs:[]).map(job=>({id:job.id,name:String(job.name||''),status:String(job.status||''),conclusion:String(job.conclusion||''),startedAt:String(job.started_at||''),completedAt:String(job.completed_at||''),htmlUrl:String(job.html_url||''),steps:(Array.isArray(job.steps)?job.steps:[]).map(step=>({name:String(step.name||''),status:String(step.status||''),conclusion:String(step.conclusion||''),number:Number(step.number)||0,startedAt:String(step.started_at||''),completedAt:String(step.completed_at||'')}))}));
  const steps=jobs.flatMap(job=>job.steps.map(step=>({...step,jobName:job.name}))),completedSteps=steps.filter(step=>step.status==='completed').length,successfulSteps=steps.filter(step=>step.status==='completed'&&step.conclusion==='success').length;
  return json({ok:true,runFound:true,requestId,run:{id:run.id,name:String(run.name||''),displayTitle:String(run.display_title||''),status:String(run.status||''),conclusion:String(run.conclusion||''),event:String(run.event||''),createdAt:String(run.created_at||''),startedAt:String(run.run_started_at||''),updatedAt:String(run.updated_at||''),htmlUrl:String(run.html_url||'')},jobs,steps,progress:{completedSteps,successfulSteps,totalSteps:steps.length},actionsUrl,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub});
}


async function inspectPoolsAutomation(target,env){
  const expected={
    'monitoring/pools.mjs':POOLS_FILE,
    [`.github/workflows/${POOLS_WORKFLOW_FILE}`]:POOLS_WORKFLOW_TEMPLATE
  };
  const matches={},files={};let automationVersion='';
  for(const [path,content] of Object.entries(expected)){
    const remote=await githubTextFile(target,path,env);files[path]=Boolean(remote.exists);matches[path]=sameGithubText(remote,content);
    if(path==='monitoring/pools.mjs')automationVersion=String(remote.content||'').match(/MFE_POOLS_AUTOMATION_VERSION:\s*([^\s]+)/)?.[1]||'';
  }
  return {current:Object.values(matches).every(Boolean)&&automationVersion===POOLS_AUTOMATION_VERSION,automationVersion,matches,files,workflow:POOLS_WORKFLOW_FILE};
}
async function ensurePoolsAutomationCurrent(target,env){
  const before=await inspectPoolsAutomation(target,env);if(before.current)return {updated:false,...before};
  const written=[];
  written.push(await upsertGithubFile(target,'monitoring/pools.mjs',POOLS_FILE,env,`Actualizar piscinas · MFE Viajes v${POOLS_AUTOMATION_VERSION}`));
  written.push(await upsertGithubFile(target,`.github/workflows/${POOLS_WORKFLOW_FILE}`,POOLS_WORKFLOW_TEMPLATE,env,`Actualizar workflow piscinas · MFE Viajes v${POOLS_AUTOMATION_VERSION}`));
  const after=await inspectPoolsAutomation(target,env);if(!after.current)throw new ApiError(502,'GitHub recibió el monitor de piscinas, pero la verificación posterior no coincide.');
  return {updated:true,previousVersion:before.automationVersion,...after,written};
}
async function installPoolsAutomation(request,env){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),result=await ensurePoolsAutomationCurrent(target,env);
  return json({ok:true,installed:true,...result,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${POOLS_WORKFLOW_FILE}`});
}
async function poolsAutomationStatus(request,env){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),inspection=await inspectPoolsAutomation(target,env);
  return json({ok:true,installed:inspection.current,...inspection,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${POOLS_WORKFLOW_FILE}`});
}
async function dispatchPoolsWorkflow(target,env){
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(POOLS_WORKFLOW_FILE)}/dispatches`;
  await githubJson(url,{method:'POST',body:JSON.stringify({ref:target.branch,inputs:{force:'true'}})},env);return true;
}
async function runPoolsWorkflow(request,env){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),automation=await ensurePoolsAutomationCurrent(target,env),startedAt=new Date().toISOString();
  await dispatchPoolsWorkflow(target,env);
  return json({ok:true,workflowTriggered:true,startedAt,automationUpdated:Boolean(automation.updated),version:POOLS_AUTOMATION_VERSION,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${POOLS_WORKFLOW_FILE}`});
}

function trackerWorkflowFile(type,env){
  const key=String(type||'').toLowerCase();
  if(key==='autoreisen')return String(env?.GITHUB_WORKFLOW_FILE||'autoreisen-monitor.yml');
  if(key==='cordial')return String(env?.GITHUB_CORDIAL_WORKFLOW_FILE||CORDIAL_WORKFLOW_FILE);
  if(key==='vueling')return String(env?.GITHUB_VUELING_WORKFLOW_FILE||VUELING_WORKFLOW_FILE);
  if(key==='flightops')return String(env?.GITHUB_FLIGHTOPS_WORKFLOW_FILE||FLIGHTOPS_WORKFLOW_FILE);
  if(key==='pools')return POOLS_WORKFLOW_FILE;
  throw new ApiError(400,'Seguimiento no compatible con progreso de GitHub Actions.');
}
async function trackerRunStatus(request,env,payload){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),type=String(payload.type||'').toLowerCase(),workflow=trackerWorkflowFile(type,env);
  const startedAfterRaw=String(payload.startedAfter||'').trim(),startedAfter=Date.parse(startedAfterRaw),runId=String(payload.runId||'').trim();
  const runsUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs?branch=${encodeURIComponent(target.branch)}&event=workflow_dispatch&per_page=20`;
  const runsData=await githubJson(runsUrl,{method:'GET'},env),runs=Array.isArray(runsData?.workflow_runs)?runsData.workflow_runs:[];
  let run=runId?runs.find(item=>String(item.id)===runId):null;
  if(!run&&Number.isFinite(startedAfter))run=runs.find(item=>Date.parse(item.created_at||0)>=startedAfter-15000);
  if(!run&&!runId&&!Number.isFinite(startedAfter))run=runs[0];
  const actionsUrl=`https://github.com/${target.owner}/${target.repo}/actions/workflows/${workflow}`;
  if(!run)return json({ok:true,runFound:false,type,workflow,startedAfter:startedAfterRaw,actionsUrl,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub});
  const jobsUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/runs/${encodeURIComponent(run.id)}/jobs?per_page=100`;
  const jobsData=await githubJson(jobsUrl,{method:'GET'},env),jobs=(jobsData?.jobs||[]).map(job=>({id:job.id,name:String(job.name||''),status:String(job.status||''),conclusion:String(job.conclusion||''),startedAt:String(job.started_at||''),completedAt:String(job.completed_at||''),htmlUrl:String(job.html_url||''),steps:(job.steps||[]).map(step=>({name:String(step.name||''),status:String(step.status||''),conclusion:String(step.conclusion||''),number:Number(step.number)||0}))}));
  const steps=jobs.flatMap(job=>job.steps.map(step=>({...step,job:job.name}))),completedSteps=steps.filter(step=>step.status==='completed').length,successfulSteps=steps.filter(step=>step.conclusion==='success'||step.conclusion==='skipped').length,totalSteps=steps.length,failedSteps=steps.filter(step=>step.conclusion==='failure').map(step=>step.name);
  const percentage=totalSteps?Math.round(completedSteps*100/totalSteps):(run.status==='completed'?100:run.status==='in_progress'?5:2);
  return json({ok:true,runFound:true,type,workflow,startedAfter:startedAfterRaw,run:{id:run.id,name:String(run.name||''),displayTitle:String(run.display_title||''),status:String(run.status||''),conclusion:String(run.conclusion||''),event:String(run.event||''),createdAt:String(run.created_at||''),startedAt:String(run.run_started_at||''),updatedAt:String(run.updated_at||''),htmlUrl:String(run.html_url||'')},jobs,steps,progress:{completedSteps,successfulSteps,totalSteps,percentage},diagnostic:{failedSteps,summary:failedSteps.length?`Falló: ${failedSteps.join(' · ')}`:(run.status==='completed'&&run.conclusion==='success'?'Ejecución completada correctamente':'')},actionsUrl,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub});
}
async function githubAuthDiagnostic(request,env){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env);
  const repoUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
  const repo=await githubJson(repoUrl,{method:'GET'},env);
  const workflowsUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows?per_page=100`;
  const workflows=await githubJson(workflowsUrl,{method:'GET'},env);
  return json({ok:true,githubAuth:true,repository:`${target.owner}/${target.repo}`,private:Boolean(repo?.private),defaultBranch:String(repo?.default_branch||target.branch),actionsReadable:Array.isArray(workflows?.workflows),workflowCount:Number(workflows?.total_count)||0,workerVersion:WORKER_VERSION,checkedAt:new Date().toISOString(),authorizedUid:user.sub});
}

const MOBILE_UPLOAD_TTL_SECONDS=1800;
function mobileUploadMetaKey(uid,uploadId){return `mobile-upload:${String(uid||'')}:${String(uploadId||'')}:meta`;}
function mobileUploadChunkKey(uid,uploadId,index){return `mobile-upload:${String(uid||'')}:${String(uploadId||'')}:chunk:${Number(index)}`;}
function mobileUploadLookupKey(uploadId){return `mobile-upload-id:${String(uploadId||'')}`;}
function validateMobileUploadId(value){const id=String(value||'').trim();if(!/^[A-Za-z0-9._-]{8,120}$/.test(id))throw new ApiError(400,'Identificador de subida no válido.');return id;}
async function readMobileUploadMeta(env,uid,uploadId){
  const raw=await requireTrackerKv(env).get(mobileUploadMetaKey(uid,uploadId));
  if(!raw)throw new ApiError(404,'La subida temporal ha caducado. Selecciona de nuevo el ZIP.');
  try{return JSON.parse(raw);}catch{throw new ApiError(500,'La subida temporal está dañada. Selecciona de nuevo el ZIP.');}
}
async function resolveMobileUpload(env,uploadId){
  const kv=requireTrackerKv(env),id=validateMobileUploadId(uploadId),uid=String(await kv.get(mobileUploadLookupKey(id))||'').trim();
  if(!uid)throw new ApiError(404,'La sesión de subida ha caducado. Selecciona de nuevo el ZIP.');
  const meta=await readMobileUploadMeta(env,uid,id);return {kv,uploadId:id,uid,meta};
}
async function initMobileReleaseUpload(request,env,payload={}){
  const user=await verifyFirebaseUser(request,env),kv=requireTrackerKv(env),name=String(payload.releaseName||'MFE_Viajes_RELEASE.zip').trim();
  const totalBytes=Math.trunc(Number(payload.totalBytes)),totalChunks=Math.trunc(Number(payload.totalChunks));
  if(!/\.zip$/i.test(name))throw new ApiError(400,'Selecciona un archivo ZIP de MFE Viajes.');
  if(!Number.isFinite(totalBytes)||totalBytes<=0)throw new ApiError(400,'El ZIP está vacío.');
  if(totalBytes>20*1024*1024)throw new ApiError(413,'El ZIP supera 20 MB. Usa una release compacta de MFE Viajes.');
  if(!Number.isInteger(totalChunks)||totalChunks<1||totalChunks>80)throw new ApiError(400,'Número de bloques de subida no válido.');
  const uploadId=`mfeup-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const meta={uid:user.sub,name,totalBytes,totalChunks,createdAt:new Date().toISOString()};
  await Promise.all([
    kv.put(mobileUploadMetaKey(user.sub,uploadId),JSON.stringify(meta),{expirationTtl:MOBILE_UPLOAD_TTL_SECONDS}),
    kv.put(mobileUploadLookupKey(uploadId),String(user.sub),{expirationTtl:MOBILE_UPLOAD_TTL_SECONDS})
  ]);
  return json({ok:true,uploadId,totalBytes,totalChunks,expiresIn:MOBILE_UPLOAD_TTL_SECONDS,authorizedUid:user.sub});
}
async function storeMobileReleaseChunk(request,env,payload={}){
  const {kv,uploadId,uid,meta}=await resolveMobileUpload(env,payload.uploadId);
  const index=Math.trunc(Number(payload.index)),totalChunks=Math.trunc(Number(payload.totalChunks)),chunk=String(payload.chunkBase64||'').replace(/\s/g,'');
  if(totalChunks!==meta.totalChunks)throw new ApiError(409,'La cantidad de bloques no coincide con la subida iniciada.');
  if(!Number.isInteger(index)||index<0||index>=meta.totalChunks)throw new ApiError(400,'Índice de bloque no válido.');
  if(!chunk||chunk.length>700000||!/^[A-Za-z0-9+/]*={0,2}$/.test(chunk))throw new ApiError(400,'Bloque ZIP no válido.');
  if(index===0&&!/^UEsDB/.test(chunk))throw new ApiError(400,'El archivo seleccionado no parece un ZIP válido.');
  await kv.put(mobileUploadChunkKey(uid,uploadId,index),chunk,{expirationTtl:MOBILE_UPLOAD_TTL_SECONDS});
  return json({ok:true,received:true,uploadId,index,totalChunks:meta.totalChunks});
}
async function finalizeMobileReleaseUpload(request,env,payload={}){
  const {kv,uploadId,uid,meta}=await resolveMobileUpload(env,payload.uploadId),target=githubTarget(env);
  const chunks=[];
  for(let index=0;index<meta.totalChunks;index++){
    const chunk=await kv.get(mobileUploadChunkKey(uid,uploadId,index));
    if(!chunk)throw new ApiError(409,`Falta el bloque ${index+1}/${meta.totalChunks}. Reintenta la subida.`);
    chunks.push(chunk);
  }
  const base64=chunks.join('');
  if(!/^UEsDB/.test(base64))throw new ApiError(400,'El ZIP ensamblado no es válido.');
  const approxBytes=Math.floor(base64.replace(/=+$/,'').length*3/4);
  if(Math.abs(approxBytes-meta.totalBytes)>2)throw new ApiError(409,'El tamaño del ZIP ensamblado no coincide. Reintenta la subida.');
  const inspection=await mobileDeployWorkflowInspection(target,env);
  if(!inspection.current)await ensureMobileDeployWorkflowCurrent(target,env);
  const uploaded=await upsertGithubBase64File(target,MOBILE_DEPLOY_RELEASE_PATH,base64,env,`Subir release móvil · ${meta.name}`);
  const headSha=String(uploaded.commitSha||'').trim();
  await waitForGithubBranchCommit(target,env,headSha);
  await verifyGithubReleaseAtCommit(target,MOBILE_DEPLOY_RELEASE_PATH,headSha,env);
  const requestId=`mfe-${Date.now()}-${(headSha||crypto.randomUUID()).slice(0,10)}`;
  await dispatchMobileDeployWorkflow(target,env,requestId);
  const cleanup=[kv.delete(mobileUploadMetaKey(uid,uploadId)),kv.delete(mobileUploadLookupKey(uploadId))];
  for(let index=0;index<meta.totalChunks;index++)cleanup.push(kv.delete(mobileUploadChunkKey(uid,uploadId,index)));
  await Promise.allSettled(cleanup);
  return json({ok:true,uploaded:true,workflowTriggered:true,runFound:false,triggerMode:'workflow_dispatch',requestId,file:MOBILE_DEPLOY_RELEASE_PATH,bytes:meta.totalBytes,chunks:meta.totalChunks,commitUrl:uploaded.commitUrl||'',commitSha:headSha,actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:uid,dispatchedAt:new Date().toISOString()});
}

async function triggerMobileDeployWorkflow(request,env,payload={}){
  const user=await verifyFirebaseUserMobileStable(request,env),target=githubTarget(env);
  const inspection=await mobileDeployWorkflowInspection(target,env);
  if(!inspection.current)await installMobileDeployWorkflow(request,env);
  const requestId=String(payload.requestId||`mfe-${Date.now()}-${crypto.randomUUID().slice(0,8)}`).trim();
  await dispatchMobileDeployWorkflow(target,env,requestId);
  return json({ok:true,workflowTriggered:true,runFound:false,requestId,triggerMode:'workflow_dispatch',actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,dispatchedAt:new Date().toISOString()});
}
async function uploadMobileReleaseAndDispatch(request,env,payload){
  const user=await verifyFirebaseUserMobileStable(request,env),target=githubTarget(env);
  const base64=String(payload.releaseBase64||'').replace(/\s/g,''),name=String(payload.releaseName||'MFE_Viajes_RELEASE.zip').trim();
  if(!/\.zip$/i.test(name))throw new ApiError(400,'Selecciona un archivo ZIP de MFE Viajes.');
  if(!base64||!/^UEsDB/.test(base64))throw new ApiError(400,'El archivo seleccionado no parece un ZIP válido.');
  const approxBytes=Math.floor(base64.length*3/4);if(approxBytes>20*1024*1024)throw new ApiError(413,'El ZIP supera 20 MB. Usa una release compacta de MFE Viajes.');
  const inspection=await mobileDeployWorkflowInspection(target,env);
  if(!inspection.current)await installMobileDeployWorkflow(request,env);
  const uploaded=await upsertGithubBase64File(target,MOBILE_DEPLOY_RELEASE_PATH,base64,env,`Subir release móvil · ${name}`);
  const commitSha=String(uploaded.commitSha||'').trim();
  await waitForGithubBranchCommit(target,env,commitSha);
  const verifiedRelease=await verifyGithubReleaseAtCommit(target,MOBILE_DEPLOY_RELEASE_PATH,commitSha,env);
  const requestId=`mfe-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
  await dispatchMobileDeployWorkflow(target,env,requestId);
  return json({ok:true,uploaded:true,workflowTriggered:true,runFound:false,triggerMode:'workflow_dispatch',requestId,file:MOBILE_DEPLOY_RELEASE_PATH,bytes:approxBytes,commitUrl:uploaded.commitUrl||'',commitSha,verifiedBlobSha:verifiedRelease.blobSha,verifiedBytes:verifiedRelease.size,actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,dispatchedAt:new Date().toISOString()});
}
async function dispatchAutoreisenWorkflow(target,env,{force=false,telegramTest=false,fleetOnly=false,requestId='',fleetConfig=null}={}){
  if(!target.workflow)throw new ApiError(503,'GITHUB_WORKFLOW_FILE no está configurado.');
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(target.workflow)}/dispatches`;
  await githubJson(url,{method:'POST',body:JSON.stringify({ref:target.branch,inputs:{force:String(Boolean(force)),telegram_test:String(Boolean(telegramTest)),fleet_only:String(Boolean(fleetOnly)),request_id:String(requestId||''),fleet_config_json:fleetOnly&&fleetConfig?JSON.stringify(fleetConfig):''}})},env);
  return true;
}
async function autoreisenRemoteAutomationVersion(target,env){
  const remote=await githubTextFile(target,'monitoring/autoreisen.mjs',env);
  return remote.content.match(/MFE_AUTOREISEN_AUTOMATION_VERSION:\s*([^\s]+)/)?.[1]||'';
}
async function inspectAutoreisenAutomation(target,env){
  const workflowPath=`.github/workflows/${target.workflow||'autoreisen-monitor.yml'}`;
  const expected={...AUTOREISEN_INSTALL_FILES,[workflowPath]:AUTOREISEN_WORKFLOW_TEMPLATE};
  const matches={},files={};let automationVersion='';
  for(const [path,content] of Object.entries(expected)){
    const remote=await githubTextFile(target,path,env);files[path]=Boolean(remote.exists);matches[path]=sameGithubText(remote,content);
    if(path==='monitoring/autoreisen.mjs')automationVersion=remote.content.match(/MFE_AUTOREISEN_AUTOMATION_VERSION:\s*([^\s]+)/)?.[1]||'';
  }
  const current=Object.values(matches).every(Boolean)&&automationVersion===AUTOREISEN_AUTOMATION_VERSION;
  return {current,automationVersion,matches,files,workflowPath};
}
async function ensureAutoreisenAutomationCurrent(target,env){
  const inspection=await inspectAutoreisenAutomation(target,env);if(inspection.current)return {updated:false,version:inspection.automationVersion,matches:inspection.matches};
  const written=[];
  for(const [path,content] of Object.entries(AUTOREISEN_INSTALL_FILES))written.push(await upsertGithubFile(target,path,content,env,`Actualizar AutoReisen · MFE Viajes v${AUTOREISEN_AUTOMATION_VERSION}`));
  written.push(await upsertGithubFile(target,inspection.workflowPath,AUTOREISEN_WORKFLOW_TEMPLATE,env,`Actualizar workflow AutoReisen · MFE Viajes v${AUTOREISEN_AUTOMATION_VERSION}`));
  const verified=await inspectAutoreisenAutomation(target,env);if(!verified.current)throw new ApiError(502,'GitHub recibió la actualización de AutoReisen, pero la verificación posterior no coincide con los archivos canónicos.');
  return {updated:true,version:AUTOREISEN_AUTOMATION_VERSION,previousVersion:inspection.automationVersion,matches:verified.matches,written};
}
async function installAutoreisenAutomation(request,env,payload){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env);const written=[];
  for(const [path,content] of Object.entries(AUTOREISEN_INSTALL_FILES))written.push(await upsertGithubFile(target,path,content,env,`Instalar AutoReisen · MFE Viajes v${AUTOREISEN_AUTOMATION_VERSION}`));
  const workflowPath=`.github/workflows/${target.workflow||'autoreisen-monitor.yml'}`;
  written.push(await upsertGithubFile(target,workflowPath,AUTOREISEN_WORKFLOW_TEMPLATE,env,`Instalar workflow AutoReisen · MFE Viajes v${AUTOREISEN_AUTOMATION_VERSION}`));
  if(payload?.config&&Object.keys(payload.config).length){
    const cfg=cleanAutoreisenConfig(payload.config);const path=target.path;let document={autoreisen:{}};
    const encoded=path.split('/').map(encodeURIComponent).join('/');const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encoded}?ref=${encodeURIComponent(target.branch)}`;
    const current=await githubRequestRaw(url,{method:'GET'},env);if(current.ok){const data=await current.json();try{document=JSON.parse(decodeGithubContent(data.content));}catch{document={autoreisen:{}};}}
    document.autoreisen={...(document.autoreisen||{}),...cfg};written.push(await upsertGithubFile(target,path,`${JSON.stringify(document,null,2)}\n`,env,`Sincronizar configuración AutoReisen · MFE Viajes v${AUTOREISEN_AUTOMATION_VERSION}`));
  }
  const verified=await inspectAutoreisenAutomation(target,env);if(!verified.current)throw new ApiError(502,'La instalación de AutoReisen terminó, pero los archivos de GitHub no coinciden con la versión canónica.');
  return json({ok:true,installed:true,automationVersion:AUTOREISEN_AUTOMATION_VERSION,matches:verified.matches,written,workflow:target.workflow,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}
async function runAutoreisenWorkflow(request,env,payload){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env);const telegramTest=payload.mode==='telegram-test'||payload.telegramTest;const fleetOnly=payload.mode==='fleet';
  const automationUpdate=await ensureAutoreisenAutomationCurrent(target,env);
  const requestId=fleetOnly?(String(payload.requestId||'').trim()||`fleet-${Date.now()}`):'';
  const fleetConfig=fleetOnly?cleanAutoreisenConfig(payload.config||{}):null;
  await dispatchAutoreisenWorkflow(target,env,{force:telegramTest?false:(payload.force!==false),telegramTest,fleetOnly,requestId,fleetConfig});
  return json({ok:true,workflowTriggered:true,mode:telegramTest?'telegram-test':fleetOnly?'fleet':'monitor',requestId,automationUpdate,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}
async function autoreisenAutomationStatus(request,env){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env);const inspection=await inspectAutoreisenAutomation(target,env);const files={...inspection.files};
  const configPath=target.path;const configRemote=await githubTextFile(target,configPath,env);files[configPath]=Boolean(configRemote.exists);
  let telegramSecrets=null;try{const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/secrets?per_page=100`;const data=await githubJson(url,{method:'GET'},env);const names=(data?.secrets||[]).map(x=>x.name);telegramSecrets={bot:names.includes('TELEGRAM_BOT_TOKEN')||names.includes('TELEGRAM_TOKEN')||names.includes('BOT_TOKEN'),chat:names.includes('TELEGRAM_CHAT_ID')||names.includes('TELEGRAM_CHAT')||names.includes('CHAT_ID'),worker:names.includes('MFE_WORKER_URL'),monitorSecret:names.includes('MFE_MONITOR_SECRET')};}catch{telegramSecrets=null;}
  const installed=inspection.current&&Boolean(files[configPath]);
  return json({ok:true,installed,automationVersion:inspection.automationVersion,expectedAutomationVersion:AUTOREISEN_AUTOMATION_VERSION,files,matches:inspection.matches,telegramSecrets,workflow:target.workflow,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub,checkedAt:new Date().toISOString()});
}

async function githubTextFile(target,path,env){
  try{
    const encoded=String(path).split('/').map(encodeURIComponent).join('/');
    const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encoded}?ref=${encodeURIComponent(target.branch)}`;
    const response=await githubRequestRaw(url,{method:'GET'},env);
    if(response.status===404)return {exists:false,content:''};
    if(!response.ok)return {exists:false,content:'',status:response.status};
    const data=await response.json();return {exists:true,content:decodeGithubContent(data.content||'')};
  }catch{return {exists:false,content:''};}
}
function sameGithubText(remote,canonical){
  const norm=value=>String(value||'').replace(/\r\n/g,'\n').replace(/\n?$/,'\n');
  return Boolean(remote?.exists)&&norm(remote.content)===norm(canonical);
}
async function cordialRemoteAutomationVersion(target,env){
  const remote=await githubTextFile(target,'monitoring/cordial.mjs',env);
  return remote.content.match(/MFE_CORDIAL_AUTOMATION_VERSION:\s*([^\s]+)/)?.[1]||'';
}
async function inspectCordialAutomation(target,env){
  const paths={
    cordial:'monitoring/cordial.mjs',
    runner:'monitoring/cordial-run.mjs',
    lib:'monitoring/lib.mjs',
    workflow:`.github/workflows/${CORDIAL_WORKFLOW_FILE}`
  };
  const [cordial,runner,lib,workflow]=await Promise.all([githubTextFile(target,paths.cordial,env),githubTextFile(target,paths.runner,env),githubTextFile(target,paths.lib,env),githubTextFile(target,paths.workflow,env)]);
  const matches={cordial:sameGithubText(cordial,CORDIAL_FILE),runner:sameGithubText(runner,CORDIAL_RUN_FILE),lib:sameGithubText(lib,AUTOREISEN_FILE_0),workflow:sameGithubText(workflow,CORDIAL_WORKFLOW_TEMPLATE)};
  const automationVersion=cordial.content.match(/MFE_CORDIAL_AUTOMATION_VERSION:\s*([^\s]+)/)?.[1]||'';
  return {paths,remotes:{cordial,runner,lib,workflow},matches,automationVersion,current:Object.values(matches).every(Boolean)&&automationVersion===CORDIAL_AUTOMATION_VERSION};
}
async function ensureCordialAutomationCurrent(target,env){
  const inspection=await inspectCordialAutomation(target,env);
  if(inspection.current)return {updated:false,version:inspection.automationVersion,matches:inspection.matches};
  const written=[];
  written.push(await upsertGithubFile(target,'monitoring/lib.mjs',AUTOREISEN_FILE_0,env,'Actualizar librería común de monitores · MFE Viajes v2.2.12'));
  written.push(await upsertGithubFile(target,'monitoring/cordial.mjs',CORDIAL_FILE,env,'Actualizar consulta Cordial · MFE Viajes v2.2.12'));
  written.push(await upsertGithubFile(target,'monitoring/cordial-run.mjs',CORDIAL_RUN_FILE,env,'Actualizar monitor Cordial · MFE Viajes v2.2.12'));
  written.push(await upsertGithubFile(target,`.github/workflows/${CORDIAL_WORKFLOW_FILE}`,CORDIAL_WORKFLOW_TEMPLATE,env,'Actualizar workflow Cordial · MFE Viajes v2.2.12'));
  const verified=await inspectCordialAutomation(target,env);
  if(!verified.current)throw new ApiError(502,'GitHub recibió los archivos Cordial, pero la verificación de integridad no coincide con la versión publicada. No se lanzará el workflow.');
  return {updated:true,version:CORDIAL_AUTOMATION_VERSION,previousVersion:inspection.automationVersion,matches:verified.matches,written};
}
async function dispatchCordialWorkflow(target,env){
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(CORDIAL_WORKFLOW_FILE)}/dispatches`;
  await githubJson(url,{method:'POST',body:JSON.stringify({ref:target.branch})},env);return true;
}
async function syncCordialToGitHub(request,env,payload){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env),config=cleanCordialConfig(payload.config||{});const automationUpdate=await ensureCordialAutomationCurrent(target,env);
  const contentUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${target.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(target.branch)}`;
  const current=await githubJson(contentUrl,{method:'GET'},env);let document;try{document=JSON.parse(decodeGithubContent(current.content));}catch{throw new ApiError(502,'monitoring/config.json no contiene JSON válido.');}
  document.cordial={...(document.cordial||{}),...config};
  const update=await githubJson(contentUrl.replace(/\?ref=.*/,''),{method:'PUT',body:JSON.stringify({message:`Sincronizar Cordial desde MFE Viajes (${config.checkIn}–${config.checkOut})`,content:encodeGithubContent(`${JSON.stringify(document,null,2)}\n`),sha:current.sha,branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}})},env);
  let workflowTriggered=false;if(payload.runWorkflow){await dispatchCordialWorkflow(target,env);workflowTriggered=true;}
  return json({ok:true,updated:true,workflowTriggered,commitUrl:update?.commit?.html_url||'',repository:`${target.owner}/${target.repo}`,path:target.path,branch:target.branch,authorizedUid:user.sub,automationUpdate,updatedAt:new Date().toISOString()});
}
async function installCordialAutomation(request,env,payload){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env);const written=[];written.push(await upsertGithubFile(target,'monitoring/lib.mjs',AUTOREISEN_FILE_0,env,'Instalar librería común de monitores · MFE Viajes v2.2.12'));written.push(await upsertGithubFile(target,'monitoring/cordial.mjs',CORDIAL_FILE,env,'Instalar consulta Cordial · MFE Viajes v2.2.12'));written.push(await upsertGithubFile(target,'monitoring/cordial-run.mjs',CORDIAL_RUN_FILE,env,'Instalar monitor Cordial · MFE Viajes v2.2.12'));written.push(await upsertGithubFile(target,`.github/workflows/${CORDIAL_WORKFLOW_FILE}`,CORDIAL_WORKFLOW_TEMPLATE,env,'Instalar workflow Cordial · MFE Viajes v2.2.12'));
  if(payload?.config&&Object.keys(payload.config).length){const cfg=cleanCordialConfig(payload.config),path=target.path,encoded=path.split('/').map(encodeURIComponent).join('/'),url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encoded}?ref=${encodeURIComponent(target.branch)}`;const current=await githubRequestRaw(url,{method:'GET'},env);let document={cordial:{}};if(current.ok){const data=await current.json();try{document=JSON.parse(decodeGithubContent(data.content));}catch{}}document.cordial={...(document.cordial||{}),...cfg};written.push(await upsertGithubFile(target,path,`${JSON.stringify(document,null,2)}\n`,env,'Sincronizar configuración Cordial · MFE Viajes v2.2.08'));}
  const verification=await inspectCordialAutomation(target,env);
  if(!verification.current)throw new ApiError(502,'La automatización Cordial no ha superado la verificación de integridad después de instalarla.');
  return json({ok:true,installed:true,automationVersion:verification.automationVersion,matches:verification.matches,written,workflow:CORDIAL_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}
async function runCordialWorkflow(request,env,payload){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env);const automationUpdate=await ensureCordialAutomationCurrent(target,env);
  let configSynced=false;
  if(payload?.config&&Object.keys(payload.config).length){
    const cfg=cleanCordialConfig(payload.config),path=target.path,encoded=path.split('/').map(encodeURIComponent).join('/'),url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encoded}?ref=${encodeURIComponent(target.branch)}`;
    const current=await githubRequestRaw(url,{method:'GET'},env);let document={};let sha='';if(current.ok){const data=await current.json();sha=data.sha||'';try{document=JSON.parse(decodeGithubContent(data.content));}catch{throw new ApiError(502,'monitoring/config.json no contiene JSON válido.');}}
    document.cordial={...(document.cordial||{}),...cfg};
    const body={message:`Preparar consulta Cordial (${cfg.checkIn}–${cfg.checkOut})`,content:encodeGithubContent(`${JSON.stringify(document,null,2)}\n`),branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}};if(sha)body.sha=sha;
    await githubJson(url.replace(/\?ref=.*/,''),{method:'PUT',body:JSON.stringify(body)},env);configSynced=true;
  }
  await dispatchCordialWorkflow(target,env);return json({ok:true,workflowTriggered:true,configSynced,automationUpdate,workflow:CORDIAL_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}
async function cordialAutomationStatus(request,env){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env),inspection=await inspectCordialAutomation(target,env);
  const configRemote=await githubTextFile(target,target.path,env);
  const files={[target.path]:configRemote.exists,[inspection.paths.cordial]:inspection.remotes.cordial.exists,[inspection.paths.runner]:inspection.remotes.runner.exists,[inspection.paths.workflow]:inspection.remotes.workflow.exists};
  const installed=Boolean(configRemote.exists&&inspection.current);
  return json({ok:true,installed,automationVersion:inspection.automationVersion,expectedAutomationVersion:CORDIAL_AUTOMATION_VERSION,files,matches:inspection.matches,workflow:CORDIAL_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub,checkedAt:new Date().toISOString()});
}


async function inspectFlightOpsAutomation(target,env){
  const paths={monitor:'monitoring/flightops.mjs',runner:'monitoring/flightops-run.mjs',lib:'monitoring/lib.mjs',workflow:`.github/workflows/${FLIGHTOPS_WORKFLOW_FILE}`};
  const [monitor,runner,lib,workflow]=await Promise.all([githubTextFile(target,paths.monitor,env),githubTextFile(target,paths.runner,env),githubTextFile(target,paths.lib,env),githubTextFile(target,paths.workflow,env)]);
  const matches={monitor:sameGithubText(monitor,FLIGHTOPS_FILE),runner:sameGithubText(runner,FLIGHTOPS_RUN_FILE),lib:sameGithubText(lib,AUTOREISEN_FILE_0),workflow:sameGithubText(workflow,FLIGHTOPS_WORKFLOW_TEMPLATE)};
  const automationVersion=monitor.content.match(/MFE_FLIGHTOPS_AUTOMATION_VERSION:\s*([^\s]+)/)?.[1]||'';
  return {paths,remotes:{monitor,runner,lib,workflow},matches,automationVersion,current:Object.values(matches).every(Boolean)&&automationVersion===FLIGHTOPS_AUTOMATION_VERSION};
}
async function ensureFlightOpsAutomationCurrent(target,env){
  const inspection=await inspectFlightOpsAutomation(target,env);if(inspection.current)return {updated:false,version:inspection.automationVersion,matches:inspection.matches};
  const written=[];written.push(await upsertGithubFile(target,'monitoring/lib.mjs',AUTOREISEN_FILE_0,env,'Actualizar librería común · Estado vuelos MFE'));written.push(await upsertGithubFile(target,'monitoring/flightops.mjs',FLIGHTOPS_FILE,env,`Actualizar consulta operativa vuelos · v${FLIGHTOPS_AUTOMATION_VERSION}`));written.push(await upsertGithubFile(target,'monitoring/flightops-run.mjs',FLIGHTOPS_RUN_FILE,env,`Actualizar runner estado vuelos · v${FLIGHTOPS_AUTOMATION_VERSION}`));written.push(await upsertGithubFile(target,`.github/workflows/${FLIGHTOPS_WORKFLOW_FILE}`,FLIGHTOPS_WORKFLOW_TEMPLATE,env,`Actualizar workflow estado vuelos · v${FLIGHTOPS_AUTOMATION_VERSION}`));
  const verified=await inspectFlightOpsAutomation(target,env);if(!verified.current)throw new ApiError(502,'La automatización de estado de vuelos no ha superado la verificación de integridad.');
  return {updated:true,version:verified.automationVersion,matches:verified.matches,written};
}
async function writeFlightOpsConfig(target,env,config,message='Sincronizar estado de vuelos · MFE Viajes'){
  const clean=cleanFlightOpsConfig(config),path=target.path,encoded=path.split('/').map(encodeURIComponent).join('/'),url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encoded}?ref=${encodeURIComponent(target.branch)}`;
  const current=await githubRequestRaw(url,{method:'GET'},env);let document={},sha='';if(current.ok){const data=await current.json();sha=data.sha||'';try{document=JSON.parse(decodeGithubContent(data.content));}catch{throw new ApiError(502,'monitoring/config.json no contiene JSON válido.');}}else if(current.status!==404){let data=null;try{data=await current.json();}catch{}throw githubApiError(current,data);}
  const nextFlightOps={...(document.flightops||{}),...clean};
  if(JSON.stringify(document.flightops||{})===JSON.stringify(nextFlightOps))return {clean,commitUrl:'',updated:false};
  document.flightops=nextFlightOps;const body={message,content:encodeGithubContent(`${JSON.stringify(document,null,2)}
`),branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}};if(sha)body.sha=sha;
  const update=await githubJson(url.replace(/\?ref=.*/,''),{method:'PUT',body:JSON.stringify(body)},env);return {clean,commitUrl:update?.commit?.html_url||'',updated:true};
}
async function dispatchFlightOpsWorkflow(target,env,{force=true}={}){
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(FLIGHTOPS_WORKFLOW_FILE)}/dispatches`;
  await githubJson(url,{method:'POST',body:JSON.stringify({ref:target.branch,inputs:{force:String(Boolean(force))}})},env);return true;
}
async function syncFlightOpsToGitHub(request,env,payload){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),automationUpdate=await ensureFlightOpsAutomationCurrent(target,env),written=await writeFlightOpsConfig(target,env,payload.config||{});let workflowTriggered=false;if(payload.runWorkflow){await dispatchFlightOpsWorkflow(target,env,{force:true});workflowTriggered=true;}
  return json({ok:true,updated:true,workflowTriggered,automationUpdate,commitUrl:written.commitUrl,workflow:FLIGHTOPS_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}
async function installFlightOpsAutomation(request,env,payload){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),automationUpdate=await ensureFlightOpsAutomationCurrent(target,env);let configSynced=false;if(payload?.config&&Object.keys(payload.config).length){await writeFlightOpsConfig(target,env,payload.config,'Instalar configuración estado vuelos · MFE Viajes');configSynced=true;}
  return json({ok:true,installed:true,configSynced,automationVersion:FLIGHTOPS_AUTOMATION_VERSION,automationUpdate,workflow:FLIGHTOPS_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}
async function runFlightOpsWorkflow(request,env,payload){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),automationUpdate=await ensureFlightOpsAutomationCurrent(target,env);let configSynced=false;if(payload?.config&&Object.keys(payload.config).length){await writeFlightOpsConfig(target,env,payload.config,'Preparar consulta estado vuelos · MFE Viajes');configSynced=true;}await dispatchFlightOpsWorkflow(target,env,{force:payload.force!==false});
  return json({ok:true,workflowTriggered:true,configSynced,automationUpdate,workflow:FLIGHTOPS_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}
async function flightOpsAutomationStatus(request,env){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),inspection=await inspectFlightOpsAutomation(target,env),configRemote=await githubTextFile(target,target.path,env);let configReady=false;if(configRemote.exists){try{const doc=JSON.parse(configRemote.content||'{}');configReady=Array.isArray(doc?.flightops?.flights)&&doc.flightops.flights.length>0;}catch{}}
  return json({ok:true,installed:Boolean(inspection.current&&configReady),configReady,automationVersion:inspection.automationVersion,expectedAutomationVersion:FLIGHTOPS_AUTOMATION_VERSION,matches:inspection.matches,workflow:FLIGHTOPS_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub,checkedAt:new Date().toISOString()});
}


async function removeLegacyVuelingWorkflows(request,env){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env);
  const folderPath='.github/workflows';
  const folderUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${folderPath}?ref=${encodeURIComponent(target.branch)}`;
  const entries=await githubJson(folderUrl,{method:'GET'},env);
  if(!Array.isArray(entries))throw new ApiError(502,'GitHub no ha devuelto la carpeta de workflows correctamente.');
  const deleted=[];
  for(const entry of entries){
    if(entry?.type!=='file'||!/\.ya?ml$/i.test(String(entry.name||'')))continue;
    const fileUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${folderPath}/${encodeURIComponent(entry.name)}?ref=${encodeURIComponent(target.branch)}`;
    const file=await githubJson(fileUrl,{method:'GET'},env);
    let content='';try{content=decodeGithubContent(file.content||'');}catch{}
    if(!/vueling/i.test(`${entry.name}
${content}`))continue;
    const deleteUrl=fileUrl.replace(/\?ref=.*/,'');
    await githubJson(deleteUrl,{method:'DELETE',body:JSON.stringify({message:`Eliminar seguimiento antiguo de Vueling desde MFE Viajes`,sha:file.sha,branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}})},env);
    deleted.push(entry.name);
  }
  return json({ok:true,deleted,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}

function madridDateParts(value=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:MONITOR_FALLBACK_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value);
  const get=type=>parts.find(x=>x.type===type)?.value||'';
  return {date:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour'))||0,minute:Number(get('minute'))||0};
}
function monitorFallbackKey(day){return `monitor:fallback:${String(day||'').trim()}`;}
async function readMonitorFallbackDay(env,day){
  try{const raw=await requireTrackerKv(env).get(monitorFallbackKey(day));return raw?JSON.parse(raw):null;}catch{return null;}
}
async function writeMonitorFallbackDay(env,day,value){
  await requireTrackerKv(env).put(monitorFallbackKey(day),JSON.stringify(value),{expirationTtl:60*60*24*45});
}
function fallbackWorkflowName(env,tracker){
  return String(env?.[tracker.workflowEnv]||tracker.workflowDefault||'').trim();
}
function githubRunMadridDate(run){
  const stamp=Date.parse(run?.run_started_at||run?.created_at||'');
  return Number.isFinite(stamp)?madridDateParts(new Date(stamp)).date:'';
}
async function githubWorkflowRunsToday(env,target,workflow,day){
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs?branch=${encodeURIComponent(target.branch)}&per_page=30`;
  const data=await githubJson(url,{method:'GET'},env);const runs=Array.isArray(data?.workflow_runs)?data.workflow_runs:[];
  return runs.filter(run=>githubRunMadridDate(run)===day).map(run=>({id:run.id,event:String(run.event||''),status:String(run.status||''),conclusion:String(run.conclusion||''),createdAt:String(run.created_at||''),startedAt:String(run.run_started_at||''),htmlUrl:String(run.html_url||'')}));
}
async function dispatchFallbackWorkflow(env,target,tracker,workflow){
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  const body={ref:target.branch};if(tracker.inputs)body.inputs=tracker.inputs;
  await githubJson(url,{method:'POST',body:JSON.stringify(body)},env);return true;
}
async function monitorFallbackStatus(env){
  const now=new Date(),local=madridDateParts(now),stored=await readMonitorFallbackDay(env,local.date);
  return json({ok:true,enabled:true,date:local.date,localTime:`${String(local.hour).padStart(2,'0')}:${String(local.minute).padStart(2,'0')}`,timeZone:MONITOR_FALLBACK_TIME_ZONE,checkAfter:'07:15',lastCheck:stored||null});
}
async function runMonitorFallbackCheck(env,{scheduledAt=new Date(),source='cron',force=false}={}){
  const local=madridDateParts(scheduledAt),minuteOfDay=local.hour*60+local.minute,threshold=MONITOR_FALLBACK_LOCAL_HOUR*60+MONITOR_FALLBACK_LOCAL_MINUTE;
  const prior=await readMonitorFallbackDay(env,local.date);
  if(!force&&minuteOfDay<threshold)return {ok:true,skipped:true,reason:'before-local-window',date:local.date,localTime:`${String(local.hour).padStart(2,'0')}:${String(local.minute).padStart(2,'0')}`,timeZone:MONITOR_FALLBACK_TIME_ZONE,lastCheck:prior||null};
  if(!force&&prior?.completed===true)return {ok:true,skipped:true,reason:'already-checked',date:local.date,lastCheck:prior};
  const target=githubTarget(env),startedAt=new Date().toISOString(),trackers={};
  const record={date:local.date,startedAt,checkedAt:'',source,timeZone:MONITOR_FALLBACK_TIME_ZONE,localTime:`${String(local.hour).padStart(2,'0')}:${String(local.minute).padStart(2,'0')}`,completed:false,trackers};
  for(const tracker of MONITOR_FALLBACK_TRACKERS){
    const workflow=fallbackWorkflowName(env,tracker);const item={label:tracker.label,workflow,runFound:false,dispatched:false,dispatchedAt:'',run:null,error:''};trackers[tracker.id]=item;
    try{
      const runs=await githubWorkflowRunsToday(env,target,workflow,local.date);const existing=runs[0]||null;
      if(existing){item.runFound=true;item.run=existing;continue;}
      await dispatchFallbackWorkflow(env,target,tracker,workflow);item.dispatched=true;item.dispatchedAt=new Date().toISOString();
    }catch(error){item.error=String(error?.message||error||'Error desconocido');}
  }
  record.checkedAt=new Date().toISOString();record.completed=Object.values(trackers).every(x=>x.runFound||x.dispatched);
  record.dispatchedCount=Object.values(trackers).filter(x=>x.dispatched).length;record.errorCount=Object.values(trackers).filter(x=>x.error).length;
  await writeMonitorFallbackDay(env,local.date,record);
  return {ok:record.errorCount===0,...record};
}

function requireTrackerKv(env){
  if(!env?.MFE_TRACKERS)throw new ApiError(503,"El almacenamiento KV MFE_TRACKERS no está configurado en el Worker.");
  return env.MFE_TRACKERS;
}
function trackerType(value){
  const type=String(value||"").toLowerCase();
  if(!["autoreisen","cordial","pools","autoreisen-stage2","dunas"].includes(type))throw new ApiError(400,"Seguimiento no válido.");
  return type;
}
function bearerToken(request){
  const auth=request.headers.get("Authorization")||"";
  return auth.startsWith("Bearer ")?auth.slice(7).trim():"";
}
async function writeTrackerResult(request,env,payload){
  const expected=String(env?.MONITOR_SECRET||"");
  if(!expected)throw new ApiError(503,"El secreto MONITOR_SECRET no está configurado.");
  if(bearerToken(request)!==expected)throw new ApiError(401,"No autorizado.");
  const type=trackerType(payload.type);
  const kv=requireTrackerKv(env);
  const result={...(payload.result||{}),type,receivedAt:new Date().toISOString()};
  if(!result.checkedAt)result.checkedAt=result.receivedAt;
  if(result.status!=="error" && result.ok!==false){result.ok=true;result.status="ok";}
  const failed=result.status==="error"||result.ok===false;
  if(result.scanMode==='fleet'){
    const requestId=String(result.requestId||'').trim();if(!requestId)throw new ApiError(400,'Falta requestId en la consulta puntual de flota.');
    await kv.put(`tracker:${type}:fleet:${requestId}`,JSON.stringify(result),{expirationTtl:60*20});
    await kv.put(`tracker:${type}:fleet:latest`,JSON.stringify(result),{expirationTtl:60*60*6});
    return json({ok:true,type,scanMode:'fleet',requestId,storedAt:result.receivedAt});
  }
  if(failed)await kv.put(`tracker:${type}:last-error`,JSON.stringify(result),{expirationTtl:60*60*24*30});
  else {await kv.put(`tracker:${type}:latest`,JSON.stringify(result));await kv.delete(`tracker:${type}:last-error`);}
  const day=String(result.checkedAt).slice(0,10)||new Date().toISOString().slice(0,10);
  const historyId=type==='pools'?String(result.checkedAt||result.receivedAt||new Date().toISOString()).replace(/[^0-9T]/g,'').slice(0,15):day;
  await kv.put(`tracker:${type}:history:${historyId}`,JSON.stringify(result),{expirationTtl:60*60*24*400});
  const indexKey=`tracker:${type}:history:index`;
  let index=[];try{index=JSON.parse(await kv.get(indexKey)||"[]");}catch{}
  index=[historyId,...index.filter(x=>x!==historyId)].slice(0,type==='pools'?240:400);
  await kv.put(indexKey,JSON.stringify(index));
  return json({ok:true,type,storedAt:result.receivedAt});
}
async function readAutoreisenFleetResult(request,env,payload){
  await verifyFirebaseUser(request,env);const requestId=String(payload.requestId||'').trim();if(!requestId)throw new ApiError(400,'Falta el identificador de la consulta de flota.');
  const kv=requireTrackerKv(env),raw=await kv.get(`tracker:autoreisen:fleet:${requestId}`);if(!raw)return json({ok:true,pending:true,requestId});
  let result;try{result=JSON.parse(raw);}catch{throw new ApiError(500,'El resultado de flota guardado no es válido.');}
  return json({ok:true,pending:false,requestId,result});
}
async function readTrackerResult(env,value){
  const type=trackerType(value);const kv=requireTrackerKv(env);
  const raw=await kv.get(`tracker:${type}:latest`);const errorRaw=await kv.get(`tracker:${type}:last-error`);
  let lastError=null;if(errorRaw){try{lastError=JSON.parse(errorRaw);}catch{}}
  if(!raw){if(['autoreisen-stage2','dunas'].includes(type))return json({ok:true,result:null,lastError,pending:!lastError});if(lastError)return json({ok:false,lastError,error:lastError.error||`La última consulta de ${type} falló.`},502);throw new ApiError(404,`Todavía no hay resultados automáticos de ${type}. Ejecuta primero el monitor de GitHub Actions.`);}
  let result;try{result=JSON.parse(raw);}catch{throw new ApiError(500,"El último resultado guardado no es válido.");}
  return json({ok:true,result,lastError,message:lastError?`Se conserva el último dato correcto de ${type}; la consulta más reciente falló.`:`Último dato automático de ${type}.`});
}
async function readTrackerHistory(env,value){
  const type=trackerType(value);const kv=requireTrackerKv(env);
  let days=[];try{days=JSON.parse(await kv.get(`tracker:${type}:history:index`)||"[]");}catch{}
  const results=[];for(const id of days.slice(0,type==='pools'?160:90)){const raw=await kv.get(`tracker:${type}:history:${id}`);if(raw){try{results.push(JSON.parse(raw));}catch{}}}
  return json({ok:true,type,results});
}


const LIVE_AENA_BASE='https://www.aena.es/sites/Satellite';
const LIVE_AENA_STATUS={SCH:'Programado',INI:'Programado',HOR:'En hora',RET:'Retrasado',EMB:'Embarcando',ULL:'Última llamada',NPT:'Cambio de puerta',CER:'Puerta cerrada',FLY:'Despegado',FNL:'En aproximación',LND:'Aterrizado',ATE:'Aterrizado',OPE:'Equipaje en cinta',OPF:'Equipaje en cinta',IBK:'Equipaje en cinta',BOR:'Finalizado',CAN:'Cancelado',DES:'Desviado'};
function foClean(v){return String(v??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();}
function foUpper(v){return foClean(v).toUpperCase();}
function foNorm(v){return foUpper(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function foDigits(v){return String(v||'').replace(/\D+/g,'');}
function foAirport(v){return foUpper(v).match(/\b([A-Z]{3})\b/)?.[1]||'';}
function foDateEs(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:'';}
function foTime(v){return String(v||'').match(/T(\d{2}:\d{2})/)?.[1]||'';}
function foScalar(v){return ['string','number'].includes(typeof v)?foClean(v):'';}
function foDeep(obj,patterns,depth=0){if(!obj||typeof obj!=='object'||depth>4)return '';for(const [k,v] of Object.entries(obj)){const nk=foNorm(k);if(patterns.some(p=>p.test(nk))){const s=foScalar(v);if(s)return s;}}for(const v of Object.values(obj)){const s=foDeep(v,patterns,depth+1);if(s)return s;}return '';}
function foRowNumber(r={}){return `${foClean(r.iataCompania)||foClean(r.compania)||foClean(r.oaciCompania)||''}${foClean(r.numVuelo)||foClean(r.numeroVuelo)||''}`.replace(/\s+/g,'');}
function foRowDate(r={}){return foClean(r.fecha)||foClean(r.fechaVuelo)||'';}
function foRowTime(r={}){return foClean(r.horaProgramada)||foClean(r.horaProg)||foClean(r.horaEstimada)||'';}
function foRowOther(r={}){return foUpper(r.iataOtro||r.aeropuertoIataOtro||r.iataDestino||r.iataOrigen||'');}
function foScore(r={},flight={},mode='departure'){
  const targetDigits=foDigits(flight.number),rowDigits=foDigits(foRowNumber(r));if(!targetDigits||targetDigits!==rowDigits)return -1;
  const expectedDate=foDateEs(String(flight.date||flight.departure||'').slice(0,10)),rowDate=foRowDate(r);if(!expectedDate||!rowDate||foNorm(expectedDate)!==foNorm(rowDate))return -1;
  let score=17;
  const other=foAirport(mode==='departure'?(flight.destination||flight.to):(flight.origin||flight.from)),rowOther=foRowOther(r);if(other&&rowOther===other)score+=5;
  const tm=foTime(mode==='departure'?flight.departure:flight.arrival),rt=foRowTime(r);if(tm&&rt&&rt.startsWith(tm))score+=3;
  return score;
}
function foRange(a,b){a=foClean(a);b=foClean(b);if(a&&b&&a!==b)return `${a}-${b}`;return a||b||'';}
function foParseRow(r={},flight={},mode='departure'){
  const firstCounter=foDeep(r,[/MOSTRADOR.*(?:PRIM|INI)/,/FACTUR.*(?:PRIM|INI)/,/CHECK.*(?:FIRST|START)/]);
  const lastCounter=foDeep(r,[/MOSTRADOR.*(?:ULT|FIN)/,/FACTUR.*(?:ULT|FIN)/,/CHECK.*(?:LAST|END)/]);
  const counters=foRange(firstCounter,lastCounter)||foDeep(r,[/MOSTRADOR/,/FACTURACION/,/CHECKINCOUNTER/,/CHECKIN/]);
  const boardingStart=foDeep(r,[/HORA.*EMBAR/,/EMBAR.*HORA/,/BOARDING.*(?:START|TIME)/]);
  const boardingClose=foDeep(r,[/CIERRE.*EMBAR/,/EMBAR.*CIERRE/,/BOARDING.*CLOSE/]);
  const timeOnly=v=>String(v||'').match(/\b([0-2]?\d:[0-5]\d)\b/)?.[1]||'';
  const status=LIVE_AENA_STATUS[foUpper(r.estado||r.estadoVuelo||'')]||foClean(r.estado||r.estadoVuelo||'');
  return {status,statusVerified:Boolean(status),terminal:foClean(r.terminal||r.terminalPrimera||''),gate:foClean(r.puertaPrimera||r.puerta||''),checkInCounters:foClean(counters),baggageBelt:foClean(r.cintaPrimera||r.cinta||''),boardingStart:timeOnly(boardingStart),boardingClose:timeOnly(boardingClose),scheduledDeparture:mode==='departure'?(foRowTime(r)||foTime(flight.departure)):foTime(flight.departure),scheduledArrival:mode==='arrival'?(foRowTime(r)||foTime(flight.arrival)):foTime(flight.arrival)};
}
async function foFetchRows(airport,direction){
  const flightType=direction==='arrival'?'L':'S';const url=`${LIVE_AENA_BASE}?pagename=AENA_ConsultarVuelos&airport=${encodeURIComponent(airport)}&flightType=${flightType}&dosDias=si`;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
  try{
    const response=await fetch(url,{headers:{Accept:'application/json,text/plain,*/*','Accept-Language':'es-ES,es;q=0.9',Referer:'https://www.aena.es/es/infovuelos.html','User-Agent':'Mozilla/5.0 (compatible; GC26/2.3.9)'},cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);const rows=await response.json();if(!Array.isArray(rows))throw new Error('Aena no devolvió una lista JSON.');return {ok:true,url,rows};
  }catch(error){return {ok:false,url,rows:[],error:error?.name==='AbortError'?'timeout 9 s':(error?.message||String(error))};}finally{clearTimeout(timer);}
}
async function foQueryFlight(flight={}){
  const origin=foAirport(flight.origin||flight.from),destination=foAirport(flight.destination||flight.to);const hints=flight.operationalHints||{};
  const [depRes,arrRes]=await Promise.all([origin?foFetchRows(origin,'departure'):Promise.resolve({ok:false,rows:[],error:'Origen no disponible'}),destination?foFetchRows(destination,'arrival'):Promise.resolve({ok:false,rows:[],error:'Destino no disponible'})]);
  const best=(res,mode)=>res.rows.map(r=>({r,score:foScore(r,flight,mode)})).filter(x=>x.score>=10).sort((a,b)=>b.score-a.score)[0]||null;
  const dep=best(depRes,'departure'),arr=best(arrRes,'arrival');const d=dep?foParseRow(dep.r,flight,'departure'):{},a=arr?foParseRow(arr.r,flight,'arrival'):{};
  const terminal=d.terminal||foClean(hints.terminal),gate=d.gate||foClean(hints.gate),checkInCounters=d.checkInCounters||foClean(hints.checkInCounters),baggageBelt=a.baggageBelt||foClean(hints.baggageBelt),boardingStart=d.boardingStart||foClean(hints.boardingStart),boardingClose=d.boardingClose||foClean(hints.boardingClose),status=d.status||a.status||'',statusVerified=Boolean(d.statusVerified||a.statusVerified),hinted=Boolean(foClean(hints.terminal)||foClean(hints.gate)||foClean(hints.checkInCounters)||foClean(hints.baggageBelt)||foClean(hints.boardingStart));
  const identityVerified=Boolean(dep||arr||hinted),sources=[];
  if(depRes.ok)sources.push({name:'Aena',mode:'salidas',found:Boolean(dep),identityVerified:Boolean(dep),statusVerified:Boolean(dep&&d.statusVerified),identityScore:dep?.score||0,url:depRes.url,error:''});else sources.push({name:'Aena',mode:'salidas',found:false,identityVerified:false,statusVerified:false,identityScore:0,url:depRes.url||'',error:depRes.error||''});
  if(arrRes.ok)sources.push({name:'Aena',mode:'llegadas',found:Boolean(arr),identityVerified:Boolean(arr),statusVerified:Boolean(arr&&a.statusVerified),identityScore:arr?.score||0,url:arrRes.url,error:''});else sources.push({name:'Aena',mode:'llegadas',found:false,identityVerified:false,statusVerified:false,identityScore:0,url:arrRes.url||'',error:arrRes.error||''});
  if(hinted)sources.push({name:hints.source||'Aena app · última info confirmada',mode:'snapshot',found:true,identityVerified:true,statusVerified:false,identityScore:100,url:'',error:''});
  return {id:String(flight.id||flight.number||''),number:String(flight.number||''),date:String(flight.date||flight.departure||'').slice(0,10),origin,destination,departure:flight.departure||'',arrival:flight.arrival||'',status,statusVerified,identityVerified,terminal,gate,checkInCounters,baggageBelt,boardingStart,boardingClose,scheduledDeparture:d.scheduledDeparture||foTime(flight.departure),scheduledArrival:a.scheduledArrival||foTime(flight.arrival),sources,sourceLabel:'Aena',hasOperationalData:Boolean(identityVerified&&(status||terminal||gate||checkInCounters||baggageBelt||boardingStart||boardingClose))};
}
async function liveFlightOpsResult(request,env,payload){
  await verifyFirebaseUser(request,env);const now=Date.now(),flights=(Array.isArray(payload?.config?.flights)?payload.config.flights:[]).filter(f=>{if(!f?.number||!f?.departure)return false;const dep=Date.parse(f.departure);return Number.isFinite(dep)&&dep-now<=14*86400000&&dep-now>=-3*86400000;});
  if(!flights.length)return json({ok:true,result:{ok:true,status:'ok',checkedAt:new Date().toISOString(),source:'Aena API pública · fuera de ventana operativa',flights:[]},message:'Aena se activará 14 días antes del primer vuelo.'});
  const results=[];for(const flight of flights)results.push(await foQueryFlight(flight));
  const result={ok:true,status:'ok',checkedAt:new Date().toISOString(),source:'Aena API pública · Cloudflare Worker',flights:results};
  const kv=requireTrackerKv(env);await kv.put('flightops:latest',JSON.stringify({...result,receivedAt:new Date().toISOString()}));await kv.delete('flightops:last-error');
  return json({ok:true,result,message:results.some(f=>f.hasOperationalData)?'Información operativa de Aena actualizada.':'Aena todavía no devuelve datos operativos para estos vuelos.'});
}

async function writeFlightOpsResult(request,env,payload){
  const expected=String(env?.MONITOR_SECRET||'');if(!expected)throw new ApiError(503,'El secreto MONITOR_SECRET no está configurado.');if(bearerToken(request)!==expected)throw new ApiError(401,'No autorizado.');
  const kv=requireTrackerKv(env),result={...(payload.result||{}),receivedAt:new Date().toISOString()};if(!result.checkedAt)result.checkedAt=result.receivedAt;const failed=result.status==='error'||result.ok===false;
  if(failed)await kv.put('flightops:last-error',JSON.stringify(result),{expirationTtl:60*60*24*14});else{result.ok=true;result.status='ok';await kv.put('flightops:latest',JSON.stringify(result));await kv.delete('flightops:last-error');}
  return json({ok:true,storedAt:result.receivedAt,failed});
}
async function readFlightOpsResult(env){
  const kv=requireTrackerKv(env),raw=await kv.get('flightops:latest'),errorRaw=await kv.get('flightops:last-error');let lastError=null;if(errorRaw){try{lastError=JSON.parse(errorRaw);}catch{}}
  if(!raw)return json({ok:true,result:null,lastError,message:lastError?'La última consulta operativa falló; todavía no hay un dato correcto guardado.':'Todavía no hay datos operativos de vuelos.'});
  let result=null;try{result=JSON.parse(raw);}catch{throw new ApiError(500,'El último estado de vuelos guardado no es válido.');}
  return json({ok:true,result,lastError,message:lastError?'Se conserva el último estado correcto; la consulta más reciente falló.':'Último estado operativo de vuelos.'});
}

function isAllowedShop(hostname) {
  const host = hostname.toLowerCase();
  return ALLOWED_SHOPS.some(domain => host === domain || host.endsWith(`.${domain}`));
}

function isMercadona(hostname) {
  const host = hostname.toLowerCase();
  return host === "mercadona.es" || host.endsWith(".mercadona.es");
}

function isHiperdino(hostname) {
  const host = hostname.toLowerCase();
  return host === "hiperdino.es" || host.endsWith(".hiperdino.es");
}

async function readProductFromUrl(productUrl, {hintName="",postalCode=""} = {}) {
  return isMercadona(productUrl.hostname)
    ? readMercadona(productUrl,{postalCode,hintName})
    : isHiperdino(productUrl.hostname)
      ? readHiperdino(productUrl,{hintName,postalCode})
      : readGenericProduct(productUrl);
}

const MERCADONA_DEFAULT_VERSION = "v9200";
const MERCADONA_DEFAULT_ALGOLIA = {appId:"7UZJKL1DJ0",apiKey:"9d8f2e39e90df472b4f2e559a116fe17",indexBase:"products_prod"};
// v2.1.67: UUID estable. No se genera en el ámbito global porque Cloudflare
// Workers bloquea la generación aleatoria durante la inicialización del módulo.
const MERCADONA_DEVICE_ID = "4a20b937-9884-43a7-af8e-3b89b4f9ef43";
const mercadonaWarehouseCache = new Map();
let mercadonaVersionCache = {value:MERCADONA_DEFAULT_VERSION,at:0};
let mercadonaAlgoliaCache = {...MERCADONA_DEFAULT_ALGOLIA,at:0};

function mercadonaRequestHeaders(productUrl,version=MERCADONA_DEFAULT_VERSION){
  return {
    "Accept":"application/json, text/plain, */*",
    "Accept-Language":"es-ES,es;q=0.9,en;q=0.8",
    "Referer":"https://tienda.mercadona.es/",
    "Origin":"https://tienda.mercadona.es",
    "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "x-version":version,
    "x-customer-device-id":MERCADONA_DEVICE_ID
  };
}

async function resolveMercadonaWarehouse(postalCode,version=MERCADONA_DEFAULT_VERSION){
  const pc=String(postalCode||"").trim();
  if(!/^\d{5}$/.test(pc))return "";
  const cached=mercadonaWarehouseCache.get(pc);
  if(cached&&Date.now()-cached.at<6*3600_000)return cached.value;
  // El endpoint observado por el frontend acepta PUT de forma verificada.
  // Conservamos POST como fallback por compatibilidad con despliegues anteriores.
  for(const method of ["PUT","POST"]){
    try{
      const response=await fetchWithTimeout("https://tienda.mercadona.es/api/postal-codes/actions/change-pc/",{
        method,redirect:"follow",
        headers:{...mercadonaRequestHeaders(null,version),"Content-Type":"application/json"},
        body:JSON.stringify({new_postal_code:pc})
      },3800);
      if(!response.ok)continue;
      const wh=String(response.headers.get("x-customer-wh")||"").trim();
      if(wh){mercadonaWarehouseCache.set(pc,{value:wh,at:Date.now()});return wh;}
    }catch{}
  }
  return "";
}

async function discoverMercadonaVersion(){
  if(Date.now()-mercadonaVersionCache.at<6*3600_000)return mercadonaVersionCache.value;
  try{
    const response=await fetchWithTimeout("https://tienda.mercadona.es/",{headers:{"User-Agent":mercadonaRequestHeaders()["User-Agent"]}},5000);
    const html=await response.text();
    const match=html.match(/\/v(\d+)\/(?:index-[A-Za-z0-9_-]+\.js|)/i)||html.match(/\/v(\d+)\//i);
    if(match){mercadonaVersionCache={value:`v${match[1]}`,at:Date.now()};return mercadonaVersionCache.value;}
  }catch{}
  mercadonaVersionCache.at=Date.now();
  return mercadonaVersionCache.value||MERCADONA_DEFAULT_VERSION;
}

async function discoverMercadonaAlgolia(force=false){
  if(!force && Date.now()-Number(mercadonaAlgoliaCache.at||0)<6*3600_000)return mercadonaAlgoliaCache;
  try{
    const shellResponse=await fetchWithTimeout("https://tienda.mercadona.es/",{headers:{"User-Agent":mercadonaRequestHeaders()["User-Agent"],"Accept":"text/html,*/*"}},5500);
    const shell=await shellResponse.text();
    const path=shell.match(/\/v\d+\/index-[A-Za-z0-9_-]+\.js/)?.[0];
    if(path){
      const jsResponse=await fetchWithTimeout(`https://tienda.mercadona.es${path}`,{headers:{"User-Agent":mercadonaRequestHeaders()["User-Agent"],"Accept":"*/*"}},6000);
      const js=await jsResponse.text();
      const pair=js.match(/"([A-Z0-9]{10})",[A-Za-z0-9_$]+="([0-9a-f]{32})"/);
      const base=js.match(/"(products_prod[a-z_]*)"/)?.[1]||"products_prod";
      if(pair)mercadonaAlgoliaCache={appId:pair[1],apiKey:pair[2],indexBase:base,at:Date.now()};
    }
  }catch{}
  if(!mercadonaAlgoliaCache.at)mercadonaAlgoliaCache.at=Date.now();
  return mercadonaAlgoliaCache;
}

function mercadonaNameMatchScore(candidate,target){
  const a=normalizeProductText(candidate),b=normalizeProductText(target);
  if(!a||!b)return 0;
  if(a===b)return 100;
  const words=b.split(" ").filter(w=>w.length>2);
  if(!words.length)return 0;
  const matched=words.filter(w=>a.includes(w)).length;
  return Math.round(matched/words.length*100);
}

async function readMercadonaAlgolia({id,hintName,warehouses}){
  const query=String(hintName||"").trim();
  if(!query)return null;
  const whs=[...new Set((warehouses||[]).filter(Boolean))].slice(0,12);
  if(!whs.length)return null;
  const run=async(creds)=>{
    const params=new URLSearchParams({query,hitsPerPage:"16"}).toString();
    const requests=whs.map(wh=>({indexName:`${creds.indexBase}_${wh}_es`,params}));
    const endpoint=`https://${String(creds.appId).toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`;
    const response=await fetchWithTimeout(endpoint,{
      method:"POST",
      headers:{"X-Algolia-API-Key":creds.apiKey,"X-Algolia-Application-Id":creds.appId,"Content-Type":"application/json","User-Agent":mercadonaRequestHeaders()["User-Agent"],"Referer":"https://tienda.mercadona.es/"},
      body:JSON.stringify({requests})
    },4300);
    if(!response.ok)return {result:null,status:response.status};
    const body=await response.json();
    const candidates=[];
    (body?.results||[]).forEach((result,index)=>{
      for(const hit of result?.hits||[]){
        const parsed=productFromMercadonaObject(hit);
        if(!(Number.isFinite(parsed.price)&&parsed.price>0))continue;
        const hitId=String(hit?.id??hit?.objectID??"").trim();
        const share=String(hit?.share_url||"");
        const exactId=hitId===String(id)||new RegExp(`/product/${String(id)}(?:/|$)`).test(share);
        const score=mercadonaNameMatchScore(parsed.name,query);
        if(exactId||score>=88)candidates.push({...parsed,diagnostic:{shop:"mercadona",source:"algolia",warehouse:whs[index],matchedId:hitId||null,matchScore:score,exactId}});
      }
    });
    const result=candidates.sort((a,b)=>Number(b.diagnostic?.exactId)-Number(a.diagnostic?.exactId)||(b.diagnostic?.matchScore||0)-(a.diagnostic?.matchScore||0))[0]||null;
    return {result,status:response.status};
  };
  try{
    // Primero las credenciales LKG: evita descargar el bundle en cada producto.
    let creds={...mercadonaAlgoliaCache};
    if(!creds.appId||!creds.apiKey)creds={...MERCADONA_DEFAULT_ALGOLIA,at:Date.now()};
    let attempt=await run(creds);
    if(attempt.result)return attempt.result;
    if([401,403,404].includes(attempt.status)){
      creds=await discoverMercadonaAlgolia(true);
      attempt=await run(creds);
      return attempt.result;
    }
  }catch{}
  return null;
}

async function readMercadona(productUrl,{postalCode="",hintName=""}={}) {
  // v2.1.67: estrategia rápida y sensible a almacén. El flujo anterior hacía
  // múltiples GET secuenciales y los productos regionales agotaban el timeout
  // de la PWA antes de llegar al almacén correcto.
  const id=productUrl.pathname.match(/\/product\/([^/?#]+)/i)?.[1];
  if(!id)return readGenericProduct(productUrl);
  const base="https://tienda.mercadona.es";
  const version=MERCADONA_DEFAULT_VERSION;
  const configuredPc=/^\d{5}$/.test(String(postalCode||"").trim())?String(postalCode).trim():"";
  // El viaje actual usa 35214 para Mercadona. Normalmente llega desde la
  // configuración del supermercado; este valor queda solo como respaldo técnico.
  const warehousePc=configuredPc||"35214";

  const parseResponse=async(response,source,warehouse="")=>{
    if(!response?.ok)return null;
    const ct=response.headers.get("content-type")||"";
    if(!ct.includes("json"))return null;
    try{
      const parsed=productFromMercadonaObject(await response.json());
      return (parsed.name||parsed.image||Number.isFinite(parsed.price))?{...parsed,diagnostic:{shop:"mercadona",source,warehouse:warehouse||null,productId:id}}:null;
    }catch{return null;}
  };
  const apiFetch=async(url,source,warehouse="")=>{
    try{return await parseResponse(await fetchWithTimeout(url,{redirect:"follow",headers:mercadonaRequestHeaders(productUrl,version)},3800),source,warehouse);}catch{return null;}
  };

  const commonWh=["mad1","mad3","vlc1","bcn1","svq1","alc1","3842"];
  const directPromise=Promise.all([
    apiFetch(`${base}/api/products/${encodeURIComponent(id)}/`,"api-no-wh"),
    apiFetch(`${base}/api/v1_1/products/${encodeURIComponent(id)}`,"v1_1-no-wh")
  ]);
  const warehousePromise=resolveMercadonaWarehouse(warehousePc,version);
  const algoliaPromise=readMercadonaAlgolia({id,hintName,warehouses:commonWh});
  const [directResults,resolvedWh,algoliaCommon]=await Promise.all([directPromise,warehousePromise,algoliaPromise]);
  const direct=directResults.find(x=>x&&Number.isFinite(x.price)&&x.price>0);
  if(direct)return direct;

  if(algoliaCommon&&Number.isFinite(algoliaCommon.price)&&algoliaCommon.price>0){
    return {...algoliaCommon,diagnostic:{...(algoliaCommon.diagnostic||{}),postalCode:configuredPc||null,resolvedWarehouse:resolvedWh||null}};
  }

  const whCandidates=[...new Set([resolvedWh,...commonWh].filter(Boolean))].slice(0,4);
  const whResults=(await Promise.all(whCandidates.flatMap(wh=>[
    apiFetch(`${base}/api/products/${encodeURIComponent(id)}/?lang=es&wh=${encodeURIComponent(wh)}`,"api",wh),
    apiFetch(`${base}/api/v1_1/products/${encodeURIComponent(id)}?lang=es&wh=${encodeURIComponent(wh)}`,"v1_1",wh)
  ]))).filter(Boolean);
  const priced=whResults.find(x=>Number.isFinite(x.price)&&x.price>0);
  if(priced)return priced;

  const algoliaExact=await readMercadonaAlgolia({id,hintName,warehouses:[...new Set([resolvedWh,...commonWh])].filter(Boolean)});
  if(algoliaExact&&Number.isFinite(algoliaExact.price)&&algoliaExact.price>0)return algoliaExact;

  return {
    name:String(hintName||"").trim(),image:"",price:null,currency:"EUR",
    message:`Mercadona no ha devuelto un precio válido para el producto ${id}. El enlace sigue siendo una ficha válida, pero no se ha localizado el artículo en el almacén de catálogo consultado. Revisa el código postal de Mercadona en Configuración → Contenido → Supermercados.`,
    diagnostic:{shop:"mercadona",productId:id,priceFound:false,postalCode:configuredPc,warehousePostalCode:warehousePc,resolvedWarehouse:resolvedWh||null,warehousesTried:[...new Set([resolvedWh,...commonWh])].filter(Boolean)}
  };
}

function mergeMercadonaProductParts(a,b){
  return {
    name:firstText(b?.name,a?.name),
    image:firstText(b?.image,a?.image),
    price:Number.isFinite(b?.price)&&b.price>0?b.price:(Number.isFinite(a?.price)&&a.price>0?a.price:null),
    currency:"EUR"
  };
}

function productFromMercadonaObject(data = {}) {
  const product = findProductObject(data) || data;
  const price = toNumber(
    product?.price_instructions?.unit_price ??
    product?.price_instructions?.bulk_price ??
    product?.price_instructions?.reference_price ??
    product?.unit_price ??
    product?.price
  );
  const photos = Array.isArray(product?.photos) ? product.photos : [];
  const firstPhoto = photos.find(Boolean) || {};
  const image = firstText(
    firstPhoto?.regular,
    firstPhoto?.zoom,
    firstPhoto?.thumbnail,
    product?.thumbnail,
    product?.image_url,
    Array.isArray(product?.image) ? product.image[0] : product?.image?.url || product?.image
  );
  const name = firstText(product?.display_name, product?.name, product?.details?.description, product?.title);
  return {name,image,price,currency:"EUR"};
}

async function readHiperdino(productUrl,{hintName="",postalCode=""}={}) {
  // HiperDino sirve catálogo HTML. Una URL guardada puede apuntar a una página
  // donde el producto ya haya cambiado de página/orden, así que consultamos en
  // paralelo: URL original + búsqueda Magento global + búsqueda bajo la vista
  // de tienda (c95xx...). Esto evita la cadena secuencial que podía superar el
  // timeout del móvil y hacía que todos los productos apareciesen como error.
  const urls=[productUrl.href];
  if(usefulHiperdinoHint(hintName)){
    const q=String(hintName).trim();
    const firstSegment=productUrl.pathname.split('/').filter(Boolean)[0]||'';
    const globalSearch=new URL('/catalogsearch/result/',productUrl.origin);globalSearch.searchParams.set('q',q);urls.push(globalSearch.href);
    if(/^c\d+/i.test(firstSegment)){
      const scoped=new URL(`/${firstSegment}/catalogsearch/result/`,productUrl.origin);scoped.searchParams.set('q',q);urls.push(scoped.href);
    }
  }
  const unique=[...new Set(urls)];
  const attempts=await Promise.all(unique.map(url=>fetchHiperdinoCandidate(url,productUrl,hintName)));
  const good=attempts.filter(Boolean);
  // Nunca aceptamos el primer precio de la página: una categoría contiene
  // decenas de productos. Solo devolvemos un precio cuyo nombre coincida de
  // forma suficiente con el artículo guardado. Esto evita, por ejemplo, usar
  // el precio de croquetas de bacalao al actualizar las de jamón.
  const ranked=good.map(item=>({...item,__score:scoreHiperdinoName(item?.name||"",hintName)}))
    .sort((a,b)=>b.__score-a.__score);
  const exact=ranked.find(x=>x.__score>=0.72&&Number.isFinite(x.price)&&x.price>0);
  const configuredPc=/^\d{5}$/.test(String(postalCode||"").trim())?String(postalCode).trim():"";
  if(exact){const {__score,...result}=exact;return {...result,message:"",diagnostic:{shop:"hiperdino",matchScore:__score,priceFound:true,postalCode:configuredPc||null}};}
  const partial=ranked.find(x=>x.__score>=0.72);
  if(partial){const {__score,...result}=partial;return {...result,price:null,currency:"EUR",message:`HiperDino ha encontrado el producto, pero no ha podido asociar un precio válido a esa ficha. Revisa el enlace guardado o abre el producto para comprobar si sigue disponible.`,diagnostic:{shop:"hiperdino",matchScore:__score,priceFound:false,postalCode:configuredPc||null}};}
  return {name:String(hintName||""),image:"",price:null,currency:"EUR",message:`HiperDino no ha encontrado una coincidencia suficiente para «${String(hintName||"Producto")}». Revisa o sustituye el enlace del producto.`,diagnostic:{shop:"hiperdino",matchScore:0,priceFound:false,postalCode:configuredPc||null}};
}

async function fetchHiperdinoCandidate(rawUrl,originalUrl,hintName){
  try{
    const response=await fetchWithTimeout(rawUrl,{redirect:"follow",headers:{
      "Accept":"text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language":"es-ES,es;q=0.9,en;q=0.7",
      "Cache-Control":"no-cache",
      "Referer":originalUrl.href,
      "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36"
    }},6500);
    if(!response.ok)return null;
    const contentType=response.headers.get("content-type")||"";
    if(contentType.includes("application/json"))return productFromJson(await response.json());
    const html=await response.text();
    const parsed=extractHiperdinoProductFromHtml(html,new URL(rawUrl),hintName);
    const textFallback=hiperdinoProductFromTextWindow(html,hintName||parsed?.name||"",new URL(rawUrl).origin);
    const candidates=[parsed,textFallback].filter(Boolean).map(item=>({item,score:scoreHiperdinoName(item?.name||"",hintName)}));
    candidates.sort((a,b)=>b.score-a.score || ((Number.isFinite(b.item?.price)&&b.item.price>0)?1:0)-((Number.isFinite(a.item?.price)&&a.item.price>0)?1:0));
    const priced=candidates.find(x=>x.score>=0.72&&Number.isFinite(x.item?.price)&&x.item.price>0);
    if(priced)return priced.item;
    const best=candidates.find(x=>x.score>=0.72);
    return best?.item||null;
  }catch{return null;}
}

function mergeHiperdinoProductParts(a,b){
  return {
    name:firstText(b?.name,a?.name),
    image:firstText(b?.image,a?.image),
    price:Number.isFinite(b?.price)&&b.price>0?b.price:(Number.isFinite(a?.price)&&a.price>0?a.price:null),
    currency:"EUR"
  };
}

export function extractHiperdinoProductFromHtml(html = "", rawUrl = "", hintName = "") {
  let productUrl;
  try { productUrl = rawUrl instanceof URL ? rawUrl : new URL(rawUrl); } catch { productUrl = new URL("https://www.hiperdino.es/"); }
  const targetSlug = decodeURIComponent(String(productUrl.hash || "").replace(/^#/, "")).trim();
  const slugName = targetSlug ? hiperdinoNameFromSlug(targetSlug) : "";
  const cleanedHint = usefulHiperdinoHint(hintName) ? String(hintName).trim() : "";
  const targetName = cleanedHint || slugName;
  if (!targetSlug && !targetName) return null;

  // Algunas páginas incluyen el catálogo completo en JSON. Buscamos el
  // objeto que coincida con el ancla/nombre elegido, no el primer producto.
  const scripts = String(html).match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const openTag = script.match(/^<script\b[^>]*>/i)?.[0] || "";
    const attrs = parseAttributes(openTag);
    const type = String(attrs.type || "").toLowerCase();
    if (type && !type.includes("json")) continue;
    const body = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    if (!body || (!body.startsWith("{") && !body.startsWith("["))) continue;
    try {
      const object = findMatchingHiperdinoObject(JSON.parse(body), targetSlug, targetName);
      if (object) {
        const parsed = productFromObject(object);
        if (parsed.name || Number.isFinite(parsed.price)) return parsed;
      }
    } catch {
      // Seguimos con el HTML de la tarjeta.
    }
  }

  // Camino clásico: algunas URLs de HiperDino incluyen un ancla que también
  // aparece como id/slug dentro de la tarjeta del producto.
  if (targetSlug) {
    const lower = String(html).toLowerCase();
    const needle = targetSlug.toLowerCase();
    const indexes = [];
    let cursor = 0;
    while ((cursor = lower.indexOf(needle, cursor)) >= 0) { indexes.push(cursor); cursor += needle.length; if (indexes.length >= 12) break; }
    for (const index of indexes) {
      const segment = hiperdinoProductSegment(String(html), index, needle);
      const parsed = hiperdinoProductFromSegment(segment, productUrl.origin, targetName);
      if (parsed && (parsed.name || Number.isFinite(parsed.price))) return parsed;
    }
  }

  // HiperDino ya no garantiza que el ancla de la URL se copie como id HTML.
  // En ese caso elegimos la tarjeta por el nombre visible (tolerando acentos,
  // marca, plural/singular y pequeños cambios de formato) y extraemos SU precio.
  const byName = findHiperdinoProductCardByName(String(html), targetName || slugName, productUrl.origin);
  if (byName) return byName;

  // Incluso si HiperDino cambia el marcado, el enlace/nombre sigue siendo útil.
  // No inventamos un precio: conservamos el anterior hasta una lectura válida.
  return { name:targetName || slugName, image:"", price:null, currency:"EUR" };
}

function usefulHiperdinoHint(value="") {
  const text=String(value||"").trim();
  return Boolean(text) && !/(producto\s+hiperdino|producto\s+pendiente|resultados?\s+de\s+b[uú]squeda)/i.test(text);
}

function hiperdinoProductFromSegment(segment, origin, fallbackName="") {
  const name = firstText(
    getAttributeValue(segment, "data-product-name"),
    extractClassText(segment, "product-item-link"),
    extractClassText(segment, "product-item-name"),
    extractClassText(segment, "product-name"),
    getImageAlt(segment),
    fallbackName
  );
  const price = extractHiperdinoPrice(segment);
  const image = extractHiperdinoImage(segment, origin);
  return { name, image, price, currency:"EUR" };
}

function hiperdinoComparableTokens(value="") {
  const stop=new Set(["hiperdino","superdino","de","del","la","el","los","las","con","sin","y","o","para","g","gr","kg","ml","l","ud","uds"]);
  return normalizeProductText(value).split(" ").filter(token=>token && !stop.has(token));
}

function findHiperdinoProductCardByName(html, targetName, origin) {
  const targetTokens=hiperdinoComparableTokens(targetName);
  if(!targetTokens.length)return null;
  const candidates=[];
  const patterns=[
    /<li\b[^>]*class=["'][^"']*(?:product|item)[^"']*["'][^>]*>[\s\S]{0,35000}?<\/li>/gi,
    /<article\b[^>]*class=["'][^"']*(?:product|item)[^"']*["'][^>]*>[\s\S]{0,35000}?<\/article>/gi,
    /<div\b[^>]*class=["'][^"']*product-item-info[^"']*["'][^>]*>[\s\S]{0,30000}?<\/div>/gi
  ];
  for(const pattern of patterns){
    for(const match of String(html).matchAll(pattern)){
      const segment=match[0];
      const visible=normalizeProductText(decodeHtml(segment.replace(/<[^>]+>/g," ")));
      const matched=targetTokens.filter(token=>visible.includes(token)).length;
      if(!matched)continue;
      const score=matched/targetTokens.length;
      const numericTokens=targetTokens.filter(token=>/^\d+$/.test(token));
      const numericOk=!numericTokens.length||numericTokens.every(token=>new RegExp(`\\b${token}\\b`).test(visible));
      if(score>=0.72&&numericOk)candidates.push({segment,score,matched});
    }
  }
  candidates.sort((a,b)=>b.score-a.score||b.matched-a.matched||a.segment.length-b.segment.length);
  if(!candidates.length)return null;
  const parsed=hiperdinoProductFromSegment(candidates[0].segment,origin,targetName);
  return (parsed.name||Number.isFinite(parsed.price))?parsed:null;
}

function hiperdinoVisibleText(html="") {
  return decodeHtml(String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ")
    .trim());
}

function scoreHiperdinoName(candidate="",target=""){
  const targetTokens=hiperdinoComparableTokens(target);
  if(!targetTokens.length)return 0;
  const hay=normalizeProductText(candidate);
  const matched=targetTokens.filter(token=>new RegExp(`(?:^| )${token}(?: |$)`).test(hay)).length;
  const numeric=targetTokens.filter(token=>/^\d+$/.test(token));
  if(numeric.length&&!numeric.every(token=>new RegExp(`(?:^| )${token}(?: |$)`).test(hay)))return 0;
  return matched/targetTokens.length;
}

function findHiperdinoImageByAlt(html,targetName,origin){
  let best="",bestScore=0;
  for(const tag of String(html).match(/<img\b[^>]*>/gi)||[]){
    const attrs=parseAttributes(tag);const alt=decodeHtml(attrs.alt||attrs.title||"");
    const score=scoreHiperdinoName(alt,targetName);if(score<0.70||score<bestScore)continue;
    const candidates=[attrs["data-src"],attrs["data-original"],attrs["data-lazy-src"],firstSrcsetUrl(attrs["data-srcset"]),firstSrcsetUrl(attrs.srcset),attrs.src];
    for(const candidate of candidates){const raw=decodeHtml(candidate||"").trim();if(!usefulRemoteImageCandidate(raw))continue;try{best=new URL(raw,origin).href;}catch{best=raw;}bestScore=score;break;}
  }
  return best;
}

function hiperdinoProductFromTextWindow(html,targetName,origin){
  const target=String(targetName||"").trim();if(!usefulHiperdinoHint(target))return null;
  const text=hiperdinoVisibleText(html);if(!text)return null;
  const targetTokens=hiperdinoComparableTokens(target);if(!targetTokens.length)return null;
  const lower=text.toLocaleLowerCase("es");
  const anchor=targetTokens.find(token=>token.length>=4&&!/^\d+$/.test(token))||targetTokens[0];
  let cursor=0,best=null,bestScore=0;
  while((cursor=lower.indexOf(anchor,cursor))>=0){
    // El precio válido debe aparecer DESPUÉS del nombre del producto. Mirar
    // hacia atrás podía capturar el precio de la tarjeta anterior.
    const start=cursor,end=Math.min(text.length,cursor+720),window=text.slice(start,end);
    const score=scoreHiperdinoName(window,target);
    if(score>=0.72&&score>=bestScore){
      const money=[...window.matchAll(/(\d{1,4}(?:[. ]\d{3})*[,.]\d{1,2})\s*€(?:\s*\/\s*(?:kg|l|ud\.?))?/gi)]
        .map(m=>({index:m.index??0,value:toNumber(m[1])})).filter(x=>Number.isFinite(x.value)&&x.value>0&&x.value<10000);
      if(money.length){best={name:target,image:findHiperdinoImageByAlt(html,target,origin),price:money[0].value,currency:"EUR"};bestScore=score;}
    }
    cursor+=anchor.length;
    if(cursor>text.length||cursor>200000)break;
  }
  return best;
}

function hiperdinoNameFromSlug(slug = "") {
  const words = String(slug).replace(/^hiperdino-/i, "HiperDino-").split("-").filter(Boolean);
  if (!words.length) return "";
  const text = words.join(" ").replace(/\bgr\b/gi, "g").replace(/\bud\b/gi, "ud");
  return text.replace(/^hiperdino\b/i, "HiperDino");
}

function normalizeProductText(value = "") {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findMatchingHiperdinoObject(value, targetSlug, targetName) {
  let best = null;
  let bestScore = 0;
  const target = normalizeProductText(targetName || targetSlug);
  const walk = node => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const item of node) walk(item); return; }
    const name = firstText(node.name, node.display_name, node.title, node.product_name, node.label);
    const locator = firstText(node.url_key, node.url, node.link, node.id, node.sku, node.slug);
    const normalizedName = normalizeProductText(name);
    const normalizedLocator = normalizeProductText(locator);
    let score = 0;
    if (targetSlug && String(locator).toLowerCase().includes(String(targetSlug).toLowerCase())) score += 12;
    if (normalizedName && normalizedName === target) score += 10;
    if (normalizedName && target && (normalizedName.includes(target) || target.includes(normalizedName))) score += 7;
    if (normalizedLocator && target && normalizedLocator.includes(target)) score += 6;
    const parsed = productFromObject(node);
    if (score > bestScore && (parsed.name || Number.isFinite(parsed.price))) { best = node; bestScore = score; }
    for (const child of Object.values(node)) if (child && typeof child === "object") walk(child);
  };
  walk(value);
  return bestScore >= 6 ? best : null;
}

function productFromObject(product = {}) {
  const offers = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const priceInfo = product?.price_info || product?.priceInfo || product?.price_instructions || {};
  const price = toNumber(firstText(
    priceInfo?.final_price, priceInfo?.finalPrice, priceInfo?.unit_price,
    offers?.price, offers?.lowPrice, offers?.priceSpecification?.price,
    product?.final_price, product?.finalPrice, product?.special_price, product?.price
  ));
  const imageValue = product?.image;
  return {
    name:firstText(product?.display_name, product?.name, product?.product_name, product?.title),
    image:firstText(product?.small_image?.url, product?.thumbnail?.url, product?.image_url, Array.isArray(imageValue)?imageValue[0]:imageValue?.url||imageValue),
    price,
    currency:firstText(offers?.priceCurrency, product?.currency, "EUR")
  };
}

function hiperdinoProductSegment(html, index, needle) {
  const lower = html.toLowerCase();
  const liStart = lower.lastIndexOf("<li", index);
  const articleStart = lower.lastIndexOf("<article", index);
  const divStart = lower.lastIndexOf("<div", index);
  let start = liStart >= 0 && index - liStart < 20000 ? liStart
    : articleStart >= 0 && index - articleStart < 20000 ? articleStart
    : divStart >= 0 && index - divStart < 12000 ? divStart
    : Math.max(0, index - 1500);
  const closingTag = start === liStart ? "</li>" : start === articleStart ? "</article>" : "</div>";
  const close = lower.indexOf(closingTag, index);
  const nextTarget = Math.min(...[lower.indexOf(`id=\"${needle}`, index + needle.length), lower.indexOf(`id='${needle}`, index + needle.length)].filter(x => x > index));
  let end = close > index && close - index < 30000 ? close + closingTag.length : Math.min(html.length, index + 12000);
  if (Number.isFinite(nextTarget) && nextTarget > index && nextTarget < end) end = nextTarget;
  return html.slice(start, end);
}

function getAttributeValue(html, attribute) {
  const match = String(html).match(new RegExp(`${attribute}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')`, "i"));
  return decodeHtml(match?.[1] ?? match?.[2] ?? "");
}

function extractClassText(html, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(html).match(new RegExp(`<[^>]+class=[\"'][^\"']*${escaped}[^\"']*[\"'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
  return match ? decodeHtml(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) : "";
}

function getImageAlt(html) {
  const match = String(html).match(/<img\b[^>]*\balt\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/i);
  return decodeHtml(match?.[1] ?? match?.[2] ?? "");
}

function extractHiperdinoPrice(segment) {
  const special = extractClassText(segment, "special-price");
  const specialMoney = special.match(/\d{1,5}(?:[. ]\d{3})*[,.]\d{1,2}/)?.[0];
  const specialValue = toNumber(specialMoney);
  if (Number.isFinite(specialValue) && specialValue > 0) return specialValue;
  const preferred = [
    /data-price-amount\s*=\s*(?:"([^"]+)"|'([^']+)')/i,
    /data-price\s*=\s*(?:"([^"]+)"|'([^']+)')/i,
    /"finalPrice"\s*:\s*(?:\{[^{}]*"amount"\s*:\s*)?"?(\d+(?:[.,]\d+)?)"?/i,
    /"final_price"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/i,
    /"special_price"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/i
  ];
  for (const regex of preferred) {
    const match = String(segment).match(regex);
    const value = toNumber(match?.[1] ?? match?.[2]);
    if (Number.isFinite(value) && value > 0 && value < 10000) return value;
  }
  const priceText = extractClassText(segment, "price");
  const priceMoney = priceText.match(/\d{1,5}(?:[. ]\d{3})*[,.]\d{1,2}/)?.[0];
  const priceValue = toNumber(priceMoney);
  if (Number.isFinite(priceValue) && priceValue > 0) return priceValue;
  const values = [...String(segment).matchAll(/(\d{1,5}(?:[. ]\d{3})*[,.]\d{1,2})\s*(?:€|EUR|€\s*\/\s*kg)/gi)]
    .map(match => toNumber(match[1])).filter(value => Number.isFinite(value) && value > 0 && value < 10000);
  return values[0] ?? null;
}

function extractHiperdinoImage(segment, origin) {
  const tags = String(segment).match(/<(?:img|source)\b[^>]*>/gi) || [];
  const candidates = [];
  for (const tag of tags) {
    const attrs = parseAttributes(tag);
    const values = [
      attrs["data-src"], attrs["data-original"], attrs["data-lazy-src"],
      firstSrcsetUrl(attrs["data-srcset"]), firstSrcsetUrl(attrs.srcset), attrs.src
    ];
    for (const value of values) {
      const raw = decodeHtml(value || "").trim();
      if (!usefulRemoteImageCandidate(raw)) continue;
      try { candidates.push(new URL(raw, origin).href); } catch { candidates.push(raw); }
    }
  }
  return candidates[0] || "";
}

function firstSrcsetUrl(value = "") {
  return String(value).split(",").map(part => part.trim().split(/\s+/)[0]).find(Boolean) || "";
}

function usefulRemoteImageCandidate(value = "") {
  const raw = String(value).trim();
  if (!raw || /^(?:data:|blob:|javascript:)/i.test(raw)) return false;
  if (/(?:placeholder|spacer|transparent|loader|loading|lazy-placeholder|blank\.(?:gif|png)|pixel\.(?:gif|png))/i.test(raw)) return false;
  return /(?:\.(?:avif|webp|png|jpe?g|gif|svg)(?:[?#]|$)|\/media\/|\/catalog\/product\/|image)/i.test(raw);
}

function productFromHtml(html) {
  const structured = findStructuredProduct(html);
  const offers = Array.isArray(structured?.offers) ? structured.offers[0] : structured?.offers;
  const name = firstText(structured?.name, getMeta(html, "og:title"), getMeta(html, "twitter:title"), extractTagText(html, "h1"), extractTagText(html, "title"));
  const imageValue = structured?.image;
  const image = firstText(Array.isArray(imageValue) ? imageValue[0] : imageValue?.url || imageValue, getMeta(html, "og:image"), getMeta(html, "twitter:image"));
  const price = toNumber(firstText(offers?.price, offers?.lowPrice, offers?.highPrice, offers?.priceSpecification?.price, getMeta(html, "product:price:amount"), getMeta(html, "price"), getItemPropContent(html, "price")));
  const currency = firstText(offers?.priceCurrency, getMeta(html, "product:price:currency"), "EUR");
  if (!name && !Number.isFinite(price)) throw new ApiError(404, "La página no publica el nombre o el precio de forma legible. Este producto tendrá que mantenerse manualmente.");
  return { name, image, price, currency };
}

async function readGenericProduct(productUrl) {
  const response = await fetchWithTimeout(productUrl, {
    redirect: "follow",
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.7",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new ApiError(502, `La tienda respondió con HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return productFromJson(await response.json());
  }

  const html = await response.text();
  return productFromHtml(html);
}

function productFromJson(data) {
  const product = findProductObject(data) || data;
  const offers = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  return {
    name: firstText(product?.display_name, product?.name, product?.title),
    image: firstText(
      product?.photos?.[0]?.regular,
      product?.photos?.[0]?.zoom,
      Array.isArray(product?.image) ? product.image[0] : product?.image?.url || product?.image
    ),
    price: toNumber(
      product?.price_instructions?.unit_price ??
      offers?.price ??
      offers?.lowPrice ??
      product?.price
    ),
    currency: firstText(offers?.priceCurrency, product?.currency, "EUR")
  };
}

function findStructuredProduct(html) {
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const openTag = script.match(/^<script\b[^>]*>/i)?.[0] || "";
    const attrs = parseAttributes(openTag);
    if ((attrs.type || "").toLowerCase() !== "application/ld+json") continue;

    const body = script
      .replace(/^<script\b[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();

    try {
      const found = findProductObject(JSON.parse(body));
      if (found) return found;
    } catch {
      // Algunas tiendas publican JSON-LD inválido; seguimos con metadatos.
    }
  }
  return null;
}

function findProductObject(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProductObject(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const type = value["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findProductObject(child);
    if (found) return found;
  }
  return null;
}

function getMeta(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const wanted = key.toLowerCase();

  for (const tag of tags) {
    const attrs = parseAttributes(tag);
    const identifier = String(attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (identifier === wanted && attrs.content) return decodeHtml(attrs.content);
  }
  return "";
}

function getItemPropContent(html, key) {
  const tags = html.match(/<[^>]+itemprop\s*=\s*["'][^"']+["'][^>]*>/gi) || [];
  const wanted = key.toLowerCase();

  for (const tag of tags) {
    const attrs = parseAttributes(tag);
    if (String(attrs.itemprop || "").toLowerCase() === wanted) {
      return decodeHtml(attrs.content || attrs.value || "");
    }
  }
  return "";
}

function parseAttributes(tag) {
  const attrs = {};
  const regex = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = regex.exec(tag))) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function extractTagText(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  if (!match) return "";
  return decodeHtml(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError(504, "La tienda tardó demasiado en responder.");
    }
    throw new ApiError(502, `No se pudo abrir la página: ${error?.message || error}`);
  } finally {
    clearTimeout(timer);
  }
}

function firstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === undefined || value === null || value === "") return null;

  let clean = String(value).trim().replace(/[^0-9,.-]/g, "");
  if (clean.includes(",") && clean.includes(".")) {
    clean = clean.lastIndexOf(",") > clean.lastIndexOf(".")
      ? clean.replace(/\./g, "").replace(",", ".")
      : clean.replace(/,/g, "");
  } else {
    clean = clean.replace(",", ".");
  }

  const number = Number.parseFloat(clean);
  return Number.isFinite(number) ? number : null;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}


async function proxyProductImage(rawProductUrl, hintName="") {
  if (!rawProductUrl) throw new ApiError(400, "Falta la URL del producto.");
  let productUrl;
  try { productUrl = new URL(rawProductUrl); } catch { throw new ApiError(400, "URL de producto no válida."); }
  if (!['http:', 'https:'].includes(productUrl.protocol) || !isAllowedShop(productUrl.hostname)) {
    throw new ApiError(403, "La URL del producto no pertenece a una tienda autorizada.");
  }
  const product = await readProductFromUrl(productUrl,{hintName});
  if (!product?.image) throw new ApiError(404, "La tienda no ha publicado una imagen utilizable para este producto.");
  return streamRemoteImage(product.image, productUrl, {cacheSeconds:21600});
}

async function proxyImage(rawUrl){
  if(!rawUrl)throw new ApiError(400,"Falta la URL de la imagen.");
  let url;try{url=new URL(rawUrl);}catch{throw new ApiError(400,"URL de imagen no válida.");}
  const host=url.hostname.toLowerCase();
  const allowed=["mercadona.es","imgix.net","hiperdino.es","carrefour.es","dia.es","eroski.es","alcampo.es","elcorteingles.es","lidl.es","aldi.es","spargrancanaria.es"].some(d=>host===d||host.endsWith(`.${d}`));
  if(!allowed)throw new ApiError(403,"Dominio de imagen no autorizado.");
  return streamRemoteImage(url.href, url, {cacheSeconds:21600});
}

async function streamRemoteImage(rawImageUrl, sourceUrl, {cacheSeconds=21600}={}) {
  let imageUrl;
  try { imageUrl = new URL(rawImageUrl, sourceUrl?.origin || undefined); } catch { throw new ApiError(400, "La tienda ha devuelto una URL de imagen no válida."); }
  if (!safePublicHttpUrl(imageUrl)) throw new ApiError(403, "La URL de imagen no es segura.");
  const isMercadonaAsset=isMercadona(sourceUrl.hostname)||isMercadona(imageUrl.hostname)||/imgix\.net$/i.test(imageUrl.hostname);
  const isHiperdinoAsset=isHiperdino(sourceUrl.hostname)||isHiperdino(imageUrl.hostname);
  const referer = isMercadonaAsset
    ? "https://tienda.mercadona.es/"
    : isHiperdinoAsset
      ? "https://www.hiperdino.es/"
      : `${sourceUrl.origin}/`;
  const requestOrigin = isMercadonaAsset
    ? "https://tienda.mercadona.es"
    : isHiperdinoAsset
      ? "https://www.hiperdino.es"
      : sourceUrl.origin;
  const response=await fetchWithTimeout(imageUrl,{redirect:"follow",headers:{
    Accept:"image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language":"es-ES,es;q=0.9,en;q=0.7",
    Referer:referer,
    Origin:requestOrigin,
    "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36 MFEViajes/2.1.21"
  }});
  if(!response.ok)throw new ApiError(502,`La imagen respondió con HTTP ${response.status}.`);
  const contentType=response.headers.get("content-type")||"";
  if(!contentType.toLowerCase().startsWith("image/"))throw new ApiError(415,"El enlace no devuelve una imagen.");
  const headers=new Headers(CORS_HEADERS);
  headers.set("Content-Type",contentType);
  headers.set("Cache-Control",`public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`);
  const length=response.headers.get("content-length");if(length)headers.set("Content-Length",length);
  return new Response(response.body,{status:200,headers});
}

function safePublicHttpUrl(url) {
  if (!url || !['http:', 'https:'].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return false;
  if (/^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return false;
  return true;
}

async function fuelResponse(){
  const url="https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/";
  const response=await fetchWithTimeout(url,{headers:{Accept:"application/json","User-Agent":"MFEViajes/2.1.21"}});if(!response.ok)throw new ApiError(502,`Fuente oficial respondió ${response.status}.`);const data=await response.json();const rows=data.ListaEESSPrecio||data.listaEESSPrecio||[];const stations=rows.map(r=>{const island=String(r["Isla"]||r.isla||"").toUpperCase();const province=String(r["Provincia"]||r.provincia||"").toUpperCase();const latitude=toNumber(String(r["Latitud"]||r.latitud||"").replace(',','.'));const longitude=toNumber(String(r["Longitud (WGS84)"]||r.longitud||"").replace(',','.'));if(island&&!island.includes("GRAN CANARIA"))return null;if(!island){if(!province.includes("PALMAS"))return null;const insideGranCanaria=Number.isFinite(latitude)&&Number.isFinite(longitude)&&latitude>=27.70&&latitude<=28.25&&longitude>=-15.90&&longitude<=-15.25;if(!insideGranCanaria)return null;}const price=toNumber(r["Precio Gasolina 95 E5"]||r["Precio Gasolina 95 E10"]||r.precioGasolina95E5);if(!Number.isFinite(price)||price<=0)return null;return{name:firstText(r["Rótulo"],r.rotulo,"Gasolinera"),municipality:firstText(r["Municipio"],r.municipio),address:firstText(r["Dirección"],r.direccion),hours:firstText(r["Horario"],r.horario),price,latitude,longitude};}).filter(Boolean).sort((a,b)=>a.price-b.price);return json({ok:true,stations,updatedAt:data.Fecha||new Date().toISOString()});
}
)}),page.locator('[role=\"gridcell\"]').getByText(String(Number(d)),{exact:true})],'fecha '+date);\n    }\n    await clickAny(page,[page.getByText('Pasajeros',{exact:true}),page.getByText('Selecciona los pasajeros',{exact:false})],'pasajeros');\n    for(let i=1;i<adults;i++){\n      const adultRow=page.getByText(/Adulto/i).first().locator('xpath=..');\n      if(!await clickAny(page,[adultRow.getByRole('button',{name:/a[ñn]adir|plus|add|increment|\\+/i}),page.getByRole('button',{name:/a[ñn]adir adulto/i})],'adulto '+(i+1),{required:false}))throw new Error('Binter: no se pudo confirmar la selección de '+adults+' adultos.');\n    }\n    await clickAny(page,[page.getByRole('button',{name:/^buscar$/i})],'buscar');\n    await page.waitForTimeout(6500);\n    diagnostics.url=page.url();\n    const body=await page.locator('body').innerText();\n    const norm=clean(body).toLowerCase();\n    if(/acceso denegado|captcha|verify you are human/i.test(norm))throw new Error('Binter requiere verificación humana.');\n    if(!/fuerteventura/i.test(body)||!/gran canaria/i.test(body))throw new Error('Binter no confirmó el trayecto solicitado.');\n    const euros=[...body.matchAll(/(?:total(?:\\s+(?:a pagar|del viaje|de la reserva|importe))?)[^\\d€]{0,24}([\\d.,]+)\\s*€/gi)]\n       .map(m=>money(m[1])).filter(v=>v>0&&v<20000);\n    const explicitFive=new RegExp('(?:'+adults+'\\\\s*(?:adultos|pasajeros|viajeros)|(?:adultos|pasajeros|viajeros)\\\\s*:?\\\\s*'+adults+')','i').test(body);\n    if(!explicitFive||!euros.length)throw new Error('Binter no muestra un TOTAL verificable para '+adults+' adultos; no se registra un precio parcial.');\n    const total=euros.at(-1);\n    await snapshot(page,'binter/00-precio').catch(()=>{});\n    return {ok:true,status:'ok',price:total,total,origin:cfg.origin||'LPA',destination:cfg.destination||'FUE',date,adults,resident:cfg.resident===true,source:'Binter · total web verificado',url:page.url(),diagnostics:{steps:diagnostics.steps}};\n  }finally{await context.close();}\n}\nlet browser;\ntry{\n  browser=await chromium.launch({headless:true,args:['--disable-blink-features=AutomationControlled']});\n  const result=await scan(browser);\n  await postResult('binter-stage2',{...result,stageId:'week-2',queryIdentity:identity,checkedAt:isoNow()});\n  console.log('[binter] OK '+JSON.stringify({price:result.price,date,adults}));\n}catch(e){\n  console.error('[binter] ERROR '+e.message);\n  await fs.mkdir(path.resolve('artifacts/binter'),{recursive:true}).catch(()=>{});\n  await fs.writeFile(path.resolve('artifacts/binter/diagnostics.json'),JSON.stringify({message:e.message,...diagnostics},null,2)).catch(()=>{});\n  await postResult('binter-stage2',{ok:false,status:'error',checkedAt:isoNow(),stageId:'week-2',queryIdentity:identity,error:String(e.message)}).catch(()=>{});\n  process.exitCode=1;\n}finally{await browser?.close();}\n";
const BINTER_STAGE2_WORKFLOW_TEMPLATE = "name: Binter · Gran Canaria a Fuerteventura · etapa 2\non:\n  schedule:\n    - cron: '55 6 * * *'\n      timezone: 'Europe/Madrid'\n  workflow_dispatch:\n    inputs:\n      force:\n        type: boolean\n        default: true\n        required: false\npermissions:\n  contents: read\nconcurrency:\n  group: binter-stage2\n  cancel-in-progress: false\njobs:\n  monitor:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 15\n    defaults:\n      run:\n        working-directory: monitoring\n    env:\n      MFE_WORKER_URL: ${{ secrets.MFE_WORKER_URL }}\n      MFE_MONITOR_SECRET: ${{ secrets.MFE_MONITOR_SECRET }}\n      MFE_FORCE_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.force || false }}\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n          cache: npm\n          cache-dependency-path: monitoring/package-lock.json\n      - run: npm ci\n      - run: npx playwright install --with-deps chromium\n      - run: node binter-stage2-run.mjs\n      - name: Diagnóstico si falla\n        if: failure()\n        uses: actions/upload-artifact@v4\n        with:\n          name: binter-stage2-diagnostico\n          path: monitoring/artifacts/binter/\n          if-no-files-found: ignore\n          retention-days: 7\n";

const AUTOREISEN_INSTALL_FILES = {
  "monitoring/lib.mjs": AUTOREISEN_FILE_0,
  "monitoring/monitor.mjs": AUTOREISEN_FILE_1,
  "monitoring/autoreisen.mjs": AUTOREISEN_FILE_2,
  "monitoring/package.json": AUTOREISEN_FILE_3
};

const CORDIAL_FILE = "// MFE_CORDIAL_AUTOMATION_VERSION: 2.2.12\nimport {isoNow,snapshot,acceptCookies} from './lib.mjs';\n\nconst normalize=value=>String(value||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/\\s+/g,' ').trim();\nconst visible=loc=>loc.isVisible().catch(()=>false);\nasync function acceptCordialCookies(page){\n  // BeCordial abre su gestor de cookies dentro de un iframe (/cookies/manager)\n  // y lo cubre con Magnific Popup. En agosto de 2026 el iframe empezó a tardar\n  // más en estar interactivo en GitHub Actions: el overlay podía estar visible\n  // aunque todavía no hubiera ningún botón detectable. Intentamos primero el\n  // consentimiento normal y, si el panel sigue bloqueando, cerramos únicamente\n  // la capa visual conservando las cookies necesarias del sitio.\n  await acceptCookies(page).catch(()=>{});\n  const overlay='.cookiepanel-container-wrap,.popup-cookiepanel-wrapper,.mfp-wrap.cookiepanel-container-wrap,.mfp-bg';\n  const iframe='#cookie_panel_iframe, iframe[src*=\"/cookies/manager\"]';\n  const framePresent=await page.locator(iframe).count().catch(()=>0);\n  let clicked=false,forcedClose=false;\n\n  if(framePresent){\n    const frameLocator=page.frameLocator(iframe).first();\n    // Esperamos explícitamente a que el iframe haya pintado su contenido.\n    await frameLocator.locator('body').waitFor({state:'attached',timeout:8000}).catch(()=>{});\n    await page.waitForTimeout(350);\n    const labels=[/^aceptar$/i,/aceptar todas/i,/aceptar todo/i,/accept all/i,/^accept$/i,/allow all/i,/consentir/i];\n    for(const label of labels){\n      const candidates=[\n        frameLocator.getByRole('button',{name:label}).first(),\n        frameLocator.getByText(label,{exact:true}).first(),\n        frameLocator.locator('button,input[type=\"button\"],input[type=\"submit\"],a').filter({hasText:label}).first()\n      ];\n      for(const btn of candidates){\n        if(!await btn.isVisible().catch(()=>false))continue;\n        clicked=await btn.click({timeout:5000,force:true}).then(()=>true).catch(()=>false);\n        if(clicked)break;\n      }\n      if(clicked)break;\n    }\n  }\n\n  if(clicked){\n    await page.waitForTimeout(500);\n    await page.locator('.cookiepanel-container-wrap,.popup-cookiepanel-wrapper').first()\n      .waitFor({state:'hidden',timeout:5000}).catch(()=>{});\n  }\n\n  let overlayVisible=await page.locator('.cookiepanel-container-wrap,.popup-cookiepanel-wrapper').first()\n    .isVisible().catch(()=>false);\n\n  // Respaldo robusto: la captura diagnóstica del 29/08/2026 mostró el iframe\n  // presente pero sin botón accionable. El propio sitio expone RolCookies y\n  // Magnific Popup; intentamos cerrar mediante sus APIs y, como último recurso,\n  // retiramos solo la capa bloqueante del DOM. Esto no altera el formulario ni\n  // inyecta datos: únicamente permite interactuar con la página ya cargada.\n  if(overlayVisible){\n    forcedClose=await page.evaluate(()=>{\n      let changed=false;\n      try{\n        const manager=window.RolCookies?.Manager;\n        if(manager&&typeof manager.save==='function'){manager.save();changed=true;}\n      }catch{}\n      try{\n        const jq=window.jQuery||window.$;\n        if(jq?.magnificPopup&&typeof jq.magnificPopup.close==='function'){jq.magnificPopup.close();changed=true;}\n      }catch{}\n      for(const el of document.querySelectorAll('.cookiepanel-container-wrap,.popup-cookiepanel-wrapper,.mfp-wrap.cookiepanel-container-wrap,.mfp-bg')){\n        try{el.remove();changed=true;}catch{}\n      }\n      try{document.documentElement.style.overflow='';document.body.style.overflow='';document.body.style.paddingRight='';}catch{}\n      return changed;\n    }).catch(()=>false);\n    await page.waitForTimeout(300);\n    overlayVisible=await page.locator('.cookiepanel-container-wrap,.popup-cookiepanel-wrapper').first()\n      .isVisible().catch(()=>false);\n  }\n\n  if(framePresent||overlayVisible||clicked||forcedClose){\n    console.log(`[cordial] Cookies: iframe=${framePresent?'sí':'no'} · acción=${clicked?'aceptar':forcedClose?'cierre de respaldo':'no detectada'} · overlay=${overlayVisible?'visible':'cerrado'}.`);\n  }else{\n    console.log('[cordial] Cookies: sin panel bloqueante.');\n  }\n  return !overlayVisible;\n}\nconst eur=text=>{\n  const raw=String(text||'').replace(/\\u00a0/g,' ');\n  const rows=[];\n  for(const m of raw.matchAll(/([0-9]{1,3}(?:\\.[0-9]{3})*(?:,[0-9]{2})|[0-9]+(?:,[0-9]{2}))\\s*€/g)){\n    const value=Number.parseFloat(m[1].replace(/\\./g,'').replace(',','.'));if(Number.isFinite(value))rows.push(value);\n  }\n  return rows;\n};\nfunction targetMatches(row,config){\n  const room=normalize(config.targetRoom||'Classic Duplex'),rate=normalize(config.targetRate||'Club Cordial - Reserva Online'),board=normalize(config.targetBoard||'SOLO ALOJAMIENTO');\n  return (!room||normalize(row.roomType).includes(room))&&(!rate||normalize(row.rateName).includes(rate))&&(!board||normalize(row.board).includes(board));\n}\nfunction reservationOnline(row){\n  const rate=normalize(row?.rateName||''),room=normalize(row?.roomType||'');\n  return (rate.includes('reserva online')||room.includes('reserva online'))&&!rate.includes('prepago')&&!room.includes('prepago');\n}\nfunction positiveCancellation(row){\n  // «Club Cordial - Reserva Online» es la opción flexible/sin gastos. El motor\n  // ha mezclado en ocasiones el texto de cancelación de la fila Prepago anterior.\n  if(reservationOnline(row))return true;\n  const text=normalize(row?.cancellation||'');\n  if(!text)return false;\n  if(/no reembolsable|con gastos/.test(text))return false;\n  return /cancelacion gratuita|reembolsable|sin gastos|cancelacion/.test(text);\n}\nfunction normalizeCancellationLabels(rows=[]){\n  return (Array.isArray(rows)?rows:[]).map(row=>{\n    if(!row||typeof row!=='object'||!reservationOnline(row))return row;\n    const current=normalize(row.cancellation||'');\n    if(!current||/con gastos|gastos de cancelacion/.test(current))return {...row,cancellation:'Cancelación sin gastos'};\n    return row;\n  });\n}\nfunction selectTargetOption(options=[],config={}){\n  const exact=options.find(row=>targetMatches(row,config));\n  if(exact){exact.target=true;exact.targetMatch='exact';return exact;}\n  const room=normalize(config.targetRoom||'Classic Duplex');\n  const rate=normalize(config.targetRate||'Club Cordial - Reserva Online');\n  const board=normalize(config.targetBoard||'SOLO ALOJAMIENTO');\n  const candidates=[];\n  for(const row of options){\n    const rowRoom=normalize(row?.roomType),rowRate=normalize(row?.rateName),rowBoard=normalize(row?.board);\n    if(board&&!rowBoard.includes(board))continue;\n    let score=50;\n    const roomMatch=!room||rowRoom.includes(room)||rowRate.includes(room);\n    const rateMatch=!rate||rowRate.includes(rate)||rowRoom.includes(rate);\n    if(roomMatch)score+=100;\n    if(rateMatch)score+=80;\n    if(rate.includes('reserva online')&&(rowRate.includes('reserva online')||rowRoom.includes('reserva online')))score+=35;\n    if(positiveCancellation(row))score+=30;\n    if(/tarifa club cordial/.test(rowRate))score+=10;\n    if(score<150)continue;\n    candidates.push({row,score,price:Number(row?.price)||Number.POSITIVE_INFINITY});\n  }\n  candidates.sort((a,b)=>b.score-a.score||a.price-b.price);\n  const chosen=candidates[0]?.row||null;\n  if(chosen){chosen.target=true;chosen.targetMatch='inferred';}\n  return chosen;\n}\nasync function optionDiagnostics(page,pattern){\n  const rows=[];\n  const candidates=page.locator('[role=\"option\"],li,[data-id],[data-value],[data-code],[data-hotel-code],[data-destination-id]');\n  const count=Math.min(await candidates.count().catch(()=>0),250);\n  for(let i=0;i<count;i++){\n    const el=candidates.nth(i);\n    const text=String(await el.innerText().catch(()=>'' )).replace(/\\s+/g,' ').trim();\n    if(!text||!pattern.test(text))continue;\n    const attrs=await el.evaluate(node=>{\n      const out={};for(const name of ['role','value','data-id','data-value','data-code','data-hotel-code','data-destination-id','destination_id','hotel_code','hotel_codes','data-type','id','class']){const v=node.getAttribute?.(name);if(v)out[name]=v;}return out;\n    }).catch(()=>({}));\n    rows.push({text,attrs,visible:await visible(el)});\n    if(rows.length>=12)break;\n  }\n  return rows;\n}\nasync function selectAutocompleteValue(page,input,text,pattern){\n  if(!await visible(input))return false;\n  try{\n    await input.click({force:true});\n    await input.press('Control+A').catch(()=>{});\n    await input.press('Backspace').catch(()=>{});\n    await input.pressSequentially(text,{delay:35}).catch(async()=>{await input.fill(text).catch(()=>{});});\n    await page.waitForTimeout(700);\n\n    const targeted=[\n      page.locator('[role=\"option\"]').filter({hasText:pattern}),\n      page.locator('.ui-autocomplete li,.select2-results__option,.choices__item--choice,.tt-suggestion,.autocomplete-suggestion').filter({hasText:pattern}),\n      page.getByText(pattern)\n    ];\n    for(const group of targeted){\n      const count=await group.count().catch(()=>0);\n      for(let i=count-1;i>=0;i--){\n        const option=group.nth(i);\n        if(!await visible(option))continue;\n        const box=await option.boundingBox().catch(()=>null);\n        if(!box||box.width<20||box.height<10)continue;\n        if(await option.click({force:true,timeout:3000}).then(()=>true).catch(()=>false)){await page.waitForTimeout(450);return true;}\n      }\n    }\n\n    // Muchos autocompletados aceptan teclado aunque sus opciones no sean fáciles de localizar.\n    await input.press('ArrowDown').catch(()=>{});\n    await page.waitForTimeout(120);\n    await input.press('Enter').catch(()=>{});\n    await page.waitForTimeout(450);\n    return true;\n  }catch{return false;}\n}\n\nasync function selectHotelThroughUi(page,wanted){\n  const visual=page.locator('input[placeholder*=\"destino\" i],input[placeholder*=\"hotel\" i]').first();\n  const code=page.locator('input[name=\"hotel_codes\"]').first();\n  const destination=page.locator('input[name=\"destination_id\"]').first();\n  if(!await visible(visual))return false;\n  const wantedPattern=/Cordial Santa Águeda.*Perchel Beach Club/i;\n  try{\n    // v2.1.98: antes de tocar hidden inputs intentamos reproducir la selección humana real.\n    // El JS de BeCordial mantiene estado interno asociado al autocomplete y, si únicamente\n    // escribimos hotel_codes/destination_id, puede vaciar hotel_codes justo al pulsar Buscar.\n    await visual.click({force:true});\n    await visual.press('Control+A').catch(()=>{});\n    await visual.press('Backspace').catch(()=>{});\n    await visual.pressSequentially(wanted,{delay:22}).catch(async()=>{await visual.fill(wanted).catch(()=>{});});\n    await page.waitForTimeout(650);\n\n    const selector='[role=\"option\"],.ui-autocomplete li,.select2-results__option,.choices__item--choice,.tt-suggestion,.autocomplete-suggestion,[data-hotel-code],[hotel_code],[hotel_codes],[data-code]';\n    const options=page.locator(selector).filter({hasText:wantedPattern});\n    const count=Math.min(await options.count().catch(()=>0),30);\n    for(let i=count-1;i>=0;i--){\n      const option=options.nth(i);\n      if(!await visible(option))continue;\n      const text=String(await option.innerText().catch(()=>'' )).replace(/\\s+/g,' ').trim();\n      if(!wantedPattern.test(text))continue;\n      const clicked=await option.click({timeout:3500}).then(()=>true).catch(async()=>option.click({force:true,timeout:3500}).then(()=>true).catch(()=>false));\n      if(!clicked)continue;\n      await page.waitForTimeout(650);\n      const hotelCode=String(await code.inputValue().catch(()=>'' )).trim();\n      const destinationId=String(await destination.inputValue().catch(()=>'' )).trim();\n      const visualValue=String(await visual.inputValue().catch(()=>'' )).trim();\n      console.log(`[cordial] Selección real del hotel: visual=${visualValue||'—'} · destination_id=${destinationId||'—'} · hotel_codes=${hotelCode||'—'}`);\n      if(hotelCode){\n        // El elemento de hotel contiene actualmente el destination_id en su modelo interno.\n        // Si el listener rellenó hotel_codes pero no el hidden destino, recuperamos solo ese ID.\n        if(!destinationId){\n          const derived=await deriveHiddenFromRenderedOption(page,wantedPattern,'destination');\n          if(derived.value)await forceControlValue(destination,derived.value).catch(()=>false);\n        }\n        const finalDestination=String(await destination.inputValue().catch(()=>'' )).trim();\n        if(finalDestination)return true;\n      }\n    }\n\n    // Algunos widgets no exponen una opción clicable pero sí aceptan teclado.\n    await visual.press('ArrowDown').catch(()=>{});\n    await page.waitForTimeout(120);\n    await visual.press('Enter').catch(()=>{});\n    await page.waitForTimeout(650);\n    const hotelCode=String(await code.inputValue().catch(()=>'' )).trim();\n    let destinationId=String(await destination.inputValue().catch(()=>'' )).trim();\n    if(hotelCode&&!destinationId){\n      const derived=await deriveHiddenFromRenderedOption(page,wantedPattern,'destination');\n      if(derived.value){await forceControlValue(destination,derived.value).catch(()=>false);destinationId=String(await destination.inputValue().catch(()=>'' )).trim();}\n    }\n    if(hotelCode&&destinationId){\n      console.log(`[cordial] Selección real del hotel mediante teclado: visual=${String(await visual.inputValue().catch(()=>'' )).trim()||'—'} · destination_id=${destinationId} · hotel_codes=${hotelCode}`);\n      return true;\n    }\n  }catch(error){console.log(`[cordial] No se pudo completar la selección interactiva del hotel: ${error?.message||String(error)}`);}\n  return false;\n}\nasync function deriveHiddenFromRenderedOption(page,pattern,kind){\n  const info=await optionDiagnostics(page,pattern);\n  const preferred=kind==='destination'\n    ?['destination_id','data-destination-id','data-id','data-value','value','data-code']\n    :['data-hotel-code','data-code','data-value','value','data-id'];\n  for(const row of info){\n    for(const key of preferred){\n      const value=String(row.attrs?.[key]||'').trim();\n      if(value)return {value,source:`${key} de «${row.text}»`,rows:info};\n    }\n  }\n  return {value:'',source:'',rows:info};\n}\nasync function selectHotelFromNativePopup(page,wanted='Cordial Santa Águeda & Perchel Beach Club',wantedCode='AGUEDA'){\n  // El diagnóstico real de BeCordial muestra que el selector NO es un autocomplete clásico:\n  // #where_popup contiene <li class=\"hotel\" data-hotel=\"AGUEDA\">. Pulsar ese elemento es\n  // la forma más fiel de reproducir la selección humana y permite que el JS propio del motor\n  // rellene hotel_codes/destination_id y cualquier estado interno asociado.\n  const form=page.locator('#booking_process_form').first();\n  const code=form.locator('input[name=\"hotel_codes\"]').first();\n  const destination=form.locator('input[name=\"destination_id\"]').first();\n  const visual=form.locator('#id_search_text,input.search_text,input[placeholder*=\"destino\" i],input[placeholder*=\"hotel\" i]').first();\n  const opener=form.locator('.input-like.where').first();\n  const popup=form.locator('#where_popup').first();\n  const destinationOption=popup.locator('li.destination[data-destination=\"220\"]').first();\n  const hotelOption=popup.locator(`li.hotel[data-hotel=\"${wantedCode}\"]`).first();\n  if(!await form.count().catch(()=>0)||!await hotelOption.count().catch(()=>0))return false;\n  try{\n    if(await opener.count().catch(()=>0))await opener.click({timeout:3500}).catch(async()=>{await visual.click({force:true,timeout:2500}).catch(()=>{});});\n    await page.waitForTimeout(220);\n    // Si el destino no está ya marcado, lo seleccionamos desde el mismo popup nativo.\n    if(await destinationOption.count().catch(()=>0)){\n      const selected=await destinationOption.evaluate(el=>el.classList.contains('li_selected')).catch(()=>false);\n      if(!selected){\n        await destinationOption.click({timeout:3000}).catch(async()=>destinationOption.click({force:true,timeout:3000}).catch(()=>{}));\n        await page.waitForTimeout(220);\n      }\n    }\n    const clicked=await hotelOption.click({timeout:3500}).then(()=>true).catch(async()=>hotelOption.click({force:true,timeout:3500}).then(()=>true).catch(()=>false));\n    if(!clicked)return false;\n    await page.waitForTimeout(550);\n    const hotelCode=String(await code.inputValue().catch(()=>'' )).trim();\n    const destinationId=String(await destination.inputValue().catch(()=>'' )).trim();\n    const visualValue=String(await visual.inputValue().catch(()=>'' )).trim();\n    console.log(`[cordial] Selector nativo de hotel: visual=${visualValue||'—'} · destination_id=${destinationId||'—'} · hotel_codes=${hotelCode||'—'}`);\n    if(hotelCode===wantedCode&&destinationId){\n      await form.evaluate((f,data)=>{f.setAttribute('data-mfe-hotel-code',data.hotelCode);f.setAttribute('data-mfe-destination-id',data.destinationId);},{hotelCode,destinationId}).catch(()=>{});\n      return true;\n    }\n  }catch(error){console.log(`[cordial] Selector nativo de hotel no pudo completarse: ${error?.message||String(error)}`);}\n  return false;\n}\n\nasync function chooseHotel(page,config){\n  const wanted=config.hotel||'Cordial Santa Águeda & Perchel Beach Club';\n  const code=page.locator('input[name=\"hotel_codes\"]').first();\n  const destination=page.locator('input[name=\"destination_id\"]').first();\n  const visual=page.locator('input[placeholder*=\"destino\" i],input[placeholder*=\"hotel\" i]').first();\n  const before={code:await code.inputValue().catch(()=>''),destination:await destination.inputValue().catch(()=>'' )};\n\n  // Primera opción: usar el selector nativo real que descubrimos en el HTML de diagnóstico.\n  const selectedNative=await selectHotelFromNativePopup(page,wanted,'AGUEDA').catch(()=>false);\n  if(selectedNative){\n    const currentCode=String(await code.inputValue().catch(()=>'' )).trim();\n    const currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();\n    console.log(`[cordial] Hotel preparado con selector nativo: code=${currentCode||'—'} · destination_id=${currentDestination||'—'}`);\n    return Boolean(currentCode&&currentDestination);\n  }\n\n  // Segundo intento: selección real mediante el autocomplete/entrada visual, porque ese clic ejecuta\n  // los listeners internos de BeCordial y prepara más estado que los hidden por sí solos.\n  const selectedThroughUi=await selectHotelThroughUi(page,wanted).catch(()=>false);\n  if(selectedThroughUi){\n    const currentCode=String(await code.inputValue().catch(()=>'' )).trim();\n    const currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();\n    const visualValue=String(await visual.inputValue().catch(()=>'' )).trim();\n    console.log(`[cordial] Hotel preparado mediante interfaz: code=${currentCode||'—'} · destination_id=${currentDestination||'—'} · visual=${visualValue||'—'}`);\n    const bookingForm=code.locator('xpath=ancestor::form[1]');\n    if(await bookingForm.count().catch(()=>0)){\n      await bookingForm.evaluate((f,data)=>{f.setAttribute('data-mfe-hotel-code',data.hotelCode);f.setAttribute('data-mfe-destination-id',data.destinationId);},{hotelCode:currentCode,destinationId:currentDestination}).catch(()=>{});\n    }\n    return Boolean(currentCode&&currentDestination);\n  }\n  console.log('[cordial] El autocomplete no confirmó una selección real; usando compatibilidad por hidden como respaldo.');\n\n  // En la página específica del hotel, BeCordial precarga hotel_codes=AGUEDA pero deja\n  // destination_id vacío. El servidor devuelve de nuevo el buscador si se envía así.\n  // Por eso seleccionamos primero el destino y después el hotel usando el mismo autocomplete\n  // que utiliza un usuario real, y verificamos los hidden antes de lanzar la búsqueda.\n  let destinationSelected=false,hotelSelected=false;\n\n  // v2.1.95: el diagnóstico real de BeCordial mostró que el selector ya deja en el DOM\n  // nodos ocultos seleccionados con destination_id (p. ej. el destino y el hotel), aunque\n  // el input hidden destination_id siga vacío. Recuperamos ese identificador del propio DOM\n  // antes de intentar manipular visualmente el autocomplete. No se hardcodea ningún ID.\n  let prefilledDestination=String(await destination.inputValue().catch(()=>'' )).trim();\n  if(!prefilledDestination){\n    const fromHotel=await deriveHiddenFromRenderedOption(page,/Cordial Santa Águeda.*Perchel Beach Club/i,'destination');\n    const fromDestination=fromHotel.value?{value:'',source:'',rows:[]}:await deriveHiddenFromRenderedOption(page,/^Gran Canaria\\s*-\\s*Sur(?:\\s*\\(España\\))?$/i,'destination');\n    const derived=fromHotel.value?fromHotel:fromDestination;\n    if(derived.value){\n      await forceControlValue(destination,derived.value).catch(()=>false);\n      prefilledDestination=String(await destination.inputValue().catch(()=>'' )).trim();\n      if(prefilledDestination){\n        destinationSelected=true;\n        if(fromHotel.value)hotelSelected=true;\n        console.log(`[cordial] destination_id recuperado del modelo interno del selector: ${prefilledDestination} (${derived.source}).`);\n      }\n    }\n  }\n\n  if(await visible(visual)&&!prefilledDestination){\n    destinationSelected=await selectAutocompleteValue(page,visual,'Gran Canaria - Sur',/^Gran Canaria\\s*-\\s*Sur$/i);\n    await page.waitForTimeout(350);\n    let destinationValue=String(await destination.inputValue().catch(()=>'' )).trim();\n    if(!destinationValue){\n      // Si el widget ha dibujado una opción con el identificador en data-*, lo extraemos\n      // del propio DOM. No usamos IDs inventados ni constantes externas.\n      await visual.click({force:true}).catch(()=>{});\n      await visual.press('Control+A').catch(()=>{});\n      await visual.pressSequentially('Gran Canaria - Sur',{delay:25}).catch(()=>{});\n      await page.waitForTimeout(500);\n      const derived=await deriveHiddenFromRenderedOption(page,/^Gran Canaria\\s*-\\s*Sur$/i,'destination');\n      if(derived.value){await forceControlValue(destination,derived.value).catch(()=>false);destinationValue=String(await destination.inputValue().catch(()=>'' )).trim();console.log(`[cordial] destination_id derivado del selector: ${destinationValue||'—'} (${derived.source}).`);}\n      if(!destinationValue&&derived.rows.length)console.log(`[cordial] Opciones de destino detectadas: ${JSON.stringify(derived.rows.slice(0,5))}`);\n    }\n\n    // Una vez inicializado el destino, seleccionamos explícitamente Santa Águeda.\n    hotelSelected=await selectAutocompleteValue(page,visual,'Cordial Santa Águeda',/Cordial Santa Águeda.*Perchel Beach Club/i);\n    await page.waitForTimeout(450);\n  }\n\n  // Algunos builds exponen la opción de hotel directamente con atributos data-*.\n  let currentCode=String(await code.inputValue().catch(()=>'' )).trim();\n  if(!currentCode){\n    const dataOption=page.locator('[data-code=\"AGUEDA\"],[data-value=\"AGUEDA\"],[data-hotel-code=\"AGUEDA\"]').last();\n    if(await visible(dataOption)){await dataOption.click({force:true}).catch(()=>{});hotelSelected=true;await page.waitForTimeout(250);currentCode=String(await code.inputValue().catch(()=>'' )).trim();}\n  }\n  if(!currentCode&&String(before.code||'').trim()){\n    await forceControlValue(code,before.code).catch(()=>false);\n    currentCode=String(await code.inputValue().catch(()=>'' )).trim();\n  }\n\n  let currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();\n  if(!currentDestination&&String(before.destination||'').trim()){\n    await forceControlValue(destination,before.destination).catch(()=>false);\n    currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();\n  }\n\n  // Último intento: con el hotel ya seleccionado, abrimos de nuevo el autocomplete y\n  // buscamos cualquier nodo visible que represente Gran Canaria - Sur para obtener su ID.\n  if(!currentDestination&&await visible(visual)){\n    await visual.click({force:true}).catch(()=>{});\n    await visual.press('Control+A').catch(()=>{});\n    await visual.pressSequentially('Gran Canaria - Sur',{delay:25}).catch(()=>{});\n    await page.waitForTimeout(500);\n    const derived=await deriveHiddenFromRenderedOption(page,/^Gran Canaria\\s*-\\s*Sur$/i,'destination');\n    if(derived.value){await forceControlValue(destination,derived.value).catch(()=>false);currentDestination=String(await destination.inputValue().catch(()=>'' )).trim();console.log(`[cordial] destination_id recuperado del DOM: ${currentDestination||'—'} (${derived.source}).`);}\n    // Restauramos el texto visible del hotel para no enviar el formulario con el buscador mostrando destino.\n    await visual.press('Control+A').catch(()=>{});\n    await visual.fill(wanted).catch(()=>{});\n    await visual.dispatchEvent('change').catch(()=>{});\n  }\n\n  console.log(`[cordial] Hotel preparado: code=${currentCode||'—'} · destination_id=${currentDestination||'—'} · destino=${destinationSelected?'sí':'no'} · hotel=${hotelSelected?'sí':'no'}`);\n  if(!currentCode)return false;\n  if(!currentDestination){\n    const diag=await optionDiagnostics(page,/Gran Canaria\\s*-\\s*Sur|Cordial Santa Águeda/i).catch(()=>[]);\n    console.log(`[cordial] No se obtuvo destination_id. Diagnóstico del selector: ${JSON.stringify(diag.slice(0,8))}`);\n    return false;\n  }\n  // Guardamos los valores críticos en el propio formulario. El JS de BeCordial puede\n  // vaciar hotel_codes al procesar el botón Buscar aunque el hotel ya estuviera elegido.\n  // Estos atributos internos nos permiten restaurarlos justo antes de cada intento de envío.\n  const bookingForm=code.locator('xpath=ancestor::form[1]');\n  if(await bookingForm.count().catch(()=>0)){\n    await bookingForm.evaluate((f,data)=>{\n      f.setAttribute('data-mfe-hotel-code',data.hotelCode);\n      f.setAttribute('data-mfe-destination-id',data.destinationId);\n    },{hotelCode:currentCode,destinationId:currentDestination}).catch(()=>{});\n  }\n  return true;\n}\nasync function forceControlValue(loc,value){\n  if(!loc||await loc.count().catch(()=>0)<1)return false;\n  try{\n    await loc.first().evaluate((el,v)=>{\n      const proto=el instanceof HTMLInputElement?HTMLInputElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:null;\n      const setter=proto?Object.getOwnPropertyDescriptor(proto,'value')?.set:null;\n      if(setter)setter.call(el,v);else el.value=v;\n      el.dispatchEvent(new Event('input',{bubbles:true}));\n      el.dispatchEvent(new Event('change',{bubbles:true}));\n    },String(value));\n    return String(await loc.first().inputValue().catch(()=>''))===String(value);\n  }catch{return false;}\n}\nasync function syncVisibleDateRange(page,checkIn,checkOut){\n  // BeCordial mantiene un campo visual de rango separado de date_from/date_to.\n  // Si ese texto se queda con las fechas anteriores, su JS puede considerar la búsqueda incompleta.\n  const rangeText=await page.evaluate(([from,to])=>{\n    const fmt=value=>new Intl.DateTimeFormat('es-ES',{weekday:'short',day:'numeric',month:'short'}).format(new Date(`${value}T12:00:00`)).replace(/,/g,'').replace(/\\./g,'').trim();\n    return `${fmt(from)} - ${fmt(to)}`;\n  },[checkIn,checkOut]).catch(()=>`${checkIn} - ${checkOut}`);\n  const form=page.locator('input[name=\"hotel_codes\"]').first().locator('xpath=ancestor::form[1]');\n  const scope=await form.count().catch(()=>0)?form:page.locator('body');\n  const inputs=scope.locator('input[type=\"text\"]');\n  const count=await inputs.count().catch(()=>0);\n  for(let i=0;i<count;i++){\n    const input=inputs.nth(i),value=String(await input.inputValue().catch(()=>''));\n    const name=String(await input.getAttribute('name').catch(()=>''));\n    const placeholder=String(await input.getAttribute('placeholder').catch(()=>''));\n    if(/promo|email|password|key/i.test(`${name} ${placeholder}`))continue;\n    if(!(/\\b(ene|feb|mar|abr|may|jun|jul|ago|sept|sep|oct|nov|dic)\\b/i.test(value)&&/\\s[-–]\\s/.test(value)))continue;\n    try{\n      await input.evaluate((el,v)=>{\n        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;\n        if(setter)setter.call(el,v);else el.value=v;\n        el.dispatchEvent(new Event('input',{bubbles:true}));\n        el.dispatchEvent(new Event('change',{bubbles:true}));\n        el.dispatchEvent(new Event('blur',{bubbles:true}));\n      },rangeText);\n      console.log(`[cordial] Rango visual sincronizado: ${rangeText}`);\n      return true;\n    }catch{}\n  }\n  return false;\n}\nasync function fillDateInputs(page,config){\n  const checkIn=String(config.checkIn||''),checkOut=String(config.checkOut||'');\n  if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(checkIn)||!/^\\d{4}-\\d{2}-\\d{2}$/.test(checkOut))throw new Error('Las fechas de Cordial no son válidas.');\n\n  // El formulario público de BeCordial usa actualmente date_from/date_to como campos ocultos.\n  // Debemos escribirlos aunque no sean visibles: el formulario los envía al motor de reservas.\n  const exactIn=page.locator('input[name=\"date_from\"],input#date_from');\n  const exactOut=page.locator('input[name=\"date_to\"],input#date_to');\n  const hasExactIn=await exactIn.count().catch(()=>0)>0,hasExactOut=await exactOut.count().catch(()=>0)>0;\n  if(hasExactIn&&hasExactOut){\n    const okIn=await forceControlValue(exactIn,checkIn),okOut=await forceControlValue(exactOut,checkOut);\n    if(okIn&&okOut){\n      await syncVisibleDateRange(page,checkIn,checkOut).catch(()=>false);\n      console.log(`[cordial] Fechas aplicadas al formulario: ${checkIn} → ${checkOut}`);\n      return true;\n    }\n  }\n\n  const dateInputs=page.locator('input[type=\"date\"]');\n  if(await dateInputs.count()>=2){\n    const okIn=await forceControlValue(dateInputs.nth(0),checkIn),okOut=await forceControlValue(dateInputs.nth(1),checkOut);\n    if(okIn&&okOut)return true;\n  }\n  const inSelectors=['input[name=\"date_from\"]','input[name*=\"checkin\" i]','input[name*=\"arrival\" i]','input[name*=\"entrada\" i]','input[name*=\"start\" i]','input[placeholder*=\"entrada\" i]'];\n  const outSelectors=['input[name=\"date_to\"]','input[name*=\"checkout\" i]','input[name*=\"departure\" i]','input[name*=\"salida\" i]','input[name*=\"end\" i]','input[placeholder*=\"salida\" i]'];\n  let inOk=false,outOk=false;\n  for(const selector of inSelectors){const loc=page.locator(selector).first();if(await loc.count().catch(()=>0)&&await forceControlValue(loc,checkIn)){inOk=true;break;}}\n  for(const selector of outSelectors){const loc=page.locator(selector).first();if(await loc.count().catch(()=>0)&&await forceControlValue(loc,checkOut)){outOk=true;break;}}\n  if(inOk&&outOk)return true;\n\n  // Último recurso: campo visual único “Entrada / Salida”.\n  const dateLabel=page.getByText(/Entrada\\s*\\/\\s*Salida/i).first();\n  if(await visible(dateLabel)){\n    const input=dateLabel.locator('xpath=following::input[not(@type=\"hidden\")][1]').first();\n    if(await visible(input)){\n      const [yi,mi,di]=checkIn.split('-'),[yo,mo,do_]=checkOut.split('-');\n      for(const value of [`${di}/${mi}/${yi} - ${do_}/${mo}/${yo}`,`${di}/${mi}/${yi} – ${do_}/${mo}/${yo}`]){\n        try{await input.fill(value);await input.dispatchEvent('change').catch(()=>{});return true;}catch{}\n        try{await input.evaluate((el,v)=>{el.removeAttribute('readonly');el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);return true;}catch{}\n      }\n    }\n  }\n  return false;\n}\nasync function setAdults(page,config){\n  const adults=Math.max(1,Number(config.adults)||2);\n  const inputs=page.locator('input[name*=\"adult\" i],select[name*=\"adult\" i]');\n  if(await inputs.count()){\n    const el=inputs.first();if((await el.evaluate(e=>e.tagName)).toLowerCase()==='select')await el.selectOption(String(adults)).catch(()=>{});else await el.fill(String(adults)).catch(()=>{});\n    return true;\n  }\n  // El formulario público de Cordial parte normalmente de 2 adultos. Si ya lo muestra, no tocamos el contador.\n  const text=await page.locator('body').innerText().catch(()=> '');if(new RegExp(`\\\\b${adults}\\\\s+adultos?\\\\b`,'i').test(text))return true;\n  return false;\n}\nasync function bookingResultReady(page){\n  if(/\\/booking\\/process\\/room/i.test(page.url()))return true;\n\n  // El motor de BeCordial puede mantener la URL en /booking/process/ aunque ya haya\n  // renderizado las habitaciones. En las ejecuciones reales v2.1.98 se observan varios\n  // botones visibles \"Reservar\" tras el submit nativo, pero la comprobación antigua\n  // seguía interpretándolo como formulario fallido. Detectamos también esa firma real.\n  const resultText=page.getByText(/Tarifa Club Cordial|Tarifa Estándar|Classic Duplex|Solo alojamiento|Desayuno/i);\n  const resultCount=await resultText.count().catch(()=>0);\n  for(let i=0;i<Math.min(resultCount,12);i++){if(await visible(resultText.nth(i)))return true;}\n\n  const reserveButtons=page.getByRole('button',{name:/^reservar$/i});\n  const count=await reserveButtons.count().catch(()=>0);\n  let visibleReserve=0;\n  for(let i=0;i<Math.min(count,30);i++){if(await visible(reserveButtons.nth(i)))visibleReserve++;}\n  if(visibleReserve>=2){\n    const body=await page.locator('body').innerText().catch(()=> '');\n    const hotelListSignature=['Cordial Green Golf','Cordial Sandy Golf','Cordial Mogán Valle','Cordial Mogán Playa'].filter(name=>body.includes(name)).length>=2;\n    const hasRoomContent=/SOLO ALOJAMIENTO|DESAYUNO|Classic|Duplex|Dúplex|Deluxe|Ocean|Tarifa Club Cordial|Tarifa Estándar/i.test(body);\n    if(hotelListSignature){\n      console.log(`[cordial] Resultados intermedios detectados: lista de hoteles (${visibleReserve} botones Reservar).`);\n      return true;\n    }\n    if(hasRoomContent){\n      console.log(`[cordial] Resultados de habitaciones detectados en /booking/process/ por ${visibleReserve} botones Reservar visibles.`);\n      return true;\n    }\n  }\n  return false;\n}\nasync function waitForBookingResult(page,timeout=45000){\n  const started=Date.now();\n  while(Date.now()-started<timeout){\n    if(await bookingResultReady(page))return true;\n    await page.waitForTimeout(350);\n  }\n  return false;\n}\nasync function setControlValueRaw(loc,value){\n  if(!loc||await loc.count().catch(()=>0)<1)return false;\n  try{\n    await loc.first().evaluate((el,v)=>{\n      const proto=el instanceof HTMLInputElement?HTMLInputElement.prototype:el instanceof HTMLSelectElement?HTMLSelectElement.prototype:null;\n      const setter=proto?Object.getOwnPropertyDescriptor(proto,'value')?.set:null;\n      if(setter)setter.call(el,v);else el.value=v;\n    },String(value));\n    return String(await loc.first().inputValue().catch(()=>''))===String(value);\n  }catch{return false;}\n}\n\nasync function stabilizeBookingControls(page,form=null,fallback={}){\n  const hotel=page.locator('input[name=\"hotel_codes\"]').first();\n  const destination=page.locator('input[name=\"destination_id\"]').first();\n  const targetForm=form&&await form.count().catch(()=>0)?form:hotel.locator('xpath=ancestor::form[1]');\n  if(!await targetForm.count().catch(()=>0))return {ok:false,hotelCode:'',destinationId:''};\n  const remembered=await targetForm.evaluate(f=>({\n    hotelCode:f.getAttribute('data-mfe-hotel-code')||'',\n    destinationId:f.getAttribute('data-mfe-destination-id')||''\n  })).catch(()=>({hotelCode:'',destinationId:''}));\n  const wantedDestination=String(fallback.destinationId||remembered.destinationId||'').trim();\n  const wantedHotel=String(fallback.hotelCode||remembered.hotelCode||'').trim();\n  let hotelCode=String(await hotel.inputValue().catch(()=>'' )).trim();\n  let destinationId=String(await destination.inputValue().catch(()=>'' )).trim();\n  let restored=false;\n\n  // BeCordial puede reconstruir el formulario tras un submit fallido. En ese caso se\n  // pierden los atributos data-mfe-* y hotel_codes queda vacío. Conservamos además una\n  // copia en memoria (fallback) y restauramos SIN disparar input/change.\n  // Orden importante: primero destino y después hotel.\n  if(!destinationId&&wantedDestination){\n    restored=await setControlValueRaw(destination,wantedDestination).catch(()=>false)||restored;\n    destinationId=String(await destination.inputValue().catch(()=>'' )).trim();\n  }\n  if(!hotelCode&&wantedHotel){\n    restored=await setControlValueRaw(hotel,wantedHotel).catch(()=>false)||restored;\n    hotelCode=String(await hotel.inputValue().catch(()=>'' )).trim();\n  }\n  if(restored)console.log(`[cordial] Controles restaurados antes del envío: destination_id=${destinationId||'—'} · hotel_codes=${hotelCode||'—'}`);\n  return {ok:Boolean(hotelCode&&destinationId),hotelCode,destinationId};\n}\n\nasync function formState(page,form){\n  if(!await form.count().catch(()=>0))return null;\n  return form.evaluate(f=>{\n    const invalid=[...f.elements].filter(el=>typeof el.checkValidity==='function'&&!el.checkValidity()).map(el=>({name:el.name||'',type:el.type||'',value:el.value||'',validation:el.validationMessage||''}));\n    const data=[];for(const [key,value] of new FormData(f).entries())data.push([key,String(value)]);\n    return {action:f.action||'',method:(f.method||'get').toUpperCase(),id:f.id||'',valid:f.checkValidity(),invalid,data};\n  }).catch(()=>null);\n}\nasync function postFormDirect(page,form,fallback={}){\n  const stable=await stabilizeBookingControls(page,form,fallback);\n  if(!stable.ok){console.log(`[cordial] POST directo cancelado: faltan controles críticos · destination_id=${stable.destinationId||'—'} · hotel_codes=${stable.hotelCode||'—'}`);return false;}\n  const state=await formState(page,form);if(!state?.action)return false;\n  const params=new URLSearchParams();for(const [key,value] of state.data||[])params.append(key,value);\n  // Defensa adicional: forzamos los valores críticos también en el payload.\n  params.set('destination_id',stable.destinationId);\n  params.set('hotel_codes',stable.hotelCode);\n  console.log(`[cordial] POST directo de diagnóstico: ${state.action} · valid=${state.valid?'sí':'no'} · destination_id=${params.get('destination_id')||'—'} · hotel_codes=${params.get('hotel_codes')||'—'}`);\n  if(state.invalid?.length)console.log(`[cordial] Controles HTML inválidos: ${JSON.stringify(state.invalid)}`);\n  try{\n    const response=await page.context().request.post(state.action,{data:params.toString(),headers:{'Content-Type':'application/x-www-form-urlencoded','Referer':page.url()},maxRedirects:0,timeout:30000});\n    const status=response.status(),location=response.headers()['location']||'';\n    console.log(`[cordial] Respuesta POST directa: HTTP ${status}${location?` · Location=${location}`:''}`);\n    if(status>=300&&status<400&&location){const next=new URL(location,state.action).href;await page.goto(next,{waitUntil:'domcontentloaded',timeout:45000});return await waitForBookingResult(page,25000);}\n    const html=await response.text().catch(()=>'');\n    if(/Tarifa Club Cordial|Classic Duplex|booking\\/process\\/room/i.test(html)){\n      await page.setContent(html,{waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});\n      return true;\n    }\n    const plain=html.replace(/<script[\\s\\S]*?<\\/script>/gi,' ').replace(/<style[\\s\\S]*?<\\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\\s+/g,' ').trim();\n    const clues=plain.match(/.{0,90}(?:obligatorio|requerido|required|error|selecciona|seleccione|fecha|hu[eé]sped|destino|hotel).{0,160}/gi)||[];\n    console.log(`[cordial] Respuesta sin resultados. Pistas: ${(clues.slice(0,6).join(' | ')||plain.slice(0,900)||'sin texto')}`);\n  }catch(error){console.log(`[cordial] POST directo falló: ${error?.message||String(error)}`);}\n  return false;\n}\n\nasync function installCriticalPostGuard(page,critical){\n  const pattern='**/booking/process/**';\n  let logged=false;\n  const handler=async route=>{\n    const request=route.request();\n    if(request.method()!=='POST')return route.continue();\n    const contentType=String(request.headers()['content-type']||'');\n    if(!/application\\/x-www-form-urlencoded/i.test(contentType))return route.continue();\n    try{\n      const params=new URLSearchParams(request.postData()||'');\n      const beforeDestination=params.get('destination_id')||'';\n      const beforeHotel=params.get('hotel_codes')||'';\n      if(critical.destinationId)params.set('destination_id',critical.destinationId);\n      if(critical.hotelCode)params.set('hotel_codes',critical.hotelCode);\n      const headers={...request.headers()};delete headers['content-length'];\n      if(!logged&&(beforeDestination!==critical.destinationId||beforeHotel!==critical.hotelCode)){\n        console.log(`[cordial] POST interceptado y corregido antes de salir: destination_id=${beforeDestination||'—'}→${critical.destinationId||'—'} · hotel_codes=${beforeHotel||'—'}→${critical.hotelCode||'—'}`);\n        logged=true;\n      }\n      return route.continue({postData:params.toString(),headers});\n    }catch{return route.continue();}\n  };\n  await page.route(pattern,handler);\n  return async()=>{await page.unroute(pattern,handler).catch(()=>{});};\n}\n\nasync function submitSearch(page){\n  const bookingInput=page.locator('input[name=\"hotel_codes\"]').first();\n  const form=bookingInput.locator('xpath=ancestor::form[1]');\n  const initialCritical=await stabilizeBookingControls(page,form);\n  const critical={destinationId:initialCritical.destinationId,hotelCode:initialCritical.hotelCode};\n  console.log(`[cordial] Controles críticos antes de enviar: destination_id=${critical.destinationId||'—'} · hotel_codes=${critical.hotelCode||'—'}`);\n  if(!initialCritical.ok)return false;\n  const initialState=await formState(page,form);\n  if(initialState){\n    console.log(`[cordial] Formulario de búsqueda: ${initialState.method} ${initialState.action||'(sin action)'}${initialState.id?` · #${initialState.id}`:''} · HTML válido=${initialState.valid?'sí':'no'}`);\n    if(initialState.invalid?.length)console.log(`[cordial] Validación HTML: ${JSON.stringify(initialState.invalid)}`);\n  }\n\n  // v2.1.98: el JS de BeCordial vacía hotel_codes justo al enviar. Interceptamos únicamente\n  // el POST real y reponemos los dos campos críticos, manteniendo cookies, CSRF y listeners.\n  const removeGuard=await installCriticalPostGuard(page,critical);\n  try{\n    const candidates=[\n      page.getByRole('button',{name:/^buscar$/i}).last(),\n      page.locator('button').filter({hasText:/^\\s*Buscar\\s*$/i}).last(),\n      page.locator('input[type=\"submit\"][value*=\"buscar\" i]').last(),\n      page.locator('[role=\"button\"]').filter({hasText:/^\\s*Buscar\\s*$/i}).last(),\n      page.getByRole('button',{name:/reservar|ver precios|consultar disponibilidad/i}).first(),\n      page.locator('button[type=\"submit\"],input[type=\"submit\"]').last()\n    ];\n    for(const button of candidates){\n      if(!await visible(button))continue;\n      const label=(await button.innerText().catch(()=>''))||(await button.getAttribute('value').catch(()=>''))||'botón';\n      console.log(`[cordial] Intentando búsqueda con: ${String(label).trim()||'botón visible'}`);\n      const stable=await stabilizeBookingControls(page,form,critical);\n      if(!stable.ok)continue;\n      await button.scrollIntoViewIfNeeded().catch(()=>{});\n      const responsePromise=page.waitForResponse(r=>/\\/booking\\/process\\/?(?:$|\\?)/i.test(r.url())&&r.request().method()==='POST',{timeout:10000}).catch(()=>null);\n      const clicked=await button.click({force:true,timeout:5000}).then(()=>true).catch(()=>false);\n      if(!clicked)continue;\n      const response=await responsePromise;\n      if(response)console.log(`[cordial] POST del botón: HTTP ${response.status()} · ${response.url()}`);\n      if(await waitForBookingResult(page,20000))return true;\n    }\n\n    if(await form.count().catch(()=>0)){\n      console.log('[cordial] El botón no abrió resultados; probando requestSubmit() del formulario.');\n      const stableRequest=await stabilizeBookingControls(page,form,critical);\n      if(!stableRequest.ok)return false;\n      const requested=await form.evaluate(f=>{try{f.requestSubmit();return true;}catch{return false;}}).catch(()=>false);\n      if(requested&&await waitForBookingResult(page,16000))return true;\n\n      console.log('[cordial] requestSubmit() no abrió resultados; probando POST directo con la sesión del navegador.');\n      if(await postFormDirect(page,form,critical))return true;\n\n      console.log('[cordial] POST directo no abrió resultados; probando submit() HTML nativo.');\n      const stableNative=await stabilizeBookingControls(page,form,critical);\n      if(!stableNative.ok)return false;\n      const submitted=await form.evaluate(f=>{try{HTMLFormElement.prototype.submit.call(f);return true;}catch{return false;}}).catch(()=>false);\n      if(submitted&&await waitForBookingResult(page,20000))return true;\n    }\n    await snapshot(page,'cordial-formulario-fallido').catch(()=>{});\n    return false;\n  }finally{await removeGuard();}\n}\nasync function visibleReserveCount(page){\n  const reserves=page.getByRole('button',{name:/^reservar$/i});\n  const count=Math.min(await reserves.count().catch(()=>0),60);let visibleCount=0;\n  for(let i=0;i<count;i++)if(await visible(reserves.nth(i)))visibleCount++;\n  return visibleCount;\n}\nasync function roomRatesReady(page,config={}){\n  const wantedRoom=String(config.targetRoom||'Classic Duplex').trim();\n  const body=await page.locator('body').innerText().catch(()=> '');\n  if(wantedRoom&&new RegExp(wantedRoom.replace(/[.*+?^${}()|[\\]\\\\]/g,'\\\\$&'),'i').test(body))return true;\n  if(/Tarifa Club Cordial|Tarifa Est[aá]ndar|Club Cordial\\s*-\\s*(?:Oferta Prepago Online|Reserva Online)|SOLO ALOJAMIENTO/i.test(body))return true;\n  return /\\/booking\\/process\\/room/i.test(page.url())&&await visibleReserveCount(page)>0;\n}\nasync function destinationHotelListReady(page){\n  const cards=page.locator('.hotel_list .hotel,.hotels_list .hotel,.hotel-list .hotel');\n  let visibleCards=0;const count=Math.min(await cards.count().catch(()=>0),40);\n  for(let i=0;i<count;i++)if(await visible(cards.nth(i)))visibleCards++;\n  if(visibleCards>=2)return true;\n  const body=await page.locator('body').innerText().catch(()=> '');\n  const signatures=['Cordial Green Golf','Cordial Sandy Golf','Cordial Mogán Valle','Cordial Mogán Playa'];\n  return signatures.filter(name=>body.includes(name)).length>=2&&await visibleReserveCount(page)>=2;\n}\nasync function clickTargetHotelFromResults(page,config={}){\n  if(!await destinationHotelListReady(page))return false;\n  const wanted=String(config.hotel||'Cordial Santa Águeda & Perchel Beach Club').trim();\n  const wantedPattern=/Cordial Santa Águeda.*Perchel Beach Club/i;\n  const directCards=[\n    page.locator('.hotel_list .hotel').filter({hasText:wantedPattern}),\n    page.locator('.hotels_list .hotel').filter({hasText:wantedPattern}),\n    page.locator('.hotel-list .hotel').filter({hasText:wantedPattern})\n  ];\n  for(const group of directCards){\n    const count=Math.min(await group.count().catch(()=>0),8);\n    for(let i=0;i<count;i++){\n      const card=group.nth(i);if(!await visible(card))continue;\n      const btn=card.getByRole('button',{name:/^reservar$/i}).first();\n      if(!await visible(btn))continue;\n      console.log(`[cordial] Resultado intermedio: seleccionando hotel «${wanted}» desde la lista de hoteles.`);\n      const clicked=await btn.click({timeout:5000}).then(()=>true).catch(async()=>btn.click({force:true,timeout:5000}).then(()=>true).catch(()=>false));\n      if(!clicked)continue;\n      const started=Date.now();while(Date.now()-started<30000){if(await roomRatesReady(page,config))return true;await page.waitForTimeout(350);}\n    }\n  }\n  // Respaldo: localizamos qué botón Reservar pertenece a un ancestro cuyo texto contiene el hotel.\n  const reserves=page.getByRole('button',{name:/^reservar$/i});\n  const count=Math.min(await reserves.count().catch(()=>0),50);\n  for(let i=0;i<count;i++){\n    const btn=reserves.nth(i);if(!await visible(btn))continue;\n    const belongs=await btn.evaluate((el,name)=>{\n      const norm=v=>String(v||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();\n      const target=norm(name);let node=el.parentElement;\n      for(let depth=0;node&&depth<7;depth++,node=node.parentElement){\n        const text=norm(node.innerText||'');if(text.includes(target))return true;\n        if(text.length>8000)break;\n      }return false;\n    },wanted).catch(()=>false);\n    if(!belongs)continue;\n    console.log(`[cordial] Resultado intermedio: hotel objetivo localizado por contexto; pulsando Reservar.`);\n    const clicked=await btn.click({timeout:5000}).then(()=>true).catch(async()=>btn.click({force:true,timeout:5000}).then(()=>true).catch(()=>false));\n    if(!clicked)continue;\n    const started=Date.now();while(Date.now()-started<30000){if(await roomRatesReady(page,config))return true;await page.waitForTimeout(350);}\n  }\n  await snapshot(page,'cordial-lista-hoteles-sin-seleccionar').catch(()=>{});\n  console.log(`[cordial] Se obtuvo una lista de hoteles, pero no se pudo abrir «${wanted}».`);\n  return false;\n}\nasync function ensureRoomResults(page,config={}){\n  if(await roomRatesReady(page,config))return true;\n  if(await destinationHotelListReady(page))return await clickTargetHotelFromResults(page,config);\n  return false;\n}\n\nasync function selectClubTab(page){\n  const tabs=page.getByText(/Tarifa Club Cordial/i);\n  const count=await tabs.count().catch(()=>0);\n  for(let i=0;i<Math.min(count,12);i++){\n    const tab=tabs.nth(i);\n    if(!await visible(tab))continue;\n    await tab.click().catch(()=>{});\n    await page.waitForTimeout(800);\n    return true;\n  }\n  return false;\n}\nfunction isBoard(line){return /^(SOLO ALOJAMIENTO|DESAYUNO|MEDIA PENSI[ÓO]N|PENSI[ÓO]N COMPLETA|TODO INCLUIDO|ALOJAMIENTO Y DESAYUNO)$/i.test(String(line).trim());}\nfunction isRate(line){return /^(Club Cordial\\s*-|Tarifa Est[aá]ndar|Oferta .*Online|Reserva Online)/i.test(String(line).trim());}\nfunction isCancellation(line){return /cancelaci[oó]n|reembolsable|no reembolsable/i.test(String(line));}\nfunction looksRoom(line,headings){const n=normalize(line);if(!n||n.length>75)return false;if(/club cordial\\s*-|reserva online|oferta prepago online|tarifa est[aá]ndar/i.test(line))return false;if(headings.has(n)&&!/resumen|habitaci[oó]n 1|cordial santa|m[aá]s informaci[oó]n|tarifa|filtro|ordenar/i.test(line))return true;return /^(classic|deluxe|ocean|premium|superior|villa|suite|duplex|d[uú]plex)/i.test(line);}\nexport function parseCordialText(text,headingTexts=[],config={}){\n  const lines=String(text||'').split(/\\n+/).map(x=>x.replace(/\\s+/g,' ').trim()).filter(Boolean);const headings=new Set(headingTexts.map(normalize));\n  const out=[];let room='',rate='',cancellation='',availability='';\n  for(let i=0;i<lines.length;i++){\n    const line=lines[i];\n    if(looksRoom(line,headings)){room=line;rate='';cancellation='';availability='';continue;}\n    if(isRate(line)){rate=line;cancellation='';availability='';continue;}\n    if(isCancellation(line)){cancellation=line;continue;}\n    if(/queda\\s+\\d+\\s+habitaci[oó]n|agotad|no disponible|sold out/i.test(line)){availability=line;continue;}\n    if(!isBoard(line)||!room)continue;\n    const money=[];for(let j=i+1;j<Math.min(lines.length,i+8);j++){\n      if(isBoard(lines[j])||isRate(lines[j])||looksRoom(lines[j],headings))break;\n      money.push(...eur(lines[j]));\n      if(/reservar/i.test(lines[j])&&money.length)break;\n    }\n    if(!money.length)continue;\n    const price=money[money.length-1],crossedPrice=money.length>1?money[0]:0;\n    const row={roomType:room,rateName:rate||'Tarifa Club Cordial',cancellation,board:line.toUpperCase(),price,crossedPrice,availability:availability||'Disponible'};\n    row.target=targetMatches(row,config);out.push(row);\n  }\n  // Quita duplicados que algunos layouts responsive repiten.\n  const map=new Map();for(const row of out){const key=[normalize(row.roomType),normalize(row.rateName),normalize(row.board),row.price].join('|');if(!map.has(key))map.set(key,row);}return [...map.values()];\n}\n\nfunction contextLines(text){return String(text||'').split(/\\n+/).map(x=>x.replace(/\\s+/g,' ').trim()).filter(Boolean);}\nfunction extractRateLine(text){\n  const lines=contextLines(text);\n  for(const line of lines){if(isRate(line))return line;}\n  const flat=String(text||'').replace(/\\s+/g,' ').trim();\n  const m=flat.match(/Club Cordial\\s*-\\s*(?:Oferta Prepago Online|Reserva Online)/i);\n  if(m)return m[0];\n  return /Tarifa Club Cordial/i.test(flat)?'Tarifa Club Cordial':'';\n}\nfunction extractCancellation(text){return contextLines(text).find(isCancellation)||'';}\nfunction extractAvailability(text){return contextLines(text).find(line=>/queda\\s+\\d+\\s+habitaci[oó]n|agotad|no disponible|sold out/i.test(line))||'';}\nfunction roomFromContext(context,headings){\n  const headingSet=new Set((headings||[]).map(normalize));\n  // La web de BeCordial no usa siempre H1-H6 para el nombre de la habitación.\n  // v2.2.02: reserveContexts también captura etiquetas de habitación visibles\n  // por su texto directo y las priorizamos para no asignar todas las tarifas al\n  // último H2/H3 encontrado (p. ej. Deluxe Duplex).\n  for(const h of [...(context.precedingRoomLabels||[])].reverse()){if(looksRoom(h,headingSet))return h;}\n  const candidates=[];\n  for(const ancestor of context.ancestors||[])for(const h of ancestor.headings||[])candidates.push(h);\n  for(const h of [...candidates].reverse()){if(looksRoom(h,headingSet))return h;}\n  for(const h of [...(context.precedingHeadings||[])].reverse()){if(looksRoom(h,headingSet))return h;}\n  for(const ancestor of [...(context.ancestors||[])].reverse()){\n    for(const line of contextLines(ancestor.text)){if(looksRoom(line,headingSet))return line;}\n  }\n  return '';\n}\nexport function parseReserveContext(context,headingTexts=[],config={}){\n  const ancestors=Array.isArray(context?.ancestors)?context.ancestors:[];\n  let tariffIndex=-1,board='',money=[];\n  for(let i=0;i<ancestors.length;i++){\n    const lines=contextLines(ancestors[i].text);\n    const foundBoard=lines.find(isBoard)||'';\n    const foundMoney=eur(ancestors[i].text);\n    if(foundBoard&&foundMoney.length){tariffIndex=i;board=foundBoard;money=foundMoney;break;}\n  }\n  if(tariffIndex<0)return null;\n  let rate='',cancellation='',availability='';\n  for(let i=tariffIndex;i<ancestors.length;i++){\n    const text=ancestors[i].text||'';\n    if(!rate)rate=extractRateLine(text);\n    if(!cancellation)cancellation=extractCancellation(text);\n    if(!availability)availability=extractAvailability(text);\n    if(rate&&cancellation)break;\n  }\n  const room=roomFromContext(context,headingTexts);\n  if(!room)return null;\n  const price=money[money.length-1],crossedPrice=money.length>1?money[0]:0;\n  if(!Number.isFinite(price)||price<=0)return null;\n  const row={roomType:room,rateName:rate||'Tarifa Club Cordial',cancellation,board:String(board).toUpperCase(),price,crossedPrice,availability:availability||'Disponible'};\n  row.target=targetMatches(row,config);\n  return row;\n}\nfunction dedupeOptions(rows=[]){\n  const map=new Map();\n  for(const row of rows.filter(Boolean)){\n    const key=[normalize(row.roomType),normalize(row.rateName),normalize(row.board),Number(row.price)||0].join('|');\n    if(!map.has(key)||row.target)map.set(key,row);\n  }\n  return [...map.values()];\n}\nfunction mergeCordialOptions(domRows=[],textRows=[]){\n  // El parser de texto recorre la página en orden y suele acertar mejor el nombre\n  // de habitación; el parser DOM aporta cancelación/disponibilidad de cada botón.\n  // Cuando ambos describen la misma tarifa, fusionamos y conservamos roomType del\n  // parser de texto. Así evitamos duplicados del tipo \"Deluxe Duplex / Club Cordial\".\n  const merged=textRows.map(row=>({...row}));\n  const sig=row=>[normalize(row?.rateName),normalize(row?.board),Number(row?.price||0).toFixed(2)].join('|');\n  const index=new Map();\n  merged.forEach((row,i)=>{const key=sig(row);if(!index.has(key))index.set(key,[]);index.get(key).push(i);});\n  for(const row of domRows){\n    const matches=index.get(sig(row))||[];\n    if(matches.length===1){\n      const target=merged[matches[0]];\n      if(!target.cancellation&&row.cancellation)target.cancellation=row.cancellation;\n      if(!target.availability&&row.availability)target.availability=row.availability;\n      if(!target.crossedPrice&&row.crossedPrice)target.crossedPrice=row.crossedPrice;\n      target.target=Boolean(target.target||row.target);\n      continue;\n    }\n    merged.push({...row});\n  }\n  return dedupeOptions(merged);\n}\nasync function reserveContexts(page){\n  return page.locator('button,input[type=\"button\"],input[type=\"submit\"],a').evaluateAll(nodes=>{\n    const visible=el=>!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length);\n    const label=el=>String(el.innerText||el.value||el.getAttribute('aria-label')||'').replace(/\\s+/g,' ').trim();\n    const reserve=nodes.filter(el=>visible(el)&&/^reservar$/i.test(label(el))).slice(0,80);\n    const allHeadings=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible);\n    const ownText=el=>[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>String(n.textContent||'')).join(' ').replace(/\\s+/g,' ').trim();\n    const roomLike=text=>{\n      const t=String(text||'').replace(/\\s+/g,' ').trim();\n      if(!t||t.length>75||/club cordial\\s*-|reserva online|oferta prepago online|tarifa est[aá]ndar|solo alojamiento|desayuno/i.test(t))return false;\n      return /^(classic|deluxe|ocean|premium|superior|villa|suite|duplex|d[uú]plex)(?:\\s+[\\p{L}0-9&+\\-]+){0,6}$/iu.test(t);\n    };\n    // Capturamos nombres de habitación aunque sean <div>/<span>/<strong> y no headings.\n    // El texto directo evita que un contenedor enorme herede el texto de todas sus tarifas.\n    const roomNodes=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p,strong,b')]\n      .filter(visible).map(el=>({el,text:ownText(el)||label(el)})).filter(x=>roomLike(x.text));\n    return reserve.map((button,index)=>{\n      const ancestors=[];let node=button.parentElement;\n      for(let depth=0;node&&depth<11;depth++,node=node.parentElement){\n        const text=String(node.innerText||'').trim();\n        const headings=[...node.querySelectorAll(':scope > h1,:scope > h2,:scope > h3,:scope > h4,:scope > h5,:scope > h6,h1,h2,h3,h4,h5,h6')]\n          .filter(visible).slice(0,8).map(h=>String(h.innerText||'').replace(/\\s+/g,' ').trim()).filter(Boolean);\n        ancestors.push({tag:node.tagName,id:node.id||'',className:String(node.className||'').slice(0,180),text:text.slice(0,5000),headings});\n        if(text.length>12000)break;\n      }\n      const precedingHeadings=allHeadings.filter(h=>(h.compareDocumentPosition(button)&Node.DOCUMENT_POSITION_FOLLOWING)!==0)\n        .slice(-12).map(h=>String(h.innerText||'').replace(/\\s+/g,' ').trim()).filter(Boolean);\n      const precedingRoomLabels=roomNodes.filter(x=>(x.el.compareDocumentPosition(button)&Node.DOCUMENT_POSITION_FOLLOWING)!==0)\n        .slice(-8).map(x=>x.text);\n      return {index,label:label(button),ancestors,precedingHeadings,precedingRoomLabels};\n    });\n  }).catch(()=>[]);\n}\nasync function parseCordialDom(page,headingTexts=[],config={}){\n  const contexts=await reserveContexts(page);\n  const rows=dedupeOptions(contexts.map(ctx=>parseReserveContext(ctx,headingTexts,config)));\n  console.log(`[cordial] Parser DOM: ${contexts.length} botones Reservar analizados · ${rows.length} tarifas interpretadas.`);\n  if(rows.length){\n    for(const row of rows.slice(0,24))console.log(`[cordial] Tarifa: ${row.roomType} · ${row.rateName} · ${row.board} · ${row.price.toFixed(2)} €${row.target?' · OBJETIVO':''}`);\n  }else if(contexts.length){\n    const summary=contexts.slice(0,8).map(ctx=>({index:ctx.index,precedingRoomLabels:(ctx.precedingRoomLabels||[]).slice(-4),precedingHeadings:ctx.precedingHeadings.slice(-4),ancestors:ctx.ancestors.slice(0,5).map(a=>({tag:a.tag,id:a.id,className:a.className,text:String(a.text||'').replace(/\\s+/g,' ').slice(0,700)}))}));\n    console.log(`[cordial] Contextos Reservar no interpretados: ${JSON.stringify(summary)}`);\n  }\n  return {rows,contexts};\n}\nasync function extractRoomMeta(page){\n  const fallback='https://www.becordial.com/gran-canaria-sur/cordial-santa-agueda/viviendas/';\n  return page.evaluate((fallbackUrl)=>{\n    const wanted=['Classic','Classic Duplex','Deluxe','Deluxe Duplex','Ocean Front','Beach Club House'];\n    const norm=value=>String(value||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/\\s+/g,' ').trim();\n    const visible=el=>!!(el&&(el.offsetWidth||el.offsetHeight||el.getClientRects().length));\n    const ownText=el=>[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>String(n.textContent||'')).join(' ').replace(/\\s+/g,' ').trim();\n    const result={};\n    for(const room of wanted){\n      const target=norm(room);\n      const candidates=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,div,span,p,strong,b')].filter(visible).filter(el=>norm(ownText(el)||el.textContent)===target);\n      let imageUrl='',detailUrl='';\n      for(const el of candidates){\n        let node=el;\n        for(let depth=0;node&&depth<7;depth++,node=node.parentElement){\n          if(!imageUrl){\n            const img=[...node.querySelectorAll('img')].find(visible);\n            if(img)imageUrl=String(img.currentSrc||img.src||'').trim();\n            if(!imageUrl){\n              const bg=[node,...node.querySelectorAll('*')].find(x=>{const v=getComputedStyle(x).backgroundImage;return visible(x)&&v&&v!=='none'&&/url\\(/i.test(v);});\n              const m=bg?String(getComputedStyle(bg).backgroundImage||'').match(/url\\([\"']?([^\"')]+)[\"']?\\)/i):null;\n              if(m)imageUrl=m[1];\n            }\n          }\n          if(!detailUrl){\n            const link=[...node.querySelectorAll('a[href]')].find(a=>/m[aá]s detalles|ver detalle|detalle/i.test(String(a.textContent||'')));\n            if(link)detailUrl=String(link.href||'').trim();\n          }\n          if(imageUrl&&detailUrl)break;\n          if(String(node.innerText||'').length>12000)break;\n        }\n        if(imageUrl||detailUrl)break;\n      }\n      result[room]={name:room,imageUrl,detailUrl:detailUrl||fallbackUrl};\n    }\n    return result;\n  },fallback).catch(()=>({}));\n}\n\nasync function diagnostic(page){\n  const inputs=await page.locator('input,select').evaluateAll(nodes=>nodes.slice(0,50).map(el=>({tag:el.tagName,name:el.getAttribute('name')||'',type:el.getAttribute('type')||'',placeholder:el.getAttribute('placeholder')||'',value:el.value||''}))).catch(()=>[]);\n  const forms=await page.locator('form').evaluateAll(nodes=>nodes.slice(0,12).map(f=>({action:f.action||'',method:(f.method||'get').toUpperCase(),id:f.id||'',name:f.getAttribute('name')||''}))).catch(()=>[]);\n  const actions=await page.locator('button,input[type=\"submit\"],[role=\"button\"]').evaluateAll(nodes=>nodes.slice(0,40).map(el=>({tag:el.tagName,text:(el.innerText||el.value||el.getAttribute('aria-label')||'').trim(),type:el.getAttribute('type')||'',visible:!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length)}))).catch(()=>[]);\n  return `URL final: ${page.url()}. Controles: ${inputs.map(x=>`${x.tag}:${x.name||x.placeholder||x.type}=${x.value}`).slice(0,18).join('; ')}. Formularios: ${forms.map(x=>`${x.method} ${x.action||'(sin action)'}${x.id?`#${x.id}`:''}`).join(' | ')||'ninguno'}. Botones: ${actions.map(x=>`${x.visible?'V':'H'}:${x.tag}:${x.text||x.type}`).slice(0,18).join(' | ')||'ninguno'}`;\n}\nexport async function monitorCordial(browser,config={}){\n  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:1440,height:1300},userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36'});const page=await context.newPage();\n  try{\n    const url=String(config.searchUrl||'https://www.becordial.com/gran-canaria-sur/cordial-santa-agueda/').trim();\n    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(1800);const cookiesReady=await acceptCordialCookies(page);if(!cookiesReady){await snapshot(page,'cordial-cookies-bloqueando').catch(()=>{});throw new Error('El panel de cookies de BeCordial sigue bloqueando el formulario y no se pudo cerrar automáticamente.');}\n    if(!/\\/booking\\/process\\/room/i.test(page.url())){\n      const hotelOk=await chooseHotel(page,config).catch(()=>false);\n      if(!hotelOk){const d=await diagnostic(page);throw new Error(`No se pudo inicializar por completo el destino/hotel de Cordial antes de buscar. ${d}`);}\n      const datesOk=await fillDateInputs(page,config).catch(()=>false);await setAdults(page,config).catch(()=>false);\n      if(!datesOk){const d=await diagnostic(page);throw new Error(`No se localizaron de forma fiable los campos de fechas del formulario público de Cordial. ${d}`);}\n      const submitted=await submitSearch(page);if(!submitted){const d=await diagnostic(page);throw new Error(`No se pudo enviar el formulario de reserva de Cordial. ${d}`);}\n    }\n    await page.waitForTimeout(900);\n    const roomReady=await ensureRoomResults(page,config).catch(()=>false);\n    if(!roomReady){await snapshot(page,'cordial-sin-llegar-habitaciones').catch(()=>{});const d=await diagnostic(page);throw new Error(`Cordial respondió a la búsqueda, pero no se pudo llegar a las habitaciones del hotel objetivo. ${d}`);}\n    console.log('[cordial] Hotel objetivo abierto: pantalla de habitaciones/tarifas disponible.');\n    await page.waitForTimeout(900);await selectClubTab(page).catch(()=>false);await page.waitForTimeout(650);\n    // Guardamos la pantalla REAL de resultados antes de interpretar nada. Si el lector vuelve\n    // a fallar, el artefacto contendrá por fin el DOM de las tarifas y no solo el buscador.\n    await snapshot(page,'cordial-resultados-bruto').catch(()=>{});\n    const body=await page.locator('body').innerText().catch(()=> '');\n    if(/captcha|verify you are human|comprobando su navegador|access denied/i.test(body))throw new Error('Cordial ha mostrado una verificación anti-bot durante la consulta.');\n    const headings=await page.locator('h1,h2,h3,h4,h5,h6').allTextContents().catch(()=>[]);\n    const domParsed=await parseCordialDom(page,headings,config);\n    const textOptions=parseCordialText(body,headings,config);\n    const options=normalizeCancellationLabels(mergeCordialOptions(domParsed.rows,textOptions));\n    const roomMeta=await extractRoomMeta(page);\n    console.log(`[cordial] Parser combinado: DOM=${domParsed.rows.length} · texto=${textOptions.length} · final=${options.length} · fichas habitación=${Object.values(roomMeta||{}).filter(x=>x?.imageUrl||x?.detailUrl).length}.`);\n    if(!options.length){await snapshot(page,'cordial-sin-opciones');const d=await diagnostic(page);throw new Error(`Cordial abrió el motor de reservas, pero no se pudieron interpretar tarifas. Se analizaron ${domParsed.contexts.length} botones Reservar. ${d}`);}\n    for(const row of options)row.target=false;\n    const target=selectTargetOption(options,config);\n    if(target)console.log(`[cordial] Objetivo ${target.targetMatch==='exact'?'exacto':'inferido'}: ${target.roomType} · ${target.rateName} · ${target.board} · ${Number(target.price).toFixed(2)} €`);\n    await snapshot(page,'cordial-resultados');\n    return {ok:true,status:'ok',source:'BeCordial · navegador real · GitHub Actions + Playwright',checkedAt:isoNow(),hotel:config.hotel||'Cordial Santa Águeda & Perchel Beach Club',checkIn:config.checkIn,checkOut:config.checkOut,adults:Number(config.adults)||2,options,roomMeta,target,targetPrice:Number(target?.price)||0,availability:target?'Disponible':'No encontrado',resultUrl:page.url()};\n  }finally{await context.close();}\n}\n\nexport const __cordialTest={parseCordialText,parseReserveContext,targetMatches,selectTargetOption,mergeCordialOptions,normalizeCancellationLabels,reservationOnline,positiveCancellation,normalize,fillDateInputs,forceControlValue,syncVisibleDateRange,submitSearch,formState,stabilizeBookingControls,bookingResultReady,roomRatesReady,destinationHotelListReady};\n";
const CORDIAL_RUN_FILE = "import fs from 'node:fs/promises';\nimport {chromium} from 'playwright';\nimport {isoNow,postResult,readTrackerLatest,successfulResultToday} from './lib.mjs';\nimport {monitorCordial} from './cordial.mjs';\n\nconst document=JSON.parse(await fs.readFile(new URL('./config.json',import.meta.url),'utf8'));\nconst config={enabled:true,scheduleTime:'06:35',scheduleTimeZone:'Europe/Madrid',...(document.cordial||{})};\nconst force=/^(1|true|yes)$/i.test(String(process.env.MFE_FORCE_RUN||''));\nif(config.enabled===false){console.log('Monitor Cordial desactivado desde MFE Viajes.');process.exit(0);}\nif(!force){\n  const previous=await readTrackerLatest('cordial');\n  if(successfulResultToday(previous.result)){\n    console.log(`[cordial] OMITIDO: ya existe una comprobación correcta de hoy (${previous.result.checkedAt||previous.result.receivedAt||'sin hora'}). El cron tardío no repetirá la consulta.`);\n    process.exit(0);\n  }\n}\n\nasync function launchInstalledChrome(){\n  const attempts=[];\n  try{\n    const browser=await chromium.launch({channel:'chrome',headless:true});\n    console.log('[cordial] Navegador: Google Chrome preinstalado (channel=chrome).');\n    return browser;\n  }catch(error){attempts.push(`channel=chrome: ${error?.message||String(error)}`);}\n\n  const candidates=[\n    process.env.CHROME_BIN,\n    '/usr/bin/google-chrome',\n    '/usr/bin/google-chrome-stable',\n    '/usr/bin/chromium',\n    '/usr/bin/chromium-browser'\n  ].filter(Boolean);\n  for(const executablePath of [...new Set(candidates)]){\n    try{\n      await fs.access(executablePath);\n      const browser=await chromium.launch({executablePath,headless:true});\n      console.log(`[cordial] Navegador: ${executablePath}.`);\n      return browser;\n    }catch(error){attempts.push(`${executablePath}: ${error?.message||String(error)}`);}\n  }\n  throw new Error(`No se pudo iniciar el Chrome/Chromium preinstalado del runner. ${attempts.join(' | ')}`);\n}\n\nconst browser=await launchInstalledChrome();\ntry{\n  const result=await monitorCordial(browser,config);\n  await postResult('cordial',{...result,checkedAt:result.checkedAt||isoNow()});\n  console.log('[cordial] OK',JSON.stringify(result,null,2));\n}catch(error){\n  const result={ok:false,status:'error',error:error?.message||String(error),checkedAt:isoNow(),source:'BeCordial · GitHub Actions + Playwright'};\n  console.error('[cordial] ERROR',error);\n  try{await postResult('cordial',result);}catch(postError){console.error('No se pudo registrar el error de Cordial en el Worker:',postError.message);}\n  process.exitCode=1;\n}finally{await browser.close();}\n";
const CORDIAL_WORKFLOW_TEMPLATE = "name: Cordial · MFE Viajes\n\non:\n  schedule:\n    - cron: '35 6 * * *'\n      timezone: \"Europe/Madrid\"\n  workflow_dispatch:\n    inputs:\n      force:\n        description: 'Forzar comprobación aunque ya exista una correcta hoy'\n        required: false\n        default: true\n        type: boolean\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: cordial-monitor\n  cancel-in-progress: false\n\njobs:\n  monitor:\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n    defaults:\n      run:\n        working-directory: monitoring\n    env:\n      MFE_WORKER_URL: ${{ secrets.MFE_WORKER_URL }}\n      MFE_MONITOR_SECRET: ${{ secrets.MFE_MONITOR_SECRET }}\n      MFE_FORCE_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.force || false }}\n      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n          cache: npm\n          cache-dependency-path: monitoring/package-lock.json\n      - name: Instalar dependencias Node\n        run: npm ci\n      - name: Comprobar Chrome preinstalado\n        shell: bash\n        run: |\n          set -e\n          if command -v google-chrome >/dev/null 2>&1; then\n            google-chrome --version\n          elif command -v google-chrome-stable >/dev/null 2>&1; then\n            google-chrome-stable --version\n          elif command -v chromium >/dev/null 2>&1; then\n            chromium --version\n          elif command -v chromium-browser >/dev/null 2>&1; then\n            chromium-browser --version\n          else\n            echo \"::error::El runner no tiene Chrome/Chromium preinstalado.\"\n            exit 1\n          fi\n      - name: Ejecutar monitor Cordial\n        run: node cordial-run.mjs\n      - name: Guardar diagnóstico si falla\n        if: failure()\n        uses: actions/upload-artifact@v4\n        with:\n          name: cordial-diagnostico\n          path: monitoring/artifacts/\n          if-no-files-found: ignore\n          retention-days: 7\n";
const CORDIAL_WORKFLOW_FILE = "cordial-monitor.yml";
const VUELING_WORKFLOW_FILE = "vueling-monitor.yml";
const MOBILE_DEPLOY_WORKFLOW_FILE = "mfe-mobile-deploy.yml";
const MOBILE_DEPLOY_RELEASE_PATH = "mobile-release/MFE_Viajes_RELEASE.zip";
const MOBILE_DEPLOY_WORKFLOW_TEMPLATE = "name: Actualizar MFE Viajes · móvil\nrun-name: \"MFE móvil · ${{ inputs.request_id }}\"\n\non:\n  workflow_dispatch:\n    inputs:\n      request_id:\n        description: \"Identificador interno de MFE Viajes\"\n        required: false\n        type: string\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: mfe-viajes-mobile-deploy\n  cancel-in-progress: false\n\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    timeout-minutes: 25\n    env:\n      RELEASE_ZIP: mobile-release/MFE_Viajes_RELEASE.zip\n    steps:\n      - name: Descargar repositorio\n        uses: actions/checkout@v4\n        with:\n          ref: ${{ github.ref_name }}\n          fetch-depth: 1\n\n      - name: Preparar Node\n        uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n\n      - name: Comprobar ZIP recibido desde MFE Viajes\n        shell: bash\n        run: |\n          set -euo pipefail\n          if [[ ! -f \"$RELEASE_ZIP\" ]]; then\n            echo \"::error::No existe $RELEASE_ZIP. Sube primero el ZIP desde Configuración → Servicios e integraciones → Actualización desde Android.\"\n            exit 1\n          fi\n          echo \"ZIP localizado: $(du -h \"$RELEASE_ZIP\" | cut -f1)\"\n\n      - name: Extraer versión\n        shell: bash\n        run: |\n          set -euo pipefail\n          RELEASE_DIR=\"$RUNNER_TEMP/mfe-release\"\n          rm -rf \"$RELEASE_DIR\"\n          mkdir -p \"$RELEASE_DIR\"\n          unzip -q \"$RELEASE_ZIP\" -d \"$RELEASE_DIR\"\n          test -f \"$RELEASE_DIR/firebase.json\"\n          test -f \"$RELEASE_DIR/public/index.html\"\n          echo \"RELEASE_DIR=$RELEASE_DIR\" >> \"$GITHUB_ENV\"\n\n      - name: Validar MFE Viajes antes de publicar\n        shell: bash\n        run: |\n          set -euo pipefail\n          cd \"$RELEASE_DIR\"\n          node scripts/validate-release.mjs\n\n      - name: Detectar si hay Workers modificados\n        id: workers\n        shell: bash\n        run: |\n          set -euo pipefail\n          if [[ -f \"$RELEASE_DIR/ACTUALIZAR_WORKERS.bat\" ]]; then\n            echo \"changed=true\" >> \"$GITHUB_OUTPUT\"\n            echo \"La release incluye cambios de Workers.\"\n          else\n            echo \"changed=false\" >> \"$GITHUB_OUTPUT\"\n            echo \"La release no requiere actualizar Workers.\"\n          fi\n\n      - name: Comprobar secretos Cloudflare\n        if: steps.workers.outputs.changed == 'true'\n        shell: bash\n        env:\n          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}\n        run: |\n          set -euo pipefail\n          [[ -n \"$CLOUDFLARE_API_TOKEN\" ]] || { echo \"::error::Falta el secret CLOUDFLARE_API_TOKEN.\"; exit 1; }\n          [[ -n \"$CLOUDFLARE_ACCOUNT_ID\" ]] || { echo \"::error::Falta el secret CLOUDFLARE_ACCOUNT_ID.\"; exit 1; }\n\n      - name: Actualizar Workers modificados\n        if: steps.workers.outputs.changed == 'true'\n        shell: bash\n        env:\n          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}\n        run: |\n          set -euo pipefail\n          cd \"$RELEASE_DIR\"\n          node scripts/update-workers-ci.mjs\n\n      - name: Comprobar credencial Firebase\n        shell: bash\n        env:\n          FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_MFE_VIAJES || secrets.FIREBASE_SERVICE_ACCOUNT_PRESUPUESTO_HOGAR_9DEAD }}\n        run: |\n          set -euo pipefail\n          [[ -n \"$FIREBASE_SERVICE_ACCOUNT_JSON\" ]] || { echo \"::error::Falta el secret FIREBASE_SERVICE_ACCOUNT_MFE_VIAJES (o el secret Firebase ya existente del proyecto).\"; exit 1; }\n\n      - name: Autenticar Google / Firebase\n        uses: google-github-actions/auth@v3\n        with:\n          credentials_json: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_MFE_VIAJES || secrets.FIREBASE_SERVICE_ACCOUNT_PRESUPUESTO_HOGAR_9DEAD }}\n\n      - name: Publicar Firebase Hosting\n        shell: bash\n        run: |\n          set -euo pipefail\n          cd \"$RELEASE_DIR\"\n          npx --yes firebase-tools@latest deploy --only hosting:viajes --project presupuesto-hogar-9dead --non-interactive\n\n      - name: Resumen\n        if: success()\n        shell: bash\n        run: |\n          VERSION=$(grep -oE 'MFE Viajes · v[0-9]+\\.[0-9]+\\.[0-9]+' \"$RELEASE_DIR/public/index.html\" | head -1 || true)\n          {\n            echo \"## ✅ MFE Viajes actualizada\"\n            echo\n            echo \"${VERSION:-Versión publicada correctamente.}\"\n            echo\n            if [[ \"${{ steps.workers.outputs.changed }}\" == \"true\" ]]; then\n              echo \"- Cloudflare Workers: actualizados y verificados\"\n            else\n              echo \"- Cloudflare Workers: sin cambios\"\n            fi\n            echo \"- Firebase Hosting: publicado\"\n          } >> \"$GITHUB_STEP_SUMMARY\"\n";
const POOLS_AUTOMATION_VERSION = "1.0.4";
const POOLS_WORKFLOW_FILE = "pools-monitor.yml";
const POOLS_FILE = "// MFE_POOLS_AUTOMATION_VERSION: 1.0.4\nimport fs from 'node:fs/promises';\nimport path from 'node:path';\nimport { chromium } from 'playwright';\nimport { postResult, snapshot, isoNow } from './lib.mjs';\n\nconst SOURCE_URL='https://cordial.galileus.es/gweb/siloe/diario/?token=NUEraFBKcnlEYzdUVVRobnRPMHc5Zz09';\nconst ARTIFACTS=path.resolve('artifacts/pools');\nconst clean=v=>String(v??'').replace(/\\u00a0/g,' ').replace(/\\s+/g,' ').trim();\nconst norm=v=>clean(v).normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();\nconst metricPattern=/(temperatura|temperature|temp\\.?\\b|ph\\b|cloro|chlorine|bromo|bromine|turbidez|turbidity|recirculaci[oó]n|recirculation|conductividad|conductivity|alcalinidad|alkalinity|redox|orp|salinidad|salinity)/i;\nconst measurementPattern=/(last measurement|ultima medici[oó]n|última medición|1st measurement|2nd measurement|1ª medici[oó]n|2ª medici[oó]n|primera medici[oó]n|segunda medici[oó]n)/i;\nconst placeholderPattern=/^(select|selecciona|seleccionar|choose|--+|piscina|pool)$/i;\n\nfunction safeMetricValue(v){\n  const value=clean(v);\n  if(!value||/^[-–—]+$/.test(value))return '';\n  return value;\n}\nfunction looksLikeMetricLabel(v){return metricPattern.test(clean(v));}\nfunction metricClass(label=''){\n  const n=norm(label);\n  if(/temperatura|temperature|temp\\b/.test(n))return 'temperature';\n  if(/\\bph\\b/.test(n))return 'ph';\n  if(/cloro|chlorine/.test(n))return 'chlorine';\n  if(/bromo|bromine/.test(n))return 'bromine';\n  return 'other';\n}\nfunction temperatureFromMetrics(metrics=[]){\n  for(const m of metrics){\n    if(metricClass(m.label)!=='temperature')continue;\n    const hit=String(m.value||'').replace(',','.').match(/-?\\d+(?:\\.\\d+)?/);\n    const n=hit?Number(hit[0]):NaN;\n    if(Number.isFinite(n)&&n>-5&&n<60)return n;\n  }\n  return null;\n}\nfunction metricNumber(value=''){\n  const hit=String(value??'').replace(',','.').match(/-?\\d+(?:\\.\\d+)?/);\n  return hit?Number(hit[0]):NaN;\n}\nfunction repairRecirculationMeasurements(measurements=[]){\n  const cloned=(measurements||[]).map(m=>({...m,metrics:(m.metrics||[]).map(metric=>({...metric}))}));\n  const latest=cloned.find(m=>/ultima|última|last/i.test(clean(m.measurement)))||cloned[0]||null;\n  const latestTurbidity=(latest?.metrics||[]).find(metric=>/turbidez|turbidity/i.test(clean(metric.label)));\n  const latestTurbidityValue=metricNumber(latestTurbidity?.value);\n  for(const measurement of cloned){\n    if(/ultima|última|last/i.test(clean(measurement.measurement)))continue;\n    const metrics=measurement.metrics||[];\n    if(metrics.some(metric=>/recirculaci[oó]n|recirculation/i.test(clean(metric.label))))continue;\n    // Galileus/SILOE ordena visualmente el índice de recirculación junto a la\n    // primera medición. En la vista móvil el DOM puede dejar el valor (p.ej. 4)\n    // bajo la etiqueta anterior \"Turbidez (UNF)\". Lo reparamos solo cuando el\n    // bloque no contiene otros parámetros, el valor es una hora entera plausible\n    // y la última turbidez real es un valor bajo/decimal.\n    if(metrics.length!==1)continue;\n    const metric=metrics[0];\n    if(!/turbidez|turbidity/i.test(clean(metric.label)))continue;\n    const value=metricNumber(metric.value);\n    if(!Number.isFinite(value)||!Number.isInteger(value)||value<1||value>24)continue;\n    if(!Number.isFinite(latestTurbidityValue)||latestTurbidityValue>=1)continue;\n    metric.label='Índice de recirculación (h)';\n  }\n  return cloned;\n}\nfunction makeMeasurementsFromMatrix(rows=[]){\n  const cleanRows=rows.map(r=>r.map(clean).filter((v,i,a)=>i===0||v!==''||a.length>1)).filter(r=>r.some(Boolean));\n  const metricRows=cleanRows.filter(r=>looksLikeMetricLabel(r[0]||''));\n  if(!metricRows.length)return [];\n  let headers=[];\n  for(const row of cleanRows){\n    if(row.some(cell=>measurementPattern.test(cell))){headers=row;break;}\n  }\n  const maxCols=Math.max(...metricRows.map(r=>Math.max(0,r.length-1)),1);\n  const out=[];\n  for(let col=0;col<maxCols;col++){\n    const metrics=[];\n    for(const row of metricRows){\n      const value=safeMetricValue(row[col+1]);\n      if(value)metrics.push({label:clean(row[0]),value});\n    }\n    if(!metrics.length)continue;\n    const label=clean(headers[col+1])||['Última medición','1.ª medición','2.ª medición'][col]||`Medición ${col+1}`;\n    out.push({measurement:label,date:'',time:'',metrics,temperature:temperatureFromMetrics(metrics)});\n  }\n  return out;\n}\nfunction makeMeasurementsFromLines(lines=[]){\n  const rows=lines.map(clean).filter(Boolean);\n  const metricIndices=[];\n  for(let i=0;i<rows.length;i++)if(looksLikeMetricLabel(rows[i]))metricIndices.push(i);\n  if(!metricIndices.length)return [];\n  const found=[];\n  let maxValues=0;\n  for(const idx of metricIndices){\n    const label=rows[idx];const values=[];\n    for(let j=idx+1;j<Math.min(rows.length,idx+8);j++){\n      if(looksLikeMetricLabel(rows[j]))break;\n      if(measurementPattern.test(rows[j]))continue;\n      const value=safeMetricValue(rows[j]);\n      if(!value)continue;\n      if(/^(pool measurements|mediciones|go back|volver)$/i.test(value))continue;\n      if(/^-?\\d+(?:[.,]\\d+)?(?:\\s*°?c|\\s*ppm|\\s*mg\\/l|\\s*(?:ntu|unf|fnu|unt)|\\s*µs\\/cm)?$/i.test(value)||/\\b\\d{1,2}:\\d{2}\\b/.test(value)||/\\b\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{2,4}\\b/.test(value))values.push(value);\n      if(values.length>=3)break;\n    }\n    if(values.length){found.push({label,values});maxValues=Math.max(maxValues,values.length);}\n  }\n  const measurements=[];\n  for(let col=0;col<maxValues;col++){\n    const metrics=[];\n    for(const row of found){const value=safeMetricValue(row.values[col]);if(value)metrics.push({label:row.label,value});}\n    if(metrics.length)measurements.push({measurement:['Última medición','1.ª medición','2.ª medición'][col]||`Medición ${col+1}`,date:'',time:'',metrics,temperature:temperatureFromMetrics(metrics)});\n  }\n  return measurements;\n}\nasync function extractPool(page,poolName='Piscina'){\n  const tables=await page.locator('table').evaluateAll(nodes=>nodes.map(table=>[...table.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(td=>String(td.innerText||td.textContent||'').trim())).filter(row=>row.length))).catch(()=>[]);\n  for(const rows of tables){const measurements=makeMeasurementsFromMatrix(rows);if(measurements.length)return {name:clean(poolName)||'Piscina',measurements};}\n  const text=await page.locator('body').innerText().catch(()=> '');\n  const measurements=makeMeasurementsFromLines(String(text).split(/\\r?\\n/));\n  return measurements.length?{name:clean(poolName)||'Piscina',measurements}:null;\n}\nasync function selectDescriptors(page){\n  return page.locator('select').evaluateAll(nodes=>nodes.map((s,index)=>{\n    const label=(s.labels&&s.labels[0]?.innerText)||s.getAttribute('aria-label')||s.getAttribute('name')||s.id||'';\n    const parent=String(s.parentElement?.innerText||'').slice(0,350);\n    return {index,name:s.getAttribute('name')||'',id:s.id||'',label:String(label).trim(),parent,options:[...s.options].map(o=>({value:String(o.value||''),text:String(o.textContent||'').trim(),disabled:Boolean(o.disabled)}))};\n  })).catch(()=>[]);\n}\nfunction choosePoolSelect(selects=[]){\n  const scored=selects.map(s=>{\n    const options=(s.options||[]).filter(o=>!o.disabled&&clean(o.text)&&!placeholderPattern.test(clean(o.text)));\n    const context=norm(`${s.name} ${s.id} ${s.label} ${s.parent}`);\n    let score=options.length*5;if(/pisc|pool|vaso/.test(context))score+=100;if(/select|selecc/.test(context))score+=10;\n    return {...s,options,score};\n  }).filter(s=>s.options.length);\n  scored.sort((a,b)=>b.score-a.score);return scored[0]||null;\n}\nasync function customOptions(page){\n  const selectTrigger=page.getByText(/^Select$/i).first();\n  if(await selectTrigger.isVisible().catch(()=>false)){await selectTrigger.click({force:true}).catch(()=>{});await page.waitForTimeout(400);}\n  const selectors=['[role=\"option\"]','.dropdown-menu a','.dropdown-menu button','.dropdown-menu li','.select2-results__option','.choices__item--choice','.bootstrap-select .dropdown-menu li a'];\n  const seen=new Map();\n  for(const selector of selectors){\n    const loc=page.locator(selector);const count=Math.min(await loc.count().catch(()=>0),50);\n    for(let i=0;i<count;i++){\n      const el=loc.nth(i);if(!await el.isVisible().catch(()=>false))continue;\n      const text=clean(await el.innerText().catch(()=>''));if(!text||placeholderPattern.test(text)||measurementPattern.test(text)||text.length>100)continue;\n      if(!seen.has(text))seen.set(text,{text,selector,index:i});\n    }\n  }\n  return [...seen.values()];\n}\nasync function collectNetworkResponses(page){\n  const items=[];\n  page.on('response',async response=>{\n    try{\n      const req=response.request();if(!['xhr','fetch'].includes(req.resourceType()))return;\n      const url=response.url();if(!/galileus|siloe|diario|pisc|pool|medic|measure/i.test(url))return;\n      const ct=response.headers()['content-type']||'';if(!/json|text|html|javascript/i.test(ct))return;\n      const text=await response.text();if(text.length>160000)return;\n      items.push({url,status:response.status(),contentType:ct,body:text.slice(0,160000)});\n    }catch{}\n  });\n  return items;\n}\nfunction poolsFromNetwork(items=[]){\n  const out=[];\n  const walk=(value,path='')=>{\n    if(Array.isArray(value)){for(const [i,v] of value.entries())walk(v,`${path}[${i}]`);return;}\n    if(!value||typeof value!=='object')return;\n    const entries=Object.entries(value);const flat=Object.fromEntries(entries.map(([k,v])=>[norm(k),v]));\n    const name=clean(flat.piscina||flat.pool||flat.nombre||flat.name||flat.vaso||flat.descripcion||'');\n    const metrics=[];\n    for(const [k,v] of entries){if(looksLikeMetricLabel(k)&&['string','number'].includes(typeof v))metrics.push({label:clean(k),value:clean(v)});}\n    if(name&&metrics.length)out.push({name,measurements:[{measurement:'Última medición',date:'',time:'',metrics,temperature:temperatureFromMetrics(metrics)}]});\n    for(const [k,v] of entries)if(v&&typeof v==='object')walk(v,`${path}.${k}`);\n  };\n  for(const item of items){\n    try{walk(JSON.parse(item.body));}catch{}\n  }\n  return out;\n}\nfunction mergePools(list=[]){\n  const map=new Map();\n  for(const pool of list){\n    const name=clean(pool?.name)||'Piscina';const key=norm(name);if(!map.has(key))map.set(key,{name,measurements:[]});\n    const target=map.get(key);\n    for(const m of pool.measurements||[]){\n      const sig=JSON.stringify((m.metrics||[]).map(x=>[norm(x.label),clean(x.value)]));if(!target.measurements.some(x=>JSON.stringify((x.metrics||[]).map(y=>[norm(y.label),clean(y.value)]))===sig))target.measurements.push(m);\n    }\n  }\n  return [...map.values()].filter(p=>p.measurements.some(m=>(m.metrics||[]).length)).map(p=>{const measurements=repairRecirculationMeasurements(p.measurements);const latest=measurements.find(m=>/ultima|última|last/i.test(clean(m.measurement)))||measurements[0]||{};const temperature=latest.temperature??temperatureFromMetrics(latest.metrics||[]);return {...p,measurements,latest,temperature};});\n}\nasync function scrapePools(page){\n  const network=await collectNetworkResponses(page);\n  await page.goto(SOURCE_URL,{waitUntil:'domcontentloaded',timeout:45000});\n  await page.waitForTimeout(2500);\n  await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});\n  await snapshot(page,'pools/01-inicial').catch(()=>{});\n  const diagnostics={selects:0,options:0,customOptions:0,networkResponses:0,attempted:0,mode:'',url:page.url()};\n  let pools=[];\n  let selects=await selectDescriptors(page);diagnostics.selects=selects.length;\n  const chosen=choosePoolSelect(selects);\n  if(chosen){\n    diagnostics.mode='select';diagnostics.options=chosen.options.length;\n    for(const option of chosen.options.slice(0,30)){\n      diagnostics.attempted++;\n      try{\n        const current=choosePoolSelect(await selectDescriptors(page));if(!current)break;\n        const loc=page.locator('select').nth(current.index);\n        await loc.selectOption(option.value?{value:option.value}:{label:option.text});\n        await page.waitForTimeout(900);await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});\n        const pool=await extractPool(page,option.text);if(pool)pools.push(pool);\n      }catch(error){diagnostics[`option${diagnostics.attempted}Error`]=String(error?.message||error).slice(0,180);}\n    }\n  }else{\n    const options=await customOptions(page);diagnostics.customOptions=options.length;diagnostics.mode=options.length?'custom':'single';\n    if(options.length){\n      for(const option of options.slice(0,24)){\n        diagnostics.attempted++;\n        try{\n          await page.goto(SOURCE_URL,{waitUntil:'domcontentloaded',timeout:45000});await page.waitForTimeout(1200);\n          const trigger=page.getByText(/^Select$/i).first();if(await trigger.isVisible().catch(()=>false)){await trigger.click({force:true});await page.waitForTimeout(250);}\n          const candidate=page.getByText(option.text,{exact:true}).last();if(!await candidate.isVisible().catch(()=>false))continue;\n          await candidate.click({force:true});await page.waitForTimeout(900);await page.waitForLoadState('networkidle',{timeout:5000}).catch(()=>{});\n          const pool=await extractPool(page,option.text);if(pool)pools.push(pool);\n        }catch(error){diagnostics[`custom${diagnostics.attempted}Error`]=String(error?.message||error).slice(0,180);}\n      }\n    }else{\n      const pool=await extractPool(page,'Piscina');if(pool)pools.push(pool);\n    }\n  }\n  await page.waitForTimeout(250);diagnostics.networkResponses=network.length;\n  pools.push(...poolsFromNetwork(network));\n  pools=mergePools(pools);\n  diagnostics.detectedPools=pools.length;\n  await fs.mkdir(ARTIFACTS,{recursive:true});\n  await fs.writeFile(path.join(ARTIFACTS,'diagnostic.json'),JSON.stringify({diagnostics,network:network.map(x=>({url:x.url,status:x.status,contentType:x.contentType,preview:x.body.slice(0,1000)}))},null,2),'utf8').catch(()=>{});\n  await snapshot(page,'pools/99-final').catch(()=>{});\n  return {source:'Galileus · SILOE · navegador real',sourceUrl:SOURCE_URL,fetchedAt:isoNow(),pools,diagnostics,warning:pools.length?'':`Galileus abrió correctamente, pero no se pudieron interpretar piscinas. Modo ${diagnostics.mode} · selectores ${diagnostics.selects} · opciones ${diagnostics.options||diagnostics.customOptions} · intentos ${diagnostics.attempted} · respuestas de red ${diagnostics.networkResponses}.`};\n}\n\nlet browser;\ntry{\n  try{browser=await chromium.launch({headless:true,channel:'chrome'});}catch{browser=await chromium.launch({headless:true});}\n  const context=await browser.newContext({locale:'es-ES',timezoneId:'Atlantic/Canary',viewport:{width:430,height:932},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 16; GC26 Pool Monitor) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Mobile Safari/537.36'});\n  const page=await context.newPage();\n  try{\n    const result=await scrapePools(page);\n    result.ok=true;result.status='ok';result.checkedAt=result.fetchedAt;\n    await postResult('pools',result);\n    console.log('[pools] OK',JSON.stringify({count:result.pools.length,diagnostics:result.diagnostics}));\n  }catch(error){\n    const result={ok:false,status:'error',source:'Galileus · SILOE · navegador real',sourceUrl:SOURCE_URL,checkedAt:isoNow(),fetchedAt:isoNow(),pools:[],error:String(error?.message||error),diagnostics:{fatal:true}};\n    await snapshot(page,'pools/99-error').catch(()=>{});await postResult('pools',result).catch(()=>{});console.error('[pools] ERROR',error);process.exitCode=1;\n  }finally{await context.close().catch(()=>{});}\n}finally{await browser?.close().catch(()=>{});}\n";
const POOLS_WORKFLOW_TEMPLATE = "name: Piscinas \u00b7 MFE Viajes\n\non:\n  schedule:\n    - cron: '10 8,12,16,20 * * *'\n      timezone: \"Atlantic/Canary\"\n  workflow_dispatch:\n    inputs:\n      force:\n        description: \"Forzar comprobaci\u00f3n\"\n        required: false\n        default: \"true\"\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: mfe-pools-monitor\n  cancel-in-progress: false\n\njobs:\n  monitor:\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n    defaults:\n      run:\n        working-directory: monitoring\n    env:\n      MFE_WORKER_URL: ${{ secrets.MFE_WORKER_URL }}\n      MFE_MONITOR_SECRET: ${{ secrets.MFE_MONITOR_SECRET }}\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: '22'\n          cache: npm\n          cache-dependency-path: monitoring/package-lock.json\n      - name: Instalar dependencias Node\n        run: npm ci\n      - name: Comprobar Chrome preinstalado\n        shell: bash\n        run: |\n          set -e\n          if command -v google-chrome >/dev/null 2>&1; then\n            google-chrome --version\n          elif command -v google-chrome-stable >/dev/null 2>&1; then\n            google-chrome-stable --version\n          else\n            echo \"::error::El runner no tiene Google Chrome preinstalado.\"\n            exit 1\n          fi\n      - name: Leer piscinas de Galileus\n        run: node pools.mjs\n      - name: Guardar diagn\u00f3stico siempre\n        if: always()\n        uses: actions/upload-artifact@v4\n        with:\n          name: piscinas-diagnostico-${{ github.run_number }}\n          path: monitoring/artifacts/pools/\n          if-no-files-found: ignore\n          retention-days: 7\n";

const MONITOR_FALLBACK_TIME_ZONE = "Europe/Madrid";
const MONITOR_FALLBACK_LOCAL_HOUR = 7;
const MONITOR_FALLBACK_LOCAL_MINUTE = 15;
const MONITOR_FALLBACK_TRACKERS = [
  {id:"autoreisen",label:"AutoReisen",workflowEnv:"GITHUB_WORKFLOW_FILE",workflowDefault:"autoreisen-monitor.yml",inputs:{force:"true",telegram_test:"false",fleet_only:"false",request_id:"",fleet_config_json:""}},
  {id:"cordial",label:"Cordial",workflowEnv:"GITHUB_CORDIAL_WORKFLOW_FILE",workflowDefault:CORDIAL_WORKFLOW_FILE,inputs:{force:"true"}},
  {id:"vueling",label:"Vueling",workflowEnv:"GITHUB_VUELING_WORKFLOW_FILE",workflowDefault:VUELING_WORKFLOW_FILE,inputs:{force:"true",telegram_test:"false"}}
];

const TRAVEL_WEBCAM_PAGES = {
  "santa-agueda": {
    title:"Santa Águeda · El Pajar",
    provider:"in2theBeach",
    urls:["https://in2thebeach.es/webcam/71/el-pajar-santa-agueda-arguineguin/"]
  },
  "el-perchel": {
    title:"Playa de El Perchel",
    provider:"SkylineWebcams",
    urls:[
      "https://www.skylinewebcams.com/es/webcam/espana/canarias/las-palmas-gran-canaria/arguineguin-playa-de-el-perchel.html"
    ]
  }
};
function webcamAbsoluteUrl(value,base){try{return new URL(String(value||'').replace(/&amp;/g,'&').replace(/\\\//g,'/'),base).href;}catch{return '';}}
function webcamUnsafeAsset(url=''){
  try{const u=new URL(url),p=u.pathname.toLowerCase();return /\.(?:js|mjs|css|json|map|txt|xml|woff2?|ttf|otf)(?:$|\?)/i.test(p);}catch{return true;}
}
function webcamCandidatesFromHtml(html,pageUrl){
  const text=String(html||'').replace(/\\u0026/g,'&').replace(/\\\//g,'/'),items=[];
  const add=(raw,mode,score,note='')=>{
    const url=webcamAbsoluteUrl(raw,pageUrl);if(!url||!/^https?:/i.test(url)||webcamUnsafeAsset(url))return;
    const lower=url.toLowerCase();
    if(/doubleclick|googlesyndication|analytics|googletagmanager|facebook|instagram|twitter|cookie|windy|windguru|google\.com\/maps|maps\.google/.test(lower))return;
    if(/logo|favicon|sprite|avatar|sponsor|banner|icon-|\.svg(?:$|\?)/i.test(lower))score-=80;
    if(/\.m3u8(?:$|\?)/i.test(url)){mode='video';score+=160;}
    else if(/\.mp4(?:$|\?)/i.test(url)){mode='video';score+=130;}
    else if(/\.(?:jpe?g|webp|png)(?:$|\?)/i.test(url)){mode='image';score+=25;}
    if(/youtube\.com\/embed|youtu\.be/i.test(url)){mode='iframe';score+=110;}
    if(/(?:^|\.)embed\./i.test(new URL(url).hostname)||/\/(?:embed|player|stream)(?:\/|$|[?_-])/i.test(new URL(url).pathname)){if(mode==='iframe')score+=140;}
    if(/embed|stream|live|webcam|camera|snapshot|photogram|player/.test(lower))score+=55;
    if(/embed\.skylinewebcams\.com\/img\/\d+\.(?:jpe?g|webp)/i.test(url)){mode='image';score+=220;note=note||'Fotograma oficial de Skyline, actualizado periódicamente.';}
    if(/canariaslife\.com/.test(lower)&&/webcam|camara|camera/.test(lower))score+=20;
    items.push({url,mode,score,note,sourcePage:pageUrl});
  };
  for(const match of text.matchAll(/<iframe[^>]+(?:src|data-src)=['\"]([^'\"]+)['\"][^>]*>/gi))add(match[1],'iframe',120,'Reproductor oficial incrustado.');
  for(const match of text.matchAll(/<(?:video|source)[^>]+(?:src|data-src)=['\"]([^'\"]+)['\"][^>]*>/gi))add(match[1],'video',110);
  for(const match of text.matchAll(/<(?:div|a|button|section)[^>]+(?:data-url|data-src|data-video|data-player|data-embed|data-stream)=['\"]([^'\"]+)['\"][^>]*>/gi))add(match[1],'iframe',80,'Reproductor detectado en el widget de la cámara.');
  for(const match of text.matchAll(/['\"](?:src|url|embed|player|stream|file|videoUrl|embedUrl)['\"]\s*:\s*['\"]([^'\"]+)['\"]/gi))add(match[1],'iframe',65,'Reproductor detectado en la configuración de la página.');
  for(const match of text.matchAll(/<meta[^>]+(?:property|name)=['\"](?:og:image|twitter:image)['\"][^>]+content=['\"]([^'\"]+)['\"][^>]*>/gi))add(match[1],'image',45,'Imagen publicada por el proveedor.');
  for(const match of text.matchAll(/<meta[^>]+content=['\"]([^'\"]+)['\"][^>]+(?:property|name)=['\"](?:og:image|twitter:image)['\"][^>]*>/gi))add(match[1],'image',45,'Imagen publicada por el proveedor.');
  for(const match of text.matchAll(/<img[^>]+(?:src|data-src|data-original)=['\"]([^'\"]+)['\"][^>]*>/gi))add(match[1],'image',10);
  for(const match of text.matchAll(/https?:[^\"'<>\s]+?\.m3u8(?:\?[^\"'<>\s]*)?/gi))add(match[0],'video',150);
  for(const match of text.matchAll(/https?:[^\"'<>\s]+?\.mp4(?:\?[^\"'<>\s]*)?/gi))add(match[0],'video',125);
  for(const match of text.matchAll(/(?:https?:)?\/\/embed\.skylinewebcams\.com\/img\/\d+\.(?:jpe?g|webp)(?:\?[^\"'<>\s]*)?/gi))add(match[0].startsWith('//')?'https:'+match[0]:match[0],'image',240,'Fotograma oficial de Skyline, actualizado periódicamente.');
  for(const match of text.matchAll(/https?:[^\"'<>\s]+?(?:youtube\.com\/embed)[^\"'<>\s]*/gi))add(match[0],'iframe',100);
  const uniq=new Map();for(const item of items){const prev=uniq.get(item.url);if(!prev||item.score>prev.score)uniq.set(item.url,item);}return [...uniq.values()].sort((a,b)=>b.score-a.score);
}
async function fetchWebcamSource(url){
  const response=await fetch(url,{redirect:'follow',headers:{
    'User-Agent':'Mozilla/5.0 (Linux; Android 16; GC26) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
    'Accept':'text/html,application/xhtml+xml',
    'Accept-Language':'es-ES,es;q=0.9,en;q=0.6'
  }});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  return {url:response.url||url,html:await response.text()};
}
async function collectWebcamCandidates(def){
  const rows=[],errors=[];
  for(const url of def.urls||[]){
    try{const page=await fetchWebcamSource(url);rows.push(...webcamCandidatesFromHtml(page.html,page.url));}
    catch(error){errors.push(`${url}: ${error?.message||error}`);}
  }
  const uniq=new Map();for(const item of rows){const prev=uniq.get(item.url);if(!prev||item.score>prev.score)uniq.set(item.url,item);}return {candidates:[...uniq.values()].sort((a,b)=>b.score-a.score),errors};
}
function webcamIsOrdinaryPage(item){
  try{
    const target=new URL(String(item?.url||'')),source=new URL(String(item?.sourcePage||item?.url||''));
    const path=target.pathname.replace(/\/+$/,'').toLowerCase(),sourcePath=source.pathname.replace(/\/+$/,'').toLowerCase();
    if(target.origin===source.origin&&path===sourcePath)return true;
    if(/(^|\.)canariaslife\.com$/i.test(target.hostname)&&/^\/camaras-de-gran-canaria\//i.test(path))return true;
    if(/(^|\.)skylinewebcams\.com$/i.test(target.hostname)&&/\/(?:[a-z]{2}\/)?webcam\//i.test(path))return true;
    if(/\.html?$/i.test(path)&&!/embed|player|stream|live/i.test(path))return true;
    return false;
  }catch{return true;}
}
function webcamPlayableCandidate(candidates=[],key=''){
  const videos=candidates.filter(item=>item.mode==='video'&&!webcamIsOrdinaryPage(item)&&/\.(?:m3u8|mp4)(?:$|\?)/i.test(item.url||''));
  if(videos.length)return videos[0];
  const frames=candidates.filter(item=>item.mode==='iframe'&&!webcamIsOrdinaryPage(item));
  if(key==='el-perchel'){
    // Skyline no permite a terceros incrustar la emisión salvo a los hosts. Solo aceptar un embed oficial inequívoco;
    // jamás una página normal de Skyline/CanariasLife.
    return frames.find(item=>{try{const u=new URL(item.url);return /(^|\.)embed\.skylinewebcams\.com$/i.test(u.hostname)&&u.pathname!=='/'&&!/\/img\//i.test(u.pathname);}catch{return false;}})||null;
  }
  return frames[0]||null;
}
function webcamImageCandidate(candidates=[]){
  const images=candidates.filter(item=>item.mode==='image'&&!webcamUnsafeAsset(item.url)&&!/logo|favicon|sprite|avatar|sponsor|banner|icon-/i.test(item.url));
  return images.find(item=>/embed\.skylinewebcams\.com\/img\//i.test(item.url))
    ||images.find(item=>/snapshot|photogram|webcam|camera|live/i.test(item.url))
    ||images.find(item=>/skylinewebcams\.com|canariaslife\.com/i.test(item.url))
    ||null;
}
async function travelWebcamImageProxy(payload){
  const key=String(payload?.key||'').trim(),def=TRAVEL_WEBCAM_PAGES[key];if(!def)throw new ApiError(400,'Webcam no válida.');
  const {candidates}=await collectWebcamCandidates(def),best=webcamImageCandidate(candidates);
  if(!best)throw new ApiError(404,'No se ha encontrado ahora un fotograma válido de la webcam.');
  // Skyline/CDN puede conservar durante horas la misma respuesta para la URL estable del JPG.
  // Pedimos cada fotograma con una URL única y desactivamos la caché tanto en origen como en Cloudflare.
  const upstream=new URL(best.url);
  upstream.searchParams.set('_mfe',String(Date.now()));
  const response=await fetch(upstream.href,{redirect:'follow',headers:{
    'User-Agent':'Mozilla/5.0 (Linux; Android 16; GC26) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
    'Accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Referer':best.sourcePage||def.urls?.[0]||'',
    'Cache-Control':'no-cache, no-store, max-age=0',
    'Pragma':'no-cache'
  },cf:{cacheTtl:0,cacheEverything:false}});
  if(!response.ok)throw new ApiError(502,`El fotograma respondió HTTP ${response.status}.`);
  const contentType=response.headers.get('content-type')||'image/jpeg';
  if(!/^image\//i.test(contentType))throw new ApiError(502,'El proveedor no devolvió una imagen válida.');
  return new Response(response.body,{status:200,headers:{
    ...CORS_HEADERS,
    'Content-Type':contentType,
    'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',
    'CDN-Cache-Control':'no-store',
    'Surrogate-Control':'no-store',
    'X-MFE-Webcam-Source':best.sourcePage||''
  }});
}
async function travelWebcamResponse(payload,request){
  const key=String(payload?.key||'').trim(),def=TRAVEL_WEBCAM_PAGES[key];if(!def)throw new ApiError(400,'Webcam no válida.');
  const {candidates,errors}=await collectWebcamCandidates(def);
  const preferImage=payload?.preferImage===true||String(payload?.preferImage||'').toLowerCase()==='true';
  let best=preferImage?null:webcamPlayableCandidate(candidates,key),live=Boolean(best),refreshMs=0,note='';
  if(!best){
    const image=webcamImageCandidate(candidates);
    if(image){
      const proxy=new URL(request.url);proxy.search='';proxy.searchParams.set('action','webcam-image');proxy.searchParams.set('key',key);
      best={...image,mode:'image',url:proxy.href};live=false;refreshMs=300000;note='Fotograma oficial de Skyline servido por GC 26. Skyline reserva la incrustación del vídeo en directo a los anfitriones de la cámara.';
    }
  }
  if(!best)throw new ApiError(404,`${def.provider} no expone ahora un reproductor o imagen compatible.${errors.length?` ${errors.join(' · ')}`:''}`);
  return json({ok:true,key,title:def.title,provider:def.provider,sourcePage:best.sourcePage||def.urls?.[0]||'',mode:best.mode,url:best.url,note:note||best.note||'',refreshMs,live,workerVersion:WORKER_VERSION});
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runMonitorFallbackCheck(env,{scheduledAt:new Date(controller?.scheduledTime||Date.now()),source:`cron:${String(controller?.cron||"")}`}));
  },
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
    try {
      const payload = await readPayload(request);
      if (payload.action === "image") return await proxyImage(payload.url);
      if (payload.action === "product-image") return await proxyProductImage(payload.url, payload.productName||"");
      if (payload.action === "fuel") return await fuelResponse();
      if (payload.action === "autoreisen" || payload.action === "cordial" || payload.action === "pools" || payload.action === "autoreisen-stage2" || payload.action === "dunas") {
        return await readTrackerResult(env, payload.action);
      }
      if (payload.action === "webcam") {
        return await travelWebcamResponse(payload, request);
      }
      if (payload.action === "webcam-image") {
        return await travelWebcamImageProxy(payload);
      }
      if (payload.action === "monitor-write") {
        return await writeTrackerResult(request, env, payload);
      }
      if (payload.action === "monitor-history") {
        return await readTrackerHistory(env, payload.type);
      }
      if (payload.action === "monitor-health") {
        return json({ok:true,service:"MFE Viajes · Seguimientos",version:WORKER_VERSION,kvConfigured:Boolean(env?.MFE_TRACKERS),fallbackCron:true,fallbackLocalTime:"07:15",fallbackTimeZone:MONITOR_FALLBACK_TIME_ZONE});
      }
      if (payload.action === "monitor-fallback-status") {
        return await monitorFallbackStatus(env);
      }
      if (payload.action === "monitor-fallback-run") {
        await verifyFirebaseUser(request,env);
        return json(await runMonitorFallbackCheck(env,{scheduledAt:new Date(),source:"manual",force:true}));
      }
      if (payload.action === "integration-health") {
        return integrationHealth(env);
      }
      if (payload.action === "drive-auth-status") {
        return await driveAuthStatus(request, env);
      }
      if (payload.action === "drive-auth-exchange") {
        return await driveAuthExchange(request, env, payload);
      }
      if (payload.action === "drive-auth-token") {
        return await driveAuthToken(request, env);
      }
      if (payload.action === "drive-auth-disconnect") {
        return await driveAuthDisconnect(request, env);
      }
      if (payload.action === "autoreisen-options") {
        return await autoreisenOptionsResponse(request, env, payload);
      }
      if (payload.action === "autoreisen-fleet-result") {
        return await readAutoreisenFleetResult(request, env, payload);
      }
      if (payload.action === "github-sync-autoreisen") {
        return await syncAutoreisenToGitHub(request, env, payload);
      }
      if (payload.action === "github-autoreisen-install") {
        return await installAutoreisenAutomation(request, env, payload);
      }
      if (payload.action === "github-autoreisen-run") {
        return await runAutoreisenWorkflow(request, env, payload);
      }
      if (payload.action === "github-stage-monitor-sync") {
        return await syncStageMonitorToGitHub(request,env,payload);
      }
      if (payload.action === "github-stage-monitor-run") {
        return await dispatchStageMonitor(request,env,payload);
      }
      if (payload.action === "github-autoreisen-status") {
        return await autoreisenAutomationStatus(request, env);
      }
      if (payload.action === "github-sync-cordial") {
        return await syncCordialToGitHub(request, env, payload);
      }
      if (payload.action === "github-cordial-install") {
        return await installCordialAutomation(request, env, payload);
      }
      if (payload.action === "github-cordial-run") {
        return await runCordialWorkflow(request, env, payload);
      }
      if (payload.action === "github-cordial-status") {
        return await cordialAutomationStatus(request, env);
      }
      if (payload.action === "github-pools-install") {
        return await installPoolsAutomation(request, env);
      }
      if (payload.action === "github-pools-run") {
        return await runPoolsWorkflow(request, env);
      }
      if (payload.action === "github-pools-status") {
        return await poolsAutomationStatus(request, env);
      }
      if (payload.action === "flightops-read") {
        return await readFlightOpsResult(env);
      }
      if (payload.action === "flightops-live") {
        return await liveFlightOpsResult(request, env, payload);
      }
      if (payload.action === "flightops-write") {
        return await writeFlightOpsResult(request, env, payload);
      }
      if (payload.action === "github-flightops-sync") {
        return await syncFlightOpsToGitHub(request, env, payload);
      }
      if (payload.action === "github-flightops-install") {
        return await installFlightOpsAutomation(request, env, payload);
      }
      if (payload.action === "github-flightops-run") {
        return await runFlightOpsWorkflow(request, env, payload);
      }
      if (payload.action === "github-flightops-status") {
        return await flightOpsAutomationStatus(request, env);
      }
      if (payload.action === "github-remove-vueling-workflows") {
        return await removeLegacyVuelingWorkflows(request, env);
      }
      if (payload.action === "github-mobile-deploy-status") {
        return await mobileDeployStatus(request, env);
      }
      if (payload.action === "github-mobile-deploy-install") {
        return await installMobileDeployWorkflow(request, env);
      }
      if (payload.action === "github-mobile-release-upload-init") {
        return await initMobileReleaseUpload(request, env, payload);
      }
      if (payload.action === "github-mobile-release-upload-chunk") {
        return await storeMobileReleaseChunk(request, env, payload);
      }
      if (payload.action === "github-mobile-release-upload-finalize") {
        return await finalizeMobileReleaseUpload(request, env, payload);
      }
      if (payload.action === "github-mobile-release-upload") {
        return await uploadMobileReleaseAndDispatch(request, env, payload);
      }
      if (payload.action === "github-mobile-deploy-trigger") {
        return await triggerMobileDeployWorkflow(request, env, payload);
      }
      if (payload.action === "github-mobile-deploy-run-status") {
        return await mobileDeployRunStatus(request, env, payload);
      }
      if (payload.action === "github-tracker-run-status") {
        return await trackerRunStatus(request, env, payload);
      }
      if (payload.action === "github-auth-diagnostic") {
        return await githubAuthDiagnostic(request, env);
      }
      if (!payload.url) {
        return json({ok:true,service:"MFE Viajes · Worker",version:WORKER_VERSION,message:"Worker activo."});
      }
      const target = new URL(payload.url);
      if (!['http:', 'https:'].includes(target.protocol)) throw new ApiError(400, "Solo se admiten enlaces http o https.");
      if (!isAllowedShop(target.hostname)) throw new ApiError(400, `Tienda no autorizada: ${target.hostname}`);
      const product = await readProductFromUrl(target, {hintName:payload.productName||"",postalCode:payload.postalCode||""});
      return json({ok:true,source:target.hostname,name:product.name||"",image:product.image||"",price:Number.isFinite(product.price)?product.price:null,currency:product.currency||"EUR",message:product.message||"",diagnostic:product.diagnostic||null});
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      return json({ok:false,error:error?.message||"Error interno del Worker."}, status);
    }
  }
};

async function readPayload(request) {
  const requestUrl = new URL(request.url);
  if (request.method === "GET") {
    return {
      action: requestUrl.searchParams.get("action") || "",
      key: requestUrl.searchParams.get("key") || "",
      type: requestUrl.searchParams.get("type") || "",
      url: requestUrl.searchParams.get("url") || "",
      postalCode: requestUrl.searchParams.get("postalCode") || "",
      productName: requestUrl.searchParams.get("productName") || ""
    };
  }
  if (request.method === "POST") {
    let body;
    try { body = await request.json(); } catch { throw new ApiError(400, "El cuerpo debe ser JSON válido."); }
    return {
      action:String(body?.action||"").trim(), kind:String(body?.kind||"").trim(), key:String(body?.key||"").trim(), type:String(body?.type||body?.tracker||"").trim(),
      result:body?.result||null, config:body?.config||{}, settings:body?.settings||{}, runWorkflow:Boolean(body?.runWorkflow),
      mode:String(body?.mode||"").trim(), force:Boolean(body?.force), telegramTest:Boolean(body?.telegramTest), requestId:String(body?.requestId||"").trim(),
      code:String(body?.code||"").trim(), clientId:String(body?.clientId||"").trim(), redirectUri:String(body?.redirectUri||"").trim(),
      url:String(body?.url||"").trim(), postalCode:String(body?.postalCode||"").trim(), productName:String(body?.productName||"").trim(),
      releaseBase64:String(body?.releaseBase64||"").replace(/\s/g,''), releaseName:String(body?.releaseName||"").trim(),
      uploadId:String(body?.uploadId||"").trim(), chunkBase64:String(body?.chunkBase64||"").replace(/\s/g,''),
      index:Number(body?.index), totalChunks:Number(body?.totalChunks), totalBytes:Number(body?.totalBytes)
    };
  }
  throw new ApiError(405, "Método no permitido.");
}

function integrationHealth(env){
  const githubConfigured=Boolean(env?.GITHUB_TOKEN&&env?.GITHUB_OWNER&&env?.GITHUB_REPO);
  return json({
    ok:true,
    service:"MFE Viajes · Centro de integraciones",
    version:WORKER_VERSION,
    drivePersistentAuthConfigured:Boolean(env?.GOOGLE_DRIVE_CLIENT_SECRET),
    driveOAuthClientIdConfigured:Boolean(env?.GOOGLE_DRIVE_CLIENT_ID),
    githubConfigured,
    githubBranch:String(env?.GITHUB_BRANCH||"main"),
    githubConfigPath:String(env?.GITHUB_CONFIG_PATH||"monitoring/config.json"),
    githubWorkflowFile:String(env?.GITHUB_WORKFLOW_FILE||"autoreisen-monitor.yml"),
    firebaseAuthConfigured:Boolean(env?.FIREBASE_PROJECT_ID),
    adminRestrictionConfigured:Boolean(env?.INTEGRATION_ADMIN_UIDS||env?.INTEGRATION_ADMIN_EMAILS),
    kvConfigured:Boolean(env?.MFE_TRACKERS),
    autoreisenControl:true,
    autoreisenInstaller:true,
    autoreisenDynamicOptions:true,
    autoreisenFleetPricing:true,
    cordialControl:true,
    cordialInstaller:true,
    poolsControl:true,
    poolsInstaller:true,
    poolsAutomationVersion:POOLS_AUTOMATION_VERSION,
    poolsWorkflowFile:POOLS_WORKFLOW_FILE,
    flightOpsControl:true,
    flightOpsInstaller:true,
    flightOpsAutomationVersion:FLIGHTOPS_AUTOMATION_VERSION,
    mobileDeployControl:true,
    mobileDeployWorkflowFile:MOBILE_DEPLOY_WORKFLOW_FILE,
    mobileDeployReleasePath:MOBILE_DEPLOY_RELEASE_PATH,
    monitorFallback:true,
    monitorFallbackLocalTime:"07:15",
    monitorFallbackTimeZone:MONITOR_FALLBACK_TIME_ZONE
  });
}
function driveOAuthSecret(env){
  const secret=String(env?.GOOGLE_DRIVE_CLIENT_SECRET||"").trim();
  if(!secret)throw new ApiError(503,"GOOGLE_DRIVE_CLIENT_SECRET no está configurado en el Worker.");
  return secret;
}
function driveOAuthClientId(env,payloadClientId=""){
  const configured=String(env?.GOOGLE_DRIVE_CLIENT_ID||"").trim();
  const supplied=String(payloadClientId||"").trim();
  const clientId=configured||supplied;
  if(!clientId)throw new ApiError(503,"Falta GOOGLE_DRIVE_CLIENT_ID o el Client ID enviado por MFE Viajes.");
  if(configured&&supplied&&configured!==supplied)throw new ApiError(400,"El Client ID de Google Drive no coincide con el configurado en Cloudflare.");
  return clientId;
}
function driveAuthKey(uid){return `drive:oauth:${String(uid||"").trim()}`;}
async function readDriveAuth(env,uid){
  const raw=await requireTrackerKv(env).get(driveAuthKey(uid));
  if(!raw)return null;
  try{return JSON.parse(raw);}catch{return null;}
}
async function writeDriveAuth(env,uid,value){
  await requireTrackerKv(env).put(driveAuthKey(uid),JSON.stringify(value));
}
function driveTokenSeconds(tokenData={}){
  return Math.max(300,Number(tokenData.expires_in)||3300);
}
async function googleTokenRequest(params){
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams(params).toString()});
  let data=null;try{data=await response.json();}catch{}
  if(!response.ok||data?.error)throw new ApiError(502,data?.error_description||data?.error||`Google OAuth respondió HTTP ${response.status}.`);
  return data||{};
}
async function driveGoogleProfile(accessToken){
  if(!accessToken)return {};
  try{
    const response=await fetch("https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)",{headers:{Authorization:`Bearer ${accessToken}`}});
    if(!response.ok)return {};
    const data=await response.json();
    return {email:String(data?.user?.emailAddress||""),name:String(data?.user?.displayName||"")};
  }catch{return {};}
}
function validateDriveRedirectUri(request,redirectUri=""){
  const origin=String(request.headers.get("Origin")||"").trim();
  const supplied=String(redirectUri||"").trim();
  if(!origin||!supplied)throw new ApiError(400,"No se ha podido validar el origen de la autorización de Google Drive.");
  let expected,actual;try{expected=new URL(origin).origin;actual=new URL(supplied).origin;}catch{throw new ApiError(400,"Origen OAuth no válido.");}
  if(expected!==actual)throw new ApiError(400,"El origen OAuth no coincide con la app que inició la autorización.");
  return actual;
}
async function driveAuthStatus(request,env){
  const user=await verifyFirebaseUser(request,env);
  const configured=Boolean(String(env?.GOOGLE_DRIVE_CLIENT_SECRET||"").trim());
  const saved=await readDriveAuth(env,user.sub);
  return json({ok:true,configured,connected:Boolean(saved?.refreshToken),email:String(saved?.email||""),name:String(saved?.name||""),updatedAt:String(saved?.updatedAt||"")});
}
async function driveAuthExchange(request,env,payload){
  if(String(request.headers.get("X-Requested-With")||"")!=="XmlHttpRequest")throw new ApiError(400,"Cabecera CSRF de Google Drive no válida.");
  const user=await verifyFirebaseUser(request,env);
  const code=String(payload.code||"").trim();if(!code)throw new ApiError(400,"Google no ha devuelto un código de autorización.");
  const clientId=driveOAuthClientId(env,payload.clientId);
  const clientSecret=driveOAuthSecret(env);
  const redirectUri=validateDriveRedirectUri(request,payload.redirectUri);
  const existing=await readDriveAuth(env,user.sub);
  const tokenData=await googleTokenRequest({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:"authorization_code"});
  const refreshToken=String(tokenData.refresh_token||existing?.refreshToken||"");
  if(!refreshToken)throw new ApiError(400,"Google no devolvió un refresh token. Revoca el acceso anterior de MFE Viajes en tu cuenta de Google y vuelve a conectar Drive una vez.");
  const accessToken=String(tokenData.access_token||"");if(!accessToken)throw new ApiError(502,"Google no devolvió un access token.");
  const profile=await driveGoogleProfile(accessToken);
  const expiresIn=driveTokenSeconds(tokenData),now=Date.now();
  const saved={clientId,refreshToken,accessToken,accessTokenExpiresAt:now+expiresIn*1000,email:profile.email||String(existing?.email||""),name:profile.name||String(existing?.name||""),updatedAt:new Date(now).toISOString()};
  await writeDriveAuth(env,user.sub,saved);
  return json({ok:true,connected:true,accessToken,expiresIn,email:saved.email,name:saved.name});
}
async function driveAuthToken(request,env){
  const user=await verifyFirebaseUser(request,env);
  const saved=await readDriveAuth(env,user.sub);
  if(!saved?.refreshToken)throw new ApiError(401,"Google Drive todavía no está conectado de forma persistente.");
  const now=Date.now();
  if(saved.accessToken&&Number(saved.accessTokenExpiresAt)>now+90000){
    const expiresIn=Math.max(300,Math.round((Number(saved.accessTokenExpiresAt)-now)/1000));
    return json({ok:true,connected:true,accessToken:saved.accessToken,expiresIn,email:String(saved.email||""),name:String(saved.name||"")});
  }
  const clientId=driveOAuthClientId(env,saved.clientId);
  const clientSecret=driveOAuthSecret(env);
  let tokenData;
  try{tokenData=await googleTokenRequest({client_id:clientId,client_secret:clientSecret,refresh_token:String(saved.refreshToken),grant_type:"refresh_token"});}
  catch(error){
    if(error instanceof ApiError&&/invalid_grant|revoked|expired/i.test(error.message)){await requireTrackerKv(env).delete(driveAuthKey(user.sub));throw new ApiError(401,"La autorización persistente de Google Drive ha caducado o fue revocada. Conecta Drive de nuevo.");}
    throw error;
  }
  const accessToken=String(tokenData.access_token||"");if(!accessToken)throw new ApiError(502,"Google no devolvió un access token al renovar Drive.");
  const expiresIn=driveTokenSeconds(tokenData);
  const updated={...saved,accessToken,accessTokenExpiresAt:now+expiresIn*1000,updatedAt:new Date(now).toISOString()};
  await writeDriveAuth(env,user.sub,updated);
  return json({ok:true,connected:true,accessToken,expiresIn,email:String(updated.email||""),name:String(updated.name||"")});
}
async function driveAuthDisconnect(request,env){
  const user=await verifyFirebaseUser(request,env);
  const kv=requireTrackerKv(env),saved=await readDriveAuth(env,user.sub);
  const token=String(saved?.refreshToken||saved?.accessToken||"");
  if(token){
    try{await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"}});}catch{}
  }
  await kv.delete(driveAuthKey(user.sub));
  return json({ok:true,connected:false});
}

function decodeBase64Url(value){
  const base64=String(value||"").replace(/-/g,"+").replace(/_/g,"/").padEnd(Math.ceil(String(value||"").length/4)*4,"=");
  const raw=atob(base64);return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function decodeJwtJson(value){return JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));}
let FIREBASE_JWKS_CACHE=null;
let FIREBASE_JWKS_CACHE_AT=0;
const FIREBASE_WEB_API_KEY_FALLBACK="AIzaSyBC8CmDyQxtagvdBOmjMxzoybhLPYbqxQw";
async function fetchWithDeadline(url,options={},timeoutMs=6500){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),Math.max(1000,Number(timeoutMs)||6500));
  try{return await fetch(url,{...options,signal:controller.signal});}finally{clearTimeout(timer);}
}
async function firebaseLookupToken(token,env){
  const apiKey=String(env?.FIREBASE_WEB_API_KEY||FIREBASE_WEB_API_KEY_FALLBACK).trim();
  if(!apiKey)throw new ApiError(503,"No hay API key de Firebase para validar la sesión.");
  let response;try{response=await fetchWithDeadline(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({idToken:token})},9000);}
  catch(error){throw new ApiError(504,"Firebase ha tardado demasiado en validar la sesión.");}
  let data=null;try{data=await response.json();}catch{}
  if(!response.ok)throw new ApiError(response.status===400?401:502,"Firebase no ha podido validar la sesión.");
  const user=Array.isArray(data?.users)?data.users[0]:null;if(!user?.localId)throw new ApiError(401,"La sesión de Firebase no es válida.");
  return {sub:String(user.localId),email:String(user.email||"")};
}
async function firebaseJwks(){
  const now=Date.now();if(FIREBASE_JWKS_CACHE&&now-FIREBASE_JWKS_CACHE_AT<55*60*1000)return FIREBASE_JWKS_CACHE;
  try{
    const response=await fetchWithDeadline('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',{cf:{cacheTtl:3600,cacheEverything:true}},5500);
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();if(!Array.isArray(data?.keys)||!data.keys.length)throw new Error('Sin claves');
    FIREBASE_JWKS_CACHE=data;FIREBASE_JWKS_CACHE_AT=now;return data;
  }catch(error){if(FIREBASE_JWKS_CACHE)return FIREBASE_JWKS_CACHE;throw error;}
}
async function verifyFirebaseUser(request,env){
  const projectId=String(env?.FIREBASE_PROJECT_ID||"").trim();
  if(!projectId)throw new ApiError(503,"FIREBASE_PROJECT_ID no está configurado en el Worker.");
  const token=bearerToken(request);if(!token)throw new ApiError(401,"Falta el token de Firebase.");
  const parts=token.split('.');if(parts.length!==3)throw new ApiError(401,"Token de Firebase no válido.");
  let header,payload;try{header=decodeJwtJson(parts[0]);payload=decodeJwtJson(parts[1]);}catch{throw new ApiError(401,"Token de Firebase no válido.");}
  if(header.alg!=="RS256"||!header.kid)throw new ApiError(401,"Firma de Firebase no válida.");
  const now=Math.floor(Date.now()/1000);
  if(payload.aud!==projectId||payload.iss!==`https://securetoken.google.com/${projectId}`||Number(payload.exp)<=now||Number(payload.iat)>now+60||!payload.sub)throw new ApiError(401,"El token de Firebase ha caducado o no pertenece al proyecto.");
  let verified=false;
  try{
    const jwks=await firebaseJwks(),jwk=jwks.keys?.find(key=>key.kid===header.kid);
    if(jwk){const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodeBase64Url(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));}
  }catch{}
  if(!verified){
    const lookup=await firebaseLookupToken(token,env);
    verified=lookup.sub===String(payload.sub)&&(!lookup.email||!payload.email||lookup.email.toLowerCase()===String(payload.email).toLowerCase());
  }
  if(!verified)throw new ApiError(401,"No se pudo verificar la firma de Firebase.");
  const allowedUids=String(env?.INTEGRATION_ADMIN_UIDS||"").split(',').map(x=>x.trim()).filter(Boolean);
  const allowedEmails=String(env?.INTEGRATION_ADMIN_EMAILS||"").split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!allowedUids.length&&!allowedEmails.length)throw new ApiError(503,"Configura INTEGRATION_ADMIN_UIDS o INTEGRATION_ADMIN_EMAILS en Cloudflare.");
  const permitted=allowedUids.includes(String(payload.sub))||allowedEmails.includes(String(payload.email||"").toLowerCase());
  if(!permitted)throw new ApiError(403,"Tu usuario no está autorizado para modificar GitHub desde la app.");
  return payload;
}
async function verifyFirebaseUserMobileStable(request,env){
  const projectId=String(env?.FIREBASE_PROJECT_ID||"").trim();
  if(!projectId)throw new ApiError(503,"FIREBASE_PROJECT_ID no está configurado en el Worker.");
  const token=bearerToken(request);if(!token)throw new ApiError(401,"Falta el token de Firebase.");
  const parts=token.split('.');if(parts.length!==3)throw new ApiError(401,"Token de Firebase no válido.");
  let header,payload;try{header=decodeJwtJson(parts[0]);payload=decodeJwtJson(parts[1]);}catch{throw new ApiError(401,"Token de Firebase no válido.");}
  if(header.alg!=="RS256"||!header.kid)throw new ApiError(401,"Firma de Firebase no válida.");
  const response=await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',{cf:{cacheTtl:3600,cacheEverything:true}});
  if(!response.ok)throw new ApiError(502,"No se pudieron obtener las claves públicas de Firebase.");
  const jwks=await response.json();const jwk=jwks.keys?.find(key=>key.kid===header.kid);if(!jwk)throw new ApiError(401,"La clave de firma de Firebase no coincide.");
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const verified=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decodeBase64Url(parts[2]),new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const now=Math.floor(Date.now()/1000);
  if(!verified||payload.aud!==projectId||payload.iss!==`https://securetoken.google.com/${projectId}`||Number(payload.exp)<=now||Number(payload.iat)>now+60||!payload.sub)throw new ApiError(401,"El token de Firebase ha caducado o no pertenece al proyecto.");
  const allowedUids=String(env?.INTEGRATION_ADMIN_UIDS||"").split(',').map(x=>x.trim()).filter(Boolean);
  const allowedEmails=String(env?.INTEGRATION_ADMIN_EMAILS||"").split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!allowedUids.length&&!allowedEmails.length)throw new ApiError(503,"Configura INTEGRATION_ADMIN_UIDS o INTEGRATION_ADMIN_EMAILS en Cloudflare.");
  const permitted=allowedUids.includes(String(payload.sub))||allowedEmails.includes(String(payload.email||"").toLowerCase());
  if(!permitted)throw new ApiError(403,"Tu usuario no está autorizado para modificar GitHub desde la app.");
  return payload;
}
function githubHeaders(env){
  const token=String(env?.GITHUB_TOKEN||"").trim();if(!token)throw new ApiError(503,"GITHUB_TOKEN no está configurado.");
  return {Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2026-03-10','User-Agent':'MFE-Viajes-Integration/2.2.15','Content-Type':'application/json'};
}
function githubTarget(env){
  const owner=String(env?.GITHUB_OWNER||"").trim(),repo=String(env?.GITHUB_REPO||"").trim();
  if(!owner||!repo)throw new ApiError(503,"Configura GITHUB_OWNER y GITHUB_REPO en Cloudflare.");
  return {owner,repo,branch:String(env?.GITHUB_BRANCH||'main').trim()||'main',path:String(env?.GITHUB_CONFIG_PATH||'monitoring/config.json').replace(/^\/+/,''),workflow:String(env?.GITHUB_WORKFLOW_FILE||'autoreisen-monitor.yml').trim()};
}
function decodeGithubContent(value){
  const binary=atob(String(value||'').replace(/\s/g,''));const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes);
}
function encodeGithubContent(value){
  const bytes=new TextEncoder().encode(value);let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(binary);
}
function cleanAutoreisenConfig(config={}){
  const allowed=['pickup','dropoff','pickupOfficeId','dropoffOfficeId','pickupAt','dropoffAt','group','model','carId','reservedPrice','searchUrl','enabled','intervalHours','scheduleMode','scheduleTime','scheduleTimeZone','fleetTrackAll','fleetTrackGroups','telegramEnabled','telegramNotifyEveryCheck','telegramNotifyPriceDrop','telegramNotifyBelowReserved','telegramNotifyAvailability','telegramNotifyError','telegramNotifyRecovery','telegramMinDropAmount','telegramMinDropPercent'];const result={};
  for(const key of allowed)if(config[key]!==undefined)result[key]=config[key];
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(result.pickupAt||''))||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(result.dropoffAt||'')))throw new ApiError(400,"Las fechas de AutoReisen no son válidas.");
  result.enabled=result.enabled!==false;
  result.fleetTrackAll=result.fleetTrackAll!==false;
  result.fleetTrackGroups=[...new Set((Array.isArray(result.fleetTrackGroups)?result.fleetTrackGroups:[]).map(x=>String(x||'').trim()).filter(Boolean))].slice(0,40);
  if(!result.fleetTrackAll&&!result.fleetTrackGroups.length&&result.group)result.fleetTrackGroups=[String(result.group).trim()];
  result.intervalHours=Math.min(24,Math.max(1,Number(result.intervalHours)||24));
  result.scheduleMode='daily';result.scheduleTime='06:30';result.scheduleTimeZone='Europe/Madrid';
  result.telegramMinDropAmount=Math.max(0,Number(result.telegramMinDropAmount)||0);result.telegramMinDropPercent=Math.max(0,Number(result.telegramMinDropPercent)||0);
  for(const key of ['telegramEnabled','telegramNotifyEveryCheck','telegramNotifyPriceDrop','telegramNotifyBelowReserved','telegramNotifyAvailability','telegramNotifyError','telegramNotifyRecovery'])result[key]=result[key]!==false;
  return result;
}
function cleanCordialConfig(config={}){
  const allowed=['hotel','checkIn','checkOut','adults','children','targetRoom','targetRate','targetBoard','reservedPrice','searchUrl','enabled','scheduleMode','scheduleTime','scheduleTimeZone','title','color','gradient1','gradient2'];const result={};
  for(const key of allowed)if(config[key]!==undefined)result[key]=config[key];
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(result.checkIn||''))||!/^\d{4}-\d{2}-\d{2}$/.test(String(result.checkOut||'')))throw new ApiError(400,'Las fechas de Cordial no son válidas.');
  result.adults=Math.max(1,Math.min(8,Number(result.adults)||2));result.children=Math.max(0,Math.min(8,Number(result.children)||0));result.reservedPrice=Math.max(0,Number(result.reservedPrice)||0);
  result.enabled=result.enabled!==false;result.scheduleMode='daily';result.scheduleTime=String(result.scheduleTime||'06:35');result.scheduleTimeZone='Europe/Madrid';
  result.hotel=String(result.hotel||'Cordial Santa Águeda & Perchel Beach Club').trim();result.targetRoom=String(result.targetRoom||'Classic Duplex').trim();result.targetRate=String(result.targetRate||'Club Cordial - Reserva Online').trim();result.targetBoard=String(result.targetBoard||'SOLO ALOJAMIENTO').trim();
  result.searchUrl=String(result.searchUrl||'https://www.becordial.com/gran-canaria-sur/cordial-santa-agueda/').trim();
  return result;
}

function cleanFlightOpsConfig(config={}){
  const flights=(Array.isArray(config?.flights)?config.flights:[]).slice(0,12).map((flight,index)=>{
    const number=String(flight?.number||'').trim().toUpperCase(),departure=String(flight?.departure||'').trim(),arrival=String(flight?.arrival||'').trim();
    const code=value=>String(value||'').toUpperCase().match(/\b([A-Z]{3})\b/)?.[1]||'';
    return {
      id:String(flight?.id||`flight-${index+1}`).trim(),number,date:String(flight?.date||departure.slice(0,10)).slice(0,10),departure,arrival,
      origin:code(flight?.origin||flight?.from),destination:code(flight?.destination||flight?.to),from:String(flight?.from||'').trim(),to:String(flight?.to||'').trim()
    };
  }).filter(f=>/^\w{2,3}\d{2,5}$/.test(f.number.replace(/\s+/g,''))&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(f.departure)&&f.origin&&f.destination);
  if(!flights.length)throw new ApiError(400,'No hay vuelos válidos para configurar el seguimiento operativo.');
  return {enabled:config?.enabled!==false,flights};
}

const AUTOREISEN_VERIFIED_OFFICES=[
  {id:'1',label:'Tenerife Norte (TFN)'},{id:'2',label:'Tenerife Sur (TFS)'},{id:'3',label:'Lanzarote (ACE)'},{id:'18',label:'Gran Canaria - Aeropuerto (LPA)'},{id:'19',label:'Fuerteventura (FUE)'}
];
const AUTOREISEN_REFERENCE_FLEET=[
  {group:'A',model:'Citröen C3 5P A/C',carId:''},
  {group:'C',model:'Seat Ibiza 5P A/C',carId:''},
  {group:'C',model:'VW Polo A/C',carId:''},
  {group:'D',model:'Seat Ibiza AUTOMATIC',carId:''},
  {group:'D',model:'Golf TSI AUTOMATIC',carId:''},
  {group:'E',model:'Hyundai i30',carId:''},
  {group:'E',model:'Seat Arona TSI Reference',carId:'119'},
  {group:'G',model:'Citröen C3 Aircross Family',carId:''},
  {group:'G',model:'D.Jogger 5 Pax Family',carId:''},
  {group:'H',model:'VW Golf 5P A/C',carId:''},
  {group:'H',model:'Citröen C4 PureTech',carId:''},
  {group:'H',model:'VW T-Cross',carId:''},
  {group:'H',model:'VW Taigo',carId:''},
  {group:'H',model:'VW T-Roc',carId:''}
];
const AUTOREISEN_GROUP_SUGGESTIONS=[...new Set(AUTOREISEN_REFERENCE_FLEET.map(x=>x.group))];
function autoreisenDateParts(value=''){const [date,time='00:00']=String(value).split('T');const [year,month,day]=date.split('-');return {year,month:String(Number(month||0)),day:String(Number(day||0)),time:time.slice(0,5)};}
function autoreisenResultsUrl(config={},options={}){const p=autoreisenDateParts(config.pickupAt),d=autoreisenDateParts(config.dropoffAt);const url=new URL('https://www.autoreisen.com/alquiler-coches/tarifas-flota.php');const rec=String(config.pickupOfficeId||'18').trim(),dev=String(config.dropoffOfficeId||rec).trim(),car=String(config.carId||'').trim();url.searchParams.set('ofi_rec',rec);url.searchParams.set('ofi_dev',dev);url.searchParams.set('dia_inicio',p.day);url.searchParams.set('mes_inicio',`${p.month}-${p.year}`);url.searchParams.set('hora_inicio',p.time);url.searchParams.set('dia_final',d.day);url.searchParams.set('mes_final',`${d.month}-${d.year}`);url.searchParams.set('hora_final',d.time);if(options.includeCar===true&&car){url.searchParams.set('coche',car);url.searchParams.set('id_coche',car);}url.searchParams.set('fin','1');return url.toString();}
function autoreisenPlainText(html=''){return decodeHtml(String(html).replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/(?:div|p|li|tr|td|h[1-6])>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/\r/g,'').replace(/[\t ]+/g,' ').replace(/\n\s+/g,'\n').trim();}
function autoreisenParseSelect(html,name){const safe=String(name).replace(/[^a-z0-9_-]/gi,'');const m=String(html).match(new RegExp(`<select\\b[^>]*(?:name|id)\\s*=\\s*["']?${safe}["']?[^>]*>([\\s\\S]*?)<\\/select>`,'i'));if(!m)return [];const rows=[];for(const match of m[1].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)){const attrs=match[1]||'',label=autoreisenPlainText(match[2]).trim(),vm=attrs.match(/\bvalue\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i),id=String(vm?.[1]??vm?.[2]??vm?.[3]??'').trim();if(!id||!label||/seleccion|select|elige|oficina de/i.test(label))continue;rows.push({id,label});}return rows;}
function autoreisenParseOffices(html){const rows=autoreisenParseSelect(html,'ofi_rec'),map=new Map();for(const x of rows)if(x.id&&x.label)map.set(x.id,x);return [...map.values()];}
function autoreisenKnownCarId(model=''){const n=String(model).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();if(n.includes('seat arona'))return '119';return '';}
function autoreisenParseFleet(html){const text=autoreisenPlainText(html),rows=[],seen=new Set();const re=/(?:^|\n)\s*([A-Z][A-Z0-9]{0,2})\s*[-–—:]\s*([^\n€]{3,130}?)\s+([0-9]{1,4}(?:[.,][0-9]{1,2}))\s*€\s*\/\s*d[ií]a/gim;for(const m of text.matchAll(re)){const group=String(m[1]).trim(),model=String(m[2]).replace(/\s+/g,' ').trim();if(!group||!model||/plazas|puertas|radio|aire acondicionado/i.test(model.slice(0,25)))continue;const key=`${group}\u0000${model.toLowerCase()}`;if(seen.has(key))continue;seen.add(key);const index=String(html).toLowerCase().indexOf(model.toLowerCase()),segment=index>=0?String(html).slice(Math.max(0,index-1800),index+2500):'',idMatch=segment.match(/(?:id_coche|coche)=(\d+)/i);rows.push({group,model,carId:idMatch?.[1]||autoreisenKnownCarId(model),pricePerDay:Number(m[3].replace(',','.'))});}return rows;}
function autoreisenHeaders(extra={}){return {Accept:'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8','Accept-Language':'es-ES,es;q=0.9','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36',...extra};}
function autoreisenAssertHtml(html){if(/please wait|request is being verified|verifying|comprobando su navegador|un momento/i.test(autoreisenPlainText(html)))throw new Error('AutoReisen ha activado su verificación temporal');return html;}
function autoreisenNoAvailability(html=''){return /no hay nada disponible para la combinación|no hay nada disponible para la combinacion|no availability for the combination|we are sorry we cannot offer/i.test(autoreisenPlainText(html));}
function autoreisenResponseMentionsRequestedDates(html='',config={}){const text=autoreisenPlainText(html).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();const p=autoreisenDateParts(config.pickupAt),d=autoreisenDateParts(config.dropoffAt);const months={1:['ene','jan'],2:['feb'],3:['mar'],4:['abr','apr'],5:['may'],6:['jun'],7:['jul'],8:['ago','aug'],9:['sep'],10:['oct'],11:['nov'],12:['dic','dec']};const has=(part)=>{const day=String(Number(part.day||0));return Boolean(day)&&String(part.year||'')&&text.includes(String(part.year))&&(months[Number(part.month)]||[]).some(m=>text.includes(`${day}-${m}`)||text.includes(`${day} ${m}`)||text.includes(`${day}/${String(part.month).padStart(2,'0')}`));};return has(p)&&has(d);}
async function autoreisenPublicHtml(url,options={}){const response=await fetchWithTimeout(url,{redirect:'follow',...options,headers:autoreisenHeaders(options.headers||{})});if(!response.ok)throw new Error(`AutoReisen respondió HTTP ${response.status}`);return autoreisenAssertHtml(await response.text());}
function autoreisenCookies(response){try{const values=typeof response.headers?.getSetCookie==='function'?response.headers.getSetCookie():[response.headers?.get('set-cookie')].filter(Boolean);return values.map(x=>String(x).split(';')[0].trim()).filter(Boolean).join('; ');}catch{return '';}}
function autoreisenFormBody(config={}){const p=autoreisenDateParts(config.pickupAt),d=autoreisenDateParts(config.dropoffAt),rec=String(config.pickupOfficeId||'18').trim(),dev=String(config.dropoffOfficeId||rec).trim();const body=new URLSearchParams();body.set('ofi_rec',rec);body.set('ofi_dev',dev);body.set('dia_inicio',p.day);body.set('mes_inicio',`${p.month}-${p.year}`);body.set('hora_inicio',p.time);body.set('dia_final',d.day);body.set('mes_final',`${d.month}-${d.year}`);body.set('hora_final',d.time);body.set('fin','1');return body;}
async function autoreisenSubmittedFleetHtml(config={}){const start='https://www.autoreisen.com/alquiler-coches/alquiler-de-coches.php',target='https://www.autoreisen.com/alquiler-coches/tarifas-flota.php';const bootstrap=await fetchWithTimeout(start,{redirect:'follow',headers:autoreisenHeaders()});if(!bootstrap.ok)throw new Error(`AutoReisen respondió HTTP ${bootstrap.status} al iniciar la búsqueda`);const bootstrapHtml=autoreisenAssertHtml(await bootstrap.text()),cookie=autoreisenCookies(bootstrap);const response=await fetchWithTimeout(target,{method:'POST',redirect:'follow',headers:autoreisenHeaders({'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8',Origin:'https://www.autoreisen.com',Referer:start,...(cookie?{Cookie:cookie}:{})}),body:autoreisenFormBody(config).toString()});if(!response.ok)throw new Error(`AutoReisen respondió HTTP ${response.status} al consultar la flota`);const html=autoreisenAssertHtml(await response.text());return {html,bootstrapHtml};}
async function autoreisenCachedFleet(env,config={}){try{const kv=requireTrackerKv(env),raw=await kv.get('tracker:autoreisen:latest');if(!raw)return [];const result=JSON.parse(raw);const sameOffice=String(result?.pickupOfficeId||'')===String(config?.pickupOfficeId||'')&&String(result?.dropoffOfficeId||'')===String(config?.dropoffOfficeId||'');const sameDates=String(result?.pickupAt||'').slice(0,16)===String(config?.pickupAt||'').slice(0,16)&&String(result?.dropoffAt||'').slice(0,16)===String(config?.dropoffAt||'').slice(0,16);if(!sameOffice||!sameDates)return [];return Array.isArray(result?.fleet)?result.fleet:[];}catch{return [];}}
function autoreisenFleetGroupCount(fleet=[]){return new Set((Array.isArray(fleet)?fleet:[]).map(x=>String(x?.group||'').trim()).filter(Boolean)).size;}
function autoreisenMergeFleet(primary=[],secondary=[]){const map=new Map();for(const row of [...primary,...secondary]){const group=String(row?.group||'').trim(),model=String(row?.model||'').trim();if(!group||!model)continue;const key=`${group}\u0000${model.toLowerCase()}`;if(!map.has(key))map.set(key,row);}return [...map.values()];}
async function autoreisenOptionsResponse(request,env,payload){
  await verifyFirebaseUser(request,env);
  const mode=String(payload.mode||'offices').toLowerCase(),config=payload.config||{};
  let warning='';let offices=[];
  try{offices=autoreisenParseOffices(await autoreisenPublicHtml('https://www.autoreisen.com/alquiler-coches/alquiler-de-coches.php'));}
  catch(error){warning=`No se pudo refrescar el formulario de oficinas (${error.message}). Se usa la lista verificada incluida como respaldo.`;}
  if(!offices.length)offices=AUTOREISEN_VERIFIED_OFFICES;
  if(mode==='offices')return json({ok:true,offices,source:warning?'Lista verificada de respaldo':'AutoReisen · formulario actual',warning});
  let fleet=[],exactSource='',noAvailability=false,responseMatchedDates=false;
  try{
    const submitted=await autoreisenSubmittedFleetHtml(config);
    responseMatchedDates=autoreisenResponseMentionsRequestedDates(submitted.html,config);
    noAvailability=autoreisenNoAvailability(submitted.html)&&responseMatchedDates;
    fleet=autoreisenParseFleet(submitted.html);exactSource='formulario POST';
    if(!fleet.length&&!noAvailability)warning=[warning,'AutoReisen aceptó la búsqueda, pero el HTML devuelto no expone vehículos en un formato que el Worker pueda interpretar.'].filter(Boolean).join(' ');
  }catch(error){warning=[warning,`No se pudo consultar la flota mediante el formulario (${error.message}).`].filter(Boolean).join(' ');}
  if(!fleet.length&&!noAvailability){
    try{
      const directHtml=await autoreisenPublicHtml(autoreisenResultsUrl(config,{includeCar:false}));
      const directMatches=autoreisenResponseMentionsRequestedDates(directHtml,config);
      if(directMatches){noAvailability=autoreisenNoAvailability(directHtml);responseMatchedDates=true;}
      fleet=autoreisenParseFleet(directHtml);if(fleet.length)exactSource='consulta directa';
    }catch(error){warning=[warning,`La consulta directa tampoco devolvió una flota interpretable (${error.message}).`].filter(Boolean).join(' ');}
  }
  if(fleet.length&&autoreisenFleetGroupCount(fleet)<=1){
    try{
      const catalog=autoreisenParseFleet(await autoreisenPublicHtml('https://www.autoreisen.com/alquiler-coches/tarifas-flota.php'));
      if(autoreisenFleetGroupCount(catalog)>autoreisenFleetGroupCount(fleet)){
        fleet=autoreisenMergeFleet(fleet,catalog);
        warning=[warning,'Las sugerencias se han completado con el catálogo público; la disponibilidad definitiva se valida al consultar el modelo.'].filter(Boolean).join(' ');
      }
    }catch(error){warning=[warning,`No se pudo completar el catálogo general (${error.message}).`].filter(Boolean).join(' ');}
  }
  if(!fleet.length&&!noAvailability){
    const cached=await autoreisenCachedFleet(env,config);
    if(cached.length){fleet=cached;warning=[warning,'Se muestran como sugerencia los últimos vehículos obtenidos por el monitor para esas mismas condiciones.'].filter(Boolean).join(' ');exactSource='caché del monitor';}
  }
  if(!fleet.length){
    const fallback=AUTOREISEN_REFERENCE_FLEET.map(x=>({...x}));
    const fallbackWarning=noAvailability&&responseMatchedDates
      ?'AutoReisen indica que no hay disponibilidad para las fechas y oficinas solicitadas. El catálogo devuelto es solo de referencia y no implica disponibilidad.'
      :'AutoReisen está bloqueando o no expone una lista interpretable al Worker. Se devuelve el catálogo público de referencia para que grupo y modelo sigan siendo seleccionables; la disponibilidad debe confirmarse en la web o mediante el monitor.';
    return json({ok:true,offices,fleet:fallback,groups:autoreisenFleetGroupCount(fallback),fallbackGroups:AUTOREISEN_GROUP_SUGGESTIONS,manualEntry:true,catalogFallback:true,availabilityConfirmed:false,noAvailability,responseMatchedDates,source:'AutoReisen · catálogo público de referencia',warning:[warning,fallbackWarning].filter(Boolean).join(' ')});
  }
  return json({ok:true,offices,fleet,groups:autoreisenFleetGroupCount(fleet),fallbackGroups:AUTOREISEN_GROUP_SUGGESTIONS,manualEntry:false,catalogFallback:false,availabilityConfirmed:true,noAvailability:false,responseMatchedDates,source:`AutoReisen · ${exactSource||'resultados actuales'}`,warning});
}

function githubApiError(response,data){
  const raw=String(data?.message||`GitHub respondió HTTP ${response.status}.`);
  if(response.status===401||/bad credentials/i.test(raw))return new ApiError(401,'GitHub ha rechazado GITHUB_TOKEN: credenciales no válidas. El token puede haber caducado, sido revocado o sustituido. Genera/renueva el token de GitHub y vuelve a guardar el secreto GITHUB_TOKEN en el Worker mfe-viajes-precios.');
  if(response.status===403&&/resource not accessible|forbidden|permission/i.test(raw))return new ApiError(403,'GitHub ha aceptado el token, pero no tiene permisos suficientes para este repositorio o para Actions/Contents. Revisa los permisos del token GITHUB_TOKEN.');
  return new ApiError(response.status===404?502:response.status,raw);
}
async function githubJson(url,options,env){
  const response=await fetch(url,{...options,headers:{...githubHeaders(env),...(options?.headers||{})}});let data=null;try{data=await response.json();}catch{}
  if(!response.ok)throw githubApiError(response,data);return data;
}
// v2.2.54 · Gestor independiente de seguimientos para la segunda isla.
const STAGE_WORKFLOWS={car:'autoreisen-stage2.yml',hotel:'dunas-monitor.yml'};
function stageMonitorConfig(kind,config={}){
  const data=config&&typeof config==='object'?config:{};
  if(kind==='car'){
    const res=cleanAutoreisenConfig({...data,enabled:true});
    res.pickupOfficeId=String(res.pickupOfficeId||'19');res.dropoffOfficeId=String(res.dropoffOfficeId||'19');
    return res;
  }
  if(kind!=='hotel')throw new ApiError(400,'Seguimiento de segunda isla desconocido.');
  const checkIn=String(data.checkIn||''),checkOut=String(data.checkOut||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)||!/^\d{4}-\d{2}-\d{2}$/.test(checkOut)||checkOut<=checkIn)throw new ApiError(400,'Fechas de Dunas Club no válidas.');
  const adults=Math.max(1,Math.min(5,Number(data.adults)||5)),rooms=Math.max(1,Math.min(adults,Number(data.rooms)||3));
  return {enabled:true,hotel:'Hotel Dunas Club',checkIn,checkOut,adults,rooms,
    targetRoom:String(data.targetRoom||'Cualquier habitación').slice(0,100),targetBoard:String(data.targetBoard||'Solo alojamiento').slice(0,100),
    reservedPrice:Math.max(0,Number(data.reservedPrice)||0),searchUrl:'https://www.hoteldunasclub.es/reservar.html'};
}
async function readStageMonitorConfigDocument(target,env){
  const raw=await githubTextFile(target,target.path,env);
  if(!raw.exists)return {};
  try{const doc=JSON.parse(raw.content);if(!doc||typeof doc!=='object'||Array.isArray(doc))throw new Error();return doc;}
  catch{throw new ApiError(500,'monitoring/config.json tiene contenido no válido; no se sobrescribe por seguridad.');}
}
async function syncStageMonitorToGitHub(request,env,payload){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),kind=String(payload.kind||''),workflow=STAGE_WORKFLOWS[kind];
  if(!workflow)throw new ApiError(400,'Monitor de etapa 2 no válido.');
  const cleaned=stageMonitorConfig(kind,payload.config||{});
  const files=kind==='car'?{
    'monitoring/autoreisen-stage2-run.mjs':AUTOREISEN_STAGE2_RUN_FILE,
    '.github/workflows/autoreisen-stage2.yml':AUTOREISEN_STAGE2_WORKFLOW_TEMPLATE
  }:{
    'monitoring/dunas.mjs':DUNAS_FILE,
    'monitoring/dunas-run.mjs':DUNAS_RUN_FILE,
    '.github/workflows/dunas-monitor.yml':DUNAS_WORKFLOW_TEMPLATE
  };
  const written=[];
  for(const [path,content] of Object.entries(files)){
    const remote=await githubTextFile(target,path,env);
    if(!remote.exists||remote.content.trimEnd()!==content.trimEnd())written.push(await upsertGithubFile(target,path,content,env,`MFE Viajes · segundo monitor ${kind} v${WORKER_VERSION}`));
  }
  const key=kind==='car'?'autoreisenStage2':'dunas',doc=await readStageMonitorConfigDocument(target,env),current=doc[key]||{};
  if(JSON.stringify(current)!==JSON.stringify(cleaned)){
    doc[key]=cleaned;
    written.push(await upsertGithubFile(target,target.path,JSON.stringify(doc,null,2)+'\n',env,`MFE Viajes · Configurar ${key} en Fuerteventura`));
  }
  return json({ok:true,synced:true,workflow,changed:written.length>0,written,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub});
}
async function dispatchStageMonitor(request,env,payload){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),kind=String(payload.kind||''),workflow=STAGE_WORKFLOWS[kind];
  if(!workflow)throw new ApiError(400,'Monitor de etapa 2 no válido.');
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  await githubJson(url,{method:'POST',body:JSON.stringify({ref:target.branch,inputs:{force:'true'}})},env);
  return json({ok:true,workflowTriggered:true,kind,workflow,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub});
}

async function syncAutoreisenToGitHub(request,env,payload){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env),config=cleanAutoreisenConfig(payload.config||{});const automationUpdate=await ensureAutoreisenAutomationCurrent(target,env);
  const contentUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${target.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(target.branch)}`;
  const current=await githubJson(contentUrl,{method:'GET'},env);let document;try{document=JSON.parse(decodeGithubContent(current.content));}catch{throw new ApiError(502,"monitoring/config.json no contiene JSON válido.");}
  document.autoreisen={...(document.autoreisen||{}),...config};
  const update=await githubJson(contentUrl.replace(/\?ref=.*/,''),{method:'PUT',body:JSON.stringify({message:`Sincronizar AutoReisen desde MFE Viajes (${config.pickupAt.slice(0,10)}–${config.dropoffAt.slice(0,10)})`,content:encodeGithubContent(`${JSON.stringify(document,null,2)}\n`),sha:current.sha,branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}})},env);
  let workflowTriggered=false;
  if(payload.runWorkflow&&target.workflow){await dispatchAutoreisenWorkflow(target,env,{force:true});workflowTriggered=true;}
  return json({ok:true,updated:true,workflowTriggered,commitUrl:update?.commit?.html_url||'',repository:`${target.owner}/${target.repo}`,path:target.path,branch:target.branch,authorizedUid:user.sub,automationUpdate,updatedAt:new Date().toISOString()});
}


async function githubRequestRaw(url,options,env){
  return fetch(url,{...options,headers:{...githubHeaders(env),...(options?.headers||{})}});
}
async function upsertGithubFile(target,path,content,env,message){
  const encodedPath=String(path).split('/').map(encodeURIComponent).join('/');
  const base=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encodedPath}`;
  const get=await githubRequestRaw(`${base}?ref=${encodeURIComponent(target.branch)}`,{method:'GET'},env);
  let sha='';if(get.ok){const current=await get.json();sha=current.sha||'';}else if(get.status!==404){let data=null;try{data=await get.json();}catch{}throw githubApiError(get,data);}
  const body={message,content:encodeGithubContent(content.endsWith('\n')?content:`${content}\n`),branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}};if(sha)body.sha=sha;
  const updated=await githubJson(base,{method:'PUT',body:JSON.stringify(body)},env);return {path,created:!sha,commitUrl:updated?.commit?.html_url||''};
}
async function upsertGithubBase64File(target,path,base64Content,env,message){
  const content=String(base64Content||'').replace(/\s/g,'');
  if(!content)throw new ApiError(400,'El archivo ZIP está vacío.');
  const encodedPath=String(path).split('/').map(encodeURIComponent).join('/');
  const base=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encodedPath}`;
  const get=await githubRequestRaw(`${base}?ref=${encodeURIComponent(target.branch)}`,{method:'GET'},env);
  let sha='';if(get.ok){const current=await get.json();sha=current.sha||'';}else if(get.status!==404){let data=null;try{data=await get.json();}catch{}throw githubApiError(get,data);}
  const body={message,content,branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}};if(sha)body.sha=sha;
  const updated=await githubJson(base,{method:'PUT',body:JSON.stringify(body)},env);return {path,created:!sha,commitUrl:updated?.commit?.html_url||'',commitSha:String(updated?.commit?.sha||'')};
}
async function githubBranchHeadSha(target,env){
  const branch=String(target.branch||'main').trim();
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`;
  const data=await githubJson(url,{method:'GET'},env);
  return String(data?.object?.sha||'').trim();
}
async function waitForGithubBranchCommit(target,env,expectedSha,{attempts=24,delayMs=500}={}){
  const expected=String(expectedSha||'').trim();
  if(!expected)throw new ApiError(502,'GitHub no devolvió el commit de la release móvil.');
  let last='';
  for(let attempt=1;attempt<=attempts;attempt++){
    try{last=await githubBranchHeadSha(target,env);}catch{}
    if(last===expected){
      // GitHub Actions puede tardar unas décimas en resolver el nuevo HEAD aunque la API de refs ya lo vea.
      await new Promise(resolve=>setTimeout(resolve,1200));
      return expected;
    }
    if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
  throw new ApiError(502,`GitHub todavía no ha publicado el commit nuevo en ${target.branch}. Esperado ${expected.slice(0,12)}, visible ${last.slice(0,12)||'ninguno'}.`);
}
async function verifyGithubReleaseAtCommit(target,path,commitSha,env){
  const encodedPath=String(path).split('/').map(encodeURIComponent).join('/');
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encodedPath}?ref=${encodeURIComponent(commitSha)}`;
  const data=await githubJson(url,{method:'GET'},env);
  if(!data?.sha||!Number(data?.size))throw new ApiError(502,'GitHub creó el commit, pero no permite leer todavía el ZIP de la release.');
  return {blobSha:String(data.sha),size:Number(data.size)||0};
}
async function mobileDeployWorkflowInspection(target,env){
  const path=`.github/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`;
  const remote=await githubTextFile(target,path,env);
  const normalized=value=>String(value||'').replace(/\r\n/g,'\n').trim();
  return {path,exists:Boolean(remote.exists),current:Boolean(remote.exists&&normalized(remote.content)===normalized(MOBILE_DEPLOY_WORKFLOW_TEMPLATE))};
}
async function mobileDeployWorkflowMeta(target,env){
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows?per_page=100`;
  const data=await githubJson(url,{method:'GET'},env),rows=Array.isArray(data?.workflows)?data.workflows:[];
  return rows.find(item=>String(item.path||'').endsWith(`/.github/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`)||String(item.path||'')===`.github/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`||String(item.name||'').trim()==='Actualizar MFE Viajes · móvil')||null;
}
async function waitForMobileDeployWorkflowReady(target,env,{attempts=12,delayMs=1200}={}){
  let meta=null;
  for(let attempt=1;attempt<=attempts;attempt++){
    meta=await mobileDeployWorkflowMeta(target,env).catch(()=>null);
    if(meta?.id)return meta;
    if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
  throw new ApiError(502,'GitHub todavía no ha indexado el workflow móvil. Espera unos segundos y vuelve a intentarlo.');
}
async function mobileDeployStatus(request,env){
  const user=await verifyFirebaseUserMobileStable(request,env),target=githubTarget(env),inspection=await mobileDeployWorkflowInspection(target,env);
  return json({ok:true,...inspection,repository:`${target.owner}/${target.repo}`,branch:target.branch,actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`,authorizedUid:user.sub});
}
async function installMobileDeployWorkflow(request,env){
  const user=await verifyFirebaseUserMobileStable(request,env),target=githubTarget(env),inspection=await mobileDeployWorkflowInspection(target,env);
  let written=null;if(!inspection.current)written=await upsertGithubFile(target,inspection.path,MOBILE_DEPLOY_WORKFLOW_TEMPLATE,env,`Preparar actualización móvil · MFE Viajes v${WORKER_VERSION}`);
  const verified=await mobileDeployWorkflowInspection(target,env);
  if(!verified.current)throw new ApiError(502,'GitHub recibió el workflow móvil, pero la verificación posterior no coincide.');
  return json({ok:true,installed:true,updated:Boolean(written),workflow:MOBILE_DEPLOY_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,branch:target.branch,actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`,authorizedUid:user.sub});
}
async function dispatchMobileDeployWorkflow(target,env,requestId=''){
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(MOBILE_DEPLOY_WORKFLOW_FILE)}/dispatches`;
  const body={ref:target.branch};if(requestId)body.inputs={request_id:String(requestId)};
  await githubJson(url,{method:'POST',body:JSON.stringify(body)},env);
  return true;
}
async function mobileDeployRunStatus(request,env,payload={}){
  const user=await verifyFirebaseUserMobileStable(request,env),target=githubTarget(env),requestId=String(payload.requestId||'').trim();
  const runsUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(MOBILE_DEPLOY_WORKFLOW_FILE)}/runs?branch=${encodeURIComponent(target.branch)}&event=workflow_dispatch&per_page=20`;
  const runsData=await githubJson(runsUrl,{method:'GET'},env),runs=Array.isArray(runsData?.workflow_runs)?runsData.workflow_runs:[];
  const run=requestId?runs.find(item=>String(item.display_title||item.name||'').includes(requestId)):runs[0];
  const actionsUrl=`https://github.com/${target.owner}/${target.repo}/actions/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`;
  if(!run)return json({ok:true,runFound:false,requestId,actionsUrl,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub});
  const jobsUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/runs/${encodeURIComponent(run.id)}/jobs?per_page=100`;
  const jobsData=await githubJson(jobsUrl,{method:'GET'},env);
  const jobs=(Array.isArray(jobsData?.jobs)?jobsData.jobs:[]).map(job=>({id:job.id,name:String(job.name||''),status:String(job.status||''),conclusion:String(job.conclusion||''),startedAt:String(job.started_at||''),completedAt:String(job.completed_at||''),htmlUrl:String(job.html_url||''),steps:(Array.isArray(job.steps)?job.steps:[]).map(step=>({name:String(step.name||''),status:String(step.status||''),conclusion:String(step.conclusion||''),number:Number(step.number)||0,startedAt:String(step.started_at||''),completedAt:String(step.completed_at||'')}))}));
  const steps=jobs.flatMap(job=>job.steps.map(step=>({...step,jobName:job.name}))),completedSteps=steps.filter(step=>step.status==='completed').length,successfulSteps=steps.filter(step=>step.status==='completed'&&step.conclusion==='success').length;
  return json({ok:true,runFound:true,requestId,run:{id:run.id,name:String(run.name||''),displayTitle:String(run.display_title||''),status:String(run.status||''),conclusion:String(run.conclusion||''),event:String(run.event||''),createdAt:String(run.created_at||''),startedAt:String(run.run_started_at||''),updatedAt:String(run.updated_at||''),htmlUrl:String(run.html_url||'')},jobs,steps,progress:{completedSteps,successfulSteps,totalSteps:steps.length},actionsUrl,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub});
}


async function inspectPoolsAutomation(target,env){
  const expected={
    'monitoring/pools.mjs':POOLS_FILE,
    [`.github/workflows/${POOLS_WORKFLOW_FILE}`]:POOLS_WORKFLOW_TEMPLATE
  };
  const matches={},files={};let automationVersion='';
  for(const [path,content] of Object.entries(expected)){
    const remote=await githubTextFile(target,path,env);files[path]=Boolean(remote.exists);matches[path]=sameGithubText(remote,content);
    if(path==='monitoring/pools.mjs')automationVersion=String(remote.content||'').match(/MFE_POOLS_AUTOMATION_VERSION:\s*([^\s]+)/)?.[1]||'';
  }
  return {current:Object.values(matches).every(Boolean)&&automationVersion===POOLS_AUTOMATION_VERSION,automationVersion,matches,files,workflow:POOLS_WORKFLOW_FILE};
}
async function ensurePoolsAutomationCurrent(target,env){
  const before=await inspectPoolsAutomation(target,env);if(before.current)return {updated:false,...before};
  const written=[];
  written.push(await upsertGithubFile(target,'monitoring/pools.mjs',POOLS_FILE,env,`Actualizar piscinas · MFE Viajes v${POOLS_AUTOMATION_VERSION}`));
  written.push(await upsertGithubFile(target,`.github/workflows/${POOLS_WORKFLOW_FILE}`,POOLS_WORKFLOW_TEMPLATE,env,`Actualizar workflow piscinas · MFE Viajes v${POOLS_AUTOMATION_VERSION}`));
  const after=await inspectPoolsAutomation(target,env);if(!after.current)throw new ApiError(502,'GitHub recibió el monitor de piscinas, pero la verificación posterior no coincide.');
  return {updated:true,previousVersion:before.automationVersion,...after,written};
}
async function installPoolsAutomation(request,env){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),result=await ensurePoolsAutomationCurrent(target,env);
  return json({ok:true,installed:true,...result,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${POOLS_WORKFLOW_FILE}`});
}
async function poolsAutomationStatus(request,env){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),inspection=await inspectPoolsAutomation(target,env);
  return json({ok:true,installed:inspection.current,...inspection,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${POOLS_WORKFLOW_FILE}`});
}
async function dispatchPoolsWorkflow(target,env){
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(POOLS_WORKFLOW_FILE)}/dispatches`;
  await githubJson(url,{method:'POST',body:JSON.stringify({ref:target.branch,inputs:{force:'true'}})},env);return true;
}
async function runPoolsWorkflow(request,env){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),automation=await ensurePoolsAutomationCurrent(target,env),startedAt=new Date().toISOString();
  await dispatchPoolsWorkflow(target,env);
  return json({ok:true,workflowTriggered:true,startedAt,automationUpdated:Boolean(automation.updated),version:POOLS_AUTOMATION_VERSION,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${POOLS_WORKFLOW_FILE}`});
}

function trackerWorkflowFile(type,env){
  const key=String(type||'').toLowerCase();
  if(key==='autoreisen')return String(env?.GITHUB_WORKFLOW_FILE||'autoreisen-monitor.yml');
  if(key==='cordial')return String(env?.GITHUB_CORDIAL_WORKFLOW_FILE||CORDIAL_WORKFLOW_FILE);
  if(key==='vueling')return String(env?.GITHUB_VUELING_WORKFLOW_FILE||VUELING_WORKFLOW_FILE);
  if(key==='flightops')return String(env?.GITHUB_FLIGHTOPS_WORKFLOW_FILE||FLIGHTOPS_WORKFLOW_FILE);
  if(key==='pools')return POOLS_WORKFLOW_FILE;
  throw new ApiError(400,'Seguimiento no compatible con progreso de GitHub Actions.');
}
async function trackerRunStatus(request,env,payload){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),type=String(payload.type||'').toLowerCase(),workflow=trackerWorkflowFile(type,env);
  const startedAfterRaw=String(payload.startedAfter||'').trim(),startedAfter=Date.parse(startedAfterRaw),runId=String(payload.runId||'').trim();
  const runsUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs?branch=${encodeURIComponent(target.branch)}&event=workflow_dispatch&per_page=20`;
  const runsData=await githubJson(runsUrl,{method:'GET'},env),runs=Array.isArray(runsData?.workflow_runs)?runsData.workflow_runs:[];
  let run=runId?runs.find(item=>String(item.id)===runId):null;
  if(!run&&Number.isFinite(startedAfter))run=runs.find(item=>Date.parse(item.created_at||0)>=startedAfter-15000);
  if(!run&&!runId&&!Number.isFinite(startedAfter))run=runs[0];
  const actionsUrl=`https://github.com/${target.owner}/${target.repo}/actions/workflows/${workflow}`;
  if(!run)return json({ok:true,runFound:false,type,workflow,startedAfter:startedAfterRaw,actionsUrl,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub});
  const jobsUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/runs/${encodeURIComponent(run.id)}/jobs?per_page=100`;
  const jobsData=await githubJson(jobsUrl,{method:'GET'},env),jobs=(jobsData?.jobs||[]).map(job=>({id:job.id,name:String(job.name||''),status:String(job.status||''),conclusion:String(job.conclusion||''),startedAt:String(job.started_at||''),completedAt:String(job.completed_at||''),htmlUrl:String(job.html_url||''),steps:(job.steps||[]).map(step=>({name:String(step.name||''),status:String(step.status||''),conclusion:String(step.conclusion||''),number:Number(step.number)||0}))}));
  const steps=jobs.flatMap(job=>job.steps.map(step=>({...step,job:job.name}))),completedSteps=steps.filter(step=>step.status==='completed').length,successfulSteps=steps.filter(step=>step.conclusion==='success'||step.conclusion==='skipped').length,totalSteps=steps.length,failedSteps=steps.filter(step=>step.conclusion==='failure').map(step=>step.name);
  const percentage=totalSteps?Math.round(completedSteps*100/totalSteps):(run.status==='completed'?100:run.status==='in_progress'?5:2);
  return json({ok:true,runFound:true,type,workflow,startedAfter:startedAfterRaw,run:{id:run.id,name:String(run.name||''),displayTitle:String(run.display_title||''),status:String(run.status||''),conclusion:String(run.conclusion||''),event:String(run.event||''),createdAt:String(run.created_at||''),startedAt:String(run.run_started_at||''),updatedAt:String(run.updated_at||''),htmlUrl:String(run.html_url||'')},jobs,steps,progress:{completedSteps,successfulSteps,totalSteps,percentage},diagnostic:{failedSteps,summary:failedSteps.length?`Falló: ${failedSteps.join(' · ')}`:(run.status==='completed'&&run.conclusion==='success'?'Ejecución completada correctamente':'')},actionsUrl,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub});
}
async function githubAuthDiagnostic(request,env){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env);
  const repoUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}`;
  const repo=await githubJson(repoUrl,{method:'GET'},env);
  const workflowsUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows?per_page=100`;
  const workflows=await githubJson(workflowsUrl,{method:'GET'},env);
  return json({ok:true,githubAuth:true,repository:`${target.owner}/${target.repo}`,private:Boolean(repo?.private),defaultBranch:String(repo?.default_branch||target.branch),actionsReadable:Array.isArray(workflows?.workflows),workflowCount:Number(workflows?.total_count)||0,workerVersion:WORKER_VERSION,checkedAt:new Date().toISOString(),authorizedUid:user.sub});
}

const MOBILE_UPLOAD_TTL_SECONDS=1800;
function mobileUploadMetaKey(uid,uploadId){return `mobile-upload:${String(uid||'')}:${String(uploadId||'')}:meta`;}
function mobileUploadChunkKey(uid,uploadId,index){return `mobile-upload:${String(uid||'')}:${String(uploadId||'')}:chunk:${Number(index)}`;}
function mobileUploadLookupKey(uploadId){return `mobile-upload-id:${String(uploadId||'')}`;}
function validateMobileUploadId(value){const id=String(value||'').trim();if(!/^[A-Za-z0-9._-]{8,120}$/.test(id))throw new ApiError(400,'Identificador de subida no válido.');return id;}
async function readMobileUploadMeta(env,uid,uploadId){
  const raw=await requireTrackerKv(env).get(mobileUploadMetaKey(uid,uploadId));
  if(!raw)throw new ApiError(404,'La subida temporal ha caducado. Selecciona de nuevo el ZIP.');
  try{return JSON.parse(raw);}catch{throw new ApiError(500,'La subida temporal está dañada. Selecciona de nuevo el ZIP.');}
}
async function resolveMobileUpload(env,uploadId){
  const kv=requireTrackerKv(env),id=validateMobileUploadId(uploadId),uid=String(await kv.get(mobileUploadLookupKey(id))||'').trim();
  if(!uid)throw new ApiError(404,'La sesión de subida ha caducado. Selecciona de nuevo el ZIP.');
  const meta=await readMobileUploadMeta(env,uid,id);return {kv,uploadId:id,uid,meta};
}
async function initMobileReleaseUpload(request,env,payload={}){
  const user=await verifyFirebaseUser(request,env),kv=requireTrackerKv(env),name=String(payload.releaseName||'MFE_Viajes_RELEASE.zip').trim();
  const totalBytes=Math.trunc(Number(payload.totalBytes)),totalChunks=Math.trunc(Number(payload.totalChunks));
  if(!/\.zip$/i.test(name))throw new ApiError(400,'Selecciona un archivo ZIP de MFE Viajes.');
  if(!Number.isFinite(totalBytes)||totalBytes<=0)throw new ApiError(400,'El ZIP está vacío.');
  if(totalBytes>20*1024*1024)throw new ApiError(413,'El ZIP supera 20 MB. Usa una release compacta de MFE Viajes.');
  if(!Number.isInteger(totalChunks)||totalChunks<1||totalChunks>80)throw new ApiError(400,'Número de bloques de subida no válido.');
  const uploadId=`mfeup-${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const meta={uid:user.sub,name,totalBytes,totalChunks,createdAt:new Date().toISOString()};
  await Promise.all([
    kv.put(mobileUploadMetaKey(user.sub,uploadId),JSON.stringify(meta),{expirationTtl:MOBILE_UPLOAD_TTL_SECONDS}),
    kv.put(mobileUploadLookupKey(uploadId),String(user.sub),{expirationTtl:MOBILE_UPLOAD_TTL_SECONDS})
  ]);
  return json({ok:true,uploadId,totalBytes,totalChunks,expiresIn:MOBILE_UPLOAD_TTL_SECONDS,authorizedUid:user.sub});
}
async function storeMobileReleaseChunk(request,env,payload={}){
  const {kv,uploadId,uid,meta}=await resolveMobileUpload(env,payload.uploadId);
  const index=Math.trunc(Number(payload.index)),totalChunks=Math.trunc(Number(payload.totalChunks)),chunk=String(payload.chunkBase64||'').replace(/\s/g,'');
  if(totalChunks!==meta.totalChunks)throw new ApiError(409,'La cantidad de bloques no coincide con la subida iniciada.');
  if(!Number.isInteger(index)||index<0||index>=meta.totalChunks)throw new ApiError(400,'Índice de bloque no válido.');
  if(!chunk||chunk.length>700000||!/^[A-Za-z0-9+/]*={0,2}$/.test(chunk))throw new ApiError(400,'Bloque ZIP no válido.');
  if(index===0&&!/^UEsDB/.test(chunk))throw new ApiError(400,'El archivo seleccionado no parece un ZIP válido.');
  await kv.put(mobileUploadChunkKey(uid,uploadId,index),chunk,{expirationTtl:MOBILE_UPLOAD_TTL_SECONDS});
  return json({ok:true,received:true,uploadId,index,totalChunks:meta.totalChunks});
}
async function finalizeMobileReleaseUpload(request,env,payload={}){
  const {kv,uploadId,uid,meta}=await resolveMobileUpload(env,payload.uploadId),target=githubTarget(env);
  const chunks=[];
  for(let index=0;index<meta.totalChunks;index++){
    const chunk=await kv.get(mobileUploadChunkKey(uid,uploadId,index));
    if(!chunk)throw new ApiError(409,`Falta el bloque ${index+1}/${meta.totalChunks}. Reintenta la subida.`);
    chunks.push(chunk);
  }
  const base64=chunks.join('');
  if(!/^UEsDB/.test(base64))throw new ApiError(400,'El ZIP ensamblado no es válido.');
  const approxBytes=Math.floor(base64.replace(/=+$/,'').length*3/4);
  if(Math.abs(approxBytes-meta.totalBytes)>2)throw new ApiError(409,'El tamaño del ZIP ensamblado no coincide. Reintenta la subida.');
  const inspection=await mobileDeployWorkflowInspection(target,env);
  if(!inspection.current)await ensureMobileDeployWorkflowCurrent(target,env);
  const uploaded=await upsertGithubBase64File(target,MOBILE_DEPLOY_RELEASE_PATH,base64,env,`Subir release móvil · ${meta.name}`);
  const headSha=String(uploaded.commitSha||'').trim();
  await waitForGithubBranchCommit(target,env,headSha);
  await verifyGithubReleaseAtCommit(target,MOBILE_DEPLOY_RELEASE_PATH,headSha,env);
  const requestId=`mfe-${Date.now()}-${(headSha||crypto.randomUUID()).slice(0,10)}`;
  await dispatchMobileDeployWorkflow(target,env,requestId);
  const cleanup=[kv.delete(mobileUploadMetaKey(uid,uploadId)),kv.delete(mobileUploadLookupKey(uploadId))];
  for(let index=0;index<meta.totalChunks;index++)cleanup.push(kv.delete(mobileUploadChunkKey(uid,uploadId,index)));
  await Promise.allSettled(cleanup);
  return json({ok:true,uploaded:true,workflowTriggered:true,runFound:false,triggerMode:'workflow_dispatch',requestId,file:MOBILE_DEPLOY_RELEASE_PATH,bytes:meta.totalBytes,chunks:meta.totalChunks,commitUrl:uploaded.commitUrl||'',commitSha:headSha,actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:uid,dispatchedAt:new Date().toISOString()});
}

async function triggerMobileDeployWorkflow(request,env,payload={}){
  const user=await verifyFirebaseUserMobileStable(request,env),target=githubTarget(env);
  const inspection=await mobileDeployWorkflowInspection(target,env);
  if(!inspection.current)await installMobileDeployWorkflow(request,env);
  const requestId=String(payload.requestId||`mfe-${Date.now()}-${crypto.randomUUID().slice(0,8)}`).trim();
  await dispatchMobileDeployWorkflow(target,env,requestId);
  return json({ok:true,workflowTriggered:true,runFound:false,requestId,triggerMode:'workflow_dispatch',actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,dispatchedAt:new Date().toISOString()});
}
async function uploadMobileReleaseAndDispatch(request,env,payload){
  const user=await verifyFirebaseUserMobileStable(request,env),target=githubTarget(env);
  const base64=String(payload.releaseBase64||'').replace(/\s/g,''),name=String(payload.releaseName||'MFE_Viajes_RELEASE.zip').trim();
  if(!/\.zip$/i.test(name))throw new ApiError(400,'Selecciona un archivo ZIP de MFE Viajes.');
  if(!base64||!/^UEsDB/.test(base64))throw new ApiError(400,'El archivo seleccionado no parece un ZIP válido.');
  const approxBytes=Math.floor(base64.length*3/4);if(approxBytes>20*1024*1024)throw new ApiError(413,'El ZIP supera 20 MB. Usa una release compacta de MFE Viajes.');
  const inspection=await mobileDeployWorkflowInspection(target,env);
  if(!inspection.current)await installMobileDeployWorkflow(request,env);
  const uploaded=await upsertGithubBase64File(target,MOBILE_DEPLOY_RELEASE_PATH,base64,env,`Subir release móvil · ${name}`);
  const commitSha=String(uploaded.commitSha||'').trim();
  await waitForGithubBranchCommit(target,env,commitSha);
  const verifiedRelease=await verifyGithubReleaseAtCommit(target,MOBILE_DEPLOY_RELEASE_PATH,commitSha,env);
  const requestId=`mfe-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
  await dispatchMobileDeployWorkflow(target,env,requestId);
  return json({ok:true,uploaded:true,workflowTriggered:true,runFound:false,triggerMode:'workflow_dispatch',requestId,file:MOBILE_DEPLOY_RELEASE_PATH,bytes:approxBytes,commitUrl:uploaded.commitUrl||'',commitSha,verifiedBlobSha:verifiedRelease.blobSha,verifiedBytes:verifiedRelease.size,actionsUrl:`https://github.com/${target.owner}/${target.repo}/actions/workflows/${MOBILE_DEPLOY_WORKFLOW_FILE}`,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,dispatchedAt:new Date().toISOString()});
}
async function dispatchAutoreisenWorkflow(target,env,{force=false,telegramTest=false,fleetOnly=false,requestId='',fleetConfig=null}={}){
  if(!target.workflow)throw new ApiError(503,'GITHUB_WORKFLOW_FILE no está configurado.');
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(target.workflow)}/dispatches`;
  await githubJson(url,{method:'POST',body:JSON.stringify({ref:target.branch,inputs:{force:String(Boolean(force)),telegram_test:String(Boolean(telegramTest)),fleet_only:String(Boolean(fleetOnly)),request_id:String(requestId||''),fleet_config_json:fleetOnly&&fleetConfig?JSON.stringify(fleetConfig):''}})},env);
  return true;
}
async function autoreisenRemoteAutomationVersion(target,env){
  const remote=await githubTextFile(target,'monitoring/autoreisen.mjs',env);
  return remote.content.match(/MFE_AUTOREISEN_AUTOMATION_VERSION:\s*([^\s]+)/)?.[1]||'';
}
async function inspectAutoreisenAutomation(target,env){
  const workflowPath=`.github/workflows/${target.workflow||'autoreisen-monitor.yml'}`;
  const expected={...AUTOREISEN_INSTALL_FILES,[workflowPath]:AUTOREISEN_WORKFLOW_TEMPLATE};
  const matches={},files={};let automationVersion='';
  for(const [path,content] of Object.entries(expected)){
    const remote=await githubTextFile(target,path,env);files[path]=Boolean(remote.exists);matches[path]=sameGithubText(remote,content);
    if(path==='monitoring/autoreisen.mjs')automationVersion=remote.content.match(/MFE_AUTOREISEN_AUTOMATION_VERSION:\s*([^\s]+)/)?.[1]||'';
  }
  const current=Object.values(matches).every(Boolean)&&automationVersion===AUTOREISEN_AUTOMATION_VERSION;
  return {current,automationVersion,matches,files,workflowPath};
}
async function ensureAutoreisenAutomationCurrent(target,env){
  const inspection=await inspectAutoreisenAutomation(target,env);if(inspection.current)return {updated:false,version:inspection.automationVersion,matches:inspection.matches};
  const written=[];
  for(const [path,content] of Object.entries(AUTOREISEN_INSTALL_FILES))written.push(await upsertGithubFile(target,path,content,env,`Actualizar AutoReisen · MFE Viajes v${AUTOREISEN_AUTOMATION_VERSION}`));
  written.push(await upsertGithubFile(target,inspection.workflowPath,AUTOREISEN_WORKFLOW_TEMPLATE,env,`Actualizar workflow AutoReisen · MFE Viajes v${AUTOREISEN_AUTOMATION_VERSION}`));
  const verified=await inspectAutoreisenAutomation(target,env);if(!verified.current)throw new ApiError(502,'GitHub recibió la actualización de AutoReisen, pero la verificación posterior no coincide con los archivos canónicos.');
  return {updated:true,version:AUTOREISEN_AUTOMATION_VERSION,previousVersion:inspection.automationVersion,matches:verified.matches,written};
}
async function installAutoreisenAutomation(request,env,payload){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env);const written=[];
  for(const [path,content] of Object.entries(AUTOREISEN_INSTALL_FILES))written.push(await upsertGithubFile(target,path,content,env,`Instalar AutoReisen · MFE Viajes v${AUTOREISEN_AUTOMATION_VERSION}`));
  const workflowPath=`.github/workflows/${target.workflow||'autoreisen-monitor.yml'}`;
  written.push(await upsertGithubFile(target,workflowPath,AUTOREISEN_WORKFLOW_TEMPLATE,env,`Instalar workflow AutoReisen · MFE Viajes v${AUTOREISEN_AUTOMATION_VERSION}`));
  if(payload?.config&&Object.keys(payload.config).length){
    const cfg=cleanAutoreisenConfig(payload.config);const path=target.path;let document={autoreisen:{}};
    const encoded=path.split('/').map(encodeURIComponent).join('/');const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encoded}?ref=${encodeURIComponent(target.branch)}`;
    const current=await githubRequestRaw(url,{method:'GET'},env);if(current.ok){const data=await current.json();try{document=JSON.parse(decodeGithubContent(data.content));}catch{document={autoreisen:{}};}}
    document.autoreisen={...(document.autoreisen||{}),...cfg};written.push(await upsertGithubFile(target,path,`${JSON.stringify(document,null,2)}\n`,env,`Sincronizar configuración AutoReisen · MFE Viajes v${AUTOREISEN_AUTOMATION_VERSION}`));
  }
  const verified=await inspectAutoreisenAutomation(target,env);if(!verified.current)throw new ApiError(502,'La instalación de AutoReisen terminó, pero los archivos de GitHub no coinciden con la versión canónica.');
  return json({ok:true,installed:true,automationVersion:AUTOREISEN_AUTOMATION_VERSION,matches:verified.matches,written,workflow:target.workflow,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}
async function runAutoreisenWorkflow(request,env,payload){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env);const telegramTest=payload.mode==='telegram-test'||payload.telegramTest;const fleetOnly=payload.mode==='fleet';
  const automationUpdate=await ensureAutoreisenAutomationCurrent(target,env);
  const requestId=fleetOnly?(String(payload.requestId||'').trim()||`fleet-${Date.now()}`):'';
  const fleetConfig=fleetOnly?cleanAutoreisenConfig(payload.config||{}):null;
  await dispatchAutoreisenWorkflow(target,env,{force:telegramTest?false:(payload.force!==false),telegramTest,fleetOnly,requestId,fleetConfig});
  return json({ok:true,workflowTriggered:true,mode:telegramTest?'telegram-test':fleetOnly?'fleet':'monitor',requestId,automationUpdate,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}
async function autoreisenAutomationStatus(request,env){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env);const inspection=await inspectAutoreisenAutomation(target,env);const files={...inspection.files};
  const configPath=target.path;const configRemote=await githubTextFile(target,configPath,env);files[configPath]=Boolean(configRemote.exists);
  let telegramSecrets=null;try{const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/secrets?per_page=100`;const data=await githubJson(url,{method:'GET'},env);const names=(data?.secrets||[]).map(x=>x.name);telegramSecrets={bot:names.includes('TELEGRAM_BOT_TOKEN')||names.includes('TELEGRAM_TOKEN')||names.includes('BOT_TOKEN'),chat:names.includes('TELEGRAM_CHAT_ID')||names.includes('TELEGRAM_CHAT')||names.includes('CHAT_ID'),worker:names.includes('MFE_WORKER_URL'),monitorSecret:names.includes('MFE_MONITOR_SECRET')};}catch{telegramSecrets=null;}
  const installed=inspection.current&&Boolean(files[configPath]);
  return json({ok:true,installed,automationVersion:inspection.automationVersion,expectedAutomationVersion:AUTOREISEN_AUTOMATION_VERSION,files,matches:inspection.matches,telegramSecrets,workflow:target.workflow,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub,checkedAt:new Date().toISOString()});
}

async function githubTextFile(target,path,env){
  try{
    const encoded=String(path).split('/').map(encodeURIComponent).join('/');
    const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encoded}?ref=${encodeURIComponent(target.branch)}`;
    const response=await githubRequestRaw(url,{method:'GET'},env);
    if(response.status===404)return {exists:false,content:''};
    if(!response.ok)return {exists:false,content:'',status:response.status};
    const data=await response.json();return {exists:true,content:decodeGithubContent(data.content||'')};
  }catch{return {exists:false,content:''};}
}
function sameGithubText(remote,canonical){
  const norm=value=>String(value||'').replace(/\r\n/g,'\n').replace(/\n?$/,'\n');
  return Boolean(remote?.exists)&&norm(remote.content)===norm(canonical);
}
async function cordialRemoteAutomationVersion(target,env){
  const remote=await githubTextFile(target,'monitoring/cordial.mjs',env);
  return remote.content.match(/MFE_CORDIAL_AUTOMATION_VERSION:\s*([^\s]+)/)?.[1]||'';
}
async function inspectCordialAutomation(target,env){
  const paths={
    cordial:'monitoring/cordial.mjs',
    runner:'monitoring/cordial-run.mjs',
    lib:'monitoring/lib.mjs',
    workflow:`.github/workflows/${CORDIAL_WORKFLOW_FILE}`
  };
  const [cordial,runner,lib,workflow]=await Promise.all([githubTextFile(target,paths.cordial,env),githubTextFile(target,paths.runner,env),githubTextFile(target,paths.lib,env),githubTextFile(target,paths.workflow,env)]);
  const matches={cordial:sameGithubText(cordial,CORDIAL_FILE),runner:sameGithubText(runner,CORDIAL_RUN_FILE),lib:sameGithubText(lib,AUTOREISEN_FILE_0),workflow:sameGithubText(workflow,CORDIAL_WORKFLOW_TEMPLATE)};
  const automationVersion=cordial.content.match(/MFE_CORDIAL_AUTOMATION_VERSION:\s*([^\s]+)/)?.[1]||'';
  return {paths,remotes:{cordial,runner,lib,workflow},matches,automationVersion,current:Object.values(matches).every(Boolean)&&automationVersion===CORDIAL_AUTOMATION_VERSION};
}
async function ensureCordialAutomationCurrent(target,env){
  const inspection=await inspectCordialAutomation(target,env);
  if(inspection.current)return {updated:false,version:inspection.automationVersion,matches:inspection.matches};
  const written=[];
  written.push(await upsertGithubFile(target,'monitoring/lib.mjs',AUTOREISEN_FILE_0,env,'Actualizar librería común de monitores · MFE Viajes v2.2.12'));
  written.push(await upsertGithubFile(target,'monitoring/cordial.mjs',CORDIAL_FILE,env,'Actualizar consulta Cordial · MFE Viajes v2.2.12'));
  written.push(await upsertGithubFile(target,'monitoring/cordial-run.mjs',CORDIAL_RUN_FILE,env,'Actualizar monitor Cordial · MFE Viajes v2.2.12'));
  written.push(await upsertGithubFile(target,`.github/workflows/${CORDIAL_WORKFLOW_FILE}`,CORDIAL_WORKFLOW_TEMPLATE,env,'Actualizar workflow Cordial · MFE Viajes v2.2.12'));
  const verified=await inspectCordialAutomation(target,env);
  if(!verified.current)throw new ApiError(502,'GitHub recibió los archivos Cordial, pero la verificación de integridad no coincide con la versión publicada. No se lanzará el workflow.');
  return {updated:true,version:CORDIAL_AUTOMATION_VERSION,previousVersion:inspection.automationVersion,matches:verified.matches,written};
}
async function dispatchCordialWorkflow(target,env){
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(CORDIAL_WORKFLOW_FILE)}/dispatches`;
  await githubJson(url,{method:'POST',body:JSON.stringify({ref:target.branch})},env);return true;
}
async function syncCordialToGitHub(request,env,payload){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env),config=cleanCordialConfig(payload.config||{});const automationUpdate=await ensureCordialAutomationCurrent(target,env);
  const contentUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${target.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(target.branch)}`;
  const current=await githubJson(contentUrl,{method:'GET'},env);let document;try{document=JSON.parse(decodeGithubContent(current.content));}catch{throw new ApiError(502,'monitoring/config.json no contiene JSON válido.');}
  document.cordial={...(document.cordial||{}),...config};
  const update=await githubJson(contentUrl.replace(/\?ref=.*/,''),{method:'PUT',body:JSON.stringify({message:`Sincronizar Cordial desde MFE Viajes (${config.checkIn}–${config.checkOut})`,content:encodeGithubContent(`${JSON.stringify(document,null,2)}\n`),sha:current.sha,branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}})},env);
  let workflowTriggered=false;if(payload.runWorkflow){await dispatchCordialWorkflow(target,env);workflowTriggered=true;}
  return json({ok:true,updated:true,workflowTriggered,commitUrl:update?.commit?.html_url||'',repository:`${target.owner}/${target.repo}`,path:target.path,branch:target.branch,authorizedUid:user.sub,automationUpdate,updatedAt:new Date().toISOString()});
}
async function installCordialAutomation(request,env,payload){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env);const written=[];written.push(await upsertGithubFile(target,'monitoring/lib.mjs',AUTOREISEN_FILE_0,env,'Instalar librería común de monitores · MFE Viajes v2.2.12'));written.push(await upsertGithubFile(target,'monitoring/cordial.mjs',CORDIAL_FILE,env,'Instalar consulta Cordial · MFE Viajes v2.2.12'));written.push(await upsertGithubFile(target,'monitoring/cordial-run.mjs',CORDIAL_RUN_FILE,env,'Instalar monitor Cordial · MFE Viajes v2.2.12'));written.push(await upsertGithubFile(target,`.github/workflows/${CORDIAL_WORKFLOW_FILE}`,CORDIAL_WORKFLOW_TEMPLATE,env,'Instalar workflow Cordial · MFE Viajes v2.2.12'));
  if(payload?.config&&Object.keys(payload.config).length){const cfg=cleanCordialConfig(payload.config),path=target.path,encoded=path.split('/').map(encodeURIComponent).join('/'),url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encoded}?ref=${encodeURIComponent(target.branch)}`;const current=await githubRequestRaw(url,{method:'GET'},env);let document={cordial:{}};if(current.ok){const data=await current.json();try{document=JSON.parse(decodeGithubContent(data.content));}catch{}}document.cordial={...(document.cordial||{}),...cfg};written.push(await upsertGithubFile(target,path,`${JSON.stringify(document,null,2)}\n`,env,'Sincronizar configuración Cordial · MFE Viajes v2.2.08'));}
  const verification=await inspectCordialAutomation(target,env);
  if(!verification.current)throw new ApiError(502,'La automatización Cordial no ha superado la verificación de integridad después de instalarla.');
  return json({ok:true,installed:true,automationVersion:verification.automationVersion,matches:verification.matches,written,workflow:CORDIAL_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}
async function runCordialWorkflow(request,env,payload){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env);const automationUpdate=await ensureCordialAutomationCurrent(target,env);
  let configSynced=false;
  if(payload?.config&&Object.keys(payload.config).length){
    const cfg=cleanCordialConfig(payload.config),path=target.path,encoded=path.split('/').map(encodeURIComponent).join('/'),url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encoded}?ref=${encodeURIComponent(target.branch)}`;
    const current=await githubRequestRaw(url,{method:'GET'},env);let document={};let sha='';if(current.ok){const data=await current.json();sha=data.sha||'';try{document=JSON.parse(decodeGithubContent(data.content));}catch{throw new ApiError(502,'monitoring/config.json no contiene JSON válido.');}}
    document.cordial={...(document.cordial||{}),...cfg};
    const body={message:`Preparar consulta Cordial (${cfg.checkIn}–${cfg.checkOut})`,content:encodeGithubContent(`${JSON.stringify(document,null,2)}\n`),branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}};if(sha)body.sha=sha;
    await githubJson(url.replace(/\?ref=.*/,''),{method:'PUT',body:JSON.stringify(body)},env);configSynced=true;
  }
  await dispatchCordialWorkflow(target,env);return json({ok:true,workflowTriggered:true,configSynced,automationUpdate,workflow:CORDIAL_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}
async function cordialAutomationStatus(request,env){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env),inspection=await inspectCordialAutomation(target,env);
  const configRemote=await githubTextFile(target,target.path,env);
  const files={[target.path]:configRemote.exists,[inspection.paths.cordial]:inspection.remotes.cordial.exists,[inspection.paths.runner]:inspection.remotes.runner.exists,[inspection.paths.workflow]:inspection.remotes.workflow.exists};
  const installed=Boolean(configRemote.exists&&inspection.current);
  return json({ok:true,installed,automationVersion:inspection.automationVersion,expectedAutomationVersion:CORDIAL_AUTOMATION_VERSION,files,matches:inspection.matches,workflow:CORDIAL_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub,checkedAt:new Date().toISOString()});
}


async function inspectFlightOpsAutomation(target,env){
  const paths={monitor:'monitoring/flightops.mjs',runner:'monitoring/flightops-run.mjs',lib:'monitoring/lib.mjs',workflow:`.github/workflows/${FLIGHTOPS_WORKFLOW_FILE}`};
  const [monitor,runner,lib,workflow]=await Promise.all([githubTextFile(target,paths.monitor,env),githubTextFile(target,paths.runner,env),githubTextFile(target,paths.lib,env),githubTextFile(target,paths.workflow,env)]);
  const matches={monitor:sameGithubText(monitor,FLIGHTOPS_FILE),runner:sameGithubText(runner,FLIGHTOPS_RUN_FILE),lib:sameGithubText(lib,AUTOREISEN_FILE_0),workflow:sameGithubText(workflow,FLIGHTOPS_WORKFLOW_TEMPLATE)};
  const automationVersion=monitor.content.match(/MFE_FLIGHTOPS_AUTOMATION_VERSION:\s*([^\s]+)/)?.[1]||'';
  return {paths,remotes:{monitor,runner,lib,workflow},matches,automationVersion,current:Object.values(matches).every(Boolean)&&automationVersion===FLIGHTOPS_AUTOMATION_VERSION};
}
async function ensureFlightOpsAutomationCurrent(target,env){
  const inspection=await inspectFlightOpsAutomation(target,env);if(inspection.current)return {updated:false,version:inspection.automationVersion,matches:inspection.matches};
  const written=[];written.push(await upsertGithubFile(target,'monitoring/lib.mjs',AUTOREISEN_FILE_0,env,'Actualizar librería común · Estado vuelos MFE'));written.push(await upsertGithubFile(target,'monitoring/flightops.mjs',FLIGHTOPS_FILE,env,`Actualizar consulta operativa vuelos · v${FLIGHTOPS_AUTOMATION_VERSION}`));written.push(await upsertGithubFile(target,'monitoring/flightops-run.mjs',FLIGHTOPS_RUN_FILE,env,`Actualizar runner estado vuelos · v${FLIGHTOPS_AUTOMATION_VERSION}`));written.push(await upsertGithubFile(target,`.github/workflows/${FLIGHTOPS_WORKFLOW_FILE}`,FLIGHTOPS_WORKFLOW_TEMPLATE,env,`Actualizar workflow estado vuelos · v${FLIGHTOPS_AUTOMATION_VERSION}`));
  const verified=await inspectFlightOpsAutomation(target,env);if(!verified.current)throw new ApiError(502,'La automatización de estado de vuelos no ha superado la verificación de integridad.');
  return {updated:true,version:verified.automationVersion,matches:verified.matches,written};
}
async function writeFlightOpsConfig(target,env,config,message='Sincronizar estado de vuelos · MFE Viajes'){
  const clean=cleanFlightOpsConfig(config),path=target.path,encoded=path.split('/').map(encodeURIComponent).join('/'),url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${encoded}?ref=${encodeURIComponent(target.branch)}`;
  const current=await githubRequestRaw(url,{method:'GET'},env);let document={},sha='';if(current.ok){const data=await current.json();sha=data.sha||'';try{document=JSON.parse(decodeGithubContent(data.content));}catch{throw new ApiError(502,'monitoring/config.json no contiene JSON válido.');}}else if(current.status!==404){let data=null;try{data=await current.json();}catch{}throw githubApiError(current,data);}
  const nextFlightOps={...(document.flightops||{}),...clean};
  if(JSON.stringify(document.flightops||{})===JSON.stringify(nextFlightOps))return {clean,commitUrl:'',updated:false};
  document.flightops=nextFlightOps;const body={message,content:encodeGithubContent(`${JSON.stringify(document,null,2)}
`),branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}};if(sha)body.sha=sha;
  const update=await githubJson(url.replace(/\?ref=.*/,''),{method:'PUT',body:JSON.stringify(body)},env);return {clean,commitUrl:update?.commit?.html_url||'',updated:true};
}
async function dispatchFlightOpsWorkflow(target,env,{force=true}={}){
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(FLIGHTOPS_WORKFLOW_FILE)}/dispatches`;
  await githubJson(url,{method:'POST',body:JSON.stringify({ref:target.branch,inputs:{force:String(Boolean(force))}})},env);return true;
}
async function syncFlightOpsToGitHub(request,env,payload){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),automationUpdate=await ensureFlightOpsAutomationCurrent(target,env),written=await writeFlightOpsConfig(target,env,payload.config||{});let workflowTriggered=false;if(payload.runWorkflow){await dispatchFlightOpsWorkflow(target,env,{force:true});workflowTriggered=true;}
  return json({ok:true,updated:true,workflowTriggered,automationUpdate,commitUrl:written.commitUrl,workflow:FLIGHTOPS_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}
async function installFlightOpsAutomation(request,env,payload){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),automationUpdate=await ensureFlightOpsAutomationCurrent(target,env);let configSynced=false;if(payload?.config&&Object.keys(payload.config).length){await writeFlightOpsConfig(target,env,payload.config,'Instalar configuración estado vuelos · MFE Viajes');configSynced=true;}
  return json({ok:true,installed:true,configSynced,automationVersion:FLIGHTOPS_AUTOMATION_VERSION,automationUpdate,workflow:FLIGHTOPS_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}
async function runFlightOpsWorkflow(request,env,payload){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),automationUpdate=await ensureFlightOpsAutomationCurrent(target,env);let configSynced=false;if(payload?.config&&Object.keys(payload.config).length){await writeFlightOpsConfig(target,env,payload.config,'Preparar consulta estado vuelos · MFE Viajes');configSynced=true;}await dispatchFlightOpsWorkflow(target,env,{force:payload.force!==false});
  return json({ok:true,workflowTriggered:true,configSynced,automationUpdate,workflow:FLIGHTOPS_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}
async function flightOpsAutomationStatus(request,env){
  const user=await verifyFirebaseUser(request,env),target=githubTarget(env),inspection=await inspectFlightOpsAutomation(target,env),configRemote=await githubTextFile(target,target.path,env);let configReady=false;if(configRemote.exists){try{const doc=JSON.parse(configRemote.content||'{}');configReady=Array.isArray(doc?.flightops?.flights)&&doc.flightops.flights.length>0;}catch{}}
  return json({ok:true,installed:Boolean(inspection.current&&configReady),configReady,automationVersion:inspection.automationVersion,expectedAutomationVersion:FLIGHTOPS_AUTOMATION_VERSION,matches:inspection.matches,workflow:FLIGHTOPS_WORKFLOW_FILE,repository:`${target.owner}/${target.repo}`,authorizedUid:user.sub,checkedAt:new Date().toISOString()});
}


async function removeLegacyVuelingWorkflows(request,env){
  const user=await verifyFirebaseUser(request,env);const target=githubTarget(env);
  const folderPath='.github/workflows';
  const folderUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${folderPath}?ref=${encodeURIComponent(target.branch)}`;
  const entries=await githubJson(folderUrl,{method:'GET'},env);
  if(!Array.isArray(entries))throw new ApiError(502,'GitHub no ha devuelto la carpeta de workflows correctamente.');
  const deleted=[];
  for(const entry of entries){
    if(entry?.type!=='file'||!/\.ya?ml$/i.test(String(entry.name||'')))continue;
    const fileUrl=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/contents/${folderPath}/${encodeURIComponent(entry.name)}?ref=${encodeURIComponent(target.branch)}`;
    const file=await githubJson(fileUrl,{method:'GET'},env);
    let content='';try{content=decodeGithubContent(file.content||'');}catch{}
    if(!/vueling/i.test(`${entry.name}
${content}`))continue;
    const deleteUrl=fileUrl.replace(/\?ref=.*/,'');
    await githubJson(deleteUrl,{method:'DELETE',body:JSON.stringify({message:`Eliminar seguimiento antiguo de Vueling desde MFE Viajes`,sha:file.sha,branch:target.branch,committer:{name:'MFE Viajes',email:'mfe-viajes@users.noreply.github.com'}})},env);
    deleted.push(entry.name);
  }
  return json({ok:true,deleted,repository:`${target.owner}/${target.repo}`,branch:target.branch,authorizedUid:user.sub,updatedAt:new Date().toISOString()});
}

function madridDateParts(value=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:MONITOR_FALLBACK_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value);
  const get=type=>parts.find(x=>x.type===type)?.value||'';
  return {date:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour'))||0,minute:Number(get('minute'))||0};
}
function monitorFallbackKey(day){return `monitor:fallback:${String(day||'').trim()}`;}
async function readMonitorFallbackDay(env,day){
  try{const raw=await requireTrackerKv(env).get(monitorFallbackKey(day));return raw?JSON.parse(raw):null;}catch{return null;}
}
async function writeMonitorFallbackDay(env,day,value){
  await requireTrackerKv(env).put(monitorFallbackKey(day),JSON.stringify(value),{expirationTtl:60*60*24*45});
}
function fallbackWorkflowName(env,tracker){
  return String(env?.[tracker.workflowEnv]||tracker.workflowDefault||'').trim();
}
function githubRunMadridDate(run){
  const stamp=Date.parse(run?.run_started_at||run?.created_at||'');
  return Number.isFinite(stamp)?madridDateParts(new Date(stamp)).date:'';
}
async function githubWorkflowRunsToday(env,target,workflow,day){
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(workflow)}/runs?branch=${encodeURIComponent(target.branch)}&per_page=30`;
  const data=await githubJson(url,{method:'GET'},env);const runs=Array.isArray(data?.workflow_runs)?data.workflow_runs:[];
  return runs.filter(run=>githubRunMadridDate(run)===day).map(run=>({id:run.id,event:String(run.event||''),status:String(run.status||''),conclusion:String(run.conclusion||''),createdAt:String(run.created_at||''),startedAt:String(run.run_started_at||''),htmlUrl:String(run.html_url||'')}));
}
async function dispatchFallbackWorkflow(env,target,tracker,workflow){
  const url=`https://api.github.com/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  const body={ref:target.branch};if(tracker.inputs)body.inputs=tracker.inputs;
  await githubJson(url,{method:'POST',body:JSON.stringify(body)},env);return true;
}
async function monitorFallbackStatus(env){
  const now=new Date(),local=madridDateParts(now),stored=await readMonitorFallbackDay(env,local.date);
  return json({ok:true,enabled:true,date:local.date,localTime:`${String(local.hour).padStart(2,'0')}:${String(local.minute).padStart(2,'0')}`,timeZone:MONITOR_FALLBACK_TIME_ZONE,checkAfter:'07:15',lastCheck:stored||null});
}
async function runMonitorFallbackCheck(env,{scheduledAt=new Date(),source='cron',force=false}={}){
  const local=madridDateParts(scheduledAt),minuteOfDay=local.hour*60+local.minute,threshold=MONITOR_FALLBACK_LOCAL_HOUR*60+MONITOR_FALLBACK_LOCAL_MINUTE;
  const prior=await readMonitorFallbackDay(env,local.date);
  if(!force&&minuteOfDay<threshold)return {ok:true,skipped:true,reason:'before-local-window',date:local.date,localTime:`${String(local.hour).padStart(2,'0')}:${String(local.minute).padStart(2,'0')}`,timeZone:MONITOR_FALLBACK_TIME_ZONE,lastCheck:prior||null};
  if(!force&&prior?.completed===true)return {ok:true,skipped:true,reason:'already-checked',date:local.date,lastCheck:prior};
  const target=githubTarget(env),startedAt=new Date().toISOString(),trackers={};
  const record={date:local.date,startedAt,checkedAt:'',source,timeZone:MONITOR_FALLBACK_TIME_ZONE,localTime:`${String(local.hour).padStart(2,'0')}:${String(local.minute).padStart(2,'0')}`,completed:false,trackers};
  for(const tracker of MONITOR_FALLBACK_TRACKERS){
    const workflow=fallbackWorkflowName(env,tracker);const item={label:tracker.label,workflow,runFound:false,dispatched:false,dispatchedAt:'',run:null,error:''};trackers[tracker.id]=item;
    try{
      const runs=await githubWorkflowRunsToday(env,target,workflow,local.date);const existing=runs[0]||null;
      if(existing){item.runFound=true;item.run=existing;continue;}
      await dispatchFallbackWorkflow(env,target,tracker,workflow);item.dispatched=true;item.dispatchedAt=new Date().toISOString();
    }catch(error){item.error=String(error?.message||error||'Error desconocido');}
  }
  record.checkedAt=new Date().toISOString();record.completed=Object.values(trackers).every(x=>x.runFound||x.dispatched);
  record.dispatchedCount=Object.values(trackers).filter(x=>x.dispatched).length;record.errorCount=Object.values(trackers).filter(x=>x.error).length;
  await writeMonitorFallbackDay(env,local.date,record);
  return {ok:record.errorCount===0,...record};
}

function requireTrackerKv(env){
  if(!env?.MFE_TRACKERS)throw new ApiError(503,"El almacenamiento KV MFE_TRACKERS no está configurado en el Worker.");
  return env.MFE_TRACKERS;
}
function trackerType(value){
  const type=String(value||"").toLowerCase();
  if(!["autoreisen","cordial","pools","autoreisen-stage2","dunas"].includes(type))throw new ApiError(400,"Seguimiento no válido.");
  return type;
}
function bearerToken(request){
  const auth=request.headers.get("Authorization")||"";
  return auth.startsWith("Bearer ")?auth.slice(7).trim():"";
}
async function writeTrackerResult(request,env,payload){
  const expected=String(env?.MONITOR_SECRET||"");
  if(!expected)throw new ApiError(503,"El secreto MONITOR_SECRET no está configurado.");
  if(bearerToken(request)!==expected)throw new ApiError(401,"No autorizado.");
  const type=trackerType(payload.type);
  const kv=requireTrackerKv(env);
  const result={...(payload.result||{}),type,receivedAt:new Date().toISOString()};
  if(!result.checkedAt)result.checkedAt=result.receivedAt;
  if(result.status!=="error" && result.ok!==false){result.ok=true;result.status="ok";}
  const failed=result.status==="error"||result.ok===false;
  if(result.scanMode==='fleet'){
    const requestId=String(result.requestId||'').trim();if(!requestId)throw new ApiError(400,'Falta requestId en la consulta puntual de flota.');
    await kv.put(`tracker:${type}:fleet:${requestId}`,JSON.stringify(result),{expirationTtl:60*20});
    await kv.put(`tracker:${type}:fleet:latest`,JSON.stringify(result),{expirationTtl:60*60*6});
    return json({ok:true,type,scanMode:'fleet',requestId,storedAt:result.receivedAt});
  }
  if(failed)await kv.put(`tracker:${type}:last-error`,JSON.stringify(result),{expirationTtl:60*60*24*30});
  else {await kv.put(`tracker:${type}:latest`,JSON.stringify(result));await kv.delete(`tracker:${type}:last-error`);}
  const day=String(result.checkedAt).slice(0,10)||new Date().toISOString().slice(0,10);
  const historyId=type==='pools'?String(result.checkedAt||result.receivedAt||new Date().toISOString()).replace(/[^0-9T]/g,'').slice(0,15):day;
  await kv.put(`tracker:${type}:history:${historyId}`,JSON.stringify(result),{expirationTtl:60*60*24*400});
  const indexKey=`tracker:${type}:history:index`;
  let index=[];try{index=JSON.parse(await kv.get(indexKey)||"[]");}catch{}
  index=[historyId,...index.filter(x=>x!==historyId)].slice(0,type==='pools'?240:400);
  await kv.put(indexKey,JSON.stringify(index));
  return json({ok:true,type,storedAt:result.receivedAt});
}
async function readAutoreisenFleetResult(request,env,payload){
  await verifyFirebaseUser(request,env);const requestId=String(payload.requestId||'').trim();if(!requestId)throw new ApiError(400,'Falta el identificador de la consulta de flota.');
  const kv=requireTrackerKv(env),raw=await kv.get(`tracker:autoreisen:fleet:${requestId}`);if(!raw)return json({ok:true,pending:true,requestId});
  let result;try{result=JSON.parse(raw);}catch{throw new ApiError(500,'El resultado de flota guardado no es válido.');}
  return json({ok:true,pending:false,requestId,result});
}
async function readTrackerResult(env,value){
  const type=trackerType(value);const kv=requireTrackerKv(env);
  const raw=await kv.get(`tracker:${type}:latest`);const errorRaw=await kv.get(`tracker:${type}:last-error`);
  let lastError=null;if(errorRaw){try{lastError=JSON.parse(errorRaw);}catch{}}
  if(!raw){if(['autoreisen-stage2','dunas'].includes(type))return json({ok:true,result:null,lastError,pending:!lastError});if(lastError)return json({ok:false,lastError,error:lastError.error||`La última consulta de ${type} falló.`},502);throw new ApiError(404,`Todavía no hay resultados automáticos de ${type}. Ejecuta primero el monitor de GitHub Actions.`);}
  let result;try{result=JSON.parse(raw);}catch{throw new ApiError(500,"El último resultado guardado no es válido.");}
  return json({ok:true,result,lastError,message:lastError?`Se conserva el último dato correcto de ${type}; la consulta más reciente falló.`:`Último dato automático de ${type}.`});
}
async function readTrackerHistory(env,value){
  const type=trackerType(value);const kv=requireTrackerKv(env);
  let days=[];try{days=JSON.parse(await kv.get(`tracker:${type}:history:index`)||"[]");}catch{}
  const results=[];for(const id of days.slice(0,type==='pools'?160:90)){const raw=await kv.get(`tracker:${type}:history:${id}`);if(raw){try{results.push(JSON.parse(raw));}catch{}}}
  return json({ok:true,type,results});
}


const LIVE_AENA_BASE='https://www.aena.es/sites/Satellite';
const LIVE_AENA_STATUS={SCH:'Programado',INI:'Programado',HOR:'En hora',RET:'Retrasado',EMB:'Embarcando',ULL:'Última llamada',NPT:'Cambio de puerta',CER:'Puerta cerrada',FLY:'Despegado',FNL:'En aproximación',LND:'Aterrizado',ATE:'Aterrizado',OPE:'Equipaje en cinta',OPF:'Equipaje en cinta',IBK:'Equipaje en cinta',BOR:'Finalizado',CAN:'Cancelado',DES:'Desviado'};
function foClean(v){return String(v??'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();}
function foUpper(v){return foClean(v).toUpperCase();}
function foNorm(v){return foUpper(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
function foDigits(v){return String(v||'').replace(/\D+/g,'');}
function foAirport(v){return foUpper(v).match(/\b([A-Z]{3})\b/)?.[1]||'';}
function foDateEs(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}/${m[2]}/${m[1]}`:'';}
function foTime(v){return String(v||'').match(/T(\d{2}:\d{2})/)?.[1]||'';}
function foScalar(v){return ['string','number'].includes(typeof v)?foClean(v):'';}
function foDeep(obj,patterns,depth=0){if(!obj||typeof obj!=='object'||depth>4)return '';for(const [k,v] of Object.entries(obj)){const nk=foNorm(k);if(patterns.some(p=>p.test(nk))){const s=foScalar(v);if(s)return s;}}for(const v of Object.values(obj)){const s=foDeep(v,patterns,depth+1);if(s)return s;}return '';}
function foRowNumber(r={}){return `${foClean(r.iataCompania)||foClean(r.compania)||foClean(r.oaciCompania)||''}${foClean(r.numVuelo)||foClean(r.numeroVuelo)||''}`.replace(/\s+/g,'');}
function foRowDate(r={}){return foClean(r.fecha)||foClean(r.fechaVuelo)||'';}
function foRowTime(r={}){return foClean(r.horaProgramada)||foClean(r.horaProg)||foClean(r.horaEstimada)||'';}
function foRowOther(r={}){return foUpper(r.iataOtro||r.aeropuertoIataOtro||r.iataDestino||r.iataOrigen||'');}
function foScore(r={},flight={},mode='departure'){
  const targetDigits=foDigits(flight.number),rowDigits=foDigits(foRowNumber(r));if(!targetDigits||targetDigits!==rowDigits)return -1;
  const expectedDate=foDateEs(String(flight.date||flight.departure||'').slice(0,10)),rowDate=foRowDate(r);if(!expectedDate||!rowDate||foNorm(expectedDate)!==foNorm(rowDate))return -1;
  let score=17;
  const other=foAirport(mode==='departure'?(flight.destination||flight.to):(flight.origin||flight.from)),rowOther=foRowOther(r);if(other&&rowOther===other)score+=5;
  const tm=foTime(mode==='departure'?flight.departure:flight.arrival),rt=foRowTime(r);if(tm&&rt&&rt.startsWith(tm))score+=3;
  return score;
}
function foRange(a,b){a=foClean(a);b=foClean(b);if(a&&b&&a!==b)return `${a}-${b}`;return a||b||'';}
function foParseRow(r={},flight={},mode='departure'){
  const firstCounter=foDeep(r,[/MOSTRADOR.*(?:PRIM|INI)/,/FACTUR.*(?:PRIM|INI)/,/CHECK.*(?:FIRST|START)/]);
  const lastCounter=foDeep(r,[/MOSTRADOR.*(?:ULT|FIN)/,/FACTUR.*(?:ULT|FIN)/,/CHECK.*(?:LAST|END)/]);
  const counters=foRange(firstCounter,lastCounter)||foDeep(r,[/MOSTRADOR/,/FACTURACION/,/CHECKINCOUNTER/,/CHECKIN/]);
  const boardingStart=foDeep(r,[/HORA.*EMBAR/,/EMBAR.*HORA/,/BOARDING.*(?:START|TIME)/]);
  const boardingClose=foDeep(r,[/CIERRE.*EMBAR/,/EMBAR.*CIERRE/,/BOARDING.*CLOSE/]);
  const timeOnly=v=>String(v||'').match(/\b([0-2]?\d:[0-5]\d)\b/)?.[1]||'';
  const status=LIVE_AENA_STATUS[foUpper(r.estado||r.estadoVuelo||'')]||foClean(r.estado||r.estadoVuelo||'');
  return {status,statusVerified:Boolean(status),terminal:foClean(r.terminal||r.terminalPrimera||''),gate:foClean(r.puertaPrimera||r.puerta||''),checkInCounters:foClean(counters),baggageBelt:foClean(r.cintaPrimera||r.cinta||''),boardingStart:timeOnly(boardingStart),boardingClose:timeOnly(boardingClose),scheduledDeparture:mode==='departure'?(foRowTime(r)||foTime(flight.departure)):foTime(flight.departure),scheduledArrival:mode==='arrival'?(foRowTime(r)||foTime(flight.arrival)):foTime(flight.arrival)};
}
async function foFetchRows(airport,direction){
  const flightType=direction==='arrival'?'L':'S';const url=`${LIVE_AENA_BASE}?pagename=AENA_ConsultarVuelos&airport=${encodeURIComponent(airport)}&flightType=${flightType}&dosDias=si`;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
  try{
    const response=await fetch(url,{headers:{Accept:'application/json,text/plain,*/*','Accept-Language':'es-ES,es;q=0.9',Referer:'https://www.aena.es/es/infovuelos.html','User-Agent':'Mozilla/5.0 (compatible; GC26/2.3.9)'},cache:'no-store',signal:controller.signal});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);const rows=await response.json();if(!Array.isArray(rows))throw new Error('Aena no devolvió una lista JSON.');return {ok:true,url,rows};
  }catch(error){return {ok:false,url,rows:[],error:error?.name==='AbortError'?'timeout 9 s':(error?.message||String(error))};}finally{clearTimeout(timer);}
}
async function foQueryFlight(flight={}){
  const origin=foAirport(flight.origin||flight.from),destination=foAirport(flight.destination||flight.to);const hints=flight.operationalHints||{};
  const [depRes,arrRes]=await Promise.all([origin?foFetchRows(origin,'departure'):Promise.resolve({ok:false,rows:[],error:'Origen no disponible'}),destination?foFetchRows(destination,'arrival'):Promise.resolve({ok:false,rows:[],error:'Destino no disponible'})]);
  const best=(res,mode)=>res.rows.map(r=>({r,score:foScore(r,flight,mode)})).filter(x=>x.score>=10).sort((a,b)=>b.score-a.score)[0]||null;
  const dep=best(depRes,'departure'),arr=best(arrRes,'arrival');const d=dep?foParseRow(dep.r,flight,'departure'):{},a=arr?foParseRow(arr.r,flight,'arrival'):{};
  const terminal=d.terminal||foClean(hints.terminal),gate=d.gate||foClean(hints.gate),checkInCounters=d.checkInCounters||foClean(hints.checkInCounters),baggageBelt=a.baggageBelt||foClean(hints.baggageBelt),boardingStart=d.boardingStart||foClean(hints.boardingStart),boardingClose=d.boardingClose||foClean(hints.boardingClose),status=d.status||a.status||'',statusVerified=Boolean(d.statusVerified||a.statusVerified),hinted=Boolean(foClean(hints.terminal)||foClean(hints.gate)||foClean(hints.checkInCounters)||foClean(hints.baggageBelt)||foClean(hints.boardingStart));
  const identityVerified=Boolean(dep||arr||hinted),sources=[];
  if(depRes.ok)sources.push({name:'Aena',mode:'salidas',found:Boolean(dep),identityVerified:Boolean(dep),statusVerified:Boolean(dep&&d.statusVerified),identityScore:dep?.score||0,url:depRes.url,error:''});else sources.push({name:'Aena',mode:'salidas',found:false,identityVerified:false,statusVerified:false,identityScore:0,url:depRes.url||'',error:depRes.error||''});
  if(arrRes.ok)sources.push({name:'Aena',mode:'llegadas',found:Boolean(arr),identityVerified:Boolean(arr),statusVerified:Boolean(arr&&a.statusVerified),identityScore:arr?.score||0,url:arrRes.url,error:''});else sources.push({name:'Aena',mode:'llegadas',found:false,identityVerified:false,statusVerified:false,identityScore:0,url:arrRes.url||'',error:arrRes.error||''});
  if(hinted)sources.push({name:hints.source||'Aena app · última info confirmada',mode:'snapshot',found:true,identityVerified:true,statusVerified:false,identityScore:100,url:'',error:''});
  return {id:String(flight.id||flight.number||''),number:String(flight.number||''),date:String(flight.date||flight.departure||'').slice(0,10),origin,destination,departure:flight.departure||'',arrival:flight.arrival||'',status,statusVerified,identityVerified,terminal,gate,checkInCounters,baggageBelt,boardingStart,boardingClose,scheduledDeparture:d.scheduledDeparture||foTime(flight.departure),scheduledArrival:a.scheduledArrival||foTime(flight.arrival),sources,sourceLabel:'Aena',hasOperationalData:Boolean(identityVerified&&(status||terminal||gate||checkInCounters||baggageBelt||boardingStart||boardingClose))};
}
async function liveFlightOpsResult(request,env,payload){
  await verifyFirebaseUser(request,env);const now=Date.now(),flights=(Array.isArray(payload?.config?.flights)?payload.config.flights:[]).filter(f=>{if(!f?.number||!f?.departure)return false;const dep=Date.parse(f.departure);return Number.isFinite(dep)&&dep-now<=14*86400000&&dep-now>=-3*86400000;});
  if(!flights.length)return json({ok:true,result:{ok:true,status:'ok',checkedAt:new Date().toISOString(),source:'Aena API pública · fuera de ventana operativa',flights:[]},message:'Aena se activará 14 días antes del primer vuelo.'});
  const results=[];for(const flight of flights)results.push(await foQueryFlight(flight));
  const result={ok:true,status:'ok',checkedAt:new Date().toISOString(),source:'Aena API pública · Cloudflare Worker',flights:results};
  const kv=requireTrackerKv(env);await kv.put('flightops:latest',JSON.stringify({...result,receivedAt:new Date().toISOString()}));await kv.delete('flightops:last-error');
  return json({ok:true,result,message:results.some(f=>f.hasOperationalData)?'Información operativa de Aena actualizada.':'Aena todavía no devuelve datos operativos para estos vuelos.'});
}

async function writeFlightOpsResult(request,env,payload){
  const expected=String(env?.MONITOR_SECRET||'');if(!expected)throw new ApiError(503,'El secreto MONITOR_SECRET no está configurado.');if(bearerToken(request)!==expected)throw new ApiError(401,'No autorizado.');
  const kv=requireTrackerKv(env),result={...(payload.result||{}),receivedAt:new Date().toISOString()};if(!result.checkedAt)result.checkedAt=result.receivedAt;const failed=result.status==='error'||result.ok===false;
  if(failed)await kv.put('flightops:last-error',JSON.stringify(result),{expirationTtl:60*60*24*14});else{result.ok=true;result.status='ok';await kv.put('flightops:latest',JSON.stringify(result));await kv.delete('flightops:last-error');}
  return json({ok:true,storedAt:result.receivedAt,failed});
}
async function readFlightOpsResult(env){
  const kv=requireTrackerKv(env),raw=await kv.get('flightops:latest'),errorRaw=await kv.get('flightops:last-error');let lastError=null;if(errorRaw){try{lastError=JSON.parse(errorRaw);}catch{}}
  if(!raw)return json({ok:true,result:null,lastError,message:lastError?'La última consulta operativa falló; todavía no hay un dato correcto guardado.':'Todavía no hay datos operativos de vuelos.'});
  let result=null;try{result=JSON.parse(raw);}catch{throw new ApiError(500,'El último estado de vuelos guardado no es válido.');}
  return json({ok:true,result,lastError,message:lastError?'Se conserva el último estado correcto; la consulta más reciente falló.':'Último estado operativo de vuelos.'});
}

function isAllowedShop(hostname) {
  const host = hostname.toLowerCase();
  return ALLOWED_SHOPS.some(domain => host === domain || host.endsWith(`.${domain}`));
}

function isMercadona(hostname) {
  const host = hostname.toLowerCase();
  return host === "mercadona.es" || host.endsWith(".mercadona.es");
}

function isHiperdino(hostname) {
  const host = hostname.toLowerCase();
  return host === "hiperdino.es" || host.endsWith(".hiperdino.es");
}

async function readProductFromUrl(productUrl, {hintName="",postalCode=""} = {}) {
  return isMercadona(productUrl.hostname)
    ? readMercadona(productUrl,{postalCode,hintName})
    : isHiperdino(productUrl.hostname)
      ? readHiperdino(productUrl,{hintName,postalCode})
      : readGenericProduct(productUrl);
}

const MERCADONA_DEFAULT_VERSION = "v9200";
const MERCADONA_DEFAULT_ALGOLIA = {appId:"7UZJKL1DJ0",apiKey:"9d8f2e39e90df472b4f2e559a116fe17",indexBase:"products_prod"};
// v2.1.67: UUID estable. No se genera en el ámbito global porque Cloudflare
// Workers bloquea la generación aleatoria durante la inicialización del módulo.
const MERCADONA_DEVICE_ID = "4a20b937-9884-43a7-af8e-3b89b4f9ef43";
const mercadonaWarehouseCache = new Map();
let mercadonaVersionCache = {value:MERCADONA_DEFAULT_VERSION,at:0};
let mercadonaAlgoliaCache = {...MERCADONA_DEFAULT_ALGOLIA,at:0};

function mercadonaRequestHeaders(productUrl,version=MERCADONA_DEFAULT_VERSION){
  return {
    "Accept":"application/json, text/plain, */*",
    "Accept-Language":"es-ES,es;q=0.9,en;q=0.8",
    "Referer":"https://tienda.mercadona.es/",
    "Origin":"https://tienda.mercadona.es",
    "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "x-version":version,
    "x-customer-device-id":MERCADONA_DEVICE_ID
  };
}

async function resolveMercadonaWarehouse(postalCode,version=MERCADONA_DEFAULT_VERSION){
  const pc=String(postalCode||"").trim();
  if(!/^\d{5}$/.test(pc))return "";
  const cached=mercadonaWarehouseCache.get(pc);
  if(cached&&Date.now()-cached.at<6*3600_000)return cached.value;
  // El endpoint observado por el frontend acepta PUT de forma verificada.
  // Conservamos POST como fallback por compatibilidad con despliegues anteriores.
  for(const method of ["PUT","POST"]){
    try{
      const response=await fetchWithTimeout("https://tienda.mercadona.es/api/postal-codes/actions/change-pc/",{
        method,redirect:"follow",
        headers:{...mercadonaRequestHeaders(null,version),"Content-Type":"application/json"},
        body:JSON.stringify({new_postal_code:pc})
      },3800);
      if(!response.ok)continue;
      const wh=String(response.headers.get("x-customer-wh")||"").trim();
      if(wh){mercadonaWarehouseCache.set(pc,{value:wh,at:Date.now()});return wh;}
    }catch{}
  }
  return "";
}

async function discoverMercadonaVersion(){
  if(Date.now()-mercadonaVersionCache.at<6*3600_000)return mercadonaVersionCache.value;
  try{
    const response=await fetchWithTimeout("https://tienda.mercadona.es/",{headers:{"User-Agent":mercadonaRequestHeaders()["User-Agent"]}},5000);
    const html=await response.text();
    const match=html.match(/\/v(\d+)\/(?:index-[A-Za-z0-9_-]+\.js|)/i)||html.match(/\/v(\d+)\//i);
    if(match){mercadonaVersionCache={value:`v${match[1]}`,at:Date.now()};return mercadonaVersionCache.value;}
  }catch{}
  mercadonaVersionCache.at=Date.now();
  return mercadonaVersionCache.value||MERCADONA_DEFAULT_VERSION;
}

async function discoverMercadonaAlgolia(force=false){
  if(!force && Date.now()-Number(mercadonaAlgoliaCache.at||0)<6*3600_000)return mercadonaAlgoliaCache;
  try{
    const shellResponse=await fetchWithTimeout("https://tienda.mercadona.es/",{headers:{"User-Agent":mercadonaRequestHeaders()["User-Agent"],"Accept":"text/html,*/*"}},5500);
    const shell=await shellResponse.text();
    const path=shell.match(/\/v\d+\/index-[A-Za-z0-9_-]+\.js/)?.[0];
    if(path){
      const jsResponse=await fetchWithTimeout(`https://tienda.mercadona.es${path}`,{headers:{"User-Agent":mercadonaRequestHeaders()["User-Agent"],"Accept":"*/*"}},6000);
      const js=await jsResponse.text();
      const pair=js.match(/"([A-Z0-9]{10})",[A-Za-z0-9_$]+="([0-9a-f]{32})"/);
      const base=js.match(/"(products_prod[a-z_]*)"/)?.[1]||"products_prod";
      if(pair)mercadonaAlgoliaCache={appId:pair[1],apiKey:pair[2],indexBase:base,at:Date.now()};
    }
  }catch{}
  if(!mercadonaAlgoliaCache.at)mercadonaAlgoliaCache.at=Date.now();
  return mercadonaAlgoliaCache;
}

function mercadonaNameMatchScore(candidate,target){
  const a=normalizeProductText(candidate),b=normalizeProductText(target);
  if(!a||!b)return 0;
  if(a===b)return 100;
  const words=b.split(" ").filter(w=>w.length>2);
  if(!words.length)return 0;
  const matched=words.filter(w=>a.includes(w)).length;
  return Math.round(matched/words.length*100);
}

async function readMercadonaAlgolia({id,hintName,warehouses}){
  const query=String(hintName||"").trim();
  if(!query)return null;
  const whs=[...new Set((warehouses||[]).filter(Boolean))].slice(0,12);
  if(!whs.length)return null;
  const run=async(creds)=>{
    const params=new URLSearchParams({query,hitsPerPage:"16"}).toString();
    const requests=whs.map(wh=>({indexName:`${creds.indexBase}_${wh}_es`,params}));
    const endpoint=`https://${String(creds.appId).toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`;
    const response=await fetchWithTimeout(endpoint,{
      method:"POST",
      headers:{"X-Algolia-API-Key":creds.apiKey,"X-Algolia-Application-Id":creds.appId,"Content-Type":"application/json","User-Agent":mercadonaRequestHeaders()["User-Agent"],"Referer":"https://tienda.mercadona.es/"},
      body:JSON.stringify({requests})
    },4300);
    if(!response.ok)return {result:null,status:response.status};
    const body=await response.json();
    const candidates=[];
    (body?.results||[]).forEach((result,index)=>{
      for(const hit of result?.hits||[]){
        const parsed=productFromMercadonaObject(hit);
        if(!(Number.isFinite(parsed.price)&&parsed.price>0))continue;
        const hitId=String(hit?.id??hit?.objectID??"").trim();
        const share=String(hit?.share_url||"");
        const exactId=hitId===String(id)||new RegExp(`/product/${String(id)}(?:/|$)`).test(share);
        const score=mercadonaNameMatchScore(parsed.name,query);
        if(exactId||score>=88)candidates.push({...parsed,diagnostic:{shop:"mercadona",source:"algolia",warehouse:whs[index],matchedId:hitId||null,matchScore:score,exactId}});
      }
    });
    const result=candidates.sort((a,b)=>Number(b.diagnostic?.exactId)-Number(a.diagnostic?.exactId)||(b.diagnostic?.matchScore||0)-(a.diagnostic?.matchScore||0))[0]||null;
    return {result,status:response.status};
  };
  try{
    // Primero las credenciales LKG: evita descargar el bundle en cada producto.
    let creds={...mercadonaAlgoliaCache};
    if(!creds.appId||!creds.apiKey)creds={...MERCADONA_DEFAULT_ALGOLIA,at:Date.now()};
    let attempt=await run(creds);
    if(attempt.result)return attempt.result;
    if([401,403,404].includes(attempt.status)){
      creds=await discoverMercadonaAlgolia(true);
      attempt=await run(creds);
      return attempt.result;
    }
  }catch{}
  return null;
}

async function readMercadona(productUrl,{postalCode="",hintName=""}={}) {
  // v2.1.67: estrategia rápida y sensible a almacén. El flujo anterior hacía
  // múltiples GET secuenciales y los productos regionales agotaban el timeout
  // de la PWA antes de llegar al almacén correcto.
  const id=productUrl.pathname.match(/\/product\/([^/?#]+)/i)?.[1];
  if(!id)return readGenericProduct(productUrl);
  const base="https://tienda.mercadona.es";
  const version=MERCADONA_DEFAULT_VERSION;
  const configuredPc=/^\d{5}$/.test(String(postalCode||"").trim())?String(postalCode).trim():"";
  // El viaje actual usa 35214 para Mercadona. Normalmente llega desde la
  // configuración del supermercado; este valor queda solo como respaldo técnico.
  const warehousePc=configuredPc||"35214";

  const parseResponse=async(response,source,warehouse="")=>{
    if(!response?.ok)return null;
    const ct=response.headers.get("content-type")||"";
    if(!ct.includes("json"))return null;
    try{
      const parsed=productFromMercadonaObject(await response.json());
      return (parsed.name||parsed.image||Number.isFinite(parsed.price))?{...parsed,diagnostic:{shop:"mercadona",source,warehouse:warehouse||null,productId:id}}:null;
    }catch{return null;}
  };
  const apiFetch=async(url,source,warehouse="")=>{
    try{return await parseResponse(await fetchWithTimeout(url,{redirect:"follow",headers:mercadonaRequestHeaders(productUrl,version)},3800),source,warehouse);}catch{return null;}
  };

  const commonWh=["mad1","mad3","vlc1","bcn1","svq1","alc1","3842"];
  const directPromise=Promise.all([
    apiFetch(`${base}/api/products/${encodeURIComponent(id)}/`,"api-no-wh"),
    apiFetch(`${base}/api/v1_1/products/${encodeURIComponent(id)}`,"v1_1-no-wh")
  ]);
  const warehousePromise=resolveMercadonaWarehouse(warehousePc,version);
  const algoliaPromise=readMercadonaAlgolia({id,hintName,warehouses:commonWh});
  const [directResults,resolvedWh,algoliaCommon]=await Promise.all([directPromise,warehousePromise,algoliaPromise]);
  const direct=directResults.find(x=>x&&Number.isFinite(x.price)&&x.price>0);
  if(direct)return direct;

  if(algoliaCommon&&Number.isFinite(algoliaCommon.price)&&algoliaCommon.price>0){
    return {...algoliaCommon,diagnostic:{...(algoliaCommon.diagnostic||{}),postalCode:configuredPc||null,resolvedWarehouse:resolvedWh||null}};
  }

  const whCandidates=[...new Set([resolvedWh,...commonWh].filter(Boolean))].slice(0,4);
  const whResults=(await Promise.all(whCandidates.flatMap(wh=>[
    apiFetch(`${base}/api/products/${encodeURIComponent(id)}/?lang=es&wh=${encodeURIComponent(wh)}`,"api",wh),
    apiFetch(`${base}/api/v1_1/products/${encodeURIComponent(id)}?lang=es&wh=${encodeURIComponent(wh)}`,"v1_1",wh)
  ]))).filter(Boolean);
  const priced=whResults.find(x=>Number.isFinite(x.price)&&x.price>0);
  if(priced)return priced;

  const algoliaExact=await readMercadonaAlgolia({id,hintName,warehouses:[...new Set([resolvedWh,...commonWh])].filter(Boolean)});
  if(algoliaExact&&Number.isFinite(algoliaExact.price)&&algoliaExact.price>0)return algoliaExact;

  return {
    name:String(hintName||"").trim(),image:"",price:null,currency:"EUR",
    message:`Mercadona no ha devuelto un precio válido para el producto ${id}. El enlace sigue siendo una ficha válida, pero no se ha localizado el artículo en el almacén de catálogo consultado. Revisa el código postal de Mercadona en Configuración → Contenido → Supermercados.`,
    diagnostic:{shop:"mercadona",productId:id,priceFound:false,postalCode:configuredPc,warehousePostalCode:warehousePc,resolvedWarehouse:resolvedWh||null,warehousesTried:[...new Set([resolvedWh,...commonWh])].filter(Boolean)}
  };
}

function mergeMercadonaProductParts(a,b){
  return {
    name:firstText(b?.name,a?.name),
    image:firstText(b?.image,a?.image),
    price:Number.isFinite(b?.price)&&b.price>0?b.price:(Number.isFinite(a?.price)&&a.price>0?a.price:null),
    currency:"EUR"
  };
}

function productFromMercadonaObject(data = {}) {
  const product = findProductObject(data) || data;
  const price = toNumber(
    product?.price_instructions?.unit_price ??
    product?.price_instructions?.bulk_price ??
    product?.price_instructions?.reference_price ??
    product?.unit_price ??
    product?.price
  );
  const photos = Array.isArray(product?.photos) ? product.photos : [];
  const firstPhoto = photos.find(Boolean) || {};
  const image = firstText(
    firstPhoto?.regular,
    firstPhoto?.zoom,
    firstPhoto?.thumbnail,
    product?.thumbnail,
    product?.image_url,
    Array.isArray(product?.image) ? product.image[0] : product?.image?.url || product?.image
  );
  const name = firstText(product?.display_name, product?.name, product?.details?.description, product?.title);
  return {name,image,price,currency:"EUR"};
}

async function readHiperdino(productUrl,{hintName="",postalCode=""}={}) {
  // HiperDino sirve catálogo HTML. Una URL guardada puede apuntar a una página
  // donde el producto ya haya cambiado de página/orden, así que consultamos en
  // paralelo: URL original + búsqueda Magento global + búsqueda bajo la vista
  // de tienda (c95xx...). Esto evita la cadena secuencial que podía superar el
  // timeout del móvil y hacía que todos los productos apareciesen como error.
  const urls=[productUrl.href];
  if(usefulHiperdinoHint(hintName)){
    const q=String(hintName).trim();
    const firstSegment=productUrl.pathname.split('/').filter(Boolean)[0]||'';
    const globalSearch=new URL('/catalogsearch/result/',productUrl.origin);globalSearch.searchParams.set('q',q);urls.push(globalSearch.href);
    if(/^c\d+/i.test(firstSegment)){
      const scoped=new URL(`/${firstSegment}/catalogsearch/result/`,productUrl.origin);scoped.searchParams.set('q',q);urls.push(scoped.href);
    }
  }
  const unique=[...new Set(urls)];
  const attempts=await Promise.all(unique.map(url=>fetchHiperdinoCandidate(url,productUrl,hintName)));
  const good=attempts.filter(Boolean);
  // Nunca aceptamos el primer precio de la página: una categoría contiene
  // decenas de productos. Solo devolvemos un precio cuyo nombre coincida de
  // forma suficiente con el artículo guardado. Esto evita, por ejemplo, usar
  // el precio de croquetas de bacalao al actualizar las de jamón.
  const ranked=good.map(item=>({...item,__score:scoreHiperdinoName(item?.name||"",hintName)}))
    .sort((a,b)=>b.__score-a.__score);
  const exact=ranked.find(x=>x.__score>=0.72&&Number.isFinite(x.price)&&x.price>0);
  const configuredPc=/^\d{5}$/.test(String(postalCode||"").trim())?String(postalCode).trim():"";
  if(exact){const {__score,...result}=exact;return {...result,message:"",diagnostic:{shop:"hiperdino",matchScore:__score,priceFound:true,postalCode:configuredPc||null}};}
  const partial=ranked.find(x=>x.__score>=0.72);
  if(partial){const {__score,...result}=partial;return {...result,price:null,currency:"EUR",message:`HiperDino ha encontrado el producto, pero no ha podido asociar un precio válido a esa ficha. Revisa el enlace guardado o abre el producto para comprobar si sigue disponible.`,diagnostic:{shop:"hiperdino",matchScore:__score,priceFound:false,postalCode:configuredPc||null}};}
  return {name:String(hintName||""),image:"",price:null,currency:"EUR",message:`HiperDino no ha encontrado una coincidencia suficiente para «${String(hintName||"Producto")}». Revisa o sustituye el enlace del producto.`,diagnostic:{shop:"hiperdino",matchScore:0,priceFound:false,postalCode:configuredPc||null}};
}

async function fetchHiperdinoCandidate(rawUrl,originalUrl,hintName){
  try{
    const response=await fetchWithTimeout(rawUrl,{redirect:"follow",headers:{
      "Accept":"text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language":"es-ES,es;q=0.9,en;q=0.7",
      "Cache-Control":"no-cache",
      "Referer":originalUrl.href,
      "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36"
    }},6500);
    if(!response.ok)return null;
    const contentType=response.headers.get("content-type")||"";
    if(contentType.includes("application/json"))return productFromJson(await response.json());
    const html=await response.text();
    const parsed=extractHiperdinoProductFromHtml(html,new URL(rawUrl),hintName);
    const textFallback=hiperdinoProductFromTextWindow(html,hintName||parsed?.name||"",new URL(rawUrl).origin);
    const candidates=[parsed,textFallback].filter(Boolean).map(item=>({item,score:scoreHiperdinoName(item?.name||"",hintName)}));
    candidates.sort((a,b)=>b.score-a.score || ((Number.isFinite(b.item?.price)&&b.item.price>0)?1:0)-((Number.isFinite(a.item?.price)&&a.item.price>0)?1:0));
    const priced=candidates.find(x=>x.score>=0.72&&Number.isFinite(x.item?.price)&&x.item.price>0);
    if(priced)return priced.item;
    const best=candidates.find(x=>x.score>=0.72);
    return best?.item||null;
  }catch{return null;}
}

function mergeHiperdinoProductParts(a,b){
  return {
    name:firstText(b?.name,a?.name),
    image:firstText(b?.image,a?.image),
    price:Number.isFinite(b?.price)&&b.price>0?b.price:(Number.isFinite(a?.price)&&a.price>0?a.price:null),
    currency:"EUR"
  };
}

export function extractHiperdinoProductFromHtml(html = "", rawUrl = "", hintName = "") {
  let productUrl;
  try { productUrl = rawUrl instanceof URL ? rawUrl : new URL(rawUrl); } catch { productUrl = new URL("https://www.hiperdino.es/"); }
  const targetSlug = decodeURIComponent(String(productUrl.hash || "").replace(/^#/, "")).trim();
  const slugName = targetSlug ? hiperdinoNameFromSlug(targetSlug) : "";
  const cleanedHint = usefulHiperdinoHint(hintName) ? String(hintName).trim() : "";
  const targetName = cleanedHint || slugName;
  if (!targetSlug && !targetName) return null;

  // Algunas páginas incluyen el catálogo completo en JSON. Buscamos el
  // objeto que coincida con el ancla/nombre elegido, no el primer producto.
  const scripts = String(html).match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const openTag = script.match(/^<script\b[^>]*>/i)?.[0] || "";
    const attrs = parseAttributes(openTag);
    const type = String(attrs.type || "").toLowerCase();
    if (type && !type.includes("json")) continue;
    const body = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    if (!body || (!body.startsWith("{") && !body.startsWith("["))) continue;
    try {
      const object = findMatchingHiperdinoObject(JSON.parse(body), targetSlug, targetName);
      if (object) {
        const parsed = productFromObject(object);
        if (parsed.name || Number.isFinite(parsed.price)) return parsed;
      }
    } catch {
      // Seguimos con el HTML de la tarjeta.
    }
  }

  // Camino clásico: algunas URLs de HiperDino incluyen un ancla que también
  // aparece como id/slug dentro de la tarjeta del producto.
  if (targetSlug) {
    const lower = String(html).toLowerCase();
    const needle = targetSlug.toLowerCase();
    const indexes = [];
    let cursor = 0;
    while ((cursor = lower.indexOf(needle, cursor)) >= 0) { indexes.push(cursor); cursor += needle.length; if (indexes.length >= 12) break; }
    for (const index of indexes) {
      const segment = hiperdinoProductSegment(String(html), index, needle);
      const parsed = hiperdinoProductFromSegment(segment, productUrl.origin, targetName);
      if (parsed && (parsed.name || Number.isFinite(parsed.price))) return parsed;
    }
  }

  // HiperDino ya no garantiza que el ancla de la URL se copie como id HTML.
  // En ese caso elegimos la tarjeta por el nombre visible (tolerando acentos,
  // marca, plural/singular y pequeños cambios de formato) y extraemos SU precio.
  const byName = findHiperdinoProductCardByName(String(html), targetName || slugName, productUrl.origin);
  if (byName) return byName;

  // Incluso si HiperDino cambia el marcado, el enlace/nombre sigue siendo útil.
  // No inventamos un precio: conservamos el anterior hasta una lectura válida.
  return { name:targetName || slugName, image:"", price:null, currency:"EUR" };
}

function usefulHiperdinoHint(value="") {
  const text=String(value||"").trim();
  return Boolean(text) && !/(producto\s+hiperdino|producto\s+pendiente|resultados?\s+de\s+b[uú]squeda)/i.test(text);
}

function hiperdinoProductFromSegment(segment, origin, fallbackName="") {
  const name = firstText(
    getAttributeValue(segment, "data-product-name"),
    extractClassText(segment, "product-item-link"),
    extractClassText(segment, "product-item-name"),
    extractClassText(segment, "product-name"),
    getImageAlt(segment),
    fallbackName
  );
  const price = extractHiperdinoPrice(segment);
  const image = extractHiperdinoImage(segment, origin);
  return { name, image, price, currency:"EUR" };
}

function hiperdinoComparableTokens(value="") {
  const stop=new Set(["hiperdino","superdino","de","del","la","el","los","las","con","sin","y","o","para","g","gr","kg","ml","l","ud","uds"]);
  return normalizeProductText(value).split(" ").filter(token=>token && !stop.has(token));
}

function findHiperdinoProductCardByName(html, targetName, origin) {
  const targetTokens=hiperdinoComparableTokens(targetName);
  if(!targetTokens.length)return null;
  const candidates=[];
  const patterns=[
    /<li\b[^>]*class=["'][^"']*(?:product|item)[^"']*["'][^>]*>[\s\S]{0,35000}?<\/li>/gi,
    /<article\b[^>]*class=["'][^"']*(?:product|item)[^"']*["'][^>]*>[\s\S]{0,35000}?<\/article>/gi,
    /<div\b[^>]*class=["'][^"']*product-item-info[^"']*["'][^>]*>[\s\S]{0,30000}?<\/div>/gi
  ];
  for(const pattern of patterns){
    for(const match of String(html).matchAll(pattern)){
      const segment=match[0];
      const visible=normalizeProductText(decodeHtml(segment.replace(/<[^>]+>/g," ")));
      const matched=targetTokens.filter(token=>visible.includes(token)).length;
      if(!matched)continue;
      const score=matched/targetTokens.length;
      const numericTokens=targetTokens.filter(token=>/^\d+$/.test(token));
      const numericOk=!numericTokens.length||numericTokens.every(token=>new RegExp(`\\b${token}\\b`).test(visible));
      if(score>=0.72&&numericOk)candidates.push({segment,score,matched});
    }
  }
  candidates.sort((a,b)=>b.score-a.score||b.matched-a.matched||a.segment.length-b.segment.length);
  if(!candidates.length)return null;
  const parsed=hiperdinoProductFromSegment(candidates[0].segment,origin,targetName);
  return (parsed.name||Number.isFinite(parsed.price))?parsed:null;
}

function hiperdinoVisibleText(html="") {
  return decodeHtml(String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ")
    .trim());
}

function scoreHiperdinoName(candidate="",target=""){
  const targetTokens=hiperdinoComparableTokens(target);
  if(!targetTokens.length)return 0;
  const hay=normalizeProductText(candidate);
  const matched=targetTokens.filter(token=>new RegExp(`(?:^| )${token}(?: |$)`).test(hay)).length;
  const numeric=targetTokens.filter(token=>/^\d+$/.test(token));
  if(numeric.length&&!numeric.every(token=>new RegExp(`(?:^| )${token}(?: |$)`).test(hay)))return 0;
  return matched/targetTokens.length;
}

function findHiperdinoImageByAlt(html,targetName,origin){
  let best="",bestScore=0;
  for(const tag of String(html).match(/<img\b[^>]*>/gi)||[]){
    const attrs=parseAttributes(tag);const alt=decodeHtml(attrs.alt||attrs.title||"");
    const score=scoreHiperdinoName(alt,targetName);if(score<0.70||score<bestScore)continue;
    const candidates=[attrs["data-src"],attrs["data-original"],attrs["data-lazy-src"],firstSrcsetUrl(attrs["data-srcset"]),firstSrcsetUrl(attrs.srcset),attrs.src];
    for(const candidate of candidates){const raw=decodeHtml(candidate||"").trim();if(!usefulRemoteImageCandidate(raw))continue;try{best=new URL(raw,origin).href;}catch{best=raw;}bestScore=score;break;}
  }
  return best;
}

function hiperdinoProductFromTextWindow(html,targetName,origin){
  const target=String(targetName||"").trim();if(!usefulHiperdinoHint(target))return null;
  const text=hiperdinoVisibleText(html);if(!text)return null;
  const targetTokens=hiperdinoComparableTokens(target);if(!targetTokens.length)return null;
  const lower=text.toLocaleLowerCase("es");
  const anchor=targetTokens.find(token=>token.length>=4&&!/^\d+$/.test(token))||targetTokens[0];
  let cursor=0,best=null,bestScore=0;
  while((cursor=lower.indexOf(anchor,cursor))>=0){
    // El precio válido debe aparecer DESPUÉS del nombre del producto. Mirar
    // hacia atrás podía capturar el precio de la tarjeta anterior.
    const start=cursor,end=Math.min(text.length,cursor+720),window=text.slice(start,end);
    const score=scoreHiperdinoName(window,target);
    if(score>=0.72&&score>=bestScore){
      const money=[...window.matchAll(/(\d{1,4}(?:[. ]\d{3})*[,.]\d{1,2})\s*€(?:\s*\/\s*(?:kg|l|ud\.?))?/gi)]
        .map(m=>({index:m.index??0,value:toNumber(m[1])})).filter(x=>Number.isFinite(x.value)&&x.value>0&&x.value<10000);
      if(money.length){best={name:target,image:findHiperdinoImageByAlt(html,target,origin),price:money[0].value,currency:"EUR"};bestScore=score;}
    }
    cursor+=anchor.length;
    if(cursor>text.length||cursor>200000)break;
  }
  return best;
}

function hiperdinoNameFromSlug(slug = "") {
  const words = String(slug).replace(/^hiperdino-/i, "HiperDino-").split("-").filter(Boolean);
  if (!words.length) return "";
  const text = words.join(" ").replace(/\bgr\b/gi, "g").replace(/\bud\b/gi, "ud");
  return text.replace(/^hiperdino\b/i, "HiperDino");
}

function normalizeProductText(value = "") {
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findMatchingHiperdinoObject(value, targetSlug, targetName) {
  let best = null;
  let bestScore = 0;
  const target = normalizeProductText(targetName || targetSlug);
  const walk = node => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { for (const item of node) walk(item); return; }
    const name = firstText(node.name, node.display_name, node.title, node.product_name, node.label);
    const locator = firstText(node.url_key, node.url, node.link, node.id, node.sku, node.slug);
    const normalizedName = normalizeProductText(name);
    const normalizedLocator = normalizeProductText(locator);
    let score = 0;
    if (targetSlug && String(locator).toLowerCase().includes(String(targetSlug).toLowerCase())) score += 12;
    if (normalizedName && normalizedName === target) score += 10;
    if (normalizedName && target && (normalizedName.includes(target) || target.includes(normalizedName))) score += 7;
    if (normalizedLocator && target && normalizedLocator.includes(target)) score += 6;
    const parsed = productFromObject(node);
    if (score > bestScore && (parsed.name || Number.isFinite(parsed.price))) { best = node; bestScore = score; }
    for (const child of Object.values(node)) if (child && typeof child === "object") walk(child);
  };
  walk(value);
  return bestScore >= 6 ? best : null;
}

function productFromObject(product = {}) {
  const offers = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const priceInfo = product?.price_info || product?.priceInfo || product?.price_instructions || {};
  const price = toNumber(firstText(
    priceInfo?.final_price, priceInfo?.finalPrice, priceInfo?.unit_price,
    offers?.price, offers?.lowPrice, offers?.priceSpecification?.price,
    product?.final_price, product?.finalPrice, product?.special_price, product?.price
  ));
  const imageValue = product?.image;
  return {
    name:firstText(product?.display_name, product?.name, product?.product_name, product?.title),
    image:firstText(product?.small_image?.url, product?.thumbnail?.url, product?.image_url, Array.isArray(imageValue)?imageValue[0]:imageValue?.url||imageValue),
    price,
    currency:firstText(offers?.priceCurrency, product?.currency, "EUR")
  };
}

function hiperdinoProductSegment(html, index, needle) {
  const lower = html.toLowerCase();
  const liStart = lower.lastIndexOf("<li", index);
  const articleStart = lower.lastIndexOf("<article", index);
  const divStart = lower.lastIndexOf("<div", index);
  let start = liStart >= 0 && index - liStart < 20000 ? liStart
    : articleStart >= 0 && index - articleStart < 20000 ? articleStart
    : divStart >= 0 && index - divStart < 12000 ? divStart
    : Math.max(0, index - 1500);
  const closingTag = start === liStart ? "</li>" : start === articleStart ? "</article>" : "</div>";
  const close = lower.indexOf(closingTag, index);
  const nextTarget = Math.min(...[lower.indexOf(`id=\"${needle}`, index + needle.length), lower.indexOf(`id='${needle}`, index + needle.length)].filter(x => x > index));
  let end = close > index && close - index < 30000 ? close + closingTag.length : Math.min(html.length, index + 12000);
  if (Number.isFinite(nextTarget) && nextTarget > index && nextTarget < end) end = nextTarget;
  return html.slice(start, end);
}

function getAttributeValue(html, attribute) {
  const match = String(html).match(new RegExp(`${attribute}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')`, "i"));
  return decodeHtml(match?.[1] ?? match?.[2] ?? "");
}

function extractClassText(html, className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(html).match(new RegExp(`<[^>]+class=[\"'][^\"']*${escaped}[^\"']*[\"'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
  return match ? decodeHtml(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()) : "";
}

function getImageAlt(html) {
  const match = String(html).match(/<img\b[^>]*\balt\s*=\s*(?:"([^"]+)"|'([^']+)')[^>]*>/i);
  return decodeHtml(match?.[1] ?? match?.[2] ?? "");
}

function extractHiperdinoPrice(segment) {
  const special = extractClassText(segment, "special-price");
  const specialMoney = special.match(/\d{1,5}(?:[. ]\d{3})*[,.]\d{1,2}/)?.[0];
  const specialValue = toNumber(specialMoney);
  if (Number.isFinite(specialValue) && specialValue > 0) return specialValue;
  const preferred = [
    /data-price-amount\s*=\s*(?:"([^"]+)"|'([^']+)')/i,
    /data-price\s*=\s*(?:"([^"]+)"|'([^']+)')/i,
    /"finalPrice"\s*:\s*(?:\{[^{}]*"amount"\s*:\s*)?"?(\d+(?:[.,]\d+)?)"?/i,
    /"final_price"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/i,
    /"special_price"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/i
  ];
  for (const regex of preferred) {
    const match = String(segment).match(regex);
    const value = toNumber(match?.[1] ?? match?.[2]);
    if (Number.isFinite(value) && value > 0 && value < 10000) return value;
  }
  const priceText = extractClassText(segment, "price");
  const priceMoney = priceText.match(/\d{1,5}(?:[. ]\d{3})*[,.]\d{1,2}/)?.[0];
  const priceValue = toNumber(priceMoney);
  if (Number.isFinite(priceValue) && priceValue > 0) return priceValue;
  const values = [...String(segment).matchAll(/(\d{1,5}(?:[. ]\d{3})*[,.]\d{1,2})\s*(?:€|EUR|€\s*\/\s*kg)/gi)]
    .map(match => toNumber(match[1])).filter(value => Number.isFinite(value) && value > 0 && value < 10000);
  return values[0] ?? null;
}

function extractHiperdinoImage(segment, origin) {
  const tags = String(segment).match(/<(?:img|source)\b[^>]*>/gi) || [];
  const candidates = [];
  for (const tag of tags) {
    const attrs = parseAttributes(tag);
    const values = [
      attrs["data-src"], attrs["data-original"], attrs["data-lazy-src"],
      firstSrcsetUrl(attrs["data-srcset"]), firstSrcsetUrl(attrs.srcset), attrs.src
    ];
    for (const value of values) {
      const raw = decodeHtml(value || "").trim();
      if (!usefulRemoteImageCandidate(raw)) continue;
      try { candidates.push(new URL(raw, origin).href); } catch { candidates.push(raw); }
    }
  }
  return candidates[0] || "";
}

function firstSrcsetUrl(value = "") {
  return String(value).split(",").map(part => part.trim().split(/\s+/)[0]).find(Boolean) || "";
}

function usefulRemoteImageCandidate(value = "") {
  const raw = String(value).trim();
  if (!raw || /^(?:data:|blob:|javascript:)/i.test(raw)) return false;
  if (/(?:placeholder|spacer|transparent|loader|loading|lazy-placeholder|blank\.(?:gif|png)|pixel\.(?:gif|png))/i.test(raw)) return false;
  return /(?:\.(?:avif|webp|png|jpe?g|gif|svg)(?:[?#]|$)|\/media\/|\/catalog\/product\/|image)/i.test(raw);
}

function productFromHtml(html) {
  const structured = findStructuredProduct(html);
  const offers = Array.isArray(structured?.offers) ? structured.offers[0] : structured?.offers;
  const name = firstText(structured?.name, getMeta(html, "og:title"), getMeta(html, "twitter:title"), extractTagText(html, "h1"), extractTagText(html, "title"));
  const imageValue = structured?.image;
  const image = firstText(Array.isArray(imageValue) ? imageValue[0] : imageValue?.url || imageValue, getMeta(html, "og:image"), getMeta(html, "twitter:image"));
  const price = toNumber(firstText(offers?.price, offers?.lowPrice, offers?.highPrice, offers?.priceSpecification?.price, getMeta(html, "product:price:amount"), getMeta(html, "price"), getItemPropContent(html, "price")));
  const currency = firstText(offers?.priceCurrency, getMeta(html, "product:price:currency"), "EUR");
  if (!name && !Number.isFinite(price)) throw new ApiError(404, "La página no publica el nombre o el precio de forma legible. Este producto tendrá que mantenerse manualmente.");
  return { name, image, price, currency };
}

async function readGenericProduct(productUrl) {
  const response = await fetchWithTimeout(productUrl, {
    redirect: "follow",
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.7",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new ApiError(502, `La tienda respondió con HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return productFromJson(await response.json());
  }

  const html = await response.text();
  return productFromHtml(html);
}

function productFromJson(data) {
  const product = findProductObject(data) || data;
  const offers = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  return {
    name: firstText(product?.display_name, product?.name, product?.title),
    image: firstText(
      product?.photos?.[0]?.regular,
      product?.photos?.[0]?.zoom,
      Array.isArray(product?.image) ? product.image[0] : product?.image?.url || product?.image
    ),
    price: toNumber(
      product?.price_instructions?.unit_price ??
      offers?.price ??
      offers?.lowPrice ??
      product?.price
    ),
    currency: firstText(offers?.priceCurrency, product?.currency, "EUR")
  };
}

function findStructuredProduct(html) {
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const openTag = script.match(/^<script\b[^>]*>/i)?.[0] || "";
    const attrs = parseAttributes(openTag);
    if ((attrs.type || "").toLowerCase() !== "application/ld+json") continue;

    const body = script
      .replace(/^<script\b[^>]*>/i, "")
      .replace(/<\/script>$/i, "")
      .trim();

    try {
      const found = findProductObject(JSON.parse(body));
      if (found) return found;
    } catch {
      // Algunas tiendas publican JSON-LD inválido; seguimos con metadatos.
    }
  }
  return null;
}

function findProductObject(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findProductObject(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const type = value["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) {
    return value;
  }

  for (const child of Object.values(value)) {
    const found = findProductObject(child);
    if (found) return found;
  }
  return null;
}

function getMeta(html, key) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  const wanted = key.toLowerCase();

  for (const tag of tags) {
    const attrs = parseAttributes(tag);
    const identifier = String(attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    if (identifier === wanted && attrs.content) return decodeHtml(attrs.content);
  }
  return "";
}

function getItemPropContent(html, key) {
  const tags = html.match(/<[^>]+itemprop\s*=\s*["'][^"']+["'][^>]*>/gi) || [];
  const wanted = key.toLowerCase();

  for (const tag of tags) {
    const attrs = parseAttributes(tag);
    if (String(attrs.itemprop || "").toLowerCase() === wanted) {
      return decodeHtml(attrs.content || attrs.value || "");
    }
  }
  return "";
}

function parseAttributes(tag) {
  const attrs = {};
  const regex = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match;
  while ((match = regex.exec(tag))) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function extractTagText(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  if (!match) return "";
  return decodeHtml(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError(504, "La tienda tardó demasiado en responder.");
    }
    throw new ApiError(502, `No se pudo abrir la página: ${error?.message || error}`);
  } finally {
    clearTimeout(timer);
  }
}

function firstText(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === undefined || value === null || value === "") return null;

  let clean = String(value).trim().replace(/[^0-9,.-]/g, "");
  if (clean.includes(",") && clean.includes(".")) {
    clean = clean.lastIndexOf(",") > clean.lastIndexOf(".")
      ? clean.replace(/\./g, "").replace(",", ".")
      : clean.replace(/,/g, "");
  } else {
    clean = clean.replace(",", ".");
  }

  const number = Number.parseFloat(clean);
  return Number.isFinite(number) ? number : null;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}


async function proxyProductImage(rawProductUrl, hintName="") {
  if (!rawProductUrl) throw new ApiError(400, "Falta la URL del producto.");
  let productUrl;
  try { productUrl = new URL(rawProductUrl); } catch { throw new ApiError(400, "URL de producto no válida."); }
  if (!['http:', 'https:'].includes(productUrl.protocol) || !isAllowedShop(productUrl.hostname)) {
    throw new ApiError(403, "La URL del producto no pertenece a una tienda autorizada.");
  }
  const product = await readProductFromUrl(productUrl,{hintName});
  if (!product?.image) throw new ApiError(404, "La tienda no ha publicado una imagen utilizable para este producto.");
  return streamRemoteImage(product.image, productUrl, {cacheSeconds:21600});
}

async function proxyImage(rawUrl){
  if(!rawUrl)throw new ApiError(400,"Falta la URL de la imagen.");
  let url;try{url=new URL(rawUrl);}catch{throw new ApiError(400,"URL de imagen no válida.");}
  const host=url.hostname.toLowerCase();
  const allowed=["mercadona.es","imgix.net","hiperdino.es","carrefour.es","dia.es","eroski.es","alcampo.es","elcorteingles.es","lidl.es","aldi.es","spargrancanaria.es"].some(d=>host===d||host.endsWith(`.${d}`));
  if(!allowed)throw new ApiError(403,"Dominio de imagen no autorizado.");
  return streamRemoteImage(url.href, url, {cacheSeconds:21600});
}

async function streamRemoteImage(rawImageUrl, sourceUrl, {cacheSeconds=21600}={}) {
  let imageUrl;
  try { imageUrl = new URL(rawImageUrl, sourceUrl?.origin || undefined); } catch { throw new ApiError(400, "La tienda ha devuelto una URL de imagen no válida."); }
  if (!safePublicHttpUrl(imageUrl)) throw new ApiError(403, "La URL de imagen no es segura.");
  const isMercadonaAsset=isMercadona(sourceUrl.hostname)||isMercadona(imageUrl.hostname)||/imgix\.net$/i.test(imageUrl.hostname);
  const isHiperdinoAsset=isHiperdino(sourceUrl.hostname)||isHiperdino(imageUrl.hostname);
  const referer = isMercadonaAsset
    ? "https://tienda.mercadona.es/"
    : isHiperdinoAsset
      ? "https://www.hiperdino.es/"
      : `${sourceUrl.origin}/`;
  const requestOrigin = isMercadonaAsset
    ? "https://tienda.mercadona.es"
    : isHiperdinoAsset
      ? "https://www.hiperdino.es"
      : sourceUrl.origin;
  const response=await fetchWithTimeout(imageUrl,{redirect:"follow",headers:{
    Accept:"image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language":"es-ES,es;q=0.9,en;q=0.7",
    Referer:referer,
    Origin:requestOrigin,
    "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36 MFEViajes/2.1.21"
  }});
  if(!response.ok)throw new ApiError(502,`La imagen respondió con HTTP ${response.status}.`);
  const contentType=response.headers.get("content-type")||"";
  if(!contentType.toLowerCase().startsWith("image/"))throw new ApiError(415,"El enlace no devuelve una imagen.");
  const headers=new Headers(CORS_HEADERS);
  headers.set("Content-Type",contentType);
  headers.set("Cache-Control",`public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`);
  const length=response.headers.get("content-length");if(length)headers.set("Content-Length",length);
  return new Response(response.body,{status:200,headers});
}

function safePublicHttpUrl(url) {
  if (!url || !['http:', 'https:'].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local')) return false;
  if (/^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) return false;
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return false;
  return true;
}

async function fuelResponse(){
  const url="https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/";
  const response=await fetchWithTimeout(url,{headers:{Accept:"application/json","User-Agent":"MFEViajes/2.1.21"}});if(!response.ok)throw new ApiError(502,`Fuente oficial respondió ${response.status}.`);const data=await response.json();const rows=data.ListaEESSPrecio||data.listaEESSPrecio||[];const stations=rows.map(r=>{const island=String(r["Isla"]||r.isla||"").toUpperCase();const province=String(r["Provincia"]||r.provincia||"").toUpperCase();const latitude=toNumber(String(r["Latitud"]||r.latitud||"").replace(',','.'));const longitude=toNumber(String(r["Longitud (WGS84)"]||r.longitud||"").replace(',','.'));if(island&&!island.includes("GRAN CANARIA"))return null;if(!island){if(!province.includes("PALMAS"))return null;const insideGranCanaria=Number.isFinite(latitude)&&Number.isFinite(longitude)&&latitude>=27.70&&latitude<=28.25&&longitude>=-15.90&&longitude<=-15.25;if(!insideGranCanaria)return null;}const price=toNumber(r["Precio Gasolina 95 E5"]||r["Precio Gasolina 95 E10"]||r.precioGasolina95E5);if(!Number.isFinite(price)||price<=0)return null;return{name:firstText(r["Rótulo"],r.rotulo,"Gasolinera"),municipality:firstText(r["Municipio"],r.municipio),address:firstText(r["Dirección"],r.direccion),hours:firstText(r["Horario"],r.horario),price,latitude,longitude};}).filter(Boolean).sort((a,b)=>a.price-b.price);return json({ok:true,stations,updatedAt:data.Fecha||new Date().toISOString()});
}
