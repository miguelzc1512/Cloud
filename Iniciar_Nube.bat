@echo off
echo ===================================================
echo   Levantando Cloud Sync (Docker)
echo ===================================================
echo Asegurate de tener Docker Desktop abierto.
echo.
docker-compose up -d --build
echo.
echo ===================================================
echo   ¡Nube Encendida!
echo   Abre tu navegador en: http://localhost
echo ===================================================
pause
