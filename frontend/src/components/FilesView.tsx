import React, { useEffect, useState, useRef } from 'react';
import { 
  Folder, UploadCloud, Loader2, FileText, Search, Maximize2, MoreVertical, Trash2, FolderPlus, 
  ArrowLeft, ChevronRight, ChevronDown, X, Download, FolderOutput, List, LayoutGrid, Plus
} from 'lucide-react';
import { Blurhash } from 'react-blurhash';
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
  refreshTrigger?: number;
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
  thumbnailName: string | null;
  blurhash: string | null;
  createdAt: string;
};

export default function FilesView({
  isLoading,
  isUploading,
  onUpload,
  handleDrop,
  handleDragOver,
  onDelete,
  setSidebarActions,
  refreshTrigger
}: FilesViewProps) {
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date' | 'size'>('name');
  const [sortDesc, setSortDesc] = useState(false);
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
            className="hidden group-hover:flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-slate-100 transition-all text-slate-700"
            title="Nueva Carpeta"
          >
            <FolderPlus className="w-5 h-5 shrink-0 text-slate-500" />
            <span className="font-medium text-[15px]">Nueva Carpeta</span>
          </button>
          

          
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center font-medium h-10 w-10 group-hover:w-full group-hover:justify-start group-hover:px-3.5 rounded-full group-hover:rounded-xl transition-all duration-300 shadow-sm cursor-pointer text-sm overflow-hidden whitespace-nowrap bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 hover:shadow-md group-hover:h-11"
            title="Agregar Documentos"
          >
            <Plus className="w-5 h-5 shrink-0 block group-hover:hidden" />
            <FileText className="w-5 h-5 shrink-0 hidden group-hover:block" />
            <span className="max-w-0 group-hover:max-w-[200px] ml-0 group-hover:ml-2.5 opacity-0 group-hover:opacity-100 transition-all duration-300 overflow-hidden font-medium text-[15px]">Agregar Documentos</span>
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
  }, [refreshTrigger]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFolderSize = (folderId: string): number => {
    let totalSize = 0;
    const docsInFolder = documents.filter(d => d.clusterId === folderId);
    totalSize += docsInFolder.reduce((sum, doc) => sum + doc.size, 0);
    const subfolders = folders.filter(f => f.parentId === folderId);
    for (const sub of subfolders) {
      totalSize += getFolderSize(sub.id);
    }
    return totalSize;
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
  let currentFolders = folders.filter(f => f.parentId === currentFolderId);
  let currentDocuments = documents.filter(d => (d.clusterId || null) === (currentFolderId || null));

  // Sorting logic
  const sortMultiplier = sortDesc ? -1 : 1;
  currentFolders.sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name) * sortMultiplier;
    if (sortBy === 'date') return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * sortMultiplier;
    if (sortBy === 'size') return (getFolderSize(a.id) - getFolderSize(b.id)) * sortMultiplier;
    return 0;
  });

  currentDocuments.sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name) * sortMultiplier;
    if (sortBy === 'date') return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * sortMultiplier;
    if (sortBy === 'size') return (a.size - b.size) * sortMultiplier;
    return 0;
  });

  const toggleSort = (field: 'name' | 'date' | 'size') => {
    if (sortBy === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(field);
      setSortDesc(field === 'date' || field === 'size'); // Default to desc for date/size
    }
  };

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
      <div 
        className={`fixed top-0 right-0 left-[64px] h-20 z-40 bg-white flex items-center justify-between px-8 shadow-sm border-b border-slate-200 transition-transform duration-200 ease-out ${selectedIds.size > 0 ? 'translate-y-0' : '-translate-y-full'}`}
      >
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
            onClick={() => {
              const ids = Array.from(selectedIds).join(',');
              window.location.href = `/api/download/zip?ids=${ids}`;
            }}
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
                      <div 
                        className="col-span-8 md:col-span-6 flex items-center gap-2 cursor-pointer hover:text-slate-800"
                        onClick={() => toggleSort('name')}
                      >
                        Nombre {sortBy === 'name' && <ChevronDown className={`w-3 h-3 transition-transform ${sortDesc ? 'rotate-180' : ''}`} />}
                      </div>
                      <div 
                        className="col-span-3 hidden md:flex items-center gap-2 cursor-pointer hover:text-slate-800"
                        onClick={() => toggleSort('date')}
                      >
                        Fecha {sortBy === 'date' && <ChevronDown className={`w-3 h-3 transition-transform ${sortDesc ? 'rotate-180' : ''}`} />}
                      </div>
                      <div 
                        className="col-span-3 md:col-span-2 flex items-center justify-end gap-2 cursor-pointer hover:text-slate-800"
                        onClick={() => toggleSort('size')}
                      >
                        Tamaño {sortBy === 'size' && <ChevronDown className={`w-3 h-3 transition-transform ${sortDesc ? 'rotate-180' : ''}`} />}
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
                            {formatSize(getFolderSize(folder.id))}
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
                              className={`flex items-center justify-between p-3.5 rounded-2xl border cursor-pointer select-none transition-all group ${selectedIds.has(folder.id) ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' : 'bg-slate-100/60 border-transparent hover:border-slate-200 hover:shadow-sm hover:bg-slate-100'}`}
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <Folder className="w-5 h-5 text-slate-600 fill-slate-600 shrink-0" />
                                <p className="font-medium text-slate-700 text-sm truncate">{folder.name}</p>
                              </div>
                              <button 
                                onClick={(e) => e.stopPropagation()}
                                className="p-1 rounded-full hover:bg-slate-200/50 text-slate-400 hover:text-slate-600 transition-colors ml-2 shrink-0"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
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
                              className={`flex flex-col rounded-2xl border cursor-grab active:cursor-grabbing select-none overflow-hidden transition-all bg-white group ${selectedIds.has(doc.id) ? 'bg-blue-50/10 border-blue-500 ring-1 ring-blue-500' : 'border-slate-200 hover:bg-slate-50 hover:shadow-sm'}`}
                            >
                              {/* Header */}
                              <div className="flex items-center justify-between p-3 border-b border-slate-100 bg-white group-hover:bg-slate-50 transition-colors">
                                <div className="flex items-center gap-2.5 overflow-hidden">
                                  <FileIcon filename={doc.name} className="w-5 h-5 shrink-0" />
                                  <p className="font-medium text-slate-700 text-[13px] truncate" title={doc.name}>{doc.name}</p>
                                </div>
                                <button 
                                  onClick={(e) => e.stopPropagation()}
                                  className="p-1.5 rounded-full hover:bg-slate-200/50 text-slate-400 hover:text-slate-600 transition-colors shrink-0 ml-1"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
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
                                          alt={doc.name}
                                          className="w-full h-full object-cover relative z-10"
                                          loading="lazy"
                                          onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                                            if (e.currentTarget.parentElement) e.currentTarget.parentElement.style.display = 'none';
                                          }}
                                        />
                                      </div>
                                    )}
                                  </>
                                )}
                                
                                {doc.status !== 'READY' && (
                                  <div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center">
                                    <p className="text-[10px] text-blue-600 flex items-center gap-1 uppercase tracking-wider font-semibold bg-white/80 px-2 py-1 rounded-md shadow-sm">
                                      <Loader2 className="w-3 h-3 animate-spin" /> Procesando
                                    </p>
                                  </div>
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
