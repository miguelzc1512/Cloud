#!/bin/bash
clear
echo "=============================================="
echo "      INICIANDO TU NUBE PERSONAL (DOCKER)     "
echo "=============================================="
echo ""

if ! command -v docker &> /dev/null
then
    echo "[ERROR] No tienes Docker instalado o no esta en ejecucion."
    echo "Por favor instala 'Docker Desktop' desde docker.com, abrelo y vuelve a intentar."
    read -p "Presiona Enter para salir..."
    exit
fi

echo "Levantando servidores en el fondo (esto puede tardar la primera vez)..."
cd "$(dirname "$0")"
docker-compose up -d --build

echo ""
echo "=============================================="
echo "  !LISTO! TU NUBE ESTA FUNCIONANDO"
echo "=============================================="
echo ""
echo "Abre tu navegador y entra a:"
echo "http://localhost"
echo ""
echo "(Para apagar la nube, usa el comando: docker-compose down)"
echo ""
read -p "Presiona Enter para cerrar esta ventana..."
