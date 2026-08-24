"use client";

import type { Location } from "@/lib/map/types";
import { projectToMap } from "@/lib/map/projection";

interface PlayerOnMap {
  id: string;
  displayName: string;
  locationId: string;
  turnPosition: number;
}

interface PlayerTokensProps {
  players: PlayerOnMap[];
  viewerPlayerId: string;
  locations: Location[];
  zoom?: number;
}

/**
 * Deterministic cluster offsets indexed by turnPosition (1-based).
 * When multiple players share a location, each is displaced by OFFSETS[turnPosition - 1].
 * Minimum separation between any two offsets exceeds 6 user units.
 */
const OFFSETS = [
  { dx: 0, dy: -8 },
  { dx: 7, dy: 4 },
  { dx: -7, dy: 4 },
  { dx: 0, dy: 8 },
];

/** Distinct fill colors per player, indexed by turnPosition (1-based). */
const PLAYER_COLORS = [
  "fill-cyan-400",
  "fill-rose-400",
  "fill-emerald-400",
  "fill-amber-300",
];

/**
 * Player Tokens component for the Shadow Hunt world map.
 * Renders one animated token per player, positioned at their location with
 * cluster offsets for co-located players. The viewer's token gets a highlight ring.
 *
 * CSS transitions animate token movement between locations. Reduced motion
 * media query disables animation for accessibility.
 *
 * Requirements: 7.1–7.9
 */
export function PlayerTokens({
  players,
  viewerPlayerId,
  locations,
  zoom = 1,
}: PlayerTokensProps) {
  // Build locationId → coordinates lookup
  const coordsById = new Map<string, { latitude: number; longitude: number }>();
  for (const loc of locations) {
    coordsById.set(loc.id, { latitude: loc.latitude, longitude: loc.longitude });
  }

  // Determine cluster sizes: locationId → count of players at that location
  const clusterSizes = new Map<string, number>();
  for (const player of players) {
    clusterSizes.set(
      player.locationId,
      (clusterSizes.get(player.locationId) ?? 0) + 1
    );
  }

  return (
    <g>
      {/* Reduced motion style: sets --token-move-duration to 0ms */}
      <style>{`
        .player-token {
          --token-move-duration: 600ms;
        }
        @media (prefers-reduced-motion: reduce) {
          .player-token {
            --token-move-duration: 0ms;
          }
        }
      `}</style>

      {players.map((player) => {
        const coords = coordsById.get(player.locationId);
        if (!coords) return null;

        const { x, y } = projectToMap(coords.latitude, coords.longitude);

        // Apply cluster offset only when multiple players share the location
        const clusterSize = clusterSizes.get(player.locationId) ?? 1;
        const offset =
          clusterSize > 1
            ? OFFSETS[(player.turnPosition - 1) % OFFSETS.length]
            : { dx: 0, dy: 0 };

        const tx = x + offset.dx;
        const ty = y + offset.dy;

        const isViewer = player.id === viewerPlayerId;
        const colorClass =
          PLAYER_COLORS[(player.turnPosition - 1) % PLAYER_COLORS.length];

        const ariaLabel = `${player.displayName}${isViewer ? " (you)" : ""}`;

        return (
          <g
            key={player.id}
            className="player-token"
            style={{
              transform: `translate(${tx}px, ${ty}px)`,
              transition: `transform var(--token-move-duration, 600ms) ease-out`,
            }}
            aria-label={ariaLabel}
          >
            <title>{player.displayName}</title>
            {/* Viewer highlight ring (outer) */}
            {isViewer && (
              <circle
                r={14 / zoom}
                fill="none"
                stroke="white"
                strokeWidth={3.5 / zoom}
                className="pulse-highlight"
              />
            )}
            {/* Player token circle */}
            <circle
              r={9 / zoom}
              className={`${colorClass} stroke-gray-900`}
              strokeWidth={2 / zoom}
              filter="url(#token-shadow)"
            />
            {/* Player name label */}
            <text
              y={16 / zoom}
              textAnchor="middle"
              fontSize={8 / zoom}
              fill="white"
              className="pointer-events-none select-none"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}
            >
              {player.displayName}
            </text>
          </g>
        );
      })}
    </g>
  );
}
