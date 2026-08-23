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
const CONTINENT_PATHS: { name: string; d: string; region: string }[] = [
  {
    name: "Europe",
    d: "M480 80 L500 70 L530 75 L560 80 L570 100 L565 120 L550 140 L530 150 L510 145 L490 130 L480 110 Z",
    region: "Europe",
  },
  {
    name: "Asia",
    d: "M570 60 L620 50 L680 55 L740 70 L780 90 L790 120 L770 150 L740 170 L700 180 L660 175 L620 160 L590 140 L575 110 L570 80 Z",
    region: "Asia",
  },
  {
    name: "Africa",
    d: "M470 200 L490 185 L520 180 L545 185 L555 210 L550 250 L540 290 L525 320 L505 340 L490 330 L480 300 L470 260 L465 230 Z",
    region: "Africa",
  },
  {
    name: "North America",
    d: "M150 80 L200 70 L260 75 L300 90 L320 120 L310 150 L280 180 L250 200 L220 210 L190 200 L160 170 L140 140 L145 110 Z",
    region: "North America",
  },
  {
    name: "South America",
    d: "M280 250 L300 235 L320 240 L330 265 L325 300 L310 340 L290 370 L270 380 L260 360 L265 320 L270 280 Z",
    region: "South America",
  },
  {
    name: "Oceania",
    d: "M780 280 L820 270 L860 275 L880 290 L875 310 L860 325 L830 330 L800 320 L785 305 L780 290 Z",
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
