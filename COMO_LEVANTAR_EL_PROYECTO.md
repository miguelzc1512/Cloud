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

---

### 🌐 Ver la plataforma desde cualquier lugar (Red Local o Dominio Web)

#### 1. En la misma Red Local (WiFi / Oficina)
Puedes acceder directamente desde cualquier celular, tablet o PC en la misma red ingresando a tu IP local:
`http://<IP-DE-TU-PC>` (ejemplo: `http://192.168.1.50`).

#### 2. Cambiar el Puerto del Visor Web
Por defecto la app escucha en el puerto `80`. Si deseas cambiar el puerto (ejemplo a `8080` o `3000`), crea un archivo `.env` en la raíz del proyecto con:
```env
WEB_PORT=8080
```
Y ejecuta `docker compose up -d`. La web estará disponible en `http://localhost:8080` o `http://<IP-DE-TU-PC>:8080`.

#### 3. Acceso desde Internet / Asignar a un Dominio Web
- **Opción A (Recomendada y Segura - Cloudflare Tunnel)**:
  Sin abrir puertos en el router, ejecuta:
  ```bash
  npx cloudflared tunnel --url http://localhost:80
  ```
  Obtendrás una URL HTTPS pública (o puedes vincular tu propio dominio registrado como `nube.midominio.com`).

- **Opción B (Prueba Rápida con Ngrok)**:
  ```bash
  npx ngrok http 80
  ```

- **Opción C (Redirección de Puertos Router / VPS)**:
  Reenvía el puerto `80` (o `WEB_PORT`) en tu router hacia la IP local de tu computadora.

