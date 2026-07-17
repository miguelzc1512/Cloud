import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Loader2, Folder, Pencil, Trash2, Users } from 'lucide-react';
import PhotosView from '../../PhotosView';
import SelectPeopleModal from './SelectPeopleModal';

interface AlbumDetailViewProps {
  albumId: string;
  onBack: () => void;
  setCustomHeader?: (header: React.ReactNode | null) => void;
}

const AlbumHeaderTitle = ({ initialName, onBack, onUpdateName, onEditPeople }: any) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(initialName);

  const handleSave = async () => {
    if (name.trim() === '' || name.trim() === initialName) {
      setIsEditing(false);
      setName(initialName);
      return;
    }
    await onUpdateName(name.trim());
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-3 w-full max-w-md">
        <button onClick={onBack} className="p-2 -ml-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <input 
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') { setIsEditing(false); setName(initialName); } }}
          onBlur={handleSave}
          className="flex-1 bg-white border border-blue-200 text-slate-800 px-3 py-1.5 rounded-lg outline-none focus:ring-2 focus:ring-blue-100 text-xl font-semibold"
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={onBack} className="p-2 -ml-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors shrink-0">
        <ArrowLeft className="w-5 h-5" />
      </button>
      <span className="truncate cursor-pointer hover:text-blue-600 transition-colors flex items-center gap-2 group" onClick={() => setIsEditing(true)}>
        {initialName}
        <div className="bg-slate-100 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
          <Pencil className="w-3.5 h-3.5 text-slate-600" />
        </div>
      </span>
      <button 
        onClick={onEditPeople} 
        className="ml-auto p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors flex items-center justify-center shrink-0"
        title="Editar personas del álbum"
      >
        <Users className="w-5 h-5" />
      </button>
    </div>
  );
};

const AlbumDetailView: React.FC<AlbumDetailViewProps> = ({ albumId, onBack, setCustomHeader }) => {
  const [album, setAlbum] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [albumPeople, setAlbumPeople] = useState<Set<string>>(new Set());
  const [isPeopleModalOpen, setIsPeopleModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  useEffect(() => {
    const fetchAlbumDetails = async () => {
      try {
        setLoading(true);
        const [albumRes, filesRes, peopleRes] = await Promise.all([
          fetch(`http://localhost:3001/api/albums/${albumId}`),
          fetch(`http://localhost:3001/api/albums/${albumId}/files`),
          fetch(`http://localhost:3001/api/albums/${albumId}/people`)
        ]);

        if (!albumRes.ok || !filesRes.ok || !peopleRes.ok) {
          throw new Error('Error al cargar el álbum');
        }

        const albumData = await albumRes.json();
        const filesData = await filesRes.json();
        const peopleData = await peopleRes.json();

        setAlbum(albumData);
        setFiles(filesData);
        setAlbumPeople(new Set(peopleData));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    fetchAlbumDetails();
    
    return () => {
      if (setCustomHeader) setCustomHeader(null);
    }
  }, [albumId, onBack]);

  useEffect(() => {
    if (album && setCustomHeader) {
      setCustomHeader(
        <div className="flex-1 flex">
          <AlbumHeaderTitle 
            initialName={album.name} 
            onBack={onBack} 
            onEditPeople={() => setIsPeopleModalOpen(true)}
            onUpdateName={async (newName: string) => {
              const res = await fetch(`http://localhost:3001/api/albums/${albumId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
              });
              if (res.ok) {
                setAlbum((prev: any) => ({ ...prev, name: newName }));
              }
            }} 
          />
        </div>
      );
    }
  }, [album?.name, albumId, onBack, setCustomHeader]);

  const handleRemoveFromAlbum = async (ids: string[], clearSelection: () => void) => {
    try {
      const res = await fetch(`http://localhost:3001/api/albums/${albumId}/files`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileIds: ids })
      });
      if (res.ok) {
        setFiles(prev => prev.filter(f => !ids.includes(f.id)));
      }
    } catch (e) {
      console.error(e);
    }
    clearSelection();
    setDropdownOpen(false);
  };

  const handleMoveToTrash = async (ids: string[], clearSelection: () => void) => {
    try {
      await Promise.all(ids.map(id => 
        fetch(`http://localhost:3001/api/files/${id}`, { method: 'DELETE' })
      ));
      setFiles(prev => prev.filter(f => !ids.includes(f.id)));
    } catch (e) {
      console.error(e);
    }
    clearSelection();
    setDropdownOpen(false);
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex items-center px-4 py-3 border-b border-slate-200">
          <button onClick={onBack} className="p-2 mr-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex items-center px-4 py-3 border-b border-slate-200">
          <button onClick={onBack} className="p-2 mr-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
          <Folder className="w-16 h-16 text-slate-300 mb-4" />
          <p className="text-lg font-medium text-slate-700">Álbum no encontrado</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in h-full w-full">
      <PhotosView 
        files={files} 
        renderSelectionActions={(selectedIds, clearSelection) => (
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="text-slate-500 hover:text-red-600 p-2.5 rounded-full hover:bg-red-50 transition-colors"
              title="Eliminar"
            >
              <Trash2 className="w-6 h-6" />
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-lg border border-slate-200/60 overflow-hidden z-50 animate-fade-in">
                <button 
                  onClick={() => handleRemoveFromAlbum(selectedIds, clearSelection)}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Remover del álbum
                </button>
                <button 
                  onClick={() => handleMoveToTrash(selectedIds, clearSelection)}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors border-t border-slate-100"
                >
                  Eliminar foto
                </button>
              </div>
            )}
          </div>
        )}
      />
      <SelectPeopleModal 
        isOpen={isPeopleModalOpen}
        onClose={() => setIsPeopleModalOpen(false)}
        selectedIds={albumPeople}
        onSelectionChange={async (newSelection) => {
          try {
            const res = await fetch(`http://localhost:3001/api/albums/${albumId}/people`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ personIds: Array.from(newSelection) })
            });
            if (res.ok) {
              setAlbumPeople(newSelection);
              // Refetch files in case dynamic photos changed
              const filesRes = await fetch(`http://localhost:3001/api/albums/${albumId}/files`);
              const filesData = await filesRes.json();
              setFiles(filesData);
            }
          } catch (e) {
            console.error('Failed to update album people:', e);
          }
        }}
      />
    </div>
  );
};

export default AlbumDetailView;
