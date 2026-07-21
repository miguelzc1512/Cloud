import React, { useState, useEffect } from 'react';
import { Trash2, RefreshCcw, File as FileIcon, Loader2 } from 'lucide-react';

interface DocFile {
  id: string;
  name: string;
  savedName: string;
  extension: string;
  size: number;
  deletedAt: string;
}

interface DocTrashViewProps {
  onRefresh: () => void;
  setHeaderActions: (actions: React.ReactNode) => void;
}

export default function DocTrashView({ onRefresh, setHeaderActions }: DocTrashViewProps) {
  const [deletedFiles, setDeletedFiles] = useState<DocFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchDeletedFiles = async () => {
    try {
      const res = await fetch(`/api/documents/trash`);
      if (res.ok) {
        const data = await res.json();
        setDeletedFiles(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletedFiles();
    return () => setHeaderActions(null);
  }, []);

  useEffect(() => {
    if (selectedIds.size > 0 || deletedFiles.length > 0) {
      setHeaderActions(
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 ? (
            <button
              onClick={() => handleRestore(Array.from(selectedIds))}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
              disabled={isProcessing}
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
              Restaurar Seleccionados ({selectedIds.size})
            </button>
          ) : (
            <button
              onClick={handleEmptyTrash}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm"
              disabled={isProcessing || deletedFiles.length === 0}
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Vaciar Papelera
            </button>
          )}
        </div>
      );
    } else {
      setHeaderActions(null);
    }
  }, [selectedIds, isProcessing, deletedFiles.length]);

  const handleRestore = async (ids: string[]) => {
    setIsProcessing(true);
    try {
      await fetch(`/api/documents/trash/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      setSelectedIds(new Set());
      await fetchDeletedFiles();
      onRefresh(); // Refresh global doc state
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEmptyTrash = async () => {
    if (!window.confirm("¿Estás seguro de que deseas eliminar permanentemente todos los archivos en la papelera? Esta acción no se puede deshacer.")) return;
    setIsProcessing(true);
    try {
      await fetch(`/api/documents/trash/empty`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds.size > 0 ? Array.from(selectedIds) : null })
      });
      setSelectedIds(new Set());
      await fetchDeletedFiles();
    } catch (e) {
      console.error(e);
    } finally {
      setIsProcessing(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>;
  }

  if (deletedFiles.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 h-full bg-slate-50/50">
        <Trash2 className="w-16 h-16 mb-4 opacity-50" />
        <h3 className="text-xl font-bold text-slate-700 mb-2">Papelera vacía</h3>
        <p className="text-center text-sm max-w-md">No hay documentos eliminados. Los archivos que elimines aparecerán aquí.</p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-5rem)] overflow-y-auto p-10 flex flex-col animate-in fade-in duration-300 relative bg-slate-50/50">
      <div className="flex items-center gap-3 mb-6 bg-blue-50 text-blue-700 p-4 rounded-xl border border-blue-100 shrink-0">
        <Trash2 className="w-5 h-5 shrink-0" />
        <p className="text-sm font-medium">
          Los archivos en la papelera se eliminarán permanentemente al vaciarla.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
        {deletedFiles.map(file => (
          <div 
            key={file.id} 
            className={`group relative flex flex-col items-center p-4 rounded-2xl border transition-all cursor-pointer shadow-sm ${
              selectedIds.has(file.id) ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/20' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'
            }`}
            onClick={() => toggleSelect(file.id)}
          >
            <div className="w-full flex items-center justify-center mb-3 text-slate-400 group-hover:text-slate-500">
              <FileIcon className="w-12 h-12 stroke-[1.5]" />
            </div>
            <div className="w-full text-center">
              <p className="text-sm font-medium text-slate-800 truncate" title={file.name}>{file.name}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{formatSize(file.size)}</p>
            </div>
            
            {/* Checkbox circular top-left */}
            <div className={`absolute top-2 left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
              selectedIds.has(file.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-300 opacity-0 group-hover:opacity-100 bg-white/80'
            }`}>
              {selectedIds.has(file.id) && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
