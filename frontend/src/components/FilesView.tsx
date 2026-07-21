import React, { useEffect, useState, useRef } from 'react';
import { 
  Folder, UploadCloud, Loader2, FileText, Search, Maximize2, MoreVertical, Trash2, FolderPlus, 
  ArrowLeft, ChevronRight, ChevronDown, X, Download, FolderOutput, List, LayoutGrid, Plus
} from 'lucide-react';
import FileIcon from './FileIcon';

type FileData = {
  id: string;
  originalName: string;
  savedName: string;
  mimeType: string;
  size: number;
  createdAt: string;
};

type FilesViewProps = {
  files: FileData[];
  isLoading: boolean;
  isUploading: boolean;
  onUpload: (files: FileList | File[], targetFolderId: string | null) => void;
  handleDrop: (e: React.DragEvent<HTMLDivElement>, targetFolderId: string | null) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDelete: (id: string) => void;
  setSidebarActions?: (actions: React.ReactNode) => void;
};

type FolderData = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
};

type DocumentData = {
  id: string;
  name: string;
  savedName: string;
  extension: string;
  mimeType: string;
  size: number;
  clusterId: string | null;
  status: string;
  createdAt: string;
};

export default function FilesView({
  isLoading,
  isUploading,
  onUpload,
  handleDrop,
  handleDragOver,
  onDelete,
  setSidebarActions
}: FilesViewProps) {
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [draggedDocId, setDraggedDocId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, [currentFolderId]);

  useEffect(() => {
    if (setSidebarActions) {
      setSidebarActions(
        <div className="flex flex-col gap-1 w-full">
          <button 
            onClick={() => setIsCreatingFolder(true)}
            className="hidden group-hover:flex w-full items-center px-3 py-2.5 rounded-xl transition-all duration-200 text-sm text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
            title="Nueva Carpeta"
          >
            <div className="flex items-center gap-2 min-w-0">
              <FolderPlus className="w-4 h-4 shrink-0 text-slate-400" />
              <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300">Nueva Carpeta</span>
            </div>
          </button>
          
          <button 
            onClick={() => folderInputRef.current?.click()}
            className="hidden group-hover:flex w-full items-center px-3 py-2.5 rounded-xl transition-all duration-200 text-sm text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 mb-2"
            title="Subir Carpeta"
          >
            <div className="flex items-center gap-2 min-w-0">
              <UploadCloud className="w-4 h-4 shrink-0 text-slate-400" />
              <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300">Subir Carpeta</span>
            </div>
          </button>
          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center font-medium h-10 w-10 group-hover:w-full rounded-full transition-all duration-300 shadow-sm cursor-pointer text-sm overflow-hidden whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 hover:shadow-md"
            title="Subir Archivos"
          >
            <Plus className="w-5 h-5 shrink-0" />
            <span className="max-w-0 group-hover:max-w-[200px] ml-0 group-hover:ml-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 overflow-hidden">
              Subir Archivos
            </span>
          </button>
        </div>
      );
    }
    return () => {
      if (setSidebarActions) setSidebarActions(null);
    };
  }, [setSidebarActions, setIsCreatingFolder]);

  const handleLocalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUpload(e.target.files, currentFolderId);
    }
    e.target.value = '';
  };

  const fetchItems = async () => {
    setIsFetching(true);
    try {
      const [docsRes, foldersRes] = await Promise.all([
        fetch('/api/documents').then(r => r.json()).catch(() => []),
        fetch('/api/documents/clusters').then(r => r.json()).catch(() => []) // Reusing clusters endpoint
      ]);
      if (Array.isArray(docsRes)) setDocuments(docsRes);
      if (Array.isArray(foldersRes)) setFolders(foldersRes);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      const res = await fetch('/api/documents/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolderName, parentId: currentFolderId })
      });
      if (res.ok) {
        setNewFolderName('');
        setIsCreatingFolder(false);
        fetchItems();
      }
    } catch (error) {
      console.error('Error creating folder', error);
    }
  };

  const handleDeleteFolder = async (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation();
    if (!window.confirm('¿Seguro que deseas eliminar esta carpeta y todo su contenido?')) return;
    try {
      const res = await fetch(`/api/documents/folders/${folderId}`, { method: 'DELETE' });
      if (res.ok) fetchItems();
    } catch (error) {
      console.error('Error deleting folder', error);
    }
  };

  const handleDocumentDelete = async (id: string) => {
    if (!window.confirm('¿Seguro que deseas eliminar este archivo?')) return;
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) fetchItems();
    } catch (error) {
      console.error('Error deleting document', error);
    }
  };

  const handleMoveDocument = async (docId: string, folderId: string | null) => {
    try {
      const res = await fetch(`/api/documents/${docId}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId })
      });
      if (res.ok) fetchItems();
    } catch (error) {
      console.error('Error moving document', error);
    }
  };

  // Drag and drop to move items
  const handleDragStart = (e: React.DragEvent, docId: string) => {
    e.dataTransfer.setData('text/plain', docId);
    setDraggedDocId(docId);
  };

  const handleFolderDrop = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    const docId = e.dataTransfer.getData('text/plain');
    if (docId && documents.some(d => d.id === docId)) {
      handleMoveDocument(docId, folderId);
      setDraggedDocId(null);
    } else {
      // It's a file from OS, but right now handleDrop drops it in root because it doesn't know about currentFolderId.
      // To fix this fully, we would need to pass currentFolderId to handleDrop.
      // For now, we let it drop.
      handleDrop(e);
    }
  };

  // Compute breadcrumbs
  const breadcrumbs: { id: string | null; name: string }[] = [];
  let curr = currentFolderId;
  while (curr) {
    const f = folders.find(f => f.id === curr);
    if (f) {
      breadcrumbs.unshift({ id: f.id, name: f.name });
      curr = f.parentId;
    } else {
      break;
    }
  }
  breadcrumbs.unshift({ id: null, name: 'Mi Nube' });

  // Current view items
  const currentFolders = folders.filter(f => f.parentId === currentFolderId);
  // Ensure we match null to null
  const currentDocuments = documents.filter(d => (d.clusterId || null) === (currentFolderId || null));

  const handleSelect = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const newSelection = new Set(selectedIds);
    
    if (e.shiftKey && lastSelectedId) {
      const allItems = [...currentFolders.map(f => f.id), ...currentDocuments.map(d => d.id)];
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

  return (
    <div 
      className="flex flex-col h-full bg-white relative"
      onDrop={(e) => handleFolderDrop(e, currentFolderId)}
      onDragOver={handleDragOver}
    >
      {/* Upload Overlay */}
      {isUploading && (
        <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-4 border border-blue-100">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <div>
              <p className="text-slate-800 font-semibold">Subiendo archivos...</p>
              <p className="text-sm text-slate-500">Por favor espera</p>
            </div>
          </div>
        </div>
      )}

      {/* Header / Breadcrumbs or Selection Bar */}
      {selectedIds.size > 0 ? (
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => { setSelectedIds(new Set()); setLastSelectedId(null); }}
              className="text-slate-500 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <span className="font-medium text-lg text-slate-800 ml-2">
              {selectedIds.size} seleccionado{selectedIds.size !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {/* TODO: Implement multiple download */}}
              className="text-slate-500 hover:text-slate-700 p-2.5 rounded-full hover:bg-slate-100 transition-colors"
              title="Descargar"
            >
              <Download className="w-5 h-5" />
            </button>
            <button 
              onClick={() => {/* TODO: Implement multiple move */}}
              className="text-slate-500 hover:text-slate-700 p-2.5 rounded-full hover:bg-slate-100 transition-colors"
              title="Mover a carpeta"
            >
              <FolderOutput className="w-5 h-5 -scale-x-100" />
            </button>
            <button 
              onClick={() => {
                // Delete all selected
                selectedIds.forEach(id => onDelete(id));
                setSelectedIds(new Set());
                setLastSelectedId(null);
              }}
              className="text-slate-500 hover:text-red-600 p-2.5 rounded-full hover:bg-red-50 transition-colors"
              title="Borrar seleccionados"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
          <div className="flex items-center text-lg font-medium text-slate-700">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={crumb.id || 'root'}>
                <button 
                  onClick={() => setCurrentFolderId(crumb.id)}
                  className={`hover:text-blue-600 transition-colors ${idx === breadcrumbs.length - 1 ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}
                >
                  {crumb.name}
                </button>
                {idx < breadcrumbs.length - 1 && <ChevronRight className="w-5 h-5 text-slate-400 mx-1" />}
              </React.Fragment>
            ))}
          </div>
          
          <div className="flex items-center gap-3">
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
        </div>
      )}

      {/* Create Folder Modal */}
      {isCreatingFolder && (
        <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-[400px]">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">Nueva Carpeta</h3>
            <form onSubmit={handleCreateFolder}>
              <input
                type="text"
                autoFocus
                placeholder="Nombre de la carpeta"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsCreatingFolder(false)}
                  className="px-4 py-2 text-slate-500 hover:text-slate-700 font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={!newFolderName.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-all shadow-sm"
                >
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div 
        className="flex-1 overflow-y-auto p-4 md:p-8"
        onClick={() => {
          setSelectedIds(new Set());
          setLastSelectedId(null);
        }}
      >
        {(isFetching || isLoading) && folders.length === 0 && documents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin mb-4 text-blue-500" />
            <p>Cargando archivos...</p>
          </div>
        ) : (
          <>
            {currentFolders.length === 0 && currentDocuments.length === 0 ? (
              <div className="h-[400px] flex flex-col items-center justify-center text-center">
                <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                  <Folder className="w-12 h-12 text-slate-300" />
                </div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Esta carpeta está vacía</h3>
                <p className="text-slate-500 max-w-sm mb-8">
                  Arrastra y suelta archivos aquí para subirlos, o crea una nueva carpeta para organizar tus documentos.
                </p>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium shadow-sm hover:shadow-blue-500/20"
                >
                  Subir Archivos
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-xl overflow-hidden min-h-[400px]">
                {viewMode === 'list' ? (
                  <>
                    <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                      <div className="col-span-8 md:col-span-6 flex items-center gap-2 cursor-pointer hover:text-slate-800">
                        Nombre <ChevronDown className="w-3 h-3" />
                      </div>
                      <div className="col-span-3 hidden md:flex items-center gap-2 cursor-pointer hover:text-slate-800">
                        Fecha de modificación
                      </div>
                      <div className="col-span-3 md:col-span-2 text-right cursor-pointer hover:text-slate-800">
                        Tamaño del archivo
                      </div>
                      <div className="col-span-1 text-right"></div>
                    </div>
                    
                    <div className="divide-y divide-slate-100">
                      {currentFolders.map(folder => (
                        <div 
                          key={folder.id}
                          onClick={(e) => handleSelect(e, folder.id)}
                          onDoubleClick={() => setCurrentFolderId(folder.id)}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onDrop={(e) => handleFolderDrop(e, folder.id)}
                          className={`grid grid-cols-12 gap-4 px-4 py-2.5 items-center transition-colors group cursor-pointer select-none ${selectedIds.has(folder.id) ? 'bg-blue-50/80 border-b border-transparent' : 'hover:bg-slate-50 border-b border-transparent'}`}
                        >
                          <div className="col-span-8 md:col-span-6 flex items-center gap-4 overflow-hidden">
                            <Folder className="w-7 h-7 text-slate-400 fill-slate-400 shrink-0" />
                            <p className="text-sm font-medium text-slate-700 truncate select-none">{folder.name}</p>
                          </div>
                          <div className="col-span-3 hidden md:block text-sm text-slate-500 select-none">
                            {new Date(folder.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                          <div className="col-span-3 md:col-span-2 text-right text-sm text-slate-500 select-none">
                            —
                          </div>
                          <div className="col-span-1 text-right flex justify-end">
                            <button 
                              onClick={(e) => handleDeleteFolder(e, folder.id)}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                              title="Eliminar carpeta"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {currentDocuments.map(doc => (
                        <div 
                          key={doc.id}
                          draggable
                          onClick={(e) => handleSelect(e, doc.id)}
                          onDragStart={(e) => handleDragStart(e, doc.id)}
                          className={`grid grid-cols-12 gap-4 px-4 py-2.5 items-center transition-colors group cursor-grab active:cursor-grabbing select-none ${selectedIds.has(doc.id) ? 'bg-blue-50/80 border-b border-transparent' : 'hover:bg-slate-50 border-b border-transparent'}`}
                        >
                          <div className="col-span-8 md:col-span-6 flex items-center gap-4 overflow-hidden">
                            <FileIcon filename={doc.name} className="w-7 h-7 shrink-0" />
                            <div className="truncate">
                              <p className="text-sm font-medium text-slate-700 truncate">{doc.name}</p>
                              {doc.status !== 'READY' && (
                                <p className="text-[10px] text-blue-500 flex items-center gap-1 mt-0.5 uppercase tracking-wider font-semibold">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Procesando
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="col-span-3 hidden md:block text-sm text-slate-500">
                            {new Date(doc.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                          <div className="col-span-3 md:col-span-2 text-right text-sm text-slate-500">
                            {formatSize(doc.size)}
                          </div>
                          <div className="col-span-1 text-right flex justify-end">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDocumentDelete(doc.id); }}
                              className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-full transition-all"
                              title="Eliminar archivo"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="p-6">
                    {currentFolders.length > 0 && (
                      <div className="mb-8">
                        <h4 className="text-sm font-semibold text-slate-500 mb-4 px-1">Carpetas</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                          {currentFolders.map(folder => (
                            <div
                              key={folder.id}
                              onClick={(e) => handleSelect(e, folder.id)}
                              onDoubleClick={() => setCurrentFolderId(folder.id)}
                              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              onDrop={(e) => handleFolderDrop(e, folder.id)}
                              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer select-none transition-all ${selectedIds.has(folder.id) ? 'bg-blue-50/80 border-blue-200' : 'bg-slate-50 border-transparent hover:border-slate-200 hover:shadow-sm'}`}
                            >
                              <Folder className="w-8 h-8 text-slate-400 fill-slate-400 shrink-0" />
                              <p className="font-medium text-slate-700 text-sm truncate">{folder.name}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {currentDocuments.length > 0 && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-500 mb-4 px-1">Archivos</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                          {currentDocuments.map(doc => (
                            <div
                              key={doc.id}
                              draggable
                              onClick={(e) => handleSelect(e, doc.id)}
                              onDragStart={(e) => handleDragStart(e, doc.id)}
                              className={`flex flex-col items-center justify-center gap-4 p-5 rounded-xl border cursor-grab active:cursor-grabbing select-none transition-all ${selectedIds.has(doc.id) ? 'bg-blue-50/80 border-blue-200' : 'bg-slate-50 border-transparent hover:border-slate-200 hover:shadow-sm'}`}
                            >
                              <FileIcon filename={doc.name} className="w-16 h-16 shrink-0" />
                              <div className="text-center w-full">
                                <p className="font-medium text-slate-700 text-sm truncate w-full" title={doc.name}>{doc.name}</p>
                                {doc.status !== 'READY' && (
                                  <p className="text-[10px] text-blue-500 flex items-center justify-center gap-1 mt-1 uppercase tracking-wider font-semibold">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Procesando
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleLocalFileChange}
        className="hidden"
        multiple
      />
      <input
        type="file"
        ref={folderInputRef}
        onChange={handleLocalFileChange}
        className="hidden"
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        multiple
      />
    </div>
  );
}
