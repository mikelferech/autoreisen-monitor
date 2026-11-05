
## Ver el progreso sin salir de MFE Viajes

Desde la v2.2.155, después de seleccionar el ZIP, vuelve a **Configuración → Servicios e integraciones → Actualización desde Android**. La misma tarjeta muestra en directo los pasos de GitHub Actions (validación, Workers, Firebase y resumen final) y se refresca automáticamente cada pocos segundos. **Abrir GitHub** queda solo como acceso al log completo si algo falla.

# Guía superdetallada · Actualizar MFE Viajes desde Android

Versión que estrena el sistema: **MFE Viajes v2.2.155**

Esta guía está pensada para hacerlo desde un móvil Android (por ejemplo, Chrome en un Poco/Xiaomi) sin depender del BAT de Windows.

---

## 0. Qué hace el nuevo sistema

A partir de v2.2.155 la app puede:

1. elegir el ZIP completo de una nueva versión desde el móvil;
2. subirlo al repositorio privado de GitHub mediante el Worker de MFE;
3. lanzar un workflow de GitHub Actions;
4. validar la release;
5. actualizar únicamente los Workers de Cloudflare que hayan cambiado;
6. conservar bindings, KV, variables y secretos de Cloudflare;
7. publicar Firebase Hosting + Firebase Functions;
8. dejar un resultado verde/rojo visible en GitHub Actions.

El ZIP no contiene ni necesita guardar contraseñas o tokens. Las credenciales de CI quedan como **GitHub Actions Secrets**.

---

# PARTE A · Preparación inicial (solo una vez)

## A1. Comprueba si ya tienes secretos de Firebase en GitHub

1. Abre Chrome en Android.
2. Entra en GitHub e inicia sesión.
3. Abre el repositorio donde están los workflows de MFE Viajes.
4. Pulsa **Settings** del repositorio.
   - En móvil puede estar dentro del menú **…** o tendrás que deslizar horizontalmente las pestañas del repositorio.
5. Busca **Secrets and variables**.
6. Entra en **Actions**.
7. Mira la lista **Repository secrets**.

Si ya existe un secret de Firebase cuyo nombre empieza por `FIREBASE_SERVICE_ACCOUNT_`, es posible que no tengas que crear otro. El workflow v2.2.155 acepta expresamente:

- `FIREBASE_SERVICE_ACCOUNT_MFE_VIAJES`, o
- el secret de service account ya existente para el proyecto Firebase de la app.

No puedes ver el contenido de un secret ya guardado en GitHub; solo puedes comprobar que existe por su nombre. Es normal.

---

## A2. Crear el secret de Firebase si no existe

### Método Android

1. Abre la consola de Google Cloud en Chrome.
2. Selecciona **el mismo proyecto de Firebase que usa MFE Viajes**.
3. Abre **IAM y administración → Cuentas de servicio**.
4. Pulsa **Crear cuenta de servicio**.
5. Nombre recomendado: `github-mfe-viajes`.
6. Concede, como mínimo para este Hosting estático:
   - **Firebase Hosting Admin**.
   - **API Keys Viewer**.
7. Termina la creación.
8. Abre la cuenta de servicio recién creada.
9. Entra en **Keys / Claves**.
10. Pulsa **Add key / Añadir clave → Create new key / Crear nueva clave**.
11. Elige **JSON**.
12. Descarga el archivo y guárdalo en un lugar privado del móvil.

### Guardarlo como GitHub Secret

1. Vuelve al repositorio de GitHub.
2. **Settings → Secrets and variables → Actions**.
3. Pulsa **New repository secret**.
4. En **Name**, escribe exactamente:
   `FIREBASE_SERVICE_ACCOUNT_MFE_VIAJES`
5. Abre el JSON descargado con un editor de texto.
6. Selecciona **todo** el contenido, desde `{` hasta `}`.
7. Cópialo.
8. Pégalo en **Secret**.
9. Pulsa **Add secret**.
10. Cuando esté guardado, elimina del portapapeles cualquier copia de la clave y conserva o elimina el JSON según tus prácticas de seguridad. No lo envíes por chat ni correo.

---

## A3. Crear el token de Cloudflare para GitHub Actions

Este token se usa únicamente cuando el ZIP incluye un Worker modificado.

1. Abre el panel de Cloudflare en Chrome.
2. Entra en tu perfil y abre **API Tokens**.
3. Pulsa **Create Token**.
4. Puedes usar una plantilla de Workers o crear un token personalizado.
5. Para un token mínimo, concede a la cuenta correcta:
   - **Account → Workers Scripts → Edit/Write**.
6. Limita **Account Resources** a la cuenta donde están `mfe-viajes-precios` y `mfe-viajes-vueling`.
7. Revisa el resumen.
8. Crea el token.
9. **Cópialo en ese momento**: Cloudflare no vuelve a enseñar el valor completo después.

### Guardar el token en GitHub

1. Repositorio → **Settings → Secrets and variables → Actions**.
2. **New repository secret**.
3. Name:
   `CLOUDFLARE_API_TOKEN`
4. Secret: pega el token.
5. Guarda.

---

## A4. Guardar el Account ID de Cloudflare

1. En Cloudflare abre la cuenta donde están los Workers.
2. Localiza el **Account ID** en el panel de la cuenta / Workers & Pages.
3. Cópialo.
4. En GitHub crea otro **Repository secret**:
   `CLOUDFLARE_ACCOUNT_ID`
5. Pega únicamente el Account ID y guarda.

Al terminar deberían existir los siguientes secrets necesarios:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `FIREBASE_SERVICE_ACCOUNT_MFE_VIAJES` **o** el service-account secret Firebase del proyecto que ya tuvieras.

---

# PARTE B · Instalar v2.2.155 por primera vez usando SOLO Android

Esto solo hace falta para arrancar el sistema sin PC. Después usarás la Parte C.

## B1. Descarga dos archivos

Necesitas:

1. el ZIP completo `MFE_Viajes_2026_v2_2_148_COMPLETA.zip`;
2. el archivo `mfe-mobile-deploy.yml` que acompaña a la release.

Guárdalos en **Descargas**.

---

## B2. Subir el workflow móvil a GitHub

1. Abre tu repositorio en GitHub desde Chrome.
2. Entra en la carpeta `.github`.
3. Entra en `workflows`.
4. Pulsa **Add file → Upload files**.
5. Selecciona `mfe-mobile-deploy.yml` desde Descargas.
6. En el cuadro de commit puedes poner:
   `Preparar actualización MFE desde Android`
7. Confirma con **Commit changes**.
8. Vuelve a la carpeta `.github/workflows` y comprueba que aparece `mfe-mobile-deploy.yml`.

---

## B3. Crear la carpeta mobile-release

Si `mobile-release` todavía no existe:

1. Vuelve a la raíz del repositorio.
2. Pulsa **Add file → Create new file**.
3. En el nombre escribe:
   `mobile-release/README.md`
4. En el contenido escribe, por ejemplo:
   `Carpeta usada por la actualización móvil de MFE Viajes.`
5. Pulsa **Commit changes**.
6. Ahora verás la carpeta `mobile-release` en la raíz.

---

## B4. Renombrar el ZIP en Android

El workflow de arranque busca un nombre fijo.

1. Abre la app **Archivos / Files** de Android.
2. Entra en Descargas.
3. Mantén pulsado `MFE_Viajes_2026_v2_2_148_COMPLETA.zip`.
4. Elige **Renombrar**.
5. Pon exactamente:
   `MFE_Viajes_RELEASE.zip`
6. Comprueba que sigue terminando en `.zip` y que no ha quedado `.zip.zip`.

---

## B5. Subir el ZIP a GitHub

1. En GitHub entra en la carpeta `mobile-release`.
2. Pulsa **Add file → Upload files**.
3. Selecciona `MFE_Viajes_RELEASE.zip`.
4. Espera a que GitHub termine de cargarlo.
5. Mensaje de commit recomendado:
   `Release móvil MFE Viajes v2.2.155`
6. Pulsa **Commit changes**.
7. Comprueba que dentro de `mobile-release` aparece `MFE_Viajes_RELEASE.zip`.

---

## B6. Ejecutar la actualización

1. Abre la pestaña **Actions** del repositorio.
2. Busca el workflow:
   **Actualizar MFE Viajes · móvil**
3. Ábrelo.
4. Pulsa **Run workflow**.
5. Deja seleccionada la rama principal (`main`, salvo que tu repositorio use otra).
6. Pulsa el botón verde **Run workflow**.
7. Espera unos segundos y actualiza la página si hace falta.
8. Aparecerá una ejecución nueva.
9. Tócala para ver el progreso.

Orden esperado:

- ✅ Descargar repositorio
- ✅ Preparar Node
- ✅ Comprobar ZIP
- ✅ Extraer versión
- ✅ Validar MFE Viajes
- ✅ Detectar Workers
- si corresponde: ✅ Actualizar Workers modificados
- ✅ Autenticar Firebase
- ✅ Publicar Firebase Hosting + Functions
- ✅ Verificar Functions de piscinas y webcams
- ✅ Resumen

Cuando todo esté verde, v2.2.155 estará publicada.

---

# PARTE C · Todas las actualizaciones futuras desde la propia app

Esta es la parte que usarás normalmente después de instalar v2.2.155.

## C1. Descargar una nueva versión

1. Descarga en Android el ZIP completo que te entregue ChatGPT.
2. **No hace falta descomprimirlo**.
3. **No hace falta renombrarlo**.

Ejemplo:
`MFE_Viajes_2026_v2_2_149_COMPLETA.zip`

---

## C2. Abrir el actualizador dentro de MFE Viajes

1. Abre MFE Viajes.
2. Entra en **Configuración**.
3. Desbloquea la edición con el PIN si la app lo solicita.
4. Entra en **Servicios e integraciones**.
5. Busca la tarjeta:
   **📱 Actualización desde Android**.

La primera vez pulsa:
**⚙ Preparar GitHub**

La app comprobará/instalará el workflow móvil en tu repositorio. Solo es necesario prepararlo una vez, aunque puedes pulsarlo de nuevo si quieres reparar el workflow.

---

## C3. Actualizar con un ZIP

1. En la tarjeta **Actualización desde Android**, pulsa:
   **📦 Seleccionar ZIP y actualizar**.
2. Android abrirá el selector de archivos.
3. Entra en **Descargas**.
4. Selecciona el ZIP nuevo.
5. La app mostrará una confirmación con el nombre del archivo.
6. Acepta.
7. Verás primero **Leyendo el ZIP…**.
8. Después **Subiendo release a GitHub y lanzando la actualización…**.
9. No cierres la app hasta que aparezca el mensaje de que el ZIP ya se ha subido y GitHub Actions se ha lanzado.

El ZIP se guarda en el repositorio como `mobile-release/MFE_Viajes_RELEASE.zip`; cada nueva actualización sustituye al anterior.

---

## C4. Ver el progreso

1. En la misma tarjeta pulsa **Ver actualización**.
2. Se abrirá GitHub Actions.
3. Entra en la ejecución más reciente.
4. Espera a que finalice.

### Si la release NO cambia Workers

Verás que el paso de Cloudflare se omite y Firebase se publica directamente.

### Si la release SÍ cambia Workers

GitHub Actions:

1. lee `scripts/workers-release.json`;
2. guarda una firma de los bindings existentes;
3. sustituye solo el código del Worker;
4. vuelve a comprobar bindings/KV/variables/secretos;
5. despliega la nueva versión al 100 % mediante Wrangler;
6. comprueba `workers.dev`;
7. solo después publica Firebase.

---

## C5. Confirmar que el móvil tiene la nueva app

Cuando GitHub Actions esté todo verde:

1. vuelve a MFE Viajes;
2. ciérrala y vuelve a abrirla, o actualiza la página/PWA;
3. mira el pie de la app: debe aparecer el nuevo número de versión;
4. si Android mantiene una versión antigua, cierra por completo la PWA y vuelve a abrirla; el service worker está configurado para renovar los archivos de versión.

No hace falta desinstalar/reinstalar la PWA para cada actualización normal.

---

# PARTE D · Qué hacer si aparece un error rojo

## D1. Falta CLOUDFLARE_API_TOKEN

Solo aparecerá si esa release modifica Workers.

Solución:
GitHub → Settings → Secrets and variables → Actions → crea/corrige `CLOUDFLARE_API_TOKEN`.

---

## D2. Falta CLOUDFLARE_ACCOUNT_ID

Copia el Account ID correcto desde Cloudflare y guárdalo como secret `CLOUDFLARE_ACCOUNT_ID`.

---

## D3. Falta credencial Firebase

Crea `FIREBASE_SERVICE_ACCOUNT_MFE_VIAJES` con el JSON completo de una cuenta de servicio autorizada para Firebase Hosting.

---

## D4. Error de permisos de Firebase

Revisa en Google Cloud IAM que la cuenta de servicio usada por GitHub Actions tenga permisos suficientes para Hosting. Para este proyecto estático, empieza verificando **Firebase Hosting Admin** y **API Keys Viewer**.

---

## D5. Error en validación

No intentes forzar la publicación. La validación está precisamente para impedir subir una release incompleta. Pásame una captura del paso rojo de GitHub Actions y el ZIP que estabas intentando publicar.

---

## D6. Error en Workers

El workflow se detiene antes de Firebase. Esto evita que la app se publique esperando una versión de Worker que no está activa.

Pásame la parte roja del log; el actualizador CI muestra el error devuelto por Cloudflare y la versión esperada.

---

# PARTE E · Seguridad

- No guardes tokens dentro del ZIP.
- No pegues tokens ni service-account JSON en archivos del repositorio.
- Usa únicamente **GitHub Actions Secrets**.
- No envíes por chat el valor de `CLOUDFLARE_API_TOKEN` ni el JSON de la cuenta de servicio.
- El botón móvil de MFE sube el ZIP a tu repositorio privado a través del Worker autenticado con Firebase; las credenciales CI siguen almacenadas en GitHub/Cloudflare, no en el navegador.

---

# Resumen para el uso diario

Una vez preparado:

**ChatGPT te da ZIP → Descargas en Android → MFE Viajes → Configuración → Servicios e integraciones → Actualización desde Android → Seleccionar ZIP y actualizar → Ver actualización → esperar ✅ verde.**

Ese será el equivalente móvil de `ACTUALIZAR_MFE.bat`.


## v2.3.27 · Actualizaciones que incluyen Functions

Desde v2.3.27 el flujo Android publica **Firebase Hosting y Firebase Functions** en la misma ejecución. Después del despliegue, GitHub Actions comprueba expresamente que las Functions `getPoolMeasurements` y `getTravelWebcam` estén publicadas. Si esa comprobación falla, MFE Viajes mostrará la actualización como fallida aunque el Hosting haya llegado a publicarse.

Esto permite instalar desde el móvil las versiones que cambien el lector de piscinas, el histórico o las webcams, sin necesitar `ACTUALIZAR_MFE.bat` en Windows.

## v2.3.27 · Subida por bloques
La app divide el ZIP en bloques pequeños y muestra `bloque X/Y` durante la transferencia. Solo cuando todos han sido confirmados se ensambla la release y se lanza GitHub Actions.
