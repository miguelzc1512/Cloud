import React from 'react';
import { Smartphone, HardDrive, Laptop } from 'lucide-react';

export default function DocDevicesView() {
  return (
    <div className="h-[calc(100vh-5rem)] overflow-y-auto p-10 flex flex-col items-center justify-center animate-in fade-in duration-300 relative bg-slate-50/50">
      <div className="flex -space-x-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center z-10">
          <Smartphone className="w-8 h-8 text-slate-400" />
        </div>
        <div className="w-16 h-16 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center z-20 scale-110">
          <Laptop className="w-8 h-8 text-blue-500" />
        </div>
        <div className="w-16 h-16 rounded-full bg-white border border-slate-200 shadow-md flex items-center justify-center z-10">
          <HardDrive className="w-8 h-8 text-slate-400" />
        </div>
      </div>
      
      <h2 className="text-2xl font-bold text-slate-800 mb-3 tracking-tight">Mis Dispositivos</h2>
      <p className="text-slate-500 text-center max-w-md leading-relaxed">
        Próximamente podrás ver y gestionar los respaldos de archivos organizados por cada uno de tus dispositivos (Mac, Windows, iPhone, etc).
      </p>
      
      <div className="mt-8 px-4 py-2 bg-blue-50 text-blue-600 rounded-full text-sm font-medium border border-blue-100">
        En desarrollo
      </div>
    </div>
  );
}
