import type { GameEventData } from "@/lib/turn-engine/types";

/**
 * Resolves a location or region id to its display name.
 * Returns a fallback string when MapData is unavailable or the id is missing.
 */
export type NameLookupFn = (id: string, kind: "location" | "region") => string;

/**
 * Resolves a player id to their display name.
 * Returns "someone" when the player is not found.
 */
export type PlayerLookupFn = (playerId: string) => string;

// --- Internal helpers ---

function getPlayer(
  payload: Record<string, unknown>,
  key: string,
  playerLookup: PlayerLookupFn,
): string {
  const id = payload[key];
  if (typeof id !== "string" || id === "") return "someone";
  return playerLookup(id);
}

function getLocation(
  payload: Record<string, unknown>,
  key: string,
  nameLookup: NameLookupFn,
): string {
  const id = payload[key];
  if (typeof id !== "string" || id === "") return "an unknown location";
  return nameLookup(id, "location");
}

function getRegion(
  payload: Record<string, unknown>,
  key: string,
  nameLookup: NameLookupFn,
): string {
  const id = payload[key];
  if (typeof id !== "string" || id === "") return "an unknown location";
  return nameLookup(id, "region");
}

// --- Template map ---

type MessageBuilder = (
  payload: Record<string, unknown>,
  nameLookup: NameLookupFn,
  playerLookup: PlayerLookupFn,
) => string;

const templateMap: Record<string, MessageBuilder> = {
  "game-won": (payload, nameLookup, playerLookup) => {
    const winner = getPlayer(payload, "winnerId", playerLookup);
    const location = getLocation(payload, "locationId", nameLookup);
    return `${winner} captured the Mastermind at ${location} and won the game`;
  },
  "game-draw": (payload, nameLookup) => {
    const location = getLocation(payload, "mastermindLocationId", nameLookup);
    return `The game ended in a draw — the Mastermind was hiding at ${location}`;
  },
  "capture-failed": (payload, nameLookup, playerLookup) => {
    const player = getPlayer(payload, "playerId", playerLookup);
    const location = getLocation(payload, "locationId", nameLookup);
    return `${player} attempted a capture at ${location} but failed`;
  },
  "spy-captured-reward-collected": (payload, nameLookup, playerLookup) => {
    const player = getPlayer(payload, "playerId", playerLookup);
    const region = getRegion(payload, "regionId", nameLookup);
    const tier = typeof payload.rewardTier === "number" ? payload.rewardTier : 1;
    return `${player} collected ${tier} card(s) from the ${region} spy`;
  },
  "player-moved": (payload, nameLookup, playerLookup) => {
    const player = getPlayer(payload, "playerId", playerLookup);
    const to = getLocation(payload, "toLocationId", nameLookup);
    return `${player} moved to ${to}`;
  },
  "card-used": (payload, _nameLookup, playerLookup) => {
    const player = getPlayer(payload, "playerId", playerLookup);
    const cardId =
      typeof payload.cardIdentifier === "string"
        ? payload.cardIdentifier
        : "a card";
    const target = payload.targetPlayerId
      ? ` targeting ${getPlayer(payload, "targetPlayerId", playerLookup)}`
      : "";
    return `${player} used ${cardId}${target}`;
  },
  "player-skipped": (payload, _nameLookup, playerLookup) => {
    const player = getPlayer(payload, "playerId", playerLookup);
    return `${player} skipped their action`;
  },
  "turn-skipped": (payload, _nameLookup, playerLookup) => {
    const player = getPlayer(payload, "playerId", playerLookup);
    return `${player}'s turn was skipped`;
  },
  "blockade-activated": (payload, _nameLookup, playerLookup) => {
    const player = getPlayer(payload, "playerId", playerLookup);
    const transport =
      typeof payload.transportType === "string"
        ? payload.transportType
        : "transport";
    return `${player} activated a ${transport} blockade`;
  },
  "blockade-lifted": (payload, _nameLookup, playerLookup) => {
    const player = getPlayer(payload, "playerId", playerLookup);
    const count =
      typeof payload.liftedCount === "number" ? payload.liftedCount : 0;
    return `${player} lifted ${count} blockade(s)`;
  },
  "action-penalty-applied": (payload, _nameLookup, playerLookup) => {
    const player = getPlayer(payload, "playerId", playerLookup);
    const target = getPlayer(payload, "targetPlayerId", playerLookup);
    return `${player} applied an action penalty to ${target}`;
  },
  "player-relocated": (payload, nameLookup, playerLookup) => {
    const player = getPlayer(payload, "playerId", playerLookup);
    const to = getLocation(payload, "toLocationId", nameLookup);
    return `${player} was relocated to ${to}`;
  },
  "extra-turn-started": (payload, _nameLookup, playerLookup) => {
    const player = getPlayer(payload, "playerId", playerLookup);
    return `${player} started an extra turn`;
  },
};

/**
 * Maps a GameEventData entry to a human-readable sentence.
 *
 * - Resolves player ids, location ids, and region ids via the provided lookups.
 * - Returns "Unrecognised event" for unknown event types.
 * - Substitutes "someone" / "an unknown location" for missing payload fields.
 */
export function formatEventMessage(
  event: GameEventData,
  nameLookup: NameLookupFn,
  playerLookup: PlayerLookupFn,
): string {
  const builder = templateMap[event.type];
  if (!builder) {
    return "Unrecognised event";
  }
  return builder(event.payload, nameLookup, playerLookup);
}

/**
 * Computes a relative timestamp string from an ISO date string.
 *
 * @returns "Xs" for < 60s, "Xm" for < 60min, "Xh" for ≥ 60min
 */
export function formatRelativeTimestamp(
  createdAt: string,
  now?: Date,
): string {
  const reference = now ?? new Date();
  const created = new Date(createdAt);
  const deltaMs = reference.getTime() - created.getTime();
  const deltaSec = Math.max(0, Math.floor(deltaMs / 1000));

  if (deltaSec < 60) {
    return `${deltaSec}s`;
  }
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) {
    return `${deltaMin}m`;
  }
  const deltaHour = Math.floor(deltaMin / 60);
  return `${deltaHour}h`;
}
