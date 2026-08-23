import { TransactionClient } from "@/lib/turn-engine/types";

// --- Card Identifier ---

export type CardIdentifier =
  | "close-all-roads"
  | "close-all-airways"
  | "close-all-sea-routes"
  | "lose-an-action"
  | "locate-the-mastermind"
  | "bug-a-phone"
  | "reveal-direction"
  | "drop-ship"
  | "extra-turn"
  | "open-all-roads";

// --- Card Metadata Types ---

export type CardCategory = "sabotage" | "clue" | "booster";
export type TargetRequirement = "none" | "player";
export type ResolutionTiming = "immediate" | "end-of-round";

// --- Card Definition ---

export interface CardDefinition {
  identifier: CardIdentifier;
  category: CardCategory;
  targetRequirement: TargetRequirement;
  resolutionTiming: ResolutionTiming;
  handler: (ctx: CardEffectContext) => Promise<void>;
}

// --- Card Effect Context ---

export interface CardEffectContext {
  roomId: string;
  playerId: string;
  targetPlayerId?: string;
  playerLocationId: string;
  currentRound: number;
  casterTurnPosition: number;
  tx: TransactionClient;
  rng: () => number; // Injectable random source for testability
}

// --- Card Pool ---

export const CARD_POOL: CardIdentifier[] = [
  "close-all-roads",
  "close-all-airways",
  "close-all-sea-routes",
  "lose-an-action",
  "locate-the-mastermind",
  "bug-a-phone",
  "reveal-direction",
  "drop-ship",
  "extra-turn",
  "open-all-roads",
];

// --- Legacy Card Types ---

export const LEGACY_CARD_TYPES = ["locator", "extra-move", "reveal-region", "peek-clue"];
