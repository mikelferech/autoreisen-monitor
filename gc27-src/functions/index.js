const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const vision = require("@google-cloud/vision");
const cheerio = require("cheerio");

initializeApp();
const db = getFirestore();
const REGION = "europe-west1";

async function requireTravelUser(request, edit = false) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  const snap = await db.doc(`mfeUsers/${request.auth.uid}`).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "No existe el perfil de acceso.");
  const profile = snap.data();
  const hasAccess = profile.role === "admin" || profile.apps?.travel === true;
  if (!hasAccess) throw new HttpsError("permission-denied", "No tienes acceso a MFE Viajes.");
  if (edit && !["admin", "editor"].includes(profile.role)) throw new HttpsError("permission-denied", "No tienes permiso de edición.");
  return profile;
}

function findProductJson(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findProductJson(item); if (found) return found; }
    return null;
  }
  if (typeof value !== "object") return null;
  const type = value["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return value;
  if (value["@graph"]) return findProductJson(value["@graph"]);
  for (const child of Object.values(value)) { const found = findProductJson(child); if (found) return found; }
  return null;
}

exports.importProductFromUrl = onCall({ region: REGION, timeoutSeconds: 30, memory: "512MiB" }, async (request) => {
  await requireTravelUser(request, true);
  const rawUrl = String(request.data?.url || "").trim();
  let url;
  try { url = new URL(rawUrl); } catch { throw new HttpsError("invalid-argument", "La URL no es válida."); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new HttpsError("invalid-argument", "Solo se admiten URLs web.");

  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 16000);
  let response;
  try {
    response = await fetch(url, { signal: controller.signal, redirect: "follow", headers: {
      "User-Agent": "Mozilla/5.0 (compatible; MFEViajes/1.0; +private-travel-planner)",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.6"
    }});
  } catch (error) { throw new HttpsError("unavailable", `No se pudo abrir la página: ${error.message}`); }
  finally { clearTimeout(timer); }
  if (!response.ok) throw new HttpsError("unavailable", `La tienda respondió ${response.status}.`);
  const html = await response.text(); const $ = cheerio.load(html);

  let product = null;
  $('script[type="application/ld+json"]').each((_, node) => {
    if (product) return;
    try { product = findProductJson(JSON.parse($(node).text())); } catch { /* JSON-LD inválido */ }
  });
  const offers = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const name = product?.name || $('meta[property="og:title"]').attr("content") || $("h1").first().text().trim();
  const imageValue = product?.image || $('meta[property="og:image"]').attr("content") || "";
  const image = Array.isArray(imageValue) ? imageValue[0] : (typeof imageValue === "object" ? imageValue.url : imageValue);
  const priceRaw = offers?.price || offers?.lowPrice || $('meta[property="product:price:amount"]').attr("content") || $('[itemprop="price"]').attr("content") || "";
  const price = Number.parseFloat(String(priceRaw).replace(/[^0-9,.-]/g, "").replace(",", "."));

  if (!name && !Number.isFinite(price)) throw new HttpsError("not-found", "La página no expone datos estructurados del producto. Introduce el precio manualmente.");
  return { name: name || "", image: image || "", price: Number.isFinite(price) ? price : null, currency: offers?.priceCurrency || "EUR" };
});

function parseEuropeanNumber(value) {
  const clean = String(value).replace(/\s/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  const number = Number.parseFloat(clean); return Number.isFinite(number) ? number : null;
}
function parseReceipt(text) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const store = lines.find(line => /[A-ZÁÉÍÓÚÑ]{3,}/.test(line)) || lines[0] || "";
  const dateMatch = text.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  let date = "";
  if (dateMatch) { let year = dateMatch[3]; if (year.length === 2) year = `20${year}`; date = `${year}-${dateMatch[2].padStart(2,"0")}-${dateMatch[1].padStart(2,"0")}`; }
  let total = null;
  for (const line of [...lines].reverse()) {
    const match = line.match(/(?:TOTAL|IMPORTE|A PAGAR|TOTAL EUR)[^0-9]*(\d+[.,]\d{2})/i);
    if (match) { total = parseEuropeanNumber(match[1]); break; }
  }
  const items = [];
  for (const line of lines) {
    if (/TOTAL|SUBTOTAL|IVA|TARJETA|EFECTIVO|CAMBIO|IMPORTE|NIF|CIF|TEL|GRACIAS/i.test(line)) continue;
    const match = line.match(/^(.{3,}?)\s+(\d+[.,]\d{2})\s*(?:€|EUR)?$/i);
    if (match) { const price = parseEuropeanNumber(match[2]); if (price !== null) items.push({ name:match[1].replace(/\s{2,}/g," ").trim(), price }); }
  }
  return { store:store.slice(0,80), date, total, items:items.slice(0,150), rawText:text };
}

function driveDownloadUrl(rawUrl) {
  try { const url=new URL(rawUrl); if(url.hostname.includes("drive.google.com")){const id=url.pathname.match(/\/file\/d\/([^/]+)/)?.[1]||url.searchParams.get("id");if(id)return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;}return rawUrl; } catch { return rawUrl; }
}
async function readTicketSource(storagePath, rawUrl) {
  if(storagePath){if(!storagePath.startsWith("travelApps/"))throw new HttpsError("invalid-argument","Ruta de ticket no válida.");const file=getStorage().bucket().file(storagePath);const[metadata]=await file.getMetadata();const[buffer]=await file.download();return{buffer,contentType:metadata.contentType||"",storagePath};}
  if(!rawUrl)throw new HttpsError("invalid-argument","Falta el archivo o enlace del ticket.");const response=await fetch(driveDownloadUrl(rawUrl),{redirect:"follow",headers:{"User-Agent":"Mozilla/5.0 MFEViajes OCR"}});if(!response.ok)throw new HttpsError("unavailable",`No se pudo descargar el ticket: HTTP ${response.status}. Revisa los permisos de Drive.`);return{buffer:Buffer.from(await response.arrayBuffer()),contentType:response.headers.get("content-type")||"",storagePath:""};
}
async function visionTextFromPdf(buffer) {
  const bucket=getStorage().bucket();const token=`ocr-temp/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;const input=bucket.file(token);await input.save(buffer,{contentType:"application/pdf"});const outputPrefix=`ocr-output/${Date.now()}-${Math.random().toString(36).slice(2)}/`;const client=new vision.ImageAnnotatorClient();try{const[operation]=await client.asyncBatchAnnotateFiles({requests:[{inputConfig:{gcsSource:{uri:`gs://${bucket.name}/${token}`},mimeType:"application/pdf"},features:[{type:"DOCUMENT_TEXT_DETECTION"}],outputConfig:{gcsDestination:{uri:`gs://${bucket.name}/${outputPrefix}`},batchSize:5}}]});await operation.promise();const[files]=await bucket.getFiles({prefix:outputPrefix});let text="";for(const file of files){if(!file.name.endsWith('.json'))continue;const[jsonBuffer]=await file.download();const data=JSON.parse(jsonBuffer.toString('utf8'));for(const response of data.responses||[])text+=`${response.fullTextAnnotation?.text||response.textAnnotations?.[0]?.description||""}\n`;}return text;}finally{await input.delete({ignoreNotFound:true});const[outs]=await bucket.getFiles({prefix:outputPrefix});await Promise.all(outs.map(f=>f.delete({ignoreNotFound:true})));}}
exports.ocrTicket = onCall({ region: REGION, timeoutSeconds: 300, memory: "1GiB" }, async (request) => {
  await requireTravelUser(request, true);const source=await readTicketSource(String(request.data?.storagePath||"").trim(),String(request.data?.url||"").trim());let text="";const isPdf=/pdf/i.test(source.contentType)||String(request.data?.url||"").toLowerCase().includes('.pdf');if(isPdf)text=await visionTextFromPdf(source.buffer);else{const client=new vision.ImageAnnotatorClient();const[result]=await client.documentTextDetection({image:{content:source.buffer}});text=result.fullTextAnnotation?.text||result.textAnnotations?.[0]?.description||"";}if(!text)throw new HttpsError("not-found","No se ha detectado texto en el ticket.");return parseReceipt(text);
});

// Recordatorios push de tareas y vuelos. Requiere desplegar Functions y disponer de tokens FCM activos.
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getMessaging } = require("firebase-admin/messaging");

function dueReminder(item, field, sentField, now, windowMs = 20 * 60 * 1000) {
  const timestamp = Number(item?.[field] || 0);
  return Boolean(timestamp && !item?.[sentField] && timestamp <= now + 2 * 60 * 1000 && timestamp >= now - windowMs);
}

exports.sendTravelReminders = onSchedule({
  region: REGION,
  schedule: "every 15 minutes",
  timeZone: "Europe/Madrid",
  timeoutSeconds: 120
}, async () => {
  const tripId = "viaje-verano-2026";
  const now = Date.now();
  const [tasksSnap, coverSnap, devicesSnap] = await Promise.all([
    db.doc(`travelApps/${tripId}/sections/tasks`).get(),
    db.doc(`travelApps/${tripId}/sections/cover`).get(),
    db.collection(`travelApps/${tripId}/pushDevices`).where("enabled", "==", true).get()
  ]);
  const tokens = devicesSnap.docs.map(doc => doc.data()?.token).filter(Boolean);
  if (!tokens.length) return;

  const tasksValue = tasksSnap.data()?.value || { items:[] };
  const coverValue = coverSnap.data()?.value || { flights:[] };
  const notifications = [];

  for (const task of tasksValue.items || []) {
    if (task.completed || !dueReminder(task, "notifyAt", "notifiedAt", now)) continue;
    notifications.push({
      title:`Tarea pendiente · ${task.title || "MFE Viajes"}`,
      body:task.description || "Tienes una tarea prevista para el viaje.",
      tag:`task-${task.id || now}`,
      mark:() => { task.notifiedAt = new Date().toISOString(); }
    });
  }

  for (const flight of coverValue.flights || []) {
    if (dueReminder(flight, "checkInNotifyAt", "checkInNotifiedAt", now, 30 * 60 * 1000)) {
      notifications.push({
        title:`Check-in · vuelo ${flight.number || ""}`.trim(),
        body:`Ya puedes revisar el check-in de ${flight.from || "origen"} a ${flight.to || "destino"}.`,
        tag:`checkin-${flight.id || flight.number || now}`,
        mark:() => { flight.checkInNotifiedAt = new Date().toISOString(); }
      });
    }
    if (dueReminder(flight, "leaveNotifyAt", "leaveNotifiedAt", now, 30 * 60 * 1000)) {
      notifications.push({
        title:`Hora de salir hacia el aeropuerto`,
        body:`Vuelo ${flight.number || ""} · ${flight.from || ""} → ${flight.to || ""}`,
        tag:`leave-${flight.id || flight.number || now}`,
        mark:() => { flight.leaveNotifiedAt = new Date().toISOString(); }
      });
    }
  }

  for (const notification of notifications) {
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      data:{
        title:notification.title,
        body:notification.body,
        tag:notification.tag,
        url:"/"
      },
      webpush:{ headers:{ Urgency:"high" } }
    });
    if (response.successCount > 0) notification.mark();
  }

  const writes = [];
  if (notifications.some(n => n.tag.startsWith("task-"))) writes.push(tasksSnap.ref.set({value:tasksValue,updatedAt:new Date()},{merge:true}));
  if (notifications.some(n => n.tag.startsWith("checkin-") || n.tag.startsWith("leave-"))) writes.push(coverSnap.ref.set({value:coverValue,updatedAt:new Date()},{merge:true}));
  await Promise.all(writes);
});

// v2.3.25 · Piscinas Cordial Santa Águeda / Perchel Beach Club + webcams directas.
const POOL_SOURCE_URL = "https://cordial.galileus.es/gweb/siloe/diario/?token=NUEraFBKcnlEYzdUVVRobnRPMHc5Zz09";
const TRAVEL_TRIP_ID = "viaje-verano-2026";
const WEBCAM_PAGES = {
  "santa-agueda": {
    title: "Santa Águeda · El Pajar",
    url: "https://in2thebeach.es/webcam/71/el-pajar-santa-agueda-arguineguin/"
  },
  "el-perchel": {
    title: "Playa de El Perchel",
    url: "https://www.skylinewebcams.com/es/webcam/espana/canarias/las-palmas-gran-canaria/arguineguin-playa-de-el-perchel.html"
  }
};

function cleanRemoteText(value) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}
function absoluteRemoteUrl(value, base) {
  try { return new URL(String(value || "").replace(/\\u0026/g,"&").replace(/\\\//g,"/"), base).href; }
  catch { return ""; }
}
function metricNumber(value) {
  const match=cleanRemoteText(value).replace(/,/g,'.').match(/-?\d+(?:\.\d+)?/);
  const n=match?Number.parseFloat(match[0]):NaN;
  return Number.isFinite(n)?n:null;
}
function findTemperatureMetric(metrics=[]) {
  for(const metric of metrics){
    const label=cleanRemoteText(metric.label).toLocaleLowerCase('es');
    if(/temperatura|temperature|temp\.?\b/.test(label)){
      const n=metricNumber(metric.value);
      if(n!==null && n>-5 && n<60)return n;
    }
  }
  return null;
}
function pickMeasurementTime(metrics=[], bodyText="") {
  const joined=[...metrics.map(m=>`${m.label} ${m.value}`),bodyText].join(' ');
  const date=joined.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
  const time=joined.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
  let dateIso="";
  if(date){let y=date[3];if(y.length===2)y=`20${y}`;dateIso=`${y}-${date[2].padStart(2,'0')}-${date[1].padStart(2,'0')}`;}
  return {date:dateIso,time:time?`${time[1].padStart(2,'0')}:${time[2]}`:""};
}
function metricPairsFromPage($) {
  const pairs=[];
  const add=(label,value)=>{
    label=cleanRemoteText(label);value=cleanRemoteText(value);
    if(!label||!value||label===value||label.length>100||value.length>180)return;
    const key=`${label.toLocaleLowerCase('es')}|${value.toLocaleLowerCase('es')}`;
    if(!pairs.some(x=>x._key===key))pairs.push({label,value,_key:key});
  };
  $('tr').each((_,row)=>{
    const cells=$(row).find('th,td').map((__,cell)=>cleanRemoteText($(cell).text())).get().filter(Boolean);
    if(cells.length===2)add(cells[0],cells[1]);
    else if(cells.length>2){
      const headers=$(row).closest('table').find('tr').first().find('th').map((__,cell)=>cleanRemoteText($(cell).text())).get();
      if(headers.length===cells.length && !$(row).find('th').length){for(let i=0;i<cells.length;i++)add(headers[i]||`Dato ${i+1}`,cells[i]);}
    }
  });
  $('dt').each((_,dt)=>add($(dt).text(),$(dt).next('dd').text()));
  $('label').each((_,label)=>{
    const forId=$(label).attr('for');
    let value='';
    if(forId){const input=$(`#${forId}`);value=input.val()||input.attr('value')||input.text();}
    if(!value){const row=$(label).closest('.row,.form-group,.mb-2,.mb-3,div');value=row.find('input,select,textarea').first().val()||row.find('strong,b,.value,.dato,.data').first().text();}
    add($(label).text(),value);
  });
  $('[data-label],[data-title]').each((_,node)=>{
    const label=$(node).attr('data-label')||$(node).attr('data-title');
    add(label,$(node).text());
  });
  // Galileus puede pintar los valores como tarjetas/divs sin tabla.
  const metricWord=/temperatura|temperature|temp\.?\b|\bp\s*h\b|cloro|chlorine|bromo|turbidez|turbidity|recirculaci[oó]n|recirculation|transparencia|conductividad|conductivity|alcalinidad|alkalinity/i;
  $('body *').each((_,node)=>{
    const own=cleanRemoteText($(node).clone().children().remove().end().text());
    if(!own || own.length>90 || !metricWord.test(own))return;
    const parent=$(node).parent();
    const sibling=cleanRemoteText($(node).next().text()||$(node).prev().text());
    const nearby=cleanRemoteText(parent.find('.value,.dato,.data,.measurement,.medicion,strong,b,span').filter((__,el)=>el!==node).first().text());
    const candidate=nearby||sibling;
    if(candidate && /-?\d+(?:[.,]\d+)?/.test(candidate))add(own,candidate);
  });
  const body=cleanRemoteText($('body').text());
  const rx=/(Temperatura(?:\s+del?\s+agua)?|Temperature|Temp\.?|pH|Cloro(?:\s+libre|\s+total)?|Chlorine|Bromo|Turbidez|Turbidity|Recirculaci[oó]n|Recirculation|Transparencia|Conductividad|Conductivity|Alcalinidad)\s*[:=\-]?\s*(-?\d+(?:[.,]\d+)?\s*(?:°?\s*C|mg\/?l|ppm|NTU|UNF|FNU|UNT|h|horas?|µS\/?cm|uS\/?cm)?)/ig;
  for(const m of body.matchAll(rx))add(m[1],m[2]);
  return pairs.map(({_key,...rest})=>rest).filter(m=>!/seleccion|select|volver|back/i.test(`${m.label} ${m.value}`));
}
function matrixPoolMeasurementsFromPage($, poolName='Piscina') {
  const records=[];const metricWord=/temperatura|temperature|temp\.?\b|\bp\s*h\b|cloro|chlorine|bromo|turbidez|turbidity|recirculaci[oó]n|recirculation|transparencia|conductividad|conductivity|alcalinidad|alkalinity/i;
  $('table').each((tableIndex,table)=>{
    const rows=$(table).find('tr').map((_,row)=>$(row).find('th,td').map((__,cell)=>cleanRemoteText($(cell).text())).get()).get().filter(r=>r.length>=2);
    if(rows.length<2)return;
    const headers=rows[0], body=rows.slice(1);
    const metricRows=body.filter(r=>r[0]&&metricWord.test(r[0])&&r.slice(1).some(v=>/-?\d+(?:[.,]\d+)?/.test(v||'')));
    if(metricRows.length<1)return;
    const maxCols=Math.max(...metricRows.map(r=>r.length));
    for(let col=1;col<maxCols;col++){
      const metrics=metricRows.map(r=>({label:r[0],value:r[col]||''})).filter(m=>m.value);
      if(!metrics.length)continue;
      const measurement=cleanRemoteText(headers[col]||'')||`Medición ${col}`;
      const when=pickMeasurementTime(metrics,[measurement,...metrics.map(m=>m.value)].join(' '));
      records.push({name:poolName||'Piscina',measurement,metrics,temperature:findTemperatureMetric(metrics),date:when.date,time:when.time,source:`matriz-${tableIndex+1}-${col}`});
    }
  });
  return records;
}
function tablePoolsFromPage($, measurementLabel="") {
  const pools=[];
  $('table').each((tableIndex,table)=>{
    const rows=$(table).find('tr');if(rows.length<2)return;
    let headers=rows.first().find('th,td').map((_,cell)=>cleanRemoteText($(cell).text())).get();
    if(headers.length<2)return;
    rows.slice(1).each((rowIndex,row)=>{
      const cells=$(row).find('td,th').map((_,cell)=>cleanRemoteText($(cell).text())).get();
      if(cells.length<2)return;
      const first=cells[0];if(!first||/fecha|date|hora|time|parámetro|parameter/i.test(first))return;
      const metrics=[];for(let i=1;i<Math.min(headers.length,cells.length);i++){if(headers[i]&&cells[i])metrics.push({label:headers[i],value:cells[i]});}
      if(!metrics.length)return;
      const when=pickMeasurementTime(metrics,cells.join(' '));
      pools.push({name:first,measurement:measurementLabel||'',metrics,temperature:findTemperatureMetric(metrics),date:when.date,time:when.time,source:`tabla-${tableIndex+1}-${rowIndex+1}`});
    });
  });
  return pools;
}
function formRequestsFromPage(html, pageUrl) {
  const $=cheerio.load(html);const requests=[];const seen=new Set();
  const push=req=>{const key=`${req.method}|${req.action}|${JSON.stringify(req.fields||{})}`;if(seen.has(key))return;seen.add(key);requests.push(req);};
  const genericNames=['piscina','pool','id','pk','codigo','piscina_id','pool_id','instalacion','installation'];
  $('select').each((_,select)=>{
    const $select=$(select), form=$select.closest('form'), action=absoluteRemoteUrl(form.attr('action')||pageUrl,pageUrl)||pageUrl, method=String(form.attr('method')||'GET').toUpperCase();
    const hidden={};form.find('input[type="hidden"][name]').each((__,input)=>{hidden[$(input).attr('name')]=String($(input).val()||'');});
    const controlName=String($select.attr('name')||$select.attr('id')||$select.attr('data-name')||'').trim();
    $select.find('option').each((__,option)=>{
      const $option=$(option), value=String($option.attr('value')??'').trim(), label=cleanRemoteText($option.text());
      if(!value||!label||/select|seleccion|elige|choose|---/i.test(label))return;
      const direct=$option.attr('data-url')||$option.attr('data-href')||(/^https?:|^\//i.test(value)?value:'');
      if(direct)push({action:absoluteRemoteUrl(direct,pageUrl),method:'GET',fields:{},label});
      if(controlName)push({action,method,fields:{...hidden,[controlName]:value},label});
      // Algunos frontales cargan el selector por JS y el control no tiene name.
      if(!controlName || !/pisc|pool|id|pk|codigo|instal/i.test(controlName)){
        for(const name of genericNames)push({action,method:'GET',fields:{...hidden,[name]:value},label});
      }
      // Fallback frecuente de vistas detalle REST/Django.
      if(/^[A-Za-z0-9_-]{1,80}$/.test(value)){
        try{const u=new URL(pageUrl);u.pathname=u.pathname.replace(/\/$/,'')+`/${encodeURIComponent(value)}/`;push({action:u.href,method:'GET',fields:{},label});}catch{}
      }
    });
  });
  $('form').each((_,form)=>{
    const $form=$(form), action=absoluteRemoteUrl($form.attr('action')||pageUrl,pageUrl)||pageUrl, method=String($form.attr('method')||'GET').toUpperCase();
    const hidden={};$form.find('input[type="hidden"][name]').each((__,input)=>{hidden[$(input).attr('name')]=String($(input).val()||'');});
    $form.find('button[name][value],input[type="submit"][name][value]').each((__,btn)=>{
      const name=$(btn).attr('name'),value=String($(btn).attr('value')||''),label=cleanRemoteText($(btn).text()||$(btn).attr('value'));
      if(name&&value)push({action,method,fields:{...hidden,[name]:value},label:label||value});
    });
  });
  return requests.slice(0,120);
}
function mergeCookies(current,setCookieValues=[]){
  const jar=new Map();for(const part of String(current||'').split(/;\s*/)){const i=part.indexOf('=');if(i>0)jar.set(part.slice(0,i),part.slice(i+1));}
  for(const raw of setCookieValues){const first=String(raw||'').split(';')[0],i=first.indexOf('=');if(i>0)jar.set(first.slice(0,i).trim(),first.slice(i+1).trim());}
  return [...jar].map(([k,v])=>`${k}=${v}`).join('; ');
}
async function fetchRemotePage(url, options={}, session=null) {
  const {timeoutMs=6500,...fetchOptions}=options||{};
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const headers={
      'User-Agent':'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36',
      'Accept':'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'Accept-Language':'es-ES,es;q=0.9,en;q=0.5',
      'Cache-Control':'no-cache',
      ...(session?.cookie?{'Cookie':session.cookie}:{}),
      ...(fetchOptions.headers||{})
    };
    const response=await fetch(url,{redirect:'follow',signal:controller.signal,...fetchOptions,headers});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    if(session){
      let cookies=[];try{cookies=response.headers.getSetCookie?.()||[];}catch{}
      if(!cookies.length){const one=response.headers.get('set-cookie');if(one)cookies=[one];}
      if(cookies.length)session.cookie=mergeCookies(session.cookie,cookies);
    }
    return {text:await response.text(),url:response.url||url,contentType:response.headers.get('content-type')||''};
  }finally{clearTimeout(timer);}
}
async function fetchFormRequest(req,session) {
  const source=new URL(POOL_SOURCE_URL),target=new URL(req.action);
  if(target.hostname===source.hostname&&!target.searchParams.has('token')&&source.searchParams.get('token'))target.searchParams.set('token',source.searchParams.get('token'));
  if(req.method==='POST'){
    const body=new URLSearchParams(req.fields).toString();
    return fetchRemotePage(target.href,{method:'POST',body,headers:{'Content-Type':'application/x-www-form-urlencoded','Referer':POOL_SOURCE_URL}},session);
  }
  for(const [k,v] of Object.entries(req.fields))target.searchParams.set(k,v);
  return fetchRemotePage(target.href,{headers:{'Referer':POOL_SOURCE_URL}},session);
}
function recordsFromJson(value,label=''){
  const out=[];const seen=new Set();
  const walk=(node,context='',depth=0)=>{
    if(depth>8||node==null)return;
    if(Array.isArray(node)){node.forEach((v,i)=>walk(v,context,depth+1));return;}
    if(typeof node!=='object')return;
    const entries=Object.entries(node);const lower=Object.fromEntries(entries.map(([k,v])=>[k.toLowerCase(),v]));
    const nameKeys=['piscina','pool_name','poolname','nombre_piscina','piscina_nombre','installation_name','instalacion_nombre','name','nombre','descripcion','description'];
    let name='';for(const k of nameKeys){if(typeof lower[k]==='string'&&cleanRemoteText(lower[k])){name=cleanRemoteText(lower[k]);break;}}
    name=name||context||label;
    const metrics=[];
    for(const [k,v] of entries){
      if(v==null||typeof v==='object')continue;
      const key=cleanRemoteText(k).replace(/[_-]+/g,' '), val=cleanRemoteText(v);
      if(!val)continue;
      if(/temper|\btemp\b|\bph\b|cloro|chlor|bromo|turb|transpar|conduct|alcalin|agua|water/i.test(key))metrics.push({label:key,value:val});
    }
    if(metrics.length){
      const text=entries.filter(([,v])=>typeof v!=='object').map(([k,v])=>`${k} ${v}`).join(' '),when=pickMeasurementTime(metrics,text);
      const key=`${name}|${JSON.stringify(metrics)}`;if(!seen.has(key)){seen.add(key);out.push({name:name||'Piscina',measurement:label||'Última medición',metrics,temperature:findTemperatureMetric(metrics),date:when.date,time:when.time,source:'json'});}
    }
    for(const [k,v] of entries){if(v&&typeof v==='object')walk(v,(!name&&typeof k==='string'&&!/^\d+$/.test(k))?cleanRemoteText(k):name,depth+1);}
  };
  walk(value,label,0);return out;
}
function recordsFromResponse(page,label=''){
  const type=String(page.contentType||'').toLowerCase(),text=String(page.text||'');
  if(type.includes('json')||/^[\s\r\n]*[\[{]/.test(text)){
    try{const rows=recordsFromJson(JSON.parse(text),label);if(rows.length)return rows;}catch{}
  }
  const $=cheerio.load(text),matrix=matrixPoolMeasurementsFromPage($,label||'Piscina');
  if(matrix.length)return matrix;
  const tables=tablePoolsFromPage($,label);
  if(tables.length)return tables;
  const metrics=metricPairsFromPage($);
  if(metrics.length){const bodyText=cleanRemoteText($('body').text()),when=pickMeasurementTime(metrics,bodyText);return [{name:label||'Piscina',measurement:'Última medición',metrics,temperature:findTemperatureMetric(metrics),date:when.date,time:when.time,source:'html'}];}
  return [];
}
function normalizePoolName(value,index=0){const name=cleanRemoteText(value);return name||`Piscina ${index+1}`;}
function poolMetricNumber(value=''){const hit=String(value??'').replace(',','.').match(/-?\d+(?:\.\d+)?/);return hit?Number(hit[0]):NaN;}
function repairPoolRecirculation(measurements=[]){
  const cloned=(measurements||[]).map(m=>({...m,metrics:(m.metrics||[]).map(metric=>({...metric}))}));
  const latest=cloned.find(m=>/ultima|última|last/i.test(String(m?.measurement||'')))||cloned[0]||null;
  const latestTurbidity=(latest?.metrics||[]).find(metric=>/turbidez|turbidity/i.test(String(metric?.label||'')));
  const latestTurbidityValue=poolMetricNumber(latestTurbidity?.value);
  for(const measurement of cloned){
    if(/ultima|última|last/i.test(String(measurement?.measurement||'')))continue;
    const metrics=measurement.metrics||[];
    if(metrics.some(metric=>/recirculaci[oó]n|recirculation/i.test(String(metric?.label||''))))continue;
    if(metrics.length!==1)continue;
    const metric=metrics[0];
    const value=poolMetricNumber(metric?.value);
    if(/turbidez|turbidity/i.test(String(metric?.label||''))&&Number.isFinite(value)&&Number.isInteger(value)&&value>=1&&value<=24&&Number.isFinite(latestTurbidityValue)&&latestTurbidityValue<1)metric.label='Índice de recirculación (h)';
  }
  return cloned;
}
function mergePoolRecords(records=[]) {
  const merged=new Map();
  for(const [index,row] of records.entries()){
    const name=normalizePoolName(row.name,index), key=name.toLocaleLowerCase('es');
    const existing=merged.get(key)||{name,measurements:[]};
    existing.measurements.push({measurement:row.measurement||'',metrics:row.metrics||[],temperature:row.temperature,date:row.date||'',time:row.time||'',source:row.source||''});
    merged.set(key,existing);
  }
  return [...merged.values()].map(pool=>{
    const measurements=repairPoolRecirculation(pool.measurements);
    const sorted=[...measurements].sort((a,b)=>`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
    const latest=[...sorted].reverse().find(m=>m.temperature!==null)||sorted.at(-1)||null;
    return {...pool,measurements,latest,temperature:latest?.temperature??null};
  });
}
function scriptRequestsFromPage(html,pageUrl){
  const out=[],seen=new Set();
  const push=(raw,label='JS')=>{
    raw=String(raw||'').replace(/\\u0026/g,'&').replace(/\\\//g,'/').trim();
    if(!raw||raw.startsWith('#')||/^javascript:/i.test(raw))return;
    let url='';try{url=new URL(raw,pageUrl).href;}catch{return;}
    if(!/^https?:/i.test(url)||!/(siloe|diario|pisc|pool|medic|measure|ajax|api)/i.test(url))return;
    const key=url;if(seen.has(key))return;seen.add(key);out.push({action:url,method:'GET',fields:{},label});
  };
  const text=String(html||'');
  for(const m of text.matchAll(/(?:fetch|axios\.get)\s*\(\s*["'`]([^"'`]+)["'`]/gi))push(m[1],'JS fetch');
  for(const m of text.matchAll(/(?:url|endpoint|route|href)\s*[:=]\s*["'`]([^"'`]+)["'`]/gi))push(m[1],'JS endpoint');
  for(const m of text.matchAll(/["'`]((?:https?:\/\/|\/)[^"'`\s]{3,220})["'`]/gi))push(m[1],'JS URL');
  return out.slice(0,30);
}
async function scrapePoolMeasurements() {
  const startedAt=Date.now(), deadline=startedAt+36000, session={cookie:''};
  const diagnostics={mainUrl:POOL_SOURCE_URL,selects:0,options:0,requests:0,tried:0,responsesWithData:0,cookie:false,notes:[],timeBudgetMs:36000};
  const canTry=()=>Date.now()<deadline && diagnostics.tried<18;
  const main=await fetchRemotePage(POOL_SOURCE_URL,{timeoutMs:7000},session);
  diagnostics.cookie=Boolean(session.cookie);
  const $=cheerio.load(main.text);
  diagnostics.htmlBytes=Buffer.byteLength(main.text||'','utf8');
  diagnostics.forms=$('form').length;diagnostics.scripts=$('script').length;diagnostics.title=cleanRemoteText($('title').first().text());
  diagnostics.bodyPreview=cleanRemoteText($('body').text()).slice(0,260);
  diagnostics.selects=$('select').length;
  diagnostics.options=$('select option').filter((_,o)=>String($(o).attr('value')??'').trim()).length;
  let records=recordsFromResponse(main,'Última medición');
  if(records.length)diagnostics.responsesWithData++;
  const formRequests=formRequestsFromPage(main.text,main.url);
  diagnostics.requests=formRequests.length;
  const requestSignature=req=>`${req.method}|${req.action}|${Object.keys(req.fields||{}).sort().join(',')}`;
  const groups=new Map();
  for(const req of formRequests){const key=req.label||'opción';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(req);}
  let winningSignature='';
  for(const [groupLabel,groupRequests] of [...groups.entries()].slice(0,14)){
    if(!canTry())break;
    let candidates=winningSignature?groupRequests.filter(r=>requestSignature(r)===winningSignature):groupRequests.slice(0,3);
    if(!candidates.length)candidates=groupRequests.slice(0,2);
    for(const req of candidates){
      if(!canTry())break;
      try{
        diagnostics.tried++;
        const page=await fetchFormRequest(req,session);
        const rows=recordsFromResponse(page,groupLabel);
        if(rows.length){
          diagnostics.responsesWithData++;
          records.push(...rows.map(r=>({...r,name:(r.name&&r.name!=='Piscina')?r.name:groupLabel||r.name,measurement:r.measurement||'Última medición'})));
          winningSignature=winningSignature||requestSignature(req);
          break;
        }
      }catch(error){if(diagnostics.notes.length<8)diagnostics.notes.push(`${groupLabel}: ${error.message}`);}
    }
  }
  diagnostics.strategy=winningSignature||'sin coincidencia';
  // Muchos frontales Galileus cargan el selector por JavaScript. Probamos URLs
  // de fetch/axios/endpoints incrustadas en el HTML antes de rendirnos.
  const scriptRequests=scriptRequestsFromPage(main.text,main.url);diagnostics.scriptRequests=scriptRequests.length;
  if(!records.length){
    for(const req of scriptRequests.slice(0,8)){
      if(!canTry())break;
      try{diagnostics.tried++;const page=await fetchFormRequest(req,session);const rows=recordsFromResponse(page,req.label);if(rows.length){diagnostics.responsesWithData++;records.push(...rows);}}
      catch(error){if(diagnostics.notes.length<8)diagnostics.notes.push(`js: ${error.message}`);}
    }
  }
  // Si el HTML trae opciones pero el control se monta por JS, intentamos también los href/data-url visibles.
  if(!records.length){
    const hrefs=[];
    $('[href],[data-url],[data-href]').each((_,n)=>{
      const raw=$(n).attr('data-url')||$(n).attr('data-href')||$(n).attr('href')||'';
      const text=cleanRemoteText($(n).text());
      if(!raw||/^(#|javascript:|mailto:)/i.test(raw))return;
      const url=absoluteRemoteUrl(raw,main.url);if(!url)return;
      if(/siloe|diario|pisc|pool|medic|measure/i.test(`${url} ${text}`))hrefs.push({action:url,method:'GET',fields:{},label:text||'Piscina'});
    });
    for(const req of hrefs.slice(0,6)){
      if(!canTry())break;
      try{diagnostics.tried++;const page=await fetchFormRequest(req,session);const rows=recordsFromResponse(page,req.label);if(rows.length){diagnostics.responsesWithData++;records.push(...rows);}}catch(error){if(diagnostics.notes.length<8)diagnostics.notes.push(`enlace: ${error.message}`);}
    }
  }
  const pools=mergePoolRecords(records).filter(p=>(p.measurements||[]).some(m=>(m.metrics||[]).length));
  diagnostics.detectedPools=pools.length;
  diagnostics.elapsedMs=Date.now()-startedAt;
  if(!pools.length){
    return {source:'Galileus · SILOE',sourceUrl:POOL_SOURCE_URL,fetchedAt:new Date().toISOString(),pools:[],diagnostics,warning:`Galileus respondió, pero aún no se pudieron interpretar las piscinas. Selectores: ${diagnostics.selects} · opciones: ${diagnostics.options} · consultas probadas: ${diagnostics.tried}.`};
  }
  return {source:'Galileus · SILOE',sourceUrl:POOL_SOURCE_URL,fetchedAt:new Date().toISOString(),pools,diagnostics};
}
function poolFingerprint(payload){const stable=JSON.stringify((payload.pools||[]).map(p=>({name:p.name,measurements:(p.measurements||[]).map(m=>({measurement:m.measurement,metrics:m.metrics,date:m.date,time:m.time}))})));return require('crypto').createHash('sha256').update(stable).digest('hex');}
async function storePoolSnapshot(payload) {
  const latestRef=db.doc(`travelApps/${TRAVEL_TRIP_ID}/liveData/pools`), latestSnap=await latestRef.get();
  const fingerprint=poolFingerprint(payload), previous=latestSnap.data()?.fingerprint||'';
  await latestRef.set({payload,fingerprint,fetchedAt:new Date(),sourceUrl:POOL_SOURCE_URL},{merge:true});
  if(fingerprint!==previous){await db.collection(`travelApps/${TRAVEL_TRIP_ID}/poolMeasurementHistory`).add({payload,fingerprint,fetchedAt:new Date()});}
  return {fingerprint,changed:fingerprint!==previous};
}
async function poolHistory(limit=100){
  const snap=await db.collection(`travelApps/${TRAVEL_TRIP_ID}/poolMeasurementHistory`).orderBy('fetchedAt','desc').limit(limit).get();
  return snap.docs.map(doc=>{const data=doc.data()||{};return {id:doc.id,fetchedAt:data.fetchedAt?.toDate?.().toISOString?.()||data.payload?.fetchedAt||'',pools:data.payload?.pools||[]};}).reverse();
}
async function syncPoolsNow(){
  const payload=await scrapePoolMeasurements();
  try{await storePoolSnapshot(payload);}catch(error){
    console.error('pool snapshot store failed',error);
    payload.warning=[payload.warning,`Datos leídos, pero no se pudo guardar el histórico: ${error.message}`].filter(Boolean).join(' · ');
    payload.diagnostics={...(payload.diagnostics||{}),storeError:error.message||String(error)};
  }
  return payload;
}
function poolFailurePayload(error,stage='lectura'){
  const message=String(error?.message||error||'Error desconocido').replace(/\s+/g,' ').trim();
  return {source:'Galileus · SILOE',sourceUrl:POOL_SOURCE_URL,fetchedAt:new Date().toISOString(),pools:[],history:[],warning:`No se pudieron leer las piscinas (${stage}): ${message}`,diagnostics:{fatal:true,stage,error:message,stack:String(error?.stack||'').split('\n').slice(0,5).join(' | ')}};
}
async function buildPoolResponse({force=true,useCache=true}={}){
  let payload=null,fetched=0;const functionDiagnostics={};
  const latestRef=db.doc(`travelApps/${TRAVEL_TRIP_ID}/liveData/pools`);
  if(useCache){
    try{const latestSnap=await latestRef.get();payload=latestSnap.data()?.payload||null;fetched=latestSnap.data()?.fetchedAt?.toMillis?.()||0;}
    catch(error){console.error('pool cache read failed',error);functionDiagnostics.cacheReadError=error.message||String(error);}
  }
  if(force||!payload||Date.now()-fetched>20*60*1000){
    try{payload=await scrapePoolMeasurements();}
    catch(error){console.error('pool scrape failed',error);payload=poolFailurePayload(error,'Galileus');}
    if((payload?.pools||[]).length){
      try{await storePoolSnapshot(payload);}catch(error){console.error('pool snapshot store failed',error);payload={...payload,warning:[payload.warning,`Datos leídos, pero no se pudo guardar el histórico: ${error.message}`].filter(Boolean).join(' · '),diagnostics:{...(payload.diagnostics||{}),storeError:error.message||String(error)}};}
    }
  }
  if(!payload)payload={source:'Galileus · SILOE',sourceUrl:POOL_SOURCE_URL,fetchedAt:new Date().toISOString(),pools:[],warning:'No hay todavía datos de piscinas guardados.',diagnostics:functionDiagnostics};
  let history=[];try{history=await poolHistory(120);}catch(error){console.error('pool history read failed',error);functionDiagnostics.historyError=error.message||String(error);}
  return {...payload,history,diagnostics:{...(payload.diagnostics||{}),...functionDiagnostics}};
}
exports.getPoolMeasurements = onCall({region:REGION,timeoutSeconds:60,memory:'512MiB'},async(request)=>{
  // Los datos de SILOE son de consulta pública. No hacemos depender esta lectura
  // del perfil Firestore para que un fallo de autenticación/caché nunca termine
  // convertido por Firebase en el opaco "internal".
  try{return await buildPoolResponse({force:request.data?.force===true,useCache:true});}
  catch(error){console.error('getPoolMeasurements fatal',error);return poolFailurePayload(error,'Function');}
});
exports.poolMeasurementsPublic = onRequest({region:REGION,timeoutSeconds:60,memory:'512MiB',cors:true,invoker:'public'},async(req,res)=>{
  res.set('Access-Control-Allow-Origin','*');res.set('Access-Control-Allow-Methods','GET, OPTIONS');res.set('Access-Control-Allow-Headers','Content-Type');res.set('Cache-Control','no-store');
  if(req.method==='OPTIONS'){res.status(204).send('');return;}
  try{const force=String(req.query?.force||'')==='1';res.status(200).json(await buildPoolResponse({force,useCache:true}));}
  catch(error){console.error('poolMeasurementsPublic fatal',error);res.status(200).json(poolFailurePayload(error,'HTTP Function'));}
});
exports.syncPoolMeasurements = onSchedule({region:REGION,schedule:'15 8,12,16,20 * * *',timeZone:'Atlantic/Canary',timeoutSeconds:90,memory:'512MiB'},async()=>{
  try{await syncPoolsNow();}catch(error){console.error('scheduled pool sync failed',error);}
});

function webcamCandidates(html,pageUrl){
  const $=cheerio.load(html),candidates=[];
  const push=(url,mode,context='')=>{url=absoluteRemoteUrl(url,pageUrl);if(!url||!/^https?:/i.test(url))return;const lower=`${url} ${context}`.toLowerCase();if(/doubleclick|googlesyndication|google\.com\/maps|windy|windguru|facebook|instagram|twitter|analytics|cookie/.test(lower))return;let score=0;if(/\.m3u8(?:$|\?)/i.test(url)){mode='video';score+=100;}if(/\.mp4(?:$|\?)/i.test(url)){mode='video';score+=90;}if(/embed|player|stream|live|webcam|camera/.test(lower))score+=45;if(/iframe/.test(context))score+=10;if(new URL(url).hostname!==new URL(pageUrl).hostname)score+=8;candidates.push({url,mode,score});};
  $('video[src]').each((_,n)=>push($(n).attr('src'),'video','video'));
  $('video source[src],source[type*="mpegURL"][src],source[type*="video"][src]').each((_,n)=>push($(n).attr('src'),'video','video source'));
  $('iframe[src]').each((_,n)=>push($(n).attr('src'),'iframe',`iframe ${$(n).attr('id')||''} ${$(n).attr('class')||''} ${$(n).attr('title')||''}`));
  const decoded=String(html).replace(/\\u0026/g,'&').replace(/\\\//g,'/');
  for(const match of decoded.matchAll(/https?:[^"'<>\s]+?\.m3u8(?:\?[^"'<>\s]*)?/gi))push(match[0],'video','script hls');
  for(const match of decoded.matchAll(/https?:[^"'<>\s]+?(?:embed|player)[^"'<>\s]*/gi))push(match[0],'iframe','script embed player');
  const uniq=new Map();for(const c of candidates){const old=uniq.get(c.url);if(!old||c.score>old.score)uniq.set(c.url,c);}return [...uniq.values()].sort((a,b)=>b.score-a.score);
}
exports.getTravelWebcam = onCall({region:REGION,timeoutSeconds:35,memory:'256MiB'},async(request)=>{
  await requireTravelUser(request,false);const key=String(request.data?.key||'');const def=WEBCAM_PAGES[key];if(!def)throw new HttpsError('invalid-argument','Webcam no válida.');
  let page;try{page=await fetchRemotePage(def.url);}catch(error){throw new HttpsError('unavailable',`No se pudo abrir la webcam: ${error.message}`);}
  const candidates=webcamCandidates(page.text,page.url),best=candidates[0];
  if(!best)throw new HttpsError('not-found','El proveedor no expone ahora un reproductor directo compatible.');
  return {key,title:def.title,mode:best.mode,url:best.url,provider:new URL(def.url).hostname,sourcePage:def.url};
});
