"use client";

import React from "react";

interface CardIconProps {
  identifier: string;
}

const ICON_SIZE = 24;

function CardIconInner({ identifier }: CardIconProps) {
  const svgProps = {
    width: ICON_SIZE,
    height: ICON_SIZE,
    viewBox: "0 0 24 24",
    "aria-hidden": true as const,
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  };

  switch (identifier) {
    case "close-all-roads":
      // Road barrier: two horizontal lines with an X over them
      return (
        <svg {...svgProps}>
          <path
            d="M3 14h18M3 10h18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M7 6l10 12M17 6L7 18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "close-all-airways":
      // X over a plane shape
      return (
        <svg {...svgProps}>
          <path
            d="M12 3l3 5h5l-2 3 2 3h-5l-3 5-3-5H4l2-3-2-3h5l3-5z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M6 4l12 16M18 4L6 20"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "close-all-sea-routes":
      // X over a wave
      return (
        <svg {...svgProps}>
          <path
            d="M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M6 4l12 12M18 4L6 16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "lose-an-action":
      // Broken clock with minus
      return (
        <svg {...svgProps}>
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M12 7v5l3 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 20h8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "locate-the-mastermind":
      // Crosshairs / target
      return (
        <svg {...svgProps}>
          <circle
            cx="12"
            cy="12"
            r="8"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <circle
            cx="12"
            cy="12"
            r="3"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M12 2v4M12 18v4M2 12h4M18 12h4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );

    case "bug-a-phone":
      // Phone with a small bug/antenna
      return (
        <svg {...svgProps}>
          <rect
            x="7"
            y="3"
            width="10"
            height="18"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M10 18h4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="5" cy="7" r="2" fill="currentColor" />
          <path
            d="M5 5V3M3 6l-1-1M7 6l1-1"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
          />
        </svg>
      );

    case "reveal-direction":
      // Compass arrow pointing up-right
      return (
        <svg {...svgProps}>
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M12 5l3 7-7 3 3-7 7-3z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinejoin="round"
          />
        </svg>
      );

    case "drop-ship":
      // Parachute / drop
      return (
        <svg {...svgProps}>
          <path
            d="M5 10a7 7 0 0114 0"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M5 10l7 10 7-10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M9 10l3 10 3-10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            x="10"
            y="19"
            width="4"
            height="3"
            rx="1"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>
      );

    case "extra-turn":
      // Circular arrow with plus sign
      return (
        <svg {...svgProps}>
          <path
            d="M4 12a8 8 0 1114-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M18 4v4h-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M10 12h4M12 10v4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "open-all-roads":
      // Checkmark over road
      return (
        <svg {...svgProps}>
          <path
            d="M3 14h18M3 10h18"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M7 8l3 3 7-7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );

    default:
      // Neutral fallback: question mark in a rounded rectangle (generic card)
      return (
        <svg {...svgProps}>
          <rect
            x="4"
            y="2"
            width="16"
            height="20"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path
            d="M10 9a2 2 0 114 0c0 1.5-2 2-2 3.5M12 16v.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

/**
 * CardIcon — renders a distinct 24×24 inline SVG glyph for each of the
 * 10 known CardIdentifier values, with a neutral fallback for unknowns.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.4, 14.5
 */
export const CardIcon = React.memo(CardIconInner);
