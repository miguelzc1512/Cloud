import React from 'react';

export default function FileIcon({ filename, className = "w-6 h-6 shrink-0" }: { filename: string, className?: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  const getIconPath = () => {
    switch (ext) {
      case 'pdf': return '/icons/pdf.svg';
      
      case 'jpg': case 'jpeg': case 'png': case 'gif': case 'webp': case 'svg': case 'heic':
        return '/icons/foto.svg';
        
      case 'mp4': case 'mov': case 'avi': case 'mkv': case 'webm':
        return '/icons/video.svg';
        
      case 'doc': case 'docx': return '/icons/word.svg';
      case 'xls': case 'xlsx': case 'csv': return '/icons/excel.svg';
      case 'ppt': case 'pptx': return '/icons/powerpoint.svg';
      
      case 'zip': case 'rar': case '7z': case 'tar': case 'gz': return '/icons/comprimido.svg';
      
      case 'html': case 'css': case 'js': case 'jsx': case 'ts': case 'tsx': case 'json': case 'xml': 
        return '/icons/codigo.svg';
        
      case 'exe': case 'app': case 'dmg': return '/icons/ejecutable.svg';
      
      case 'ai': return '/icons/illustrator.svg';
      case 'psd': return '/icons/photoshop.svg';
      case 'indd': return '/icons/indesign.svg';
      case 'prproj': return '/icons/premiere.svg';
      
      case 'dwg': case 'dxf': return '/icons/autocad.svg';
      case 'blend': return '/icons/blender.svg';
      case 'gh': return '/icons/grasshopper.svg';
      case 'rvt': case 'rfa': return '/icons/revit.svg';
      case '3dm': return '/icons/rhino.svg';
      case 'ls8': case 'ls9': case 'ls10': case 'ls11': case 'ls12': return '/icons/lumion.svg';
      
      default:
        return '/icons/generico.svg';
    }
  };

  return <img src={getIconPath()} alt={`${ext} icon`} className={className} />;
}
