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
  Europe: "fill-blue-800/30",
  Asia: "fill-amber-800/30",
  Africa: "fill-green-800/30",
  "North America": "fill-red-800/30",
  "South America": "fill-purple-800/30",
  Oceania: "fill-teal-800/30",
};

/**
 * Stylized continent paths (decorative only).
 * Simplified silhouettes placed within the 0 0 1000 500 viewBox
 * using equirectangular-like placement. Not geographically precise.
 */
export const CONTINENT_PATHS: { name: string; d: string; region: string }[] = [
  {
    name: "Europe",
    d: "M470 45 L475 42 L482 40 L490 38 L498 40 L505 42 L512 40 L520 38 L528 40 L535 43 L542 45 L550 44 L558 42 L565 44 L572 47 L578 50 L582 54 L585 58 L588 62 L590 67 L592 72 L594 78 L592 83 L590 88 L588 93 L585 98 L582 103 L580 108 L578 113 L575 118 L572 123 L568 128 L565 132 L560 136 L555 140 L550 143 L545 146 L540 148 L535 150 L530 152 L525 154 L520 155 L515 156 L510 157 L505 158 L500 160 L495 162 L490 164 L485 166 L480 168 L475 166 L470 164 L466 160 L463 156 L460 152 L458 148 L456 144 L454 140 L452 135 L451 130 L450 125 L451 120 L452 115 L454 110 L456 105 L458 100 L460 95 L462 90 L464 85 L465 80 L466 75 L467 70 L468 65 L469 60 L469 55 L470 50 Z",
    region: "Europe",
  },
  {
    name: "Asia",
    d: "M580 30 L590 28 L600 27 L612 28 L625 30 L638 32 L650 30 L662 28 L675 30 L688 33 L700 35 L712 34 L725 36 L738 38 L750 40 L760 43 L768 46 L775 50 L780 54 L785 58 L790 63 L794 68 L797 73 L800 78 L802 84 L804 90 L805 96 L806 102 L805 108 L804 114 L802 120 L800 126 L797 132 L794 137 L790 142 L785 147 L780 152 L775 156 L770 160 L764 163 L758 166 L752 168 L745 170 L738 172 L730 174 L722 175 L714 176 L706 177 L698 178 L690 178 L682 177 L674 176 L666 174 L658 172 L650 170 L642 168 L635 165 L628 162 L621 158 L615 154 L610 150 L605 146 L600 142 L596 137 L593 132 L590 127 L588 122 L586 116 L584 110 L583 104 L582 98 L581 92 L580 86 L579 80 L578 74 L578 68 L578 62 L578 56 L578 50 L579 44 L579 38 L580 34 Z",
    region: "Asia",
  },
  {
    name: "Africa",
    d: "M462 185 L468 182 L474 180 L480 178 L486 177 L492 176 L498 175 L504 176 L510 177 L516 178 L522 180 L528 182 L534 185 L539 188 L543 192 L547 196 L550 200 L553 205 L555 210 L557 215 L558 220 L559 226 L560 232 L560 238 L559 244 L558 250 L557 256 L556 262 L554 268 L552 274 L550 280 L548 286 L545 292 L542 298 L539 304 L535 310 L531 316 L527 322 L523 327 L519 332 L515 336 L511 340 L507 344 L503 348 L499 352 L495 355 L491 352 L487 348 L484 344 L481 340 L478 335 L475 330 L473 325 L470 320 L468 314 L466 308 L465 302 L464 296 L463 290 L462 284 L461 278 L460 272 L459 266 L458 260 L458 254 L458 248 L458 242 L458 236 L459 230 L459 224 L460 218 L460 212 L461 206 L461 200 L462 194 L462 190 Z",
    region: "Africa",
  },
  {
    name: "North America",
    d: "M130 35 L140 32 L150 30 L162 28 L175 27 L188 28 L200 30 L212 32 L225 30 L237 28 L248 30 L258 33 L268 36 L276 40 L283 44 L289 48 L294 53 L298 58 L302 64 L305 70 L307 76 L309 82 L310 88 L311 95 L312 102 L312 110 L311 118 L310 126 L308 134 L306 140 L303 146 L300 152 L296 158 L292 163 L288 168 L283 173 L278 177 L273 181 L268 185 L262 188 L256 191 L250 194 L244 196 L238 198 L232 200 L226 202 L220 204 L214 205 L208 206 L202 207 L196 207 L190 206 L184 205 L178 203 L172 200 L166 197 L161 193 L156 189 L152 184 L148 179 L145 174 L142 168 L140 162 L138 156 L136 150 L135 144 L134 138 L133 132 L132 126 L131 120 L131 114 L131 108 L131 102 L131 96 L131 90 L131 84 L131 78 L130 72 L130 66 L130 60 L130 54 L130 48 L130 42 Z",
    region: "North America",
  },
  {
    name: "South America",
    d: "M268 230 L274 227 L280 225 L286 224 L292 223 L298 224 L304 226 L310 229 L315 233 L319 237 L322 242 L325 247 L327 252 L329 258 L330 264 L331 270 L332 276 L332 282 L331 288 L330 294 L329 300 L327 306 L325 312 L322 318 L319 324 L316 330 L313 336 L310 342 L306 348 L302 354 L298 360 L294 365 L290 370 L286 375 L282 380 L278 384 L274 388 L271 392 L268 396 L265 400 L262 403 L259 400 L256 396 L254 392 L252 388 L251 384 L250 380 L249 375 L248 370 L248 364 L248 358 L249 352 L250 346 L251 340 L253 334 L254 328 L256 322 L257 316 L259 310 L260 304 L261 298 L262 292 L263 286 L263 280 L264 274 L264 268 L265 262 L265 256 L266 250 L266 244 L267 238 L267 234 Z",
    region: "South America",
  },
  {
    name: "Oceania",
    d: "M780 290 L786 287 L792 285 L798 283 L804 282 L810 281 L816 280 L822 280 L828 281 L834 282 L840 283 L846 285 L852 287 L857 289 L862 292 L866 295 L870 298 L873 302 L876 306 L878 310 L880 314 L881 318 L882 322 L882 326 L882 330 L881 334 L880 338 L878 342 L876 345 L873 348 L870 351 L866 354 L862 356 L857 358 L852 360 L846 361 L840 362 L834 362 L828 362 L822 361 L816 360 L810 358 L804 356 L798 354 L792 351 L787 348 L783 345 L780 342 L777 338 L775 334 L773 330 L772 326 L771 322 L771 318 L772 314 L773 310 L775 306 L777 302 L779 298 L780 294 Z",
    region: "Oceania",
  },
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
