import { prisma } from "@/lib/prisma";
import {
  GamePollState,
  PlayerPollData,
  PlayerPrivateData,
  GameEventData,
  ActionCardPollData,
  PendingRewardData,
  PendingClueData,
  ActiveBlockadeData,
  DiscriminatedNotebookEntry,
} from "@/lib/turn-engine/types";
import { CARD_REGISTRY } from "@/lib/turn-engine/cards/registry";
import { CardIdentifier } from "@/lib/turn-engine/cards/types";
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

  // Notebook entries (all types)
  const notebookEntries = await prisma.notebookEntry.findMany({
    where: { roomId, playerId },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      regionId: true,
      roundNumber: true,
      stepsAway: true,
      entryType: true,
      payload: true,
    },
  });
  const notebook: DiscriminatedNotebookEntry[] = notebookEntries
    .map((e): DiscriminatedNotebookEntry | null => {
      if (e.entryType === "spy-proximity" && e.regionId !== null && e.stepsAway !== null) {
        return {
          entryType: "spy-proximity",
          regionId: e.regionId,
          roundNumber: e.roundNumber,
          stepsAway: e.stepsAway,
        };
      }
      if (e.entryType === "mastermind_distance" && e.payload) {
        const p = e.payload as Record<string, unknown>;
        return {
          entryType: "mastermind_distance",
          locationId: p.locationId as string,
          roundNumber: e.roundNumber,
          stepsAway: p.stepsAway as number,
        };
      }
      if (e.entryType === "mastermind_direction" && e.payload) {
        const p = e.payload as Record<string, unknown>;
        return {
          entryType: "mastermind_direction",
          locationId: p.locationId as string,
          roundNumber: e.roundNumber,
        };
      }
      if (e.entryType === "phone_bug" && e.payload) {
        const p = e.payload as Record<string, unknown>;
        return {
          entryType: "phone_bug",
          roundNumber: e.roundNumber,
          targetPlayerId: p.targetPlayerId as string,
          targetLocationId: p.targetLocationId as string,
          mastermindStepsAway: p.mastermindStepsAway as number,
          spyRegionId: (p.spyRegionId as string) || null,
          spyCaptured: p.spyCaptured as boolean,
        };
      }
      return null;
    })
    .filter((e): e is DiscriminatedNotebookEntry => e !== null);

  // Action cards (unconsumed only, with registry metadata)
  const cards = await prisma.actionCard.findMany({
    where: { roomId, playerId, consumed: false },
    select: { id: true, type: true },
  });
  const actionCards: ActionCardPollData[] = cards.map((c) => {
    const def = CARD_REGISTRY.get(c.type as CardIdentifier);
    return {
      id: c.id,
      cardIdentifier: (def?.identifier ?? c.type) as CardIdentifier,
      category: def?.category ?? "sabotage",
      targetRequirement: def?.targetRequirement ?? "none",
    };
  });

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

  // Pending clues
  const pendingClues = await prisma.pendingClue.findMany({
    where: { roomId, playerId, resolved: false },
    select: { cardIdentifier: true, roundNumber: true },
  });
  const pendingClueData: PendingClueData[] = pendingClues.map((c) => ({
    cardIdentifier: c.cardIdentifier,
    roundNumber: c.roundNumber,
  }));

  const privateData: PlayerPrivateData = {
    notebook,
    actionCards,
    pendingReward,
    skipNextTurn: playerPos?.skipNextTurn ?? false,
    actionPenaltyFlag: playerPos?.actionPenaltyFlag ?? false,
    pendingExtraTurns: playerPos?.pendingExtraTurns ?? 0,
    pendingClues: pendingClueData,
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

  // Active blockades
  const roomPlayers2 = await prisma.roomPlayer.findMany({
    where: { roomId },
    select: { playerId: true, turnPosition: true },
  });
  const currentTurnPosition = roomPlayers2.find(
    (p) => p.playerId === gameTurn.currentPlayerId
  )?.turnPosition ?? 1;

  const blockades = await prisma.blockade.findMany({
    where: { roomId, lifted: false },
    select: { transportType: true, casterPlayerId: true, creationRound: true },
  });
  const activeBlockades: ActiveBlockadeData[] = blockades.map((b) => ({
    transportType: b.transportType as "car" | "plane" | "boat",
    casterPlayerId: b.casterPlayerId,
    creationRound: b.creationRound,
  }));

  return {
    roomId,
    status: room.status as "in-progress" | "finished",
    viewerPlayerId: playerId,
    currentPlayerId: gameTurn.currentPlayerId,
    currentRound: gameTurn.currentRound,
    actionsRemaining: gameTurn.actionsRemaining,
    actionBudget: gameTurn.actionBudget,
    players,
    privateData,
    events: gameEvents,
    activeBlockades,
  };
}

function computeRewardTierFromOrder(captureOrder: number): number {
  if (captureOrder === 1) return 4;
  if (captureOrder === 2) return 3;
  if (captureOrder === 3) return 2;
  return 1;
}
