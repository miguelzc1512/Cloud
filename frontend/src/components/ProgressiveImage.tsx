import React, { useState, useLayoutEffect } from 'react';
import { BlurhashCanvas } from 'react-blurhash';

interface ProgressiveImageProps {
  src: string;
  blurhash?: string;
  thumbnailSrc?: string;
  width?: number | string;
  height?: number | string;
  className?: string;
  alt?: string;
  objectFit?: 'cover' | 'contain';
}

export const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  blurhash,
  thumbnailSrc,
  width = '100%',
  height = '100%',
  className = '',
  alt = '',
  objectFit
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isThumbLoaded, setIsThumbLoaded] = useState(false);
  const [wasCached, setWasCached] = useState(false);

  useLayoutEffect(() => {
    let isMounted = true;
    
    const img = new Image();
    img.src = src;
    
    if (img.complete) {
      setIsLoaded(true);
      setWasCached(true);
    } else {
      setIsLoaded(false);
      img.onload = () => {
        if (isMounted) setIsLoaded(true);
      };
    }

    let thumb: HTMLImageElement | null = null;
    if (thumbnailSrc) {
      thumb = new Image();
      thumb.src = thumbnailSrc;
      if (thumb.complete) {
        setIsThumbLoaded(true);
      } else {
        setIsThumbLoaded(false);
        thumb.onload = () => {
          if (isMounted) setIsThumbLoaded(true);
        };
      }
    }

    return () => {
      isMounted = false;
      img.src = 'data:,';
      if (thumb) thumb.src = 'data:,';
    };
  }, [src, thumbnailSrc]);

  return (
    <>
      {/* Blurhash Placeholder - Se expandirá al ancestro relative (PhotoItem) */}
      {blurhash && !isLoaded && !isThumbLoaded && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1, overflow: 'hidden' }}>
          <BlurhashCanvas
            hash={blurhash}
            width={32}
            height={32}
            punch={1}
            style={{ width: '100%', height: '100%', objectFit }}
          />
        </div>
      )}

      {/* Layer 2: Thumbnail Placeholder (carga instantánea desde caché) */}
      {thumbnailSrc && (
        <img
          src={thumbnailSrc}
          alt={alt}
          className={className}
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 2,
            ...(objectFit ? { objectFit, width: '100%', height: '100%' } : {})
          }}
        />
      )}
      
      {/* The Actual Image (Layer 3) */}
      <img
        src={isLoaded ? src : undefined}
        alt={alt}
        loading="lazy"
        className={className}
        style={{
          opacity: isLoaded ? 1 : 0,
          transition: wasCached ? 'none' : 'opacity 0.3s ease-in-out',
          zIndex: 3,
          position: 'relative',
          ...(objectFit ? { objectFit, width: '100%', height: '100%' } : {})
        }}
      />
    </>
  );
};
