"use client";

import { memo } from "react";

interface EventIconProps {
  type: string;
}

/**
 * EventIcon — renders a distinct 16×16 inline-SVG glyph for each of the
 * 13 known GameEventType values, plus a neutral circle fallback for unknown types.
 *
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 */
function EventIconInner({ type }: EventIconProps) {
  const path = glyphPaths[type];

  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      {path ?? fallbackGlyph}
    </svg>
  );
}

export const EventIcon = memo(EventIconInner);

// ─── Glyph definitions ──────────────────────────────────────────────────────

/** Neutral circle fallback for unknown event types */
const fallbackGlyph = <circle cx="8" cy="8" r="5" />;

/** Map of GameEventType → distinct inline-SVG element */
const glyphPaths: Record<string, React.ReactElement> = {
  // Trophy / star shape — game won
  "game-won": (
    <polygon points="8,1 10,6 15,6 11,9.5 12.5,14.5 8,11.5 3.5,14.5 5,9.5 1,6 6,6" />
  ),

  // Horizontal line (equals) — game draw
  "game-draw": (
    <g>
      <rect x="2" y="5" width="12" height="2" rx="1" />
      <rect x="2" y="9" width="12" height="2" rx="1" />
    </g>
  ),

  // X mark — capture failed
  "capture-failed": (
    <g>
      <rect x="2" y="7" width="12" height="2" rx="1" transform="rotate(45 8 8)" />
      <rect x="2" y="7" width="12" height="2" rx="1" transform="rotate(-45 8 8)" />
    </g>
  ),

  // Diamond — spy captured / reward collected
  "spy-captured-reward-collected": (
    <polygon points="8,1 14,8 8,15 2,8" />
  ),

  // Right-pointing arrow — player moved
  "player-moved": (
    <polygon points="3,4 12,8 3,12" />
  ),

  // Lightning bolt — card used
  "card-used": (
    <polygon points="9,1 5,7 8,7 7,15 11,9 8,9" />
  ),

  // Minus inside a square — player skipped
  "player-skipped": (
    <g>
      <rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4" y="7" width="8" height="2" rx="1" />
    </g>
  ),

  // Clock / timer shape — turn skipped
  "turn-skipped": (
    <g>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="4" x2="8" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="8" y1="8" x2="11" y2="10" stroke="currentColor" strokeWidth="1.5" />
    </g>
  ),

  // Shield / lock shape — blockade activated
  "blockade-activated": (
    <path d="M8 1 L13 4 L13 9 C13 12 8 15 8 15 C8 15 3 12 3 9 L3 4 Z" />
  ),

  // Open padlock / shield outline — blockade lifted
  "blockade-lifted": (
    <path
      d="M8 2 L12 4.5 L12 8.5 C12 11 8 14 8 14 C8 14 4 11 4 8.5 L4 4.5 Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  ),

  // Downward triangle (warning) — action penalty applied
  "action-penalty-applied": (
    <polygon points="8,2 14,13 2,13" />
  ),

  // Four-directional arrows — player relocated
  "player-relocated": (
    <g>
      <polygon points="8,1 10,4 6,4" />
      <polygon points="8,15 10,12 6,12" />
      <polygon points="1,8 4,6 4,10" />
      <polygon points="15,8 12,6 12,10" />
      <rect x="7" y="4" width="2" height="8" />
      <rect x="4" y="7" width="8" height="2" />
    </g>
  ),

  // Plus inside circle — extra turn started
  "extra-turn-started": (
    <g>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <rect x="7" y="4" width="2" height="8" rx="1" />
      <rect x="4" y="7" width="8" height="2" rx="1" />
    </g>
  ),
};
