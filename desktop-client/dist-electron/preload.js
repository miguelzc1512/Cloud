let electron = require("electron");
//#region electron/preload.ts
electron.contextBridge.exposeInMainWorld("electronAPI", {
	getConfig: () => electron.ipcRenderer.invoke("get-config"),
	setServerUrl: (url) => electron.ipcRenderer.invoke("set-server-url", url),
	pickFolder: () => electron.ipcRenderer.invoke("pick-folder"),
	linkFolder: (path) => electron.ipcRenderer.invoke("link-folder", path),
	unlinkFolder: (path) => electron.ipcRenderer.invoke("unlink-folder", path),
	getSyncState: () => electron.ipcRenderer.invoke("get-sync-state"),
	pauseSync: () => electron.ipcRenderer.invoke("pause-sync"),
	resumeSync: () => electron.ipcRenderer.invoke("resume-sync"),
	onSyncStatus: (callback) => {
		electron.ipcRenderer.on("sync-status", callback);
		return () => electron.ipcRenderer.removeListener("sync-status", callback);
	}
});
//#endregion
