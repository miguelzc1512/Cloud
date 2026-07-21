import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setPowerMode: (mode: 'eco' | 'max') => ipcRenderer.invoke('set-power-mode', mode),
  setServerUrl: (url: string) => ipcRenderer.invoke('set-server-url', url),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  linkFolder: (path: string, mode: 'index' | 'sync') => ipcRenderer.invoke('link-folder', { path, mode }),
  unlinkFolder: (path: string) => ipcRenderer.invoke('unlink-folder', path),
  getSyncState: () => ipcRenderer.invoke('get-sync-state'),
  pauseSync: () => ipcRenderer.invoke('pause-sync'),
  resumeSync: () => ipcRenderer.invoke('resume-sync'),
  onSyncStatus: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('sync-status', callback);
    // Return unsubscribe function
    return () => ipcRenderer.removeListener('sync-status', callback);
  },
  getAutoStart: () => ipcRenderer.invoke('get-auto-start'),
  setAutoStart: (enable: boolean) => ipcRenderer.invoke('set-auto-start', enable),
  backupDB: () => ipcRenderer.invoke('backup-db'),
  openStorage: () => ipcRenderer.invoke('open-storage'),
  openUrl: (url: string) => ipcRenderer.invoke('open-url', url),
  onServerStats: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('server-stats', callback);
    return () => ipcRenderer.removeListener('server-stats', callback);
  },
  onServerLog: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('server-log', callback);
    return () => ipcRenderer.removeListener('server-log', callback);
  }
});
