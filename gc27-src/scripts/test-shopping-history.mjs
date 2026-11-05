import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const [app,css,seedText,readme]=await Promise.all([
  readFile(new URL('../public/app.js',import.meta.url),'utf8'),
  readFile(new URL('../public/styles.css',import.meta.url),'utf8'),
  readFile(new URL('../public/seed-data.js',import.meta.url),'utf8'),
  readFile(new URL('../README.md',import.meta.url),'utf8')
]);
assert.match(app,/function renderShoppingHistory\(\)/);
assert.match(app,/function recordShoppingPriceSnapshot/);
assert.match(app,/SHOPPING_HISTORY_MAX_SNAPSHOTS=180/);
assert.match(app,/SHOPPING_HISTORY_MAX_CHANGES=1000/);
assert.match(app,/Impacto en la lista/);
assert.match(app,/quantity:Number\(quantity\.toFixed\(3\)\)/);
assert.match(app,/impact:Number\(\(delta\*quantity\)\.toFixed\(4\)\)/);
assert.match(app,/Una vez al día/);
assert.match(app,/Cada 2 días/);
assert.match(app,/Solo manual/);
assert.match(app,/scheduleShoppingAutoPriceChecks\(\)/);
assert.match(app,/data-shopping-open-history/);
assert.match(app,/shopping-a6-page:not\(:first-child\).*break-before:page/);
assert.match(app,/function editTrackerTitleIcon\(id\)/);
assert.match(app,/driveImage:true/);
assert.match(app,/titleIconFile/);
assert.match(app,/data-tracker-chart-tooltip/);
assert.doesNotMatch(app,/stroke-dasharray="2 6"/);
assert.match(css,/\.shopping-history-hero/);
assert.match(css,/\.shopping-product-history-card/);
assert.match(css,/\.tracker-title-icon-image/);
assert.match(seedText,/"priceTracking"/);
assert.match(seedText,/"schedule": "daily"/);
assert.match(readme,/cada supermercado empiece en una página nueva/i);
const {SEED_DATA}=await import('../public/seed-data.js');
const stores=SEED_DATA.shopping?.stores||[];
assert.ok(stores.length>=2,'Se esperaban al menos dos supermercados de ejemplo');
assert.equal(SEED_DATA.shopping.priceTracking.schedule,'daily');
assert.deepEqual(SEED_DATA.shopping.priceTracking.snapshots,[]);
console.log(`OK · Histórico de compra: ${stores.length} supermercados y ${stores.reduce((n,s)=>n+(s.products||[]).length,0)} productos iniciales; PDF, iconos y gráfico Vueling validados.`);
