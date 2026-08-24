import { TransactionClient } from "@/lib/turn-engine/types";
import { getShortestPathDistance } from "@/lib/map/distance";

/**
 * Resolves all pending clues for a specific player at end of their turn.
 * This enables per-turn clue delivery (including extra turns) rather than
 * waiting for round-end resolution.
 *
 * Called from resolveEndOfTurn after spy/reward resolution.
 * Only resolves clues belonging to the specified player for the current round.
 *
 * If the room is finished (game over), discards all pending clues without
 * creating notebook entries.
 */
export async function resolvePlayerPendingClues(
  roomId: string,
  playerId: string,
  roundNumber: number,
  tx: TransactionClient,
  rng: () => number = Math.random
): Promise<void> {
  // Check if room has been won (game over)
  const room = await tx.room.findUnique({
    where: { id: roomId },
    select: { status: true },
  });
  if (room?.status === "finished") {
    await tx.pendingClue.updateMany({
      where: { roomId, playerId, resolved: false },
      data: { resolved: true },
    });
    return;
  }

  // Load unresolved clues for THIS player only (not all players)
  const pendingClues = await tx.pendingClue.findMany({
    where: { roomId, playerId, resolved: false },
  });

  if (pendingClues.length === 0) return;

  // Sort by stable key for deterministic order
  pendingClues.sort((a, b) => a.id.localeCompare(b.id));

  // Load mastermind location
  const gameThreat = await tx.gameThreat.findUnique({ where: { roomId } });
  if (!gameThreat) return;
  const mastermindLocationId = gameThreat.locationId;

  for (const clue of pendingClues) {
    switch (clue.cardIdentifier) {
      case "locate-the-mastermind":
        await resolveLocateTheMastermind(clue, mastermindLocationId, roomId, tx);
        break;
      case "bug-a-phone":
        await resolveBugAPhone(clue, mastermindLocationId, roomId, tx, rng);
        break;
      case "reveal-direction":
        await resolveRevealDirection(clue, mastermindLocationId, roomId, tx, rng);
        break;
    }

    // Mark clue resolved
    await tx.pendingClue.update({
      where: { id: clue.id },
      data: { resolved: true },
    });
  }
}

async function resolveLocateTheMastermind(
  clue: { playerId: string; originLocationId: string; roundNumber: number },
  mastermindLocationId: string,
  roomId: string,
  tx: TransactionClient
): Promise<void> {
  const stepsAway = await getShortestPathDistance(
    clue.originLocationId,
    mastermindLocationId
  );

  await tx.notebookEntry.create({
    data: {
      roomId,
      playerId: clue.playerId,
      entryType: "mastermind_distance",
      roundNumber: clue.roundNumber,
      payload: {
        type: "mastermind_distance",
        locationId: clue.originLocationId,
        roundNumber: clue.roundNumber,
        stepsAway,
      },
    },
  });
}

async function resolveBugAPhone(
  clue: { playerId: string; roundNumber: number },
  mastermindLocationId: string,
  roomId: string,
  tx: TransactionClient,
  rng: () => number
): Promise<void> {
  const allPlayers = await tx.roomPlayer.findMany({ where: { roomId } });
  const otherPlayers = allPlayers.filter((p) => p.playerId !== clue.playerId);

  if (otherPlayers.length === 0) return;

  let targetPool = otherPlayers.filter((p) => p.status === "connected");
  if (targetPool.length === 0) targetPool = otherPlayers;

  targetPool.sort((a, b) => a.playerId.localeCompare(b.playerId));

  const targetIndex = Math.floor(rng() * targetPool.length);
  const targetPlayer = targetPool[targetIndex];

  const targetPos = await tx.playerPosition.findUnique({
    where: { roomId_playerId: { roomId, playerId: targetPlayer.playerId } },
  });
  if (!targetPos) return;

  const targetLocation = await tx.location.findUnique({
    where: { id: targetPos.locationId },
    select: { id: true, regionId: true },
  });
  if (!targetLocation) return;

  const mastermindStepsAway = await getShortestPathDistance(
    targetPos.locationId,
    mastermindLocationId
  );

  const spy = await tx.gameSpy.findFirst({
    where: { roomId, regionId: targetLocation.regionId },
  });

  await tx.notebookEntry.create({
    data: {
      roomId,
      playerId: clue.playerId,
      entryType: "phone_bug",
      roundNumber: clue.roundNumber,
      payload: {
        type: "phone_bug",
        roundNumber: clue.roundNumber,
        targetPlayerId: targetPlayer.playerId,
        targetLocationId: targetPos.locationId,
        mastermindStepsAway,
        spyRegionId: spy ? targetLocation.regionId : null,
        spyCaptured: spy
          ? (await tx.spyCapture.count({ where: { spyId: spy.id } })) > 0
          : false,
      },
    },
  });
}

async function resolveRevealDirection(
  clue: { playerId: string; originLocationId: string; roundNumber: number },
  mastermindLocationId: string,
  roomId: string,
  tx: TransactionClient,
  rng: () => number
): Promise<void> {
  const referenceDistance = await getShortestPathDistance(
    clue.originLocationId,
    mastermindLocationId
  );

  let revealedLocationId: string;

  if (referenceDistance === 0) {
    revealedLocationId = clue.originLocationId;
  } else {
    const adjacencies = await tx.adjacency.findMany({
      where: {
        OR: [
          { locationAId: clue.originLocationId },
          { locationBId: clue.originLocationId },
        ],
      },
    });

    const neighborIds = adjacencies.map((a) =>
      a.locationAId === clue.originLocationId ? a.locationBId : a.locationAId
    );

    const candidates: string[] = [];
    for (const neighborId of neighborIds) {
      const dist = await getShortestPathDistance(neighborId, mastermindLocationId);
      if (dist === referenceDistance - 1) {
        candidates.push(neighborId);
      }
    }

    candidates.sort();
    const selectedIndex = Math.floor(rng() * candidates.length);
    revealedLocationId = candidates[selectedIndex];
  }

  await tx.notebookEntry.create({
    data: {
      roomId,
      playerId: clue.playerId,
      entryType: "mastermind_direction",
      roundNumber: clue.roundNumber,
      payload: {
        type: "mastermind_direction",
        locationId: revealedLocationId,
        roundNumber: clue.roundNumber,
      },
    },
  });
}