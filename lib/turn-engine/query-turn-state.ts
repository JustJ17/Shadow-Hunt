import { prisma } from "@/lib/prisma";
import {
  GamePollState,
  PlayerPollData,
  PlayerPrivateData,
  GameEventData,
  NotebookEntryData,
  ActionCardData,
  PendingRewardData,
} from "@/lib/turn-engine/types";
import { getEventsFeed } from "@/lib/turn-engine/event-feed";

/**
 * Returns the current game state for a given room, including:
 * - All player positions, current turn state, room status
 * - Requesting player's private data (notebook, cards, pending reward, skip flag)
 * - Event feed entries after provided sequence (max 50)
 *
 * Does NOT include Mastermind location or uncaptured Spy locations.
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
 */
export async function getGamePollState(
  roomId: string,
  playerId: string,
  afterSequence?: number
): Promise<GamePollState> {
  // Verify player is a member of the room (Req 16.6)
  const membership = await prisma.roomPlayer.findUnique({
    where: { playerId_roomId: { playerId, roomId } },
  });
  if (!membership) {
    throw new Error("Access denied: player is not a member of this room");
  }

  // Get room status
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { status: true },
  });
  if (!room) {
    throw new Error("Room not found");
  }

  // Get current turn state
  const gameTurn = await prisma.gameTurn.findUnique({
    where: { roomId },
  });
  if (!gameTurn) {
    throw new Error("Game turn state not found");
  }

  // Get all player positions (Req 16.1)
  const positions = await prisma.playerPosition.findMany({
    where: { roomId },
  });
  const roomPlayers = await prisma.roomPlayer.findMany({
    where: { roomId },
    select: { playerId: true, displayName: true, turnPosition: true },
  });
  const playerMap = new Map(
    roomPlayers.map((p) => [p.playerId, p] as const)
  );

  const players: PlayerPollData[] = positions.map((pos) => {
    const player = playerMap.get(pos.playerId);
    return {
      playerId: pos.playerId,
      displayName: player?.displayName ?? "Unknown",
      locationId: pos.locationId,
      turnPosition: player?.turnPosition ?? 0,
      skipNextTurn: pos.skipNextTurn,
    };
  });

  // Get requesting player's private data (Req 16.2)
  const playerPos = positions.find((p) => p.playerId === playerId);

  // Notebook entries (spy-proximity clues)
  const notebookEntries = await prisma.notebookEntry.findMany({
    where: { roomId, playerId },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      regionId: true,
      roundNumber: true,
      stepsAway: true,
      entryType: true,
    },
  });
  const notebook: NotebookEntryData[] = notebookEntries
    .filter(
      (e) =>
        e.entryType === "spy-proximity" &&
        e.regionId !== null &&
        e.stepsAway !== null
    )
    .map((e) => ({
      regionId: e.regionId!,
      roundNumber: e.roundNumber,
      stepsAway: e.stepsAway!,
    }));

  // Action cards
  const cards = await prisma.actionCard.findMany({
    where: { roomId, playerId },
    select: { id: true, type: true, consumed: true },
  });
  const actionCards: ActionCardData[] = cards.map((c) => ({
    id: c.id,
    type: c.type,
    consumed: c.consumed,
  }));

  // Pending reward
  let pendingReward: PendingRewardData | null = null;
  if (playerPos?.pendingRewardRegionId && playerPos.pendingRewardCaptureOrder) {
    const rewardTier = computeRewardTierFromOrder(
      playerPos.pendingRewardCaptureOrder
    );
    pendingReward = {
      regionId: playerPos.pendingRewardRegionId,
      captureOrder: playerPos.pendingRewardCaptureOrder,
      rewardTier,
    };
  }

  const privateData: PlayerPrivateData = {
    notebook,
    actionCards,
    pendingReward,
    skipNextTurn: playerPos?.skipNextTurn ?? false,
  };

  // Event feed after provided sequence, max 50 (Req 16.3)
  const events = await getEventsFeed(roomId, afterSequence ?? 0, 50);
  const gameEvents: GameEventData[] = events.map((e) => ({
    id: e.id,
    sequenceNumber: e.sequenceNumber,
    roundNumber: e.roundNumber,
    type: e.type as GameEventData["type"],
    payload: e.payload as Record<string, unknown>,
    createdAt: e.createdAt.toISOString(),
  }));

  return {
    roomId,
    status: room.status as "in-progress" | "finished",
    currentPlayerId: gameTurn.currentPlayerId,
    currentRound: gameTurn.currentRound,
    currentSlot: gameTurn.currentSlot as 1 | 2,
    players,
    privateData,
    events: gameEvents,
  };
}

function computeRewardTierFromOrder(captureOrder: number): number {
  if (captureOrder === 1) return 4;
  if (captureOrder === 2) return 3;
  if (captureOrder === 3) return 2;
  return 1;
}
