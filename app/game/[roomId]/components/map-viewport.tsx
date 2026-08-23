"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface MapViewportHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

interface MapViewportProps {
  children: ReactNode;
}

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 500;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_FACTOR = 1.5;
const PAN_STEP = 50; // user units per arrow key press (divided by zoom)

/**
 * Clamp pan values so the visible area stays within the viewBox bounds.
 * With transform="scale(z) translate(px, py)":
 * - Visible content rect: [-px, -px + VIEW_WIDTH/z] × [-py, -py + VIEW_HEIGHT/z]
 * - Clamping: px in [-(VIEW_WIDTH - VIEW_WIDTH/z), 0], py in [-(VIEW_HEIGHT - VIEW_HEIGHT/z), 0]
 */
function clampPan(
  panX: number,
  panY: number,
  zoom: number
): { panX: number; panY: number } {
  const minPanX = -(VIEW_WIDTH - VIEW_WIDTH / zoom);
  const minPanY = -(VIEW_HEIGHT - VIEW_HEIGHT / zoom);
  return {
    panX: Math.min(0, Math.max(minPanX, panX)),
    panY: Math.min(0, Math.max(minPanY, panY)),
  };
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/**
 * MapViewport provides zoom/pan interaction for the SVG world map.
 * Renders a `<g>` wrapper with scale/translate transform.
 *
 * Interactions:
 * - Mouse wheel: zoom in/out (×1.5 per step, clamped [1, 4])
 * - Pointer drag: pan when zoomed in (disabled at zoom 1)
 * - Keyboard: +/- for zoom, arrow keys for pan
 * - Imperative handle: exposes zoomIn, zoomOut, reset for external buttons
 *
 * Pan is clamped so visible content stays within viewBox bounds.
 * When zoom === 1, pan is locked at (0, 0).
 *
 * Requirements: 8.1–8.8
 */
export const MapViewport = forwardRef<MapViewportHandle, MapViewportProps>(
  function MapViewport({ children }, ref) {
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  const gRef = useRef<SVGGElement>(null);
  const isDragging = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  // Expose imperative zoom/pan controls for external buttons
  useImperativeHandle(ref, () => ({
    zoomIn: () => setZoom((prev) => clampZoom(prev * ZOOM_FACTOR)),
    zoomOut: () => setZoom((prev) => clampZoom(prev / ZOOM_FACTOR)),
    reset: () => {
      setZoom(1);
      setPanX(0);
      setPanY(0);
    },
  }));

  // When zoom changes to 1, force pan to (0, 0)
  useEffect(() => {
    if (zoom === 1) {
      setPanX(0);
      setPanY(0);
    }
  }, [zoom]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<SVGGElement>) => {
      e.preventDefault();
      setZoom((prev) => {
        const newZoom = clampZoom(
          e.deltaY < 0 ? prev * ZOOM_FACTOR : prev / ZOOM_FACTOR
        );
        // If new zoom is 1, pan resets via useEffect
        return newZoom;
      });
    },
    []
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      if (zoom <= 1) return; // No drag at zoom 1
      isDragging.current = true;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [zoom]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      if (!isDragging.current) return;

      const dx = e.clientX - lastPointer.current.x;
      const dy = e.clientY - lastPointer.current.y;
      lastPointer.current = { x: e.clientX, y: e.clientY };

      // Convert screen delta to SVG content delta.
      // We need the SVG element's dimensions to map pixel movement to viewBox units.
      const svgEl = gRef.current?.ownerSVGElement;
      if (!svgEl) return;

      const rect = svgEl.getBoundingClientRect();
      // The viewBox is VIEW_WIDTH x VIEW_HEIGHT. The rendered size is rect.width x rect.height.
      // One pixel = VIEW_WIDTH / rect.width viewBox units (before zoom).
      // Pan is applied inside scale, so divide by zoom.
      const scaleX = VIEW_WIDTH / rect.width;
      const scaleY = VIEW_HEIGHT / rect.height;

      const deltaPanX = (dx * scaleX) / zoom;
      const deltaPanY = (dy * scaleY) / zoom;

      setPanX((prev) => {
        const next = prev + deltaPanX;
        return clampPan(next, 0, zoom).panX;
      });
      setPanY((prev) => {
        const next = prev + deltaPanY;
        return clampPan(0, next, zoom).panY;
      });
    },
    [zoom]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGGElement>) => {
      isDragging.current = false;
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    },
    []
  );

  // Keyboard handler: +/- for zoom, arrows for pan
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only handle if no input/textarea is focused
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      switch (e.key) {
        case "+":
        case "=": {
          e.preventDefault();
          setZoom((prev) => clampZoom(prev * ZOOM_FACTOR));
          break;
        }
        case "-": {
          e.preventDefault();
          setZoom((prev) => clampZoom(prev / ZOOM_FACTOR));
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          setZoom((currentZoom) => {
            if (currentZoom <= 1) return currentZoom;
            const step = PAN_STEP / currentZoom;
            setPanX((prev) => clampPan(prev + step, 0, currentZoom).panX);
            return currentZoom;
          });
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          setZoom((currentZoom) => {
            if (currentZoom <= 1) return currentZoom;
            const step = PAN_STEP / currentZoom;
            setPanX((prev) => clampPan(prev - step, 0, currentZoom).panX);
            return currentZoom;
          });
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setZoom((currentZoom) => {
            if (currentZoom <= 1) return currentZoom;
            const step = PAN_STEP / currentZoom;
            setPanY((prev) => clampPan(0, prev + step, currentZoom).panY);
            return currentZoom;
          });
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          setZoom((currentZoom) => {
            if (currentZoom <= 1) return currentZoom;
            const step = PAN_STEP / currentZoom;
            setPanY((prev) => clampPan(0, prev - step, currentZoom).panY);
            return currentZoom;
          });
          break;
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <g
      ref={gRef}
      transform={`scale(${zoom}) translate(${panX}, ${panY})`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: "none" }}
    >
      {/* Invisible interaction rect to catch events across full viewBox */}
      <rect
        x={0}
        y={0}
        width={VIEW_WIDTH}
        height={VIEW_HEIGHT}
        fill="transparent"
        aria-hidden="true"
      />
      {children}
    </g>
  );
  }
);
