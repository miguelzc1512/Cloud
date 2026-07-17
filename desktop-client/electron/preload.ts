import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setServerUrl: (url: string) => ipcRenderer.invoke('set-server-url', url),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  linkFolder: (path: string) => ipcRenderer.invoke('link-folder', path),
  unlinkFolder: (path: string) => ipcRenderer.invoke('unlink-folder', path),
  getSyncState: () => ipcRenderer.invoke('get-sync-state'),
  pauseSync: () => ipcRenderer.invoke('pause-sync'),
  resumeSync: () => ipcRenderer.invoke('resume-sync'),
  onSyncStatus: (callback: (event: any, data: any) => void) => {
    ipcRenderer.on('sync-status', callback);
    // Return unsubscribe function
    return () => ipcRenderer.removeListener('sync-status', callback);
  }
});
