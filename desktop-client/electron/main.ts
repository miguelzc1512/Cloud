import * as path from "node:path";
import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import * as fs from 'fs';
import chokidar from 'chokidar';
import axios from 'axios';
import FormData from 'form-data';
const isDev = process.env.NODE_ENV !== 'production';

// Configuraciones locales
const configPath = path.join(app.getPath('userData'), 'sync-config.json');
const statePath = path.join(app.getPath('userData'), 'sync-state.json');

let config = {
  serverUrl: 'http://localhost:3001',
  linkedFolders: [] as string[]
};

let uploadedState: Record<string, boolean> = {};

// Cargar estado inicial
if (fs.existsSync(configPath)) {
  try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
}
if (fs.existsSync(statePath)) {
  try { uploadedState = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (e) {}
}

const saveConfig = () => fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
const saveState = () => fs.writeFileSync(statePath, JSON.stringify(uploadedState));

let isSyncPaused = false;
let pendingUploads: string[] = [];

// Watchers activos
const watchers: Record<string, chokidar.FSWatcher> = {};

function notifySyncStatus() {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('sync-status', { status: isSyncPaused ? 'paused' : 'idle', pendingCount: pendingUploads.length, pendingFiles: pendingUploads });
  });
}

function startWatching(folderPath: string) {
  if (watchers[folderPath]) return;

  console.log(`Starting to watch: ${folderPath}`);
  const watcher = chokidar.watch(folderPath, {
    ignored: /(^|[\/\\])\../, // ignorar archivos ocultos
    persistent: true,
    ignoreInitial: false
  });

  watcher.on('add', async (filePath) => {
    // Verificar si es imagen/video básico
    const ext = path.extname(filePath).toLowerCase();
    const isMedia = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.mp4', '.mov', '.avi'].includes(ext);
    
    if (isMedia && !uploadedState[filePath]) {
      if (isSyncPaused) {
        if (!pendingUploads.includes(filePath)) {
          pendingUploads.push(filePath);
          notifySyncStatus();
        }
      } else {
        await uploadFile(filePath);
      }
    }
  });

  watchers[folderPath] = watcher;
}

// ... rest of the file stays same until IPC handlers ...
function stopWatching(folderPath: string) {
  if (watchers[folderPath]) {
    watchers[folderPath].close();
    delete watchers[folderPath];
    console.log(`Stopped watching: ${folderPath}`);
  }
}

async function uploadFile(filePath: string) {
  if (!config.serverUrl) return;

  try {
    console.log(`Uploading ${filePath}...`);
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    formData.append('relativePath', filePath);

    // Notificar inicio de subida
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('sync-status', { file: filePath, status: 'syncing', progress: 0 });
    });

    const response = await axios.post(`${config.serverUrl}/api/upload`, formData, {
      headers: { ...formData.getHeaders() },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 100));
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('sync-status', { file: filePath, status: 'syncing', progress: percentCompleted });
        });
      }
    });

    uploadedState[filePath] = true;
    saveState();
    
    // Notificar finalización
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('sync-status', { file: filePath, status: 'synced', progress: 100 });
    });
    console.log(`Uploaded successfully: ${filePath}`);
  } catch (error: any) {
    console.error(`Failed to upload ${filePath}:`, error.message);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('sync-status', { status: 'error', file: path.basename(filePath) });
    });
  }
}

// Iniciar watchers previos
config.linkedFolders.forEach(startWatching);

let tray: Tray | null = null;
let isQuitting = false;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f3f4f6', // Gris claro estilo Google Drive
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  return mainWindow;
}

app.whenReady().then(() => {
  const mainWindow = createWindow();

  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('\u2601\uFE0E'); // Cloud symbol text-presentation (minimalist)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Mostrar Cloud Sync', click: () => { mainWindow.show(); } },
    { type: 'separator' },
    { label: 'Salir', click: () => { isQuitting = true; app.quit(); } }
  ]);
  tray.setToolTip('Cloud Sync');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    mainWindow.show();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // app.quit(); // Comentado para que viva en segundo plano también en Windows
  }
});

// IPC Handlers
ipcMain.handle('get-config', () => config);

ipcMain.handle('set-server-url', (event, url) => {
  config.serverUrl = url;
  saveConfig();
  return config;
});

ipcMain.handle('get-sync-state', () => {
  return { paused: isSyncPaused, pendingCount: pendingUploads.length, pendingFiles: pendingUploads };
});

ipcMain.handle('pause-sync', () => {
  isSyncPaused = true;
  notifySyncStatus();
  return { paused: true, pendingCount: pendingUploads.length, pendingFiles: pendingUploads };
});

ipcMain.handle('resume-sync', async () => {
  isSyncPaused = false;
  notifySyncStatus();
  
  const toUpload = [...pendingUploads];
  pendingUploads = [];
  
  // Procesar cola en background
  (async () => {
    for (const filePath of toUpload) {
      if (!isSyncPaused) {
        await uploadFile(filePath);
      } else {
        pendingUploads.push(filePath);
      }
    }
    notifySyncStatus();
  })();
  
  return { paused: false, pendingCount: pendingUploads.length, pendingFiles: pendingUploads };
});

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('link-folder', (event, folderPath) => {
  if (!config.linkedFolders.includes(folderPath)) {
    config.linkedFolders.push(folderPath);
    saveConfig();
    startWatching(folderPath);
  }
  return config;
});

ipcMain.handle('unlink-folder', (event, folderPath) => {
  config.linkedFolders = config.linkedFolders.filter(f => f !== folderPath);
  saveConfig();
  stopWatching(folderPath);
  return config;
});
