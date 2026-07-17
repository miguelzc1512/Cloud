@echo off
title Nube Personal - Instalador y Servidor
echo ==============================================
echo       INICIANDO TU NUBE PERSONAL (DOCKER)
echo ==============================================
echo.
echo Comprobando Docker...

docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] No tienes Docker instalado o no esta en ejecucion.
    echo Por favor instala "Docker Desktop" desde docker.com, abrelo y vuelve a intentar.
    pause
    exit /b
)

echo.
echo Levantando servidores en el fondo (esto puede tardar la primera vez)...
docker-compose up -d --build

echo.
echo ==============================================
echo  !LISTO! TU NUBE ESTA FUNCIONANDO
echo ==============================================
echo.
echo Abre tu navegador y entra a:
echo http://localhost
echo.
echo (Para apagar la nube, usa el comando: docker-compose down)
pause
