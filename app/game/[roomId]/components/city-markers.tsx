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
 * City Markers component for the Shadow Hunt world map.
 * Renders hub locations as larger circles with a thick stroke ring,
 * and non-hub locations as smaller circles with thin stroke.
 * Marker radii and strokes scale by 1/zoom for constant visual size.
 *
 * When move selection is active (isViewerTurn && !isSubmitting), legal
 * move destinations receive an emerald highlight ring and become
 * clickable/keyboard-activatable.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 6.1–6.6
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
        const fillClass = regionColors[regionName] ?? "fill-gray-600";
        const isHub = location.isHub;
        const isLegalMove = legalMoveIds.has(location.id);
        const isHighlighted = interactionEnabled && isLegalMove;

        const radius = isHub ? 8 / zoom : 4 / zoom;
        const strokeWidth = isHub ? 2 / zoom : 1 / zoom;
        const highlightRingRadius = radius + 3 / zoom;
        const highlightStrokeWidth = 2 / zoom;

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
            {/* Highlight ring for legal move destinations */}
            {isHighlighted && (
              <circle
                cx={x}
                cy={y}
                r={highlightRingRadius}
                className="fill-none stroke-emerald-400"
                strokeWidth={highlightStrokeWidth}
                aria-hidden="true"
              />
            )}
            {/* Main marker */}
            <circle
              cx={x}
              cy={y}
              r={radius}
              className={`${fillClass} stroke-gray-300 ${isHighlighted ? "cursor-pointer" : "cursor-default"}`}
              strokeWidth={strokeWidth}
              role="button"
              aria-label={isHighlighted ? `Move to ${location.name}` : location.name}
              aria-disabled={!isHighlighted}
              tabIndex={isHighlighted ? 0 : -1}
              onClick={isHighlighted ? handleActivate : undefined}
              onKeyDown={isHighlighted ? handleKeyDown : undefined}
            />
          </g>
        );
      })}
    </g>
  );
}
