import assert from 'node:assert/strict';

function euroNumber(text=''){
  const raw=String(text).replace(/\u00a0/g,' ');
  const matches=[...raw.matchAll(/(?:€\s*)?(-?\d{1,3}(?:\.\d{3})*(?:,\d{2})|-?\d+(?:[.,]\d{2}))\s*€?/g)];
  if(!matches.length)return 0;
  const value=matches.at(-1)[1].replace(/\./g,'').replace(',','.');
  return Number.parseFloat(value)||0;
}
function labeledMoney(text,label){const m=String(text).match(new RegExp(`${label}\\s*([\\d.]+,\\d{2})\\s*€`,'i'));return m?euroNumber(m[1]):0;}
function baggageMoney(text){const matches=[...String(text).matchAll(/\d+\s+maletas?\s+facturadas?[^\n]*?([\d.]+,\d{2})\s*€|\d+\s+maleta\s+facturada[^\n]*?([\d.]+,\d{2})\s*€/gi)];if(!matches.length)return 0;return matches.reduce((sum,m)=>sum+euroNumber(m[1]||m[2]||''),0);}
function parseSummary(body){
  const total=labeledMoney(body,'(?:PRECIO TOTAL|TOTAL RESERVA)')||euroNumber((body.match(/^\s*([\d.]+,\d{2})\s*€/m)||[])[1]||'');
  const outStart=body.search(/\bIDA\b/i),retStart=body.search(/\bVUELTA\b/i);let outboundGross=labeledMoney(body,'TOTAL IDA'),returnGross=labeledMoney(body,'TOTAL VUELTA'),services=labeledMoney(body,'TOTAL SERVICIOS');
  const outText=outStart>=0&&retStart>outStart?body.slice(outStart,retStart):body;const retText=retStart>=0?body.slice(retStart):body;
  const baggageOutbound=baggageMoney(outText),baggageReturn=baggageMoney(retText),baggageLines=baggageOutbound+baggageReturn;
  let outbound=outboundGross,returnPrice=returnGross,baggage=services||baggageLines,mode='separate-services';
  const tol=.08;
  if(!(services>0&&Math.abs(total-(outboundGross+returnGross+services))<tol)){
    if(baggageLines>0){outbound=Math.max(0,outboundGross-baggageOutbound);returnPrice=Math.max(0,returnGross-baggageReturn);baggage=baggageLines;mode='baggage-inside-leg-totals';}
  }
  const otherServices=Math.max(0,total-(outbound+returnPrice+baggage));if(otherServices>tol)baggage+=otherServices;
  return {total,outbound,returnPrice,baggage,outboundGross,returnGross,baggageOutbound,baggageReturn,mode};
}

const desktop=`IDA\n2 adultos 97,02 €\nImpuestos y cargos aeroportuarios 20,96 €\n1 maleta facturada de 25kg 75,00 €\nTOTAL IDA 192,98 €\nVUELTA\n2 adultos 132,68 €\nImpuestos y cargos aeroportuarios 19,30 €\n1 maleta facturada de 25kg 77,00 €\nTOTAL VUELTA 228,98 €\nTOTAL RESERVA 421,96 €`;
const d=parseSummary(desktop);
assert.ok(Math.abs(d.total-421.96)<0.001);assert.ok(Math.abs(d.outbound-117.98)<0.001);assert.ok(Math.abs(d.returnPrice-151.98)<0.001);assert.ok(Math.abs(d.baggage-152)<0.001);assert.equal(d.mode,'baggage-inside-leg-totals');

const mobile=`IDA\nTOTAL IDA 58,99 €\nVUELTA\nTOTAL VUELTA 75,99 €\nSERVICIOS AÑADIDOS\n2 maletas facturadas 152,00 €\nTOTAL SERVICIOS 152,00 €\nPRECIO TOTAL 286,98 €`;
const m=parseSummary(mobile);
assert.ok(Math.abs(m.total-286.98)<0.001);assert.ok(Math.abs(m.outbound-58.99)<0.001);assert.ok(Math.abs(m.returnPrice-75.99)<0.001);assert.ok(Math.abs(m.baggage-152)<0.001);assert.equal(m.mode,'separate-services');


const collapsedDom=`Ida
Lun. 14 sep.
Bilbao
BIO
06:50h
Gran Canaria
LPA
09:05h
VY3272
2 Adultos
97,02 €
Total ida
117,98 €
Vuelta
Lun. 21 sep.
Gran Canaria
LPA
16:40h
Bilbao
BIO
20:45h
VY3271
2 Adultos
132,68 €
Total vuelta
151,98 €
Servicios añadidos
2 maletas facturadas
152,00 €
Total servicios
152,00 €
Precio total
421,96 €`;
const c=parseSummary(collapsedDom);
assert.ok(Math.abs(c.total-421.96)<0.001);assert.ok(Math.abs(c.outbound-117.98)<0.001);assert.ok(Math.abs(c.returnPrice-151.98)<0.001);assert.ok(Math.abs(c.baggage-152)<0.001);assert.equal(c.mode,'separate-services');

console.log('OK · Vueling pricing: escritorio, móvil y DOM colapsado final validados con ejemplos reales.');
