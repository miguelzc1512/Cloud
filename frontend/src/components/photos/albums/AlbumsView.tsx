import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Folder, Loader2, Image as ImageIcon, MoreVertical, Pencil, Trash2, Share2 } from 'lucide-react';
import CreateAlbumView from './CreateAlbumView';
import AlbumDetailView from './AlbumDetailView';
import { ProgressiveImage } from '../../ProgressiveImage';

export interface Album {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  coverFiles?: { id: string; savedName: string; thumbnailName?: string; blurhash?: string }[];
  photoCount?: number;
  createdAt: string;
}

const AlbumCoverCarousel = ({ files }: { files: NonNullable<Album['coverFiles']> }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (files.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % files.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [files.length]);

  if (files.length === 0) return null;

  return (
    <>
      {files.map((file, idx) => (
        <div
          key={file.id}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            idx === currentIndex ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <ProgressiveImage
            src={`/api/media/${file.id}/thumbnail`}
            blurhash={file.blurhash}
            alt="Album cover"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ))}
    </>
  );
};

interface AlbumsViewProps {
  files?: any[];
  setCustomHeader?: (header: React.ReactNode | null) => void;
}

const AlbumsView: React.FC<AlbumsViewProps> = ({ files = [], setCustomHeader }) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activeAlbumId, setActiveAlbumId] = useState<string | null>(null);
  
  const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const handleDeleteAlbum = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    if (!window.confirm('¿Estás seguro de eliminar este álbum?')) return;
    try {
      const res = await fetch(`/api/albums/${id}`, { method: 'DELETE' });
      if (res.ok) fetchAlbums();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRenameAlbum = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    setEditingAlbumId(id);
    setEditingName(currentName);
  };

  const saveRenamedAlbum = async (id: string) => {
    setEditingAlbumId(null);
    if (!editingName || editingName.trim() === '') return;
    
    // Optimistic update
    setAlbums(albums.map(a => a.id === id ? { ...a, name: editingName.trim() } : a));
    
    try {
      const res = await fetch(`/api/albums/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() })
      });
      if (!res.ok) fetchAlbums(); // revert if error
    } catch (err) {
      console.error(err);
      fetchAlbums();
    }
  };

  const fetchAlbums = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/albums');
      if (!response.ok) {
        throw new Error('Failed to fetch albums');
      }
      const data = await response.json();
      setAlbums(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlbums();
  }, []);

  const handleCreateAlbum = async (name: string, description: string, localFiles: File[], existingIds: string[], personIds: string[]) => {
    try {
      // 1. Si hay archivos locales, subirlos primero
      let uploadedIds: string[] = [];
      if (localFiles.length > 0) {
        // En un caso real, harías múltiples peticiones a /api/upload
        // y recogerías los IDs devueltos
        const uploadPromises = localFiles.map(async (file) => {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          return data.id;
        });
        uploadedIds = await Promise.all(uploadPromises);
      }

      const allFileIds = [...existingIds, ...uploadedIds];

      const res = await fetch('/api/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, fileIds: allFileIds, personIds })
      });

      if (!res.ok) {
        throw new Error('Failed to create album');
      }

      await fetchAlbums();
      setIsCreating(false);
    } catch (err) {
      console.error('Error creating album:', err);
      throw err; 
    }
  };

  const handleBackFromAlbum = useCallback(() => {
    setActiveAlbumId(null);
    if (setCustomHeader) setCustomHeader(null);
  }, [setCustomHeader]);

  // Asegurarnos de limpiar el header si regresamos a la vista normal
  useEffect(() => {
    if (!activeAlbumId && setCustomHeader) {
      setCustomHeader(null);
    }
  }, [activeAlbumId, setCustomHeader]);

  if (loading && albums.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isCreating) {
    return (
      <CreateAlbumView 
        files={files}
        onClose={() => setIsCreating(false)} 
        onSubmit={handleCreateAlbum} 
      />
    );
  }

  if (activeAlbumId) {
    return (
      <AlbumDetailView 
        albumId={activeAlbumId} 
        onBack={handleBackFromAlbum}
        setCustomHeader={setCustomHeader}
      />
    );
  }

  return (
    <div className="flex h-full flex-col animate-fade-in -mx-10 -mt-10 pt-10 px-10">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-10">
        {error && (
          <div className="mb-6 rounded-2xl bg-red-50/50 p-4 text-sm text-red-600 backdrop-blur-xl">
            {error}
          </div>
        )}

        {albums.length === 0 && !loading && !error ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-slate-500">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 shadow-inner">
              <Folder className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-lg font-medium text-slate-700">Aún no hay álbumes</p>
            <p className="text-sm text-slate-400 mt-1 mb-6">Crea tu primer álbum para organizar tus fotos.</p>
            <button
              onClick={() => setIsCreating(true)}
              className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-full hover:bg-blue-700 transition-colors shadow-sm"
            >
              Crear nuevo álbum
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {/* Create New Album Card */}
            <div
              onClick={() => setIsCreating(true)}
              className="group relative cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed border-slate-300 bg-transparent flex flex-col items-center justify-center transition-all hover:border-blue-400 hover:bg-blue-50/50"
            >
              <div className="flex flex-col items-center justify-center p-8">
                <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                  <Plus className="h-6 w-6 text-blue-600" />
                </div>
                <span className="font-medium text-blue-600">Crear álbum</span>
              </div>
            </div>

            {albums.map((album) => (
              <div
                key={album.id}
                onClick={() => {
                  if (editingAlbumId !== album.id) {
                    setActiveAlbumId(album.id);
                  }
                }}
                className="group relative cursor-pointer rounded-3xl border border-gray-200/50 bg-white shadow-sm transition-all hover:shadow-md"
              >
                {/* More Options Button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === album.id ? null : album.id); }}
                  className={`absolute right-3 top-3 p-1 transition-all z-20 ${
                    openMenuId === album.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <MoreVertical className="w-6 h-6 text-white drop-shadow-[0_0_3px_rgba(0,0,0,0.8)]" />
                </button>

                {/* Dropdown Menu */}
                {openMenuId === album.id && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }} />
                    <div className="absolute right-4 top-12 w-56 bg-white border border-slate-100 rounded-xl shadow-xl shadow-slate-200/50 py-1.5 z-40 animate-fade-in">
                      <button
                        onClick={(e) => handleRenameAlbum(album.id, album.name, e)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[15px] text-slate-700 hover:bg-slate-50 transition-colors text-left"
                      >
                        Cambiar nombre del álbum
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[15px] text-slate-700 hover:bg-slate-50 transition-colors text-left"
                      >
                        Compartir álbum
                      </button>
                      <button
                        onClick={(e) => handleDeleteAlbum(album.id, e)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-[15px] text-red-600 hover:bg-red-50 transition-colors text-left"
                      >
                        Eliminar álbum
                      </button>
                    </div>
                  </>
                )}

                {/* Album Cover */}
                <div className="relative aspect-square w-full overflow-hidden bg-gray-100 rounded-t-3xl">
                  {album.coverFiles && album.coverFiles.length > 0 ? (
                    <AlbumCoverCarousel files={album.coverFiles} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-400">
                      <ImageIcon className="h-12 w-12 opacity-50" />
                    </div>
                  )}
                  {/* Overlay for Apple-like glossy effect */}
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/5 opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                
                {/* Album Info */}
                <div className="p-4">
                  {editingAlbumId === album.id ? (
                    <input
                      type="text"
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => saveRenamedAlbum(album.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          saveRenamedAlbum(album.id);
                        } else if (e.key === 'Escape') {
                          setEditingAlbumId(null);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full font-medium text-slate-900 border-b-2 border-blue-500 bg-transparent outline-none pb-0.5"
                    />
                  ) : (
                    <h3 className="truncate font-medium text-slate-900 pr-2">
                      {album.name}
                    </h3>
                  )}
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                    <span>{album.photoCount || 0} fotos</span>
                    {album.description && (
                      <>
                        <span>•</span>
                        <span className="truncate">{album.description}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AlbumsView;
