import * as path from "node:path";
import { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } from 'electron';
import * as fs from 'fs';
import chokidar from 'chokidar';
import axios from 'axios';
import FormData from 'form-data';
const isDev = process.env.NODE_ENV !== 'production';

// Cliente de Escritorio - Sin servidor local (se conecta al backend principal)
// Configuraciones locales
const configPath = path.join(app.getPath('userData'), 'sync-config.json');
const statePath = path.join(app.getPath('userData'), 'sync-state.json');

let config = {
  serverUrl: 'http://localhost:3001',
  linkedFolders: [] as Array<{ path: string, mode: 'index' | 'sync' }>,
  powerMode: 'eco' as 'eco' | 'max'
};

let uploadedState: Record<string, boolean> = {};

// Cargar estado inicial
if (fs.existsSync(configPath)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (loaded.serverUrl) config.serverUrl = loaded.serverUrl;
    if (Array.isArray(loaded.linkedFolders)) {
      config.linkedFolders = loaded.linkedFolders.map((f: any) => {
        if (typeof f === 'string') return { path: f, mode: 'index' as const };
        return f;
      });
    }
    if (loaded.powerMode === 'eco' || loaded.powerMode === 'max') {
      config.powerMode = loaded.powerMode;
    }
  } catch (e) {}
}
if (fs.existsSync(statePath)) {
  try { uploadedState = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch (e) {}
}

const saveConfig = () => fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
const saveState = () => fs.writeFileSync(statePath, JSON.stringify(uploadedState));

let isSyncPaused = false;
let pendingUploads: Array<{ path: string; mode: 'index' | 'sync' }> = [];

// Watchers activos
const watchers: Record<string, chokidar.FSWatcher> = {};

function notifySyncStatus() {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('sync-status', { status: isSyncPaused ? 'paused' : 'idle', pendingCount: pendingUploads.length, pendingFiles: pendingUploads.map(p => p.path) });
  });
}

function startWatching(folder: { path: string, mode: 'index' | 'sync' }) {
  if (watchers[folder.path]) return;

  console.log(`Starting to watch: ${folder.path} [${folder.mode}]`);
  const watcher = chokidar.watch(folder.path, {
    ignored: /(^|[\/\\])\../, // ignorar archivos ocultos
    persistent: true,
    ignoreInitial: true
  });

  watcher.on('add', async (filePath) => {
    // Verificar si es imagen, video o documento soportado
    const ext = path.extname(filePath).toLowerCase();
    const isSupported = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.mp4', '.mov', '.webm', '.avi', '.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.md'].includes(ext);
    
    if (isSupported) {
      const isAlreadyUploaded = uploadedState['sync:' + filePath] || uploadedState[filePath];
      const isAlreadyIndexed = uploadedState['index:' + filePath];

      if ((folder.mode === 'sync' && !isAlreadyUploaded) || (folder.mode === 'index' && !isAlreadyIndexed)) {
        if (isSyncPaused) {
          if (!pendingUploads.find(p => p.path === filePath)) {
            pendingUploads.push({ path: filePath, mode: folder.mode, contentType: (folder as any).contentType || 'gallery' });
            notifySyncStatus();
          }
        } else {
          if (folder.mode === 'sync') {
            await uploadFile(filePath, (folder as any).contentType || 'gallery');
          } else {
            await indexFile(filePath, (folder as any).contentType || 'gallery');
          }
        }
      }
    }
  });

  watchers[folder.path] = watcher;
}

function stopWatching(folderPath: string) {
  if (watchers[folderPath]) {
    watchers[folderPath].close();
    delete watchers[folderPath];
    console.log(`Stopped watching: ${folderPath}`);
  }
}

async function indexFile(filePath: string, contentType: 'gallery' | 'drive' = 'gallery') {
  try {
    console.log(`Indexing ${filePath}...`);
    // Notificar inicio
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('sync-status', { file: filePath, status: 'syncing', progress: 50, contentType });
    });

    await axios.post(`${config.serverUrl}/api/index-file`, { absolutePath: filePath, contentType });

    uploadedState['index:' + filePath] = true;
    saveState();
    
    // Notificar finalización
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('sync-status', { file: filePath, status: 'synced', progress: 100, contentType });
    });
    console.log(`Indexed successfully: ${filePath}`);
  } catch (error: any) {
    console.error(`Failed to index ${filePath}:`, error.message);
    if (!pendingUploads.find(p => p.path === filePath)) pendingUploads.push({ path: filePath, mode: 'index' });
    isSyncPaused = true;
    notifySyncStatus();
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('sync-status', { status: 'error', file: path.basename(filePath), contentType });
    });
  }
}

async function uploadFile(filePath: string, contentType: 'gallery' | 'drive' = 'gallery') {
  if (!config.serverUrl) return;

  try {
    console.log(`Uploading ${filePath}...`);
    let relativePath = path.basename(filePath);
    const matchedFolder = config.linkedFolders.filter(f => filePath.startsWith(f.path)).sort((a,b) => b.path.length - a.path.length)[0];
    if (matchedFolder) {
      const parentDir = path.dirname(matchedFolder.path);
      relativePath = path.relative(parentDir, filePath).replace(/\\/g, '/');
    }

    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    formData.append('contentType', contentType);
    formData.append('relativePath', relativePath);

    // Notificar inicio de subida
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('sync-status', { file: filePath, status: 'syncing', progress: 0, contentType });
    });

    const response = await axios.post(`${config.serverUrl}/api/upload`, formData, {
      headers: { ...formData.getHeaders() },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 100));
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('sync-status', { file: filePath, status: 'syncing', progress: percentCompleted, contentType });
        });
      }
    });

    uploadedState['sync:' + filePath] = true;
    uploadedState[filePath] = true;
    saveState();
    
    // Notificar finalización
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('sync-status', { file: filePath, status: 'synced', progress: 100, contentType });
    });
    console.log(`Uploaded successfully: ${filePath}`);
  } catch (error: any) {
    console.error(`Failed to upload ${filePath}:`, error.message);
    if (!pendingUploads.find(p => p.path === filePath)) pendingUploads.push({ path: filePath, mode: 'sync' });
    isSyncPaused = true;
    notifySyncStatus();
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('sync-status', { status: 'error', file: path.basename(filePath), contentType });
    });
  }
}

// Iniciar watchers previos
config.linkedFolders.forEach(startWatching);

// ─── SSE: Escuchar eventos del servidor y reenviarlos al renderer ────────────
import * as http from 'http';
import * as https from 'https';

function connectServerSSE() {
  const serverUrl = config.serverUrl || 'http://localhost:3001';
  const url = new URL('/api/stream', serverUrl);
  const lib = url.protocol === 'https:' ? https : http;

  const req = lib.get(url.toString(), (res) => {
    let buffer = '';
    let eventName = '';
    let eventData = '';

    res.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventName = line.replace('event:', '').trim();
        } else if (line.startsWith('data:')) {
          eventData = line.replace('data:', '').trim();
        } else if (line === '') {
          // Fin de un evento, enviarlo a todos los renderers
          if (eventName && eventData) {
            try {
              const parsed = JSON.parse(eventData);
              BrowserWindow.getAllWindows().forEach(win => {
                win.webContents.send('sse-event', { event: eventName, data: parsed });
              });
            } catch {}
          }
          eventName = '';
          eventData = '';
        }
      }
    });

    res.on('end', () => {
      // Reconectar si se cierra la conexión de forma limpia
      setTimeout(connectServerSSE, 3000);
    });

    res.on('close', () => {
      // Reconectar si el socket se cierra de forma abrupta
      if (!res.complete) setTimeout(connectServerSSE, 3000);
    });

    res.on('error', () => {
      setTimeout(connectServerSSE, 3000);
    });
  });

  req.on('error', () => {
    // Reintentar si no está disponible aún
    setTimeout(connectServerSSE, 5000);
  });
}

// Iniciar SSE después de que la app esté lista
app.whenReady().then(() => {
  setTimeout(connectServerSSE, 2000);
});


let tray: Tray | null = null;
let isQuitting = false;

function createWindow() {
  const splash = new BrowserWindow({
    width: 400,
    height: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    splash.loadURL(process.env.VITE_DEV_SERVER_URL + 'splash.html');
  } else {
    splash.loadFile(path.join(__dirname, '../dist/splash.html'));
  }

  const mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    frame: false,           // Sin barra de titulo nativa en todas las plataformas
    titleBarStyle: 'hidden', // macOS: sin barra pero con semáforos
    backgroundColor: '#f8fafc',
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

  mainWindow.once('ready-to-show', () => {
    // Dar un par de segundos extra para que el servidor de node levante los modelos pesados
    setTimeout(() => {
      if (!splash.isDestroyed()) splash.destroy();
      mainWindow.show();
    }, 3000);
  });

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

  const trayIconPath = path.join(__dirname, '..', 'public', 'tray.png');
  const trayIcon = nativeImage.createFromPath(trayIconPath);
  tray = new Tray(trayIcon);
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
// IPC Handlers
// (updatePowerMode would now go to central backend via API if needed)

// Controles de ventana para Windows (frame: false)
ipcMain.on('window-minimize', () => {
  BrowserWindow.getFocusedWindow()?.minimize();
});
ipcMain.on('window-close', () => {
  BrowserWindow.getFocusedWindow()?.hide();
});

ipcMain.handle('get-config', () => config);

ipcMain.handle('set-power-mode', (event, mode: 'eco' | 'max') => {
  config.powerMode = mode;
  saveConfig();
  // Optional: Send to central server via axios if it has an endpoint
  axios.post(`${config.serverUrl}/api/config/power-mode`, { mode }).catch(()=>{});
});

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
  
  // Procesar cola en background respetando el modo de cada archivo
  (async () => {
    for (const item of toUpload) {
      if (!isSyncPaused) {
        if (item.mode === 'sync') {
          await uploadFile(item.path, item.contentType as 'gallery' | 'drive' || 'gallery');
        } else {
          await indexFile(item.path, item.contentType as 'gallery' | 'drive' || 'gallery');
        }
      } else {
        pendingUploads.push(item);
      }
    }
    notifySyncStatus();
  })();
  
  return { paused: false, pendingCount: pendingUploads.length, pendingFiles: pendingUploads.map(p => p.path) };
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

async function processExistingSyncFiles(folderPath: string, contentType: 'gallery' | 'drive' = 'gallery') {
  const filesToUpload: string[] = [];
  
  function scan(dir: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(fullPath);
        } else {
          const ext = path.extname(fullPath).toLowerCase();
          const isSupported = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.mp4', '.mov', '.webm', '.avi', '.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.md'].includes(ext);
          const isAlreadyUploaded = uploadedState['sync:' + fullPath] || uploadedState[fullPath];
          if (isSupported && !isAlreadyUploaded) {
            filesToUpload.push(fullPath);
          }
        }
      }
    } catch (e) {
      console.error('Error scanning folder:', e);
    }
  }
  
  scan(folderPath);
  
  if (filesToUpload.length > 0) {
    console.log(`Found ${filesToUpload.length} existing files to sync in ${folderPath}`);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('sse-event', { event: 'scan_start', data: { total: filesToUpload.length, contentType } });
    });

    for (const file of filesToUpload) {
      if (isSyncPaused) {
        if (!pendingUploads.find(p => p.path === file)) pendingUploads.push({ path: file, mode: 'sync', contentType });
      } else {
        await uploadFile(file, contentType);
      }
    }
    
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('sse-event', { event: 'scan_done', data: { total: filesToUpload.length, contentType } });
    });
    notifySyncStatus();
  }
}

ipcMain.handle('link-folder', (event, { path: folderPath, mode, contentType }) => {
  let folder = config.linkedFolders.find(f => f.path === folderPath);
  if (!folder) {
    folder = { path: folderPath, mode: mode as 'index' | 'sync', contentType: contentType as 'gallery' | 'drive' } as any;
    config.linkedFolders.push(folder);
  } else {
    folder.mode = mode as 'index' | 'sync';
    (folder as any).contentType = contentType as 'gallery' | 'drive';
  }
  saveConfig();
  stopWatching(folderPath);
  startWatching(folder);
  
  // Si es index, corremos scan-local una vez para asegurar todo el árbol
  if (mode === 'index') {
    axios.post(`${config.serverUrl}/api/scan-local`, { directoryPath: folderPath, contentType: contentType as 'gallery' | 'drive' }).catch(console.error);
  } else if (mode === 'sync') {
    processExistingSyncFiles(folderPath, contentType as 'gallery' | 'drive').catch(console.error);
  }
  return config;
});

ipcMain.handle('unlink-folder', async (event, { folderPath, deleteFromCloud }) => {
  config.linkedFolders = config.linkedFolders.filter(f => f.path !== folderPath);
  saveConfig();
  stopWatching(folderPath);

  if (config.serverUrl) {
    try {
      await axios.post(`${config.serverUrl}/api/unlink-folder`, { folderPath, deleteFromCloud });
    } catch (error) {
      console.error('Failed to notify backend about unlink-folder', error);
    }
  }

  return config;
});

// --- Nuevas funciones de Panel de Control ---

ipcMain.handle('get-auto-start', () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle('set-auto-start', (event, enable) => {
  app.setLoginItemSettings({ openAtLogin: enable });
  return enable;
});

ipcMain.handle('backup-db', async () => {
  const result = await dialog.showSaveDialog({
    title: 'Respaldar Base de Datos',
    defaultPath: 'nube_backup.db',
    filters: [{ name: 'SQLite Database', extensions: ['db'] }]
  });
  if (!result.canceled && result.filePath) {
    const dbPath = path.join(process.env.STORAGE_PATH!, 'nube.db');
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, result.filePath);
      return true;
    }
  }
  return false;
});

ipcMain.handle('open-storage', () => {
  const { shell } = require('electron');
  const target = path.join(process.env.STORAGE_PATH!, 'thumbnails');
  if (fs.existsSync(target)) {
    shell.showItemInFolder(target);
  } else {
    shell.showItemInFolder(process.env.STORAGE_PATH!);
  }
});

ipcMain.handle('open-url', (event, url) => {
  require('electron').shell.openExternal(url);
});

// Re-transmitir eventos del servidor (internos) a la UI
process.on('server-stats', (stats) => {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('server-stats', stats);
  });
});

process.on('server-log', (log) => {
  BrowserWindow.getAllWindows().forEach(win => {
    win.webContents.send('server-log', log);
  });
});
