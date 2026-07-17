# ☁️ Cloud Personal (Alternativa a Google Fotos)

¡Bienvenido a **Cloud Personal**! Este es un proyecto de código abierto diseñado para que puedas montar tu propia "nube" privada, similar a Google Fotos. 

El proyecto consta de dos partes principales:
1. **La plataforma web (Visor):** Donde puedes entrar desde tu navegador para ver tus fotos, organizarlas, buscar por rostros usando Inteligencia Artificial, y verlas en un mapa.
2. **El cliente de escritorio (Sincronizador):** Una aplicación que instalas en tu computadora (Mac o Windows) para que suba y sincronice tus fotos automáticamente en segundo plano.

Si nunca has tocado código o programación en tu vida, ¡no te preocupes! Hemos creado un instalador de "Un Clic" mágico llamado Docker que hará todo el trabajo pesado por ti.

---

## 🚀 Cómo encender tu Nube (Modo Automático Recomendado)

Gracias a **Docker**, ya no necesitas instalar lenguajes de programación raros ni abrir 5 ventanas de terminal. Docker se encarga de crear un entorno seguro e instalar Node.js, Python, Redis y encender la Inteligencia artificial de forma invisible.

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
Ve a la carpeta principal del proyecto (donde está este README) y haz doble clic en el archivo instalador correspondiente a tu sistema:

* 🪟 **Si usas Windows:** Haz doble clic en `Iniciar_Nube.bat`
* 🍎 **Si usas Mac:** Haz doble clic en `Iniciar_Nube.command`

*Nota: La primera vez que lo abras, puede tardar varios minutos porque descargará la Inteligencia Artificial y preparará los servidores. Las siguientes veces será instantáneo.*

¡Listo! Cuando la terminal te diga que todo está listo, abre tu navegador y visita:
👉 **[http://localhost](http://localhost)**

Para apagar la nube, simplemente escribe `docker-compose down` en tu terminal o cierra la aplicación de Docker.

---

## 🖥️ Cómo compilar el Sincronizador de Escritorio (Desktop Client)

El sincronizador de escritorio es el programa instalable `.exe` o `.dmg` que la gente descarga desde la página web (el botón "Descargar" en el menú). Para generar este archivo:

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
6. Debes copiar ese archivo y pegarlo dentro de la carpeta `backend/public/downloads/` de este proyecto para que la página web pueda entregarlo a tus usuarios.

---

## 👨‍💻 Para Desarrolladores (Instalación Manual Antigua)
Si deseas editar el código fuente y correr los servidores manualmente sin Docker, consulta el archivo [COMO_LEVANTAR_EL_PROYECTO.md](COMO_LEVANTAR_EL_PROYECTO.md) para ver la guía técnica de desarrollo.

---

## 🔄 ¿Cómo instalar actualizaciones en el futuro?
Si en el futuro hay nuevas versiones de este proyecto en GitHub, actualizar es completamente seguro y a prueba de tontos. Tus fotos y bases de datos **NO se borrarán** porque Docker las guarda en una bóveda segura fuera del código (en la carpeta `storage`).

Para actualizar tu nube de forma segura:
1. Apaga tu nube actual (cierra la terminal o usa `docker-compose down`).
2. Descarga el nuevo `.zip` de GitHub con el botón verde **"<> Code"** y descomprímelo.
3. Copia TODO el contenido de esa nueva carpeta, EXCEPTO los siguientes archivos (que son tu información privada):
   * ❌ No copies/reemplaces la carpeta `storage/` (aquí viven tus fotos y tu base de datos).
   * ❌ No copies/reemplaces el archivo `frontend/.env` (aquí está tu API Key de mapas).
4. Pega los archivos nuevos en tu carpeta de siempre (reemplazando los viejos).
5. Haz doble clic nuevamente en el instalador (`Iniciar_Nube.bat` o `.command`). Docker detectará el nuevo código, lo actualizará automáticamente y encenderá tu nube.

---

## 🌍 ¿Cómo ver mi nube desde cualquier parte del mundo con mi propio dominio?
Por defecto, tu nube solo es accesible desde tu propia casa (a través de tu WiFi). Sin embargo, conectar tu computadora a internet con tu propio dominio (ej. `minube.com`) es muy fácil y seguro hoy en día sin tener que tocar la configuración de tu módem.

**La forma más fácil y segura (Cloudflare Tunnels):**
No necesitas abrir puertos en tu módem ni exponer tu computadora a ataques. 
1. Crea una cuenta gratuita en [Cloudflare Zero Trust](https://one.dash.cloudflare.com/).
2. Ve a la sección de **Tunnels** y crea un túnel nuevo.
3. Te pedirán que instales un pequeño programa gratuito en tu computadora que actúa como un "tubo privado" directo hacia Cloudflare.
4. Una vez instalado, en Cloudflare dile que apunte tu dominio web al puerto de tu nube (en este caso, `localhost:80`).
5. ¡Listo! Cualquier persona en el mundo podrá entrar a tu dominio y el tráfico viajará de forma encriptada directo a tu nube personal.
