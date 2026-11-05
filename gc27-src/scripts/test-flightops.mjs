import assert from 'node:assert/strict';
import {__flightOpsTest} from '../monitoring/flightops.mjs';
const flight={id:'flight-out',number:'VY3272',date:'2026-09-14',departure:'2026-09-14T06:50:00+02:00',arrival:'2026-09-14T09:05:00+01:00',origin:'BIO',destination:'LPA',from:'Bilbao (BIO)',to:'Gran Canaria (LPA)'};

// Texto genérico de ayuda con el número mencionado y la palabra cancelado lejos/sin identidad suficiente.
const generic=`Estado de vuelos VY3272. Consulta la información de tu vuelo. Si un vuelo es CANCELADO, contacta con la compañía. Terminal de la que sale el vuelo. Estado vuelo.`;
const parsedGeneric=__flightOpsTest.parseOperationalText(generic,flight,'test');
assert.equal(parsedGeneric.status,'','Nunca debe inferir Cancelado desde ayuda genérica');
assert.equal(parsedGeneric.statusVerified,false);
assert.equal(parsedGeneric.identityVerified,false);
assert.equal(parsedGeneric.terminal,'','No debe extraer terminal basura sin identidad verificada');

// Ficha realista: nº + fecha + ruta + hora + estado en el mismo bloque.
const real=`Lun 14 sept\nVY3272\nBilbao BIO\nGran Canaria LPA\nSalida 06:50\nEstado CANCELADO\nTerminal 1\nPuerta B12`;
const parsedReal=__flightOpsTest.parseOperationalText(real,flight,'test');
assert.equal(parsedReal.identityVerified,true);
assert.equal(parsedReal.status,'Cancelado');
assert.equal(parsedReal.statusVerified,true);
assert.equal(parsedReal.terminal,'1');
assert.equal(parsedReal.gate,'B12');

// Un bloque realista sin estado todavía se mantiene pendiente, no cancelado.
const pending=`14/09/2026\nVY3272\nBilbao BIO → Gran Canaria LPA\nSalida 06:50\nTerminal --\nPuerta --`;
const parsedPending=__flightOpsTest.parseOperationalText(pending,flight,'test');
assert.equal(parsedPending.identityVerified,true);
assert.equal(parsedPending.status,'');
assert.equal(parsedPending.statusVerified,false);

const merged=__flightOpsTest.mergeFlight(flight,
  {ok:true,source:'Aena',mode:'departure',...parsedPending},
  {ok:true,source:'Aena',mode:'arrival',...parsedPending},
  {ok:true,source:'Vueling',mode:'flight-status',...parsedGeneric}
);
assert.equal(merged.status,'');
assert.equal(merged.statusVerified,false);
assert.equal(merged.hasOperationalData,false);
console.log('OK · FlightOps: cancelaciones genéricas bloqueadas y cancelación real verificada.');

// API pública de Aena: la monitorización ya no depende de que el HTML de Infovuelos renderice el vuelo.
const aenaApiRow={
  iataCompania:'VY',numVuelo:'3272',iataAena:'BIO',iataOtro:'LPA',fecha:'14/09/2026',horaProgramada:'06:50',
  estado:'SCH',terminal:'1',puertaPrimera:'B',cintaPrimera:'15',mostradorFacturacionPrimero:'10',mostradorFacturacionUltimo:'15',horaEmbarque:'06:15'
};
assert.ok(__flightOpsTest.scoreAenaRow(aenaApiRow,flight,'departure')>=20,'La fila Aena debe identificarse de forma inequívoca');
const parsedApi=__flightOpsTest.parseAenaWebsiteRow(aenaApiRow,flight,'departure');
assert.equal(parsedApi.identityVerified,true);
assert.equal(parsedApi.status,'Programado');
assert.equal(parsedApi.terminal,'1');
assert.equal(parsedApi.gate,'B');
assert.equal(parsedApi.checkInCounters,'10-15');
assert.equal(parsedApi.boardingStart,'06:15');

// La instantánea confirmada por el usuario debe cubrir huecos temporales de Aena sin pisar datos en vivo.
const hintedFlight={...flight,operationalHints:{source:'Aena app · 13 sept',terminal:'1',gate:'B',checkInCounters:'10-15',boardingStart:'06:15',baggageBelt:'15'}};
const mergedHints=__flightOpsTest.mergeFlight(hintedFlight,
  {ok:true,source:'Aena',mode:'departure',found:false,identityVerified:false,statusVerified:false},
  {ok:true,source:'Aena',mode:'arrival',found:false,identityVerified:false,statusVerified:false},
  {ok:false,source:'Vueling',mode:'omitido'}
);
assert.equal(mergedHints.identityVerified,true);
assert.equal(mergedHints.terminal,'1');
assert.equal(mergedHints.gate,'B');
assert.equal(mergedHints.checkInCounters,'10-15');
assert.equal(mergedHints.boardingStart,'06:15');
assert.equal(mergedHints.baggageBelt,'15');
assert.equal(mergedHints.hasOperationalData,true);
console.log('OK · FlightOps: fallback Aena app conserva Terminal 1 · Puerta B · facturación 10-15 · embarque 06:15 · cinta 15.');
