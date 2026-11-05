@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"
title MFE Viajes - Actualizacion

echo ============================================================
echo   MFE VIAJES - ACTUALIZACION AUTOMATICA
echo ============================================================
echo.

if not exist "firebase.json" (
  echo [ERROR] No encuentro firebase.json.
  echo Ejecuta este archivo desde la carpeta descomprimida de MFE Viajes.
  goto :fail
)

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js no esta instalado o no esta en PATH.
  echo Instala Node.js y vuelve a ejecutar este archivo.
  goto :fail
)

echo [1/3] Validando la version antes de publicar...
node scripts\validate-release.mjs
if errorlevel 1 (
  echo.
  echo [ERROR] La validacion ha fallado. No se publicara nada.
  goto :fail
)

echo.
if exist "ACTUALIZAR_WORKERS.bat" (
  echo [2/3] Se ha detectado una actualizacion de Workers.
  echo       Ejecutando ACTUALIZAR_WORKERS.bat...
  call "%~dp0ACTUALIZAR_WORKERS.bat"
  if errorlevel 1 (
    echo.
    echo [ERROR] La actualizacion de Workers no ha terminado correctamente.
    goto :fail
  )
) else (
  echo [2/3] Esta version no requiere actualizar Workers.
)

echo.
echo [3/3] Publicando MFE Viajes en Firebase Hosting y Functions...
where firebase >nul 2>&1
if not errorlevel 1 (
  firebase deploy --only hosting:viajes,functions
) else (
  where npx >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] No encuentro Firebase CLI ni npx.
    echo Instala Firebase CLI o Node.js y vuelve a intentarlo.
    goto :fail
  )
  echo Firebase CLI no esta instalado globalmente. Usando npx firebase-tools...
  npx --yes firebase-tools@latest deploy --only hosting:viajes,functions
)

if errorlevel 1 (
  echo.
  echo [ERROR] Firebase ha devuelto un error. Revisa el mensaje anterior.
  goto :fail
)

echo.
echo ============================================================
echo   OK - MFE Viajes se ha actualizado correctamente.
echo ============================================================
echo.
pause
exit /b 0

:fail
echo.
echo La actualizacion NO se ha completado.
echo No cierres esta ventana hasta revisar el mensaje de error.
echo.
pause
exit /b 1
