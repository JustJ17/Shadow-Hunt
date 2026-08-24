import type { CardCategory, CardIdentifier } from "@/lib/turn-engine/cards/types";

// --- Card Metadata Types ---

export interface CardMeta {
  displayName: string; // max 40 characters
  description: string; // max 120 characters
  category: CardCategory;
}

// --- Card Metadata Registry ---

const CARD_METADATA: Record<CardIdentifier, CardMeta> = {
  "close-all-roads": {
    displayName: "Close All Roads",
    description: "Blocks all road connections for other players until the end of the round.",
    category: "sabotage",
  },
  "close-all-airways": {
    displayName: "Close All Airways",
    description: "Blocks all air connections for other players until the end of the round.",
    category: "sabotage",
  },
  "close-all-sea-routes": {
    displayName: "Close All Sea Routes",
    description: "Blocks all sea connections for other players until the end of the round.",
    category: "sabotage",
  },
  "lose-an-action": {
    displayName: "Lose an Action",
    description: "Target player loses one action on their next turn.",
    category: "sabotage",
  },
  "locate-the-mastermind": {
    displayName: "Locate the Mastermind",
    description: "Reveals the region where the Mastermind is hiding.",
    category: "clue",
  },
  "bug-a-phone": {
    displayName: "Bug a Phone",
    description: "Reveals a target player's location and their distance to the Mastermind.",
    category: "clue",
  },
  "reveal-direction": {
    displayName: "Reveal Direction",
    description: "Shows a location one step closer to the Mastermind from where you stand.",
    category: "clue",
  },
  "drop-ship": {
    displayName: "Drop Ship",
    description: "Instantly relocates you to any Hub location on the map.",
    category: "booster",
  },
  "extra-turn": {
    displayName: "Extra Turn",
    description: "Grants you an additional turn after the current round completes.",
    category: "booster",
  },
  "open-all-roads": {
    displayName: "Open All Roads",
    description: "Lifts all active road blockades, restoring road travel for everyone.",
    category: "booster",
  },
};

// --- Public API ---

/**
 * Returns display metadata for a card identifier.
 * Known identifiers return curated metadata; unknown identifiers
 * return the raw identifier as displayName with a fallback description.
 */
export function getCardMeta(identifier: string): CardMeta {
  if (Object.hasOwn(CARD_METADATA, identifier)) {
    return CARD_METADATA[identifier as CardIdentifier];
  }
  return {
    displayName: identifier,
    description: "Unrecognised card",
    category: "booster",
  };
}
