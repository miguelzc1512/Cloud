import React, { useState, useMemo } from 'react';
import { X, CheckCircle2, Circle } from 'lucide-react';

import { ProgressiveImage } from '../../ProgressiveImage';

interface FileData {
  id: string;
  originalName: string;
  savedName: string;
  thumbnailName?: string;
  blurhash?: string;
  mimeType: string;
  createdAt: string;
  takenAt?: string;
}

interface ExistingPhotosModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileData[];
  selectedIds: Set<string>;
  onSelectionChange: (newSelection: Set<string>) => void;
}

export default function ExistingPhotosModal({ isOpen, onClose, files, selectedIds, onSelectionChange }: ExistingPhotosModalProps) {
  const [localSelection, setLocalSelection] = useState<Set<string>>(new Set(selectedIds));
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  // Reset local selection when opened
  React.useEffect(() => {
    if (isOpen) {
      setLocalSelection(new Set(selectedIds));
    }
  }, [isOpen, selectedIds]);

  // Group photos by date (similar to PhotosView)
  const groupedPhotos = useMemo(() => {
    const photosOnly = files.filter(f => f.mimeType?.startsWith('image/') || f.mimeType?.startsWith('video/'));
    
    const sorted = [...photosOnly].sort((a, b) => {
      const dateA = new Date(a.takenAt || a.createdAt).getTime();
      const dateB = new Date(b.takenAt || b.createdAt).getTime();
      return dateB - dateA;
    });

    const groups: { date: string; items: FileData[] }[] = [];
    
    sorted.forEach(photo => {
      const date = new Date(photo.takenAt || photo.createdAt);
      const today = new Date();
      const isSameDay = date.getDate() === today.getDate() && 
                        date.getMonth() === today.getMonth() && 
                        date.getFullYear() === today.getFullYear();
      
      let groupName = 'Hoy';
      if (!isSameDay) {
        const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
        if (date.getFullYear() !== today.getFullYear()) {
          options.year = 'numeric';
        }
        groupName = date.toLocaleDateString('es-ES', options);
      }

      const existingGroup = groups.find(g => g.date === groupName);
      if (existingGroup) {
        existingGroup.items.push(photo);
      } else {
        groups.push({ date: groupName, items: [photo] });
      }
    });
    return groups;
  }, [files]);

  const flatPhotos = useMemo(() => groupedPhotos.flatMap(g => g.items), [groupedPhotos]);

  if (!isOpen) return null;

  const togglePhoto = (id: string, e: React.MouseEvent) => {
    const newSel = new Set(localSelection);
    const isSelected = newSel.has(id);
    
    if (e.shiftKey && lastSelectedId) {
      const currentIndex = flatPhotos.findIndex(f => f.id === id);
      const lastIndex = flatPhotos.findIndex(f => f.id === lastSelectedId);
      
      if (currentIndex !== -1 && lastIndex !== -1) {
        const start = Math.min(currentIndex, lastIndex);
        const end = Math.max(currentIndex, lastIndex);
        for (let i = start; i <= end; i++) {
          if (!isSelected) {
            newSel.add(flatPhotos[i].id);
          } else {
            newSel.delete(flatPhotos[i].id);
          }
        }
      }
    } else {
      if (isSelected) {
        newSel.delete(id);
      } else {
        newSel.add(id);
      }
    }
    
    setLocalSelection(newSel);
    setLastSelectedId(id);
  };

  const toggleGroup = (items: FileData[]) => {
    const allSelected = items.every(item => localSelection.has(item.id));
    const newSel = new Set(localSelection);
    if (allSelected) {
      items.forEach(item => newSel.delete(item.id));
    } else {
      items.forEach(item => newSel.add(item.id));
    }
    setLocalSelection(newSel);
    setLastSelectedId(null);
  };

  const handleConfirm = () => {
    onSelectionChange(localSelection);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-fade-in">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-600" />
          </button>
          <span className="font-medium text-lg text-slate-800">Seleccionar fotos</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-blue-600">{localSelection.size} seleccionadas</span>
          <button 
            onClick={handleConfirm}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium transition-colors"
          >
            Añadir
          </button>
        </div>
      </header>
      
      <main className="flex-1 overflow-y-auto p-8 bg-white">
        <div className="max-w-6xl mx-auto">
          {groupedPhotos.length === 0 ? (
             <div className="text-center text-slate-400 py-20">No tienes fotos en tu cuenta aún.</div>
          ) : (
            groupedPhotos.map(group => (
              <div key={group.date} className="mb-8 group-container">
                <div className="relative flex items-center h-8 mb-1 group/header">
                  <button 
                    className={`absolute left-0 z-10 transition-opacity duration-0 ${group.items.every(item => localSelection.has(item.id)) ? 'opacity-100' : 'opacity-0 group-hover/header:opacity-100'}`}
                    onClick={() => toggleGroup(group.items)}
                  >
                    {group.items.every(item => localSelection.has(item.id)) ? <CheckCircle2 className="w-6 h-6 text-blue-500 fill-white" /> : <Circle className="w-6 h-6 text-slate-300 hover:text-slate-500" />}
                  </button>
                  <h3 className={`text-sm font-medium text-slate-500 capitalize transition-transform duration-0 ${group.items.every(item => localSelection.has(item.id)) ? 'translate-x-9' : 'translate-x-0 group-hover/header:translate-x-9'}`}>
                    {group.date}
                  </h3>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                  {group.items.map(photo => {
                    const isSelected = localSelection.has(photo.id);
                    return (
                      <div 
                        key={photo.id}
                        onClick={(e) => togglePhoto(photo.id, e)}
                        className={`relative aspect-square cursor-pointer overflow-hidden group transition-colors duration-0 ${isSelected ? 'bg-blue-100' : 'bg-slate-100'}`}
                      >
                        <button
                          className={`absolute top-2 left-2 z-20 transition-opacity duration-0 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePhoto(photo.id, e);
                          }}
                        >
                          {isSelected ? (
                            <CheckCircle2 className="w-7 h-7 text-white fill-blue-500" />
                          ) : (
                            <Circle className="w-7 h-7 text-white/70 hover:text-white fill-black/20" />
                          )}
                        </button>
                        {photo.mimeType?.startsWith('video/') ? (
                          <video
                            src={`/uploads/${photo.savedName}#t=0.1`}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            muted
                            playsInline
                          />
                        ) : (
                          <ProgressiveImage
                            src={`/uploads/${photo.thumbnailName || photo.savedName}`}
                            blurhash={photo.blurhash}
                            className={`h-full w-auto min-w-full object-cover transition-none ${isSelected ? '[clip-path:inset(12px_round_12px)]' : ''}`}
                            alt={photo.originalName}
                          />
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors z-10 pointer-events-none" />
                        {isSelected && <div className="absolute inset-0 bg-blue-500/10 z-10 pointer-events-none" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
