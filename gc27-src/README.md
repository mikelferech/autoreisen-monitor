## v2.4.33 · AutoReisen Fuerteventura y monitor Hotel Dunas Club

- Etapa 2: monitor de AutoReisen independiente con oficina FUE 19, recogida/devolución del segundo coche, consulta diaria, precio reservado/actual y evolución independiente.
- Hotel Dunas Club: consulta en el motor oficial Keytel/Booking-Channel para fechas, ocupación (hasta cinco adultos) y habitaciones. Muestra el precio solo si el total de todas las habitaciones está confirmado; no confunde precios del calendario ni tarifas de una sola habitación con la reserva completa. Si no encuentra una combinación válida, avisa y mantiene el último importe válido.
- En `Etapas` y `Seguimientos`, botón ↻ para lanzar cada monitor, ✎ para configurar y enlaces oficiales. Guardar un hotel o coche con fechas válidas sincroniza su workflow en GitHub.
- Corregido el fallo diario de AutoReisen al fijar Ubuntu 24.04 (Playwright antiguo no instalaba Chromium en Ubuntu 26.04). El Worker canónico conserva esa solución al actualizar automáticamente el repositorio.
- Worker principal v2.2.54 y monitores independientes en KV. Se mantienen los seguimientos originales y los datos de etapas anteriores.

## v2.4.32 · GC 27: viaje por dos islas y cinco viajeros

- Añade **Etapas** con modo de dos islas, destinos y fechas independientes, sin alterar los datos de viajes anteriores hasta que se active.
- Preparación de tres vuelos (Vueling ida, alta rápida de Binter interinsular y regreso); tarjetas de embarque/archivos por hasta cinco viajeros.
- Dos alojamientos, dos coches, dos previsiones del tiempo en Portada, coches y hoteles en Alojamiento, itinerario y menús agrupados por isla.
- Dos paneles de Compra real → Supermercados, con tickets, edición y totales separados por semana; catálogo y conceptos presupuestarios asignables a etapa.
- Segundo hotel y coche integrados en el Presupuesto; seguimiento **manual** con registro histórico para la segunda isla. Los automatismos actuales Vueling/Cordial/AutoReisen siguen siendo los de sus respectivas fichas principales y no se duplican.
- Archivo y restauración incluyen el estado multietapa. Se mantienen instalaciones antiguas de una isla y se aceptan copias JSON previas sin la nueva sección.
- Identidad PWA inicial GC 27 con nuevo icono entregado y actualización de versión, recursos y caché.

## v2.4.31 · Vueling con pasajeros y maletas flexibles

- El seguimiento de Vueling admite hasta 5 pasajeros configurables con nombres ficticios/auxiliares independientes.
- Se pueden configurar hasta 3 maletas facturadas de forma individual, con pesos Vueling de 15, 20, 25 o 30 kg, pasajero asignado y trayecto (ida y vuelta, solo ida o solo vuelta).
- El monitor Playwright aplica cada maleta por pasajero y peso, y mantiene el precio de equipaje separado del vuelo en Seguimientos e histórico.
- El Worker Vueling sube a v1.0.23 y la automatización a v1.0.20; la actualización móvil publica también este Worker.
- Se actualizan APP_VERSION, footer y caché PWA a v2.4.31.

## v2.4.30 · Aena bloqueada fuera de la fecha real del vuelo
- Aena solo se muestra dentro de los 14 días previos al vuelo (y hasta 3 días después).
- La API de Aena exige coincidencia exacta de fecha completa, incluido el año; ya no basta el mismo número/ruta.
- El seguimiento automático deja de consultar vuelos a meses de distancia y se reactiva 14 días antes.
- Se actualizan APP_VERSION, footer y caché PWA a v2.4.30.

## v2.4.29 · Aena solo por vuelo y fecha exactos
- Elimina por completo los `operationalHints`/snapshots antiguos de Aena de los vuelos activos.
- Terminal, puerta, facturación, embarque y cinta solo se muestran si el resultado actual coincide con número de vuelo y fecha exacta.
- Si no existe ese resultado, la tarjeta permanece en modo compacto “Sin datos operativos todavía”.
- Actualiza versión, footer, referencias CSS/JS y caché PWA a v2.4.29.

## v2.4.28 · FlightOps aislado por fecha real del viaje
- Los datos operativos Aena ya no se reutilizan por el ID genérico ida/vuelta: solo se muestran cuando coinciden número de vuelo y fecha exacta.
- Las instantáneas Aena antiguas quedan vinculadas a su fecha original y se eliminan al cambiar el vuelo a otro viaje.
- Mientras no haya datos de la fecha nueva, la ficha muestra únicamente el estado compacto sin terminal/puerta/cinta antiguas.

## v2.4.27 · Ocultar bloques en Presupuesto
- Añade ojo para ocultar/mostrar el resumen, progreso de pago, grupos de presupuesto, kilómetros y distribución.
- Los bloques ocultos aparecen en una lista “Elementos ocultos” mientras la edición está desbloqueada, igual que en Portada.
- La visibilidad se conserva entre viajes y no afecta a cálculos, totales ni al Histórico.

## v2.4.26 · Elementos fijos al archivar
- Cada enlace/archivo de las fichas de Portada puede marcarse con 📌 para conservarse al archivar el viaje.
- El enlace principal de una ficha también puede marcarse como permanente desde Editar ficha.
- Al archivar, reservas y documentos normales se limpian, pero los elementos fijados permanecen para el siguiente viaje.
- Footer y caché PWA actualizados a v2.4.26.

## v2.4.25 · Fichas adaptativas + vuelo compacto sin datos
- Las fichas de documentos de Portada se redistribuyen según el número visible (por ejemplo, 3 fichas ocupan todo el ancho en 3 columnas).
- El estado operativo del vuelo se muestra en modo compacto mientras Aena/Vueling no publica datos reales, evitando null y descuadres.
- Se actualizan APP_VERSION, footer y caché PWA a v2.4.25.


## v2.4.24 · Versión del footer sincronizada
- El footer ya no depende únicamente del texto estático de `index.html`: se actualiza desde `APP_VERSION` al cargar la app.
- Se actualizan `index.html`, Service Worker y caché PWA a v2.4.24.
# MFE Viajes 2026 · v2.4.23


## v2.4.23 · Corrección estructural de los resúmenes de Seguimientos

- Corrige de raíz los bloques resumen de AutoReisen, Cordial y Vueling en Portada y en Seguimientos.
- El bloque completo deja de ser un botón HTML para evitar el botón anidado del refresco ↻, que hacía que el navegador cerrara la tarjeta antes de tiempo y sacara KPIs, flota y habitaciones fuera de su contenedor.
- Se conserva la navegación al pulsar la tarjeta y se añade activación por teclado con Enter/Espacio.
- Se renueva la caché de la PWA para forzar la carga del HTML/CSS/JS corregido tras actualizar.


## v2.4.19 · Cuenta atrás, fechas de búsqueda y menú persistente

- Corrige la alineación de la cuenta atrás en Portada: título y cifras quedan centrados y ningún valor invade el borde.
- Los resúmenes de AutoReisen, Cordial y Vueling muestran en pequeño el **periodo buscado** (ida/recogida/entrada → vuelta/devolución/salida), además de la última búsqueda.
- Al archivar se conserva literalmente toda la configuración de interfaz y menú (orden, visibilidad y distribución). Solo cambian los campos propios del nuevo viaje.


## v2.4.18 · Fechas maestras del viaje
- `Configuración → General` mantiene un único inicio y fin del viaje como fechas maestras.
- Al guardar nuevas fechas, la app puede aplicarlas automáticamente a los vuelos de ida/vuelta, entrada/salida del alojamiento, Cordial, Vueling y AutoReisen.
- Se conservan las horas ya configuradas en vuelos y coche; solo cambia la parte de fecha.
- La sincronización puede desactivarse con `Usar estas fechas en vuelos, alojamiento y coche`.
- Los autobuses permanecen independientes porque pueden viajar en un día diferente al vuelo.

## v2.4.17 · Histórico reciente primero y plantilla reutilizable

- Histórico ordenado por fecha del viaje, del más reciente al más antiguo.
- Al archivar ya no se pierde la configuración reutilizable de alojamiento, vuelos, coche ni seguimientos. Se limpian gastos, kilómetros, documentos y datos dinámicos del viaje terminado, dejando una plantilla para el siguiente.
- En Configuración → Datos viaje se añade «Recuperar último archivado» para restaurar desde el JSON de Drive la configuración de un viaje ya archivado (útil para recuperar GC 2026 tras el reseteo de versiones anteriores).
- Se añaden «Resetear vuelos» y «Resetear alojamiento». Son acciones destructivas protegidas y siempre solicitan el PIN de edición, aunque Configuración ya esté desbloqueada.


## v2.4.16 · Histórico importable y cabeceras personalizables

- Cada viaje archivado permite cambiar los dos colores de su degradado de cabecera con el botón 🎨; se guarda en la ficha ligera de Firebase y no reescribe el JSON de Drive.
- Nuevo botón **Importar JSON** en Histórico para añadir viajes antiguos guardados en Google Drive. Lee el snapshot, valida sus datos y crea automáticamente la ficha ligera enlazada al archivo.
- Los JSON históricos marcados como `readOnlyArchive` se abren en modo solo lectura y no ofrecen «Deshacer archivo».

## v2.4.15 · Histórico completo en Google Drive

- El archivado deja de guardar el snapshot completo dentro del documento `history` de Firestore, evitando el límite de **1 MiB por documento** que impedía archivar Gran Canaria 2026.
- Al archivar, la app genera un único **JSON completo** con presupuesto, compras, vuelos, alojamiento, coche y kilómetros, documentos y datos de seguimientos, y lo sube a una carpeta de Google Drive elegida por el usuario.
- La carpeta del Histórico se selecciona una vez desde el propio diálogo de «Archivar viaje» y queda guardada en Configuración/Firebase para reutilizarla desde otros dispositivos.
- Firestore conserva únicamente una ficha ligera con fechas, importe, resumen e identificador del archivo de Drive.
- Al abrir un viaje archivado, la app descarga el JSON desde Drive y reconstruye la misma vista detallada de solo lectura.
- «Deshacer archivo» también lee el JSON original de Drive para restaurar el viaje; por seguridad, la copia JSON se conserva en Drive aunque se deshaga el archivado.
- Si falla la subida a Drive o el guardado de la ficha ligera, el viaje activo **no se reinicia**.

## v2.4.14 · Google Drive carga completa de carpetas

- Corregida la paginación del selector propio de Google Drive: ya no se limita a los primeros 100 elementos de una carpeta.
- Cada consulta solicita hasta 1.000 elementos por página y continúa automáticamente por las páginas siguientes.
- Los archivos recientes dejan de depender de pulsar «Cargar más» para aparecer.
- Se conserva el orden elegido por el usuario (nombre o fecha), la última carpeta visitada y la selección múltiple.
- Si una carpeta excepcionalmente supera 20.000 elementos, se mantiene «Cargar más» como salvaguarda.

## v2.4.13 · Navegación en popup de carruseles

- Al ampliar una imagen o PDF de cualquier carrusel, las teclas **←** y **→** del ordenador pasan al elemento anterior/siguiente sin cerrar el popup.
- La navegación es circular: desde el último vuelve al primero y viceversa.
- El popup mantiene la carga autorizada de imágenes de Google Drive y permite saltar entre imágenes y PDF.
- Se muestra el contador del elemento actual y una indicación de las teclas disponibles.

## v2.4.12 · Carruseles de Drive guardados al instante
- Corregido el gestor de **carruseles**: al elegir imágenes/PDF de Google Drive se guarda directamente su `driveFileId` y enlace, igual que en Documentos oficiales.
- Se elimina para los gestores exclusivos de Drive la descarga + re-subida intermedia a Firebase Storage, que podía quedarse bloqueada en “Añadiendo archivos de Google Drive…” y hacer que el elemento no apareciera.
- El cambio mantiene la carga autorizada desde Drive, el orden, el ojo de visibilidad y el guardado automático del carrusel.
- Este fallo no depende del cambio anunciado por Google para Picker nativo de noviembre de 2026.

## v2.4.11 · Cuenta atrás limpia
- Eliminado el fondo oscuro individual de Horas, Minutos y Segundos en la cuenta atrás, incluido el diseño Premium.
- El Histórico mantiene el comportamiento previsto: el detalle completo se abre desde una tarjeta de viaje archivado; las casillas del viaje actual son solo un resumen previo al archivado.


## v2.4.10 · Cordial · tarifa flexible correcta en resúmenes

- Los resúmenes de **Cordial** usan ahora la tarifa **Club Cordial - Reserva Online · SOLO ALOJAMIENTO**, que corresponde a la opción de **cancelación sin gastos**, en lugar de la tarifa Prepago/con gastos.
- El criterio se aplica a **todos los tipos de habitación**: cada mini-resumen toma su precio de Reserva Online.
- La evolución por habitación usa la misma tarifa que el resumen, evitando mezclar precios Prepago con precios flexibles.
- Las lecturas nuevas corrigen el texto de cancelación de Reserva Online cuando el motor de Cordial arrastra por error «Cancelación con gastos» desde la fila anterior.
- Monitor Cordial **v2.2.12** y Worker principal **v2.2.53**.

## v2.4.9 · Memoria de iconos por concepto + documentos alineados

- **Iconos reutilizables entre viajes:** Presupuesto guarda una biblioteca persistente por nombre de concepto/comercio. Al volver a crear un restaurante, comercio o gasto con el mismo nombre, recupera automáticamente el último icono/logo utilizado.
- La memoria se alimenta también de los iconos ya existentes en **Presupuesto**, **Compra real → Extras**, **Otros gastos** y de los viajes archivados, por lo que no hace falta volver a editar los conceptos actuales para registrarlos.
- **Archivar viaje no borra esta biblioteca:** los conceptos del viaje activo se incorporan a la memoria justo antes del snapshot y el reseteo.
- En **Reservas y documentos**, los nombres largos de archivos (por ejemplo, «Tarjetas de embarque BIO LPA.pdf») quedan alineados a la izquierda como el resto aunque ocupen dos líneas.

## v2.4.8 · KPI de presupuesto mejor ajustados en Portada

- Se estrecha el cajón de **Presupuesto total** para aprovechar mejor el ancho disponible.
- Se amplían los cajones de **Pagado** y **Por pagar** para evitar que el importe se solape con los gráficos circulares.
- Se reduce ligeramente el espacio interno entre texto y donut sin cambiar tamaños, colores ni datos.

## v2.4.7 · Histórico, gráficos y lista de compra

- Al archivar un viaje se guardan también los kilómetros iniciales/finales del coche y el total recorrido; después se reinician junto al resto de datos del viaje.
- Los gráficos de evolución se pueden pulsar para ampliar también en móvil; los tooltips siguen activos dentro de la vista ampliada.
- La Lista de la compra incorpora **Desmarcar todos** para limpiar de una vez todos los checks.

## v2.4.6 · Configuración vuelve a desplazamiento horizontal
- En móvil, los apartados de Configuración vuelven a mostrarse en una única fila desplazable horizontalmente con el dedo.
- La pestaña activa se mantiene visible y se centra al cambiar de apartado.
- Se elimina visualmente el selector desplegable introducido en v2.4.5, sin tocar las mejoras de gráficos ampliables ni el Histórico.

## v2.4.5 · Gráficos ampliables + Configuración móvil robusta
- Cada viaje archivado abre una vista completa de solo lectura con presupuesto, compras, productos de tickets, alojamiento, vuelos, autobuses, coche y seguimientos.
- Al archivar solo se reinician los campos incluidos en el snapshot del viaje.
- “Deshacer archivo” restaura el snapshot y elimina el archivo del Histórico únicamente tras biometría/WebAuthn del dispositivo.
- La restauración se bloquea si ya existen datos de otro viaje activo, evitando sobrescrituras silenciosas.


## v2.4.3 · rediseño premium reversible + Histórico real

- Nuevo diseño Premium activado por defecto, con selector Premium/Clásico en Configuración → Diseño.
- No elimina ni oculta datos existentes; cambia solo la capa visual.
- Histórico real con botón «Archivar viaje».
- El archivo conserva fechas, alojamiento, vuelos, coche, presupuesto final, compras y otros gastos.
- Al archivar, todos los importes se consolidan como gasto real pagado.
- Primero se guarda el histórico y solo después se reinician Presupuesto, Compra real y fichas relacionadas de Portada/Seguimientos.

## v2.4.3 · AutoReisen flota completa + gráficos multiserie + Histórico
- El botón ↻ de AutoReisen en Portada/Seguimientos lanza ahora la **consulta completa de flota** para las fechas guardadas.
- AutoReisen guarda de una sola vez todos los coches, precios, €/día, fotos válidas e histórico; el precio principal se actualiza con el coche configurado.
- Las fotos de AutoReisen se asignan por modelo y una misma URL no puede reutilizarse en coches distintos; si no hay foto fiable, la ficha queda sin imagen antes que mostrar una incorrecta.
- El gráfico de AutoReisen representa **todos los modelos visibles** usando `fleetPriceHistory`.
- El gráfico de Cordial representa **todos los tipos de habitación** con el precio mínimo de cada tipo en cada consulta.
- Se crea la nueva pestaña **Histórico**, inicialmente sin archivado automático, preparada para decidir después qué elementos se mueven allí y con qué reglas.
- Monitor AutoReisen **v2.2.22** y Worker principal **v2.2.52**.

## v2.3.51 · AutoReisen · flota completa visible en Seguimiento

- AutoReisen guarda **todos los coches disponibles** para las fechas/oficinas elegidas y permite decidir cuáles se ven en Seguimiento.
- Configuración de visibilidad desde **Configuración → Seguimientos → AutoReisen → Configurar flota**: “Todas visibles” o una/varias categorías. La consulta conserva siempre la flota completa.
- La consulta automática y “Comprobar ahora” guardan el precio total y €/día de cada coche disponible, aunque luego ocultes categorías en la vista.
- La lista completa aparece directamente en **Seguimiento → AutoReisen**, ordenada por precio y con diferencia frente a la consulta anterior por modelo/grupo.
- El histórico remoto reconstruye también la evolución por vehículo.
- Monitor AutoReisen **v2.2.17** y Worker principal **v2.2.47**.

## v2.3.49 · Drive persistente + visibilidad individual
- Las fichas de Portada (incluida Reserva del coche / AutoReisen) guardan inmediatamente los archivos seleccionados desde Google Drive.
- Cada archivo/documento gestionado por el gestor común incorpora un ojo para ocultarlo o volverlo a mostrar sin borrarlo.
- La visibilidad se respeta en Portada, Presupuesto, documentos de autobús, documentos oficiales, carruseles/planos y tarjetas de embarque.
- Los elementos ocultos siguen guardados y reaparecen en el gestor para poder restaurarlos.

## v2.3.48 · Gráfico de piscinas sincronizado con el dato actual

- El gráfico añade siempre como último punto la lectura actual que ya muestran las fichas, aunque el histórico remoto aún no la haya almacenado.
- Se registra `clientFetchedAt` al consultar el Worker para fechar correctamente ese punto actual.
- El histórico remoto sigue conservándose y se combina con el punto actual.

## v2.3.47 · Histórico de temperatura de piscinas corregido
- Corrige el gráfico **Evolución de las piscinas** cuando SILOE trae la temperatura dentro de la métrica `Temperatura agua (°C)` pero no rellena `pool.temperature`/`measurement.temperature`.
- El gráfico usa ahora la misma lógica de temperatura que las fichas superiores, tanto en la lectura actual como en cada snapshot del histórico.
- Las nuevas lecturas automáticas del día aparecen en el eje temporal sin depender de que el monitor haya normalizado previamente el campo `temperature`.
- Se amplía a 80 puntos recientes por piscina para conservar mejor varias lecturas del mismo día.

## v2.3.45 · Recirculación corregida y visible en ficha
- Corrige datos ya guardados donde SILOE podía colocar el valor entero del índice de recirculación (por ejemplo `4`) bajo la etiqueta anterior `Turbidez (UNF)` en la 1.ª medición.
- Mantiene la turbidez real de la última medición (por ejemplo `0,02 UNF`) y muestra el valor separado como **Índice de recirculación (h)**.
- Añade el índice de recirculación como ficha/chip superior de cada piscina, tomando la última lectura disponible aunque no forme parte del bloque «Última medición».
- Monitor de piscinas actualizado a **v1.0.4** y Worker principal a **v2.2.45**.

## v2.3.42 · Retirada de Webcam El Perchel

- Se elimina el botón **Webcam El Perchel** de Alojamiento → Piscinas y servicios.
- La migración también descarta automáticamente cualquier configuración antigua guardada para `el-perchel`, para que el botón no reaparezca aunque el usuario ya hubiera personalizado ese bloque.
- Se mantiene **Webcam Santa Águeda** y toda la información/orden/gráficos de piscinas sin cambios.


## v2.3.41 · Fotograma El Perchel siempre fresco

- Corrige el fotograma atrasado de **Webcam El Perchel**: el Worker añade un parámetro anti-caché a la petición que hace a Skyline y solicita explícitamente `no-cache/no-store` al origen.
- La respuesta de imagen del Worker también se entrega con `Cache-Control`, `CDN-Cache-Control` y `Surrogate-Control` en `no-store`, evitando que Cloudflare o el navegador reutilicen una imagen de horas anteriores.
- El popup mantiene la recarga automática y añade además su propio parámetro único en cada carga.
- Worker principal actualizado a **v2.2.42**.

## v2.3.40 · El Perchel: bloqueo definitivo de páginas completas

- Corrige el validador móvil: ya no exige que El Perchel use obligatoriamente el JPG fijo `embed.skylinewebcams.com/img/3937.jpg`.
- La webcam de El Perchel usa una **lista blanca estricta**: solo acepta streams `.m3u8`/`.mp4` o un embed inequívoco de Skyline; cualquier página normal de CanariasLife/Skyline queda bloqueada.
- Se elimina para El Perchel el fallback a la Function antigua que podía volver a cargar una web completa. Si Skyline no expone un directo incrustable, se usa el fotograma oficial como respaldo.
- Worker principal actualizado a **v2.2.41** y versión pública, caché PWA y assets sincronizados en v2.3.40.


## v2.3.37 · El Perchel sin iframe: fotograma oficial directo

- El popup de **Webcam El Perchel** deja de consultar CanariasLife y deja de aceptar cualquier iframe.
- Usa directamente el fotograma oficial publicado por SkylineWebcams para esta cámara (`embed.skylinewebcams.com/img/3937.jpg`).
- La imagen se refresca cada 5 minutos y el popup se etiqueta como **FOTOGRAMA ACTUALIZADO**.
- Con este cambio no existe ninguna ruta de código capaz de cargar la página completa de CanariasLife dentro del popup de El Perchel.
- No cambia el Worker principal: se mantiene **v2.2.40**.

## v2.3.36 · Webcam El Perchel: solo cámara, nunca página completa

- Corrige el caso visto en Android donde el popup cargaba la página completa de CanariasLife dentro de un iframe.
- El Worker rechaza explícitamente páginas normales de CanariasLife y Skyline como candidatos de reproductor.
- Solo se aceptan streams directos, iframes de reproductor reales o imágenes/fotogramas de webcam.
- La app añade una segunda protección: si alguna respuesta vuelve a parecer una página completa, solicita automáticamente el modo fotograma.
- CanariasLife permanece como fuente principal y SkylineWebcams como respaldo.
- Worker principal: **v2.2.40**.

## v2.3.27 · Piscinas en directo y webcams integradas
- **Alojamiento → Piscinas y servicios** deja de ser un listado estático y consume los controles diarios de Galileus/SILOE para Cordial Santa Águeda y Perchel Beach Club.
- La app muestra cada piscina con **temperatura destacada**, hora/fecha de medición y todos los parámetros publicados por la fuente (pH, cloro y demás campos disponibles).
- Se guarda histórico cuando cambian las mediciones y se dibuja un **gráfico de evolución de temperatura** por piscina.
- La lectura se realiza desde Firebase Functions para no exponer el token de la fuente en el navegador y evitar CORS. Se refresca bajo demanda y automáticamente varias veces al día.
- El actualizador Windows y el flujo de actualización desde Android publican ahora también **Firebase Functions**, necesario para este bloque vivo.
- Se añaden botones **Webcam Santa Águeda** y **Webcam El Perchel**. Abren un popup interno e intentan usar el reproductor/stream directo expuesto por In2theBeach y SkylineWebcams, sin navegar a la página completa del proveedor.

## v2.3.23 · Nueva pestaña Alojamiento

- Añade una pestaña principal **Alojamiento** inmediatamente después de Portada.
- Reúne estancia, fechas, reserva, importe, documentación, planos/instrucciones, mapa y accesos del resort en un único lugar.
- Añade acceso directo a la **guía del huésped de Cordial** para consultar piscinas y servicios con la información diaria del resort.
- La pestaña se activa automáticamente también para instalaciones que ya tenían datos persistidos de versiones anteriores.
- No modifica Workers.


- El título del grupo automático **Autobús aeropuerto** de Presupuesto toma el mismo degradado y color de texto que la ficha de autobús configurada en Datos del viaje / Portada.
- Si se cambia el degradado desde el propio grupo de Presupuesto, el cambio se sincroniza también con la ficha del autobús, evitando que al recargar vuelva al azul legado.
- La migración corrige automáticamente grupos antiguos que seguían conservando el azul por defecto.
- El color del total/gráfico del grupo sigue siendo independiente.
- No modifica Workers.

## v2.3.21 · Tarjetas de embarque desde Google Drive en móvil

- Corrige el bloqueo visto en Android al seleccionar una tarjeta de embarque desde Google Drive: la app ya no intenta descargar y volver a subir el archivo a Firebase Storage antes de guardarlo.
- Las tarjetas seleccionadas desde Drive se guardan inmediatamente mediante su identificador de Google Drive y se abren con la autorización de la cuenta conectada.
- Se mantienen intactas las opciones de subir un archivo local, añadir enlaces y ordenar/eliminar archivos.
- No modifica Workers.


## v2.3.20 · Colores canarios en el guardado OCR de Compra real

- El botón **Guardar compra** de la revisión OCR usa explícitamente el degradado azul-amarillo de Gran Canaria.
- **Guardar sin OCR** mantiene el mismo estilo canario de los demás botones de guardado.
- **Hacer OCR** se muestra también como acción principal canaria para que el flujo quede visualmente uniforme.
- No modifica Workers.

## v2.3.19 · Ocultar documentos y reservas individualmente

- Portada: cada ficha de «Documentos y reservas» (Avanza Gipuzkoa, Vueling, AutoReisen, alojamiento, etc.) tiene su propio ojo blanco de visibilidad.
- Ocultar una ficha ya no oculta el bloque completo de documentos.
- «Elementos ocultos» muestra cada ficha documental por separado y permite restaurarla en su posición original.
- Se elimina cualquier ocultado global heredado de «Documentos y reservas» para evitar que desaparezcan todas las fichas a la vez.
- Configuración marca «Documentos y reservas» como visibilidad individual, igual que «Transportes y vuelos».
- No cambia ningún Worker.


## v2.3.18 · Ocultar transportes individualmente

- Portada: el bloque «Transportes y vuelos» ya no se oculta de forma conjunta.
- Cada autobús y cada vuelo tiene su propio ojo blanco de visibilidad junto al botón de edición.
- Se puede ocultar, por ejemplo, solo el autobús, solo el vuelo de ida o solo el vuelo de vuelta.
- «Elementos ocultos» muestra cada transporte por separado y permite recuperarlo en su posición original.
- Al actualizar desde una versión que tenía oculto el bloque global «Transportes y vuelos», ese ocultado global se elimina para evitar dejar todos los transportes inaccesibles.
- Configuración indica que la visibilidad de Transportes y vuelos es individual.
- No cambia ningún Worker.

## v2.3.17 · Desmarcar toda una columna de maleta
- Añade **Desmarcar todas** al pie de cada bloque/columna de Maleta común, Mikel y Nerea.
- Al pulsarlo se desmarcan todos los elementos de ese bloque y cada uno vuelve automáticamente a su posición normal entre los elementos no marcados.
- Conserva el bloque visible del carrusel y la posición vertical al actualizar.
- No modifica Workers.


## v2.3.16 · PDF de maletas en una sola página A4
- El PDF de Maleta común / Mikel / Nerea deja de usar un marco fijo de 283 mm escalado por JavaScript.
- En Android y otros visores que ignoran la orientación solicitada, el diseño se adapta al 100% del ancho real disponible de la hoja en vez de quedar encogido.
- Mantiene las tres columnas de grupos y permite que el sistema de impresión decida el tamaño/orientación sin márgenes laterales artificiales.
- No modifica Workers.


## v2.3.14 · Ojos de visibilidad en Portada
- Con edición desbloqueada, cada bloque visible de Portada muestra un botón de ojo para ocultarlo.
- Los carruseles de Portada se pueden ocultar individualmente.
- Al final de Portada aparece, solo en modo edición, la lista de elementos ocultos con un ojo para restaurarlos en su posición original.
- No modifica Workers.

## v2.3.14 · Ajustes móviles de autobús y alojamiento
- En móvil vertical, Fecha / Línea / Duración del autobús comparten una sola fila.
- La foto del alojamiento vuelve a respetar margen lateral, padding visual y bordes redondeados en móvil.
- Sin cambios de Workers.

## v2.3.14 · Aena por API pública + fallback web
## v2.3.14 · Rendimiento, Drive rápido, PDF móvil compacto y fondo navy
- Corrige la Portada vacía causada por una referencia fuera de ámbito al icono de Cordial.
- Restablece los botones de alta solicitados con el degradado azul/amarillo oficial de Gran Canaria.
- PDF y Excel de productos extraídos de tickets pasan a mostrarse solo como iconos.
- Simplifica Configuración → Actualización desde ZIP eliminando textos explicativos redundantes.
- No modifica Workers.

## v2.3.4 · Actualizador móvil endurecido + validación de versión dinámica

- Estrena la rama **2.3** manteniendo intacto el actualizador estable recuperado en v2.2.213.
- Allí donde ya se podía cambiar el color o degradado de una cabecera, añade también **Color del texto del título**.
- Incluye Presupuesto, Maletas y subgrupos, Lista de la compra, Seguimientos, fichas de Portada (vuelos, autobús, alojamiento y documentos), contactos de Emergencia y los presets de Diseño.
- Los encabezados de los PDF de Presupuesto y Lista de la compra respetan también el color de texto configurado.
- Los datos existentes conservan texto blanco por defecto, así que la actualización no altera visualmente lo ya configurado hasta que el usuario cambie ese color.
- Mantiene el Worker principal **v2.2.32** y Vueling **v1.0.32**; no incluye `ACTUALIZAR_WORKERS.bat`.

## v2.2.185 · Maletas: preparados abajo sin perder la posición

- Al marcar un elemento como preparado vuelve a colocarse al final de su bloque inmediatamente.
- Al desmarcarlo recupera su posición relativa original entre los elementos pendientes.
- La reordenación se hace solo dentro del bloque visible, sin renderizar toda la pantalla: se conserva el bloque del carrusel y la posición vertical.
- Si el guardado falla, el elemento vuelve a su estado y orden anterior.
- No modifica Workers.

## v2.2.184 · Actualizador móvil con arranque verificado de GitHub Actions

- Refuerza la subida del ZIP y la detección del workflow de GitHub Actions.
- Introduce el Worker principal **2.2.27**.

## v2.2.183 · Maletas: marcar sin perder la posición

- Evita que el carrusel vuelva al primer bloque al marcar o desmarcar un elemento.
- Actualiza el progreso del bloque y el progreso global sin render completo.

## v2.2.182 · Selector ZIP compatible con Android

- El selector de archivos queda persistente en la página para que Chrome/Android lo abra directamente desde el gesto del usuario.

## v2.2.181 · Maletas: progreso global, carrusel y «Mover a»

- Añade la barra de progreso global de cada maleta.
- En móvil/tablet los bloques se recorren horizontalmente con `scroll-snap` bloque a bloque.
- Añade el icono ⇄ para mover elementos entre Maleta común, Maleta Mikel, Maleta Nerea y sus bloques.

## v2.2.180 · Fecha de última actualización en Seguimientos

- Muestra la fecha/hora de la última consulta junto al botón ↻ de AutoReisen, Cordial y Vueling.

## v2.2.179 · Logo PNG real en el login

- Corrige el fallback de texto «26» y usa el PNG real de GC 26 en la pantalla de acceso.

## v2.2.178 · Migración definitiva del login a GC 26

- Corrige la identidad antigua guardada en Android incluso cuando el emoji del avión está almacenado como `✈` en lugar de `✈️`.
- Cualquier identidad residual llamada **MFE Viajes** se migra automáticamente a **GC 26** antes de mostrar el login.
- El login vuelve a usar el logo de Gran Canaria con el **26** incluso si el navegador conserva datos locales de versiones anteriores.
- Fuerza una nueva caché de HTML, JavaScript, CSS, manifest y Service Worker.
- No modifica Cloudflare Workers.

## v2.2.177 · Identidad GC 26 también antes de iniciar sesión

- La pantalla de acceso usa **GC 26** y el logo de Gran Canaria por defecto, incluso en un navegador nuevo o sin datos locales.
- Migra automáticamente el antiguo fallback **MFE Viajes + ✈️** guardado en el navegador, que podía seguir apareciendo antes de iniciar sesión.
- Mantiene la identidad personalizada configurada por el usuario: si existe un nombre o logo personalizado real, no se sustituye.
- Actualiza también el nombre del manifiesto PWA a **GC 26** y fuerza renovación de caché con la versión 2.2.177.
- No modifica Workers: principal **2.2.26** y Vueling **1.0.32**.

## v2.2.176 · Corrección crítica de arranque

- Corrige el bloqueo en la pantalla inicial que dejaba la app permanentemente en **GC 2026** con la barra de carga.
- La causa era una declaración duplicada de `applyIdentityLogo()` en `app.js`; al cargarse como módulo ES, el navegador detenía la ejecución antes de iniciar Firebase y nunca ocultaba la pantalla de arranque.
- Se mantiene intacta la identidad dinámica del login, incluido el logo personalizado configurado en la app.
- La validación de la release comprueba ahora `app.js` explícitamente como **módulo ES**, para detectar este tipo de duplicados antes de publicar.
- No modifica Workers: principal **2.2.26** y Vueling **1.0.32**.

## v2.2.175 · Identidad dinámica también en la pantalla de acceso

- Corrige el paquete anterior para que pase la validación del actualizador móvil.
- El borde de la cuenta atrás usa una franja continua con el amarillo y azul de la bandera de Gran Canaria.
- La línea bajo la cabecera usa la misma división amarillo/azul.
- «Diagnóstico», «Preparar GitHub», «Progreso» y «Comprobar» recuperan su estilo original; «Seleccionar ZIP y actualizar» recupera el botón principal original.
- «Guardar cambios» y los botones «Guardar y sincronizar» de Seguimientos mantienen el degradado azul → amarillo, sin blanco.
- No modifica Workers: principal 2.2.26 y Vueling 1.0.32.

## v2.2.177 · Ajuste final del degradado canario en Guardar cambios

- Devuelve a sus colores originales/configurados los botones de fichas, seguimientos, gasolineras, Drive, accesos y acciones de contenido.
- Mantiene el degradado **azul #2382D7 → blanco #FFFFFF → amarillo #F6D43B** únicamente en los botones **Guardar cambios** de Configuración, incluido el botón flotante principal.
- El botón flotante de Guardar cambios ahora se mantiene claramente visible aun cuando no haya cambios pendientes.
- Las barras de progreso de maletas, compras y presupuesto conservan el color funcional de cada módulo; solo los progresos técnicos de ZIP, seguimientos, OCR/carga mantienen el degradado canario.
- Sin cambios de Workers: principal **2.2.26** y Vueling **1.0.32**.

## v2.2.172 · Recuperación de actualización móvil

- El diagnóstico de Workers/GitHub pasa a ser **solo informativo**.
- «Seleccionar ZIP y actualizar» ya **no ejecuta ni bloquea por diagnóstico previo**.
- Esto elimina el bloqueo circular cuando la app nueva necesita publicar precisamente unos Workers antiguos.
- Sigue incluyendo `ACTUALIZAR_WORKERS.bat` para reparar/publicar `mfe-viajes-precios` 2.2.26 y `mfe-viajes-vueling` 1.0.32.


## v2.2.171 · El diagnóstico ya no bloquea la reparación de Workers antiguos

- Corrige el bloqueo circular de «Actualización app»: un Worker principal 2.2.25 o Vueling 1.0.31 no conocen las nuevas acciones de diagnóstico, pero precisamente necesitan que el ZIP los actualice.
- Versiones antiguas y acciones de diagnóstico no disponibles se muestran ahora como **avisos**, no como fallos bloqueantes.
- La subida del ZIP continúa aunque el prediagnóstico tenga avisos; la llamada real de subida a GitHub sigue siendo la validación definitiva de credenciales.
- Si GitHub rechaza realmente el token durante la subida, la app conserva el error real y no lanza el workflow.
- Mantiene en el ZIP `ACTUALIZAR_WORKERS.bat` para publicar Worker principal **2.2.26** y Worker Vueling **1.0.32**.

## v2.2.170 · Reparación de publicación de Workers

- Corrige el paquete v2.2.159: aquella release no incluyó `ACTUALIZAR_WORKERS.bat`, por lo que la actualización móvil podía publicar Firebase pero saltarse Cloudflare aunque la app exigiera Worker principal **2.2.26** y Vueling **1.0.32**.
- Esta release vuelve a incluir explícitamente el actualizador de Workers para forzar la reparación/publicación y verificar ambos `workers.dev`.
- No cambia la lógica de los Workers: las versiones esperadas siguen siendo **2.2.26** y **1.0.32**.
- Los mensajes de la app explican ahora cuándo la interfaz está actualizada pero el Worker remoto ha quedado atrás.

## v2.2.159 · Actualización directa desde los cuadros resumen

- Los cuadros resumen superiores de **AutoReisen, Cordial y Vueling** incorporan ahora un botón **↻** en la esquina superior derecha.
- El botón lanza directamente la comprobación real del seguimiento sin tener que bajar hasta la ficha completa.
- Durante la ejecución el icono gira y queda desactivado para evitar lanzamientos duplicados.
- El progreso detallado sigue mostrándose en la ficha del seguimiento con porcentaje, pasos y diagnóstico, igual que en v2.2.158.
- No modifica Workers: se mantienen Worker principal **2.2.26** y Worker Vueling **1.0.32**.

## v2.2.158 · Progreso en vivo de seguimientos + diagnóstico de Workers/GitHub

- AutoReisen, Cordial y Vueling muestran ahora el progreso real de GitHub Actions paso a paso, con porcentaje, pasos completados, paso activo, fallo y acceso al log completo.
- Gasolineras muestra también el progreso de su consulta directa al Worker: solicitud, procesado y guardado/mapa.
- El progreso de AutoReisen/Cordial/Vueling se conserva al salir de Seguimientos y se reanuda al volver mientras la ejecución siga activa.
- Configuración → Actualización app incorpora un diagnóstico previo de Worker principal, GitHub principal, Worker Vueling y GitHub Vueling. Antes de subir un ZIP se ejecuta automáticamente el diagnóstico principal.
- El Worker Vueling traduce HTTP 401/403 de GitHub a mensajes claros: token caducado/revocado o permisos insuficientes.
- Worker principal **2.2.26**; Worker Vueling **1.0.32**.

## v2.2.157 · Elementos marcados al final sin perder su orden

- **Maletas**: al marcar un elemento como preparado baja automáticamente al final de su bloque; al desmarcarlo vuelve a su posición manual original.
- **Lista de la compra**: al marcar un producto como comprado baja al final de su supermercado; al desmarcarlo vuelve a su posición manual original.
- El cambio es solo visual: marcar/desmarcar no reordena los arrays guardados, así que se conserva el orden manual y el drag & drop existente.
- No modifica Workers.

### v2.2.156 · Momento final configurable de la cuenta atrás

- La cuenta atrás deja de estar obligatoriamente ligada al inicio del viaje.
- Nuevo campo **Momento final de la cuenta atrás** en el editor rápido de la Portada y en **Configuración → Contenido → Cuenta atrás e imágenes**.
- Si el campo se deja vacío, se conserva el comportamiento anterior y el objetivo vuelve a ser **Inicio del viaje / vuelo**.
- No modifica ningún Worker.

## v2.2.143 · Iconos de Seguimientos más intuitivos y PNG persistente

- **AutoReisen, Cordial y Vueling** incluyen ahora el icono directamente dentro de sus propios editores de configuración.
- Cada ficha de Seguimientos añade además un botón **🖼 Icono** junto a Configurar/Reserva para cambiarlo sin buscarlo en Configuración general.
- En **Editar alojamiento** se puede cambiar también el icono de **Cordial/Alojamiento** que aparece en la pastilla-resumen y en la cabecera del seguimiento.
- Los iconos seleccionados desde **Google Drive** se descargan y convierten a **PNG 128×128 embebido**, conservando transparencia y sin depender después de permisos/URLs de Drive o Firebase Storage.
- La **Imagen manual del coche** de AutoReisen queda claramente identificada como foto del vehículo y no como icono del seguimiento.
- Se mantiene también el editor central en **Configuración → Seguimientos**.
- **No modifica ningún Worker**. `ACTUALIZAR_MFE.bat` publicará únicamente Firebase Hosting.

## v2.2.142 · Amanecer y atardecer en la previsión diaria

- Cada tarjeta diaria de **Tiempo** muestra ahora la hora de **amanecer 🌅** y **atardecer 🌇**.
- Los horarios se obtienen directamente de **Open-Meteo** usando la zona horaria del destino (`timezone=auto`).
- Se mantienen los 7 días de previsión y el diseño compacto de las tarjetas.
- **No modifica ningún Worker**. `ACTUALIZAR_MFE.bat` omitirá la actualización de Cloudflare y publicará únicamente Firebase Hosting.
- Se conservan los cambios de v2.2.141: reparación de Cordial y pastillas-resumen superiores de Seguimientos.

## v2.2.131 · Icono Android con fondo oscuro
- Los cinco accesos rápidos de Alojamiento mantienen un ancho mínimo uniforme en escritorio para evitar que Booking se vea más estrecho que Google o Tripadvisor.
- Cuando Cloudflare tenga que lanzar seguimientos ausentes, el aviso indica expresamente que las automatizaciones principales no se ejecutaron y que Cloudflare lanzó el respaldo, mostrando los seguimientos afectados.

## v2.2.131 · Arrastre directo en Portada y Compra real

- Se eliminan las flechas **↑ / ↓** de reordenación y se sustituyen por un único asa **⋮⋮** para arrastrar directamente cada elemento a su nueva posición.
- La reordenación libre se aplica a los lugares que ya permitían cambiar orden: documentos de Portada, bloques de Presupuesto, productos de Lista de la compra, Tareas, Documentación oficial, Seguimientos, navegación, orden de Portada, carruseles, transportes/alojamiento, supermercados, secciones de Datos viaje y gestores de archivos.
- En **Maletas**, los elementos pueden arrastrarse a cualquier posición y también **cambiar de bloque** dentro de la misma maleta.
- El arrastre funciona con ratón y mediante Pointer Events en tablet/móvil; al arrastrar cerca del borde superior o inferior se ayuda al desplazamiento de listas largas.
- No se modifica ningún Worker.


## v2.2.116 · Alojamiento unificado

- Los accesos **Web, Cómo llegar, Google, Tripadvisor y Booking** aparecen juntos a la derecha de las fechas en escritorio, con adaptación automática en tablet y móvil.
- Los desplegables de **Plano / Instrucciones** quedan inmediatamente debajo. Cerrados respetan la fotografía situada a la derecha; al abrir uno, su visor se extiende a todo el ancho de la ficha y queda visualmente por encima de la zona de imagen.
- Solo puede mantenerse **un desplegable abierto a la vez** para evitar una ficha excesivamente larga.
- **📍 UBICACIÓN · SATÉLITE** pasa a formar parte de la propia ficha Alojamiento, debajo de los desplegables. Deja de existir como tarjeta independiente de la Portada.
- Se conserva la opción de mover cada carrusel entre **Portada** y **Alojamiento** desde Configuración.
- No se modifica ningún Worker.

## v2.2.107 · Tripadvisor España

- El botón de **Tripadvisor** del alojamiento migra automáticamente los enlaces antiguos `tripadvisor.com` a **`tripadvisor.es`**.
- El enlace predeterminado del Resort Cordial Santa Águeda usa la ficha española indicada para el hotel.
- En Android se mantiene el intento de apertura de la app de Tripadvisor; la URL web de respaldo queda en español.

## v2.2.107 · Plano e instrucciones dentro de Alojamiento

- Cada carrusel de imágenes/PDF puede estar **fuera en la Portada** o **dentro de la ficha Alojamiento**.
- Dentro de Alojamiento se muestra como un **desplegable cerrado**, conservando imágenes, PDF, navegación y selección de página.
- Los carruseles existentes cuyo título contiene **Plano** o **Instrucciones** pasan inicialmente a Alojamiento; desde Configuración se pueden devolver a Portada en cualquier momento.
- Configuración → Contenido muestra un selector **Portada / 🏨** por carrusel. El ancho ½ / 1/1 sigue aplicándose únicamente cuando el carrusel está fuera en Portada.
- El estado abierto del desplegable se conserva al avanzar o retroceder dentro del carrusel durante la sesión.

## v2.2.106 · Reparación y verificación del Worker principal

El estado vigente de Cloudflare pasa a Worker principal **2.2.26** y Worker Vueling **1.0.32**. La v2.2.158 modifica el Worker principal y el Worker Vueling.

## v2.2.103 · Centro de integraciones con clics blindados
- Los botones **Comprobar** y **Actualizar estados** usan delegación global de clics, por lo que siguen funcionando aunque el panel de Configuración se vuelva a renderizar.
- Cada comprobación muestra feedback inmediato **Comprobando…** en el propio botón y un aviso de estado.
- Cloudflare/GitHub incorporan timeout de 8 segundos para evitar botones aparentemente bloqueados cuando el Worker no responde.
- No modifica ningún Worker.

## v2.2.102 · Estado de Drive más claro y selector más rápido
- El Centro de integraciones distingue explícitamente **Persistente · cuenta**, **Temporal · cuenta** y **Listo para conexión persistente**.
- Si el Client Secret está disponible pero la sesión actual es temporal, aparece **Activar persistencia** en lugar de dar la conexión por permanente.
- El token temporal de Drive se conserva en `sessionStorage` durante la pestaña, por lo que los selectores vuelven a abrir mucho más rápido tras refrescar.
- Las comprobaciones de estado/token persistente se limitan a 4 segundos para no retrasar el navegador de Drive si Cloudflare no responde.
- No modifica ningún Worker.

## v2.2.102 · Selector de cuenta de Google Drive inmediato
- Corrige el botón **Cambiar cuenta / acceso** del navegador de Drive, que podía quedarse indefinidamente en «Abriendo…» en Firefox.
- Google OAuth se inicia como primera operación del clic, sin esperar antes al Worker ni a otras consultas asíncronas, evitando el bloqueo de popups tardíos.
- Google Identity se precarga en segundo plano al abrir el navegador de Drive; el botón muestra **Preparando acceso…** hasta que está realmente listo.
- El cambio de cuenta utiliza un token temporal directo para navegar inmediatamente; la sesión persistente continúa siendo independiente y opcional.
- No modifica ningún Worker.


## v2.2.102 · Formato monetario español uniforme
- Todos los importes visibles fuerzan el formato español con separador de millares incluso en cantidades de cuatro cifras: `1.647,88 €`, `10.000,00 €`, etc.
- Los importes monetarios muestran siempre dos decimales y mantienen el símbolo de euro con el espaciado español.
- Portada, Presupuesto, tablas, PDFs, Lista de la compra, Extras y Seguimientos comparten el mismo formateador monetario.
- Los precios de combustible y distancias visibles pasan también a coma decimal española.
- No modifica ningún Worker.


## v2.2.98 · KPIs de Presupuesto unificados con Portada
- Presupuesto usa el mismo orden que Portada: Presupuesto total, Total por persona, Pagado y Por pagar.
- Las cuatro tarjetas comparten el mismo estilo visual; Pagado y Por pagar incluyen los donuts con porcentaje real.
- Las dos primeras tarjetas quedan centradas verticalmente igual que en Portada.
- Se eliminan los importes secundarios por persona de Pagado/Por pagar para mantener equivalencia visual con Portada.


## v2.2.98 · Alineación vertical de KPIs en Portada
- Las tarjetas **Presupuesto total** y **Total por persona** centran verticalmente su contenido para quedar alineadas con **Pagado** y **Por pagar**.
- No cambia el tamaño de las tarjetas ni los gráficos circulares.
- No se modifica ningún Worker.

## Distribución de Portada en escritorio · v2.2.48

- Nuevo botón **Editar distribución** en Portada para administradores/usuarios con permiso de edición.
- En ordenadores (≥ 1100 px) cada bloque puede configurarse como **ancho completo** o **media fila**, permitiendo colocar dos bloques por fila.
- Los bloques se pueden **reordenar arrastrando y soltando** mientras el modo de distribución está activo.
- La distribución de escritorio se guarda en Firebase de forma independiente; **tablet y móvil conservan la disposición actual** y el orden normal de Portada.
- Incluye **Restaurar escritorio** para volver al orden normal y todos los bloques a ancho completo.
- Los bloques complejos (vuelos, alojamiento, cuenta atrás, documentos) adaptan internamente su maquetación cuando se usan a media fila para evitar contenido demasiado estrecho.

## Menú sincronizado con el viaje · v2.2.48

- Los días de la pestaña **Menú** se generan automáticamente con todas las fechas comprendidas entre el inicio y el fin configurados en **Datos del viaje** (ambos inclusive).
- Si cambian las fechas del viaje, el Menú se reajusta conservando los platos y notas de las fechas que sigan coincidiendo.
- Cada día permite ocultar de forma independiente **Desayuno**, **Comida** y **Cena**. Una comida oculta desaparece tanto de la pestaña Menú como del PDF.
- Los días ya no se añaden o eliminan manualmente: la fuente de verdad son las fechas generales del viaje.

## Cambios

- **Nuevo Histórico de precios de Lista de la compra**, accesible desde la propia Lista sin crear una pestaña nueva en el menú principal.
- Guarda hasta **180 comprobaciones** compactas y hasta **1.000 cambios de precio**, con evolución del total combinado, total por supermercado y precio unitario por producto.
- La página histórica mantiene **logos de supermercados y fotos de productos**, añade filtros por supermercado, producto y periodo, gráficos por supermercado y producto, y un registro cronológico de cambios.
- Después de cada actualización se muestran claramente los productos que han cambiado, con **precio anterior, precio nuevo, diferencia en euros y porcentaje**.
- Frecuencia configurable: **una vez al día**, **cada 2 días** o **solo manual**. La comprobación automática se ejecuta cuando la app está abierta; si estaba cerrada, la revisión pendiente se lanza en la siguiente apertura.
- El PDF A6 de la Lista de la compra fuerza que **cada supermercado empiece en una página nueva**; si un supermercado necesita varias páginas, puede continuar en las siguientes.
- Los iconos de los títulos de **AutoReisen, Cordial, Vueling y Gasolineras** ya se pueden personalizar con emoji, **imagen de Google Drive** o **archivo local**, y restaurar al icono predeterminado.
- El gráfico de Vueling diferencia mejor series casi superpuestas (por ejemplo Vuelta 151,98 € y Maleta 152,00 €) mediante trazo, marcador y etiqueta final distintos, sin modificar los valores reales.
- Se mantienen la comparación automática con Presupuesto y la sincronización de datos generales del viaje.
- Estado actual: Worker principal **2.2.26** y Worker Vueling **1.0.32**.


### Novedades v2.2.48

- PDF de Presupuesto: eliminado el subtítulo “Financial travel brief” y el resumen de vuelos; maquetación compacta en dos columnas para concentrar el presupuesto completo en una sola hoja A4 cuando los datos actuales lo permiten.
- PDF de Menú: eliminado “Taste plan · Gran Canaria”, conservando el encabezado editorial.
- PDF de Maletas: nuevo encabezado editorial amarillo con detalles azul marino, invirtiendo la combinación cromática del Menú.
- PDF de Lista de la compra: encabezado modernizado con el mismo lenguaje visual azul/amarillo del Menú.


- **Presupuesto → Exportar PDF**: documento A4 vertical tipo dashboard, compacto en una sola hoja con los datos actuales, resumen de total/pagado/pendiente/por persona, distribución por categorías y desglose completo por grupos.
- **Menú → Exportar PDF**: documento **A4 horizontal** diseñado para ocupar todo el folio, con todos los días distribuidos en tarjetas editoriales y desayuno/comida/cena claramente diferenciados.
- Ambos PDF reutilizan los datos actuales del viaje y mantienen Livvic mediante Google Fonts.
- Estado actual: Worker principal **2.2.26** y Worker Vueling **1.0.32**.

## Despliegue

La **v2.2.155 no modifica ningún Worker**. `ACTUALIZAR_MFE.bat` validará la versión y publicará únicamente Firebase Hosting.

Tras el despliegue, el Worker principal debe responder **2.2.26**, el Worker de Vueling **1.0.32** y el footer debe mostrar **MFE Viajes · v2.2.158**.

## v2.2.98 · Gráficos circulares de presupuesto en Portada
- Las tarjetas **Pagado** y **Por pagar** de Portada incorporan gráficos circulares tipo donut calculados con las proporciones reales respecto al presupuesto total.
- **Pagado** usa un degradado verde/turquesa y **Por pagar** un degradado coral/rosa, manteniendo el importe principal como protagonista.
- El porcentaje aparece dentro del gráfico y se actualiza automáticamente al cambiar el presupuesto.
- Se mantiene el comportamiento responsive para escritorio, tablet y móvil.
- No cambia ningún Worker.

## v2.2.98 · Confirmación fiable del selector de Google Drive
- El botón **Seleccionar** del navegador interno de Drive reutiliza el mismo access token con el que ya se ha navegado y listado los archivos, evitando una segunda renovación OAuth al confirmar.
- La selección de PNG/PDF deja de quedar bloqueada si la comprobación persistente del Worker falla después de haber abierto correctamente Drive.
- Si el token de navegación hubiera caducado, el selector permanece abierto y pide renovar explícitamente desde **Cambiar cuenta / acceso**, sin lanzar popups tardíos.
- El cambio es global para todos los selectores de Drive de la app.
- No cambia ningún Worker.

## v2.2.93 · Selector de Google Drive global resistente
- Corrige una regresión global por la que los botones de **Google Drive** podían parecer inactivos si la comprobación de sesión persistente del Worker quedaba esperando respuesta.
- El navegador de Drive se abre **inmediatamente al pulsar cualquier botón**, mientras el estado de la sesión se comprueba en paralelo.
- Todas las llamadas autenticadas al Worker de integraciones incorporan ahora un **timeout controlado**, evitando esperas indefinidas.
- Si Drive necesita renovar permisos de navegación, la app ya no intenta abrir un segundo popup OAuth automáticamente: mantiene el navegador abierto y muestra **Cambiar cuenta / acceso**, que se ejecuta mediante un clic real del usuario y no puede ser bloqueado como popup tardío.
- Los errores de Drive se muestran dentro del propio navegador de archivos, con opción visible para reconectar la cuenta.
- La corrección es global: afecta a iconos, PDF, Documentos oficiales, carruseles, tickets, imágenes y cualquier otro selector de Drive de la app.
- No requiere actualizar Workers.

## v2.2.92 · Cordial resistente al nuevo panel de cookies
- El diagnóstico real del 29/08 mostró que Cordial fallaba porque el iframe `/cookies/manager` quedaba bloqueando la página sin exponer a tiempo un botón de aceptación.
- La automatización Cordial pasa a **2.2.09**: espera explícitamente el iframe, amplía los selectores de consentimiento y añade un cierre de respaldo mediante las APIs de cookies/Magnific Popup del propio sitio.
- Si aun así la capa permanece, retira únicamente el overlay bloqueante del DOM para permitir usar el formulario ya cargado.
- Worker principal **2.2.19**; Vueling continúa en **1.0.30**.
- Mantiene el respaldo automático diario de seguimientos añadido en 2.2.18.

## v2.2.90 · Cloudflare sin `whoami` ni `auth token`
- El actualizador crea un perfil OAuth aislado en `%LOCALAPPDATA%\MFE_Viajes\cloudflare-auth`, eliminando interferencias con sesiones/credenciales antiguas de Wrangler.
- Se fija **Wrangler 4.119.0** y se ejecuta una sola vez para `login --device --no-use-keyring`; después no vuelve a invocarse Wrangler.
- El token `oauth_token` se lee directamente del `default.toml` generado por el login y se usa contra la API oficial de Cloudflare.
- Si Windows muestra el `Assertion failed ... UV_HANDLE_CLOSING` al terminar Wrangler pero el token ya quedó escrito, el proceso puede continuar de forma segura.
- Antes de publicar se comprueba que existe `MFE_TRACKERS`; después se verifican de nuevo bindings, Worker **2.2.19**, `monitorFallback` y la respuesta real del endpoint.
- `ACTUALIZAR_MFE.bat` continúa siendo el único archivo que debe ejecutarse.

## v2.2.89 · Login Cloudflare automático y actualización verificada en Windows
- Corrige el error «Not logged in» observado al ejecutar la actualización en un equipo sin una sesión activa de Wrangler.
- `ACTUALIZAR_WORKERS.bat` comprueba `wrangler whoami`; si no hay sesión, lanza automáticamente `wrangler login --device --no-use-keyring`, espera la autorización y vuelve a verificar la sesión. Si el flujo por dispositivo falla, intenta el OAuth normal como respaldo.
- El script PowerShell captura stdout y stderr de Wrangler con `Start-Process`, evitando que Windows PowerShell 5 convierta mensajes de un programa nativo en `NativeCommandError` al usar `ErrorActionPreference=Stop`.
- El despliegue conserva en modo estricto KV, secretos y variables del Worker actual, instala los Cron Triggers mediante la API oficial y verifica por HTTP la versión **2.2.19**, `monitorFallback` y `MFE_TRACKERS` antes de permitir Firebase.
- `ACTUALIZAR_MFE.bat` sigue siendo el único archivo que hay que ejecutar.

## v2.2.87 · Respaldo automático de Seguimientos
- Se mantienen los horarios normales de GitHub Actions: **AutoReisen 06:30**, **Cordial 06:35** y **Vueling 06:40**, en `Europe/Madrid`.
- El Worker principal **2.2.19** añade una segunda capa de seguridad: después de las **07:15 (Europe/Madrid)** comprueba en GitHub si existe alguna ejecución del día para cada uno de los tres workflows.
- Si falta un seguimiento, Cloudflare lanza únicamente ese workflow mediante `workflow_dispatch`; si ya existe una ejecución manual o programada, no crea otra.
- El control guarda el resultado diario en `MFE_TRACKERS` para evitar duplicados y permite un segundo intento si hubo un error parcial.
- La pestaña Seguimientos muestra el estado del respaldo y distingue cuándo Cloudflare tuvo que lanzar una ejecución ausente. Si la app se abre después de las 07:15 y la comprobación diaria aún no existe o quedó incompleta, un administrador autenticado fuerza también esa misma verificación como respaldo adicional.
- Los Cron Triggers de Cloudflare se publican a **05:20 UTC y 06:20 UTC**; el Worker aplica la hora local de Madrid y solo actúa a partir de las 07:15, cubriendo automáticamente CEST/CET.
- Se incluye **`ACTUALIZAR_WORKERS.bat`**, que actualiza solo `mfe-viajes-precios`, conserva variables/secrets remotos y usa el endpoint oficial `/content` de Cloudflare para sustituir únicamente el código y no tocar la configuración del Worker.
- Worker principal: **2.2.18**. Worker Vueling: **1.0.30** (sin cambios).

## Ajustes visuales del histórico de compra

- Corregido el padding interno de las tarjetas del Histórico de precios para que las esquinas redondeadas no invadan títulos ni textos, especialmente en móvil.
- Más espacio interior en las tarjetas del histórico para que las esquinas y el borde de color no invadan logo, título ni texto.
- Eliminada la cifra inferior duplicada en euros de los gráficos; se conserva el valor superior y las fechas.



## v2.2.83 · Textos personalizados del autobús persistentes
- Corrige la pérdida de los campos **Presupuesto · texto del concepto** y **Presupuesto · texto del detalle** después de refrescar o volver a cargar datos desde Firebase.
- La normalización del bloque Autobús conserva ahora `budgetTitle` y `budgetDetail`, de modo que un texto editado manualmente tiene prioridad sobre el texto automático.
- Se añade validación de regresión para impedir que estos campos vuelvan a eliminarse en futuras migraciones.
- No requiere actualizar Workers.

## v2.2.82 · Columnas de Presupuesto alineadas
- Se compactan **Horario / Duración / Vuelo** en el bloque Vueling para que **Importe** y **Estado** queden alineados con las demás tablas.
- Los datos de horario, duración y número de vuelo usan una tipografía ligeramente menor y más compacta.
- Los encabezados **IMPORTE** y **ESTADO** comparten exactamente el mismo tamaño y peso tipográfico en las tablas de Presupuesto.
- No requiere cambios en Workers.

## v2.2.82 · Vuelos integrados en filas y progreso de pago
- En **Presupuesto → Vuelo**, las filas de ida y vuelta incorporan directamente las columnas **Horario**, **Duración** y **Vuelo**; la fila de equipaje deja esas columnas vacías.
- Se elimina el bloque redundante **Datos de los vuelos** que aparecía debajo de la tabla de Vueling.
- Los encabezados **Importe** y **Estado** usan exactamente el mismo tamaño tipográfico en todas las tablas de Presupuesto.
- Debajo de los cuatro indicadores principales se añade una línea de **Progreso de pago**: el total del presupuesto es la referencia completa y el tramo ya pagado aparece relleno, con porcentaje e importes.
- No se modifican Workers.

## v2.2.79 · Botones uniformes y miniatura PDF global
- En las fichas de autobús, **Comprar billetes** y los botones de Google Maps comparten exactamente la misma altura y alineación.
- En Alojamiento, **Google, Tripadvisor y Booking** usan la misma altura de botón para que la fila quede uniforme.
- En **Reservas y documentos**, los botones de archivos y enlaces se muestran **uno por línea** dentro de cada tarjeta.
- Se incorpora el nuevo icono PDF proporcionado por el usuario como miniatura/icono visual para archivos PDF en toda la app (documentos oficiales, enlaces de archivos, navegador de Drive y carruseles PDF).
- No se modifican Workers.

## v2.2.48 · Gráficos de Seguimientos y diagnóstico GitHub
- Ejes horizontales más compactos en AutoReisen, Cordial y Vueling.
- Se eliminan las cifras laterales del eje Y: el importe exacto aparece al pasar el ratón o tocar cada punto.
- Tooltips interactivos por punto con serie, fecha/hora e importe.
- Vueling usa líneas simples y uniformes, sin trazos discontinuos ni etiquetas superpuestas.
- El Worker 2.2.15 traduce `Bad credentials` de GitHub a un diagnóstico claro del secreto `GITHUB_TOKEN`. La automatización AutoReisen sigue en 2.2.14; no cambia su flujo de navegador.


## v2.2.52 · horario unificado de Seguimientos
- AutoReisen se programa a **06:30**, Cordial a **06:35** y Vueling a **06:40**, siempre en **Europe/Madrid**.
- La app migra automáticamente los horarios anteriores: AutoReisen → 06:30, Cordial → 06:35 y Vueling → 06:40.
- Los workflows mantienen `timezone: Europe/Madrid` para respetar CET/CEST.

- Para aquella actualización de horario se utilizó Worker principal **2.2.17** y Worker Vueling **1.0.30**; la versión actual v2.2.90 sustituye el Worker principal por **2.2.18**.


## v2.2.52 · carruseles de Portada
- El orden configurado en Carruseles de imágenes y PDF se replica en la Portada de escritorio.
- Cada carrusel permite elegir directamente desde Configuración entre media fila (½) o fila completa (1/1) en ordenador.
- La cuadrícula recoloca automáticamente los carruseles por filas; tablet y móvil siguen en una sola columna.


## v2.2.53 · correcciones de Configuración y actualización con doble clic
- Corregido el botón **Añadir varias desde Drive** de Imágenes adicionales para que renderice el icono de Google Drive en lugar del texto literal `${driveIconMarkup()}`.
- Añadida una validación de regresión para detectar interpolaciones `${...}` mal introducidas dentro de fragmentos HTML entre comillas simples.
- Nuevo **ACTUALIZAR_MFE.bat** en la raíz del ZIP. Valida la versión y despliega Firebase Hosting con doble clic.
- Si una versión futura incluye **ACTUALIZAR_WORKERS.bat**, `ACTUALIZAR_MFE.bat` lo detectará y ejecutará antes de Firebase, de modo que el mismo archivo pueda centralizar toda la actualización.
- Si Firebase CLI no está instalado globalmente, intenta usar `npx firebase-tools` como alternativa.




## v2.2.78 · Autobús: adjuntos solo en documentos y Presupuesto sin compra
- La tarjeta principal del autobús en Portada ya no muestra los PDF/adjuntos; estos quedan centralizados en **Reservas y documentos** y en el gestor del trayecto.
- El bloque automático **Autobús aeropuerto** de Presupuesto mantiene los PDF asociados, pero deja de mostrar el botón/enlace **Comprar billetes**.
- El enlace de compra continúa disponible en la tarjeta del autobús de Portada y en la configuración del trayecto.
- No requiere cambios en Workers.

## v2.2.71 · Ficha y Presupuesto de autobús depurados
- La ficha **Autobús** de Reservas y documentos muestra solo los billetes/archivos reales de los trayectos y elimina pseudoarchivos antiguos como el botón «Autobús».
- El icono de la ficha documental y del encabezado automático de Presupuesto se toma siempre del **icono actual del trayecto**, evitando que quede una versión antigua en caché/configuración.
- Se amplía y protege la columna de acciones de **Presupuesto → Autobús aeropuerto** para que 📎, editar y sincronización no queden recortados por el borde.
- No requiere actualización de Workers.

## v2.2.71 · Billetes de autobús enlazados a Drive
- Se elimina de la tarjeta de Portada el texto fijo **«Autobús al aeropuerto antes del vuelo de ida.»**.
- Los PDF de billetes del autobús seleccionados desde Google Drive se guardan ahora como **enlaces persistentes por `driveFileId`**, sin intentar copiarlos a Firebase Storage.
- La selección múltiple de PDF se **guarda automáticamente** en el trayecto en cuanto se confirma en Drive y el gestor permanece abierto para seguir añadiendo, ordenar o renombrar archivos.
- El guardado usa el **ID estable del trayecto** en lugar de depender solo de su posición en la lista, evitando pérdidas si se reordenan los transportes.
- No cambia ningún Worker.

## v2.2.67 · Autobús ida/vuelta emparejado con vuelos
- La Portada deja de ordenar bus y vuelo solo por fecha: **IDA = autobús → vuelo** y **VUELTA = vuelo → autobús**.
- Si están visibles ambos autobuses, en escritorio se muestran en dos filas: **bus ida + vuelo ida** y **vuelo vuelta + bus vuelta**.
- Si solo hay un autobús visible, ese autobús ocupa fila completa y los dos vuelos permanecen juntos en su propia fila; el bus de vuelta queda después de los vuelos.
- Los autobuses de la misma compañía pueden reutilizar el icono/logo de Drive del otro trayecto cuando uno de ellos no tenga imagen propia, evitando que la vuelta vuelva al emoji por defecto.
- El mismo icono heredado se utiliza también en Presupuesto y en Datos del viaje.
- No requiere actualización de Workers.

## v2.2.66 · Autobuses, iconos Drive y rutas compactas
- Corrige el marcador **AUTO** del Presupuesto: ya no se parte verticalmente y se sustituye por un icono de sincronización **↻** más compacto.
- El botón de cambiar icono usa ahora **🖼️**, más intuitivo que el símbolo cuadrado anterior.
- Los iconos y logos enlazados mediante URLs privadas de Google Drive (incluido `open?id=...`) se cargan con la sesión persistente de Drive y muestran un emoji de respaldo si el archivo no puede abrirse.
- El icono personalizado del autobús se reutiliza en Portada, Presupuesto y Datos del viaje cuando corresponde.
- **Comprar billetes** pasa a la zona inferior de acciones, inmediatamente antes de **Cómo llegar a salida**, eliminando el solapamiento con el destino.
- En autobuses y vuelos, origen, flecha y destino quedan más centrados y próximos entre sí.
- No requiere cambios en Workers.

## v2.2.64 · Billetes de autobús, iconos Drive y cuatro reservas por fila
- En **Presupuesto → Autobús aeropuerto**, cada trayecto incorpora un botón 📎 para gestionar **varios billetes PDF/archivos**, incluyendo selección múltiple desde Google Drive. Los archivos siguen sincronizados con el mismo trayecto de Datos del viaje y aparecen como botones en el detalle.
- En la tarjeta de autobús de **Portada**, el icono personalizado (incluida imagen PNG de Google Drive) se muestra **antes de IDA/VUELTA**. Se prioriza el icono personalizado sobre el logo de compañía cuando ambos existen.
- Se corrige el reparto de ancho del autobús para que **Comprar billetes no se solape con el destino**; en anchuras intermedias el botón pasa a una línea segura sin invadir la ruta.
- Las imágenes elegidas desde Google Drive en los selectores de Configuración se **importan a una URL estable** en lugar de conservar una miniatura privada de Drive. Esto corrige iconos PNG seleccionados correctamente pero que después no se aplicaban o dejaban de mostrarse.
- Las fichas de **Reservas y documentos** de Portada usan **cuatro columnas en una sola fila en escritorio**, con tarjetas y botones ligeramente más compactos. Tablet mantiene dos columnas y móvil una.
- No es necesario actualizar Workers.

## v2.2.63 · Transportes compactos y orden configurable
- En la Portada, el autobús del aeropuerto pasa a una **franja compacta de ancho completo**; los vuelos de ida y vuelta quedan juntos en la fila siguiente en escritorio.
- En Presupuesto, **Autobús aeropuerto** aparece antes de Vuelos y todos los bloques del presupuesto se pueden mover con ↑/↓. El orden elegido queda guardado.
- En **Configuración → Datos viaje** se puede cambiar el orden de las secciones principales y también ordenar individualmente vuelos, autobuses y alojamiento con ↑/↓.
- Se mantiene toda la configuración del autobús añadida en v2.2.62, incluidos archivos, enlaces, visibilidad, colores, iconos y sincronización con Presupuesto.
- No es necesario actualizar Workers.

## v2.2.62 · Autobús al aeropuerto
- Nuevo modelo de **Autobuses** integrado con los vuelos en la Portada y ordenado cronológicamente por hora de salida.
- Configuración completa en **Datos del viaje → Vuelos, autobuses y alojamiento**: compañía, línea/servicio, origen, destino, fecha, horarios, duración, pasajeros, precio por persona, estado de pago, referencia, notas, Maps, compra de billetes, iconos, logo, colores y degradados.
- Cada trayecto se puede **mostrar u ocultar individualmente**. Los trayectos ocultos tampoco computan en Presupuesto.
- Archivos, billetes y enlaces gestionables con el mismo selector múltiple de Google Drive/archivos usado en el resto de la app.
- Nuevo grupo automático **Autobús aeropuerto** en Presupuesto, sincronizado con los datos del trayecto y con estado pagado/no pagado editable.
- GC 2026 queda precargado con la ida **Donostia / San Sebastián → Aeropuerto de Bilbao**, 14/09/2026 04:00–05:15, 2 pasajeros, 4,16 € por persona y compra en Avanza/PESA. La vuelta queda creada pero oculta.
- No es necesario actualizar Workers.

## v2.2.61 · Botón flotante menos invasivo
- El botón flotante de **Guardar cambios** en Configuración permanece visible, pero ahora se muestra **traslúcido** mientras no hay cambios pendientes.
- Al pasar el ratón por encima (o al enfocarlo), el control se vuelve completamente opaco para facilitar la interacción.
- Cuando se modifica cualquier ajuste, el botón recupera opacidad completa y muestra un estado visual más claro.
- El texto auxiliar se ha movido **encima del botón**, en formato mucho más pequeño y discreto, para reducir la sensación invasiva en escritorio.
- Se mantiene el botón de guardado del final de Configuración y no es necesario actualizar Workers.

## v2.2.56 · Corrección del guardado flotante
- El botón flotante **Guardar cambios** permanece visible desde que se entra en Configuración con edición desbloqueada, incluso antes de modificar un campo.
- El aviso cambia entre **Configuración lista para guardar** y **Cambios sin guardar** según el estado del formulario.
- Se eleva su capa visual para evitar que tarjetas, menús o paneles puedan taparlo; en móvil continúa por encima de la navegación inferior y respeta el área segura.
- No se modifican los Workers de AutoReisen/Cordial ni Vueling.

## v2.2.55 · Configuración simplificada y guardado flotante
- El botón flotante **Guardar cambios** usa seguimiento delegado de formularios y permanece a la altura visible del usuario en escritorio; en móvil/tablet queda por encima de la navegación inferior.
- **Navegación · orden, visibilidad e iconos** concentra en una sola lista el orden de las pestañas, el ojo para mostrar/ocultar y la carga de un icono personalizado. Se eliminan los bloques independientes «Pestañas visibles» e «Iconos de las pestañas».
- **Orden y visibilidad de tarjetas de la Portada** añade un ojo en cada fila para ocultar o restaurar Cuenta atrás, Tiempo, Vuelos, Alojamiento, Presupuesto, Mapa, Reservas/documentos, Carruseles e Imágenes adicionales.
- La Cuenta atrás incorpora **Mostrar segundos**, desactivado por defecto para conservar el aspecto actual; al activarlo se actualiza cada segundo.
- Las imágenes elegidas desde Google Drive también activan inmediatamente el aviso de cambios pendientes.


## v2.2.61 · Persistencia de anchos en Portada
- Corregida la regresión por la que un carrusel/galería configurado como **1/1** podía volver a **½** después de refrescar la app.
- Los anchos específicos `mediaCarousel:<id>` guardados como `full` o `half` tienen ahora prioridad absoluta sobre el antiguo ajuste global `mediaCarousels`.
- La corrección se aplica tanto al editor **Distribución de Portada** como a los controles de ancho disponibles en **Configuración**.
- Los valores ya guardados como 1/1 en Firestore se recuperan correctamente al desplegar esta versión; no hace falta volver a configurarlos si el valor persistido ya era `full`.
- No es necesario actualizar Workers.



## v2.2.71 · Billetes Drive y actualización PWA reforzada
- El gestor de billetes del autobús muestra los PDF seleccionados **inmediatamente** al volver del navegador de Drive y los persiste después, evitando regresar a una lista vacía durante el guardado.
- Los billetes de Drive se guardan como enlaces persistentes mediante `driveFileId`, sin importar/copiar el PDF a Firebase Storage.
- El gestor del autobús muestra la indicación **Drive directo** para poder comprobar visualmente que está cargada la versión nueva del código.
- Se refuerza la actualización de la PWA: Service Worker versionado, `updateViaCache: none`, actualización explícita y recarga al cambiar el controlador.
- `index.html` se sirve con `no-store` para reducir el riesgo de mantener una interfaz anterior tras desplegar una versión nueva.
- No requiere actualización de Workers.


## v2.2.71 · Billetes de autobús sincronizados con Reservas y documentos
- La ficha de **Autobús** en Reservas y documentos reutiliza automáticamente los PDF/billetes guardados en los trayectos de autobús.
- Los archivos añadidos desde Presupuesto o desde la tarjeta del trayecto aparecen también en la ficha documental sin subirlos por duplicado.
- El clip de la ficha Autobús abre directamente el gestor del trayecto visible; si hay ida y vuelta visibles permite elegir cuál gestionar.
- Se mantiene un único origen de datos (`cover.buses[].files`) para evitar desincronizaciones.


## v2.2.78 · Categorías de transporte y borde superior de alojamiento
- La tarjeta de **Alojamiento** incorpora un borde superior de color, siguiendo el lenguaje visual de vuelos y autobuses.
- Las tarjetas de **Vuelo** muestran una etiqueta discreta «VUELO» sobre IDA/VUELTA.
- Las tarjetas de **Autobús** muestran una etiqueta discreta «AUTOBÚS» sobre IDA/VUELTA.
- Las etiquetas usan el mismo estilo tipográfico de la categoría «ALOJAMIENTO» para unificar la Portada.
- Sin cambios en Workers.



## v2.2.82 · Presupuesto y PDF unificados
- Los textos automáticos del autobús en Presupuesto pueden personalizarse desde el lápiz del trayecto mediante «Presupuesto · texto del concepto» y «Presupuesto · texto del detalle».
- Los conceptos manuales de Presupuesto ya no muestran un botón separado para cambiar icono: emoji, URL e imagen se editan desde el mismo lápiz.
- Los Extras eliminan la etiqueta genérica «Extra» del detalle y el acceso pasa a llamarse simplemente «Ver».
- Todos los botones que abren o generan PDF usan el icono PDF gráfico estándar de la app, incluidos Presupuesto, Maletas, Lista de la compra, tickets y Menú.
- El antiguo bloque independiente «Resumen de vuelos» se elimina y sus datos se integran de forma compacta dentro del bloque «Vuelo Vueling».
- No requiere cambios en Workers.


## v2.2.88 · Corrección anterior del actualizador de Cloudflare
- Primera corrección del despliegue del Worker principal **2.2.19** en Windows después de separar la publicación del código y los Cron Triggers.
- Esta versión histórica todavía dependía de una sesión Wrangler preexistente; la v2.2.90 sustituye ese requisito por login automático y endurece la captura de errores de PowerShell.
- El Worker Vueling permanece en **1.0.30**.


## v2.2.98 · Google Drive con modo de respaldo temporal
- Google Drive deja de depender obligatoriamente del `GOOGLE_DRIVE_CLIENT_SECRET` para funcionar durante la sesión actual.
- Si la sesión persistente del Worker no está disponible, «Cambiar cuenta / acceso» usa OAuth directo del navegador con permisos de navegación y mantiene Drive operativo.
- El navegador de Drive ya no abre popups OAuth automáticamente durante una carga de carpeta; si necesita autorización lo indica y espera un clic explícito.
- Las peticiones de listado de Drive tienen timeout de 15 segundos y ya no pueden quedarse indefinidamente en «Cargando Google Drive…».
- Se mantiene la sesión persistente como vía preferida cuando Cloudflare detecta correctamente el secreto.


- Corregido `ACTUALIZAR_WORKERS.bat`: ahora publica mediante **Workers Script Content API** (`/content`), que reemplaza solo el código del Worker sin reconstruir configuración/bindings.
- El actualizador captura y muestra el cuerpo real de error de Cloudflare si una publicación devuelve HTTP 4xx/5xx.
- Antes y después de cada publicación compara nombres/tipos de bindings para verificar que KV, variables y secrets siguen intactos.
## v2.3.27 · Android completo + personalización de piscinas

- El workflow móvil publica Hosting + Functions y verifica `getPoolMeasurements` y `getTravelWebcam`.
- Piscinas y webcams se pueden personalizar desde Configuración: orden, visibilidad, títulos, colores generales, colores por piscina y nombres/visibilidad de webcams.
- La configuración se guarda en Firebase y se conserva en futuras actualizaciones.

## v2.3.27 · Corrección de actualización Android al 48 %
- Subida del ZIP por bloques pequeños con progreso real.
- Ensamblado y verificación en el Worker antes de lanzar GitHub Actions.
- Evita la petición única que podía quedar detenida en Android justo al 48 %.

## Cambios v2.3.36
- Webcam El Perchel ya no puede abrir la web completa de CanariasLife/Skyline dentro del popup.
- Si no hay stream o iframe de reproductor inequívoco, GC 26 fuerza el fotograma oficial mediante proxy.
- Mantiene las correcciones anteriores de piscinas, Spa eliminado y cabeceras redondeadas.