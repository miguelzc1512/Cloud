import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, Circle } from 'lucide-react';
import { ProgressiveImage } from '../../ProgressiveImage';

interface Person {
  id: string;
  name: string;
  coverFile?: string;
  coverBlurhash?: string;
}

interface SelectPeopleModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIds: Set<string>;
  onSelectionChange: (newSelection: Set<string>, peopleDetails: any[]) => void;
}

export default function SelectPeopleModal({ isOpen, onClose, selectedIds, onSelectionChange }: SelectPeopleModalProps) {
  const [localSelection, setLocalSelection] = useState<Set<string>>(new Set(selectedIds));
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLocalSelection(new Set(selectedIds));
      if (people.length === 0) {
        setLoading(true);
        fetch('/api/people')
          .then(res => res.json())
          .then(data => {
            setPeople(data);
            setLoading(false);
          })
          .catch(err => {
            console.error('Failed to load people', err);
            setLoading(false);
          });
      }
    }
  }, [isOpen, selectedIds, people.length]);

  if (!isOpen) return null;

  const togglePerson = (id: string) => {
    const newSel = new Set(localSelection);
    if (newSel.has(id)) {
      newSel.delete(id);
    } else {
      newSel.add(id);
    }
    setLocalSelection(newSel);
  };

  const handleSave = () => {
    onSelectionChange(localSelection);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white animate-in slide-in-from-bottom-8 duration-300">
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold text-slate-800 leading-tight">Seleccionar personas</h2>
            <span className="text-sm text-slate-500">{localSelection.size} seleccionadas</span>
          </div>
        </div>
        
        <button 
          onClick={() => {
            onSelectionChange(localSelection, people);
            onClose();
          }}
          disabled={localSelection.size === 0 && selectedIds.size === 0}
          className="bg-blue-600 text-white px-4 py-1.5 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {Array.from(localSelection).some(id => !selectedIds.has(id)) ? 'Añadir' : 'Hecho'}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : people.length === 0 ? (
          <div className="flex justify-center py-20 text-slate-500">
            No se encontraron personas
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 max-w-7xl mx-auto">
            {people.map(person => {
              const isSelected = localSelection.has(person.id);
              return (
                <div 
                  key={person.id} 
                  className={`flex flex-col items-center group cursor-pointer transition-transform duration-200 ${isSelected ? 'scale-95' : 'hover:scale-105'}`}
                  onClick={() => togglePerson(person.id)}
                >
                  <div className="relative w-24 h-24">
                    <div className={`relative w-full h-full rounded-full overflow-hidden bg-slate-200 ring-4 transition-all duration-300 ${isSelected ? 'ring-blue-500 shadow-md' : 'ring-transparent'}`}>
                      <ProgressiveImage
                        src={`/api/people/${person.id}/face?v=${person.coverFile}`}
                        blurhash={person.coverBlurhash}
                        className="w-full h-full object-cover"
                        alt={person.name}
                      />
                      <div className={`absolute inset-0 bg-black/0 transition-colors duration-300 ${isSelected ? 'bg-blue-500/10' : 'group-hover:bg-black/5'}`}></div>
                    </div>
                    
                    <div className={`absolute -top-1 -left-1 bg-white rounded-full shadow-sm z-10 transition-opacity duration-200 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                      {isSelected ? (
                        <CheckCircle2 className="w-6 h-6 text-blue-500 fill-blue-50" />
                      ) : (
                        <Circle className="w-6 h-6 text-white drop-shadow-md fill-black/20" />
                      )}
                    </div>
                  </div>
                  <span className="mt-3 text-sm font-medium text-slate-700 truncate max-w-full px-2 text-center">
                    {person.name}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
