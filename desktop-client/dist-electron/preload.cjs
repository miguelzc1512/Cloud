import { contextBridge, ipcRenderer } from "electron";
//#region electron/preload.ts
contextBridge.exposeInMainWorld("electronAPI", {
	getConfig: () => ipcRenderer.invoke("get-config"),
	setServerUrl: (url) => ipcRenderer.invoke("set-server-url", url),
	pickFolder: () => ipcRenderer.invoke("pick-folder"),
	linkFolder: (path) => ipcRenderer.invoke("link-folder", path),
	unlinkFolder: (path) => ipcRenderer.invoke("unlink-folder", path),
	onSyncStatus: (callback) => {
		ipcRenderer.on("sync-status", callback);
		return () => ipcRenderer.removeListener("sync-status", callback);
	}
});
//#endregion
export {};
