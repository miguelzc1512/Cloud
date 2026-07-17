import { useMemo, useState, useEffect } from 'react';
import { APIProvider, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import PhotosView from '../../PhotosView';

export type MapFileData = {
  id: string;
  originalName: string;
  savedName: string;
  thumbnailName?: string;
  blurhash?: string;
  mimeType: string;
  size: number;
  createdAt: string;
  takenAt?: string;
  latitude?: number;
  longitude?: number;
};

type MapViewProps = {
  files: MapFileData[];
  onDelete?: (id: string) => void;
  onBulkDelete?: (ids: string[]) => void;
};

const HeatmapLayer = ({ points }: { points: [number, number, number][] }) => {
  const map = useMap();
  const visualization = useMapsLibrary('visualization');

  useEffect(() => {
    if (!map || !visualization) return;

    const data = points.map(p => ({
      location: new google.maps.LatLng(p[0], p[1]),
      weight: p[2]
    }));

    const heatmap = new visualization.HeatmapLayer({
      data,
      radius: 25,
      opacity: 0.50,
      gradient: [
        'rgba(150, 0, 255, 0)',     // Transparente morado (borde)
        'rgba(150, 0, 255, 1)',     // Morado sólido
        'rgba(0, 255, 255, 1)',     // Cyan
        'rgba(255, 255, 0, 1)',     // Amarillo
        'rgba(255, 0, 255, 1)',     // Rosa
        'rgba(255, 100, 100, 1)'    // Rojo suave
      ]
    });

    heatmap.setMap(map);

    return () => {
      heatmap.setMap(null);
    };
  }, [map, visualization, points]);

  return null;
};

export default function MapView({ files, onDelete, onBulkDelete }: MapViewProps) {
  const [bounds, setBounds] = useState<google.maps.LatLngBounds | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const geolocatedFiles = useMemo(() => {
    return files.filter(f => f.latitude != null && f.longitude != null);
  }, [files]);

  const heatmapPoints = useMemo<[number, number, number][]>(() => {
    // Reducimos el peso de 20 a 1 para que el calor se acumule de forma natural y sutil
    return geolocatedFiles.map(f => [f.latitude!, f.longitude!, 1]);
  }, [geolocatedFiles]);

  const visibleFiles = useMemo(() => {
    if (!bounds) return geolocatedFiles;

    // Extraemos el JSON seguro para evitar usar clases de google.maps si no están listas
    const b = bounds.toJSON();
    return geolocatedFiles.filter(f => {
      const lat = f.latitude!;
      const lng = f.longitude!;

      const inLng = b.west <= b.east
        ? (lng >= b.west && lng <= b.east)
        : (lng >= b.west || lng <= b.east);

      return lat >= b.south && lat <= b.north && inLng;
    });
  }, [geolocatedFiles, bounds]);

  if (geolocatedFiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 bg-slate-50">
        <div className="text-center">
          <h3 className="text-lg font-medium text-slate-700">No hay ubicaciones</h3>
          <p className="mt-1">Tus fotos no tienen coordenadas de GPS guardadas.</p>
        </div>
      </div>
    );
  }

  const center = {
    lat: geolocatedFiles[0].latitude!,
    lng: geolocatedFiles[0].longitude!
  };

  return (
    <div className="w-[calc(100%+5rem)] h-[calc(100%+5rem)] -m-10 flex flex-col bg-white overflow-hidden animate-fade-in relative">
      {/* Map Section */}
      <div 
        className="relative z-0 shrink-0 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ height: `${100 - (isExpanded ? 85 : 30)}%` }}
        onMouseDownCapture={() => setIsExpanded(false)}
        onWheelCapture={() => setIsExpanded(false)}
        onTouchStartCapture={() => setIsExpanded(false)}
      >
        {/* La API Key ahora se carga desde el archivo .env para protegerla */}
        <APIProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ""} version="3.64" libraries={['visualization']}>
          <Map
            defaultCenter={center}
            defaultZoom={4}
            minZoom={3} // Evita alejar demasiado el mapa (mundos repetidos)
            gestureHandling={'greedy'}
            disableDefaultUI={false}
            mapTypeControl={false} // Quita la opción de satélite
            streetViewControl={false} // Quita el monito de street view
            fullscreenControl={false} // Quita el botón de pantalla completa
            mapId="DEMO_MAP_ID"
            onBoundsChanged={(e) => {
              // Si la galería está expandida, "congelamos" los límites para que no desaparezcan las fotos
              if (!isExpanded) {
                setBounds(e.map.getBounds()!);
              }
            }}
            onTilesLoaded={(e) => {
              if (!bounds) {
                setBounds(e.map.getBounds()!);
              }
            }}
          >
            <HeatmapLayer points={heatmapPoints} />
          </Map>
        </APIProvider>
      </div>

      {/* Bottom Gallery Section */}
      <div 
        className="bg-white relative shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.15)] z-10 shrink-0 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ height: `${isExpanded ? 85 : 30}%` }}
        onWheelCapture={() => setIsExpanded(true)}
        onTouchMoveCapture={() => setIsExpanded(true)}
      >
        <div className="absolute inset-0 px-9 pb-10 pt-4">
          {visibleFiles.length > 0 ? (
            <PhotosView
              files={visibleFiles as any}
              onDelete={onDelete}
              onBulkDelete={onBulkDelete}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50">

              <p className="text-sm font-medium">No hay fotos visibles en esta área</p>
              <p className="text-xs mt-0.5 opacity-70">Desplázate por el mapa para explorar más ubicaciones</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
