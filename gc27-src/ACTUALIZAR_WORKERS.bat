@echo off
setlocal
cd /d "%~dp0"
echo.
echo ==========================================
echo   MFE Viajes - Actualizar Cloudflare
 echo ==========================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-workers.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] No se pudieron actualizar los Workers.
  pause
  exit /b 1
)
echo.
echo [OK] Workers actualizados.
exit /b 0
