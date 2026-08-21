import { TransactionClient, SpyResolutionOutcome } from "@/lib/turn-engine/types";
import { computeSpyDistance } from "@/lib/turn-engine/spy-distance";

/**
 * Resolves Spy and Reward logic (Step B of End-of-Turn Resolution).
 * Evaluates Cases 1–5 in strict priority order, executing only the first match.
 *
 * Case 1: Player holds a Pending Reward AND has left the capture region → grant reward cards
 * Case 2: Player holds a Pending Reward AND is still in the capture region → no action
 * Case 3: Region's Spy already captured and Player holds no Pending Reward → no action
 * Case 4: Player is at an uncaptured Spy's exact location → capture the Spy
 * Case 5: Player is in a region with an uncaptured Spy but not at its location → deliver clue
 */
export async function resolveSpyAndReward(
  roomId: string,
  playerId: string,
  playerLocationId: string,
  currentRound: number,
  tx: TransactionClient
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
    await grantRewardCards(playerId, roomId, rewardTier, tx);

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

  // Case 3: spy already captured (or no spy in region), no pending reward
  if (!spy || spy.captured) {
    return { type: "none" };
  }

  // Case 4: at the uncaptured spy's location
  if (spy.locationId === playerLocationId) {
    // Count existing captures to determine capture order
    const capturedCount = await tx.gameSpy.count({
      where: { roomId, captured: true },
    });
    const captureOrder = capturedCount + 1;

    // Mark spy as captured
    await tx.gameSpy.update({
      where: { id: spy.id },
      data: { captured: true, capturedByPlayerId: playerId },
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

  // Case 5: in region with uncaptured spy, not at spy's location
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
 * Computes the reward tier (number of cards) based on game-wide capture order.
 * 1st capture → 4 cards, 2nd → 3, 3rd → 2, 4th–6th → 1 card
 */
export function computeRewardTier(captureOrder: number): number {
  if (captureOrder === 1) return 4;
  if (captureOrder === 2) return 3;
  if (captureOrder === 3) return 2;
  return 1; // 4th, 5th, 6th
}

/**
 * Grants reward cards to a player. Guarantees at least 1 locator card.
 * Enforces max hand size of 5 (won't grant cards that would exceed the limit).
 */
async function grantRewardCards(
  playerId: string,
  roomId: string,
  rewardTier: number,
  tx: TransactionClient
): Promise<void> {
  // Check current hand size (unconsumed cards only)
  const currentCards = await tx.actionCard.count({
    where: { roomId, playerId, consumed: false },
  });

  const maxToGrant = Math.min(rewardTier, 5 - currentCards);

  if (maxToGrant <= 0) return;

  const cardTypes = ["locator", "extra-move", "reveal-region", "peek-clue"];
  const cards: string[] = [];

  // Guarantee at least 1 locator card
  cards.push("locator");

  // Fill remaining slots with random card types
  for (let i = 1; i < maxToGrant; i++) {
    cards.push(cardTypes[Math.floor(Math.random() * cardTypes.length)]);
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
