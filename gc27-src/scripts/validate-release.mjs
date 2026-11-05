import assert from 'node:assert/strict';
import {readFile, writeFile, unlink} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=rel=>readFile(path.join(root,rel),'utf8');
const checkNode=rel=>{
  const r=spawnSync(process.execPath,['--check',path.join(root,rel)],{encoding:'utf8'});
  assert.equal(r.status,0,`${rel} no pasa node --check:\n${r.stderr}`);
};
const workerFile='CLOUDFLARE_WORKER_v2_2_54.js';
const vuelingWorkerFile='CLOUDFLARE_WORKER_VUELING_v1_0_23.js';
for(const rel of ['public/app.js','public/sw.js','functions/index.js','monitoring/lib.mjs','monitoring/autoreisen.mjs','monitoring/monitor.mjs','monitoring/cordial.mjs','monitoring/cordial-run.mjs','monitoring/flightops.mjs','monitoring/flightops-run.mjs',workerFile,'scripts/test-cordial-worker.mjs','scripts/test-autoreisen-worker.mjs','monitoring/vueling.mjs','monitoring/pools.mjs',vuelingWorkerFile,'scripts/test-vueling-worker.mjs','scripts/test-vueling-pricing.mjs','scripts/test-flightops.mjs','scripts/test-mobile-deploy-worker.mjs'])checkNode(rel);

const app=await read('public/app.js');
const seed=await read('public/seed-data.js');
const moduleCheck=spawnSync(process.execPath,['--input-type=module','--check'],{input:app,encoding:'utf8'});
assert.equal(moduleCheck.status,0,`public/app.js no pasa la comprobación como módulo ES:\n${moduleCheck.stderr}`);
const accuButton = app.match(/function renderAccuWeatherButton\(extraClass=''\)\{[\s\S]*?\n\}/)?.[0] || '';
assert.ok(accuButton,'No se encontró renderAccuWeatherButton');
assert.match(accuButton,/accuWeatherAndroidIntentUrl\(\)/,'AccuWeather debe abrir la app en Android');
assert.match(app,/https:\/\/www\.accuweather\.com\/es\/es\/la-playa-de-arguineguin\/2279587\/weather-forecast\/2279587/,'Escritorio debe usar la web española de La Playa de Arguineguín');
assert.match(app,/function canManageAutomations\(\) \{ return roleCanEdit\(\); \}/);
assert.doesNotMatch(seed,/\"el-perchel\"\s*:/,'El botón Webcam El Perchel no debe existir en la configuración por defecto');
assert.match(app,/filter\(\(\[id\]\)=>id==='santa-agueda'\)/,'La app debe eliminar configuraciones antiguas de Webcam El Perchel');
assert.match(app,/webcamResponseLooksLikeWholePage/,'La app debe rechazar páginas HTML completas como reproductor de webcam');
assert.match(app,/health\?\.version!=='2\.2\.54'/,'La app debe exigir el Worker 2.2.54 para integraciones de seguimiento');

// v2.4.15 · selector Drive: cargar automáticamente todas las páginas de la carpeta.
assert.match(app,/pageSize:'1000'/,'El navegador de Drive debe pedir hasta 1.000 elementos por página');
assert.match(app,/while\(token&&pages<20\)/,'El navegador de Drive debe continuar automáticamente por las páginas siguientes');
assert.match(app,/carga automáticamente todas las páginas de la carpeta/,'El selector debe informar de la carga completa automática');

// v2.4.10 · Cordial: todos los resúmenes usan Reserva Online / cancelación sin gastos.
assert.match(app,/const flexible=base\.filter\(cordialIsReservationOnline\)/,'Cordial debe priorizar Reserva Online en los resúmenes');
assert.match(app,/Club Cordial · cancelación sin gastos/,'Los resúmenes Cordial deben identificar la tarifa flexible sin gastos');
assert.match(app,/cordialSummaryRoomRows\(\{options:Array\.isArray\(options\)\?options:\[\]\}\)/,'El gráfico Cordial debe usar la misma selección de tarifa que los resúmenes');
const cordialMonitor=await read('monitoring/cordial.mjs');
assert.match(cordialMonitor,/MFE_CORDIAL_AUTOMATION_VERSION:\s*2\.2\.12/,'El monitor Cordial debe estar en v2.2.12');
assert.match(cordialMonitor,/normalizeCancellationLabels/,'El monitor Cordial debe corregir etiquetas arrastradas de cancelación');


// v2.3.52 · AutoReisen: fechas independientes persistentes y consulta de flota robusta.
assert.match(app,/settings\.autoreisenSyncWithTripDates!==false/,'AutoReisen debe respetar la desactivación de sincronización con las fechas generales del viaje');
assert.match(app,/persistAutoreisenManualDraft/,'Las fechas manuales de AutoReisen deben persistirse antes de consultar la flota');
assert.match(app,/state\.data\.settings\.autoreisenSyncWithTripDates=false/,'Una fecha manual distinta debe desactivar la resincronización automática con septiembre');
assert.match(app,/current\.fleetPrices=fleet\.map/,'La consulta puntual debe guardar inmediatamente la flota en Seguimiento');
assert.match(await read('monitoring/autoreisen.mjs'),/fleetResultPageLooksValid/,'La consulta de flota debe validar fechas sin exigir el texto literal de duración');

// v2.3.51 · AutoReisen: flota completa y categorías visibles en Seguimiento.
assert.match(app,/fleetTrackAll/,'Falta la opción Todas las categorías de AutoReisen');
assert.match(app,/data-ar-track-group/,'Falta la selección múltiple de categorías AutoReisen');
assert.match(app,/autoreisenFleetPricesMarkup/,'Falta la cuadrícula de precios de flota AutoReisen');
assert.match(app,/fleetPriceHistory/,'Falta el histórico por coche de AutoReisen');
assert.match(await read('monitoring/autoreisen.mjs'),/pricePerDay,total/,'El parser AutoReisen debe devolver precio diario y total por vehículo');
assert.match(await read('monitoring/monitor.mjs'),/scanAutoReisenFleet/,'El monitor diario debe consultar la flota completa');
assert.match(app,/Categorías visibles en Seguimiento/,'Falta el selector de categorías visibles en Configuración');
assert.match(app,/Todas visibles/,'Falta la opción Todas visibles de AutoReisen');
assert.match(app,/autoreisenVisibleFleetRows/,'Seguimiento debe filtrar localmente las categorías visibles');
assert.match(await read('monitoring/monitor.mjs'),/fleet:fullFleet/,'El monitor debe guardar siempre la flota completa');


// AutoReisen image UI/data path.
assert.match(app,/autoreisen-car-photo/,'Falta la foto en la tarjeta AutoReisen');
assert.match(app,/manualImageUrl/,'Falta el fallback de imagen manual AutoReisen');
assert.match(app,/result\.imageUrl/,'El resultado automático no persiste imageUrl');
assert.match(app,/fleetCatalog=result\.fleet/,'La flota automática no se conserva');
assert.match(app,/driveImage:true/,'La imagen manual debe permitir Google Drive');
assert.match(app,/function vuelingBudgetReference\(a\)/,'Falta la referencia automática Vueling desde Presupuesto');
assert.match(app,/Comparación automática con Presupuesto/,'Falta el indicador de comparación con Presupuesto');
assert.match(app,/vuelingComparisonMeta\(a\.currentPrice,reserved\.total,reserved\.label\)/,'Falta la comparación del total Vueling');
assert.match(app,/vuelingComparisonMeta\(a\.outboundPrice,reserved\.outbound,reserved\.outboundLabel\)/,'Falta la comparación de ida Vueling');
assert.match(app,/vuelingComparisonMeta\(a\.returnPrice,reserved\.return,reserved\.returnLabel\)/,'Falta la comparación de vuelta Vueling');
assert.match(app,/vuelingComparisonMeta\(a\.baggagePrice,reserved\.baggage,reserved\.baggageLabel\)/,'Falta la comparación de maleta Vueling');
const css=await read('public/styles.css');
assert.match(css,/\.vueling-total-kpi/,'Falta el resaltado visual del precio total Vueling');
assert.match(css,/\.autoreisen-car-photo/,'Falta CSS de la foto AutoReisen');
assert.match(app,/hidden: file\.hidden === true/,'Los archivos deben conservar su estado individual visible/oculto');
assert.match(app,/data-file-visibility=/,'El gestor de archivos debe ofrecer un ojo de visibilidad por elemento');
assert.match(app,/function visibleFiles\(value=\[\]\)/,'Falta el filtro común de elementos ocultos');
assert.match(app,/cover-documents\/\$\{doc\.id\|\|'documento'\}/,'Las fichas de Portada deben guardar los archivos de Drive de forma persistente');
assert.match(app,/autoSave:true,storeDriveLinks:true,storageFolder:`cover-documents/,'Las fichas de Portada deben autoguardar selecciones de Drive');
assert.match(css,/\.file-manager-row\.is-hidden/,'Falta estado visual para archivos ocultos');

assert.match(app,/function synchronizeTrackerTripDataLocally\(\)/,'Falta sincronización automática desde Datos del viaje');
assert.match(app,/function trackerBudgetReference\(kind,tracker=/,'Falta referencia común desde Presupuesto');
assert.match(app,/autoreisenHistoryChart\(a\)/,'Falta gráfico de evolución AutoReisen');
assert.match(app,/trackerComparisonMeta\(total,ref\.total,ref\.label\)/,'AutoReisen no usa la comparación uniforme');
assert.match(app,/trackerComparisonMeta\(price,ref\.total,ref\.label\)/,'Cordial no usa la comparación uniforme');
assert.match(css,/\.tracker-budget-reference/,'Falta estilo uniforme de referencia de Presupuesto');
assert.match(css,/\.tracker-primary-kpi/,'Falta estilo uniforme del precio principal');
assert.match(seed,/"manualImageUrl": ""/);
assert.match(seed,/"imageUrl": ""/);

// Vueling UI/data path.
assert.match(app,/DEFAULT_VUELING_WORKER_URL/,'Falta URL del Worker Vueling');
assert.match(app,/renderVuelingTrackerCard/,'Falta tarjeta Vueling');
assert.match(app,/vuelingHistoryChart/,'Falta gráfico Vueling');
assert.match(app,/github-vueling-install/,'Falta instalación Vueling desde la app');
assert.match(app,/data-vueling-telegram-test/,'Falta prueba de Telegram Vueling');
assert.match(seed,/"vuelingWorkerUrl"/,'Falta Worker Vueling en seed');
assert.match(seed,/"outboundFlight": "VY3272"/,'Falta vuelo de ida Vueling');
assert.match(seed,/"returnFlight": "VY3271"/,'Falta vuelo de vuelta Vueling');
assert.match(css,/\.vueling-chart-line/,'Falta CSS del gráfico Vueling');

const worker=await read(workerFile);
assert.match(worker,/autoreisenFleetPricing:true/,'El Worker debe anunciar soporte de precios de flota AutoReisen');
assert.match(worker,/fleetTrackGroups/,'El Worker debe sincronizar la selección de categorías AutoReisen');
const poolsMonitor=await read('monitoring/pools.mjs');
assert.match(poolsMonitor,/unf/i,'El monitor de piscinas debe reconocer valores de turbidez en UNF');
assert.match(poolsMonitor,/recirculaci\[oó\]n\|recirculation/i,'El monitor de piscinas debe reconocer el índice de recirculación como métrica independiente');
assert.match(poolsMonitor,/MFE_POOLS_AUTOMATION_VERSION: 1\.0\.4/,'El monitor de piscinas debe ser v1.0.4');
assert.match(worker,/function webcamPlayableCandidate\(candidates=\[\],key=''/,'El Worker debe resolver candidatos reproducibles con filtro estricto por webcam');
assert.match(worker,/function webcamIsOrdinaryPage\(item\)/,'El Worker debe filtrar páginas completas de proveedores de webcam');
assert.match(worker,/webcamImageCandidate/,'Debe mantenerse un fotograma como respaldo, no como requisito principal');
assert.doesNotMatch(worker,/canariaslife\.com\/camaras-de-gran-canaria\/mogan\/arguineguin-playa-el-perchel/,'El Worker no debe usar CanariasLife como reproductor de El Perchel');
assert.match(worker,/const WORKER_VERSION = "2\.2\.54";/);
assert.match(worker,/upstream\.searchParams\.set\('_mfe',String\(Date\.now\(\)\)\)/,'El proxy de webcam debe romper la caché de Skyline en cada petición');
assert.match(worker,/Cache-Control':'no-cache, no-store, max-age=0'/,'El fetch hacia Skyline debe pedir no-cache');
assert.match(worker,/CDN-Cache-Control':'no-store'/,'La respuesta de webcam debe impedir caché CDN');
assert.match(worker,/async scheduled\(controller, env, ctx\)/,'El Worker principal debe incluir handler programado de respaldo');
assert.match(worker,/monitor-fallback-status/,'Falta estado del respaldo automático');
assert.match(worker,/runMonitorFallbackCheck/,'Falta comprobación automática de seguimientos');
assert.match(worker,/vueling-monitor\.yml/,'El respaldo debe cubrir también Vueling');
assert.match(app,/tracker-fallback-banner/,'La app debe mostrar el estado del respaldo Cloudflare');
assert.match(app,/monitor-fallback-run/,'La app debe poder recuperar la comprobación diaria si se abre después de la ventana y el cron no ha actuado');
assert.match(worker,/const CORDIAL_AUTOMATION_VERSION = "2\.2\.12";/,'Cordial debe usar automatización 2.2.12');
assert.match(worker,/lib:'monitoring\/lib\.mjs'/,'La verificación Cordial debe incluir lib.mjs');
assert.match(worker,/lib:sameGithubText\(lib,AUTOREISEN_FILE_0\)/,'Cordial debe comprobar la librería común exacta');
assert.match(worker,/upsertGithubFile\(target,'monitoring\/lib\.mjs',AUTOREISEN_FILE_0/,'Cordial debe reparar lib.mjs en GitHub');
assert.match(app,/function trackerSummaryStrip\(/,'Falta resumen superior de Seguimientos');
assert.match(app,/Precio actual|Actual/,'El resumen debe mostrar el precio actual');
assert.match(app,/Reservado/,'El resumen debe mostrar el precio reservado');
assert.match(app,/Diferencia/,'El resumen debe mostrar la diferencia');
assert.match(css,/\.tracker-summary-strip/,'Falta CSS del resumen superior de Seguimientos');
assert.match(css,/\.tracker-summary-pill/,'Faltan las pastillas de Seguimientos');
assert.match(app,/trackerTitleIconMarkup\(id/,'Las pastillas deben reutilizar el logo\/icono personalizable del seguimiento');
assert.match(app,/repairCordialAutomationOnUpgrade/,'La app debe reparar automáticamente la automatización Cordial al actualizar');
assert.match(worker,/const AUTOREISEN_AUTOMATION_VERSION = "2\.2\.23";/);
assert.match(worker,/const CORDIAL_AUTOMATION_VERSION = "2\.2\.12";/);
assert.match(worker,/inspectAutoreisenAutomation/,'AutoReisen debe validar contenido exacto en GitHub');
assert.match(worker,/sameGithubText/,'Debe existir comparación exacta de contenido');
assert.match(worker,/payload\.action === "github-autoreisen-install"/);
assert.match(worker,/payload\.action === "github-autoreisen-run"/);
assert.match(worker,/payload\.action === "github-autoreisen-status"/);
assert.match(worker,/payload\.action === "github-cordial-run"/);
assert.match(worker,/GitHub ha rechazado GITHUB_TOKEN: credenciales no válidas/,'Falta diagnóstico claro para Bad credentials de GitHub');
assert.match(worker,/inputs:\{force:"true"\}/,'El respaldo de Cordial debe forzar la consulta mediante workflow_dispatch');
assert.match(await read('monitoring/monitor.mjs'),/OMITIDO: ya existe una comprobación correcta de hoy/,'AutoReisen debe evitar duplicados tardíos');
assert.match(await read('monitoring/cordial-run.mjs'),/OMITIDO: ya existe una comprobación correcta de hoy/,'Cordial debe evitar duplicados tardíos');

function extractStringConstant(source,name){
  const markers=[`const ${name} = `,`const ${name}=`];
  const marker=markers.find(value=>source.includes(value));
  assert.ok(marker,`No se encuentra ${name}`);
  const markerPos=source.indexOf(marker);
  const start=markerPos+marker.length;
  assert.equal(source[start],'"',`${name} no usa literal JSON seguro`);
  let i=start+1,esc=false;
  for(;i<source.length;i++){
    const c=source[i];
    if(esc){esc=false;continue;}
    if(c==='\\'){esc=true;continue;}
    if(c==='"')break;
  }
  return JSON.parse(source.slice(start,i+1));
}
const mappings=[
  ['AUTOREISEN_FILE_0','monitoring/lib.mjs',true],
  ['AUTOREISEN_FILE_1','monitoring/monitor.mjs',true],
  ['AUTOREISEN_FILE_2','monitoring/autoreisen.mjs',true],
  ['AUTOREISEN_FILE_3','monitoring/package.json',false],
  ['AUTOREISEN_WORKFLOW_TEMPLATE','.github/workflows/autoreisen-monitor.yml',false],
  ['CORDIAL_FILE','monitoring/cordial.mjs',true],
  ['CORDIAL_RUN_FILE','monitoring/cordial-run.mjs',true],
  ['CORDIAL_WORKFLOW_TEMPLATE','.github/workflows/cordial-monitor.yml',false]
];
for(const [name,rel,isJs] of mappings){
  const embedded=extractStringConstant(worker,name);
  const canonical=await read(rel);
  assert.equal(embedded,canonical,`${name} no coincide exactamente con ${rel}`);
  if(isJs){
    const temp=path.join(root,`.validate-${name}.mjs`);
    await writeFile(temp,embedded);
    const r=spawnSync(process.execPath,['--check',temp],{encoding:'utf8'});
    await unlink(temp).catch(()=>{});
    assert.equal(r.status,0,`${name} embebido no pasa node --check:\n${r.stderr}`);
  }
}
const vuelingWorker=await read(vuelingWorkerFile);
assert.match(vuelingWorker,/const WORKER_VERSION="1\.0\.23"/);
assert.match(vuelingWorker,/github-vueling-install/);
assert.match(vuelingWorker,/github-vueling-run/);
assert.match(vuelingWorker,/matches\.workflow/,'Worker Vueling debe validar también el workflow');
const vuelingMappings=[
  ['VUELING_FILE','monitoring/vueling.mjs',true],
  ['DEFAULT_CONFIG_FILE','monitoring/vueling-config.json',false],
  ['DEFAULT_WORKFLOW','.github/workflows/vueling-monitor.yml',false]
];
for(const [name,rel,isJs] of vuelingMappings){
  const embedded=extractStringConstant(vuelingWorker,name),canonical=await read(rel);
  assert.equal(embedded,canonical,`${name} no coincide exactamente con ${rel}`);
  if(isJs){const temp=path.join(root,`.validate-${name}.mjs`);await writeFile(temp,embedded);const r=spawnSync(process.execPath,['--check',temp],{encoding:'utf8'});await unlink(temp).catch(()=>{});assert.equal(r.status,0,`${name} embebido no pasa node --check:
${r.stderr}`);}
}
const vueling=await read('monitoring/vueling.mjs');
const flightops=await read('monitoring/flightops.mjs');
assert.match(vueling,/MFE_VUELING_AUTOMATION_VERSION:\s*1\.0\.20/);
assert.match(vueling,/normalizedCheckedBags/,'Vueling debe normalizar varias maletas individuales');
assert.match(vueling,/BAG_WEIGHTS=\[15,20,25,30\]/,'Vueling debe soportar 15, 20, 25 y 30 kg');
assert.match(vueling,/passenger5FirstName/,'Vueling debe admitir hasta cinco pasajeros');
assert.match(vueling,/for\(const passenger of passengers\)/,'Vueling debe aplicar equipaje por pasajero');
assert.match(app,/Maleta 3 · peso/,'La configuración debe ofrecer hasta tres maletas');
assert.match(app,/Pasajero 5 · Nombre/,'La configuración debe ofrecer hasta cinco pasajeros');
assert.match(app,/checkedBags/,'La app debe persistir la lista flexible de maletas Vueling');
assert.match(vueling,/gcbg-option-title/,'Equipaje de mano debe seleccionar por el título exacto de la opción');
assert.match(vueling,/underseatRowSelected/,'Equipaje de mano debe validar el estado visual real de Angular Material');
assert.match(vueling,/mdc-radio-touch-target/,'Equipaje de mano debe pulsar el control visible de Angular Material');
assert.match(vueling,/POR PASAJERO/,'Equipaje de mano debe verificar cada pasajero');
assert.match(vueling,/successfulResultToday/,'Vueling debe omitir un cron tardío si ya existe una comprobación correcta de hoy');
assert.match(vueling,/después de 3 intentos/,'Vueling debe reintentar el equipaje de mano antes de fallar');
assert.match(vueling,/07a-equipaje-mano-\$\{cardIndex\+1\}-reintento/,'Vueling debe guardar diagnóstico de los reintentos de equipaje');
assert.doesNotMatch(vueling,/getByText\(\/1 PIEZA DE EQUIPAJE DE MANO\/i\)\.first\(\)/,'No debe volver el selector ambiguo que confundía la opción de 2 piezas');
assert.match(vueling,/continueFareAndReachContact/,'Vueling debe pulsar CONTINUAR tras FLY LIGHT y esperar contacto');
assert.match(vueling,/guestAccessOverlayActive/,'Debe detectar el overlay de acceso como invitado');
assert.match(vueling,/cdk-overlay-backdrop-showing/,'Debe esperar a que desaparezca el backdrop antes de rellenar contacto');
assert.match(vueling,/clickContinueAsGuest/,'Debe pulsar el control real de continuar como invitado');
assert.match(vueling,/04b-despues-continuar-tarifa/,'Falta diagnóstico tras CONTINUAR de tarifa');
assert.match(vueling,/https:\/\/m\.vueling\.com\/SB/,'Debe usar el deeplink móvil oficial de Vueling');
assert.match(vueling,/searchParams\.set\('ofn'/,'Debe fijar el vuelo de ida');
assert.match(vueling,/searchParams\.set\('rfn'/,'Debe fijar el vuelo de vuelta');
assert.match(vueling,/TOTAL IDA/);assert.match(vueling,/TOTAL VUELTA/);assert.match(vueling,/TOTAL SERVICIOS/);assert.match(vueling,/PRECIO TOTAL/);
assert.match(vueling,/outboundTimeOk/,'Debe validar el horario de ida');assert.match(vueling,/returnTimeOk/,'Debe validar el horario de vuelta');
assert.match(vueling,/telegramNotifyPriceDrop/,'Debe contemplar Telegram por bajada');
assert.match(vueling,/onetrust-accept-btn-handler/,'Debe aceptar el banner real de cookies de Vueling');
assert.match(vueling,/waitForVuelingEntryPage/,'Debe detectar resultados o itinerario preseleccionado');
assert.match(vueling,/pageLooksLikePreselectedItinerary/,'Debe reconocer el itinerario preseleccionado del deeplink');
assert.match(vueling,/timeoutMs=130000/,'Debe tolerar la carga lenta observada en YourFlight');
assert.match(vueling,/textContent\(\)/,'Debe detectar el itinerario por textContent antes de la animación visible');
assert.match(vueling,/waitForFarePage/,'Debe esperar la pantalla de tarifas después de confirmar los vuelos');
assert.match(vueling,/selectRequestedFlights/,'Debe seleccionar ida y vuelta antes de FLY LIGHT');


const autoreisen=await read('monitoring/autoreisen.mjs');
assert.match(autoreisen,/MFE_AUTOREISEN_AUTOMATION_VERSION:\s*2\.2\.23/);
assert.match(autoreisen,/espere mientras se verifica/,'AutoReisen debe reconocer la nueva pantalla de verificación');
assert.match(autoreisen,/prepareAutoReisenContext/,'Falta preparar el contexto contra navigator.webdriver');
assert.match(worker,/disable-blink-features=AutomationControlled/,'El Worker debe instalar el lanzamiento reforzado de Chrome');
assert.match(autoreisen,/selectedVehicleImage/);
assert.match(autoreisen,/lightbox01\.php/,'El monitor debe aprovechar la ficha de imagen real de AutoReisen');
assert.match(autoreisen,/imageUrl,fleet/,'El resultado debe transportar la imagen');
assert.doesNotMatch(autoreisen,/pickupOfficeId:String\(config\.pickupOfficeId\|\|rec\|\|''\)/,'No debe quedar la referencia rec indefinida');

assert.match(vueling,/autocompleteValueMatches/,'Vueling debe respetar valores de autocomplete ya seleccionados');
assert.match(vueling,/inputValue\(\)/,'Vueling debe comprobar el prefijo autocompletado por país');
assert.match(vueling,/privacyPolicyDialogActive/,'Debe detectar el diálogo de Política de privacidad');
assert.match(vueling,/vy-privacy-policy-dialog/,'Debe localizar el componente real de privacidad de Vueling');
assert.match(vueling,/05d-privacidad-aceptada/,'Falta diagnóstico tras aceptar privacidad');
assert.doesNotMatch(vueling,/checkLabel\(page,\/política de privacidad\|acepto\.\*condiciones/,'No debe confundir consentimiento comercial con la política de privacidad');
assert.match(vueling,/CONTINUAR SIN/,'Debe reconocer el botón real de omitir asientos');
assert.match(vueling,/dismissSeatUpsell/,'Debe resolver el modal de confirmación de asientos');
assert.match(vueling,/sameHandBaggageAllPassengers/,'Debe poder aplicar el equipaje de mano a todos');
assert.match(vueling,/bags-selector-distinct/,'Debe soportar la pantalla móvil real de equipaje facturado');
assert.match(vueling,/Misma selección para todos/i,'Debe controlar el reparto por pasajero');
assert.match(vueling,/Mismo equipaje para ida y vuelta/i,'Debe controlar el reparto por trayecto');
assert.match(vueling,/CONTINUAR SIN AÑADIR MALETA/i,'Debe descartar el popup de segunda maleta');
assert.match(vueling,/checkedBagKg/,'Debe usar el peso de maleta configurado');
assert.match(vueling,/PREFIERO CONTINUAR SIN ASEGURAR MI VIAJE/i,'Debe reconocer la opción móvil de continuar sin seguro');
assert.match(vueling,/SIN SEGURO/,'Debe mantener fallback de escritorio a Sin seguro');
assert.match(vueling,/vy-insurances-card/,'Extras debe abrir expresamente la tarjeta Seguros cuando Vueling muestra Personalizar');
assert.match(vueling,/Tarjeta Seguros abierta desde Personalizar/,'Debe registrar la transición Personalizar → Seguros');
assert.match(vueling,/Total seguros/,'Debe reconocer la pantalla móvil real de seguros con total 0,00 €');
assert.match(vueling,/Seguros confirmados a 0,00 €/,'Debe confirmar la variante sin seguro mediante ACEPTAR');
assert.match(vueling,/returnFromInsuranceAndContinue/,'Debe volver de Seguros a Personalizar y continuar hacia Pago');
assert.match(vueling,/\\bPersonalizar\\b/,'Debe reconocer la pantalla móvil Personalizar como Extras aunque no cambie la URL');
assert.match(vueling,/openFinalSummary/,'Debe abrir el desglose final antes de extraer precios');
assert.match(vueling,/finalSummaryDomText/,'Debe leer el desglose final aunque esté colapsado');
assert.match(vueling,/booking-breakdown/,'Debe leer directamente booking-breakdown en Pago');
assert.match(vueling,/function labeledMoney/,'Falta helper labeledMoney para el resumen final');
assert.match(vueling,/function baggageMoney/,'Falta helper baggageMoney para el resumen final');
assert.match(vueling,/baggage-inside-leg-totals/,'Debe soportar el resumen de escritorio donde la maleta está incluida en cada trayecto');

const autoRender=app.match(/function renderAutoreisenTrackerCard[\s\S]*?function readAutoreisenControls/)?.[0]||'';
assert.doesNotMatch(autoRender,/<span>\$\{esc\(ref\.label\|\|'Reservado'\)\}<\/span>/,'AutoReisen no debe repetir Reservado/Pagado fuera del precio principal');
assert.doesNotMatch(autoRender,/<span>Diferencia<\/span>/,'AutoReisen no debe repetir Diferencia fuera del precio principal');
const cordialRender=app.match(/function renderCordialTrackerCard[\s\S]*?function requireCordialWorker/)?.[0]||'';
assert.doesNotMatch(cordialRender,/<span>\$\{esc\(ref\.label\|\|'Reservado'\)\}<\/span>/,'Cordial no debe repetir Reservado/Pagado fuera del precio principal');
assert.doesNotMatch(cordialRender,/<span>Diferencia<\/span>/,'Cordial no debe repetir Diferencia fuera del precio principal');

const cordial=await read('monitoring/cordial.mjs');
assert.match(cordial,/MFE_CORDIAL_AUTOMATION_VERSION:\s*2\.2\.12/);
assert.doesNotMatch(cordial,/\\const CORDIAL_FILE =/);


// v2.2.47 · corrección definitiva de tarjetas y etiquetas del histórico de compra.
assert.match(app,/function renderShoppingHistory\(\)/,'Falta página interna de Histórico de precios');
assert.match(app,/recordShoppingPriceSnapshot/,'Falta persistencia de snapshots de precios');
assert.match(app,/schedule:\["daily","every2days","manual"\]/,'Falta frecuencia diaria, cada 2 días o manual');
assert.match(app,/maybeRunAutomaticShoppingSync/,'Falta actualización automática de precios al abrir la app');
assert.match(app,/shoppingHistoryChangesMarkup/,'Falta resumen de cambios desde la última consulta');
assert.match(app,/shoppingProductsHistoryMarkup/,'Falta histórico por producto');
assert.match(app,/shoppingTotalsHistoryChart/,'Falta gráfico general por supermercado y total');
assert.match(app,/shopping-a6-page:not\(:first-child\)/,'El PDF debe iniciar cada supermercado en página nueva');
assert.match(app,/function editTrackerTitleIcon\(id\)/,'Falta personalización del icono de Seguimientos');
assert.match(app,/driveImage:true/,'Los iconos de Seguimientos deben admitir Google Drive');
assert.match(app,/titleIconFile/,'Los iconos de Seguimientos deben admitir archivo local');
assert.doesNotMatch(app,/stroke-dasharray="8 5"/,'Vueling debe usar líneas simples sin trazos discontinuos');
assert.match(app,/data-tracker-chart-tooltip/,'Faltan tooltips interactivos en los gráficos de Seguimientos');
assert.doesNotMatch(app,/class="cordial-chart-value"/,'Los gráficos de Seguimientos no deben mostrar cifras laterales del eje Y');
assert.match(css,/\.shopping-product-history-card/,'Falta CSS del histórico por producto');
assert.match(css,/\.tracker-title-icon-image/,'Falta CSS de iconos personalizados de Seguimientos');
assert.match(seed,/"priceTracking"/,'Falta configuración de histórico de compra en seed');
assert.match(seed,/"titleIconUrl": ""/,'Falta icono personalizable de Seguimientos en seed');
assert.match(css,/shopping-history-store-card\{[^}]*padding:16px 16px 14px/,'Las tarjetas por supermercado deben separar el contenido de las esquinas');
assert.match(css,/box-shadow:inset 0 3px 0 var\(--store-color\)/,'El borde de color debe ser interior y no invadir la cabecera');
assert.doesNotMatch(app,/bottomValueY/,'No debe existir la etiqueta inferior duplicada en euros del gráfico');
assert.match(app,/data-export-budget-pdf/,'Falta botón de exportación PDF en Presupuesto');
assert.match(app,/function generateBudgetPdf\(\)/,'Falta generación del PDF de Presupuesto');
assert.match(app,/function budgetPrintableShell\(title,body\)/,'Falta plantilla moderna del PDF de Presupuesto');
assert.match(app,/@page\{size:A4 portrait/,'El PDF de Presupuesto debe usar A4 vertical');
assert.match(app,/data-export-menu-pdf/,'Falta botón de exportación PDF en Menú');
assert.match(app,/function generateMenuPdf\(\)/,'Falta generación del PDF del Menú');
assert.match(app,/function menuPrintableShell\(title,body,columns\)/,'Falta plantilla moderna del PDF del Menú');
assert.match(app,/@page\{size:A4 landscape/,'El PDF del Menú debe usar A4 horizontal');
assert.match(app,/menu-pdf-frame\{width:285mm;height:198mm/,'El PDF del Menú debe ocupar el folio horizontal');


// v2.2.47 · refinado de PDF Presupuesto, Menú, Maletas y Lista de la compra.
assert.doesNotMatch(app,/Financial travel brief/,'El PDF de presupuesto no debe mostrar Financial travel brief');
assert.doesNotMatch(app,/const flightRows=\(state\.data\.cover\?\.flights/,'El PDF de presupuesto no debe generar un resumen de vuelos');
assert.doesNotMatch(app,/Taste plan ·/,'El PDF del menú no debe mostrar Taste plan');
assert.match(app,/budget-pdf-groups\{display:grid;grid-template-columns:repeat\(2/,'El presupuesto debe usar composición compacta a dos columnas');
assert.match(app,/suitcase-head:after/,'Las maletas deben usar el encabezado editorial amarillo/azul');
assert.match(app,/a6-head:after/,'La Lista de la compra debe usar el encabezado editorial azul/amarillo');
assert.match(app,/shoppingA6HeaderMarkup\('Lista de la compra',storeTotal\(store\)\)/,'Cada supermercado debe repetir el encabezado moderno en su propia hoja');


// v2.2.55 · Configuración simplificada y cuenta atrás.
assert.match(app,/coverHiddenBlocks/,'Falta visibilidad configurable de tarjetas de Portada');
assert.match(app,/data-cover-visible/,'Falta botón ojo para Portada');
assert.match(app,/data-tab-visible/,'Falta visibilidad integrada en navegación');
assert.match(app,/data-tab-icon-file/,'Falta cambio de icono integrado en navegación');
assert.doesNotMatch(app,/<h3>Pestañas visibles<\/h3>/,'Sobra el bloque independiente Pestañas visibles');
assert.doesNotMatch(app,/<h3>Iconos de las pestañas<\/h3>/,'Sobra el bloque independiente Iconos de las pestañas');
assert.match(app,/countdownShowSeconds/,'Falta opción para mostrar segundos');
assert.match(app,/data-cd-secs/,'La cuenta atrás no renderiza segundos opcionales');
assert.match(app,/function vuelingQuickLinkForDevice\(/,'Falta separación de enlaces Vueling por dispositivo');
assert.match(app,/https:\/\/tickets\.vueling\.com\/checkin\?c=es-ES/,'Check-in Vueling de escritorio debe fijar español');
assert.match(app,/https:\/\/tickets\.vueling\.com\/RetrieveBooking\.aspx\?culture=es-ES/,'Mis viajes Vueling de escritorio debe fijar español');
assert.match(css,/bottom:24px/,'El guardado flotante de escritorio debe anclarse abajo');

const index=await read('public/index.html');
const sw=await read('public/sw.js');
const readme=await read('README.md');
const workflow=await read('.github/workflows/mfe-mobile-deploy.yml');

// v2.2.52 · Carruseles: mismo orden que Configuración y ancho individual en PC.
assert.match(app,/data-settings-carousel-width/,'Falta control de ancho por carrusel en Configuración');
assert.match(app,/el orden de los carruseles en Configuración manda también en la Portada/,'Falta sincronización del orden de carruseles');
assert.match(css,/\.settings-carousel-width/,'Falta CSS del selector de ancho de carrusel');


// v2.2.53+ · Configuración y actualizador Windows.
assert.doesNotMatch(app,/\?'<[^'\n]*\$\{/, 'Hay una interpolación ${...} dentro de un fragmento HTML entre comillas simples; se mostraría literalmente en pantalla');
const updateBat=await read('ACTUALIZAR_MFE.bat');
assert.match(updateBat,/firebase deploy --only hosting:viajes/i,'El BAT debe desplegar Firebase Hosting');
assert.match(updateBat,/if exist "ACTUALIZAR_WORKERS\.bat"/i,'El BAT principal debe encadenar Workers solo cuando el ZIP incluya una actualización');
assert.match(updateBat,/Esta version no requiere actualizar Workers/i,'El BAT debe indicar claramente cuando no hay cambios de Workers');
assert.match(updateBat,/node scripts\\validate-release\.mjs/i,'El BAT debe validar la versión antes de desplegar');
const workersBat=await read('ACTUALIZAR_WORKERS.bat').catch(()=>null);
const workersPs1=await read('scripts/update-workers.ps1').catch(()=>null);
assert.ok(workersPs1,'Se conserva el script auxiliar de Workers como parte del proyecto, aunque esta release no lo ejecute');
assert.ok(workersBat,'El proyecto debe conservar ACTUALIZAR_WORKERS.bat');
assert.match(workersBat,/update-workers\.ps1/i,'ACTUALIZAR_WORKERS.bat debe ejecutar el actualizador de Cloudflare');
assert.match(workersPs1,/CLOUDFLARE_WORKER_v2_2_54\.js/,'El actualizador debe publicar Worker principal 2.2.54');
assert.match(workersPs1,/CLOUDFLARE_WORKER_VUELING_v1_0_23\.js/,'El actualizador debe publicar también Worker Vueling 1.0.23');
assert.match(worker,/WORKER_VERSION\s*=\s*"2\.2\.54"/,'El proyecto debe incluir Worker principal 2.2.54');
assert.match(worker,/resolveMobileUpload\(env,payload\.uploadId\)/,'La subida móvil debe reutilizar una sesión autenticada sin reverificar Firebase en cada bloque');
assert.match(worker,/mobileUploadLookupKey/,'Falta el índice seguro de sesiones temporales de subida');
assert.match(worker,/firebaseLookupToken/,'Falta el fallback rápido de validación de Firebase');
assert.match(vuelingWorker,/WORKER_VERSION="1\.0\.23"/,'El proyecto debe conservar Worker Vueling 1.0.23');


// v2.2.131 · Alojamiento unificado + continuidad de Tripadvisor ES y carruseles.
assert.match(app,/function spanishTripadvisorUrl\(/,'Falta la migración de Tripadvisor a la versión española');
assert.match(app,/url\.hostname="www\.tripadvisor\.es"/,'Tripadvisor debe abrir la versión .es');
assert.match(app,/function coverCarouselPlacement\(/,'Falta la ubicación configurable de carruseles');
assert.match(app,/legacyLodgingCarousel/,'Los carruseles antiguos Plano\/Instrucciones deben migrar al alojamiento');
assert.match(app,/function renderLodgingCarouselAccordion\(/,'Falta el desplegable de carrusel dentro de Alojamiento');
assert.match(app,/data-settings-carousel-placement/,'Falta el control para mover carruseles entre Portada y Alojamiento');
assert.match(app,/data-lodging-carousel-details/,'Falta persistencia de apertura del desplegable al navegar por el carrusel');
assert.match(css,/\.lodging-embedded-media/,'Falta CSS de carruseles integrados en Alojamiento');
assert.match(css,/Google, Tripadvisor y Booking en una fila/,'Falta el ajuste móvil de reseñas del alojamiento en una sola fila');
assert.match(app,/v2\.3\.16: el PDF de maletas se compone sobre una única hoja A4 vertical real/,'Falta la corrección de una sola página del PDF de maletas');
assert.match(app,/@page\{size:A4 portrait;margin:6mm\}/,'El PDF de maletas debe fijar una hoja A4 vertical');
assert.match(app,/\.suitcase-frame\{width:198mm;height:285mm;overflow:hidden/,'El PDF de maletas debe ocupar el ancho imprimible de A4 sin saltos');

assert.match(css,/\.settings-carousel-placement/,'Falta CSS del selector de ubicación de carruseles');
assert.match(app,/const lodgingMap=`<div class=\"lodging-map-section/,'La ubicación debe integrarse dentro de Alojamiento');
assert.match(app,/lodging-date-actions/,'Falta la fila de fechas y accesos rápidos del alojamiento');
assert.match(app,/lodging-quick-actions/,'Faltan los cinco accesos agrupados del alojamiento');
assert.doesNotMatch(app,/\n\s*map:`<section class=\"card cover-editable\"/,'El mapa no debe seguir como tarjeta independiente');
assert.match(css,/\.lodging-embedded-media:has\(\.lodging-carousel-details\[open\]\)/,'El desplegable abierto debe ocupar todo el ancho');
assert.match(css,/\.lodging-map-section/,'Falta CSS de ubicación integrada');
assert.match(app,/lodging-review-link booking-review-link/,'Booking debe tener una clase específica para controlar su tamaño visual');
assert.match(css,/\.booking-review-link\{width:126px!important;min-width:126px!important;max-width:126px!important;height:39px!important;min-height:39px!important/,'Booking debe conservar la compensación visual de 126×39 px en escritorio');

// v2.2.131 · títulos compactos y hexadecimal sin autocompletado durante edición.
assert.match(css,/\.budget-group-card \.section-title-label\{white-space:nowrap/,'Los títulos de Presupuesto deben mantenerse en una sola línea en escritorio');
assert.match(app,/Mientras se escribe o se borra, no se normaliza ni se autocompleta el texto/,'Falta edición libre del hexadecimal');
assert.match(app,/control\.dataset\.lastValidHex/,'Falta conservar el último hexadecimal válido');
assert.match(app,/if\(!applyCompleteHex\(true\)\)restoreLastValid\(\)/,'Un hexadecimal incompleto debe restaurar el último color válido al salir');


assert.match(app,/function purchaseTableDate\(value\)/,'Falta el formato compacto de fecha para Compra real');
assert.match(app,/formatDate\(value,\{day:"2-digit",month:"short"\}\)/,'Compra real debe ocultar el año en sus fechas');
assert.match(css,/\.purchases-table tbody td:first-child\{white-space:nowrap\}/,'Las fechas de Compra real deben permanecer en una sola línea');

assert.match(app,/function syncInstallManifest\(manifestUrl,manifest\)/,'Falta persistir el manifest dinámico mediante Service Worker');
assert.match(app,/dynamic-manifest\.webmanifest/,'El manifest dinámico debe usar una URL estable del mismo origen');
assert.match(sw,/SET_INSTALL_MANIFEST/,'El Service Worker debe aceptar el manifest de instalación dinámico');
assert.match(sw,/INSTALL_MANIFEST_CACHE/,'El Service Worker debe servir el manifest dinámico desde caché');
const installManifest=await read('public/manifest.webmanifest');
assert.doesNotMatch(installManifest,/"short_name"\s*:\s*"Viajes"/,'El manifest de respaldo no debe renombrar la app a Viajes');
assert.match(installManifest,/"short_name"\s*:\s*"GC 27"/,'El manifest de respaldo debe usar GC 27 como nombre seguro');
assert.match(app,/weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset/,'Open-Meteo debe solicitar amanecer y atardecer');
assert.match(app,/sunrise: data\.daily\?\.sunrise/,'La previsión debe conservar la hora de amanecer');
assert.match(app,/sunset: data\.daily\?\.sunset/,'La previsión debe conservar la hora de atardecer');
assert.match(app,/class="sun-times"/,'Las fichas diarias del tiempo deben mostrar amanecer y atardecer');
assert.match(css,/\.forecast-day \.sun-times/,'Falta el estilo de amanecer y atardecer en la previsión');
assert.match(worker,/FLIGHTOPS_AUTOMATION_VERSION = "1\.0\.3"/,'Falta versión de automatización de estado de vuelos 1.0.3');
assert.match(worker,/github-flightops-sync/,'Falta sincronización de FlightOps con GitHub');
assert.match(flightops,/MFE_FLIGHTOPS_AUTOMATION_VERSION: 1\.0\.3/,'FlightOps debe usar automatización 1.0.3');
assert.match(flightops,/strictCancel/,'FlightOps debe exigir evidencia estricta antes de marcar Cancelado');
assert.match(app,/ops\.statusVerified===true/,'La UI debe ocultar estados operativos no verificados');
assert.match(worker,/flightops-write/,'Falta persistencia de FlightOps en KV');
assert.match(worker,/flightops-read/,'Falta lectura de FlightOps desde la app');
assert.match(app,/function flightOpsStatusMarkup/,'Falta bloque operativo en las fichas de vuelo');
assert.match(app,/Aena directo · dato real/,'La UI debe identificar claramente los datos Aena en vivo');
assert.match(app,/respaldo, no en vivo/,'La UI debe diferenciar el respaldo guardado de los datos Aena en vivo');
assert.match(app,/function manageBoardingPassFiles/,'Falta gestor de tarjetas de embarque por pasajero');
assert.match(app,/boardingPasses:/,'Falta persistencia de copias de tarjetas de embarque');
assert.match(css,/\.flight-ops-strip/,'Falta CSS del estado operativo de vuelos');
assert.match(css,/\.boarding-pass-person-grid/,'Falta CSS del gestor de tarjetas de embarque');
const mobileWorkflow=await read('.github/workflows/mfe-mobile-deploy.yml');
assert.match(app,/github-mobile-release-upload/,'Falta subida del ZIP móvil mediante el Worker');
assert.match(app,/data-mobile-deploy-upload/,'Falta el botón de actualización desde Android');
assert.match(worker,/github-mobile-deploy-install/,'El Worker debe instalar el workflow móvil');
assert.match(worker,/github-mobile-release-upload/,'El Worker debe aceptar una release móvil');
assert.match(worker,/async function dispatchMobileDeployWorkflow/,'Falta el disparo workflow_dispatch estable');
assert.match(worker,/inputs=\{request_id:String\(requestId\)\}/,'El workflow_dispatch debe transportar request_id');
assert.match(app,/Workflow lanzado · esperando GitHub/,'La app debe volver al seguimiento inmediatamente después de que el Worker acepte el workflow');
assert.match(app,/data-mobile-deploy-progress-host/,'La app debe mantener visible el progreso del actualizador');
assert.match(mobileWorkflow,/workflow_dispatch:/,'El workflow móvil debe poder ejecutarse manualmente');
assert.doesNotMatch(mobileWorkflow,/repository_dispatch:/,'El workflow móvil estable no debe depender de repository_dispatch');
assert.match(worker,/triggerMode:'workflow_dispatch'/,'El Worker debe lanzar la actualización mediante workflow_dispatch');
assert.match(app,/if\(!result\?\.workflowTriggered\)/,'La app debe exigir confirmación de que el Worker lanzó GitHub Actions');
assert.match(app,/const requestId=String\(result\.requestId\|\|'\'\)\.trim\(\)/,'La app debe usar el requestId devuelto por el flujo estable');
assert.match(mobileWorkflow,/update-workers-ci\.mjs/,'El workflow móvil debe actualizar Workers mediante el script CI');
assert.match(mobileWorkflow,/firebase-tools@latest deploy --only hosting:viajes/,'El workflow móvil debe publicar Firebase Hosting');
assert.match(app,/Pulsa «Guardar archivos» para confirmar/,'El gestor debe distinguir selección de guardado en gestores sin autoguardado');

// v2.2.150 · Accesos rápidos de tarjetas con resaltado y Check-in auto desactivable cuando ya existen las dos tarjetas guardadas.
assert.match(app,/const prepareSelected=async selected=>\{[\s\S]*importDriveFile\(item,storageFolder\)[\s\S]*driveLinkSelections\(\[item\]\)/,'Drive debe intentar copia estable y conservar el enlace como fallback');
assert.match(app,/includeToken:false,sharedDrives,title:/,'El gestor de archivos no debe pedir un token extra al aceptar la selección de Drive');
assert.match(app,/function mobileDeployProgressMarkup\(/,'Falta el panel de progreso de actualización móvil');
assert.match(app,/github-mobile-deploy-run-status/,'La app debe consultar el progreso de GitHub Actions');
assert.match(worker,/async function mobileDeployRunStatus\(/,'El Worker debe exponer el estado de la ejecución móvil');
assert.match(worker,/event=workflow_dispatch/,'El seguimiento móvil debe buscar ejecuciones workflow_dispatch');
assert.match(app,/function hasAllStoredBoardingPasses\(flight=\{\}\)/,'Falta el detector de tarjetas de embarque guardadas');
assert.match(app,/Check-in desactivado\./,'La app debe explicar por qué Check-in queda desactivado cuando ya hay tarjetas');
assert.match(app,/wallet-pass-btn\$\{hasFiles\?' is-ready':' is-available'\}/,'Los accesos rápidos M\/N deben cambiar de estado visual según haya archivo guardado');
assert.match(app,/\$\$\('\[data-settings-panel\]'\)\.forEach/,'La navegación interna de Configuración debe enlazar todos los botones laterales');
assert.match(css,/color-mix\(in srgb,var\(--service-color\) 72%/,'Los botones M/N deben heredar exactamente el color Vueling');
assert.match(app,/activeBoardingPassKeys\(\)\.map\(\(person,i\)=>walletPassButtonMarkup\(flight,index,person/,'Las tarjetas deben mostrarse para todos los viajeros activos');
assert.match(app,/data-panel="updates"/,'Actualización app debe tener un panel independiente');
assert.match(app,/function registerDeviceAuth\(\)/,'Falta el alta WebAuthn del dispositivo');
assert.match(app,/navigator\.credentials\.create/,'WebAuthn debe registrar una credencial con el autenticador del dispositivo');
assert.match(app,/navigator\.credentials\.get/,'WebAuthn debe verificar el desbloqueo con el dispositivo');
assert.match(app,/authenticatorAttachment:'platform'/,'La credencial debe preferir el autenticador de plataforma');
assert.match(app,/userVerification:'required'/,'El desbloqueo del dispositivo debe exigir verificación de usuario');
assert.match(app,/residentKey:'discouraged'/,'La credencial local debe evitar el modo residente\/sincronizable');
assert.match(app,/hints:\['client-device'\]/,'WebAuthn debe preferir este dispositivo');
assert.match(app,/transports:\['internal'\]/,'La autenticación debe limitarse al transporte interno');
assert.match(app,/DEVICE_AUTH_MODE='platform-local-v2'/,'Las credenciales antiguas deben migrar al modo local reforzado');
assert.match(app,/DEVICE_AUTH_KEY_PREFIX/,'La credencial WebAuthn debe guardarse por dispositivo/usuario');
assert.match(app,/Huella \/ bloqueo del dispositivo/,'Falta la sección de biometría en Acceso');

assert.match(app,/github-tracker-run-status/,'La app debe consultar pasos de GitHub Actions para seguimientos');
assert.match(app,/data-tracker-summary-refresh/,'Los cuadros resumen deben incluir actualización directa');
assert.match(app,/const actions=\{autoreisen:runAutoreisenNow,cordial:runCordialNow,vueling:runVuelingNow\}/,'La actualización rápida debe lanzar cada seguimiento correcto');
assert.match(worker,/async function trackerRunStatus\(/,'El Worker principal debe exponer progreso de seguimientos');
assert.match(app,/function runUpdateDiagnostics\(/,'Falta diagnóstico previo de actualización');
assert.match(app,/setMobileDeployClientPhase\('1\/4 · Leyendo ZIP'/,'La subida móvil debe mostrar progreso desde la lectura del ZIP');
assert.match(app,/Diagnóstico con avisos · actualización permitida/,'El diagnóstico debe distinguir avisos no bloqueantes');
assert.doesNotMatch(app,/preflightWarnings/,'La subida del ZIP no debe depender del resultado del diagnóstico');
assert.doesNotMatch(app,/toast\('Ejecutando diagnóstico previo…'\)/,'La subida del ZIP no debe ejecutar diagnóstico previo automáticamente');
assert.match(vuelingWorker,/GitHub ha rechazado GITHUB_TOKEN del Worker Vueling/,'Vueling debe diagnosticar HTTP 401 de GitHub');
const releaseVersion=readme.match(/v(\d+\.\d+\.\d+)/)?.[1];
assert.match(app,/function checkedLastIndexed\(items=\[\]\)/,'Falta el orden visual de elementos marcados al final');
assert.match(app,/function suitcaseCheckedLastEntries\(entries=\[\]\)/,'Maletas debe mantener preparados al final dentro de cada subgrupo');
assert.match(app,/suitcaseCheckedLastEntries\(bucket\.items\)/,'Los subgrupos de Maletas deben mostrar preparados al final');
assert.match(app,/checkedLastIndexed\(store\.products\)/,'Lista de la compra debe mostrar comprados al final sin alterar el orden guardado');
assert.match(app,/function darkMaskableInstallIcon\(source\)/,'Falta generador de icono maskable oscuro para Android');
assert.match(app,/purpose:"maskable"/,'El manifiesto dinámico debe publicar icono maskable');
assert.match(app,/fill=\"#111318\"/,'El icono maskable personalizado debe usar fondo oscuro');
assert.ok(/^\d+\.\d+\.\d+$/.test(String(releaseVersion||'')),'README debe declarar una versión semántica vX.Y.Z');
assert.match(worker,/waitForGithubBranchCommit/,'El Worker debe esperar a que GitHub publique el commit nuevo antes de lanzar Actions');
assert.match(worker,/verifyGithubReleaseAtCommit/,'El Worker debe comprobar el ZIP exacto en el commit recién creado');
assert.match(worker,/setTimeout\(resolve,1200\)/,'Falta el margen anti-race antes de workflow_dispatch');
assert.match(workflow,/ref: \${{ github\.ref_name }}/,'El workflow móvil debe resolver explícitamente la rama actual al hacer checkout');

assert.match(app,/function printableIconMarkup\(/,'Falta soporte de iconos PNG en PDFs');
assert.match(app,/--group-title-text/,'El PDF de maletas debe respetar el color del texto del título');
assert.match(app,/suitcase-group-title-icon/,'El PDF de maletas debe imprimir los iconos configurados');
assert.match(app,/suitcase-subgroup-title-icon/,'El PDF de maletas debe imprimir iconos de subgrupos');
assert.match(app,/iconUrl:String\(subgroup\?\.iconUrl/,'Los subgrupos deben conservar iconos PNG');
assert.match(app,/budget-pdf-group-icon-image/,'El PDF de Presupuesto debe usar iconos PNG de grupo');
assert.match(app,/fileToRawBase64\(file\)/,'El actualizador estable debe leer el ZIP una sola vez');
assert.match(worker,/verifyFirebaseUserMobileStable/,'El Worker debe usar la validación Firebase estable para el actualizador móvil');
assert.match(app,/data-cd-days-unit/,'La cuenta atrás debe poder ocultar el bloque de días');
assert.match(app,/daysUnit\.hidden=days===0/,'El contador debe ocultar Días dinámicamente al llegar a 0');
assert.doesNotMatch(app,/let health=null;[\s\S]*fetchIntegrationHealth\(\{timeoutMs:18000\}\)/,'El actualizador no debe bloquearse con un preflight de Cloudflare antes de subir');
assert.match(app,/settings-canary-popup/,'Los popups abiertos desde Configuración deben activar el tema canario');
assert.match(css,/modal\.settings-canary-popup \.btn\.primary/,'Falta el degradado canario en botones principales de popups de Configuración');
assert.match(app,/data-device-auth-create-now>👆 Activar ahora<\/button>/,'Falta el botón de activación biométrica');
assert.match(app,/function editSuitcaseSubgroup\(key,groupIndex,subgroupId=null\)/,'Falta editor de subgrupos en Maletas');
assert.match(app,/data-add-suitcase-subgroup/,'Falta acción para crear subgrupos en Maletas');
assert.match(app,/subgroupId/,'Los elementos de Maletas deben poder pertenecer a un subgrupo');
assert.match(app,/submitClass:'canary-action'/,'El desbloqueo de edición debe usar el botón canario');
assert.match(css,/\.btn\.canary-action/,'Falta estilo canario del botón de desbloqueo');
assert.match(app,/data-suitcase-check[\s\S]*?saveSection\('suitcases'\)/,'El marcado de maletas debe guardarse sin perder la posición');
assert.match(app,/pageSubtitle\.textContent=`\$\{done\} de \$\{total\} elementos preparados`/,'El marcado de maletas debe actualizar el progreso sin rerender completo');
assert.match(app,/function reorderSuitcaseChecklist\(list\)/,'Falta la reordenación local de preparados al final');
assert.match(app,/data-uncheck-suitcase-group/,'Falta el botón Desmarcar todas al pie de cada bloque de maleta');
assert.match(app,/group\.items\|\|\[\]\)\.forEach\(item=>\{item\.checked=false;\}\)/,'Desmarcar todas debe limpiar el estado de todos los elementos del bloque');

// v2.3.18 · visibilidad individual en Transportes y vuelos.
assert.match(app,/function coverJourneyVisibilityKey\(kind,item=\{\},index=0\)/,'Falta clave estable de visibilidad por autobús/vuelo');
assert.match(app,/data-cover-hide=\"\$\{esc\(key\)\}\"/,'Cada transporte debe tener su propio botón de ocultar');
assert.match(app,/filter\(row=>!hidden\.has\(row\.key\)\)/,'El render de transportes debe filtrar cada elemento individualmente');
assert.match(app,/for\(const entry of coverJourneyVisibilityEntries\(\)\)if\(hiddenSet\.has\(entry\.key\)\)push\(entry\.key\)/,'Elementos ocultos debe listar transportes individuales');
assert.match(app,/if\(!canEdit\(\)\|\|id==='flights'\|\|id==='documents'\)return ''/,'No debe existir ojo global para Transportes y vuelos ni Documentos y reservas');
assert.match(app,/coverKeys\.filter\(id=>id!==\'flights\'&&id!==\'documents\'\)/,'La normalización debe retirar los ocultados globales heredados de Transportes y vuelos y Documentos y reservas');

// v2.3.23 · Presupuesto: Autobús aeropuerto conserva el color del trayecto.
assert.match(app,/function syncBudgetBusHeaderVisual\(data=\{\},sourceBus=null\)/,'Falta la sincronización visual del grupo Autobús aeropuerto');
assert.match(app,/if\(syncBudgetBusHeaderVisual\(normalized\)\)pendingBudgetBusVisualMigration=true/,'La migración debe corregir el azul legado del grupo de autobús');
assert.match(app,/const titleGradient1=headerBus\?\(headerBus\.gradient1\|\|headerBus\.color/,'El título de Autobús aeropuerto debe renderizar con el degradado real del trayecto');
assert.match(app,/const budgetVisualChanged=syncBudgetBusHeaderVisual\(state\.data,value\)/,'Editar el autobús debe sincronizar el título de Presupuesto');
assert.match(app,/if\(value\.id==='g-bus'\)/,'Editar el grupo Autobús aeropuerto debe sincronizar los colores de vuelta al trayecto');

// v2.3.21 · Tarjetas de embarque: Drive se guarda como referencia inmediata.
assert.match(app,/manageBoardingPassFiles[\s\S]*?storeDriveLinks:true/,'Las tarjetas de embarque deben guardar referencias de Drive sin re-subir a Storage');

// v2.3.20 · Compra real: guardado y OCR con identidad Gran Canaria.
assert.match(app,/purchase-ocr-actions/,'Falta el grupo de acciones OCR de Compra real');
assert.match(app,/ocr-review-actions/,'Falta el grupo de guardado de revisión OCR');
assert.match(app,/data-purchase-ocr>Hacer OCR/,'Falta la acción Hacer OCR');
assert.match(css,/\.purchase-ocr-actions \[data-purchase-ocr\]/,'Hacer OCR no fuerza el degradado canario');
assert.match(css,/\.ocr-review-actions \.canary-save-btn/,'Guardar compra tras OCR no fuerza el degradado canario');

// v2.3.19 · visibilidad individual en Documentos y reservas.
assert.match(app,/function budgetConceptIconKey\(value=''\)/,'Falta la clave normalizada de memoria de iconos por concepto');
assert.match(app,/function mergedBudgetConceptIconMemory\(data=\{\}\)/,'Falta la reconstrucción de iconos desde viaje activo e Histórico');
assert.match(app,/bindBudgetConceptIconMemoryForm/,'Los formularios de gastos deben recuperar iconos ya guardados');
assert.match(app,/state\.data\.budget\.conceptIconMemory=mergedBudgetConceptIconMemory\(state\.data\)/,'Archivar viaje debe conservar la memoria de iconos antes del reseteo');
assert.match(css,/file-button-list \.link-btn[\s\S]*text-align:left!important/,'Los archivos de Reservas y documentos deben alinear a la izquierda los títulos largos');
assert.match(app,/function coverDocumentVisibilityKey\(doc=\{\},index=0\)/,'Falta clave estable de visibilidad por ficha documental');
assert.match(app,/coverDocumentHideButton\(doc,index\)/,'Cada ficha documental debe tener su propio botón de ocultar');
assert.match(app,/visibleCoverDocuments=.*filter\(entry=>!coverHiddenSet\.has\(entry\.key\)\)/,'El render de documentos debe filtrar cada ficha individualmente');
assert.match(app,/for\(const entry of coverDocumentVisibilityEntries\(\)\)if\(hiddenSet\.has\(entry\.key\)\)push\(entry\.key\)/,'Elementos ocultos debe listar fichas documentales individuales');
assert.match(app,/individual=id==='flights'\|\|id==='documents'/,'Configuración debe marcar Documentos y reservas como visibilidad individual');
assert.match(app,/reorderSuitcaseChecklist\(checklist\);[\s\S]*?saveSection\('suitcases'\)/,'Al marcar una maleta debe reordenar el bloque sin render completo');
assert.match(app,/function openMobileReleasePicker\(\)/,'Falta el selector ZIP directo para Android');
assert.match(app,/data-mobile-deploy-file/,'Falta el input persistente de actualización móvil');
assert.match(app,/processMobileReleaseFile/,'Falta el procesado del ZIP seleccionado');
// v2.3.23 · pestaña Alojamiento y guía del resort.
assert.match(app,/\["lodging","🏨","Alojamiento"\]/,'Falta la pestaña principal Alojamiento');
assert.match(app,/function renderLodgingPage\(\)/,'Falta la vista consolidada de Alojamiento');
assert.match(app,/guestGuideUrl/,'Falta el enlace configurable a la guía del resort');
assert.match(app,/Piscinas y servicios/,'Falta el bloque de piscinas y servicios');
assert.match(app,/github-pools-run/,'El botón de piscinas debe lanzar el monitor real por GitHub Actions');
assert.match(app,/action:'pools'/,'La app debe leer las piscinas desde el Worker principal');
assert.match(app,/poolLatestMeasurement/,'La tarjeta de piscina debe usar la última medición real como resumen');
assert.match(app,/poolMeasurementTemperatureForChart/,'El gráfico de piscinas debe leer la temperatura desde las métricas cuando no exista el campo normalizado');
assert.match(app,/poolTemperatureValue\(pool,latest\)/,'El histórico de piscinas debe usar la misma resolución de temperatura que las fichas');
assert.match(app,/action:'webcam'/,'Las webcams deben consultar primero el Worker principal');
assert.match(worker,/payload\.action === "webcam"/,'El Worker principal debe resolver webcams');
assert.match(css,/lodging-page-section>\.section-title\{border-radius:/,'Los títulos de Alojamiento deben conservar esquinas redondeadas');
assert.match(worker,/poolsControl:true/,'El Worker debe anunciar el canal de piscinas');
assert.match(worker,/github-pools-run/,'El Worker debe poder lanzar el workflow de piscinas');
assert.match(worker,/POOLS_AUTOMATION_VERSION\s*=\s*"1\.0\.4"/,'Falta la automatización de piscinas 1.0.4');

assert.match(app,/if\(!normalized\.settings\.enabledTabs\.includes\("lodging"\)\)/,'La migración debe activar Alojamiento en datos persistidos');
assert.match(seed,/cordial\.galileus\.es\/gweb\/siloe\/diario/,'Falta la guía de huésped de Cordial en los datos base');

assert.ok(index.includes(`styles.css?v=${releaseVersion}-r1`),'styles.css no coincide con la versión');
assert.ok(index.includes(`app.js?v=${releaseVersion}-r1`),'app.js no coincide con la versión');
assert.ok(sw.includes(`mfe-viajes-v${releaseVersion}-r1`),'Service Worker no coincide con la versión');
assert.ok(index.includes(`GC 27 · v${releaseVersion}`),'Footer no coincide con la versión');
assert.doesNotMatch(index,/Modo oscuro permanente/,'El footer ya no debe mostrar Modo oscuro permanente');
assert.ok(app.includes(`const APP_VERSION = "${releaseVersion}";`),'APP_VERSION no coincide con la versión');
assert.match(index,/id="login-app-name">GC 27</,'El login debe mostrar GC 27 antes de iniciar sesión');
assert.match(index,/icons\/gc27-logo\.png/,'El login debe tener el logo GC 27 disponible sin sesión');
assert.match(index,/legacyDefault/,'Falta migración del fallback antiguo MFE Viajes + avión');
assert.match(app,/DEFAULT_APP_IDENTITY = Object\.freeze\(\{ name:"GC 27", icon:"27", iconUrl:"\.\/icons\/gc27-logo\.png" \}\)/,'La identidad pública por defecto debe ser GC 27');
assert.match(app,/function isIdentityImageSource\(url=""\)/,'Falta soporte para logos empaquetados con ruta relativa en el login');
assert.match(app,/source!==bundledFallback/,'El logo del login debe caer al PNG GC 27 antes que al texto');
assert.doesNotMatch(app,/uploadMobileReleaseDirect\(/,'No debe mantenerse la capa intermedia que se quedó bloqueada en v2.2.200');
assert.match(app,/action:'github-mobile-release-upload-init'/,'El actualizador móvil debe iniciar una subida por bloques');
assert.match(app,/action:'github-mobile-release-upload-chunk'/,'El actualizador móvil debe enviar bloques pequeños');
assert.match(app,/action:'github-mobile-release-upload-finalize'/,'El actualizador móvil debe ensamblar el ZIP y lanzar GitHub');
assert.match(app,/const chunkSize=320000/,'El tamaño de bloque móvil debe mantenerse contenido para Android');
assert.match(app,/header-year-blue/,'Falta el 20 azul de la cabecera');
assert.match(app,/header-year-yellow/,'Falta el 26 amarillo de la cabecera');
assert.match(css,/#header-destination \{ color: #fff/,'Gran Canaria debe volver a mostrarse en blanco');
assert.match(css,/#header-year \.header-year-blue \{ color: var\(--gc-flag-blue\)/,'El 20 debe mostrarse en azul de la bandera');
assert.match(css,/#header-year \.header-year-yellow \{ color: var\(--gc-flag-yellow\)/,'El 26 debe mostrarse en amarillo de la bandera');
assert.match(app,/function trackerSummaryUpdatedLabel\(id\)/,'Falta el texto de última actualización en las pastillas de Seguimientos');
assert.match(app,/tracker-summary-updated/,'La fecha de última actualización debe mostrarse junto al botón de refresco en Seguimientos');
assert.match(css,/color: var\(--title-text,#fff\)/,'Las cabeceras deben admitir color de texto configurable');
assert.match(app,/Color del texto del título/,'Faltan selectores de color de texto en cabeceras personalizables');
assert.match(app,/--title-text:\$\{esc\(group\.textColor/,'Presupuesto debe aplicar el color de texto configurado');
assert.match(app,/--title-text:\$\{esc\(store\.textColor/,'Lista de la compra debe aplicar el color de texto configurado');
assert.match(app,/--tracker-title-text/,'Seguimientos debe aplicar el color de texto configurado');
assert.match(app,/--subgroup-text/,'Los subgrupos de Maletas deben admitir color de texto');
assert.match(app,/section-\$\{key\}-textColor/,'Diseño debe permitir configurar el color de texto por tipo');
assert.doesNotMatch(app,/Preflight Worker no disponible; se intentará la subida directamente/,'El actualizador ya no debe hacer un preflight bloqueante de Cloudflare');
assert.match(app,/title:"Vueling"/,'El seguimiento de Vueling debe llamarse solo Vueling');
assert.match(app,/normalized\.trackers\.vueling\.title='Vueling'/,'Falta migración del título antiguo de Vueling');
assert.doesNotMatch(app,/await waitForMobileDeployRunConfirmation\(/,'La subida no debe bloquear la interfaz esperando un runId de GitHub');
assert.match(app,/data-mobile-deploy-trigger/,'Falta botón de reintento del workflow móvil');
assert.doesNotMatch(app,/closest\?\.\('\.integration-center'\)/,'Los botones Comprobar no deben quedar limitados al Centro de integraciones');
assert.match(app,/data-test-price-worker/,'Debe existir la prueba del Worker principal en Configuración');
assert.match(worker,/github-mobile-deploy-trigger/,'El Worker debe permitir relanzar GitHub Actions sin volver a subir el ZIP');
assert.match(worker,/dispatchMobileDeployWorkflow\(target,env,requestId\)/,'El Worker debe usar workflow_dispatch como en la versión estable');
assert.match(app,/suitcase-overall-progress/,'Falta la barra de progreso total de cada maleta');
assert.match(app,/data-transfer-suitcase-item/,'Falta el icono Mover a en los elementos de maleta');
assert.match(app,/function openSuitcaseMoveDialog/,'Falta el diálogo para mover elementos entre maletas');
assert.match(css,/scroll-snap-type:x mandatory/,'Los bloques de maleta deben usar carrusel táctil con scroll snap en móvil y tablet');
assert.match(app,/function captureSuitcaseViewPosition\(\)/,'Falta capturar la posición de Maletas antes de bloquear o desbloquear');
assert.match(app,/function restoreSuitcaseViewPosition\(snapshot\)/,'Falta restaurar la posición de Maletas después del render');
assert.match(app,/renderKeepingSuitcasePosition\(suitcasePosition\)/,'El desbloqueo de edición debe mantener bloque y posición vertical de Maletas');
assert.match(css,/scroll-snap-stop:always/,'El carrusel de maletas debe detenerse bloque a bloque');
const manifest=JSON.parse(await read('public/manifest.webmanifest'));
assert.equal(manifest.name,'GC 27','El manifiesto PWA debe llamarse GC 27');
assert.equal(manifest.short_name,'GC 27','El nombre corto PWA debe ser GC 27');
assert.match(css,/--mfe-brand-blue:\s*#2382d7/,'Falta azul exacto de la franja Canaria');
assert.match(css,/--mfe-brand-white:\s*#ffffff/,'Falta blanco exacto de la franja Canaria');
assert.match(css,/--mfe-brand-yellow:\s*#f6d43b/,'Falta amarillo exacto de la franja Canaria');
assert.match(css,/--gc-flag-blue:\s*#1047ae/,'Falta azul de la bandera de Gran Canaria');
assert.match(css,/--gc-flag-yellow:\s*#fcdd09/,'Falta amarillo de la bandera de Gran Canaria');
assert.match(css,/--mfe-canary-gradient:[^;]+;/,'Falta degradado Canaria azul → amarillo');
assert.match(css,/progress-bar span[^{]*\{[^}]*group-color/s,'Maletas y compras deben conservar el color propio de cada grupo');
assert.match(css,/tracker-run-progress \.mobile-deploy-progress-bar>span\{background:var\(--mfe-canary-gradient\)/,'El progreso de seguimientos debe usar el degradado Canaria');
assert.match(css,/ocr-progress span[^{]*\{[^}]*var\(--mfe-canary-gradient\)/s,'Las cargas OCR deben usar el degradado Canaria');
assert.match(app,/btn primary[^>]*data-mobile-deploy-upload/,'Seleccionar ZIP debe recuperar el botón principal original');
assert.match(app,/btn secondary[^>]*data-update-diagnostics/,'Diagnóstico debe recuperar el estilo original');
assert.match(app,/btn secondary[^>]*data-mobile-deploy-prepare/,'Preparar GitHub debe recuperar el estilo original');
assert.match(app,/btn secondary[^>]*data-mobile-deploy-progress-refresh/,'Progreso debe recuperar el estilo original');
assert.match(app,/function countdownTargetDateTime\(\)/,'Falta el objetivo configurable de la cuenta atrás');
assert.match(app,/countdownEndDateTime/,'Falta el campo de momento final de la cuenta atrás');
assert.match(seed,/\"countdownEndDateTime\": \"\"/,'Seed debe incluir countdownEndDateTime vacío para mantener compatibilidad');
assert.match(app,/function requestDriveBrowserAccountTokenFromClick\(\)/,'Falta el flujo directo de cambio de cuenta de Drive');
assert.match(app,/client\.requestAccessToken\(\{prompt:'select_account'\}\)/,'El cambio de cuenta de Drive debe abrir Google directamente desde el clic');
assert.doesNotMatch(app,/await chooseDriveBrowserAccount\(\)/,'El selector de cuenta no debe esperar operaciones asíncronas antes de abrir OAuth');

assert.match(app,/useGrouping:"always"/,'El formato numérico español debe forzar separador de millares incluso en cuatro cifras');
assert.match(app,/minimumFractionDigits:2[\s\S]*maximumFractionDigits:2/,'Los importes deben mostrar siempre dos decimales');
assert.match(app,/new Intl\.NumberFormat\("es-ES"/,'Los importes deben usar formato español es-ES');

assert.match(app,/async function stabilizeLegacyBusDriveVisuals\(/,'Falta migración automática de iconos de autobús desde Drive');
assert.match(app,/Iconos del autobús guardados de forma permanente/,'Falta confirmación de independencia de iconos del autobús');
assert.match(app,/Persistencia pendiente · Drive disponible al autorizar/,'Drive debe distinguir falta de persistencia de indisponibilidad total');
assert.match(app,/DRIVE_SESSION_TOKEN_KEY/,'Drive debe conservar el token temporal durante la pestaña');
assert.match(app,/Activar persistencia/,'Drive debe ofrecer activar persistencia cuando proceda');
assert.match(app,/Temporal\$\{status\?\.email/,'Drive debe identificar visualmente la sesión temporal');
assert.match(app,/function bindIntegrationDelegatedActions\(\)/,'Falta delegación global para los botones del Centro de integraciones');
assert.match(app,/data-integration-test/,'Faltan los botones de comprobación de integraciones');
assert.match(app,/⏳ Comprobando…/,'Falta feedback inmediato en las comprobaciones de integraciones');
assert.match(app,/Cloudflare Worker ha tardado demasiado en responder/,'Falta timeout visible para el diagnóstico de Cloudflare');

assert.match(app,/function coverBudgetDonut\(/,'Falta el gráfico circular de Pagado\/Por pagar en Portada');
assert.match(app,/kpi-with-chart/,'Las tarjetas Pagado\/Por pagar deben incluir gráficos circulares');
assert.match(css,/\.kpi-chart-ring/,'Falta CSS del gráfico circular de presupuesto en Portada');
assert.match(app,/documentFiles:normalizeFileList\(/,'Falta colección independiente de documentos del autobús');
assert.match(app,/function manageBusDocumentFiles\(/,'Falta gestor independiente para documentos del autobús en Portada');
assert.match(app,/bus\.documentFiles=normalizeFileList\(files\)/,'Los documentos de Portada del autobús deben guardarse aparte de Presupuesto');
assert.match(app,/files:bus\.files\|\|\[\]/,'Presupuesto debe seguir usando los adjuntos propios del autobús');
assert.match(app,/async function callIntegrationWorker\(payload=\{\}, \{timeoutMs=15000,authenticated=true,token='\'\}=\{\}\)/,'Las integraciones deben tener timeout para no bloquear Google Drive');
assert.match(app,/const statusRefreshPromise=state\.provider instanceof LocalProvider/,'El selector de Drive debe comprobar la sesión en paralelo');
assert.match(app,/statusRefreshPromise\.then\(\(\)=>\{if\(!settled\)render\(\);\}\)/,'El navegador de Drive debe refrescar estado sin bloquear su apertura');
assert.match(app,/Google Drive necesita renovar el permiso para navegar por carpetas/,'Falta error explícito para renovar permisos de Drive');
assert.doesNotMatch(app,/toast\('Activando el selector táctil de Google Drive…'\)/,'Drive no debe abrir OAuth automáticamente desde un 403 asíncrono');

assert.match(app,/transport-kicker\">Autobús/,'Falta la categoría AUTOBÚS en las tarjetas de Portada');
assert.match(app,/transport-kicker\">Vuelo/,'Falta la categoría VUELO en las tarjetas de Portada');
assert.match(css,/lodging-card\.provider-gradient-card\{[^}]*border-top:4px solid var\(--lodging-color/,'Falta el borde superior de color en Alojamiento');
assert.match(app,/settings-floating-save/,'Falta el botón flotante de guardado en Configuración');
assert.match(app,/settings-floating-save is-visible/,'El botón flotante debe renderizarse visible desde el inicio de Configuración');
assert.match(app,/data-settings-save-note/,'Falta el estado visual del guardado flotante');
assert.match(app,/function manageBusLinkedDocumentFiles/,'Falta sincronización de billetes de autobús con Reservas y documentos');
assert.match(app,/busDocumentFiles/,'La ficha documental de autobús debe reutilizar los archivos del trayecto');
assert.match(app,/const documentIconUrl=linkedBus\?busIdentityVisualUrl/,'La ficha Autobús debe usar el icono actual del trayecto');
assert.match(app,/if\(!buses\.length\)combined\.push\(\.\.\.\(doc\.files\|\|\[\]\)\)/,'Las fichas enlazadas a autobús no deben mezclar pseudoarchivos propios con los billetes');
assert.match(css,/\.budget-col-actions\{width:124px\}/,'La columna de acciones de Presupuesto debe reservar ancho suficiente para el autobús');

assert.match(app,/function setSettingsDirty\(/,'Falta control de cambios pendientes en Configuración');
assert.match(app,/driveImageSelectionToDataUrl/,'Falta conversión estable de iconos Drive a PNG embebido');
assert.match(app,/driveImageSize:128/,'Los iconos del autobús deben usar conversión Drive 128x128');
assert.match(app,/stabilizeDriveIconUrl/,'Falta migración de enlaces Drive antiguos en iconos de autobús');
assert.match(app,/return resilientImageMarkup\(iconUrl,className,fallback,false\)/,'Los iconos de servicio deben desactivar el visor de imágenes');
assert.match(app,/data-resilient-no-popup=\"1\"/,'Falta el marcador que evita interceptar enlaces con iconos');

assert.match(app,/bindSettingsDirtyTracking/,'Falta seguimiento de cambios de los formularios de Configuración');
assert.match(css,/\.settings-floating-save\.is-visible/,'Falta CSS visible del guardado flotante');
assert.match(css,/bus-compact-route \.airport strong\{font-size:1\.03rem\}/,'El autobús debe usar tipografía ampliada en la ruta');
assert.match(css,/flight-vueling-actions \.vueling-quick-link\{font-size:\.84rem!important/,'Check-in y Mis viajes deben usar tipografía ampliada');
assert.match(css,/detail-box strong,\.date-chip strong\{font-size:1rem!important/,'Vuelo y Alojamiento deben compartir tamaño de valores');

assert.match(app,/function pdfFileIconMarkup\(/,'Falta el icono PDF global');
assert.match(app,/pdf-preview-icon/,'Los PDF de Documentos oficiales deben usar la miniatura global');
assert.match(css,/documents-grid \.document-card \.file-button-list\{[\s\S]*grid-template-columns:minmax\(0,1fr\)/,'Reservas y documentos debe mostrar un botón por línea');
assert.match(css,/lodging-review-links \.lodging-review-link\{[\s\S]*height:38px/,'Google, Tripadvisor y Booking deben compartir altura');
assert.match(css,/bus-card \.bus-actions \.bus-purchase-link,[\s\S]*maps-route-link[\s\S]*height:38px/,'Comprar billetes y Google Maps deben compartir altura');
assert.match(sw,/pdf-file\.png/,'El icono PDF debe estar incluido en la caché de la PWA');



// v2.2.67 · Autobús, Drive y documentos.
assert.match(app,/data-manage-source-bus-files/,'Presupuesto debe permitir gestionar varios billetes/archivos del autobús');
assert.match(app,/bus-card-drive-icon/,'El autobús debe admitir imagen personalizada antes de IDA/VUELTA');
assert.match(app,/importDriveImage\(selected,'settings-images'\)/,'Los iconos/imágenes de Configuración seleccionados desde Drive deben importarse a una URL estable');
assert.match(css,/\.documents-grid\{grid-template-columns:repeat\(var\(--documents-grid-cols,4\),minmax\(0,1fr\)\)/,'Reservas y documentos deben adaptar las columnas visibles y mantener hasta cuatro en escritorio');
assert.match(css,/\.bus-service-links\{max-width:none!important/,'El botón de compra del autobús debe reservar su propio ancho');

// v2.2.63 · Autobús aeropuerto.
assert.match(seed,/"id": "bus-out"/,'Falta el autobús de ida precargado');
assert.match(seed,/"company": "Avanza Gipuzkoa"/,'Falta la compañía Avanza Gipuzkoa');
assert.match(seed,/"from": "Donostia \/ San Sebastián"/,'Falta el origen del autobús');
assert.match(seed,/"to": "Aeropuerto de Bilbao"/,'Falta el destino del autobús');
assert.match(seed,/"pricePerPerson": 4\.16/,'Falta el precio por persona del autobús');
assert.match(seed,/"id": "bus-back"[\s\S]*?"visible": false/,'La vuelta de autobús debe quedar oculta por defecto');
assert.match(app,/function renderBusCard\(/,'Falta la tarjeta de autobús en Portada');
assert.doesNotMatch(app,/function renderBusCard\([\s\S]{0,3500}renderFileButton/,'La tarjeta de autobús de Portada no debe renderizar adjuntos');
assert.match(app,/function renderJourneyCards\(/,'Falta el orden cronológico conjunto de autobuses y vuelos');
assert.match(app,/function editBus\(/,'Falta edición de autobuses en Configuración');
assert.match(app,/data-settings-bus-visible/,'Falta mostrar\/ocultar cada trayecto de autobús');
assert.match(app,/data-settings-bus-files/,'Falta gestión de billetes y archivos de autobús');
assert.match(app,/group\.id==="g-bus"/,'Falta integración automática de autobús en Presupuesto');
assert.match(css,/\.bus-card/,'Falta estilo visual de autobús');

assert.match(app,/sort\(\(a,b\)=>Date\.parse\(a\.date\|\|0\)-Date\.parse\(b\.date\|\|0\)\)/,'AutoReisen/Cordial deben ordenar el histórico de antiguo a reciente');
assert.match(app,/sort\(\(x,y\)=>Date\.parse\(x\.date\|\|0\)-Date\.parse\(y\.date\|\|0\)\)/,'Vueling debe ordenar el histórico de antiguo a reciente');
assert.match(css,/\.vueling-chart-line\{[^}]*fill:none!important/,'Las líneas Vueling no deben rellenarse como áreas');
assert.match(css,/\.cordial-chart-line\{[^}]*stroke-width:2\.2/,'AutoReisen y Cordial deben usar una línea fina');

assert.match(app,/function tripMenuDates\(settings=\{\}\)/,'Falta generación de días de Menú desde las fechas del viaje');
assert.match(app,/syncMenuDaysWithTripDates/,'Falta sincronización automática de días del Menú');
assert.match(app,/showBreakfast/,'Falta control para ocultar desayuno');
assert.match(app,/showLunch/,'Falta control para ocultar comida');
assert.match(app,/showDinner/,'Falta control para ocultar cena');
assert.match(app,/Mostrar comida en Menú y PDF/,'Falta control visible para ocultar comidas');
assert.match(app,/function desktopCoverOrder\(\)/,'Falta orden independiente de Portada para escritorio');
assert.match(app,/data-cover-layout-toggle/,'Falta botón Editar distribución en Portada');
assert.match(app,/data-cover-layout-width/,'Falta selector de ancho completo\/media fila');
assert.match(app,/draggable=\"true\"/,'Falta drag & drop de bloques en escritorio');
assert.match(app,/desktopCoverWidths/,'Falta persistencia de tamaños de los bloques de Portada');
assert.match(app,/if\(explicit==="half"\|\|explicit==="full"\)return \[id,explicit\]/,'Los anchos explícitos 1\/2 y 1\/1 de los carruseles deben sobrevivir al refresco');
assert.match(seed,/"desktopCoverOrder"/,'Falta configuración inicial del orden de escritorio');
assert.match(seed,/"desktopCoverWidths"/,'Falta configuración inicial de anchos de escritorio');
assert.match(css,/@media\(min-width:1100px\)/,'La distribución editable debe limitarse a escritorio');
assert.match(css,/\.cover-layout-item\.is-half\{grid-column:span 1\}/,'Falta modo media fila para dos bloques por fila');

assert.match(app,/function coverMediaLayoutKey\(carousel,index=0\)/,'Falta clave individual por carrusel en la distribución de Portada');
assert.match(app,/data-cover-layout-target/,'El selector de ancho debe admitir IDs dinámicos de carrusel');
assert.match(app,/carouselBlocks=.*renderCoverMediaCarousel/s,'Las galerías deben renderizarse como bloques independientes');
assert.match(css,/@media\(max-width:1099px\)/,'Tablet y móvil deben conservar su disposición normal');


for(const rel of ['firebase.json','firebase.full.reference.json','monitoring/package.json','monitoring/config.json','monitoring/vueling-config.json','functions/package.json','admin-tools/package.json']) JSON.parse(await read(rel));

assert.match(await read('.github/workflows/autoreisen-monitor.yml'),/cron: '30 6 \* \* \*'/,'AutoReisen debe ejecutarse a las 06:30');
assert.match(await read('.github/workflows/cordial-monitor.yml'),/cron: '35 6 \* \* \*'/,'Cordial debe ejecutarse a las 06:35');
assert.match(await read('.github/workflows/vueling-monitor.yml'),/cron: '40 6 \* \* \*'/,'Vueling debe ejecutarse a las 06:40');

assert.match(css,/\.journey-grid>\.bus-card\{grid-column:1 \/ -1\}/,'Con un único autobús, el autobús debe ocupar todo el ancho de la rejilla de transportes');
assert.match(app,/data-sort-item=\"budget-group\|/,'Falta reordenación libre para bloques de Presupuesto');
assert.match(app,/data-sort-item=\"tripdata\|/,'Falta reordenación libre para secciones de Datos viaje');
assert.match(app,/data-sort-item=\"trip-transport\|/,'Falta reordenación libre para vuelos, autobuses y alojamiento');
assert.match(app,/data-sort-container=\"suitcase\|/,'Maletas debe permitir soltar elementos incluso entre bloques');
assert.match(app,/Arrastrar elemento · también entre subgrupos y bloques/,'Maletas debe anunciar el movimiento libre entre subgrupos y bloques');
assert.doesNotMatch(app,/[↑↓]/,'No deben quedar flechas de reordenación visibles tras migrar al arrastre libre');


// v2.2.67 · regresiones de iconos Drive y autobuses.
assert.match(app,/data-drive-backed-image-id/,'Los iconos con URL de Drive deben hidratarse con la sesión persistente');
assert.match(app,/hydrateResilientIcon/,'Falta el cargador resiliente de iconos de Drive');
assert.match(app,/auto-row-sync/,'El marcador automático debe ser compacto y no partir AUTO verticalmente');
assert.doesNotMatch(app,/data-upload-budget-icon/,'El icono del concepto de Presupuesto debe editarse desde el lápiz, sin botón separado');
assert.match(app,/name:"iconUrl",label:"URL del icono"/,'El lápiz de Presupuesto debe conservar la edición del icono');
assert.match(css,/\.bus-actions \.bus-purchase-link/,'Comprar billetes debe convivir con las acciones inferiores del autobús');
assert.match(css,/\.flight-route,\.bus-compact-route/,'Rutas de autobús y vuelo deben compartir centrado compacto');


// v2.2.67 · composición de transportes ida/vuelta.
assert.match(app,/function journeyGridClass\(/,'Falta detectar si hay uno o dos autobuses visibles');
assert.match(app,/const ordered=\[outboundBus,outboundFlight,returnFlight,returnBus\]/,'El orden debe ser bus ida, vuelo ida, vuelo vuelta, bus vuelta');
assert.match(css,/\.journey-grid\.has-both-buses>\.bus-card\{grid-column:auto\}/,'Con ambos autobuses, cada bus debe compartir fila con su vuelo');
assert.match(app,/function busIdentityVisualUrl\(/,'Falta herencia del icono de autobús entre trayectos de la misma compañía');


// v2.2.71 · billetes de autobús enlazados a Drive.
assert.doesNotMatch(app,/\$\{bus\.notes\?`<p class=\"card-subtitle bus-notes\">/,'La Portada no debe mostrar la nota fija del autobús');
assert.match(app,/function manageBusFiles\(index\)[\s\S]*?stableBusId/,'El gestor de billetes debe localizar el bus por ID estable');
assert.match(app,/function manageBusFiles\(index\)[\s\S]*?autoSave:true[\s\S]*?storeDriveLinks:true[\s\S]*?mimeTypes:'application\/pdf'/,'Los billetes del autobús deben guardarse como enlaces PDF persistentes de Drive');
assert.doesNotMatch(seed,/Autobús al aeropuerto antes del vuelo de ida\./,'El seed no debe restaurar la nota fija del autobús');


// v2.2.82 · Vuelos integrados en filas y progreso de pago.
assert.match(app,/budgetTitle/,'Falta texto de concepto de autobús editable en Presupuesto');
assert.match(app,/budgetDetail/,'Falta texto de detalle de autobús editable en Presupuesto');
assert.match(app,/budgetTitle:String\(bus\?\.budgetTitle\|\|''\)/,'La normalización de autobuses debe conservar budgetTitle');
assert.match(app,/budgetDetail:String\(bus\?\.budgetDetail\|\|''\)/,'La normalización de autobuses debe conservar budgetDetail');
assert.match(app,/budgetFlightForItem/,'Falta integración de datos de vuelo en las filas de Vueling');
assert.match(app,/budget-col-flight-time/,'Faltan columnas de horario, duración y vuelo en Presupuesto');
assert.doesNotMatch(app,/Datos de los vuelos/,'Sobra el resumen inferior de datos de los vuelos');
assert.match(app,/renderBudgetPaidProgress/,'Falta el gráfico lineal de progreso de pago');
assert.doesNotMatch(app,/<span>✈️ Resumen de vuelos<\/span>/,'Sobra el antiguo bloque independiente Resumen de vuelos');
assert.match(app,/pdf-action-icon/,'Los botones de generación PDF deben usar el icono PDF gráfico');
assert.doesNotMatch(app,/Ver extra/,'El botón de Extras debe mostrarse simplemente como Ver');

assert.match(css,/\.canary-header-line\{[\s\S]*background:var\(--gc-flag-split\)/,'La línea bajo el título debe usar la bandera de Gran Canaria');
assert.match(css,/\.countdown-strip\{[\s\S]*border:3px solid transparent!important;[\s\S]*var\(--gc-flag-split\) border-box/,'La cuenta atrás debe tener borde visible con la bandera de Gran Canaria');
assert.match(css,/\[data-autoreisen-save\],[\s\S]*\[data-vueling-save\][\s\S]*background:var\(--mfe-canary-gradient\)!important/,'Los Guardar y sincronizar de Seguimientos deben usar el degradado canario');

// v2.4.15 · Histórico completo en Google Drive, Firestore solo conserva referencias ligeras.
assert.match(seed,/"historyDriveFolder"/,'Falta la carpeta persistente de Google Drive para Histórico');
assert.match(app,/function archiveReferenceFromSnapshot\(/,'Falta la ficha ligera del Histórico para Firestore');
assert.match(app,/async function uploadHistorySnapshotToDrive\(/,'Falta la subida del snapshot completo a Google Drive');
assert.match(app,/async function loadHistorySnapshotFromDrive\(/,'Falta la lectura del Histórico desde Google Drive');
assert.match(app,/driveArchive:\{fileId:/,'La ficha histórica debe conservar el ID del JSON de Drive');
assert.match(app,/uploadType=resumable/,'Los históricos grandes deben admitir subida resumible a Drive');
assert.match(app,/Firebase solo conservará una ficha ligera y el ID del archivo/,'El diálogo de archivado debe explicar que Firestore no guarda el snapshot completo');

console.log(`OK · Validación estática completa de MFE Viajes v${releaseVersion}.`);
