"use client";

import React from "react";

import type { ActionCardPollData } from "@/lib/turn-engine/types";
import type { CardCategory } from "@/lib/turn-engine/cards/types";
import { getCardMeta } from "@/lib/game-ui/card-metadata";
import { CardIcon } from "./card-icon";

// --- Props ---

interface CardTileProps {
  card: ActionCardPollData;
  disabled: boolean;
  onActivate: (card: ActionCardPollData) => void;
}

// --- Category colour map ---

const CATEGORY_STYLES: Record<CardCategory, { border: string; text: string }> = {
  sabotage: { border: "border-red-500", text: "text-red-400" },
  clue: { border: "border-blue-500", text: "text-blue-400" },
  booster: { border: "border-green-500", text: "text-green-400" },
};

// --- Component ---

function CardTileInner({ card, disabled, onActivate }: CardTileProps) {
  const meta = getCardMeta(card.cardIdentifier);
  const styles = CATEGORY_STYLES[meta.category] ?? CATEGORY_STYLES.booster;

  return (
    <button
      type="button"
      aria-disabled={disabled ? "true" : undefined}
      aria-label={`${meta.displayName} (${meta.category})`}
      onClick={() => {
        if (!disabled) onActivate(card);
      }}
      className={`bg-gray-700 rounded-lg p-3 border-l-4 flex items-start gap-3 text-left w-full focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none transition-opacity ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-600 cursor-pointer"} ${styles.border}`}
    >
      <CardIcon identifier={card.cardIdentifier} />
      <div className="flex-1 min-w-0">
        <p className={`font-medium text-sm ${styles.text}`}>
          {meta.displayName}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{meta.description}</p>
      </div>
    </button>
  );
}

/**
 * CardTile — renders a single action card as a focusable button tile
 * with category colour treatment, icon, name, and description.
 *
 * Uses `aria-disabled` instead of HTML `disabled` to keep the button
 * focusable for screen reader discovery.
 *
 * Requirements: 10.2, 10.3, 10.4, 10.5, 11.5
 */
export const CardTile = React.memo(CardTileInner);
