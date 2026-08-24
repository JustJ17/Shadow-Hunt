"use client";

import type { Location, Region } from "@/lib/map/types";
import { projectToMap } from "@/lib/map/projection";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

interface CityMarkersProps {
  locations: Location[];
  regions: Region[];
  regionColors: Record<string, string>;
  zoom?: number;
  legalMoveIds?: Set<string>;
  isViewerTurn?: boolean;
  isSubmitting?: boolean;
  onMoveSelect?: (targetLocationId: string) => void;
}

/**
 * Solid fill colors per region for city markers.
 * Provides strong contrast against the dark map background.
 */
const SOLID_REGION_FILLS: Record<string, string> = {
  Europe: "fill-blue-400",
  Asia: "fill-amber-400",
  Africa: "fill-green-400",
  "North America": "fill-red-400",
  "South America": "fill-purple-400",
  Oceania: "fill-teal-400",
};

/**
 * City Markers component for the Shadow Hunt world map.
 * Renders hub locations as larger circles with a thick stroke ring and glow,
 * and non-hub locations as smaller circles with thin stroke and glow.
 * Marker radii and strokes scale by 1/zoom for constant visual size.
 * Hub cities always display name labels; non-hub labels appear at zoom > 1.5.
 *
 * When move selection is active (isViewerTurn && !isSubmitting), legal
 * move destinations receive an animated pulsing highlight ring and become
 * clickable/keyboard-activatable.
 *
 * Requirements: 2.4, 2.7, 2.9, 2.10, 2.12, 2.13, 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 6.1–6.6
 */
export function CityMarkers({
  locations,
  regions,
  regionColors,
  zoom = 1,
  legalMoveIds = new Set(),
  isViewerTurn = false,
  isSubmitting = false,
  onMoveSelect,
}: CityMarkersProps) {
  // Build regionId → region name lookup
  const regionIdToName = new Map<string, string>();
  for (const region of regions) {
    regionIdToName.set(region.id, region.name);
  }

  const interactionEnabled = isViewerTurn && !isSubmitting;

  return (
    <g>
      {locations.map((location) => {
        const { x, y } = projectToMap(location.latitude, location.longitude);
        const regionName = regionIdToName.get(location.regionId) ?? "";
        const solidFill = SOLID_REGION_FILLS[regionName] ?? "fill-gray-400";
        const isHub = location.isHub;
        const isLegalMove = legalMoveIds.has(location.id);
        const isHighlighted = interactionEnabled && isLegalMove;

        const radius = isHub ? 9 / zoom : 5 / zoom;
        const strokeWidth = isHub ? 2.5 / zoom : 1.5 / zoom;
        const highlightRingRadius = radius + 4 / zoom;
        const highlightStrokeWidth = 2.5 / zoom;

        // Show labels: hubs always, non-hubs only at zoom > 1.5
        const showLabel = isHub || zoom > 1.5;

        const handleActivate = () => {
          if (isHighlighted && onMoveSelect) {
            onMoveSelect(location.id);
          }
        };

        const handleKeyDown = (e: ReactKeyboardEvent<SVGCircleElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleActivate();
          }
        };

        return (
          <g key={location.id}>
            {/* Highlight ring for legal move destinations — animated pulse */}
            {isHighlighted && (
              <circle
                cx={x}
                cy={y}
                r={highlightRingRadius}
                className="fill-none stroke-emerald-400 pulse-highlight"
                strokeWidth={highlightStrokeWidth}
                aria-hidden="true"
              />
            )}
            {/* Main marker with glow effect */}
            <circle
              cx={x}
              cy={y}
              r={radius}
              className={`${solidFill} stroke-gray-300 ${isHighlighted ? "cursor-pointer" : "cursor-default"}`}
              strokeWidth={strokeWidth}
              filter="url(#city-glow)"
              role="button"
              aria-label={isHighlighted ? `Move to ${location.name}` : location.name}
              aria-disabled={!isHighlighted}
              tabIndex={isHighlighted ? 0 : -1}
              onClick={isHighlighted ? handleActivate : undefined}
              onKeyDown={isHighlighted ? handleKeyDown : undefined}
            />
            {/* City name label */}
            {showLabel && (
              <text
                x={x}
                y={y + radius + 10 / zoom}
                fontSize={isHub ? 10 / zoom : 8 / zoom}
                fill="white"
                textAnchor="middle"
                className="pointer-events-none select-none"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                aria-hidden="true"
              >
                {location.name}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}
