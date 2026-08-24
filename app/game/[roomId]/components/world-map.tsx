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
    d: "M470 68 L472 65 L476 62 L480 60 L485 58 L490 56 L496 55 L502 54 L507 52 L510 50 L514 48 L518 46 L523 44 L528 43 L534 44 L540 46 L545 48 L548 46 L552 44 L558 42 L563 43 L567 46 L570 50 L573 54 L576 52 L580 50 L584 52 L586 56 L588 60 L590 64 L592 68 L594 72 L592 76 L589 80 L586 84 L584 88 L580 90 L576 92 L572 96 L568 100 L565 104 L562 108 L558 112 L555 116 L550 118 L546 120 L542 124 L538 128 L534 130 L530 128 L526 130 L522 134 L518 138 L515 142 L512 146 L509 150 L506 154 L502 156 L498 158 L494 160 L490 162 L486 164 L482 166 L478 168 L474 166 L470 162 L467 158 L464 154 L462 150 L460 146 L458 142 L456 138 L455 134 L454 130 L453 126 L452 122 L452 118 L453 114 L454 110 L456 106 L458 102 L460 98 L461 94 L462 90 L464 86 L465 82 L466 78 L468 74 L469 70 Z",
    region: "Europe",
  },
  {
    name: "Asia",
    d: "M588 38 L595 36 L602 34 L610 33 L618 32 L626 34 L634 36 L642 35 L650 33 L658 32 L666 34 L674 36 L682 38 L690 37 L698 36 L706 38 L714 40 L722 42 L730 44 L738 46 L744 48 L750 50 L756 53 L760 56 L764 60 L768 64 L772 68 L776 72 L780 76 L784 72 L788 68 L792 70 L794 74 L796 78 L798 82 L800 86 L798 90 L796 94 L792 98 L788 102 L784 106 L780 110 L776 114 L772 118 L768 122 L765 126 L762 130 L758 134 L754 138 L750 142 L746 146 L742 150 L738 154 L734 158 L728 160 L722 162 L716 164 L710 166 L704 168 L698 170 L692 168 L686 166 L680 164 L674 162 L668 160 L662 158 L656 155 L650 152 L644 150 L638 148 L632 146 L626 144 L620 142 L614 140 L608 138 L602 136 L598 132 L594 128 L592 124 L590 120 L588 116 L586 112 L585 108 L584 104 L583 100 L582 96 L582 92 L582 88 L583 84 L584 80 L585 76 L586 72 L586 68 L586 64 L586 60 L586 56 L586 52 L587 48 L587 44 L588 40 Z",
    region: "Asia",
  },
  {
    name: "Africa",
    d: "M458 180 L464 178 L470 176 L476 175 L482 174 L488 173 L494 172 L500 172 L506 173 L512 174 L518 176 L524 178 L530 180 L536 183 L540 186 L544 190 L548 194 L550 198 L552 202 L554 206 L556 210 L558 214 L559 218 L560 222 L560 226 L558 230 L555 234 L552 238 L550 242 L548 246 L547 250 L548 254 L550 258 L552 262 L554 266 L555 270 L556 274 L555 278 L554 282 L552 286 L550 290 L548 294 L545 298 L542 302 L539 306 L536 310 L532 314 L528 318 L524 322 L520 326 L516 330 L512 334 L508 338 L505 342 L502 346 L500 350 L497 354 L494 350 L492 346 L490 342 L488 338 L486 334 L484 330 L482 326 L480 322 L478 318 L476 314 L474 310 L472 306 L470 302 L468 298 L466 294 L464 290 L463 286 L462 282 L461 278 L460 274 L459 270 L458 266 L457 262 L456 258 L456 254 L456 250 L456 246 L456 242 L456 238 L456 234 L456 230 L456 226 L456 222 L456 218 L456 214 L456 210 L456 206 L456 202 L456 198 L456 194 L456 190 L457 186 L458 182 Z",
    region: "Africa",
  },
  {
    name: "North America",
    d: "M120 40 L126 38 L132 36 L138 34 L144 32 L150 30 L158 28 L166 27 L174 28 L182 30 L190 32 L198 30 L206 28 L214 27 L222 28 L230 30 L238 33 L244 36 L250 34 L256 32 L262 34 L268 37 L274 40 L280 44 L284 48 L288 52 L292 56 L296 60 L300 64 L302 68 L304 72 L305 76 L306 80 L306 84 L305 88 L304 92 L302 96 L300 100 L297 104 L294 108 L290 112 L286 116 L282 120 L278 124 L274 128 L270 132 L266 136 L262 140 L258 144 L254 148 L250 152 L246 156 L242 160 L238 164 L234 168 L230 172 L226 176 L222 180 L218 184 L215 188 L212 192 L210 196 L208 200 L204 198 L200 196 L196 194 L192 192 L188 190 L184 188 L180 186 L176 183 L172 180 L168 176 L164 172 L160 168 L156 164 L152 160 L148 156 L144 152 L140 148 L137 144 L134 140 L132 136 L130 132 L128 128 L126 124 L125 120 L124 116 L123 112 L122 108 L121 104 L120 100 L120 96 L120 92 L120 88 L120 84 L120 80 L120 76 L120 72 L120 68 L120 64 L120 60 L120 56 L120 52 L120 48 L120 44 Z",
    region: "North America",
  },
  {
    name: "South America",
    d: "M262 222 L268 220 L274 218 L280 217 L286 216 L292 217 L298 218 L304 220 L310 222 L316 225 L320 228 L324 232 L328 236 L331 240 L334 244 L336 248 L338 252 L339 256 L340 260 L340 264 L340 268 L339 272 L338 276 L336 280 L334 284 L332 288 L330 292 L327 296 L324 300 L321 304 L318 308 L315 312 L312 316 L309 320 L306 324 L303 328 L300 332 L297 336 L294 340 L291 344 L288 348 L285 352 L282 356 L279 360 L276 364 L273 368 L271 372 L269 376 L267 380 L265 384 L263 388 L261 392 L259 396 L257 392 L255 388 L254 384 L253 380 L252 376 L252 372 L252 368 L252 364 L253 360 L254 356 L255 352 L256 348 L257 344 L258 340 L259 336 L259 332 L260 328 L260 324 L260 320 L260 316 L260 312 L260 308 L260 304 L260 300 L260 296 L260 292 L260 288 L260 284 L260 280 L260 276 L260 272 L260 268 L260 264 L260 260 L260 256 L260 252 L260 248 L260 244 L260 240 L260 236 L260 232 L261 228 L261 224 Z",
    region: "South America",
  },
  {
    name: "Oceania",
    d: "M770 280 L776 278 L782 276 L788 275 L794 274 L800 273 L806 272 L812 272 L818 273 L824 274 L830 276 L836 278 L840 280 L844 278 L848 276 L852 274 L856 275 L860 277 L864 280 L868 283 L872 286 L876 290 L879 294 L882 298 L884 302 L886 306 L887 310 L888 314 L888 318 L887 322 L886 326 L884 330 L882 334 L879 338 L876 342 L872 345 L868 348 L864 350 L860 352 L856 354 L852 356 L848 358 L844 360 L840 361 L836 362 L832 362 L828 361 L824 360 L820 358 L816 356 L812 354 L808 352 L804 350 L800 348 L796 346 L792 344 L788 342 L784 340 L780 338 L777 336 L774 334 L772 332 L770 330 L768 326 L767 322 L766 318 L766 314 L766 310 L767 306 L768 302 L769 298 L770 294 L770 290 L770 286 L770 282 Z",
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
