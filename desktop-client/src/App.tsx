import { useState, useEffect } from 'react';
import { Cloud, FolderPlus, CheckCircle2, XCircle, ExternalLink, Folder, Pause, Play, Image, Brain, Users, Sparkles, Info, AlertCircle, Terminal } from 'lucide-react';

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

type LogEntry = {
  id: string;
  time: Date;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [folderToUnlink, setFolderToUnlink] = useState<string | null>(null);

  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => {
      const newLogs = [...prev, { id: Math.random().toString(36).substring(7), time: new Date(), type, message }];
      return newLogs.slice(-25);
    });
  };

  useEffect(() => {
    const loadConfig = async () => {
      const cfg = await (window as any).electronAPI.getConfig();
      setConfig(cfg);
      const state = await (window as any).electronAPI.getSyncState();
      setIsPaused(state.paused);
      setPendingFiles(state.pendingFiles || []);
    };
    loadConfig();

    // Escuchar eventos SSE reenviados desde el main process vía IPC
    const unsubscribeSSE = (window as any).electronAPI.onSSEEvent((_: any, payload: { event: string; data: any }) => {
      const { event, data } = payload;
      if (event === 'scan_start') {
        setProgress({ total: data.total, thumbCompleted: 0, embedCompleted: 0, facesCompleted: 0, currentFile: '', stepInfo: null });
        addLog('info', `Iniciando escaneo: ${data.total} archivos detectados`);
      } else if (event === 'scan_progress') {
        if (data.queued % 10 === 0) addLog('info', `Encolando lote: ${data.queued} / ${data.total}`);
      } else if (event === 'upload_started') {
        setProgress(prev => prev
          ? { ...prev, total: Math.max(prev.total, data.total || prev.total + 1), currentFile: data.originalName }
          : { total: data.total || 1, thumbCompleted: 0, embedCompleted: 0, facesCompleted: 0, currentFile: data.originalName, stepInfo: null }
        );
        addLog('info', `Copiando: ${data.originalName || 'archivo'}`);
      } else if (event === 'worker_step') {
        setProgress(prev => {
          let base = prev;
          if (!base) {
            base = { total: 1, thumbCompleted: 0, embedCompleted: 0, facesCompleted: 0, currentFile: data.originalName, stepInfo: null };
          }
          let nextState = { ...base, stepInfo: { step: data.step, label: data.label, fileId: data.fileId }, currentFile: data.originalName || base.currentFile };

          if (data.step === 'thumbnail_done') {
            nextState.thumbCompleted = Math.min(base.thumbCompleted + 1, base.total);
          } else if (data.step === 'embedding_done') {
            nextState.embedCompleted = Math.min(base.embedCompleted + 1, base.total);
          } else if (data.step === 'done') {
            nextState.facesCompleted = Math.min(base.facesCompleted + 1, base.total);
          }
          return nextState;
        });

        if (data.step === 'done') {
          addLog('success', `Concluido con éxito: ${data.originalName || 'Archivo procesado'}`);
          setTimeout(() => {
            setProgress(prev => {
              if (!prev) return null;
              if (prev.facesCompleted >= prev.total) {
                const now = new Date();
                setLastSyncTime(`Última actualización: ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`);
                return null;
              }
              if (data.originalName && prev.currentFile !== data.originalName) {
                return prev;
              }
              return { ...prev, stepInfo: null };
            });
          }, 1500);
        } else if (data.step === 'thumbnail_done' || data.step === 'embedding_done') {
          // Silent internal updates for counts
        } else {
          addLog('info', `[${data.step.toUpperCase()}] ${data.originalName || ''} - ${data.label}`);
        }
      } else if (event === 'scan_done') {
        addLog('success', `Carpetas analizadas. ${data.total || 0} archivos en cola para IA...`);
      }
    });

    let timeoutId: any;
    const unsubscribe = (window as any).electronAPI.onSyncStatus((_: any, data: any) => {
      if (data.status === 'paused' || data.status === 'idle') {
        setIsPaused(data.status === 'paused');
        setPendingFiles(data.pendingFiles || []);
        if (data.status === 'paused') {
          setSyncStatus(null);
          addLog('warning', 'Sincronización pausada.');
        }
      } else {
        setSyncStatus(data);
        if (data.status === 'error') {
          addLog('error', `Error sincronizando: ${data.file || 'archivo'}`);
        }
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
      if (unsubscribeSSE) unsubscribeSSE();
    };
  }, []);

  const handleLinkFolder = async (mode: 'index' | 'sync') => {
    const path = await (window as any).electronAPI.pickFolder();
    if (path) {
      const newCfg = await (window as any).electronAPI.linkFolder(path, mode);
      setConfig(newCfg);
    }
  };

  const confirmUnlink = (path: string) => {
    setFolderToUnlink(path);
  };

  const handleUnlinkFolder = async (deleteFromCloud: boolean) => {
    if (!folderToUnlink) return;
    const newCfg = await (window as any).electronAPI.unlinkFolder({ folderPath: folderToUnlink, deleteFromCloud });
    setConfig(newCfg);
    setFolderToUnlink(null);
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

  if (!config) return <div className="h-screen w-screen flex items-center justify-center text-slate-500 bg-[#f8fafc]">Cargando...</div>;

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[#f8fafc] font-sans selection:bg-blue-100">

      {/* ── Barra de título arrastrable (funciona en Mac y Windows) ─────── */}
      <div className="draggable flex items-center justify-between h-10 px-4 shrink-0 bg-[#f8fafc] border-b border-slate-100/80">
        <div className="flex items-center gap-2 non-draggable" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {/* En Mac los semáforos van aquí automáticamente via titleBarStyle:hidden */}
        </div>
        <span className="text-xs text-slate-400 font-medium tracking-wide select-none">Cloud Sync</span>
        {/* Botones de control para Windows */}
        <div className="flex items-center gap-1 non-draggable" style={{ WebkitAppRegion: 'no-drag' } as any}>
          <button
            onClick={() => (window as any).electronAPI.minimizeWindow()}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors text-lg leading-none"
            title="Minimizar"
          >─</button>
          <button
            onClick={() => (window as any).electronAPI.closeWindow()}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors text-base leading-none"
            title="Cerrar"
          >✕</button>
        </div>
      </div>

      {/* ── Contenido principal ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col px-6 pt-6 pb-4 relative z-10 shrink-0 border-r border-slate-100/80">
        
        {/* Logo under traffic lights aligned left */}
        <div className="flex items-center gap-3 mb-8 px-1 non-draggable">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-sm shrink-0">
            <Cloud className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-medium text-slate-800 tracking-tight">Cloud Sync</span>
        </div>

        <div className="flex flex-col gap-2 mb-6 non-draggable">
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

        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-2 mb-2">Carpetas Activas</p>
        <div className="flex-1 overflow-y-auto min-h-0 space-y-2 non-draggable pr-1">
          {config.linkedFolders.length === 0 ? (
            <div className="py-4 px-3 rounded-xl border border-dashed border-slate-200 text-center">
              <p className="text-xs text-slate-400">Sin carpetas</p>
            </div>
          ) : (
            config.linkedFolders.map(folderObj => (
              <div key={folderObj.path} className="flex flex-col p-3 rounded-xl hover:bg-slate-50 border border-slate-100 group transition-all relative">
                <div className="flex items-center gap-2 overflow-hidden mb-1">
                  <Folder className="w-4 h-4 text-blue-500 shrink-0" />
                  <p className="text-sm font-medium text-slate-700 truncate" title={folderObj.path}>{folderObj.path.split(/[/\\]/).pop()}</p>
                </div>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded w-max ${folderObj.mode === 'sync' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                  {folderObj.mode === 'sync' ? 'Sincronizar' : 'Indexar'}
                </span>
                <button 
                  onClick={() => confirmUnlink(folderObj.path)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50 transition-all shrink-0 bg-white"
                  title="Desvincular"
                >
                  <XCircle className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-col gap-2 mt-4 non-draggable">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider pl-2 mb-1">Rendimiento (Fotos)</p>
          <div className="flex bg-slate-100/80 rounded-xl p-1 mx-1 mb-2">
            <button 
              onClick={() => handlePowerMode('eco')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${config?.powerMode === 'eco' || !config?.powerMode ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
              title="Ahorra batería"
            >
              Normal
            </button>
            <button 
              onClick={() => handlePowerMode('max')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${config?.powerMode === 'max' ? 'bg-blue-600 shadow-sm text-white' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`}
              title="Máxima velocidad"
            >
              Máximo
            </button>
          </div>
          <button 
            onClick={openWeb}
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            Abrir versión web
          </button>
        </div>
      </aside>

      {/* Dashboard Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 non-draggable relative z-10 flex flex-col h-full gap-4 bg-slate-50/50">
        
        {/* Top Status Card (Progress & Stepper) */}
        <div className="bg-white rounded-[1.75rem] p-6 shadow-sm border border-slate-100 flex-shrink-0">
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

          {progress && progress.total > 0 && (
            <div className="mt-4 flex flex-col gap-3">
              {/* Progreso General */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">
                    Progreso General
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    {Math.round(((progress.thumbCompleted + progress.embedCompleted + progress.facesCompleted) * 100) / (progress.total * 3))}%
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${Math.round(((progress.thumbCompleted + progress.embedCompleted + progress.facesCompleted) * 100) / (progress.total * 3))}%` }}
                  />
                </div>
              </div>
              
              {/* Fases individuales */}
              <div className="grid grid-cols-3 gap-4 mt-2 bg-slate-50 border border-slate-100 p-3 rounded-xl">
                {/* Fase 1: Miniaturas */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Image className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-[10px] font-medium text-slate-600 truncate">1. Miniaturas</span>
                    <span className="text-[10px] text-slate-400 ml-auto">{progress.thumbCompleted}/{progress.total}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.round((progress.thumbCompleted * 100) / progress.total)}%` }} />
                  </div>
                </div>
                {/* Fase 2: Embeddings */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Brain className="w-3.5 h-3.5 text-purple-500" />
                    <span className="text-[10px] font-medium text-slate-600 truncate">2. Análisis IA</span>
                    <span className="text-[10px] text-slate-400 ml-auto">{progress.embedCompleted}/{progress.total}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-purple-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.round((progress.embedCompleted * 100) / progress.total)}%` }} />
                  </div>
                </div>
                {/* Fase 3: Rostros */}
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Users className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-[10px] font-medium text-slate-600 truncate">3. Rostros</span>
                    <span className="text-[10px] text-slate-400 ml-auto">{progress.facesCompleted}/{progress.total}</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${Math.round((progress.facesCompleted * 100) / progress.total)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Log Hub Terminal (Bottom Area) */}
        <div className="flex-1 bg-white rounded-[1.75rem] shadow-sm border border-slate-100 flex flex-col overflow-hidden min-h-[250px]">
          <div className="px-5 py-3 border-b border-slate-100 bg-white flex items-center gap-2 shrink-0">
            <Terminal className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">Hub de Registros</span>
            <div className="ml-auto flex items-center gap-1.5 bg-green-50 px-2 py-0.5 rounded-full border border-green-100">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-[10px] text-green-600 font-bold tracking-wide">EN VIVO</span>
            </div>
          </div>
          {/* El listado de logs invertido usa flex-col-reverse, el overflow-y-auto maneja el scroll */}
          <div className="flex-1 overflow-y-auto p-4 space-y-1.5 flex flex-col-reverse font-mono text-[13px] bg-slate-50/30">
            {logs.length === 0 ? (
              <div className="text-slate-400 text-center py-8 font-sans">
                Esperando actividad...
              </div>
            ) : (
              [...logs].reverse().map((log) => (
                <div key={log.id} className="flex gap-3 leading-relaxed hover:bg-slate-100/50 p-2 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                  <span className="text-slate-400 shrink-0 font-medium tracking-tight">
                    [{log.time.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]
                  </span>
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    {log.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />}
                    {log.type === 'error' && <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                    {log.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />}
                    {log.type === 'info' && <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />}
                    <span className={`break-words ${
                      log.type === 'error' ? 'text-red-600 font-semibold' :
                      log.type === 'success' ? 'text-emerald-700 font-medium' :
                      log.type === 'warning' ? 'text-amber-700 font-medium' :
                      'text-slate-600'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
      </main>
      </div>
      {/* ── Modal de confirmación para desvincular carpeta ── */}
      {folderToUnlink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">Desvincular carpeta</h3>
            <p className="text-sm text-slate-500 mb-4 line-clamp-2" title={folderToUnlink}>
              {folderToUnlink}
            </p>
            <p className="text-sm text-slate-600 mb-6">
              ¿Qué deseas hacer con los archivos que ya se subieron o indexaron en la nube?
            </p>
            
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => handleUnlinkFolder(false)}
                className="flex items-center gap-3 w-full text-left p-3 rounded-xl hover:bg-slate-50 border border-slate-200 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                  <Cloud className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">Solo dejar de sincronizar</p>
                  <p className="text-xs text-slate-500">Mantiene las fotos a salvo en la Nube (Recomendado)</p>
                </div>
              </button>

              <button 
                onClick={() => handleUnlinkFolder(true)}
                className="flex items-center gap-3 w-full text-left p-3 rounded-xl hover:bg-red-50 border border-red-100 transition-colors group"
              >
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0 group-hover:bg-red-200 transition-colors">
                  <XCircle className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-red-700">Eliminar todo rastro de la nube</p>
                  <p className="text-xs text-red-500/80">Mueve todas las fotos de esta carpeta a la papelera virtual</p>
                </div>
              </button>
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setFolderToUnlink(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
