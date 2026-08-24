"use client";

import { useRef } from "react";
import type { MapData, TransportType } from "@/lib/map/types";
import { MapViewport, type MapViewportHandle } from "./map-viewport";
import { RouteLayer } from "./route-layer";
import { CityMarkers } from "./city-markers";
import { PlayerTokens } from "./player-tokens";

interface PlayerOnMap {
  id: string;
  displayName: string;
  locationId: string;
  turnPosition: number;
}

interface ActiveBlockade {
  id: string;
  transport: TransportType;
  casterPlayerId: string;
}

interface WorldMapProps {
  mapData: MapData;
  players: PlayerOnMap[];
  viewerPlayerId: string;
  activeBlockades: ActiveBlockade[];
  // Forward to CityMarkers for move interaction
  legalMoveIds?: Set<string>;
  isViewerTurn?: boolean;
  isSubmitting?: boolean;
  onMoveSelect?: (targetLocationId: string) => void;
}

/**
 * Region name → Tailwind fill class for region tinting.
 * Used by continent paths, city markers, and route layers for visual grouping.
 */
export const REGION_COLORS: Record<string, string> = {
  Europe: "fill-blue-800/40",
  Asia: "fill-amber-800/40",
  Africa: "fill-green-800/40",
  "North America": "fill-red-800/40",
  "South America": "fill-purple-800/40",
  Oceania: "fill-teal-800/40",
};


/**
 * Approximate center coordinates for each region label.
 * Calculated from the centroid of city positions in each region.
 */
const REGION_CENTERS: Record<string, { x: number; y: number }> = {
  Europe: { x: 525, y: 125 },
  Asia: { x: 800, y: 190 },
  Africa: { x: 540, y: 250 },
  "North America": { x: 255, y: 165 },
  "South America": { x: 320, y: 295 },
  Oceania: { x: 950, y: 330 },
};

/**
 * Stylized continent paths (decorative only).
 * Simplified silhouettes placed within the 0 0 1000 500 viewBox
 * using equirectangular-like placement. Not geographically precise.
 */
export const CONTINENT_PATHS: { name: string; d: string; region: string }[] = [
  {
    name: "Europe",
    d: "M450 85 L460 80 L475 78 L490 76 L505 75 L520 74 L535 76 L550 78 L565 80 L580 85 L590 92 L595 100 L596 110 L594 120 L590 130 L585 140 L580 148 L572 155 L562 162 L550 167 L538 170 L525 172 L512 170 L500 168 L488 165 L476 160 L466 155 L458 148 L452 140 L448 130 L446 120 L446 110 L448 100 L450 92 Z",
    region: "Europe",
  },
  {
    name: "Asia",
    d: "M690 120 L710 115 L730 112 L750 110 L770 112 L790 115 L810 118 L830 120 L850 118 L870 120 L890 125 L905 132 L910 142 L912 155 L910 170 L905 185 L900 200 L895 215 L890 230 L882 245 L872 258 L860 268 L845 275 L828 278 L810 280 L790 278 L770 275 L750 270 L732 265 L718 258 L707 248 L700 238 L695 225 L692 210 L690 195 L688 180 L688 165 L690 150 L690 135 Z",
    region: "Asia",
  },
  {
    name: "Africa",
    d: "M470 145 L485 140 L500 138 L515 140 L530 142 L545 145 L560 148 L575 152 L590 158 L600 165 L608 175 L612 188 L614 202 L612 218 L608 235 L604 252 L600 268 L595 284 L588 300 L580 315 L570 328 L558 340 L545 350 L530 356 L515 358 L500 355 L488 348 L478 338 L470 325 L464 310 L460 295 L458 278 L456 260 L455 242 L455 225 L456 208 L458 192 L462 178 L466 165 L468 155 Z",
    region: "Africa",
  },
  {
    name: "North America",
    d: "M200 105 L215 100 L230 98 L248 97 L265 98 L280 100 L295 105 L308 112 L315 122 L318 132 L316 145 L312 158 L306 170 L298 182 L290 194 L280 206 L270 216 L258 225 L245 232 L230 235 L215 233 L202 228 L192 220 L185 210 L180 198 L178 185 L178 172 L180 160 L184 148 L188 138 L193 128 L198 118 L200 110 Z",
    region: "North America",
  },
  {
    name: "South America",
    d: "M270 220 L285 215 L300 213 L315 215 L330 218 L345 222 L358 228 L368 236 L375 248 L378 260 L378 275 L375 290 L370 305 L365 318 L358 332 L348 345 L338 355 L325 362 L312 365 L298 362 L285 358 L275 350 L268 340 L263 328 L260 315 L258 300 L258 285 L260 270 L262 255 L265 242 L268 232 Z",
    region: "South America",
  },
  {
    name: "Oceania",
    d: "M895 282 L910 278 L925 276 L940 275 L955 276 L970 278 L982 282 L992 288 L1000 296 L1005 308 L1005 320 L1002 332 L998 344 L992 354 L983 362 L972 368 L958 372 L942 373 L926 372 L912 368 L900 362 L892 354 L888 344 L886 332 L886 320 L888 308 L892 296 Z",
    region: "Oceania",
  }
];

/**
 * SVG World Map component for the Shadow Hunt in-game screen.
 * Renders the interactive map with continent paths, routes, city markers, and player tokens.
 * Composes sub-components in document order: continents → routes → markers → tokens.
 *
 * Requirements: 4.1–4.6
 */
export function WorldMap({
  mapData,
  players,
  viewerPlayerId,
  activeBlockades,
  legalMoveIds,
  isViewerTurn,
  isSubmitting,
  onMoveSelect,
}: WorldMapProps) {
  const viewportRef = useRef<MapViewportHandle>(null);

  // Determine which transport types are blocked for the viewer
  const viewerBlockedTransports = new Set<TransportType>(
    activeBlockades
      .filter((b) => b.casterPlayerId !== viewerPlayerId)
      .map((b) => b.transport)
  );

  // Flatten all locations for sub-components
  const allLocations = mapData.regions.flatMap((r) => r.locations);

  return (
    <div className="relative bg-gray-900 w-full h-full">
      <svg
        viewBox="0 0 1000 500"
        role="img"
        aria-label="World map"
        className="w-full h-full"
      >
        {/* Shared SVG filter definitions and animations */}
        <defs>
          {/* City node radial glow effect */}
          <filter id="city-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Player token subtle drop shadow */}
          <filter id="token-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* Pulse animation for reachable-destination highlights */}
        <style>{`
          @keyframes pulse-ring {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 1; }
          }
          .pulse-highlight {
            animation: pulse-ring 1.5s ease-in-out infinite;
          }
        `}</style>

        <MapViewport ref={viewportRef}>
          {/* Decorative continent silhouettes */}
          <g aria-hidden="true">
            {CONTINENT_PATHS.map((continent) => (
              <path
                key={continent.name}
                d={continent.d}
                className={`${REGION_COLORS[continent.region]} stroke-gray-700 stroke-[0.5]`}
              />
            ))}
            {/* Region name labels */}
            {Object.entries(REGION_CENTERS).map(([name, pos]) => (
              <text
                key={`label-${name}`}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                fontSize={14}
                className="fill-gray-500/60 pointer-events-none select-none"
                fontWeight="bold"
                letterSpacing="2"
              >
                {name.toUpperCase()}
              </text>
            ))}
          </g>

          {/* Route connections between cities */}
          <RouteLayer
            adjacency={mapData.adjacency}
            locations={allLocations}
            blockedTransports={viewerBlockedTransports}
          />

          {/* City markers (hubs and non-hubs) */}
          <CityMarkers
            locations={allLocations}
            regions={mapData.regions}
            regionColors={REGION_COLORS}
            legalMoveIds={legalMoveIds}
            isViewerTurn={isViewerTurn}
            isSubmitting={isSubmitting}
            onMoveSelect={onMoveSelect}
          />

          {/* Animated player tokens */}
          <PlayerTokens
            players={players}
            viewerPlayerId={viewerPlayerId}
            locations={allLocations}
          />
        </MapViewport>
      </svg>

      {/* On-screen zoom control buttons (Requirement 8.6) */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button
          className="w-8 h-8 rounded-md bg-gray-800/80 hover:bg-gray-700 text-white text-lg flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Zoom in"
          onClick={() => viewportRef.current?.zoomIn()}
        >
          +
        </button>
        <button
          className="w-8 h-8 rounded-md bg-gray-800/80 hover:bg-gray-700 text-white text-lg flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Zoom out"
          onClick={() => viewportRef.current?.zoomOut()}
        >
          &minus;
        </button>
        <button
          className="w-8 h-8 rounded-md bg-gray-800/80 hover:bg-gray-700 text-white text-sm flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Reset view"
          onClick={() => viewportRef.current?.reset()}
        >
          &#x21ba;
        </button>
      </div>
    </div>
  );
}
