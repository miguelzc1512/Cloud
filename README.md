# ☁️ Cloud Personal (Alternativa a Google Fotos)

¡Bienvenido a **Cloud Personal**! Este es un proyecto de código abierto diseñado para que puedas montar tu propia "nube" privada, similar a Google Fotos. 

El proyecto consta de dos partes principales:
1. **La plataforma web (Visor):** Donde puedes entrar desde tu navegador para ver tus fotos, organizarlas, buscar por rostros usando Inteligencia Artificial, y verlas en un mapa.
2. **El cliente de escritorio (Sincronizador):** Una aplicación que instalas en tu computadora (Mac o Windows) para que suba y sincronice tus fotos automáticamente en segundo plano.

Si nunca has tocado código o programación en tu vida, ¡no te preocupes! Esta guía está escrita paso a paso para que puedas instalar y arrancar todo desde cero.

---

## 🛠️ Requisitos Previos

Antes de descargar el proyecto, necesitas instalar algunos programas básicos en tu computadora. Son gratuitos y fáciles de instalar:

1. **Node.js**: Es el motor que hace funcionar la página web y el servidor principal.
   * Descárgalo de [nodejs.org](https://nodejs.org/) (elige la versión "LTS") e instálalo como cualquier otro programa.
2. **Python**: Es el motor que usa nuestra Inteligencia Artificial para reconocer rostros y analizar fotos.
   * Descárgalo de [python.org](https://www.python.org/downloads/) e instálalo. *(Nota para Windows: Durante la instalación, asegúrate de marcar la casilla que dice "Add Python to PATH")*.
3. **Redis**: Es una pequeña base de datos en memoria que nos ayuda a procesar las fotos en "segundo plano" (para no saturar tu computadora mientras subes fotos).
   * **En Mac:** Puedes instalarlo abriendo tu terminal y escribiendo `brew install redis` (requiere tener Homebrew instalado).
   * **En Windows:** Puedes usar [Memurai](https://www.memurai.com/) (una alternativa gratuita a Redis para Windows) o instalarlo a través de WSL (Windows Subsystem for Linux).
4. **Git**: Para poder descargar este código fácilmente. Descárgalo de [git-scm.com](https://git-scm.com/).

---

## 🚀 1. Instalación del Proyecto

Abre tu "Terminal" (en Mac) o "Símbolo del sistema / CMD" (en Windows) y sigue estos pasos:

### Paso 1: Descargar el código
```bash
git clone https://github.com/miguelzc1512/Cloud.git
cd Cloud
```

### Paso 2: Instalar las dependencias del Servidor (Backend)
```bash
cd backend
npm install
cd ..
```

### Paso 3: Instalar las dependencias de la Web (Frontend)
```bash
cd frontend
npm install
cd ..
```

### Paso 4: Instalar las dependencias del Sincronizador (Desktop)
```bash
cd desktop-client
npm install
cd ..
```

---

## 🏃 2. Cómo Encender tu Nube (Paso a Paso)

Tu nube privada está compuesta por **5 piezas** que trabajan juntas. Para encenderla, necesitas abrir **5 ventanas diferentes de terminal** y ejecutar un comando distinto en cada una. ¡No cierres ninguna ventana mientras quieras usar tu nube!

### Terminal 1: Iniciar Redis (El motor de tareas)
En una terminal nueva, simplemente escribe:
```bash
redis-server
```

### Terminal 2: Iniciar la Inteligencia Artificial (Python)
Abre otra terminal, entra a la carpeta del proyecto y ejecuta la IA:
* **En Mac/Linux:**
  ```bash
  cd backend-ia
  ./start.sh
  ```
* **En Windows:**
  *(Nota: en Windows debes crear el entorno virtual y activarlo manualmente la primera vez).*
  ```cmd
  cd backend-ia
  python -m venv venv
  venv\Scripts\activate
  pip install -r requirements.txt
  uvicorn main:app --reload
  ```

### Terminal 3: Iniciar el Servidor Principal (El cerebro)
Abre otra terminal:
```bash
cd backend
npm run dev
```

### Terminal 4: Iniciar el Trabajador (Procesador de Fotos)
Este proceso es el que genera las miniaturas y extrae la información de las fotos. Abre otra terminal:
```bash
cd backend
npm run dev:worker
```

### Terminal 5: Iniciar la Página Web (La interfaz visual)
Abre tu última terminal:
```bash
cd frontend
npm run dev
```

¡Listo! Cuando la Terminal 5 termine de cargar, te dará un enlace (usualmente `http://localhost:5173/`). Ábrelo en tu navegador y verás tu nube privada funcionando.

---

## 📦 3. Cómo Compilar la App de Escritorio (Opcional)

Si entras a tu página web, verás botones para descargar el instalador de Mac o Windows. Para que esos botones funcionen, necesitas **generar los instaladores** y ponerlos en la carpeta correcta.

Para generar los instaladores:
1. Abre una terminal y ve a la carpeta del sincronizador:
   ```bash
   cd desktop-client
   ```
2. Ejecuta el comando para construir la app:
   ```bash
   npm run build
   ```
3. Si estás en una Mac, este comando creará un archivo llamado `CloudSync-mac.dmg` en la subcarpeta `release`. Si estás en Windows, creará `CloudSync-win.exe`.
4. Copia ese archivo generado y pégalo dentro de la carpeta: `backend/public/downloads/` (si no existe la carpeta `downloads`, créala).

Al hacer esto, ¡cualquier persona que visite tu página web podrá dar clic al botón y descargar el instalador de tu nube automáticamente!

---

## 🛑 Notas Finales
* **¿Dónde se guardan mis fotos?**
  Las fotos se guardan físicamente en tu computadora, dentro de una carpeta llamada `storage` en la raíz del proyecto.
* **Privacidad:**
  Al no usar servicios de terceros, ninguna de tus fotos sale de tu computadora. Toda la Inteligencia Artificial (reconocimiento facial) funciona 100% de manera local y privada.

¡Disfruta tu nueva nube personal! ☁️
