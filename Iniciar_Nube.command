#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "☁️  Iniciando todos los servicios de Nube..."

# 1. Backend IA (Inteligencia Artificial)
osascript -e "tell application \"Terminal\" to do script \"cd '$DIR/backend-ia' && ./start.sh\""

# 2. Backend Principal (Node.js)
osascript -e "tell application \"Terminal\" to do script \"cd '$DIR/backend' && npm run dev\""

# 3. Worker (Procesamiento en segundo plano)
osascript -e "tell application \"Terminal\" to do script \"cd '$DIR/backend' && npm run dev:worker\""

# 4. Frontend Web (React)
osascript -e "tell application \"Terminal\" to do script \"cd '$DIR/frontend' && npm run dev\""

# 5. Cliente de Escritorio (Electron)
osascript -e "tell application \"Terminal\" to do script \"cd '$DIR/desktop-client' && npm run dev\""

echo "✅ Los servicios se están abriendo en nuevas ventanas de Terminal."
