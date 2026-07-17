import React, { useEffect, useState, useRef, useCallback } from 'react';

type Marker = {
  id: string;
  type: 'year' | 'month';
  label: string;
  year: string;
  month: string;
  topProgress: number; // 0 to 1
  offsetTop: number;
};

type TimelineScrollbarProps = {
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  dependencies: any[]; // To trigger recalculation when groups change
};

export default function TimelineScrollbar({ scrollContainerRef, dependencies }: TimelineScrollbarProps) {
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverY, _setHoverY] = useState<number | null>(null);
  const hoverYRef = useRef<number | null>(null);
  const setHoverY = useCallback((val: number | null) => {
    hoverYRef.current = val;
    _setHoverY(val);
  }, []);

  const [activeMarker, setActiveMarker] = useState<Marker | null>(null);
  const [dragProgress, setDragProgress] = useState<number>(0);
  
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoverThumbRef = useRef<HTMLDivElement>(null);
  const scrollThumbRef = useRef<HTMLDivElement>(null);
  const visibilityTimeoutRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false); // Ref for synchronous access in events

  // Calculate markers based on DOM elements
  const calculateMarkers = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const elements = Array.from(container.querySelectorAll('.group-container'));
    if (elements.length === 0) return;

    const periods: { year: string, month: string, monthId: string, offsetTop: number }[] = [];
    const seenMonths = new Set<string>();

    elements.forEach((el) => {
      const dateStr = el.getAttribute('data-date');
      if (!dateStr) return;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return;

      const year = date.getFullYear().toString();
      const monthRaw = date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
      const month = monthRaw.charAt(0).toUpperCase() + monthRaw.slice(1);
      const monthId = `${year}-${date.getMonth()}`;

      if (!seenMonths.has(monthId)) {
        seenMonths.add(monthId);
        periods.push({
          year,
          month,
          monthId,
          offsetTop: (el as HTMLElement).offsetTop
        });
      }
    });

    if (periods.length === 0) return;

    const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
    const trackHeight = Math.max(100, container.clientHeight - 100);
    const MIN_GAP_YEAR = 22 / trackHeight; // 22px of visual gap between years
    const MIN_GAP_MONTH = 14 / trackHeight; // 14px of visual gap between months for text
    
    const rawMarkers: Marker[] = [];
    const seenYears = new Set<string>();

    periods.forEach((period) => {
      // Map physical offset to visual scrollbar progress exactly
      const topProgress = Math.min(1.0, period.offsetTop / maxScroll);
      
      if (!seenYears.has(period.year)) {
        seenYears.add(period.year);
        rawMarkers.push({
          id: `y-${period.year}`,
          type: 'year',
          label: period.year,
          year: period.year,
          month: period.month,
          topProgress,
          offsetTop: period.offsetTop
        });
      } else {
        rawMarkers.push({
          id: `m-${period.monthId}`,
          type: 'month',
          label: '•',
          year: period.year,
          month: period.month,
          topProgress,
          offsetTop: period.offsetTop
        });
      }
    });

    const finalMarkers: Marker[] = [];
    
    // Extract years and resolve year collisions
    const yearMarkers = rawMarkers.filter(m => m.type === 'year');
    
    // Forward pass to push overlapping years down
    let lastY = -1;
    yearMarkers.forEach(m => {
      if (m.topProgress < lastY + MIN_GAP_YEAR) {
        m.topProgress = lastY + MIN_GAP_YEAR;
      }
      lastY = m.topProgress;
    });
    
    // Backward pass if the last year got pushed beyond 100%
    if (yearMarkers.length > 0 && yearMarkers[yearMarkers.length - 1].topProgress > 1.0) {
      yearMarkers[yearMarkers.length - 1].topProgress = 1.0;
      for (let i = yearMarkers.length - 2; i >= 0; i--) {
        const m1 = yearMarkers[i];
        const m2 = yearMarkers[i+1];
        if (m1.topProgress > m2.topProgress - MIN_GAP_YEAR) {
          m1.topProgress = m2.topProgress - MIN_GAP_YEAR;
        }
      }
    }

    finalMarkers.push(...yearMarkers);

    // Insert month markers ONLY if they don't visually collide with existing markers
    const monthMarkers = rawMarkers.filter(m => m.type === 'month');
    monthMarkers.forEach(month => {
      let isTooClose = false;
      for (const existing of finalMarkers) {
        // Use a larger bounding box around years to prevent month dots from merging into the text
        const gap = existing.type === 'year' ? MIN_GAP_YEAR : MIN_GAP_MONTH;
        if (Math.abs(existing.topProgress - month.topProgress) < gap) {
          isTooClose = true;
          break;
        }
      }
      
      if (!isTooClose) {
        finalMarkers.push(month);
      }
    });

    // Sort by visual progress so interpolation logic flows monotonically
    finalMarkers.sort((a, b) => a.topProgress - b.topProgress);

    setMarkers(finalMarkers);
  }, [scrollContainerRef]);

  // Recalculate on mount and when dependencies (like grid items) change
  useEffect(() => {
    // Wait a tick for the DOM to render the groups
    const timer = setTimeout(calculateMarkers, 100);
    return () => clearTimeout(timer);
  }, [dependencies, calculateMarkers]);

  // Handle visibility timeout
  const showScrollbar = useCallback(() => {
    setIsVisible(true);
    if (visibilityTimeoutRef.current) {
      clearTimeout(visibilityTimeoutRef.current);
    }
    visibilityTimeoutRef.current = window.setTimeout(() => {
      if (!isDraggingRef.current) {
        setIsVisible(false);
      }
    }, 1500);
  }, []);

  // Helper to find closest marker
  const getClosestMarker = useCallback((progress: number) => {
    if (markers.length === 0) return null;
    let closest = markers[0];
    for (let i = 0; i < markers.length; i++) {
      if (markers[i].topProgress <= progress + 0.02) {
        closest = markers[i];
      } else {
        break;
      }
    }
    return closest;
  }, [markers]);

  // Sync scroll position
  const handleContainerScroll = useCallback(() => {
    if (isDraggingRef.current) return;
    showScrollbar();
    
    const container = scrollContainerRef.current;
    if (container && markers.length > 0) {
      const maxScroll = Math.max(1, container.scrollHeight - container.clientHeight);
      const scrollTop = container.scrollTop;
      const progress = Math.min(1.0, Math.max(0, scrollTop / maxScroll));
      
      setDragProgress(progress);
      if (scrollThumbRef.current) {
        scrollThumbRef.current.style.top = `${progress * 100}%`;
      }
      
      // Update active marker ONLY if we are not hovering with the mouse
      if (hoverYRef.current === null) {
        setActiveMarker(getClosestMarker(progress));
      }
    }
  }, [scrollContainerRef, showScrollbar, getClosestMarker]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleContainerScroll);
      return () => container.removeEventListener('scroll', handleContainerScroll);
    }
  }, [handleContainerScroll, scrollContainerRef]);

  const handleDrag = useCallback((clientY: number) => {
    if (!scrollbarRef.current || !scrollContainerRef.current) return;
    if (markers.length === 0) return;
    
    const rect = scrollbarRef.current.getBoundingClientRect();
    let y = clientY - rect.top;
    y = Math.max(0, Math.min(y, rect.height));
    
    const progress = y / rect.height; // 0 to 1
    const maxScroll = Math.max(1, scrollContainerRef.current.scrollHeight - scrollContainerRef.current.clientHeight);
    const targetScrollTop = progress * maxScroll;

    setDragProgress(progress);
    if (scrollThumbRef.current) {
      scrollThumbRef.current.style.top = `${progress * 100}%`;
    }
    if (tooltipRef.current) {
      tooltipRef.current.style.top = `${clientY}px`;
    }
    
    setActiveMarker(getClosestMarker(progress));

    // Scroll the container instantly
    const container = scrollContainerRef.current;
    container.scrollTo({ top: targetScrollTop, behavior: 'auto' });
  }, [markers, scrollContainerRef]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) {
        handleDrag(e.clientY);
        setHoverY(e.clientY);
        if (tooltipRef.current) tooltipRef.current.style.top = `${e.clientY}px`;
        showScrollbar();
      } else {
        // Show scrollbar if mouse is near the right edge (within 50px)
        if (window.innerWidth - e.clientX < 50) {
          showScrollbar();
        }
      }
    };
    
    const onMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setIsDragging(false);
        showScrollbar(); // Trigger timeout to hide
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [handleDrag, showScrollbar]);

  if (markers.length === 0) return null;

  return (
    <div 
      className={`fixed top-24 right-0 bottom-4 w-16 z-[90] transition-opacity duration-300 ${isVisible || isDragging ? 'opacity-100' : 'opacity-0'}`}
      onMouseEnter={() => showScrollbar()}
    >
      {/* Invisible wider hit area for dragging */}
      <div 
        ref={scrollbarRef}
        className="absolute top-0 right-0 bottom-0 w-24 cursor-ns-resize"
        onMouseDown={(e) => {
          e.preventDefault();
          isDraggingRef.current = true;
          setIsDragging(true);
          handleDrag(e.clientY);
          setHoverY(e.clientY);
        }}
        onMouseMove={(e) => {
          if (!isDragging) {
            setHoverY(e.clientY);
            if (tooltipRef.current) tooltipRef.current.style.top = `${e.clientY}px`;
            showScrollbar();
            
            // Highlight the exact month we are hovering over
            const rect = e.currentTarget.getBoundingClientRect();
            let y = e.clientY - rect.top;
            y = Math.max(0, Math.min(y, rect.height));
            const progress = y / rect.height;
            setActiveMarker(getClosestMarker(progress));
          }
        }}
        onMouseLeave={() => {
          if (!isDragging) {
            setHoverY(null);
            // Revert activeMarker back to physical scroll position
            setActiveMarker(getClosestMarker(dragProgress));
          }
        }}
        onClick={(e) => {
          // If it was just a click (not drag), scroll smoothly
          if (!isDraggingRef.current && scrollContainerRef.current) {
             const rect = e.currentTarget.getBoundingClientRect();
             const progress = (e.clientY - rect.top) / rect.height;
             const container = scrollContainerRef.current;
             const scrollHeight = container.scrollHeight - container.clientHeight;
             container.scrollTo({ top: progress * scrollHeight, behavior: 'smooth' });
          }
        }}
      >
        {/* Markers */}
        <div className="absolute top-0 right-2 bottom-0 w-12 pointer-events-none">
          {markers.map((marker) => {
            const isActiveYear = activeMarker?.year === marker.year;
            return (
              <div 
                key={marker.id}
                className="absolute right-0 flex items-center justify-end w-full"
                style={{ top: `${marker.topProgress * 100}%`, transform: 'translateY(-50%)' }}
              >
                {marker.type === 'year' ? (
                  <span className={`text-[12px] select-none transition-all duration-200 px-2 z-10 ${isActiveYear ? 'font-bold text-[#1a73e8] dark:text-[#8ab4f8] scale-110' : 'font-medium text-slate-400 dark:text-slate-500'}`}>
                    {marker.label}
                  </span>
                ) : (
                  <div className="relative flex items-center justify-end w-full px-2 h-full">
                    {/* DOT (Visible only when idle) */}
                    <div className={`absolute right-3 w-[4px] h-[4px] rounded-full transition-all duration-300 ${isVisible || isDragging ? 'opacity-0 scale-50' : 'opacity-100 scale-100'} ${activeMarker?.id === marker.id ? 'bg-[#8ab4f8]' : 'bg-slate-500/50 dark:bg-slate-500/40'}`} />
                    
                    {/* TEXT (Visible only when hovered/dragging) */}
                    <span className={`text-[10.5px] select-none transition-all duration-300 absolute right-2 ${isVisible || isDragging ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-2'} ${activeMarker?.id === marker.id ? 'font-bold text-[#1a73e8] dark:text-[#8ab4f8]' : 'font-medium text-slate-400/90 dark:text-slate-500/90'}`}>
                      {marker.month}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          
          {/* Current Scroll Indicator (Where I am) */}
          <div 
            ref={scrollThumbRef}
            className="absolute right-0 w-full flex items-center justify-end"
            style={{ top: `${dragProgress * 100}%`, transform: 'translateY(-50%)' }}
          >
            <div className="w-[10px] h-[2px] bg-slate-400/80 mr-2 rounded-full" />
          </div>
        </div>
      </div>

      {/* Tooltip Float & Mouse Indicator (Where my mouse is) */}
      <div 
        ref={tooltipRef}
        className={`fixed right-6 z-[95] pointer-events-none transition-opacity duration-200 ${
          activeMarker && (isDragging || hoverY !== null) ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ 
          top: hoverY !== null ? hoverY : `${(dragProgress * 100)}%`, 
          transform: 'translateY(-100%)' 
        }}
      >
        {activeMarker && hoverY !== null && (
          <div className="flex flex-col items-end">
            <div className="bg-[#202124] text-white text-[13px] font-medium px-3 py-1 shadow-md rounded-t-lg flex items-center gap-1.5">
              <span className="capitalize">{activeMarker.month}</span>
              <span className="text-white/80">{activeMarker.year}</span>
            </div>
            {/* The horizontal blue line that connects to the scrollbar */}
            <div className="h-[2px] bg-[#8ab4f8] w-24 rounded-l-full" />
          </div>
        )}
      </div>
    </div>
  );
}
