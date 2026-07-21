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
Ve a la carpeta principal del proyecto (donde está este README) y haz doble clic en el archivo instalador correspondiente a tu sistema:

* 🪟 **Si usas Windows:** Haz doble clic en `Iniciar_Nube.bat`
* 🍎 **Si usas Mac:** Haz doble clic en `Iniciar_Nube.command`

*Nota: La primera vez que lo abras, puede tardar unos minutos en descargar y preparar los servicios.*

¡Listo! Cuando la terminal te diga que todo está listo, abre tu navegador y visita:
👉 **[http://localhost](http://localhost)**

Para apagar la nube, simplemente escribe `docker-compose down` en tu terminal o cierra la aplicación de Docker.

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
