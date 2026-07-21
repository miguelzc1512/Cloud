import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronLeft, Edit2, Check, X, Loader2, Circle, CheckCircle2, UserMinus, Merge, Trash2, Plus, ChevronDown } from 'lucide-react';
import PhotosView from '../../PhotosView';
import { ProgressiveImage } from '../../ProgressiveImage';

export interface PeopleViewProps {
  setCustomHeader: React.Dispatch<React.SetStateAction<React.ReactNode | null>>;
  setHeaderActions: React.Dispatch<React.SetStateAction<React.ReactNode | null>>;
  onDelete: (id: string) => void;
  onBulkDelete: (ids: string[]) => void;
  initialPersonId?: string | null;
  onClearInitialPerson?: () => void;
}

interface Person {
  id: string;
  name: string;
  coverFile: string;
  coverThumbnail: string;
  coverBlurhash?: string;
  faceCount: number;
}

interface Status {
  total: number;
  processed: number;
}

export const PeopleView: React.FC<PeopleViewProps> = ({ setCustomHeader, setHeaderActions, onDelete, onBulkDelete, initialPersonId, onClearInitialPerson }) => {
  const [people, setPeople] = useState<Person[]>([]);
  const [status, setStatus] = useState<Status>({ total: 0, processed: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [personPhotos, setPersonPhotos] = useState<any[]>([]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  // Selection state for grid view
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  const [coverUpdateCounter, setCoverUpdateCounter] = useState(0);
  const [showHideConfirm, setShowHideConfirm] = useState(false);
  const [coverConfirmId, setCoverConfirmId] = useState<string | null>(null);
  
  const [additionalFilterPeople, setAdditionalFilterPeople] = useState<any[]>([]);
  const [coOccurringPeople, setCoOccurringPeople] = useState<any[]>([]);
  const [showFilterBar, setShowFilterBar] = useState(true);
  const [showOtrosDropdown, setShowOtrosDropdown] = useState(false);
  const otrosMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (otrosMenuRef.current && !otrosMenuRef.current.contains(event.target as Node)) {
        setShowOtrosDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    try {
      const [peopleRes, statusRes] = await Promise.all([
        fetch(`/api/people?t=${Date.now()}`),
        fetch(`/api/people/status?t=${Date.now()}`)
      ]);

      if (peopleRes.ok) {
        const data = await peopleRes.json();
        setPeople(data);
        setSelectedPerson(prev => {
          if (!prev) return prev;
          const updated = data.find((p: Person) => p.id === prev.id);
          return updated || prev;
        });
      }
      if (statusRes.ok) {
        const data = await statusRes.json();
        setStatus(data);
      }
    } catch (e) {
      console.error('Error fetching people data', e);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 3000); // Poll every 3 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchPersonPhotos = async (id: string, additionalIds: string[] = []) => {
    try {
      const query = additionalIds.length > 0 ? `?alsoWith=${additionalIds.join(',')}` : '';
      const res = await fetch(`/api/people/${id}/photos${query}`);
      if (res.ok) {
        const data = await res.json();
        setPersonPhotos(data);
      }
    } catch (e) {
      console.error('Error fetching person photos', e);
    }
  };

  const fetchCoOccurringPeople = async (id: string, additionalIds: string[] = []) => {
    try {
      const query = additionalIds.length > 0 ? `?alsoWith=${additionalIds.join(',')}` : '';
      const res = await fetch(`/api/people/${id}/co-occurring${query}`);
      if (res.ok) {
        const data = await res.json();
        setCoOccurringPeople(data);
      }
    } catch (e) {
      console.error('Error fetching co-occurring people', e);
    }
  };

  const additionalIdsString = additionalFilterPeople.map(p => p.id).join(',');

  useEffect(() => {
    if (selectedPerson) {
      const additionalIds = additionalIdsString ? additionalIdsString.split(',') : [];
      fetchPersonPhotos(selectedPerson.id, additionalIds);
      fetchCoOccurringPeople(selectedPerson.id, additionalIds);
    } else {
      if (additionalIdsString !== '') setAdditionalFilterPeople([]);
      if (coOccurringPeople.length > 0) setCoOccurringPeople([]);
    }
  }, [selectedPerson?.id, additionalIdsString]);

  useEffect(() => {
    let lastScrollY = 0;
    let ticking = false;
    
    const handleScroll = (e: Event) => {
      // Find the element that is actually scrolling
      const target = e.target as HTMLElement;
      if (!target || typeof target.scrollTop !== 'number') return;
      
      const currentScrollY = target.scrollTop;
      
      // Ignore tiny scrolls or scrolls on non-main elements
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
    
    // Window capture phase is guaranteed to catch ANY scroll event in the entire application
    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
    return () => window.removeEventListener('scroll', handleScroll, { capture: true });
  }, []);

  const handleRenamePerson = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedPerson || !editNameValue.trim()) return;

    try {
      const res = await fetch(`/api/people/${selectedPerson.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editNameValue.trim() })
      });
      if (res.ok) {
        setSelectedPerson({ ...selectedPerson, name: editNameValue.trim() });
        setPeople(people.map(p => p.id === selectedPerson.id ? { ...p, name: editNameValue.trim() } : p));
      }
    } catch (error) {
      console.error('Error renaming person', error);
    }
    setIsEditingName(false);
  };

  const handleMerge = async () => {
    if (selectedPersonIds.size < 2) return;
    const ids = Array.from(selectedPersonIds);
    try {
      const res = await fetch('/api/people/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personIds: ids })
      });
      if (res.ok) {
        setSelectedPersonIds(new Set());
        fetchData();
      }
    } catch (error) {
      console.error('Error merging people', error);
    }
  };

  useEffect(() => {
    if (initialPersonId && people.length > 0 && !selectedPerson) {
      const person = people.find(p => p.id === initialPersonId);
      if (person) {
        setSelectedPerson(person);
        if (onClearInitialPerson) onClearInitialPerson();
      }
    }
  }, [initialPersonId, people, selectedPerson, onClearInitialPerson]);

  const handleBack = () => {
    setSelectedPerson(null);
  };

  const handleHide = async () => {
    if (selectedPersonIds.size === 0) return;
    setShowHideConfirm(true);
  };

  const confirmHide = async () => {
    setShowHideConfirm(false);
    const ids = Array.from(selectedPersonIds);
    try {
      await Promise.all(ids.map(id => fetch(`/api/people/${id}/hide`, { method: 'POST' })));
      setSelectedPersonIds(new Set());
      fetchData();
    } catch (error) {
      console.error('Error hiding people', error);
    }
  };

  const togglePersonSelection = (id: string) => {
    const next = new Set(selectedPersonIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedPersonIds(next);
  };

  useEffect(() => {
    if (!selectedPerson) {
      // Grid view
      setCustomHeader(null);

      const progress = status.total > 0 ? (status.processed / status.total) * 100 : 100;
      const isProcessing = progress < 100;

      setHeaderActions(
        <div className="flex items-center gap-4">
          {isProcessing && (
            <div className="flex items-center gap-3 bg-blue-50/50 px-4 py-2 rounded-full border border-blue-100/50">
              <div className="relative w-10 h-10 flex items-center justify-center">
                <svg className="transform -rotate-90 w-10 h-10 absolute inset-0">
                  <circle cx="20" cy="20" r={16} stroke="currentColor" strokeWidth="3" fill="transparent" className="text-blue-100" />
                  <circle
                    cx="20" cy="20" r={16} stroke="currentColor" strokeWidth="3" fill="transparent"
                    strokeDasharray={2 * Math.PI * 16}
                    strokeDashoffset={(2 * Math.PI * 16) - (progress / 100) * (2 * Math.PI * 16)}
                    className="text-blue-500 transition-all duration-500 ease-out"
                    strokeLinecap="round"
                  />
                </svg>
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-blue-900 leading-tight">Analizando</span>
                <span className="text-[11px] font-medium text-blue-600 leading-tight">Faltan {status.total - status.processed} por analizar</span>
              </div>
            </div>
          )}
        </div>
      );
    } else {
      // Header for detailed person view
      setHeaderActions(null);
      setCustomHeader(
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelectedPerson(null)}
            className="flex items-center justify-center w-10 h-10 rounded-full hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 shrink-0">
              <img 
                src={`/api/people/${selectedPerson.id}/face?v=${selectedPerson.coverFile}&t=${coverUpdateCounter}`} 
                alt={selectedPerson.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="hidden w-full h-full bg-blue-100 flex items-center justify-center text-blue-500 font-bold">
                {selectedPerson.name.charAt(0).toUpperCase()}
              </div>
            </div>

            {isEditingName ? (
              <form onSubmit={handleRenamePerson} className="flex items-center gap-2">
                <input
                  type="text"
                  value={editNameValue}
                  onChange={e => setEditNameValue(e.target.value)}
                  autoFocus
                  className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-lg font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 shadow-sm w-48 transition-all"
                  placeholder="Nombre..."
                />
                <button type="submit" className="p-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 shadow-sm transition-colors">
                  <Check className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setIsEditingName(false)} className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setEditNameValue(selectedPerson.name); setIsEditingName(true); }}>
                <h1 className="text-xl font-bold text-slate-800 tracking-tight">{selectedPerson.name}</h1>
                <Edit2 className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>
        </div>
      );
    }

    return () => {
      setCustomHeader(null);
      setHeaderActions(null);
    };
  }, [selectedPerson, isEditingName, editNameValue, status, people.length, selectedPersonIds.size, coverUpdateCounter]);

  const handleRemovePhotosFromPerson = async (selectedIds: string[], clearSelection: () => void) => {
    if (!selectedPerson) return;
    try {
      const res = await fetch(`/api/people/${selectedPerson.id}/remove-photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: selectedIds })
      });
      if (res.ok) {
        setPersonPhotos(prev => prev.filter(p => !selectedIds.includes(p.id)));
        clearSelection();
        // refresh data for counts
        fetchData();
      }
    } catch (e) {
      console.error('Error removing photos', e);
    }
  };

  const handleSetCover = async (fileId: string, clearSelection: () => void) => {
    if (!selectedPerson) return;
    try {
      const res = await fetch(`/api/people/${selectedPerson.id}/cover`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId })
      });
      if (res.ok) {
        clearSelection();
        setCoverUpdateCounter(c => c + 1);
        await fetchData(); // refresh the people list so cover updates
      }
    } catch (e) {
      console.error('Error setting cover', e);
    }
  };

  const renderSelectionActions = useCallback((selectedIds: string[], clearSelection: () => void) => {
    return (
      <div className="flex items-center gap-1">
        {selectedIds.length === 1 && (
          coverConfirmId === selectedIds[0] ? (
            <div className="flex items-center gap-2 animate-in slide-in-from-right-4 duration-200 bg-blue-50 px-3 py-1.5 rounded-full mr-2">
              <span className="text-sm text-blue-700 mr-1">¿Usar de perfil?</span>
              <button 
                onClick={() => setCoverConfirmId(null)}
                className="text-blue-600 hover:text-blue-800 px-2 py-1 rounded-full hover:bg-blue-100 transition-colors text-sm font-medium"
              >
                No
              </button>
              <button 
                onClick={() => {
                  handleSetCover(selectedIds[0], clearSelection);
                  setCoverConfirmId(null);
                }}
                className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-full shadow-sm transition-colors text-sm font-medium"
              >
                Sí
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCoverConfirmId(selectedIds[0])}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
              title="Usar como foto de perfil"
            >
              <Circle className="w-5 h-5" />
              Foto de perfil
            </button>
          )
        )}
        <button
          onClick={() => handleRemovePhotosFromPerson(selectedIds, clearSelection)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-full transition-colors"
          title="Quitar rostro de esta persona"
        >
          <UserMinus className="w-5 h-5" />
          No es esta persona
        </button>
        {onBulkDelete && (
          <button
            onClick={() => {
              if (window.confirm(`¿Mover ${selectedIds.length > 1 ? selectedIds.length + ' elementos' : '1 elemento'} a papelera?`)) {
                onBulkDelete(selectedIds);
                setPersonPhotos(prev => prev.filter(p => !selectedIds.includes(p.id)));
                clearSelection();
              }
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
            title="Eliminar fotos de la nube"
          >
            <Trash2 className="w-5 h-5" />
            Eliminar
          </button>
        )}
      </div>
    );
  }, [selectedPerson, onBulkDelete, coverConfirmId]);

  if (selectedPerson) {
    return (
      <div ref={containerRef} className="animate-in fade-in duration-300 h-[calc(100%+5rem)] flex flex-col relative -mt-10">
        <div 
          className={`fixed top-20 left-[64px] right-0 z-[5] transition-all duration-300 ease-in-out bg-slate-50/95 backdrop-blur-md py-3 shadow-sm border-b border-slate-200/50 ${showFilterBar ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}
        >
          <div 
            className="flex items-center gap-2 flex-wrap w-full"
            style={{ 
              paddingLeft: 'max(1.5rem, calc(2.5rem + 1rem))', // Matches Gallery left padding
              paddingRight: 'max(1.5rem, calc(2.5rem + 1rem))'
            }}
          >
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-200 shrink-0 cursor-default shadow-sm">
            <img 
              src={`/api/people/${selectedPerson.id}/face?v=${selectedPerson.coverFile}`}
              className="w-6 h-6 rounded-full object-cover bg-slate-200" 
              alt={selectedPerson.name}
            />
            <span className="text-slate-700 text-sm font-semibold pr-1">Solo estas personas</span>
          </div>
          
          {additionalFilterPeople.map(p => (
            <div 
              key={p.id} 
              onClick={() => setAdditionalFilterPeople(prev => prev.filter(af => af.id !== p.id))}
              className="flex items-center gap-1.5 px-1 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full border border-blue-200 shrink-0 cursor-pointer shadow-sm transition-colors group"
            >
              <img 
                src={`/api/people/${p.id}/face?v=${p.coverFile}`}
                className="w-6 h-6 rounded-full object-cover bg-slate-200" 
                alt={p.name}
              />
              <span className="text-sm font-semibold pl-0.5 pr-0.5 truncate max-w-[120px]">{p.name}</span>
              <div className="bg-blue-200 group-hover:bg-blue-300 rounded-full p-0.5 mr-0.5 transition-colors">
                <X className="w-3 h-3 text-blue-700" />
              </div>
            </div>
          ))}

          {coOccurringPeople.slice(0, 5).map(p => (
            <div 
              key={p.id} 
              onClick={() => setAdditionalFilterPeople(prev => [...prev, p])}
              className="flex items-center gap-1.5 px-1 py-1 bg-white hover:bg-slate-50 text-slate-600 rounded-full border border-slate-200 shrink-0 cursor-pointer shadow-sm transition-colors group"
            >
              <img 
                src={`/api/people/${p.id}/face?v=${p.coverFile}`}
                className="w-6 h-6 rounded-full object-cover bg-slate-200 opacity-90 group-hover:opacity-100" 
                alt={p.name}
              />
              <span className="text-sm font-medium pl-0.5 pr-0.5 truncate max-w-[120px]">{p.name}</span>
              <div className="bg-slate-100 group-hover:bg-slate-200 rounded-full p-0.5 mr-0.5 transition-colors">
                <Plus className="w-3 h-3 text-slate-500" />
              </div>
            </div>
          ))}

          {coOccurringPeople.length > 5 && (
            <div className="relative shrink-0" ref={otrosMenuRef}>
              <div 
                onClick={() => setShowOtrosDropdown(!showOtrosDropdown)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-600 rounded-full border border-slate-200 cursor-pointer shadow-sm transition-colors"
              >
                <span className="text-sm font-medium">Otros ({coOccurringPeople.length - 5})</span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showOtrosDropdown ? 'rotate-180' : ''}`} />
              </div>
              
              {showOtrosDropdown && (
                <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200 p-2 max-h-[300px] overflow-y-auto">
                  {coOccurringPeople.slice(5).map(p => (
                    <div 
                      key={p.id}
                      onClick={() => {
                        setAdditionalFilterPeople(prev => [...prev, p]);
                        setShowOtrosDropdown(false);
                      }}
                      className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
                    >
                      <img 
                        src={`/api/people/${p.id}/face?v=${p.coverFile}`}
                        className="w-8 h-8 rounded-full object-cover bg-slate-200 shrink-0" 
                        alt={p.name}
                      />
                      <span className="text-sm font-medium text-slate-700 truncate">{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        </div>
        <PhotosView
          paddingTop="50px"
          files={personPhotos}
          onDelete={(id) => {
            setPersonPhotos(prev => prev.filter(p => p.id !== id));
            onDelete(id);
          }}
          onBulkDelete={(ids) => {
            setPersonPhotos(prev => prev.filter(p => !ids.includes(p.id)));
            onBulkDelete(ids);
          }}
          renderSelectionActions={renderSelectionActions}
        />
      </div>
    );
  }

  if (isLoading && people.length === 0) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto pb-32">
      {people.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[50vh] text-slate-500">
          <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-5">
            <svg className="w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <p className="text-2xl font-bold text-slate-800 tracking-tight">Sin rostros detectados aún</p>
          <p className="text-base text-slate-500 mt-2 max-w-sm text-center">La IA está procesando tus fotos o no ha encontrado personas en tu galería.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-6 gap-y-10">
          {people.map((person) => {
            const isSelected = selectedPersonIds.has(person.id);
            return (
              <div 
                key={person.id} 
                className={`flex flex-col items-center group cursor-pointer animate-in fade-in zoom-in duration-300 relative transition-transform ${isSelected ? 'scale-95' : ''}`}
                onClick={() => {
                  if (selectedPersonIds.size > 0) {
                    togglePersonSelection(person.id);
                  } else {
                    setSelectedPerson(person);
                  }
                }}
              >
                <div className="relative">
                  <div className={`w-32 h-32 rounded-full overflow-hidden bg-slate-100 ring-4 transition-all duration-300 shadow-sm relative ${isSelected ? 'ring-blue-500 shadow-lg' : 'ring-transparent group-hover:ring-blue-500/30 group-hover:shadow-lg'}`}>
                    <ProgressiveImage
                      src={`/api/people/${person.id}/face?v=${person.coverFile}&t=${coverUpdateCounter}`}
                      blurhash={person.coverBlurhash}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      alt={person.name}
                    />
                    <div className="hidden w-full h-full bg-slate-200 flex items-center justify-center">
                      <span className="text-slate-400 text-3xl">{person.name.charAt(0)}</span>
                    </div>
                    <div className={`absolute inset-0 bg-black/0 transition-colors duration-300 ${isSelected ? 'bg-blue-500/10' : 'group-hover:bg-black/5'}`}></div>
                  </div>
                  
                  <div 
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePersonSelection(person.id);
                    }}
                    className={`absolute top-1 left-1 bg-white rounded-full shadow-sm z-10 transition-opacity duration-200 cursor-pointer ${
                      isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {isSelected ? (
                      <CheckCircle2 className="w-7 h-7 text-blue-500 fill-blue-50" />
                    ) : (
                      <Circle className="w-7 h-7 text-white drop-shadow-md fill-black/20" />
                    )}
                  </div>
                </div>
                
                <div className="mt-4 flex flex-col items-center text-center">
                  <span className={`text-base font-semibold transition-colors line-clamp-1 ${isSelected ? 'text-blue-600' : 'text-slate-800 group-hover:text-blue-600'}`}>
                    {person.name}
                  </span>
                  <span className="text-sm font-medium text-slate-400 mt-0.5">
                    {person.faceCount} {person.faceCount === 1 ? 'foto' : 'fotos'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div 
        className={`fixed top-0 right-0 left-[64px] h-20 z-40 bg-white flex items-center justify-between px-8 shadow-sm border-b border-slate-200 transition-transform duration-200 ease-out ${selectedPersonIds.size > 0 ? 'translate-y-0' : '-translate-y-full'}`}
      >
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              setSelectedPersonIds(new Set());
            }} 
            className="text-slate-500 hover:text-slate-700 p-2 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <span className="font-medium text-lg text-slate-800 ml-2">{selectedPersonIds.size} seleccionadas</span>
        </div>
        
        <div className="flex items-center gap-3">
          {showHideConfirm ? (
            <div className="flex items-center gap-2 animate-in slide-in-from-right-4 duration-200">
              <span className="text-sm text-slate-500 mr-2">¿Ocultar {selectedPersonIds.size > 1 ? 'personas' : 'persona'}?</span>
              <button 
                onClick={() => setShowHideConfirm(false)}
                className="text-slate-500 hover:text-slate-700 px-3 py-1.5 rounded-full hover:bg-slate-100 transition-colors text-sm font-medium"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmHide}
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-full shadow-sm transition-colors text-sm font-medium"
              >
                Sí, ocultar
              </button>
            </div>
          ) : (
            <>
              <button 
                onClick={handleHide}
                className="text-slate-500 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors"
                title="Quitar / Ocultar"
              >
                <UserMinus className="w-6 h-6" />
              </button>
              
              <button 
                onClick={handleMerge}
                disabled={selectedPersonIds.size < 2}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium shadow-sm transition-all ${
                  selectedPersonIds.size > 1 ? 'bg-blue-500 hover:bg-blue-600 text-white shadow-md hover:shadow-lg' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Merge className="w-5 h-5" />
                Fusionar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
