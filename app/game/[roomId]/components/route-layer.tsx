"use client";

import type {
  AdjacencyListEntry,
  Location,
  TransportType,
} from "@/lib/map/types";
import { projectToMap } from "@/lib/map/projection";

interface RouteLayerProps {
  adjacency: AdjacencyListEntry[];
  locations: Location[];
  blockedTransports: Set<TransportType>;
}

/**
 * Computes a quadratic bezier control point offset perpendicular to the
 * straight line between two endpoints by ~20 user units.
 */
function computeBezierControlPoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { cx: number; cy: number } {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) {
    return { cx: midX, cy: midY };
  }

  // Perpendicular normal: (-dy/length, dx/length)
  const nx = -dy / length;
  const ny = dx / length;

  return {
    cx: midX + 20 * nx,
    cy: midY + 20 * ny,
  };
}

/**
 * Route Layer component for the Shadow Hunt world map.
 * Renders edges between cities with visual style per transport type.
 * Deduplicates edges so each connection is drawn exactly once.
 *
 * Requirements: 5.1–5.7
 */
export function RouteLayer({
  adjacency,
  locations,
  blockedTransports,
}: RouteLayerProps) {
  // Build a lookup map from location id to projected coordinates
  const coordMap = new Map<string, { x: number; y: number }>();
  for (const loc of locations) {
    coordMap.set(loc.id, projectToMap(loc.latitude, loc.longitude));
  }

  // Deduplicate edges: track rendered pairs via Set keyed by sorted id pair
  const rendered = new Set<string>();
  const elements: React.ReactElement[] = [];

  for (const entry of adjacency) {
    for (const edge of entry.edges) {
      // Create a canonical key by sorting the two location ids
      const [idA, idB] = [entry.locationId, edge.targetLocationId].sort();
      const key = `${idA}-${idB}`;

      if (rendered.has(key)) continue;
      rendered.add(key);

      const pointA = coordMap.get(entry.locationId);
      const pointB = coordMap.get(edge.targetLocationId);

      if (!pointA || !pointB) continue;

      const isBlocked = blockedTransports.has(edge.transport);
      const blockedClass = isBlocked ? "opacity-30" : "";

      if (edge.transport === "car") {
        elements.push(
          <line
            key={key}
            x1={pointA.x}
            y1={pointA.y}
            x2={pointB.x}
            y2={pointB.y}
            className={`stroke-gray-500 ${blockedClass}`}
            strokeWidth={1}
          >
            {isBlocked && <title>blocked</title>}
          </line>
        );
      } else if (edge.transport === "boat") {
        elements.push(
          <line
            key={key}
            x1={pointA.x}
            y1={pointA.y}
            x2={pointB.x}
            y2={pointB.y}
            className={`stroke-blue-400 ${blockedClass}`}
            strokeWidth={1}
            strokeDasharray="6 4"
          >
            {isBlocked && <title>blocked</title>}
          </line>
        );
      } else if (edge.transport === "plane") {
        const { cx, cy } = computeBezierControlPoint(
          pointA.x,
          pointA.y,
          pointB.x,
          pointB.y
        );
        const d = `M ${pointA.x} ${pointA.y} Q ${cx} ${cy} ${pointB.x} ${pointB.y}`;

        elements.push(
          <path
            key={key}
            d={d}
            className={`stroke-amber-400 ${blockedClass}`}
            strokeWidth={1}
            fill="none"
          >
            {isBlocked && <title>blocked</title>}
          </path>
        );
      }
    }
  }

  return <g aria-hidden="true">{elements}</g>;
}
