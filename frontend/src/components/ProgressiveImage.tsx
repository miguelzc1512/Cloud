import React, { useState } from 'react';
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

export const ProgressiveImage: React.FC<ProgressiveImageProps> = React.memo(({
  src,
  blurhash,
  className = '',
  alt = '',
  objectFit
}) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <>
      {/* Blurhash Placeholder */}
      {blurhash && !isLoaded && (
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

      {/* Optimized Single Native Lazy Image */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        className={className}
        style={{
          opacity: isLoaded || !blurhash ? 1 : 0,
          transition: 'opacity 0.2s ease-in-out',
          zIndex: 2,
          position: 'relative',
          ...(objectFit ? { objectFit, width: '100%', height: '100%' } : {})
        }}
      />
    </>
  );
});
