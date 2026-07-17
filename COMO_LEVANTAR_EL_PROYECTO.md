# Guía de Inicio: Cómo levantar el proyecto 🚀

Si reiniciaste tu computadora o cerraste las terminales, aquí tienes el paso a paso exacto para volver a encender todas las piezas de la aplicación. 

Te recomiendo abrir **5 pestañas** en tu terminal (o ventanas separadas) para correr cada servicio por su cuenta.

---

### 1. 🗄️ Iniciar Redis (Base de datos en memoria para la cola de tareas)
El sistema usa Redis para manejar el procesamiento de fotos en segundo plano (BullMQ).
En tu **primera terminal**, simplemente corre:
```bash
redis-server
```
*(Si ya lo tienes configurado para que inicie automáticamente con tu Mac, puedes saltarte este paso).*

---

### 2. 🧠 Iniciar la Inteligencia Artificial (Python)
Este servicio se encarga de analizar los rostros usando Python y FastAPI.
En tu **segunda terminal**, ve a la carpeta del proyecto y corre el script de inicio:
```bash
cd "Desktop/cloud personal/backend-ia"
./start.sh
```
*(Esto activará el entorno virtual `venv` automáticamente y encenderá el servidor en el puerto `8000`).*

---

### 3. ⚙️ Iniciar el Servidor Principal (Node.js)
Este es el cerebro central que conecta la base de datos (SQLite), lee los archivos y sirve la API principal.
En tu **tercera terminal**:
```bash
cd "Desktop/cloud personal/backend"
npm run dev
```
*(Se levantará en el puerto `3001`).*

---

### 4. 👷 Iniciar el Trabajador de Tareas (Worker)
Este proceso es crucial: es el encargado de generar las miniaturas (thumbnails), extraer la metadata, buscar caras y conectarse con la IA en segundo plano.
En tu **cuarta terminal**:
```bash
cd "Desktop/cloud personal/backend"
npm run dev:worker
```

---

### 5. 🎨 Iniciar la Interfaz Gráfica (Frontend / React)
Finalmente, levantamos la página web que ves en el navegador.
En tu **quinta terminal**:
```bash
cd "Desktop/cloud personal/frontend"
npm run dev
```
*(Vite te dará una URL local, por lo general `http://localhost:5173/`, ábrela en tu navegador).*

---

### 💡 Resumen Rápido (Cheat Sheet)
- **T1:** `redis-server`
- **T2:** `cd backend-ia && ./start.sh`
- **T3:** `cd backend && npm run dev`
- **T4:** `cd backend && npm run dev:worker`
- **T5:** `cd frontend && npm run dev`

¡Listo! Con estas 5 terminales activas, la plataforma estará funcionando al 100%.
