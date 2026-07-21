import { useState, useCallback, memo, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, Trash2, CheckCircle2, Circle, ArrowLeft, Share2, ZoomIn, Info, Star, MoreVertical, Calendar, Camera, UploadCloud, Cloud, MapPin, Pencil, ChevronLeft, ChevronRight, ZoomOut, Maximize, Download } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import TimelineScrollbar from './TimelineScrollbar';
import { ProgressiveImage } from './ProgressiveImage';

type FileData = {
  id: string;
  originalName: string;
  savedName: string;
  thumbnailName?: string;
  blurhash?: string;
  status?: string;
  width?: number;
  height?: number;
  mimeType: string;
  size: number;
  createdAt: string;
  takenAt?: string;
  isDeleted?: boolean;
  deletedAt?: string;
  latitude?: number;
  longitude?: number;
  uploadSource?: string;
  isFavorite?: number | boolean;
};

type PhotosViewProps = {
  files: FileData[];
  onDelete?: (id: string) => void;
  onBulkDelete?: (ids: string[]) => void;
  renderSelectionActions?: (selectedIds: string[], clearSelection: () => void, selectAll: () => void) => React.ReactNode;
  paddingTop?: string;
  onNavigateToPerson?: (id: string) => void;
};

export interface PhotosViewRef {
  selectAll: () => void;
  clearSelection: () => void;
}

export const viewerState = {
  currentId: null as string | null,
  isInfoPanelOpen: false,
  photoData: null as FileData | null,
  listeners: new Set<() => void>(),
  open(file: FileData) {
    this.currentId = file.id;
    this.photoData = file;
    this.isInfoPanelOpen = false;
    this.notify();
  },
  close() {
    this.currentId = null;
    this.photoData = null;
    this.isInfoPanelOpen = false;
    this.notify();
  },
  toggleInfoPanel() {
    this.isInfoPanelOpen = !this.isInfoPanelOpen;
    this.notify();
  },
  notify() {
    this.listeners.forEach(l => l());
  },
  subscribe(l: () => void) {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }
};

function formatGroupDate(dateString: string) {
  const date = new Date(dateString);
  const today = new Date();
  
  const isSameDay = date.getDate() === today.getDate() && 
                    date.getMonth() === today.getMonth() && 
                    date.getFullYear() === today.getFullYear();
                    
  if (isSameDay) return 'Hoy';
  
  const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
  if (date.getFullYear() !== today.getFullYear()) {
    options.year = 'numeric';
  }
  
  let formatted = date.toLocaleDateString('es-ES', options);
  // capitalize only the first letter or keep it lowercase? The screenshot has lowercase "dom", "sáb", "vie".
  // we can just return it directly (it's lowercase by default in Spanish).
  return formatted;
}

type PhotoItemProps = {
  file: FileData;
  isSelected: boolean;
  isSelectingMode: boolean;
  onToggle: (id: string, shiftKey: boolean) => void;
};

const PhotoItem = memo(({ file, isSelected, isSelectingMode, onToggle }: PhotoItemProps) => {
  const aspectRatio = file.width && file.height ? `${file.width} / ${file.height}` : 'auto';
  
  return (
    <div 
      className={`relative h-28 sm:h-36 md:h-48 flex-grow group cursor-pointer overflow-hidden transition-colors duration-0 ${isSelected ? 'bg-blue-100' : 'bg-slate-100'}`}
      style={{ aspectRatio }}
      onClick={(e) => {
        if (isSelectingMode) {
          onToggle(file.id, e.shiftKey);
        } else {
          viewerState.open(file);
        }
      }}
    >
      <button
        className={`absolute top-2 left-2 z-20 transition-opacity duration-0 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(file.id, e.shiftKey);
        }}
      >
        {isSelected ? (
          <CheckCircle2 className="w-7 h-7 text-white fill-blue-500" />
        ) : (
          <Circle className="w-7 h-7 text-white/70 hover:text-white fill-black/20" />
        )}
      </button>
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors z-10 pointer-events-none" />
      {isSelected && <div className="absolute inset-0 bg-blue-500/10 z-10 pointer-events-none" />}
      
      {file.isDeleted === 1 && file.deletedAt && (
        <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-md text-white text-[10px] sm:text-xs font-medium px-2 py-1 rounded-md z-20 pointer-events-none shadow-sm">
          {Math.max(0, 60 - Math.floor((new Date().getTime() - new Date(file.deletedAt).getTime()) / (1000 * 60 * 60 * 24)))} días
        </div>
      )}
      
      {file.mimeType?.startsWith('video/') ? (
        <video
          src={`/api/media/${file.id}/web#t=0.1`}
          className={`h-full w-auto min-w-full object-cover transition-none ${isSelected ? '[clip-path:inset(12px_round_12px)]' : ''}`}
          muted
          playsInline
        />
      ) : (
        <ProgressiveImage
          src={`/api/media/${file.id}/thumbnail`}
          blurhash={file.blurhash}
          className={`h-full w-auto min-w-full object-cover transition-none ${isSelected ? '[clip-path:inset(12px_round_12px)]' : ''}`}
          alt={file.originalName}
        />
      )}
    </div>
  );
});

const PhotosView = forwardRef<PhotosViewRef, PhotosViewProps>(({ files, onDelete, onBulkDelete, renderSelectionActions, paddingTop, onNavigateToPerson }, ref) => {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const bulkDeleteMenuRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (bulkDeleteMenuRef.current && !bulkDeleteMenuRef.current.contains(event.target as Node)) {
        setShowBulkDeleteConfirm(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/avif',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ];
  
  const mediaFiles = files.filter(f => f.mimeType && allowedMimeTypes.includes(f.mimeType.toLowerCase()));

  const orderedGroups = useMemo(() => {
    if (mediaFiles.length === 0) return [];
    const sortedImages = [...mediaFiles].sort((a, b) => {
      const dateA = new Date(a.takenAt || a.createdAt).getTime();
      const dateB = new Date(b.takenAt || b.createdAt).getTime();
      return dateB - dateA;
    });
    
    const groups: { groupName: string, items: FileData[] }[] = [];
    
    sortedImages.forEach(image => {
      const groupName = formatGroupDate(image.takenAt || image.createdAt);
      const existingGroup = groups.find(g => g.groupName === groupName);
      if (existingGroup) {
        existingGroup.items.push(image);
      } else {
        groups.push({ groupName, items: [image] });
      }
    });
    
    return groups;
  }, [mediaFiles]);

  const flatFiles = useMemo(() => orderedGroups.flatMap(g => g.items), [orderedGroups]);

  const toggleSelection = useCallback((id: string, shiftKey: boolean = false) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      
      if (shiftKey && lastSelectedId) {
        const startIdx = flatFiles.findIndex(f => f.id === lastSelectedId);
        const endIdx = flatFiles.findIndex(f => f.id === id);
        
        if (startIdx !== -1 && endIdx !== -1) {
          const minIdx = Math.min(startIdx, endIdx);
          const maxIdx = Math.max(startIdx, endIdx);
          
          for (let i = minIdx; i <= maxIdx; i++) {
            newSet.add(flatFiles[i].id);
          }
        }
      } else {
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
      }
      
      return newSet;
    });
    setLastSelectedId(id);
  }, [flatFiles, lastSelectedId]);

  const selectAll = useCallback(() => {
    setSelectedFiles(new Set(mediaFiles.map(f => f.id)));
  }, [mediaFiles]);

  useImperativeHandle(ref, () => ({
    selectAll,
    clearSelection: () => setSelectedFiles(new Set())
  }));

  const toggleGroup = useCallback((items: FileData[]) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      const allSelected = items.every(item => newSet.has(item.id));
      if (allSelected) {
        items.forEach(item => newSet.delete(item.id));
      } else {
        items.forEach(item => newSet.add(item.id));
      }
      return newSet;
    });
  }, []);

  const handleConfirmBulkDelete = () => {
    if (onBulkDelete) {
      onBulkDelete(Array.from(selectedFiles));
      setSelectedFiles(new Set());
      setShowBulkDeleteConfirm(false);
    }
  };

  const isSelectingMode = selectedFiles.size > 0;

  // Early return AFTER all hooks
  if (mediaFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4 opacity-70">
        <ImageIcon className="w-16 h-16 stroke-1" />
        <p>No hay fotos disponibles</p>
      </div>
    );
  }

  return (
    <>
    <div ref={scrollContainerRef} className="px-1 py-4 h-full overflow-y-auto relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
      {/* Top Header Action Bar (Google Photos Style) */}
      <div 
        className={`fixed top-0 right-0 left-[64px] h-20 z-40 bg-white flex items-center justify-between px-8 shadow-sm border-b border-slate-200 transition-transform duration-200 ease-out ${selectedFiles.size > 0 ? 'translate-y-0' : '-translate-y-full'}`}
      >
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setSelectedFiles(new Set())} 
            className="text-slate-500 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <span className="font-medium text-lg text-slate-800 ml-2">{selectedFiles.size} seleccionadas</span>
        </div>
        
        <div className="flex items-center gap-2">
          {renderSelectionActions ? renderSelectionActions(Array.from(selectedFiles), () => setSelectedFiles(new Set()), selectAll) : (
            <>
              <button 
                onClick={() => {
                  const ids = Array.from(selectedFiles).join(',');
                  window.location.href = `/api/download/zip?ids=${ids}`;
                }}
                className="text-slate-500 hover:text-slate-700 p-2.5 rounded-full hover:bg-slate-100 transition-colors"
                title="Descargar"
              >
                <Download className="w-6 h-6" />
              </button>
              {onBulkDelete && (
                <div className="relative" ref={bulkDeleteMenuRef}>
                  <button 
                    onClick={() => setShowBulkDeleteConfirm(!showBulkDeleteConfirm)}
                  className="text-slate-500 hover:text-red-600 p-2.5 rounded-full hover:bg-red-50 transition-colors"
                  title="Eliminar"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
                {showBulkDeleteConfirm && (
                  <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200 p-2">
                    <p className="text-xs text-slate-500 px-2 pb-2 mb-1 border-b border-slate-100">¿Mover a papelera?</p>
                    <button 
                      onClick={handleConfirmBulkDelete}
                      className="w-full text-left px-2 py-2.5 text-sm text-red-600 font-medium hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Sí, mover {selectedFiles.size > 1 ? `${selectedFiles.size} elementos` : '1 elemento'}
                    </button>
                    <button 
                      onClick={() => setShowBulkDeleteConfirm(false)}
                      className="w-full text-left px-2 py-2 text-sm text-slate-700 font-medium hover:bg-slate-50 rounded-lg transition-colors mt-1"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      </div>
      <div className="px-4 sm:px-6 md:px-8 max-w-[2000px] mx-auto pb-32" style={paddingTop ? { paddingTop } : undefined}>
        {orderedGroups.map((group) => {
        const allSelected = group.items.every(file => selectedFiles.has(file.id));
        return (
          <div 
            key={group.groupName} 
            className="mb-6 group-container"
            data-date={group.items[0].takenAt || group.items[0].createdAt}
          >
            <div className="relative flex items-center h-8 mb-1 group/header">
              <button 
                className={`absolute left-2 z-10 transition-opacity duration-0 ${allSelected ? 'opacity-100' : 'opacity-0 group-hover/header:opacity-100'}`}
                onClick={() => toggleGroup(group.items)}
              >
                {allSelected ? <CheckCircle2 className="w-7 h-7 text-blue-500 fill-white" /> : <Circle className="w-7 h-7 text-slate-300 hover:text-slate-500" />}
              </button>
              <h2 className={`text-sm font-medium text-slate-500 dark:text-slate-400 lowercase transition-transform duration-0 ${allSelected ? 'translate-x-11' : 'translate-x-0 group-hover/header:translate-x-11'}`}>
                {group.groupName}
              </h2>
            </div>
            <div className="flex flex-wrap gap-[2px]">
              {group.items.map((file) => (
                <PhotoItem 
                  key={file.id}
                  file={file}
                  isSelected={selectedFiles.has(file.id)}
                  isSelectingMode={isSelectingMode}
                  onToggle={toggleSelection}
                />
              ))}
              {/* Espaciador invisible para evitar que la última fila se estire demasiado */}
              <div className="flex-grow-[999] min-w-[50%] h-0" />
            </div>
          </div>
        );
      })}
      </div>

      <PhotoViewerUI onDelete={onDelete} files={flatFiles} onNavigateToPerson={onNavigateToPerson} />
    </div>
    <TimelineScrollbar 
        scrollContainerRef={scrollContainerRef} 
      dependencies={[orderedGroups]} 
    />
    </>
  );
});

export default PhotosView;

export const PhotoViewerUI = ({ onDelete, files, onNavigateToPerson }: { onDelete?: (id: string) => void, files: FileData[], onNavigateToPerson?: (id: string) => void }) => {
  const [photo, setPhoto] = useState<FileData | null>(null);
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [isToolbarVisible, setIsToolbarVisible] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [detectedPeople, setDetectedPeople] = useState<{id: string, name: string, coverFileId?: string}[]>([]);
  const [locationName, setLocationName] = useState<string | null>(null);
  const [localFavorites, setLocalFavorites] = useState<Record<string, boolean>>({});
  const deleteMenuRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);

  const toggleFavorite = async (id: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    setLocalFavorites(prev => ({ ...prev, [id]: newStatus }));
    try {
      const res = await fetch(`/api/files/${id}/favorite`, { method: 'PUT' });
      if (!res.ok) throw new Error('Failed to toggle favorite');
    } catch (error) {
      console.error(error);
      setLocalFavorites(prev => ({ ...prev, [id]: currentStatus }));
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(event.target as Node)) {
        setShowDeleteConfirm(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!viewerState.photoData) return;
    const currentIndex = files.findIndex(f => f.id === viewerState.photoData?.id);
    if (currentIndex > 0) {
      viewerState.open(files[currentIndex - 1]);
    }
  }, [files]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!viewerState.photoData) return;
    const currentIndex = files.findIndex(f => f.id === viewerState.photoData?.id);
    if (currentIndex !== -1 && currentIndex < files.length - 1) {
      viewerState.open(files[currentIndex + 1]);
    }
  }, [files]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!viewerState.photoData) return;
      
      if (e.key === 'Escape') {
        viewerState.close();
        return;
      }

      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrev, handleNext, viewerState.photoData]);

  useEffect(() => {
    return viewerState.subscribe(() => {
      setPhoto(viewerState.photoData);
      if (viewerState.photoData) {
        setIsInfoPanelOpen(viewerState.isInfoPanelOpen);
      }
    });
  }, []);

  const handleMouseMove = useCallback(() => {
    setIsToolbarVisible(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (!isInfoPanelOpen) {
      timeoutRef.current = setTimeout(() => {
        setIsToolbarVisible(false);
      }, 4000);
    }
  }, [isInfoPanelOpen]);

  useEffect(() => {
    handleMouseMove();
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [handleMouseMove, photo]);

  useEffect(() => {
    if (photo && isInfoPanelOpen) {
      fetch(`/api/files/${photo.id}/people`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setDetectedPeople(data);
          else setDetectedPeople([]);
        })
        .catch(err => {
          console.error(err);
          setDetectedPeople([]);
        });
    } else {
      setDetectedPeople([]);
    }
  }, [photo, isInfoPanelOpen]);

  useEffect(() => {
    if (photo && photo.latitude != null && photo.longitude != null) {
      fetch(`https://nominatim.openstreetmap.org/reverse?lat=${photo.latitude}&lon=${photo.longitude}&format=json&accept-language=es`)
        .then(res => res.json())
        .then(data => {
          if (data && data.address) {
            const city = data.address.city || data.address.town || data.address.village || data.address.county;
            const state = data.address.state || data.address.region;
            const country = data.address.country;
            // Quitamos duplicados adyacentes y unimos
            const parts = [city, state, country].filter(Boolean);
            const uniqueParts = parts.filter((item, pos) => parts.indexOf(item) === pos);
            setLocationName(uniqueParts.join(', '));
          } else {
            setLocationName(`${photo.latitude?.toFixed(4)}, ${photo.longitude?.toFixed(4)}`);
          }
        })
        .catch(err => {
          console.error('Error fetching location:', err);
          setLocationName(`${photo.latitude?.toFixed(4)}, ${photo.longitude?.toFixed(4)}`);
        });
    } else {
      setLocationName(null);
    }
  }, [photo]);

  if (!photo) return null;

  const getStyle = (): React.CSSProperties => {
    return {
      position: 'fixed',
      top: 0,
      left: isInfoPanelOpen ? '0px' : '0px',
      width: isInfoPanelOpen ? 'calc(100vw - 360px)' : '100vw',
      height: '100vh',
      transition: 'width 0.3s ease', // Only transition width when info panel opens
      zIndex: 101,
    };
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex cursor-default overflow-hidden"
      onMouseMove={handleMouseMove}
      onClick={handleMouseMove}
    >
      <div 
        className="absolute inset-0 bg-black pointer-events-auto"
        onClick={() => viewerState.close()}
      />
      
      {/* Top Bar Google Photos Style */}
      <div 
        className={`absolute top-0 left-0 right-0 h-16 flex items-center justify-between px-4 z-[102] bg-gradient-to-b from-black/60 to-transparent transition-all duration-350 ease-[cubic-bezier(0.4,0,0.2,1)] ${(isToolbarVisible || isInfoPanelOpen) ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}
      >
        <button 
          onClick={(e) => { e.stopPropagation(); viewerState.close(); }}
          className="p-2 text-white hover:bg-white/20 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        
        <div className="flex items-center gap-1 md:gap-2">
          <button 
            className={`p-2 text-white hover:bg-white/20 rounded-full transition-colors ${isInfoPanelOpen ? 'bg-white/20' : ''}`} 
            title="Información"
            onClick={(e) => { e.stopPropagation(); viewerState.toggleInfoPanel(); }}
          >
            <Info className="w-5 h-5" />
          </button>
          <button 
            onClick={(e) => {
              e.stopPropagation();
              const isFav = localFavorites[photo.id] !== undefined ? localFavorites[photo.id] : (photo.isFavorite === 1);
              toggleFavorite(photo.id, isFav);
            }}
            className={`p-2 rounded-full transition-colors ${
              (localFavorites[photo.id] !== undefined ? localFavorites[photo.id] : (photo.isFavorite === 1)) 
                ? 'text-yellow-400 hover:bg-white/20' 
                : 'text-white hover:bg-white/20'
            }`}
            title="Favorito"
          >
            <Star 
              className="w-5 h-5" 
              fill={(localFavorites[photo.id] !== undefined ? localFavorites[photo.id] : (photo.isFavorite === 1)) ? "currentColor" : "none"} 
            />
          </button>
          {onDelete && (
            <div className="relative" ref={deleteMenuRef}>
              <button 
                onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(!showDeleteConfirm); }}
                className="p-2 text-white hover:bg-white/20 rounded-full transition-colors" 
                title="Eliminar"
              >
                <Trash2 className="w-5 h-5" />
              </button>
              {showDeleteConfirm && (
                <div 
                  className="absolute top-full right-0 mt-2 w-48 bg-[#2a2b2e] rounded-xl shadow-xl border border-white/10 overflow-hidden z-[150] animate-in fade-in slide-in-from-top-2 duration-200 p-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-xs text-white/60 px-2 pb-2 mb-1 border-b border-white/10">¿Mover a papelera?</p>
                  <button 
                    onClick={() => { onDelete(photo.id); viewerState.close(); setShowDeleteConfirm(false); }}
                    className="w-full text-left px-2 py-2.5 text-sm text-red-400 font-medium hover:bg-white/5 rounded-lg transition-colors"
                  >
                    Sí, mover elemento
                  </button>
                  <button 
                    onClick={() => setShowDeleteConfirm(false)}
                    className="w-full text-left px-2 py-2 text-sm text-white/80 font-medium hover:bg-white/5 rounded-lg transition-colors mt-1"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {photo.mimeType?.startsWith('video/') ? (
        <video
          src={`/api/media/${photo.id}/original`}
          controls
          autoPlay
          style={getStyle()}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <div className="relative w-full h-full flex items-center justify-center" style={getStyle()} onClick={(e) => { e.stopPropagation(); viewerState.close(); }}>
          <TransformWrapper
            initialScale={1}
            minScale={0.5}
            maxScale={5}
            centerOnInit
            wheel={{ step: 0.1 }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                <div 
                  className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#2a2b2e]/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 z-[105] transition-all duration-350 ${isToolbarVisible && !isInfoPanelOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button onClick={() => zoomOut()} className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-full transition-colors" title="Alejar">
                    <ZoomOut className="w-5 h-5" />
                  </button>
                  <button onClick={() => resetTransform()} className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-full transition-colors mx-1" title="Restablecer zoom">
                    <Maximize className="w-4 h-4" />
                  </button>
                  <button onClick={() => zoomIn()} className="p-2 text-white/70 hover:text-white hover:bg-white/20 rounded-full transition-colors" title="Acercar">
                    <ZoomIn className="w-5 h-5" />
                  </button>
                </div>

                <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center">
                  <div className="w-full h-full flex items-center justify-center" onClick={(e) => { e.stopPropagation(); }}>
                    <ProgressiveImage
                      key={photo.id}
                      src={`/api/media/${photo.id}/web`}
                      thumbnailSrc={photo.thumbnailName ? `/api/media/${photo.id}/thumbnail` : undefined}
                      alt={photo.originalName}
                      objectFit="contain"
                    />
                  </div>
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        </div>
      )}

      {/* Navigation Arrows */}
      <button 
        onClick={handlePrev}
        className={`absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/20 hover:bg-black/50 text-white rounded-full transition-all duration-300 z-[105] ${isToolbarVisible && !isInfoPanelOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <ChevronLeft className="w-8 h-8" />
      </button>

      <button 
        onClick={handleNext}
        className={`absolute top-1/2 -translate-y-1/2 p-3 bg-black/20 hover:bg-black/50 text-white rounded-full transition-all duration-300 z-[105] ${isInfoPanelOpen ? 'right-[380px]' : 'right-4'} ${isToolbarVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <ChevronRight className="w-8 h-8" />
      </button>

      {/* Side Info Panel */}
      <div 
        className={`absolute top-0 right-0 h-full w-[360px] bg-[#202124] border-l border-white/10 z-[103] transform transition-transform duration-350 ease-[cubic-bezier(0.4,0,0.2,1)] ${isInfoPanelOpen ? 'translate-x-0' : 'translate-x-full'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 p-4 border-b border-white/10">
          <button 
            onClick={() => viewerState.toggleInfoPanel()}
            className="p-2 text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <span className="text-white text-lg font-normal">Información</span>
        </div>
        
        <div className="p-6 overflow-y-auto h-[calc(100%-65px)] text-white/90">

          
          {detectedPeople.length > 0 && (
            <div className="mb-8">
              <h3 className="text-sm font-medium mb-4 text-white/70">Personas</h3>
              <div className="flex flex-wrap gap-4">
                {detectedPeople.map(person => (
                  <div 
                    key={person.id} 
                    className="flex flex-col items-center gap-2 group/person cursor-pointer"
                    onClick={() => onNavigateToPerson && onNavigateToPerson(person.id)}
                  >
                    <div className="w-14 h-14 rounded-full overflow-hidden border border-white/10 group-hover/person:border-white/40 transition-colors">
                      <img 
                        src={`/api/people/${person.id}/face${person.coverFileId ? `?v=${person.coverFileId}` : ''}`} 
                        alt={person.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="text-xs text-white/70 group-hover/person:text-white max-w-[70px] truncate text-center">
                      {person.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <h3 className="text-sm font-medium mb-4 text-white/70">Detalles</h3>
          
          <div className="space-y-6">
            <div className="flex items-start justify-between group">
              <div className="flex gap-4">
                <Calendar className="w-5 h-5 mt-0.5 text-white/70" />
                <div>
                  <div className="text-sm">
                    {new Date(photo.takenAt || photo.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  </div>
                  <div className="text-xs text-white/50">
                    {new Date(photo.takenAt || photo.createdAt).toLocaleDateString('es-ES', { weekday: 'short' })},{' '}
                    {new Date(photo.takenAt || photo.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              <button className="opacity-0 group-hover:opacity-100 p-1 text-white/70 hover:bg-white/10 rounded-full transition-all">
                <Pencil className="w-4 h-4" />
              </button>
            </div>


            <div className="flex items-start gap-4">
              <ImageIcon className="w-5 h-5 mt-0.5 text-white/70" />
              <div>
                <div className="text-sm">{photo.originalName}</div>
                <div className="text-xs text-white/50">
                  {(photo.size / (1024 * 1024)).toFixed(1)} MB {photo.width && photo.height ? ` ${photo.width} × ${photo.height}` : ''}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <UploadCloud className="w-5 h-5 text-white/70" />
              <div className="text-sm">Subida desde {photo.uploadSource || 'la nube'}</div>
            </div>



            <div className="flex items-start justify-between group">
              <div className="flex gap-4 w-full">
                <MapPin className="w-5 h-5 mt-0.5 text-white/70 shrink-0" />
                <div className="w-full pr-4">
                  {photo.latitude != null && photo.longitude != null ? (
                    <>
                      <div className="w-full h-32 rounded-xl overflow-hidden mt-1 mb-2 border border-white/10 relative">
                        <iframe 
                          src={`https://maps.google.com/maps?q=${photo.latitude},${photo.longitude}&hl=es&z=14&output=embed`}
                          className="w-full h-full absolute inset-0"
                          style={{ border: 0 }}
                          allowFullScreen
                          loading="lazy"
                        ></iframe>
                      </div>
                      <div className="text-sm">
                        {locationName || `${photo.latitude.toFixed(4)}, ${photo.longitude.toFixed(4)}`}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm">Ubicación desconocida</div>
                      <div className="text-xs text-white/50">
                        Ubicación estimada - <span className="underline cursor-pointer">Más información</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <button className="opacity-0 group-hover:opacity-100 p-1 text-white/70 hover:bg-white/10 rounded-full transition-all shrink-0">
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
