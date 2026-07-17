import React, { useState, useRef, useEffect } from 'react';
import { AlertCircle, RotateCcw, Trash2, CheckSquare } from 'lucide-react';
import PhotosView, { type PhotosViewRef } from '../../PhotosView';

export interface TrashFile {
  id: string;
  originalName: string;
  savedName: string;
  thumbnailName?: string;
  blurhash?: string;
  mimeType: string;
  size: number;
  createdAt: string;
  takenAt?: string;
  isDeleted: boolean;
  deletedAt: string;
}

interface TrashViewProps {
  onRefresh?: () => void;
  setHeaderActions?: (node: React.ReactNode) => void;
}

export default function TrashView({ onRefresh, setHeaderActions }: TrashViewProps) {
  const [files, setFiles] = useState<TrashFile[]>([]);
  const [showDeleteMenu, setShowDeleteMenu] = useState(false);
  const [showRestoreMenu, setShowRestoreMenu] = useState(false);
  
  const deleteMenuRef = useRef<HTMLDivElement>(null);
  const restoreMenuRef = useRef<HTMLDivElement>(null);
  const photosRef = useRef<PhotosViewRef>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(event.target as Node)) {
        setShowDeleteMenu(false);
      }
      if (restoreMenuRef.current && !restoreMenuRef.current.contains(event.target as Node)) {
        setShowRestoreMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    
    fetchTrashFiles();
    
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchTrashFiles = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/trash');
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (err) {
      console.error('Error fetching trash files:', err);
    }
  };

  // Update header actions
  useEffect(() => {
    if (setHeaderActions) {
      if (files.length > 0) {
        setHeaderActions(
          <button 
            onClick={() => photosRef.current?.selectAll()}
            className="text-slate-600 font-medium hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 text-sm"
          >
            <CheckSquare className="w-4 h-4" />
            <span>Seleccionar todo</span>
          </button>
        );
      } else {
        setHeaderActions(null);
      }
    }
    return () => {
      if (setHeaderActions) setHeaderActions(null);
    };
  }, [setHeaderActions, files.length]);

  const handleBulkRestore = async (ids: string[], clearSelection: () => void) => {
    try {
      await Promise.all(
        ids.map(id => 
          fetch(`http://localhost:3001/api/trash/${id}/restore`, { method: 'PUT' })
        )
      );
      clearSelection();
      setShowRestoreMenu(false);
      fetchTrashFiles();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error restoring files', err);
    }
  };

  const handleBulkDeletePermanently = async (ids: string[], clearSelection: () => void) => {
    try {
      await Promise.all(
        ids.map(id => 
          fetch(`http://localhost:3001/api/trash/${id}`, { method: 'DELETE' })
        )
      );
      clearSelection();
      setShowDeleteMenu(false);
      fetchTrashFiles();
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error deleting files permanently', err);
    }
  };

  const fileDataArray = files.map(f => ({
    ...f,
    status: 'READY'
  }));

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <div className="bg-slate-100/80 text-slate-700 px-4 py-3 flex items-center justify-center gap-2 text-sm font-medium border-b border-slate-200 shrink-0 -mx-10 -mt-10 mb-2">
        <AlertCircle className="w-5 h-5 text-slate-500 flex-shrink-0" />
        <span className="text-center truncate">Los elementos se eliminarán definitivamente después de 60 días.</span>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <PhotosView 
          ref={photosRef}
          files={fileDataArray} 
          renderSelectionActions={(selectedIds, clearSelection) => (
            <>
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
                      onClick={() => handleBulkRestore(selectedIds, clearSelection)}
                      className="w-full text-left px-2 py-2.5 text-sm text-blue-600 font-medium hover:bg-blue-50 rounded-lg transition-colors"
                    >
                      Sí, restaurar {selectedIds.length > 1 ? `${selectedIds.length} elementos` : '1 elemento'}
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
                      onClick={() => handleBulkDeletePermanently(selectedIds, clearSelection)}
                      className="w-full text-left px-2 py-2.5 text-sm text-red-600 font-medium hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Sí, eliminar {selectedIds.length > 1 ? `${selectedIds.length} elementos` : '1 elemento'}
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
            </>
          )}
        />
      </div>
    </div>
  );
}
