import { useState, useEffect } from 'react';
import { Cloud, FolderPlus, CheckCircle2, XCircle, ExternalLink, Folder, Pause, Play, Leaf, Zap, Terminal } from 'lucide-react';

export default function App() {
  const [config, setConfig] = useState<{ serverUrl: string, linkedFolders: string[], powerMode?: 'eco' | 'max' } | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ file: string, status: 'synced' | 'error' | 'syncing' | 'paused', progress?: number } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Buscando últimas actualizaciones...');
  const [isPaused, setIsPaused] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const loadConfig = async () => {
      const cfg = await (window as any).electronAPI.getConfig();
      setConfig(cfg);
      const state = await (window as any).electronAPI.getSyncState();
      setIsPaused(state.paused);
      setPendingFiles(state.pendingFiles || []);
    };
    loadConfig();

    let timeoutId: any;
    const unsubscribe = (window as any).electronAPI.onSyncStatus((_: any, data: any) => {
      if (data.status === 'paused' || data.status === 'idle') {
        setIsPaused(data.status === 'paused');
        setPendingFiles(data.pendingFiles || []);
        if (data.status === 'paused') setSyncStatus(null);
      } else {
        setSyncStatus(data);
        if (data.status === 'synced' || data.status === 'error') {
          const now = new Date();
          setLastSyncTime(`Última actualización: ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`);
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => setSyncStatus(null), 4000);
        } else {
          clearTimeout(timeoutId);
        }
      }
    });

    const unsubscribeLog = (window as any).electronAPI.onServerLog((_: any, log: string) => {
      setLogs(prev => [...prev, log].slice(-100));
    });

    return () => {
      if (unsubscribe) unsubscribe();
      if (unsubscribeLog) unsubscribeLog();
    };
  }, []);

  const handleLinkFolder = async () => {
    const path = await (window as any).electronAPI.pickFolder();
    if (path) {
      const newCfg = await (window as any).electronAPI.linkFolder(path);
      setConfig(newCfg);
    }
  };

  const handleUnlinkFolder = async (path: string) => {
    const newCfg = await (window as any).electronAPI.unlinkFolder(path);
    setConfig(newCfg);
  };

  const togglePause = async () => {
    if (isPaused) {
      const state = await (window as any).electronAPI.resumeSync();
      setIsPaused(state.paused);
      setPendingFiles(state.pendingFiles || []);
    } else {
      const state = await (window as any).electronAPI.pauseSync();
      setIsPaused(state.paused);
      setPendingFiles(state.pendingFiles || []);
    }
  };

  const togglePowerMode = async () => {
    if (!config) return;
    const newMode = config.powerMode === 'eco' ? 'max' : 'eco';
    await (window as any).electronAPI.setPowerMode(newMode);
    setConfig({ ...config, powerMode: newMode });
  };

  const openWeb = () => {
    if (config?.serverUrl) {
      window.open(config.serverUrl.replace('3001', '5173'), '_blank');
    }
  };

  if (!config) return <div className="h-screen w-screen flex items-center justify-center text-slate-500 bg-[#f8fafc]">Cargando...</div>;

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#f8fafc] font-sans selection:bg-blue-100">
      
      {/* Invisible draggable area for macOS traffic lights padding */}
      <div className="absolute top-0 left-0 right-0 h-10 draggable z-0 pointer-events-auto"></div>

      {/* Sidebar - Adjusted for traffic lights */}
      <aside className="w-64 flex flex-col px-6 pt-12 pb-4 non-draggable relative z-10">
        
        {/* Logo under traffic lights aligned left */}
        <div className="flex items-center gap-3 mb-8 px-1">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm shrink-0">
            <Cloud className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-medium text-slate-800 tracking-tight">Cloud Sync</span>
        </div>

        <button 
          onClick={handleLinkFolder}
          className="flex items-center justify-center gap-2 bg-white border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md hover:border-blue-100 hover:bg-slate-50 text-slate-700 font-medium px-4 py-3.5 rounded-2xl mb-8 transition-all"
        >
          <FolderPlus className="w-5 h-5 text-blue-600" />
          Añadir carpeta...
        </button>

        <div className="flex flex-col gap-2 mt-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-2 mb-2">Enlaces útiles</p>
          <button 
            onClick={openWeb}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir versión web
          </button>
        </div>

        <div className="flex flex-col gap-2 mt-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-2 mb-2">Energía</p>
          <button 
            onClick={togglePowerMode}
            className={`flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${config.powerMode === 'eco' ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}
          >
            <div className="flex items-center gap-3">
              {config.powerMode === 'eco' ? <Leaf className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              <span>Modo {config.powerMode === 'eco' ? 'Eco' : 'Turbo'}</span>
            </div>
            <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${config.powerMode === 'eco' ? 'bg-green-200' : 'bg-amber-200'}`}>
              <div className={`w-3 h-3 rounded-full bg-white transition-transform ${config.powerMode === 'eco' ? 'translate-x-0' : 'translate-x-4'}`}></div>
            </div>
          </button>
        </div>
      </aside>

      {/* Dashboard Area */}
      <main className="flex-1 overflow-y-auto p-4 pt-12 non-draggable relative z-10">
        <div className="flex flex-col gap-4 max-w-3xl">
          
          {/* Status Cards Row */}
          <div className="flex gap-4">
            {/* Sync Status Card */}
            <div className="flex-[3] bg-white rounded-[1.75rem] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {isPaused ? <Pause className="w-7 h-7 text-amber-500 fill-amber-500" /> : <Cloud className="w-7 h-7 text-green-600" />}
                    <h2 className="text-2xl font-medium text-slate-800">
                      {isPaused ? 'En Pausa' : syncStatus && syncStatus.status === 'syncing' ? 'Sincronizando...' : 'Actualizado'}
                    </h2>
                  </div>
                  <button onClick={togglePause} className={`p-2 rounded-full transition-colors ${isPaused ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title={isPaused ? "Reanudar" : "Pausar"}>
                    {isPaused ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5 fill-current" />}
                  </button>
                </div>
                <p className="text-sm text-slate-500 ml-10">
                  {isPaused
                    ? (pendingFiles.length > 0 ? `${pendingFiles.length} ${pendingFiles.length === 1 ? 'archivo pendiente' : 'archivos pendientes'} por subir` : 'La subida automática está detenida')
                    : syncStatus && syncStatus.status === 'syncing' 
                      ? `Subiendo: ${syncStatus.file.split(/[/\\]/).pop()} (${syncStatus.progress}%)` 
                      : syncStatus && syncStatus.status === 'synced'
                        ? `Completado: ${syncStatus.file.split(/[/\\]/).pop()}`
                        : lastSyncTime}
                </p>
              </div>
            </div>

            {/* All Good Card */}
            <div className="flex-[2] bg-white rounded-[1.75rem] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-medium text-slate-800 mb-1">Estás al día</h2>
                <p className="text-xs text-slate-500">Todo en orden.</p>
              </div>
              <div className="w-16 h-16 bg-blue-50/80 rounded-full flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-8 h-8 text-blue-500" />
              </div>
            </div>
          </div>

          {/* Linked Folders Card */}
          <div className="bg-white rounded-[1.75rem] p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-slate-100 mt-2 min-h-[300px]">
            <h2 className="text-lg font-medium text-slate-800 mb-1">Carpetas locales vigiladas</h2>
            <p className="text-sm text-slate-500 mb-6">
              El contenido de estas carpetas se sube automáticamente a la nube.
            </p>

            <div className="space-y-3">
              {config.linkedFolders.length === 0 ? (
                <div className="py-12 px-6 rounded-[1.25rem] border-2 border-dashed border-slate-200 text-center flex flex-col items-center justify-center">
                  <Folder className="w-12 h-12 text-slate-300 mb-4" />
                  <p className="text-[15px] text-slate-600 font-medium">No hay carpetas vinculadas</p>
                  <p className="text-[13px] text-slate-400 mt-1">Añade una carpeta local para empezar a sincronizar</p>
                </div>
              ) : (
                config.linkedFolders.map((f: any) => {
                  const folderPath = typeof f === 'string' ? f : f.path;
                  return (
                    <div key={folderPath} className="flex items-center justify-between p-4 rounded-[1.25rem] hover:bg-slate-50 border border-slate-100 hover:border-slate-200 group transition-all">
                      <div className="flex items-center gap-4 overflow-hidden">
                        <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <Folder className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[15px] font-medium text-slate-800 truncate">{folderPath.split(/[/\\]/).pop()}</p>
                          <p className="text-xs text-slate-400 truncate mt-0.5" title={folderPath}>{folderPath}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleUnlinkFolder(folderPath)}
                        className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-50 transition-all shrink-0"
                        title="Desvincular"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Logs Terminal */}
          <div className="bg-slate-900 rounded-[1.75rem] p-6 shadow-lg mt-2 min-h-[200px] flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="w-5 h-5 text-slate-400" />
              <h2 className="text-sm font-medium text-slate-300">Registro de Actividad</h2>
            </div>
            <div className="flex-1 bg-black/40 rounded-xl p-4 overflow-y-auto max-h-[250px] font-mono text-[11px] text-slate-300 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {logs.length === 0 ? (
                <p className="text-slate-500 italic">Esperando actividad...</p>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="break-all border-l-2 border-slate-700 pl-2 opacity-90 hover:opacity-100">{log}</div>
                ))
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
