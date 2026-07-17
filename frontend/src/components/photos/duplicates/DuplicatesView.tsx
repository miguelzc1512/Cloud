import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Trash2, Loader2, Sparkles, Copy, CheckCircle2, Circle, CheckSquare, X } from 'lucide-react';
import { ProgressiveImage } from '../../ProgressiveImage';
import { PhotoViewerUI, viewerState } from '../../PhotosView';

interface FileData {
  id: string;
  savedName: string;
  thumbnailName?: string;
  originalName: string;
  blurhash: string;
  width?: number;
  height?: number;
  takenAt?: string;
  createdAt?: string;
}

interface DuplicatesViewProps {
  onBulkDelete: (ids: string[]) => Promise<void>;
  setHeaderActions?: (actions: React.ReactNode) => void;
}

export default function DuplicatesView({ onBulkDelete, setHeaderActions }: DuplicatesViewProps) {
  const [activeTab, setActiveTab] = useState<'exact' | 'similar'>('exact');
  const [exactGroups, setExactGroups] = useState<FileData[][]>([]);
  const [similarGroups, setSimilarGroups] = useState<FileData[][]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [threshold, setThreshold] = useState(0.85);
  const [showFilterBar, setShowFilterBar] = useState(true);
  const debounceRef = useRef<NodeJS.Timeout>();
  const deleteMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastScrollY = 0;
    let ticking = false;
    
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target || typeof target.scrollTop !== 'number') return;
      
      const currentScrollY = target.scrollTop;
      if (currentScrollY === 0 && lastScrollY === 0) return;

      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (currentScrollY <= 10) {
            setShowFilterBar(true);
          } else if (currentScrollY > lastScrollY && currentScrollY > 20) {
            setShowFilterBar(false);
          } else if (currentScrollY < lastScrollY) {
            setShowFilterBar(true);
          }
          lastScrollY = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (deleteMenuRef.current && !deleteMenuRef.current.contains(event.target as Node)) {
        setShowDeleteConfirm(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchGroups = async (currentThreshold = threshold) => {
    setIsLoading(true);
    try {
      const [resExact, resSimilar] = await Promise.all([
        fetch('http://localhost:3001/api/duplicates'),
        fetch(`http://localhost:3001/api/similars?threshold=${currentThreshold}`)
      ]);
      if (resExact.ok) setExactGroups(await resExact.json());
      if (resSimilar.ok) setSimilarGroups(await resSimilar.json());
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups(threshold);
  }, []);

  const handleThresholdChange = (val: number) => {
    setThreshold(val);
    fetchGroups(val);
  };

  // When changing tabs, clear selections to avoid deleting wrong things by accident
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

  const currentGroups = activeTab === 'exact' ? exactGroups : similarGroups;
  const flatFiles = currentGroups.flat();

  const handleSelectAllRecommended = useCallback(() => {
    const newSelected = new Set(selectedIds);
    currentGroups.forEach(group => {
      for (let i = 1; i < group.length; i++) {
        newSelected.add(group[i].id);
      }
    });
    setSelectedIds(newSelected);
  }, [selectedIds, currentGroups]);

  // Update header actions
  useEffect(() => {
    if (setHeaderActions) {
      if (currentGroups.length > 0) {
        setHeaderActions(
          <button 
            onClick={handleSelectAllRecommended}
            className="text-slate-600 font-medium hover:text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 text-sm"
          >
            <CheckSquare className="w-4 h-4" />
            <span>Seleccionar recomendadas</span>
          </button>
        );
      } else {
        setHeaderActions(null);
      }
    }
    return () => {
      if (setHeaderActions) setHeaderActions(null);
    };
  }, [setHeaderActions, currentGroups, handleSelectAllRecommended]);

  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleConfirmDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    await onBulkDelete(Array.from(selectedIds));
    setSelectedIds(new Set());
    setShowDeleteConfirm(false);
    await fetchGroups(); // refresh
    setIsDeleting(false);
  };

  return (
    <>
    {/* Selection Action Bar (Overlay) */}
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
        <span className="font-medium text-lg text-slate-800 ml-2">{selectedIds.size} seleccionadas</span>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="relative" ref={deleteMenuRef}>
          <button
            onClick={() => setShowDeleteConfirm(!showDeleteConfirm)}
            disabled={isDeleting}
            className="text-slate-500 hover:text-red-600 p-2.5 rounded-full hover:bg-red-50 transition-colors"
            title="Eliminar seleccionadas"
          >
            {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
          </button>
          
          {showDeleteConfirm && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200 p-2">
              <p className="text-xs text-slate-500 px-2 pb-2 mb-1 border-b border-slate-100">¿Mover a papelera?</p>
              <button 
                onClick={handleConfirmDelete}
                className="w-full text-left px-2 py-2.5 text-sm text-red-600 font-medium hover:bg-red-50 rounded-lg transition-colors"
              >
                Sí, mover {selectedIds.size > 1 ? `${selectedIds.size} elementos` : '1 elemento'}
              </button>
              <button 
                onClick={() => setShowDeleteConfirm(false)}
                className="w-full text-left px-2 py-2 text-sm text-slate-700 font-medium hover:bg-slate-50 rounded-lg transition-colors mt-1"
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>

    <div 
      className={`fixed top-20 left-[64px] right-0 z-[5] transition-all duration-300 ease-in-out bg-slate-50/95 backdrop-blur-md py-3 shadow-sm border-b border-slate-200/50 ${showFilterBar ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}
    >
      <div 
        className="flex flex-col md:flex-row items-center justify-between gap-4 w-full"
        style={{ 
          paddingLeft: 'max(1.5rem, calc(2.5rem + 1rem))',
          paddingRight: 'max(1.5rem, calc(2.5rem + 1rem))'
        }}
      >
        <div className="flex items-center gap-6">
          <div className="flex p-0.5 bg-slate-200/50 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab('exact')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'exact' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Copy className="w-3.5 h-3.5" /> Exactas
            </button>
            <button
              onClick={() => setActiveTab('similar')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-all ${activeTab === 'similar' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Similares
            </button>
          </div>

          {/* Minimalist Threshold Selector for Similar tab */}
          {activeTab === 'similar' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium mr-1">Nivel:</span>
              <div className="flex p-0.5 bg-slate-200/50 rounded-lg">
                <button
                  onClick={() => handleThresholdChange(0.95)}
                  className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${threshold === 0.95 ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Estricto (95%)
                </button>
                <button
                  onClick={() => handleThresholdChange(0.90)}
                  className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${threshold === 0.90 ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Normal (90%)
                </button>
                <button
                  onClick={() => handleThresholdChange(0.85)}
                  className={`px-3 py-1 text-[11px] font-medium rounded-md transition-colors ${threshold === 0.85 ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Relajado (85%)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    <div className="px-1 pt-[80px] pb-4 h-full overflow-y-auto relative flex flex-col animate-fade-in [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
          <p>Analizando la biblioteca visualmente...</p>
        </div>
      ) : currentGroups.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3 opacity-80 mt-10">
          {activeTab === 'exact' ? <Copy className="w-16 h-16 stroke-1" /> : <Sparkles className="w-16 h-16 stroke-1" />}
          <h3 className="text-xl font-medium text-slate-700">¡Tu galería está impecable!</h3>
          <p>No se detectaron fotos {activeTab === 'exact' ? 'duplicadas idénticas' : 'repetitivas en ráfaga'}.</p>
        </div>
      ) : (
        <div className="space-y-12 pb-32">
          {currentGroups.map((group, idx) => (
            <div key={idx} className="mb-4">
              <div className="flex items-center justify-between mb-2 px-2">
                <h4 className="font-medium text-slate-700 text-sm">{group.length} coincidencias</h4>
              </div>
              <div className="flex flex-wrap gap-[2px]">
                {group.map((file, fileIdx) => {
                  const isSelected = selectedIds.has(file.id);
                  const isRecommendedKeep = fileIdx === 0;
                  const aspectRatio = file.width && file.height ? `${file.width} / ${file.height}` : 'auto';
                  
                  return (
                    <div 
                      key={file.id} 
                      onClick={() => {
                        if (selectedIds.size > 0) {
                          handleToggleSelect(file.id);
                        } else {
                          viewerState.open(file as any);
                        }
                      }}
                      className={`relative h-28 sm:h-36 md:h-48 flex-grow group cursor-pointer overflow-hidden transition-colors duration-0 ${isSelected ? 'bg-blue-100' : 'bg-slate-100'}`}
                      style={{ aspectRatio }}
                    >
                      <button
                        className={`absolute top-2 left-2 z-20 transition-opacity duration-0 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleSelect(file.id);
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

                      <ProgressiveImage 
                        src={`http://localhost:3001/uploads/${file.thumbnailName || file.savedName}`} 
                        blurhash={file.blurhash}
                        alt="Duplicate"
                        className={`h-full w-auto min-w-full object-cover transition-none ${isSelected ? '[clip-path:inset(12px_round_12px)]' : ''}`}
                      />
                      
                      {isRecommendedKeep && (
                        <div className="absolute inset-0 border-4 border-green-500 z-10 pointer-events-none" />
                      )}
                    </div>
                  );
                })}
                <div className="flex-grow-[999] min-w-[50%] h-0" />
              </div>
            </div>
          ))}
        </div>
      )}
      
      <PhotoViewerUI files={flatFiles as any[]} />
    </div>
    </>
  );
}
