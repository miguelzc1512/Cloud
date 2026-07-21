import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Loader2, AlertCircle, RotateCcw, CheckSquare, X, List, LayoutGrid, ChevronDown, MoreVertical } from 'lucide-react';
import { Blurhash } from 'react-blurhash';
import FileIcon from './FileIcon';

interface DocFile {
  id: string;
  name: string;
  savedName: string;
  extension: string;
  mimeType: string;
  size: number;
  deletedAt: string;
  thumbnailName?: string;
  blurhash?: string;
}

interface DocTrashViewProps {
  onRefresh: () => void;
  setHeaderActions: (actions: React.ReactNode) => void;
}

export default function DocTrashView({ onRefresh, setHeaderActions }: DocTrashViewProps) {
  const [deletedFiles, setDeletedFiles] = useState<DocFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'date'>('date');
  const [sortDesc, setSortDesc] = useState(true);

  const toggleSort = (field: 'name' | 'size' | 'date') => {
    if (sortBy === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(field);
      setSortDesc(field === 'name' ? false : true);
    }
  };
  
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

  const handleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSelection = new Set(selectedIds);
    
    if (e.shiftKey && lastSelectedId) {
      const allItems = sortedFiles.map(d => d.id);
      const startIdx = allItems.indexOf(lastSelectedId);
      const endIdx = allItems.indexOf(id);
      
      if (startIdx !== -1 && endIdx !== -1) {
        if (!e.metaKey && !e.ctrlKey) {
          newSelection.clear();
        }
        const minIdx = Math.min(startIdx, endIdx);
        const maxIdx = Math.max(startIdx, endIdx);
        for (let i = minIdx; i <= maxIdx; i++) {
          newSelection.add(allItems[i]);
        }
      }
    } else if (e.metaKey || e.ctrlKey) {
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      setLastSelectedId(id);
    } else {
      newSelection.clear();
      newSelection.add(id);
      setLastSelectedId(id);
    }
    
    setSelectedIds(newSelection);
  };
  
  const daysLeft = (deletedAt: string) => {
    return Math.max(0, 60 - Math.floor((Date.now() - new Date(deletedAt || 0).getTime()) / (1000 * 60 * 60 * 24)));
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

  const sortedFiles = [...deletedFiles].sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'name') comparison = a.name.localeCompare(b.name);
    else if (sortBy === 'size') comparison = a.size - b.size;
    else if (sortBy === 'date') comparison = new Date(a.deletedAt || 0).getTime() - new Date(b.deletedAt || 0).getTime();
    return sortDesc ? -comparison : comparison;
  });

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
        <span className="text-center truncate">Los elementos se eliminarán definitivamente después de 60 días.</span>
      </div>

      <div className="flex justify-end px-10 pt-4 pb-2">
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            title="Vista de lista"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            title="Vista de cuadrícula"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-10 pb-10">
        {viewMode === 'list' ? (
          <div className="bg-white rounded-xl overflow-hidden border border-slate-200">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
              <div 
                className="col-span-6 md:col-span-5 flex items-center gap-2 cursor-pointer hover:text-slate-800"
                onClick={() => toggleSort('name')}
              >
                Nombre {sortBy === 'name' && <ChevronDown className={`w-3 h-3 transition-transform ${sortDesc ? 'rotate-180' : ''}`} />}
              </div>
              <div 
                className="col-span-3 md:col-span-2 hidden md:flex items-center gap-2 cursor-pointer hover:text-slate-800"
                onClick={() => toggleSort('date')}
              >
                Eliminado {sortBy === 'date' && <ChevronDown className={`w-3 h-3 transition-transform ${sortDesc ? 'rotate-180' : ''}`} />}
              </div>
              <div className="col-span-3 md:col-span-3 flex items-center justify-end">
                Días Restantes
              </div>
              <div 
                className="col-span-3 md:col-span-2 flex items-center justify-end gap-2 cursor-pointer hover:text-slate-800"
                onClick={() => toggleSort('size')}
              >
                Tamaño {sortBy === 'size' && <ChevronDown className={`w-3 h-3 transition-transform ${sortDesc ? 'rotate-180' : ''}`} />}
              </div>
            </div>
            
            <div className="flex flex-col">
              {sortedFiles.map(file => (
                <div 
                  key={file.id}
                  onClick={(e) => handleSelect(e, file.id)}
                  className={`grid grid-cols-12 gap-4 px-4 py-3 items-center transition-colors group cursor-pointer select-none border-b border-slate-200 ${selectedIds.has(file.id) ? 'bg-blue-50/80' : 'hover:bg-slate-50'}`}
                >
                  <div className="col-span-6 md:col-span-5 flex items-center gap-3 overflow-hidden">
                    <FileIcon filename={file.name} className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-medium text-slate-800 truncate" title={file.name}>{file.name}</span>
                  </div>
                  <div className="col-span-3 md:col-span-2 hidden md:flex items-center text-sm text-slate-500">
                    {new Date(file.deletedAt).toLocaleDateString()}
                  </div>
                  <div className="col-span-3 md:col-span-3 flex items-center justify-end">
                    <span className="bg-red-50 text-red-600 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                      {daysLeft(file.deletedAt)} días
                    </span>
                  </div>
                  <div className="col-span-3 md:col-span-2 flex items-center justify-end text-sm text-slate-500">
                    {formatSize(file.size)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {sortedFiles.map(doc => (
              <div
                key={doc.id}
                onClick={(e) => handleSelect(e, doc.id)}
                className={`flex flex-col rounded-2xl border cursor-pointer select-none overflow-hidden transition-all bg-white group relative ${selectedIds.has(doc.id) ? 'bg-blue-50/10 border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 hover:bg-slate-50 hover:shadow-sm'}`}
              >
                {/* 60 days badge */}
                <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white text-[10px] sm:text-xs font-medium px-2 py-1 rounded-md z-20 shadow-sm pointer-events-none">
                  {daysLeft(doc.deletedAt)} días
                </div>

                {/* Header */}
                <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-white group-hover:bg-slate-50 transition-colors z-10">
                  <div className="flex items-center gap-2.5 overflow-hidden pr-8">
                    <FileIcon filename={doc.name} className="w-5 h-5 shrink-0" />
                    <p className="font-medium text-slate-700 text-[13px] truncate" title={doc.name}>{doc.name}</p>
                  </div>
                </div>
                
                {/* Preview Area */}
                <div className="h-40 bg-slate-50 flex items-center justify-center relative overflow-hidden group-hover:bg-slate-100/50 transition-colors">
                  {doc.extension?.match(/^(jpg|jpeg|png|gif|webp|svg)$/i) ? (
                    <div className="w-full h-full p-2 bg-slate-100 pattern-dots-sm text-slate-200 flex items-center justify-center relative">
                      {doc.blurhash && (
                        <div className="absolute inset-0 z-0">
                          <Blurhash hash={doc.blurhash} width="100%" height="100%" resolutionX={32} resolutionY={32} punch={1} />
                        </div>
                      )}
                      <img 
                        src={`/uploads/${doc.savedName}`} 
                        alt={doc.name}
                        className="max-w-full max-h-full object-contain drop-shadow-sm rounded relative z-10"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <>
                      <FileIcon filename={doc.name} className="w-16 h-16 opacity-30 absolute" />
                      {doc.thumbnailName && (
                        <div className="absolute inset-0 z-10">
                          {doc.blurhash && (
                            <div className="absolute inset-0 z-0">
                              <Blurhash hash={doc.blurhash} width="100%" height="100%" resolutionX={32} resolutionY={32} punch={1} />
                            </div>
                          )}
                          <img 
                            src={`/uploads/thumbnails/${doc.thumbnailName}`} 
                            alt={`${doc.name} thumbnail`}
                            className="w-full h-full object-cover relative z-10"
                            loading="lazy"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
