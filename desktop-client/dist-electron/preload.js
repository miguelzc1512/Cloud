let electron = require("electron");
//#region electron/preload.ts
electron.contextBridge.exposeInMainWorld("electronAPI", {
	minimizeWindow: () => electron.ipcRenderer.send("window-minimize"),
	closeWindow: () => electron.ipcRenderer.send("window-close"),
	getConfig: () => electron.ipcRenderer.invoke("get-config"),
	setPowerMode: (mode) => electron.ipcRenderer.invoke("set-power-mode", mode),
	setServerUrl: (url) => electron.ipcRenderer.invoke("set-server-url", url),
	pickFolder: () => electron.ipcRenderer.invoke("pick-folder"),
	linkFolder: (path, mode) => electron.ipcRenderer.invoke("link-folder", {
		path,
		mode
	}),
	unlinkFolder: (params) => electron.ipcRenderer.invoke("unlink-folder", params),
	getSyncState: () => electron.ipcRenderer.invoke("get-sync-state"),
	pauseSync: () => electron.ipcRenderer.invoke("pause-sync"),
	resumeSync: () => electron.ipcRenderer.invoke("resume-sync"),
	onSyncStatus: (callback) => {
		electron.ipcRenderer.on("sync-status", callback);
		return () => electron.ipcRenderer.removeListener("sync-status", callback);
	},
	getAutoStart: () => electron.ipcRenderer.invoke("get-auto-start"),
	setAutoStart: (enable) => electron.ipcRenderer.invoke("set-auto-start", enable),
	backupDB: () => electron.ipcRenderer.invoke("backup-db"),
	openStorage: () => electron.ipcRenderer.invoke("open-storage"),
	openUrl: (url) => electron.ipcRenderer.invoke("open-url", url),
	onServerStats: (callback) => {
		electron.ipcRenderer.on("server-stats", callback);
		return () => electron.ipcRenderer.removeListener("server-stats", callback);
	},
	onServerLog: (callback) => {
		electron.ipcRenderer.on("server-log", callback);
		return () => electron.ipcRenderer.removeListener("server-log", callback);
	},
	onSSEEvent: (callback) => {
		electron.ipcRenderer.on("sse-event", callback);
		return () => electron.ipcRenderer.removeListener("sse-event", callback);
	}
});
//#endregion
