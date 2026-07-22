@echo off
echo ===================================================
echo   Levantando Cloud Sync (Docker + Cliente Desktop)
echo ===================================================
echo Asegurate de tener Docker Desktop abierto.
echo.
docker compose up -d --build
if errorlevel 1 (
    echo [ERROR] No se pudo levantar Docker. Verifique que Docker Desktop este iniciado.
    pause
    exit /b 1
)

echo.
echo ===================================================
echo   ¡Nube iniciada en Docker!
echo   Página web: http://localhost
echo   Iniciando Cliente de Escritorio...
echo ===================================================
echo.

cd desktop-client
if not exist node_modules (
    echo Instalando dependencias de desktop-client...
    call npm install
)

echo Levantando cliente de escritorio...
call npm run dev

pause
