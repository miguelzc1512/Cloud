# Guía de Uso y Desarrollo de Cloud Sync

Bienvenido a la documentación de **Cloud Sync**, una aplicación de nube personal (tipo Google Photos) que se ejecuta localmente en tu computadora.

## 1. Arquitectura Actual
Cloud Sync está diseñado como una aplicación de escritorio independiente (Electron) con las siguientes tecnologías:
- **Frontend:** React, TailwindCSS, Vite
- **Backend:** Node.js, Express, SQLite (better-sqlite3)
- **Procesamiento de IA:** TensorFlow.js (reconocimiento de caras y objetos), Sharp (optimización de imágenes).
- **Empaquetado:** Electron Builder (para generar los ejecutables `.exe` y `.dmg`).

## 2. Dónde se guardan los datos
La aplicación es 100% privada y funciona offline. No sube nada a servidores externos.
- **Tus Fotos y Base de Datos:** Se guardan en una carpeta protegida del sistema. En Windows esto es `%APPDATA%/Cloud Sync/cloud-storage/` (usualmente `C:\Users\TuUsuario\AppData\Roaming\Cloud Sync\cloud-storage`).
- **Los Originales:** Cuando vinculas una carpeta, la aplicación **copia** los archivos originales a su propia bóveda interna en la ruta mencionada arriba. A partir de ahí, puedes borrar los originales si quieres, la aplicación ya los tiene seguros.

## 3. Entorno de Desarrollo ("En Vivo")
Si en el futuro quieres seguir programando, agregando funciones o ajustando el diseño, puedes trabajar "en vivo" (con recarga automática o Hot Reload) como lo hacíamos antes.

### Pasos para desarrollar:
1. **Frontend (La página web y galería):**
   Abre una terminal en la carpeta `frontend/` y ejecuta:
   ```bash
   npm run dev
   ```
   Esto levantará el servidor de desarrollo en `http://localhost:5173`. Aquí podrás editar el código de React y ver los cambios al instante en tu navegador.

2. **Aplicación de Escritorio (Backend e IA):**
   Abre otra terminal en la carpeta `desktop-client/` y ejecuta:
   ```bash
   npm run dev
   ```
   Esto abrirá la ventana de la aplicación de escritorio y arrancará el servidor interno (en el puerto `3001`).

*Nota:* Si haces cambios en el frontend y quieres que se reflejen en la versión final compilada, debes ir a `frontend/`, ejecutar `npm run build`, y luego copiar el contenido de la carpeta `dist/` hacia `desktop-client/public/web/`.

## 4. Cómo compilar nuevas versiones (.exe y .dmg)
Si terminaste de hacer actualizaciones y quieres generar un nuevo instalador para compartir:
1. Asegúrate de haber compilado el frontend y haberlo movido a `desktop-client/public/web/` como se explica en el punto anterior.
2. Ve a la carpeta `desktop-client/`.
3. Ejecuta el comando de compilación según el sistema operativo:
   - **Para Mac:** `npm run build`
   - **Para Windows:** `npm run build -- --win --x64`
4. Los ejecutables finales aparecerán en la carpeta `desktop-client/release/`.

## 5. Compartir la aplicación con otras personas
¡Sí! Puedes pasarle el `.exe` (Windows) o `.dmg` (Mac) a cualquier persona en el mundo, por USB o correo. 
No necesitan instalar Node.js, ni Python, ni saber de programación. Es un instalador normal de "Siguiente -> Siguiente". Al instalarlo, todo funcionará "out of the box", ya que el motor de IA, el servidor web y la base de datos están empaquetados dentro de la aplicación.

## 6. Conectar a una dirección web pública en el futuro
Actualmente Cloud Sync corre en tu "localhost" (red local). Si viajas a China o sales de tu casa y quieres ver tus fotos, necesitarás exponer tu servidor local a Internet.

Hay dos formas principales de hacerlo sin tener que pagar servidores costosos:

### Opción A: Tailscale (La más segura y gratuita)
Tailscale crea una VPN privada. 
1. Instalas Tailscale en tu PC (la que tiene Cloud Sync) y en tu celular o laptop de viaje.
2. Tailscale le dará a tu PC una IP especial (ej. `100.115.x.x`).
3. Dejas tu PC encendida en casa con Cloud Sync abierto.
4. Desde cualquier parte del mundo, si tienes Tailscale prendido, abres tu navegador y entras a `http://100.115.x.x:3001` y verás tu nube. Es 100% privado.

### Opción B: Cloudflare Tunnels (Para tener un dominio real)
Si quieres entrar desde `https://mis-fotos.com` sin instalar nada en tu celular:
1. Compras un dominio.
2. Instalas *Cloudflare `cloudflared`* en tu computadora.
3. Configuras un túnel que apunte tu dominio al puerto `3001` de tu computadora.
4. Listo. Cualquiera con la contraseña podrá entrar a tu nube usando la dirección web.

---
*Fin de la guía.*
