# ☁️ Cloud Personal (Alternativa a Google Fotos)

¡Bienvenido a **Cloud Personal**! Este es un proyecto de código abierto diseñado para que puedas montar tu propia "nube" privada, similar a Google Fotos. 

El proyecto consta de dos partes principales:
1. **La plataforma web (Visor):** Donde puedes entrar desde tu navegador para ver tus fotos, organizarlas, buscar por rostros usando Inteligencia Artificial, y verlas en un mapa.
2. **El cliente de escritorio (Sincronizador):** Una aplicación que instalas en tu computadora (Mac o Windows) para que suba y sincronice tus fotos automáticamente en segundo plano.

Si nunca has tocado código o programación en tu vida, ¡no te preocupes! Hemos creado un instalador de "Un Clic" mágico llamado Docker que hará todo el trabajo pesado por ti.

---

## 🚀 Cómo encender tu Nube (Modo Automático Recomendado)

Gracias a **Docker**, ya no necesitas instalar lenguajes de programación raros ni abrir ventanas de terminal. Docker se encarga de crear un entorno seguro e instalar Node.js, Redis y encender la Inteligencia artificial de forma invisible.

### Paso 0: Descargar el Proyecto
1. Ve a la parte superior de esta página en GitHub.
2. Haz clic en el botón verde que dice **"<> Code"**.
3. Selecciona **"Download ZIP"**.
4. Descomprime (extrae) la carpeta que se descargó en tu computadora (por ejemplo, en tu Escritorio o Documentos).

### Paso 1: Instalar Docker
Descarga e instala **Docker Desktop** (es gratis):
* **Descarga para Mac o Windows:** [docker.com/products/docker-desktop/](https://www.docker.com/products/docker-desktop/)
* Instálalo como cualquier otro programa y ábrelo. *(Déjalo abierto en segundo plano, verás un icono de una ballena en tu barra de tareas)*.

### Paso 2: Configurar tu API Key de Google Maps
Tu nube usa Google Maps para mostrarte dónde tomaste tus fotos.
1. Ve a la carpeta `frontend` dentro del proyecto.
2. Verás un archivo llamado `.env.example`.
3. Haz una copia de ese archivo, renómbralo a `.env` y ábrelo con un bloc de notas.
4. Pega tu propia clave de Google Maps así: `VITE_GOOGLE_MAPS_API_KEY=tu_clave_aqui`.

### Paso 3: ¡Encender la Nube!
Ve a la carpeta principal del proyecto (donde está este README) y usa la opción que prefieras:

#### Opción A: Con un Clic (Archivos Ejecutables)
* 🪟 **Si usas Windows:** Haz doble clic en `Iniciar_Nube.bat`
* 🍎 **Si usas Mac:** Haz doble clic en `Iniciar_Nube.command`

#### Opción B: Por Línea de Comandos (Terminal / PowerShell / CMD)
Abre una terminal en la raíz del proyecto y ejecuta:
```bash
docker compose up -d --build
```

---

### 🛠️ Comandos Útiles de Docker

* **Encender / Construir contenedores:**
  ```bash
  docker compose up -d --build
  ```
* **Ver logs en tiempo real (Backend, Worker, Frontend, Redis):**
  ```bash
  docker compose logs -f
  ```
* **Ver estado de los servicios:**
  ```bash
  docker compose ps
  ```
* **Apagar la Nube:**
  ```bash
  docker compose down
  ```

---

### 💾 Arquitectura de Discos Recomendada (M.2 NVMe + SSD + HDD)

Para lograr la **máxima velocidad (scroll fluido a 120 FPS sin demoras)** y al mismo tiempo optimizar el espacio y la vida útil de tus discos, recomendamos organizar tus almacenamiento en 3 niveles:

1. **🚀 Disco M.2 NVMe (Disco C: / Sistema Operativo)**:  
   - Guarda el código del proyecto y la carpeta `storage/` (base de datos SQLite `nube.db`, embeddings de IA y miniaturas WebP).  
   - *Beneficio*: Las búsquedas por IA, detección de rostros y la carga de imágenes al hacer scroll volarás a velocidad máxima (>3,000 MB/s).
2. **⚡ Disco SSD SATA (Fotos y Vídeos Originales)**:  
   - Guarda tu biblioteca principal de fotos y vídeos de alta resolución (archivos maestro).  
   - *Beneficio*: Abre fotos pesadas al instante a pantalla completa sin saturar el almacenamiento del disco de tu sistema.
3. **📦 Disco HDD de Laptop (Spinning Disk)**:  
   - Úsalo para la papelera de reciclaje y copias de seguridad de la base de datos.  
   - *Beneficio*: Aprovechas almacenamiento económico para archivos fríos/temporales sin perder velocidad.

---

### 🖥️ Cómo mapear discos en Docker (En tu PC o en otra computadora)

Si cambias de computadora o tienes tus fotos en diferentes letras de unidad (ej. `D:\`, `E:\`, `F:\` en Windows, o `/Volumes/...` en Mac), edita la sección `volumes` en `docker-compose.yml`:

```yaml
  backend-api:
    build: ./backend
    image: cloud-backend:latest
    container_name: cloud-backend-api
    command: npm start
    ports:
      - "${BACKEND_PORT:-3002}:3001"
    volumes:
      - ./storage:/app/storage       # 1. Base de datos y thumbnails en M.2 (Velocidad máxima)
      - D:/Fotos_SSD:/fotos_ssd       # 2. Tu disco SSD con las fotos originales (Ejemplo en Windows)
      - E:/Backup_HDD:/backup_hdd     # 3. Tu disco HDD para respaldos/papelera
      # En Mac/Linux usarías rutas absolutas:
      # - /Volumes/FotosSSD:/fotos_ssd

  backend-worker:
    image: cloud-backend:latest
    container_name: cloud-backend-worker
    command: npm run start:worker
    environment:
      - REDIS_HOST=redis
      - API_HOST=backend-api
      - STORAGE_PATH=/app/storage
      - WORKER_CONCURRENCY=4
    volumes:
      - ./storage:/app/storage
      - D:/Fotos_SSD:/fotos_ssd       # Mismo mapeo en el worker
      - E:/Backup_HDD:/backup_hdd
```

Tras editar los discos, aplica los cambios ejecutando:
```bash
docker compose up -d
```

---

### 📷 Conversión de Fotos Apple HEIC a JPG y Preservación de Metadatos

- **Conversión Automática**: Al subir o indexar fotos en formato `.HEIC` / `.HEIF` de iPhone/Apple, el sistema las convierte automáticamente a un formato `.JPG` compatible con todos los navegadores.
- **Ubicación de guardado**: El archivo `.JPG` convertido se guarda en la **MISMA carpeta** junto con la foto original (por ejemplo en `D:/Fotos_SSD/vacaciones/foto.jpg`).
- **Preservación de Metadatos EXIF**: Los metadatos originales (**fecha tomada, coordenadas GPS para el mapa, modelo de cámara y orientación**) son extraídos del archivo HEIC original **antes** de la conversión y almacenados en SQLite para que no pierdas ningún dato.

---

¡Listo! Cuando los contenedores estén corriendo, abre tu navegador y visita:
👉 **[http://localhost](http://localhost)**

---

## 🖥️ Cómo compilar el Sincronizador de Escritorio (Desktop Client)

El sincronizador de escritorio es el programa instalable `.exe` o `.dmg`. Para generar este archivo:

1. Necesitas instalar [Node.js](https://nodejs.org/) en tu computadora.
2. Abre una terminal y navega hasta la carpeta `desktop-client`:
   ```bash
   cd desktop-client
   ```
3. Instala las dependencias:
   ```bash
   npm install
   ```
4. Crea el instalador final:
   ```bash
   npm run build
   ```
5. El archivo listo (`CloudSync-win.exe` o `CloudSync-mac.dmg`) aparecerá dentro de la carpeta `desktop-client/release/`. 

---

## 👨‍💻 Para Desarrolladores (Instalación Manual)
Si deseas editar el código fuente y correr los servidores manualmente sin Docker (ej. en Mac nativo), consulta el archivo [COMO_LEVANTAR_EL_PROYECTO.md](COMO_LEVANTAR_EL_PROYECTO.md) para ver la guía de desarrollo.

---

## 🔄 ¿Cómo instalar actualizaciones en el futuro?
Actualizar es seguro. Tus fotos y bases de datos **NO se borrarán** porque Docker las guarda en la carpeta `storage`.

1. Apaga tu nube actual (`docker-compose down`).
2. Haz `git pull` o descarga el nuevo código.
3. Vuelve a ejecutar el instalador (`Iniciar_Nube.bat` o `.command`).

---

## 🌍 ¿Cómo ver mi nube desde cualquier parte del mundo con mi propio dominio?
Por defecto, tu nube solo es accesible desde tu propia casa (a través de tu WiFi).
**La forma más fácil y segura (Cloudflare Tunnels):**
1. Crea una cuenta gratuita en [Cloudflare Zero Trust](https://one.dash.cloudflare.com/).
2. Ve a la sección de **Tunnels** y crea un túnel nuevo.
3. Instala el programa gratuito en tu computadora.
4. En Cloudflare, apunta tu dominio web al puerto de tu nube (`localhost:80`).
5. ¡Listo! Cualquier persona en el mundo podrá entrar a tu dominio de forma segura.
