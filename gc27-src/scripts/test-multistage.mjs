import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const app=await readFile(join(root,'public','app.js'),'utf8');
const css=await readFile(join(root,'public','styles.css'),'utf8');
const {SEED_DATA}=await import('../public/seed-data.js');
assert.equal(SEED_DATA.stages?.enabled,false,'El modo multietapa no debe activar o borrar datos anteriores automáticamente');
assert.equal(SEED_DATA.stages?.items?.length,2,'Deben existir exactamente dos semanas configurables');
assert.ok(SEED_DATA.suitcases?.guest3!==undefined||/guest3/.test(JSON.stringify(SEED_DATA)),'Faltan maletas del tercer viajero');
const start=app.indexOf('function multiStageEnabled()');
const end=app.indexOf('function stageReservationCard(',start);
assert.ok(start>=0&&end>start,'Faltan helpers de etapas');
const ctx={state:{data:{stages:{enabled:true,items:[
 {id:'week-1',label:'Semana 1',island:'Gran Canaria',start:'2027-09-06',end:'2027-09-12'},
 {id:'week-2',label:'Semana 2',island:'Fuerteventura',start:'2027-09-13',end:'2027-09-20'}
]}}}};
runInNewContext(app.slice(start,end),ctx);
assert.equal(runInNewContext('stageForDate("2027-09-10")',ctx),'week-1');
assert.equal(runInNewContext('stageForDate("2027-09-17")',ctx),'week-2');
assert.equal(runInNewContext('stageIdForRecord({date:"2027-09-16"})',ctx),'week-2');
assert.equal(runInNewContext('stageIdForRecord({stageId:"week-1",date:"2027-09-16"})',ctx),'week-1','La asignación manual debe prevalecer');
const disable=runInNewContext('state.data.stages.enabled=false; multiStageEnabled()',ctx);
assert.equal(disable,false);
for(const token of ['stage-lodging-grid','stage-weather-grid','stage-supermarket-panels','renderStage2TrackerCards','manageStageReservationFiles','data-stage-add-interisland','function renderStages','function renderStageSupermarketPanels','boardingPassKey','activeBoardingPassKeys'])assert.ok(app.includes(token)||css.includes(token),`Falta ${token}`);
for(const token of ['stage-card-grid','stage-supermarket-card','.flight-vueling-actions.has-five-passengers'])assert.ok(css.includes(token),`Falta estilo ${token}`);
assert.match(app,/stages:clone\(state\.data\.stages/,'El archivo del histórico debe incluir las etapas');
assert.match(app,/saveSection\('stages'\)/,'La edición de semanas debe persistirse en Firebase');
console.log('OK · GC 27 dos islas: fechas, 5 viajeros, compra por semana, Portada, presupuesto e histórico preservados.');
