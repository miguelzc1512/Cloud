import { useState, useEffect, useRef } from 'react';
import { Cloud, FolderPlus, CheckCircle2, XCircle, ExternalLink, Folder, Pause, Play, Image, Brain, Users, Sparkles } from 'lucide-react';

type StepInfo = {
  step: 'thumbnail' | 'embedding' | 'faces' | 'done';
  label: string;
  fileId: string;
};

type ProgressState = {
  current: number;
  total: number;
  currentFile: string;
  stepInfo: StepInfo | null;
};

const STEP_ICONS: Record<string, React.ReactNode> = {
  thumbnail: <Image className="w-3.5 h-3.5" />,
  embedding: <Brain className="w-3.5 h-3.5" />,
  faces: <Users className="w-3.5 h-3.5" />,
  done: <Sparkles className="w-3.5 h-3.5" />,
};

export default function App() {
  const [config, setConfig] = useState<{ serverUrl: string, linkedFolders: { path: string, mode: 'index' | 'sync' }[], powerMode?: 'eco' | 'max' } | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ file: string, status: 'synced' | 'error' | 'syncing' | 'paused', progress?: number } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Buscando últimas actualizaciones...');
  const [isPaused, setIsPaused] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Conectar al SSE del backend para escuchar progreso en tiempo real
  const connectSSE = (serverUrl: string) => {
    if (eventSourceRef.current) eventSourceRef.current.close();
    const es = new EventSource(`${serverUrl}/api/stream`);
    
    es.addEventListener('scan_start', (e: any) => {
      const data = JSON.parse(e.data);
      setProgress({ current: 0, total: data.total, currentFile: '', stepInfo: null });
    });

    es.addEventListener('scan_progress', (e: any) => {
      const data = JSON.parse(e.data);
      setProgress(prev => prev ? { ...prev, current: data.queued, total: data.total } : null);
    });

    es.addEventListener('upload_started', (e: any) => {
      const data = JSON.parse(e.data);
      setProgress(prev => prev
        ? { ...prev, current: data.queued || prev.current, total: data.total || prev.total, currentFile: data.originalName }
        : { current: 1, total: data.total || 1, currentFile: data.originalName, stepInfo: null }
      );
    });

    es.addEventListener('worker_step', (e: any) => {
      const data = JSON.parse(e.data);
      setProgress(prev => prev ? { ...prev, stepInfo: { step: data.step, label: data.label, fileId: data.fileId } } : null);
      if (data.step === 'done') {
        // Limpiar el stepInfo al terminar un archivo
        setTimeout(() => {
          setProgress(prev => prev ? { ...prev, stepInfo: null } : null);
        }, 800);
      }
    });

    es.addEventListener('scan_done', (e: any) => {
      const data = JSON.parse(e.data);
      setTimeout(() => {
        setProgress(null);
        const now = new Date();
        setLastSyncTime(`Última actualización: ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`);
      }, 2000);
    });

    es.onerror = () => {
      // Reconectar silenciosamente si se pierde la conexión
      setTimeout(() => connectSSE(serverUrl), 5000);
    };

    eventSourceRef.current = es;
  };

  useEffect(() => {
    const loadConfig = async () => {
      const cfg = await (window as any).electronAPI.getConfig();
      setConfig(cfg);
      if (cfg?.serverUrl) connectSSE(cfg.serverUrl);
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

    return () => {
      if (unsubscribe) unsubscribe();
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  const handleLinkFolder = async (mode: 'index' | 'sync') => {
    const path = await (window as any).electronAPI.pickFolder();
    if (path) {
      const newCfg = await (window as any).electronAPI.linkFolder(path, mode);
      setConfig(newCfg);
    }
  };

  const handleUnlinkFolder = async (path: string) => {
    const newCfg = await (window as any).electronAPI.unlinkFolder(path);
    setConfig(newCfg);
  };

  const handlePowerMode = async (mode: 'eco' | 'max') => {
    await (window as any).electronAPI.setPowerMode(mode);
    setConfig(prev => prev ? { ...prev, powerMode: mode } : prev);
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

  const openWeb = () => {
    if (config?.serverUrl) {
      window.open(config.serverUrl.replace('3001', '5173'), '_blank');
    }
  };

  const isProcessing = progress !== null || (syncStatus && syncStatus.status === 'syncing');
  const progressPercent = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  if (!config) return <div className="h-screen w-screen flex items-center justify-center text-slate-500 bg-[#f8fafc]">Cargando...</div>;

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-[#f8fafc] font-sans selection:bg-blue-100 draggable">
      
      {/* Sidebar */}
      <aside className="w-64 flex flex-col px-6 pt-12 pb-4 relative z-10">
        
        {/* Logo under traffic lights aligned left */}
        <div className="flex items-center gap-3 mb-8 px-1 non-draggable">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm shrink-0">
            <Cloud className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-medium text-slate-800 tracking-tight">Cloud Sync</span>
        </div>

        <div className="flex flex-col gap-2 mb-8 non-draggable">
          <button 
            onClick={() => handleLinkFolder('sync')}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 shadow-sm hover:shadow-md text-white font-medium px-4 py-3.5 rounded-2xl transition-all"
            title="Sube los archivos de esta carpeta a la nube y los mantiene sincronizados"
          >
            <Cloud className="w-5 h-5 shrink-0" />
            <span className="truncate">Sincronizar carpeta</span>
          </button>
          
          <button 
            onClick={() => handleLinkFolder('index')}
            className="flex items-center justify-center gap-2 bg-white border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-sm hover:border-blue-100 hover:bg-slate-50 text-slate-700 font-medium px-4 py-3 rounded-2xl transition-all"
            title="Solo analiza rostros y metadatos localmente para buscar, sin subir fotos a la nube (ahorra espacio)"
          >
            <FolderPlus className="w-5 h-5 text-blue-600 shrink-0" />
            <span className="truncate">Solo indexar (No subir)</span>
          </button>
        </div>

        <div className="flex flex-col gap-2 mt-2 non-draggable">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-2 mb-2">Enlaces útiles</p>
          <button 
            onClick={openWeb}
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir versión web
          </button>
        </div>

        <div className="flex flex-col gap-2 mt-4 non-draggable">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-2 mb-1">Rendimiento (Fotos)</p>
          <div className="flex bg-slate-100/80 rounded-xl p-1 mx-2">
            <button 
              onClick={() => handlePowerMode('eco')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${config?.powerMode === 'eco' || !config?.powerMode ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
              title="Ahorra batería, ideal para el día a día"
            >
              Normal
            </button>
            <button 
              onClick={() => handlePowerMode('max')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${config?.powerMode === 'max' ? 'bg-blue-600 shadow-sm text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
              title="Usa todos los núcleos para cargar más rápido (consume más batería)"
            >
              Máximo
            </button>
          </div>
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
                      {isPaused ? 'En Pausa' : isProcessing ? 'Procesando...' : 'Actualizado'}
                    </h2>
                  </div>
                  <button onClick={togglePause} className={`p-2 rounded-full transition-colors ${isPaused ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`} title={isPaused ? "Reanudar" : "Pausar"}>
                    {isPaused ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5 fill-current" />}
                  </button>
                </div>
                <p className="text-sm text-slate-500 ml-10 truncate">
                  {isPaused
                    ? (pendingFiles.length > 0 ? `${pendingFiles.length} ${pendingFiles.length === 1 ? 'archivo pendiente' : 'archivos pendientes'} por subir` : 'La subida automática está detenida')
                    : progress
                      ? progress.currentFile ? progress.currentFile : 'Preparando...'
                      : syncStatus && syncStatus.status === 'syncing'
                        ? `Subiendo: ${syncStatus.file.split(/[/\\]/).pop()} (${syncStatus.progress}%)`
                        : syncStatus && syncStatus.status === 'synced'
                          ? `Completado: ${syncStatus.file.split(/[/\\]/).pop()}`
                          : lastSyncTime}
                </p>
              </div>

              {/* Barra de progreso general */}
              {progress && progress.total > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-blue-600">
                      {progress.current} de {progress.total} archivos
                    </span>
                    <span className="text-xs text-slate-400">{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  {/* Pasos del worker */}
                  {progress.stepInfo && (
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                      <span className="text-blue-500">{STEP_ICONS[progress.stepInfo.step]}</span>
                      <span>{progress.stepInfo.label}</span>
                    </div>
                  )}
                </div>
              )}
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
                config.linkedFolders.map(folderObj => (
                  <div key={folderObj.path} className="flex items-center justify-between p-4 rounded-[1.25rem] hover:bg-slate-50 border border-slate-100 hover:border-slate-200 group transition-all">
                    <div className="flex items-center gap-4 overflow-hidden">
                      <div className="w-11 h-11 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <Folder className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[15px] font-medium text-slate-800 truncate">{folderObj.path.split(/[/\\]/).pop()}</p>
                        <p className="text-xs text-slate-400 truncate mt-0.5" title={folderObj.path}>{folderObj.path}</p>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-1 inline-block ${folderObj.mode === 'sync' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {folderObj.mode === 'sync' ? '↑ Sincronizar' : '🔍 Solo indexar'}
                        </span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleUnlinkFolder(folderObj.path)}
                      className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-50 transition-all shrink-0"
                      title="Desvincular"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
