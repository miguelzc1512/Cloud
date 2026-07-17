import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Cloud, Laptop, Plus, UserCircle2, X, Image as ImageIcon } from 'lucide-react';
import ExistingPhotosModal from './ExistingPhotosModal';
import SelectPeopleModal from './SelectPeopleModal';

interface CreateAlbumViewProps {
  files?: any[];
  onClose: () => void;
  onSubmit: (name: string, description: string, localFiles: File[], existingIds: string[], personIds: string[]) => Promise<void>;
}

export default function CreateAlbumView({ files = [], onClose, onSubmit }: CreateAlbumViewProps) {
  const [title, setTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Photo Selection States
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isExistingModalOpen, setIsExistingModalOpen] = useState(false);
  const [isPeopleModalOpen, setIsPeopleModalOpen] = useState(false);
  
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [localPreviews, setLocalPreviews] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  const [peopleCache, setPeopleCache] = useState<any[]>([]);
  
  // Drag & Drop
  const [isDragging, setIsDragging] = useState(false);

  // Focus the input when the view mounts
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Generate previews for local files
  useEffect(() => {
    const urls = localFiles.map(file => URL.createObjectURL(file));
    setLocalPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [localFiles]);

  const handleSave = async () => {
    if (!title.trim()) {
      onClose();
      return;
    }

    try {
      setIsSaving(true);
      await onSubmit(title, '', localFiles, Array.from(selectedIds), Array.from(selectedPersonIds));
    } catch (error) {
      console.error('Error creating album:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLocalFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setLocalFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
    setIsMenuOpen(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setLocalFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const totalSelected = localFiles.length + selectedIds.size + selectedPersonIds.size;
  const hasSelection = totalSelected > 0;

  // Thumbnails para fotos locales
  const localDeckThumbnails = localPreviews.slice(0, 3);
  
  // Thumbnails para fotos de la cuenta
  const cloudSelectedFiles = files.filter(f => selectedIds.has(f.id));
  const cloudDeckThumbnails = cloudSelectedFiles.slice(0, 3).map(f => `http://localhost:3001/uploads/${f.savedName}`);

  const hasLocal = localFiles.length > 0;
  const hasCloud = selectedIds.size > 0;
  const hasPeople = selectedPersonIds.size > 0;
  const activeDecksCount = (hasLocal ? 1 : 0) + (hasCloud ? 1 : 0) + (hasPeople ? 1 : 0);
  const showDecksLabel = activeDecksCount > 1;

  const peopleSelectedArray = Array.from(selectedPersonIds);
  const peopleDeckThumbnails = peopleSelectedArray.slice(0, 3).map(id => {
    const person = peopleCache.find(p => p.id === id);
    const version = person?.coverFile ? `?v=${person.coverFile}` : '';
    return `http://localhost:3001/api/people/${id}/face${version}`;
  });

  return (
    <div 
      className={`fixed inset-0 z-[60] flex flex-col bg-white overflow-hidden animate-fade-in transition-colors ${isDragging ? 'bg-blue-50/50' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
            <span className="font-normal text-[15px]">Cancelar</span>
          </button>
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          {/* Icons removed per user request */}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex flex-col items-center pt-24 overflow-y-auto w-full">
        <div className="w-full max-w-[1100px] px-8 flex flex-col flex-1 pb-8">
          
          {/* Título Gigante */}
          <div className="w-full mb-16">
            <textarea
              ref={inputRef}
              rows={1}
              placeholder="Añade un título"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              className="w-full text-center text-6xl sm:text-7xl md:text-[80px] leading-tight font-bold text-slate-800 placeholder-slate-300 bg-transparent border-b border-slate-200 pb-4 outline-none transition-colors focus:border-blue-500 overflow-hidden resize-none"
              maxLength={40}
              style={{ minHeight: '100px' }}
            />
          </div>

          {/* Acciones para añadir fotos o Visualización de Baraja */}
          <div className="w-full flex flex-col items-center">
            
            {!hasSelection ? (
              <div className="w-full max-w-sm">
                <p className="text-[13px] font-medium text-slate-500 mb-4 px-1">Añadir fotos</p>
                
                <div className="flex flex-col w-full gap-3 relative">
                  <button 
                    onClick={() => setIsPeopleModalOpen(true)}
                    className="flex items-center gap-4 w-full p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors shrink-0">
                      <UserCircle2 className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="font-medium text-slate-700 text-[15px]">Seleccionar personas y mascotas</span>
                      <span className="text-[13px] text-slate-500 mt-0.5">Crea un álbum que se actualice solo</span>
                    </div>
                  </button>

                  <div className="relative">
                    <button 
                      onClick={() => setIsMenuOpen(!isMenuOpen)}
                      className="flex items-center gap-4 w-full p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-transparent text-blue-600 border border-slate-200 group-hover:border-blue-200 group-hover:bg-blue-50 transition-colors shrink-0">
                        <Plus className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col items-start text-left">
                        <span className="font-medium text-slate-700 text-[15px]">Seleccionar fotos</span>
                      </div>
                    </button>

                    {/* Popover Menu */}
                    {isMenuOpen && (
                      <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-100 rounded-xl shadow-lg shadow-slate-200/50 py-2 z-10 animate-fade-in">
                        <button 
                          onClick={() => { fileInputRef.current?.click(); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                        >
                          <Laptop className="w-4 h-4 text-slate-400" />
                          Subir del ordenador
                        </button>
                        <button 
                          onClick={() => { setIsExistingModalOpen(true); setIsMenuOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                        >
                          <Cloud className="w-4 h-4 text-slate-400" />
                          Seleccionar de la cuenta
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Si ya hay seleccion de personas */
              <>
                
                {/* Baraja View */}
                <div className="flex flex-col items-center mt-4 text-center">
                  <div className="flex justify-center gap-8 mb-6 mt-4 relative">
                    
                    {/* Deck Local */}
                    {hasLocal && (
                      <div className="flex flex-col items-center">
                        <div className="relative w-48 h-48 group cursor-pointer" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setLocalFiles([]); }}
                            className="absolute -top-4 -right-4 z-40 w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-red-500 shadow-md hover:scale-105 transition-all"
                            title="Borrar selección local"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                          </button>
                          <div className="relative w-full h-full">
                            {localDeckThumbnails.map((url, i) => {
                              const offset = i * 14; 
                              const scale = 1 - (i * 0.05); 
                              const rotate = i % 2 === 0 ? i * 2 : -i * 2;
                              const zIndex = 10 - i;
                              return (
                                <div 
                                  key={url + i}
                                  className="absolute top-0 left-0 w-full h-full rounded-2xl overflow-hidden border border-slate-200 shadow-md bg-white transition-all duration-300 group-hover:-translate-y-2"
                                  style={{ transform: `translate(${offset}px, ${offset}px) scale(${scale}) rotate(${rotate}deg)`, zIndex }}
                                >
                                  <img src={url} alt="thumbnail" className="w-full h-full object-cover" />
                                  {i === 2 && localFiles.length > 3 && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                      <span className="text-white font-medium text-lg">+{localFiles.length - 3}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            <div className="absolute -bottom-3 -right-3 z-20 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg hover:scale-105 transition-transform">
                              <Plus className="w-6 h-6" />
                            </div>
                          </div>
                        </div>
                        {showDecksLabel && <span className="text-sm font-medium text-slate-500 mt-6 bg-slate-100 px-3 py-1 rounded-full">Del ordenador</span>}
                      </div>
                    )}

                    {/* Deck Cloud */}
                    {hasCloud && (
                      <div className="flex flex-col items-center">
                        <div className="relative w-48 h-48 group cursor-pointer" onClick={() => setIsMenuOpen(!isMenuOpen)}>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedIds(new Set()); }}
                            className="absolute -top-4 -right-4 z-40 w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-red-500 shadow-md hover:scale-105 transition-all"
                            title="Borrar selección nube"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                          </button>
                          <div className="relative w-full h-full">
                            {cloudDeckThumbnails.map((url, i) => {
                              const offset = i * 14; 
                              const scale = 1 - (i * 0.05); 
                              const rotate = i % 2 === 0 ? i * 2 : -i * 2;
                              const zIndex = 10 - i;
                              return (
                                <div 
                                  key={url + i}
                                  className="absolute top-0 left-0 w-full h-full rounded-2xl overflow-hidden border border-slate-200 shadow-md bg-white transition-all duration-300 group-hover:-translate-y-2"
                                  style={{ transform: `translate(${offset}px, ${offset}px) scale(${scale}) rotate(${rotate}deg)`, zIndex }}
                                >
                                  <img src={url} alt="thumbnail" className="w-full h-full object-cover" />
                                  {i === 2 && selectedIds.size > 3 && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                      <span className="text-white font-medium text-lg">+{selectedIds.size - 3}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            <div className="absolute -bottom-3 -right-3 z-20 w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-lg hover:scale-105 transition-transform">
                              <Plus className="w-6 h-6" />
                            </div>
                          </div>
                        </div>
                        {showDecksLabel && <span className="text-sm font-medium text-slate-500 mt-6 bg-blue-50 text-blue-600 px-3 py-1 rounded-full">De la cuenta</span>}
                      </div>
                    )}

                    {/* Deck Personas */}
                    {hasPeople && (
                      <div className="flex flex-col items-center">
                        <div className="relative w-48 h-48 group cursor-pointer" onClick={() => setIsPeopleModalOpen(true)}>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSelectedPersonIds(new Set()); }}
                            className="absolute -top-4 -right-4 z-40 w-8 h-8 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-red-500 shadow-md hover:scale-105 transition-all"
                            title="Borrar selección de personas"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                          </button>
                          <div className="relative w-full h-full">
                            {peopleDeckThumbnails.map((url, i) => {
                              const offset = i * 14; 
                              const scale = 1 - (i * 0.05); 
                              const rotate = i % 2 === 0 ? i * 2 : -i * 2;
                              const zIndex = 10 - i;
                              return (
                                <div 
                                  key={url + i}
                                  className="absolute top-0 left-0 w-full h-full rounded-full overflow-hidden border-2 border-white shadow-md bg-slate-200 transition-all duration-300 group-hover:-translate-y-2"
                                  style={{ transform: `translate(${offset}px, ${offset}px) scale(${scale}) rotate(${rotate}deg)`, zIndex }}
                                >
                                  <img src={url} alt="thumbnail" className="w-full h-full object-cover" />
                                  {i === 2 && selectedPersonIds.size > 3 && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                      <span className="text-white font-medium text-lg">+{selectedPersonIds.size - 3}</span>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            <div className="absolute -bottom-3 -right-3 z-20 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shadow-lg hover:scale-105 transition-transform">
                              <UserCircle2 className="w-6 h-6" />
                            </div>
                          </div>
                        </div>
                        {showDecksLabel && <span className="text-sm font-medium text-slate-500 mt-6 bg-purple-50 text-purple-600 px-3 py-1 rounded-full">Personas</span>}
                      </div>
                    )}
                    
                    {isMenuOpen && (
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-6 w-64 bg-white border border-slate-100 rounded-xl shadow-lg shadow-slate-200/50 py-2 z-30 animate-fade-in">
                        <button 
                          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                        >
                          <Laptop className="w-4 h-4 text-slate-400" />
                          Subir más del ordenador
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setIsExistingModalOpen(true); setIsMenuOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors text-left"
                        >
                          <Cloud className="w-4 h-4 text-slate-400" />
                          Seleccionar más de la cuenta
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex flex-col items-center mt-8 mb-2">
                    <h3 className="text-xl font-medium text-slate-800">
                      {localFiles.length + selectedIds.size > 0 && (
                        <span>{localFiles.length + selectedIds.size} {(localFiles.length + selectedIds.size) === 1 ? 'foto' : 'fotos'}</span>
                      )}
                      {localFiles.length + selectedIds.size > 0 && selectedPersonIds.size > 0 && <span> y </span>}
                      {selectedPersonIds.size > 0 && (
                        <span>{selectedPersonIds.size} {selectedPersonIds.size === 1 ? 'persona' : 'personas'}</span>
                      )}
                      <span> {totalSelected === 1 ? 'seleccionada' : 'seleccionadas'}</span>
                    </h3>
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !title.trim()}
                    className={`mt-4 px-8 py-3 bg-blue-600 text-white rounded-full font-medium hover:bg-blue-700 transition-colors shadow-md hover:shadow-lg ${
                      (isSaving || !title.trim()) ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {isSaving ? 'Creando álbum...' : 'Crear álbum'}
                  </button>
                  {!title.trim() && (
                    <p className="text-xs text-slate-400 mt-3">Añade un título para crear el álbum</p>
                  )}
                </div>
              </>
            )}
            
            {/* Input oculto para el selector de archivos nativo */}
            <input 
              type="file" 
              multiple 
              accept="image/*,video/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleLocalFileSelect}
            />
          </div>

          <div className="w-full text-center mt-auto">
            {isDragging ? (
              <div className="p-4 border-2 border-dashed border-blue-400 rounded-xl bg-blue-50/80 text-blue-600 font-medium animate-pulse">
                Suelta las fotos aquí para añadirlas
              </div>
            ) : (
              <p className="text-[13px] text-slate-400">Consejo: Arrastra fotos y vídeos adonde quieras para subirlos</p>
            )}
          </div>
        </div>
      </main>

      <ExistingPhotosModal 
        isOpen={isExistingModalOpen} 
        onClose={() => setIsExistingModalOpen(false)} 
        files={files} 
        selectedIds={selectedIds} 
        onSelectionChange={setSelectedIds} 
      />
      <SelectPeopleModal 
        isOpen={isPeopleModalOpen}
        onClose={() => setIsPeopleModalOpen(false)}
        selectedIds={selectedPersonIds}
        onSelectionChange={(newSelection, peopleDetails) => {
          setSelectedPersonIds(newSelection);
          if (peopleDetails) setPeopleCache(peopleDetails);
        }}
      />
    </div>
  );
}
