import { TransactionClient, SpyResolutionOutcome } from "@/lib/turn-engine/types";
import { computeSpyDistance } from "@/lib/turn-engine/spy-distance";
import { CARD_POOL, CardIdentifier } from "@/lib/turn-engine/cards/types";

/**
 * Resolves Spy and Reward logic (Step B of End-of-Turn Resolution).
 * Evaluates Cases 1–5 in strict priority order, executing only the first match.
 *
 * Case 1: Player holds a Pending Reward AND has left the capture region → grant reward cards
 * Case 2: Player holds a Pending Reward AND is still in the capture region → no action
 * Case 3: Player has already captured this region's spy → no action
 * Case 4: Player is at an uncaptured (for them) Spy's exact location → capture the Spy
 * Case 5: Player is in a region with an uncaptured Spy but not at its location → deliver clue
 *
 * Multi-capture rule: ALL players can capture the same spy independently.
 * The captureOrder (1st, 2nd, 3rd, 4th) is per-spy, yielding 4/3/2/1 reward cards.
 */
export async function resolveSpyAndReward(
  roomId: string,
  playerId: string,
  playerLocationId: string,
  currentRound: number,
  tx: TransactionClient,
  rng: () => number = Math.random
): Promise<SpyResolutionOutcome> {
  // Get player's current position region
  const playerLocation = await tx.location.findUnique({
    where: { id: playerLocationId },
    select: { regionId: true },
  });

  if (!playerLocation) {
    throw new Error(`Location not found: ${playerLocationId}`);
  }

  const playerRegionId = playerLocation.regionId;

  // Get player's pending reward status
  const playerPos = await tx.playerPosition.findUnique({
    where: { roomId_playerId: { roomId, playerId } },
  });

  if (!playerPos) {
    throw new Error(
      `No position found for player ${playerId} in room ${roomId}`
    );
  }

  // Case 1: pending reward + left region
  if (
    playerPos.pendingRewardRegionId &&
    playerPos.pendingRewardRegionId !== playerRegionId
  ) {
    const captureOrder = playerPos.pendingRewardCaptureOrder!;
    const rewardTier = computeRewardTier(captureOrder);
    await grantRewardCards(playerId, roomId, rewardTier, tx, rng);

    // Clear pending reward
    await tx.playerPosition.update({
      where: { roomId_playerId: { roomId, playerId } },
      data: { pendingRewardRegionId: null, pendingRewardCaptureOrder: null },
    });

    // Emit public event for reward collection
    await emitEvent(
      roomId,
      "spy-captured-reward-collected",
      {
        playerId,
        regionId: playerPos.pendingRewardRegionId,
        rewardTier,
      },
      currentRound,
      tx
    );

    return {
      type: "spy-captured-reward-collected",
      rewardTier,
      captureOrder,
    };
  }

  // Case 2: pending reward + same region
  if (
    playerPos.pendingRewardRegionId &&
    playerPos.pendingRewardRegionId === playerRegionId
  ) {
    return { type: "none" };
  }

  // Get this region's spy
  const spy = await tx.gameSpy.findFirst({
    where: { roomId, regionId: playerRegionId },
  });

  // Case 3: no spy in this region
  if (!spy) {
    return { type: "none" };
  }

  // Case 3 (continued): this player has already captured this spy
  const existingCapture = await tx.spyCapture.findUnique({
    where: { spyId_playerId: { spyId: spy.id, playerId } },
  });
  if (existingCapture) {
    return { type: "none" };
  }

  // Case 4: at the spy's location — capture it
  if (spy.locationId === playerLocationId) {
    // Count how many players have already captured this spy to determine order
    const priorCaptureCount = await tx.spyCapture.count({
      where: { spyId: spy.id },
    });
    const captureOrder = priorCaptureCount + 1;

    // Record this player's capture
    await tx.spyCapture.create({
      data: { roomId, spyId: spy.id, playerId, captureOrder },
    });

    // Set pending reward on player position
    await tx.playerPosition.update({
      where: { roomId_playerId: { roomId, playerId } },
      data: {
        pendingRewardRegionId: playerRegionId,
        pendingRewardCaptureOrder: captureOrder,
      },
    });

    // No public event for spy capture itself — only when reward is collected
    return {
      type: "spy-captured",
      captureOrder,
      message: "Spy captured — leave the region to collect your reward",
    };
  }

  // Case 5: in region with spy, not at spy's location → deliver proximity clue
  const stepsAway = await computeSpyDistance(playerLocationId, spy.locationId);

  // Append notebook entry
  await tx.notebookEntry.create({
    data: {
      roomId,
      playerId,
      entryType: "spy-proximity",
      regionId: playerRegionId,
      roundNumber: currentRound,
      stepsAway,
    },
  });

  return {
    type: "clue",
    notebookEntry: {
      regionId: playerRegionId,
      roundNumber: currentRound,
      stepsAway,
    },
  };
}

/**
 * Computes the reward tier (number of cards) based on per-spy capture order.
 * 1st capture → 4 cards, 2nd → 3, 3rd → 2, 4th → 1 card
 */
export function computeRewardTier(captureOrder: number): number {
  if (captureOrder === 1) return 4;
  if (captureOrder === 2) return 3;
  if (captureOrder === 3) return 2;
  return 1; // 4th+
}

/**
 * Grants reward cards to a player. Guarantees exactly one `locate-the-mastermind` card.
 * Draws remaining cards from CARD_POOL uniformly. No hand cap — all cards are granted
 * regardless of how many cards the player already holds.
 */
async function grantRewardCards(
  playerId: string,
  roomId: string,
  rewardTier: number,
  tx: TransactionClient,
  rng: () => number = Math.random
): Promise<void> {
  const cards: CardIdentifier[] = [];

  // Guarantee exactly one locate-the-mastermind card (even for single-card rewards)
  cards.push("locate-the-mastermind");

  // Draw remaining cards from CARD_POOL uniformly (duplicates allowed)
  for (let i = 1; i < rewardTier; i++) {
    const index = Math.floor(rng() * CARD_POOL.length);
    cards.push(CARD_POOL[index]);
  }

  // Create card records in the database
  for (const cardType of cards) {
    await tx.actionCard.create({
      data: { roomId, playerId, type: cardType, consumed: false },
    });
  }
}

/**
 * Emits a public game event to the Event Feed.
 * Assigns the next monotonically increasing sequence number for the room.
 *
 * Note: This is an inline implementation. When task 7.2 (event-feed.ts) is
 * completed, this can be replaced with the shared `emitEvent` import.
 */
async function emitEvent(
  roomId: string,
  type: string,
  payload: Record<string, unknown>,
  roundNumber: number,
  tx: TransactionClient
): Promise<void> {
  // Get the current max sequence number for this room
  const lastEvent = await tx.gameEvent.findFirst({
    where: { roomId },
    orderBy: { sequenceNumber: "desc" },
    select: { sequenceNumber: true },
  });

  const nextSequence = (lastEvent?.sequenceNumber ?? 0) + 1;

  await tx.gameEvent.create({
    data: {
      roomId,
      sequenceNumber: nextSequence,
      roundNumber,
      type,
      payload: payload as any,
    },
  });
}
