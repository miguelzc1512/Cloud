# Guía de Inicio: Cómo levantar el proyecto 🚀

Si reiniciaste tu computadora o cerraste las terminales, aquí tienes el paso a paso exacto para volver a encender todas las piezas de la aplicación en Mac de forma manual.

Te recomiendo abrir **4 pestañas** en tu terminal (o ventanas separadas) para correr cada servicio por su cuenta.

*(Nota: Si quieres hacerlo con un solo clic en Mac, simplemente haz doble clic en el archivo `Iniciar_Nube.command` que está en esta carpeta).*

---

### 1. 🗄️ Iniciar Redis (Base de datos en memoria para la cola de tareas)
El sistema usa Redis para manejar el procesamiento de fotos en segundo plano (BullMQ).
En tu **primera terminal**, simplemente corre:
```bash
redis-server
```

---

### 2. ⚙️ Iniciar el Servidor Principal (Node.js API)
Este es el cerebro central que conecta la base de datos (SQLite), lee los archivos y sirve la API principal.
En tu **segunda terminal**:
```bash
cd "Desktop/cloud personal/backend"
npm run dev
```
*(Se levantará en el puerto `3001`).*

---

### 3. 👷 Iniciar el Trabajador de Tareas (Worker Node.js)
Este proceso es crucial: es el encargado de generar las miniaturas (thumbnails), extraer la metadata, buscar caras y conectarse con la IA nativa en segundo plano (usando Transformers.js y TensorFlow).
En tu **tercera terminal**:
```bash
cd "Desktop/cloud personal/backend"
npm run dev:worker
```

---

### 4. 🎨 Iniciar la Interfaz Gráfica (Frontend / React)
Finalmente, levantamos la página web que ves en el navegador.
En tu **cuarta terminal**:
```bash
cd "Desktop/cloud personal/frontend"
npm run dev
```
*(Vite te dará una URL local, por lo general `http://localhost:5173/`, ábrela en tu navegador).*

---

### 💡 Resumen Rápido (Cheat Sheet)
- **T1:** `redis-server`
- **T2:** `cd backend && npm run dev`
- **T3:** `cd backend && npm run dev:worker`
- **T4:** `cd frontend && npm run dev`

¡Listo! Con estas 4 terminales activas, la plataforma estará funcionando al 100%.

---

### 📦 Extra: Cómo compilar el Sincronizador (Desktop App)
Si necesitas generar los instaladores de escritorio (Windows o Mac):

1. Ve a la carpeta `desktop-client`:
   ```bash
   cd "Desktop/cloud personal/desktop-client"
   ```
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Compila el instalador:
   ```bash
   npm run build
   ```
*(Si corres esto en Mac, generará un `.dmg`. Si lo corres en Windows, generará un `.exe`. Estarán en la carpeta `desktop-client/release/`).*
