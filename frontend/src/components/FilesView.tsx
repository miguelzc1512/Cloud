import React from 'react';
import { Folder, UploadCloud, Loader2, FileText } from 'lucide-react';

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
  handleDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  handleDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
};

export default function FilesView({
  files,
  isLoading,
  isUploading,
  handleDrop,
  handleDragOver,
  handleFileChange,
  fileInputRef
}: FilesViewProps) {
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const featuredFolders = [
    { name: 'Proyectos', color: 'text-blue-500' },
    { name: 'PDFs', color: 'text-indigo-500' },
    { name: 'Plantillas', color: 'text-sky-500' },
  ];

  return (
    <div className="max-w-6xl mx-auto w-full flex flex-col gap-6 h-full p-2">
      {/* Carpetas Destacadas */}
      <div>
        <h2 className="text-base font-medium text-slate-700 mb-4 px-1">Carpetas Destacadas</h2>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {featuredFolders.map((folder, i) => (
            <div 
              key={i} 
              className="flex flex-col items-center justify-center gap-2 w-32 h-28 rounded-2xl bg-white/80 backdrop-blur-md border border-white/60 shadow-sm hover:shadow-md hover:bg-white transition-all cursor-pointer flex-shrink-0 group"
            >
              <Folder className={`w-10 h-10 ${folder.color} fill-blue-50 group-hover:scale-105 transition-transform duration-300`} strokeWidth={1.5} />
              <span className="text-sm font-medium text-slate-700">{folder.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dropzone */}
      <div 
        className="w-full relative group cursor-pointer"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="absolute inset-0 bg-blue-50/50 rounded-2xl transform scale-[0.98] opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 pointer-events-none"></div>
        <div className="relative h-32 rounded-2xl border border-dashed border-slate-300/80 bg-white/50 hover:bg-white/70 backdrop-blur-md transition-all duration-300 flex flex-col items-center justify-center gap-3 shadow-sm group-hover:border-blue-400 group-hover:shadow-md">
          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              <p className="text-sm font-medium text-slate-600">Subiendo archivo...</p>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 rounded-full bg-white/80 shadow-sm flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                <UploadCloud className="w-6 h-6 text-blue-500" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">Arrastra un archivo aquí o haz clic para explorar</p>
              </div>
            </>
          )}
        </div>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
        />
      </div>

      {/* Finder-style List */}
      <div className="flex-1 flex flex-col min-h-0 bg-white/70 backdrop-blur-md rounded-2xl border border-white shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/50 bg-white/40">
          <h2 className="text-sm font-medium text-slate-800 flex items-center gap-2">
            Archivos Recientes
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </h2>
        </div>

        {/* List Columns Header */}
        <div className="grid grid-cols-12 gap-4 px-6 py-2 border-b border-slate-200/50 bg-slate-50/50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
          <div className="col-span-6 md:col-span-5">Nombre</div>
          <div className="col-span-3 hidden md:block">Fecha de subida</div>
          <div className="col-span-3 md:col-span-2">Tamaño</div>
          <div className="col-span-3 md:col-span-2">Tipo</div>
        </div>

        {/* List Body */}
        <div className="flex-1 overflow-y-auto">
          {files.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-3 opacity-70">
              <Folder className="w-12 h-12 stroke-1" />
              <p className="text-sm">Sin archivos</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {files.map((file, idx) => {
                const ext = file.originalName.split('.').pop()?.toUpperCase() || 'FILE';
                const dateStr = file.createdAt 
                  ? new Date(file.createdAt).toLocaleDateString(undefined, { 
                      year: 'numeric', month: 'short', day: 'numeric', 
                      hour: '2-digit', minute: '2-digit' 
                    }) 
                  : 'Desconocido';

                return (
                  <div 
                    key={file.id || idx} 
                    className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-slate-100/50 hover:bg-blue-50/60 transition-colors cursor-pointer group items-center text-sm"
                  >
                    <div className="col-span-6 md:col-span-5 flex items-center gap-3 truncate">
                      <FileText className="w-5 h-5 text-blue-400 shrink-0" strokeWidth={1.5} />
                      <span className="text-slate-700 font-medium truncate group-hover:text-blue-700 transition-colors">
                        {file.originalName}
                      </span>
                    </div>
                    <div className="col-span-3 hidden md:flex items-center text-slate-500 truncate">
                      {dateStr}
                    </div>
                    <div className="col-span-3 md:col-span-2 flex items-center text-slate-500 truncate">
                      {formatSize(file.size)}
                    </div>
                    <div className="col-span-3 md:col-span-2 flex items-center text-slate-400 text-xs font-medium truncate">
                      {ext}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
