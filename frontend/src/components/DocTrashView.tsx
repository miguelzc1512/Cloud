import React, { useState, useEffect, useRef } from 'react';
import { Trash2, File as FileIcon, Loader2, AlertCircle, RotateCcw, CheckSquare, X } from 'lucide-react';

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [showRestoreMenu, setShowRestoreMenu] = useState(false);
  
  const deleteMenuRef = useRef<HTMLDivElement>(null);
  const restoreMenuRef = useRef<HTMLDivElement>(null);

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
    
    function handleClickOutside(event: MouseEvent) {
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(event.target as Node)) {
        setShowDeleteMenu(false);
      }
      if (restoreMenuRef.current && !restoreMenuRef.current.contains(event.target as Node)) {
        setShowRestoreMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      setHeaderActions(null);
    }
  }, []);

  useEffect(() => {
    if (deletedFiles.length > 0) {
      setHeaderActions(
        <button 
          onClick={() => {
            const allIds = new Set(deletedFiles.map(f => f.id));
            setSelectedIds(allIds);
          }}
          className="text-slate-600 font-medium hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 text-sm"
        >
          <CheckSquare className="w-4 h-4" />
          <span>Seleccionar todo</span>
        </button>
      );
    } else {
      setHeaderActions(null);
    }
  }, [deletedFiles, setHeaderActions]);

  const handleRestore = async (ids: string[]) => {
    try {
      await fetch(`/api/documents/trash/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      setSelectedIds(new Set());
      setShowRestoreMenu(false);
      await fetchDeletedFiles();
      onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEmptyTrash = async (ids: string[]) => {
    try {
      await fetch(`/api/documents/trash/empty`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: ids.length > 0 ? ids : null })
      });
      setSelectedIds(new Set());
      setShowDeleteMenu(false);
      await fetchDeletedFiles();
    } catch (e) {
      console.error(e);
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

  const selectedArray = Array.from(selectedIds);

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      
      {/* Floating Action Bar */}
      <div 
        className={`fixed top-0 right-0 left-[64px] h-20 z-40 bg-white flex items-center justify-between px-8 shadow-sm border-b border-slate-200 transition-transform duration-200 ease-out ${selectedIds.size > 0 ? 'translate-y-0' : '-translate-y-full'}`}
      >
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setSelectedIds(new Set())} 
            className="text-slate-500 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <span className="font-medium text-lg text-slate-800 ml-2">{selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative" ref={restoreMenuRef}>
            <button 
              onClick={() => setShowRestoreMenu(!showRestoreMenu)}
              className="text-slate-500 hover:text-blue-600 p-2.5 rounded-full hover:bg-blue-50 transition-colors"
              title="Restaurar"
            >
              <RotateCcw className="w-6 h-6" />
            </button>

            {showRestoreMenu && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200 p-2">
                <p className="text-xs text-slate-500 px-2 pb-2 mb-1 border-b border-slate-100">¿Restaurar archivos?</p>
                <button 
                  onClick={() => handleRestore(selectedArray)}
                  className="w-full text-left px-2 py-2.5 text-sm text-blue-600 font-medium hover:bg-blue-50 rounded-lg transition-colors"
                >
                  Sí, restaurar {selectedIds.size > 1 ? `${selectedIds.size} elementos` : '1 elemento'}
                </button>
                <button 
                  onClick={() => setShowRestoreMenu(false)}
                  className="w-full text-left px-2 py-2 text-sm text-slate-700 font-medium hover:bg-slate-50 rounded-lg transition-colors mt-1"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>

          <div className="relative" ref={deleteMenuRef}>
            <button 
              onClick={() => setShowDeleteMenu(!showDeleteMenu)}
              className="text-slate-500 hover:text-red-600 p-2.5 rounded-full hover:bg-red-50 transition-colors"
              title="Borrar"
            >
              <Trash2 className="w-6 h-6" />
            </button>

            {showDeleteMenu && (
              <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200 p-2">
                <p className="text-xs text-slate-500 px-2 pb-2 mb-1 border-b border-slate-100">¿Eliminar definitivamente?</p>
                <button 
                  onClick={() => handleEmptyTrash(selectedArray)}
                  className="w-full text-left px-2 py-2.5 text-sm text-red-600 font-medium hover:bg-red-50 rounded-lg transition-colors"
                >
                  Sí, eliminar {selectedIds.size > 1 ? `${selectedIds.size} elementos` : '1 elemento'}
                </button>
                <button 
                  onClick={() => setShowDeleteMenu(false)}
                  className="w-full text-left px-2 py-2 text-sm text-slate-700 font-medium hover:bg-slate-50 rounded-lg transition-colors mt-1"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-slate-100/80 text-slate-700 px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium border-b border-slate-200 shrink-0 mb-2">
        <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0" />
        <span className="text-center truncate">Los archivos en la papelera se eliminarán permanentemente al vaciarla.</span>
      </div>

      <div className="flex-1 overflow-y-auto px-10 pb-10 pt-4">
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
    </div>
  );
}
