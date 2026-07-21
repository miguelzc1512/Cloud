#!/bin/bash
echo "==================================================="
echo "  Levantando Cloud Sync (Mac)"
echo "==================================================="

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

# Terminal 1: Redis
osascript -e 'tell application "Terminal" to do script "redis-server"'

# Terminal 2: Backend API
osascript -e "tell application \"Terminal\" to do script \"cd \\\"$PROJECT_DIR/backend\\\" && npm run dev\""

# Terminal 3: Backend Worker
osascript -e "tell application \"Terminal\" to do script \"cd \\\"$PROJECT_DIR/backend\\\" && npm run dev:worker\""

# Terminal 4: Frontend
osascript -e "tell application \"Terminal\" to do script \"cd \\\"$PROJECT_DIR/frontend\\\" && npm run dev\""

# Terminal 5: Desktop Client (Sincronizador)
osascript -e "tell application \"Terminal\" to do script \"cd \\\"$PROJECT_DIR/desktop-client\\\" && npm run dev\""

echo "¡Terminales abiertas! Revisa las ventanas de la terminal."
echo "La interfaz estará en http://localhost:5173/"
