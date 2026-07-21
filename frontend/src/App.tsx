import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Folder, Image as ImageIcon, Search, Cloud, Loader2, FileText, Plus, Book, Users, Map, Trash2, ChevronDown, Star, ArrowRight, ArrowLeft, Copy, LayoutGrid, MonitorDown, Download, Apple, Monitor, XCircle } from 'lucide-react';
import FilesView from './components/FilesView';
import PhotosView from './components/PhotosView';
import AlbumsView from './components/photos/albums/AlbumsView';
import { PeopleView } from './components/photos/people/PeopleView';
import MapView from './components/photos/map/MapView';
import TrashView from './components/photos/trash/TrashView';
import DuplicatesView from './components/photos/duplicates/DuplicatesView';

const SEARCH_SUGGESTIONS = [
  'playa', 'montaña', 'ciudad', 'perro', 'gato', 'comida', 'nieve', 
  'atardecer', 'fiesta', 'viaje', 'familia', 'amigos', 'coche', 
  'deporte', 'naturaleza', 'bosque', 'lago', 'conciertos', 'boda', 
  'esquí', 'oso', 'flor', 'invierno', 'verano'
];

type FileData = {
  id: string;
  originalName: string;
  savedName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  takenAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
};

export default function App() {
  const [activeTab, setActiveTab] = useState('fotos');
  const [previousTab, setPreviousTab] = useState('fotos');
  const [isFotosSubmenuOpen, setIsFotosSubmenuOpen] = useState(true);
  const [customHeader, setCustomHeader] = useState<React.ReactNode | null>(null);
  const [sidebarActions, setSidebarActions] = useState<React.ReactNode>(null);
  
  const [files, setFiles] = useState<FileData[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ total: number; current: number; percentage: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [importingCount, setImportingCount] = useState(0);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [targetPersonId, setTargetPersonId] = useState<string | null>(null);
  const searchDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentSuggestions, setCurrentSuggestions] = useState<string[]>([]);

  // ─── Server-Sent Events (SSE) ─────────────────────────────────────────────
  useEffect(() => {
    const eventSource = new EventSource('/api/stream');

    eventSource.addEventListener('upload_started', () => {
      setImportingCount(prev => prev + 1);
    });

    eventSource.addEventListener('photo_ready', () => {
      // Recargar archivos cuando terminen de procesar
      fetchFiles();
      setImportingCount(prev => Math.max(0, prev - 1));
    });

    return () => {
      eventSource.close();
    };
  }, []); // Using empty array so it doesn't reconnect constantly

  useEffect(() => {
    if (showSearchDropdown) {
      const shuffled = [...SEARCH_SUGGESTIONS].sort(() => 0.5 - Math.random());
      setCurrentSuggestions(shuffled.slice(0, 4));
    }
  }, [showSearchDropdown]);

  useEffect(() => {
    if (!showSearchDropdown) return;
    const handleClick = (e: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSearchDropdown]);

  // Reset custom header and actions when tab changes
  useEffect(() => {
    setCustomHeader(null);
    setSidebarActions(null);
  }, [activeTab]);

  const fetchFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/files');
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    await uploadMultipleFiles(selectedFiles);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadMultipleFiles = async (filesToUpload: FileList | File[], targetFolderId: string | null = null) => {
    setIsUploading(true);
    const filesArray = Array.from(filesToUpload);
    const total = filesArray.length;

    setUploadProgress({ total, current: 0, percentage: 0 });

    for (let i = 0; i < total; i++) {
      const file = filesArray[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('lastModified', file.lastModified.toString());
      formData.append('sourceTab', activeTab);
      if (targetFolderId) {
        formData.append('targetFolderId', targetFolderId);
      }
      if (file.webkitRelativePath) {
        formData.append('relativePath', file.webkitRelativePath);
      }

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          console.error('Upload failed for', file.name);
        } else {
          // Refresh list immediately so photos appear one by one
          await fetchFiles();
        }
      } catch (error) {
        console.error('Error during upload:', error);
      }

      const current = i + 1;
      setUploadProgress({
        total,
        current,
        percentage: Math.round((current / total) * 100)
      });
    }

    setTimeout(() => {
      setUploadProgress(null);
      setIsUploading(false);
    }, 800);
  };

  const handleDelete = useCallback(async (id: string, skipConfirm = false) => {
    try {
      const res = await fetch(`/api/files/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (!skipConfirm) await fetchFiles();
      } else {
        console.error('Delete failed');
      }
    } catch (error) {
      console.error('Error during deletion:', error);
    }
  }, [fetchFiles]);

  const handleBulkDelete = useCallback(async (ids: string[]) => {
    setIsLoading(true);
    // Execute all deletes in parallel
    await Promise.all(ids.map(id => handleDelete(id, true)));
    await fetchFiles();
  }, [fetchFiles, handleDelete]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetFolderId: string | null = null) => {
    e.preventDefault();
    e.stopPropagation();
    setIsGlobalDragging(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      if (['fotos', 'albums', 'people', 'map', 'duplicates'].includes(activeTab)) {
        // En secciones de fotos, solo permitir imágenes y videos
        const mediaFiles = Array.from(droppedFiles).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
        if (mediaFiles.length > 0) {
          uploadMultipleFiles(mediaFiles);
        }
      } else {
        // En archivos u otras secciones, permitir todo
        uploadMultipleFiles(droppedFiles, targetFolderId);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsGlobalDragging(true);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50/50 text-slate-800 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Sidebar - Premium Collapsible */}
      <aside className="group fixed top-0 left-0 h-full w-[64px] hover:w-[240px] bg-white/80 backdrop-blur-md border-r border-slate-200/60 shadow-sm z-50 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] hover:shadow-xl">
        <div className="w-[240px] flex flex-col h-full px-3 py-8">
          <div className="w-full mb-10 flex items-center px-1.5">
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold shrink-0">
              M
            </div>
            <h2 className="text-xl md:text-2xl tracking-tight text-slate-800 leading-none ml-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap">
              <span className="font-bold">Hola</span> Miguel!
            </h2>
          </div>

          <nav className="flex-1 space-y-1">
            <button
              onClick={() => {
                setActiveTab('archivos');
                setIsFotosSubmenuOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm ${activeTab === 'archivos'
                ? 'bg-blue-50 text-blue-600 font-medium'
                : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
            >
              <Folder className={`w-4 h-4 shrink-0 ${activeTab === 'archivos' ? 'text-blue-600' : 'text-slate-400'}`} />
              <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300">Archivos</span>
            </button>



            <div>
              <button
                onClick={() => {
                  setActiveTab('fotos');
                  setIsFotosSubmenuOpen(true);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all duration-200 text-sm ${['fotos', 'albums', 'people', 'map', 'trash', 'buscar', 'duplicates'].includes(activeTab)
                  ? 'bg-blue-50 text-blue-600 font-medium'
                  : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                  }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ImageIcon className={`w-4 h-4 shrink-0 ${['fotos', 'albums', 'people', 'map', 'trash', 'buscar', 'duplicates'].includes(activeTab) ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300">Fotos</span>
                </div>
              </button>

              {/* Submenu Ajustado para la animación */}
              <div className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out ${isFotosSubmenuOpen ? 'max-h-[280px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="flex flex-col pl-0 group-hover:pl-7 pr-1 py-1 mt-1 space-y-0.5 relative before:content-[''] before:absolute before:left-4 before:top-2 before:bottom-2 before:w-px before:bg-slate-200 before:opacity-0 group-hover:before:opacity-100 transition-all duration-300">
                  <button
                    onClick={() => setActiveTab('fotos')}
                    className={`flex items-center text-left gap-2 w-full py-2 px-3 group-hover:px-2 text-[13px] font-medium transition-all duration-300 rounded-lg hover:bg-slate-50 ${activeTab === 'fotos' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <LayoutGrid className={`w-4 h-4 shrink-0 stroke-[1.5] ${activeTab === 'fotos' ? 'text-blue-600' : ''}`} />
                    <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300">Galería</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('albums')}
                    className={`flex items-center text-left gap-2 w-full py-2 px-3 group-hover:px-2 text-[13px] font-medium transition-all duration-300 rounded-lg hover:bg-slate-50 ${activeTab === 'albums' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <Book className={`w-4 h-4 shrink-0 stroke-[1.5] ${activeTab === 'albums' ? 'text-blue-600' : ''}`} />
                    <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300">Álbumes</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('people')}
                    className={`flex items-center text-left gap-2 w-full py-2 px-3 group-hover:px-2 text-[13px] font-medium transition-all duration-300 rounded-lg hover:bg-slate-50 ${activeTab === 'people' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <Users className={`w-4 h-4 shrink-0 stroke-[1.5] ${activeTab === 'people' ? 'text-blue-600' : ''}`} />
                    <span className="leading-tight truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300">Personas</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('map')}
                    className={`flex items-center text-left gap-2 w-full py-2 px-3 group-hover:px-2 text-[13px] font-medium transition-all duration-300 rounded-lg hover:bg-slate-50 ${activeTab === 'map' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <Map className={`w-4 h-4 shrink-0 stroke-[1.5] ${activeTab === 'map' ? 'text-blue-600' : ''}`} />
                    <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300">Mapa</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('duplicates')}
                    className={`flex items-center text-left gap-2 w-full py-2 px-3 group-hover:px-2 text-[13px] font-medium transition-all duration-300 rounded-lg hover:bg-slate-50 ${activeTab === 'duplicates' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <Copy className={`w-4 h-4 shrink-0 stroke-[1.5] ${activeTab === 'duplicates' ? 'text-blue-600' : ''}`} />
                    <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300">Duplicados</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('trash')}
                    className={`flex items-center text-left gap-2 w-full py-2 px-3 group-hover:px-2 text-[13px] font-medium transition-all duration-300 rounded-lg hover:bg-slate-50 ${activeTab === 'trash' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    <Trash2 className={`w-4 h-4 shrink-0 stroke-[1.5] ${activeTab === 'trash' ? 'text-blue-600' : ''}`} />
                    <span className="truncate opacity-0 group-hover:opacity-100 transition-opacity duration-300">Papelera</span>
                  </button>
                </div>
              </div>
            </div>
          </nav>

          <div className="mt-8 flex flex-col gap-2 mb-4">
            {sidebarActions && activeTab === 'archivos' ? (
              sidebarActions
            ) : (
              <label
                className={`flex items-center justify-center font-medium h-10 w-10 group-hover:w-full rounded-full transition-all duration-300 shadow-sm cursor-pointer text-sm overflow-hidden whitespace-nowrap ${['buscar', 'trash'].includes(activeTab) || isUploading
                  ? 'bg-slate-100 text-slate-400 pointer-events-none opacity-50'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 hover:shadow-md'
                  }`}
              >
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                  accept={['fotos', 'albums', 'people', 'map'].includes(activeTab) ? 'image/*,video/*' : undefined}
                />
                {isUploading ? (
                  <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
                ) : (
                  <>
                    <Plus className="w-5 h-5 shrink-0" />
                    <span className="max-w-0 group-hover:max-w-[200px] ml-0 group-hover:ml-1.5 opacity-0 group-hover:opacity-100 transition-all duration-300 overflow-hidden">
                      Añadir Fotos
                    </span>
                  </>
                )}
              </label>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main 
        className="flex-1 flex flex-col h-screen overflow-hidden bg-slate-50/50 ml-[64px] relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isGlobalDragging && (
          <div 
            className="absolute inset-0 z-[200] bg-slate-900/10 backdrop-blur-md flex items-center justify-center transition-all duration-300"
            onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsGlobalDragging(false); }}
            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsGlobalDragging(false); handleDrop(e); }}
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <div className="bg-white/90 backdrop-blur-xl px-12 py-10 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-white/60 flex flex-col items-center pointer-events-none scale-100 animate-in zoom-in duration-200">
              <Cloud className="w-16 h-16 text-blue-500 mb-5" />
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Suelta para agregar</h2>
              <p className="text-slate-500 mt-2 text-base font-medium">
                {['fotos', 'albums', 'people', 'map', 'duplicates'].includes(activeTab) 
                  ? 'Tus fotos y videos se subirán instantáneamente' 
                  : 'Tus archivos se subirán instantáneamente'}
              </p>
            </div>
          </div>
        )}

        <header className="h-20 flex items-center justify-between px-10 border-b border-slate-200/50 bg-white/40 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-3 text-2xl font-semibold tracking-tight capitalize w-1/3">
            {activeTab === 'buscar' && (
              <button 
                onClick={() => {
                  setActiveTab(previousTab);
                  setSearchQuery('');
                }}
                className="p-1.5 -ml-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 rounded-full transition-colors"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
            )}
            {customHeader || (
              activeTab === 'trash' ? 'Papelera' :
              activeTab === 'albums' ? 'Álbumes' :
              activeTab === 'people' ? 'Personas' :
              activeTab === 'map' ? 'Mapa' :
              activeTab === 'duplicates' ? 'Duplicados' :
              activeTab
            )}
          </div>
          
          {activeTab !== 'archivos' ? (
            <div className="flex-1 max-w-2xl mx-4 relative group z-50" ref={searchDropdownRef}>
              <div className={`relative flex items-center overflow-hidden px-4 py-2.5 transition-all duration-200 ${showSearchDropdown ? 'bg-white rounded-t-2xl border border-b-0 border-slate-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05),0_4px_6px_-1px_rgba(0,0,0,0.05)]' : 'bg-slate-100 hover:bg-slate-200/50 rounded-full border border-transparent'}`}>
                <Search className={`w-5 h-5 shrink-0 transition-colors ${showSearchDropdown ? 'text-blue-500' : 'text-slate-400'}`} />
                <input
                  type="text"
                  placeholder="Busca en tus fotos y álbumes"
                  className="w-full bg-transparent border-none outline-none px-3 text-[15px] text-slate-800 placeholder-slate-500 font-medium"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setShowSearchDropdown(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setShowSearchDropdown(false);
                      if (activeTab !== 'buscar') {
                        setPreviousTab(activeTab);
                        setActiveTab('buscar');
                      }
                      handleSearch(searchQuery);
                    }
                  }}
                />
                {isSearching && <Loader2 className="w-4 h-4 text-blue-500 animate-spin mr-1" />}
              </div>
              
              {showSearchDropdown && (
                <div className="absolute left-0 right-0 top-full bg-white rounded-b-2xl border border-t-0 border-slate-200 shadow-xl overflow-hidden flex flex-col py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  {currentSuggestions.map((cat) => (
                    <button 
                      key={cat}
                      onClick={() => {
                        setSearchQuery(cat);
                        setShowSearchDropdown(false);
                        if (activeTab !== 'buscar') {
                          setPreviousTab(activeTab);
                          setActiveTab('buscar');
                        }
                        handleSearch(cat);
                      }}
                      className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors text-left w-full group/item"
                    >
                      <Search className="w-5 h-5 text-slate-400 group-hover/item:text-slate-600" />
                      <span className="text-slate-700 font-medium">{cat}</span>
                    </button>
                  ))}
                  
                  <div className="h-px bg-slate-100 my-2 mx-5"></div>
                  
                  <button className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50 transition-colors text-left w-full group/item">
                    <Star className="w-5 h-5 text-slate-400 group-hover/item:text-yellow-500" />
                    <span className="text-slate-700 font-medium">Favoritos</span>
                  </button>
                  
                  <div className="mt-4 mb-2 px-5 text-center">
                    <div className="h-px bg-slate-100 w-full mb-3"></div>
                    <button className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors" onClick={() => { setShowSearchDropdown(false); setActiveTab('people'); }}>
                      Ver todas las personas <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 max-w-2xl mx-4" />
          )}

          <div className="flex items-center gap-4 w-1/3 justify-end">
            {importingCount > 0 && (
              <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100/50 shadow-sm animate-in fade-in zoom-in duration-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm font-medium tracking-tight">Importando...</span>
              </div>
            )}
            {(activeTab === 'fotos' || activeTab === 'archivos') && (
              <button onClick={() => setIsDownloadModalOpen(true)} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors" title="Descargar App de Escritorio">
                <MonitorDown className="w-5 h-5" />
              </button>
            )}
          </div>
        </header>
        <div id="main-scroll-container" className={`flex-1 overflow-y-auto ${activeTab === 'archivos' ? 'p-0 overflow-hidden' : 'p-10'}`}>
          {activeTab === 'archivos' && (
            <FilesView
              files={files}
              isLoading={isLoading}
              isUploading={isUploading}
              onUpload={uploadMultipleFiles}
              handleDrop={handleDrop}
              handleDragOver={handleDragOver}
              onDelete={handleDelete}
              setSidebarActions={setSidebarActions}
            />
          )}

          {activeTab === 'fotos' && (
            <div className="h-[calc(100%+5rem)] flex flex-col relative -mt-10">
              <PhotosView 
                paddingTop="20px" 
                files={files} 
                onDelete={handleDelete} 
                onBulkDelete={handleBulkDelete}
                onNavigateToPerson={(id) => {
                  setTargetPersonId(id);
                  setPreviousTab(activeTab);
                  setActiveTab('people');
                }}
              />
            </div>
          )}

          {activeTab === 'albums' && (
            <AlbumsView files={files as any} setCustomHeader={setCustomHeader} />
          )}

          {activeTab === 'people' && (
            <PeopleView 
              setCustomHeader={setCustomHeader} 
              setHeaderActions={setHeaderActions}
              onDelete={handleDelete} 
              onBulkDelete={handleBulkDelete}
              initialPersonId={targetPersonId}
              onClearInitialPerson={() => setTargetPersonId(null)}
            />
          )}

          {activeTab === 'map' && (
            <MapView 
              files={files} 
              onDelete={handleDelete} 
              onBulkDelete={handleBulkDelete} 
            />
          )}

          {activeTab === 'trash' && (
            <TrashView onRefresh={fetchFiles} setHeaderActions={setHeaderActions} />
          )}

          {activeTab === 'duplicates' && (
            <div className="h-[calc(100%+5rem)] flex flex-col relative -mt-10">
              <DuplicatesView onBulkDelete={handleBulkDelete} setHeaderActions={setHeaderActions} />
            </div>
          )}

          {activeTab === 'buscar' && (
            <div className="animate-fade-in h-full w-full">
              {isSearching ? (
                <div className="flex-1 flex flex-col items-center justify-center h-full text-slate-400 gap-4">
                  <Loader2 className="w-12 h-12 animate-spin text-blue-500" />
                  <p>Analizando tus fotos con IA...</p>
                </div>
              ) : searchResults.length > 0 ? (
                <PhotosView files={searchResults} />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center h-full text-slate-400 gap-4 opacity-70">
                  <Search className="w-16 h-16 stroke-1" />
                  <p>No se encontraron resultados para "{searchQuery}"</p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {uploadProgress && (
        <div className="fixed bottom-6 right-6 z-[100] w-80 bg-white/90 backdrop-blur-md border border-slate-200/60 shadow-2xl rounded-2xl p-5 transition-all duration-300">
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-slate-800 text-sm">
              Subiendo {uploadProgress.current} de {uploadProgress.total} {uploadProgress.total === 1 ? 'elemento' : 'elementos'}
            </span>
            <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
              {uploadProgress.percentage}%
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner">
            <div
              className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress.percentage}%` }}
            ></div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2 truncate">
            Agregando a tu nube privada...
          </p>
        </div>
      )}

      {/* Modal Descarga */}
      {isDownloadModalOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200" onClick={() => setIsDownloadModalOpen(false)}>
           <div className="bg-white rounded-3xl p-8 max-w-2xl w-full mx-4 shadow-2xl relative animate-in zoom-in-95 duration-300 flex flex-col items-center" onClick={e => e.stopPropagation()}>
             <button onClick={() => setIsDownloadModalOpen(false)} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
               <XCircle className="w-6 h-6" />
             </button>
             <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
               <Cloud className="w-8 h-8 text-blue-600" />
             </div>
             <h2 className="text-2xl font-bold text-slate-800 text-center mb-3">Descarga la App de Escritorio</h2>
             <p className="text-slate-500 text-center mb-8 text-sm max-w-md">Sincroniza tus carpetas automáticamente en segundo plano sin necesidad de tener el navegador abierto.</p>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
               <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200/60 hover:border-slate-300 transition-colors flex flex-col items-center text-center">
                 <Apple className="w-10 h-10 text-slate-700 mb-3" />
                 <h3 className="font-semibold text-slate-800 mb-1">Para Mac</h3>
                 <a href="/public/downloads/CloudSync-mac.dmg" download className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors">
                   <Download className="w-4 h-4" /> Descargar
                 </a>
               </div>
               <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200/60 hover:border-slate-300 transition-colors flex flex-col items-center text-center">
                 <Monitor className="w-10 h-10 text-blue-500 mb-3" />
                 <h3 className="font-semibold text-slate-800 mb-1">Para Windows</h3>
                 <a href="/public/downloads/CloudSync-win.exe" download className="mt-4 w-full flex items-center justify-center gap-2 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors">
                   <Download className="w-4 h-4" /> Descargar
                 </a>
               </div>
             </div>
           </div>
        </div>
      )}

    </div>
  );
}