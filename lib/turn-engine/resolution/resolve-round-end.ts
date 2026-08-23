import { TransactionClient } from "@/lib/turn-engine/types";
import { getShortestPathDistance } from "@/lib/map/distance";

/**
 * Resolves all Pending_Clue records for the given round.
 * Called by advanceTurn when crossing a round boundary.
 *
 * For each unresolved PendingClue:
 * - locate-the-mastermind → compute distance, append mastermind_distance notebook entry
 * - bug-a-phone → select random target, compute distance + spy status, append phone_bug entry
 * - reveal-direction → compute adjacent city toward mastermind, append mastermind_direction entry
 *
 * All clue computations use the persisted Origin_Location (not current player position).
 * Resolution order does not affect output (confluence property — random draws held fixed).
 *
 * @param roomId - The game session room ID
 * @param roundNumber - The round that just completed
 * @param tx - Prisma transaction client
 * @param rng - Injectable random number generator (default Math.random)
 */
export async function resolveRoundEnd(
  roomId: string,
  roundNumber: number,
  tx: TransactionClient,
  rng: () => number = Math.random
): Promise<void> {
  // Check if room has been won (game over) — Req 14.6
  const room = await tx.room.findUnique({
    where: { id: roomId },
    select: { status: true },
  });
  if (room?.status === "finished") {
    // Discard all pending clues without creating entries
    await tx.pendingClue.updateMany({
      where: { roomId, roundNumber, resolved: false },
      data: { resolved: true },
    });
    return;
  }

  // Load all unresolved clues for this round
  const pendingClues = await tx.pendingClue.findMany({
    where: { roomId, roundNumber, resolved: false },
  });

  if (pendingClues.length === 0) return;

  // Sort by stable key (id) to ensure deterministic processing order
  // regardless of DB return order — ensures confluence property (Req 14.7)
  pendingClues.sort((a, b) => a.id.localeCompare(b.id));

  // Load mastermind location from GameThreat
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
        await resolveRevealDirection(
          clue,
          mastermindLocationId,
          roomId,
          tx,
          rng
        );
        break;
    }

    // Mark clue resolved
    await tx.pendingClue.update({
      where: { id: clue.id },
      data: { resolved: true },
    });
  }
}

/**
 * Resolve locate-the-mastermind: compute Distance_Utility distance from
 * Origin_Location to mastermind, append mastermind_distance notebook entry.
 * (Reqs 11.2, 11.3, 11.4, 11.5, 11.6)
 */
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

/**
 * Resolve bug-a-phone: select random target (prefer connected players, fallback all others),
 * compute mastermind distance from target's position, check spy status in target's region,
 * append phone_bug notebook entry.
 * (Reqs 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11)
 */
async function resolveBugAPhone(
  clue: { playerId: string; roundNumber: number },
  mastermindLocationId: string,
  roomId: string,
  tx: TransactionClient,
  rng: () => number
): Promise<void> {
  // Select target: prefer connected players, fallback to all others
  const allPlayers = await tx.roomPlayer.findMany({ where: { roomId } });
  const otherPlayers = allPlayers.filter((p) => p.playerId !== clue.playerId);

  if (otherPlayers.length === 0) return;

  // Prefer connected players (Req 12.2)
  let targetPool = otherPlayers.filter((p) => p.status === "connected");
  if (targetPool.length === 0) {
    // Fallback: all other players (Req 12.3)
    targetPool = otherPlayers;
  }

  // Sort target pool by playerId to ensure deterministic selection
  // regardless of processing order (confluence property — Req 14.7)
  targetPool.sort((a, b) => a.playerId.localeCompare(b.playerId));

  const targetIndex = Math.floor(rng() * targetPool.length);
  const targetPlayer = targetPool[targetIndex];

  // Get target's current position and region
  const targetPos = await tx.playerPosition.findUnique({
    where: {
      roomId_playerId: { roomId, playerId: targetPlayer.playerId },
    },
  });
  if (!targetPos) return;

  const targetLocation = await tx.location.findUnique({
    where: { id: targetPos.locationId },
    select: { id: true, regionId: true },
  });
  if (!targetLocation) return;

  // Compute mastermind distance from target's current location (Req 12.6)
  const mastermindStepsAway = await getShortestPathDistance(
    targetPos.locationId,
    mastermindLocationId
  );

  // Spy status in target's region (Reqs 12.7, 12.8, 12.9)
  const spy = await tx.gameSpy.findFirst({
    where: { roomId, regionId: targetLocation.regionId },
  });

  const spyRegionId = spy ? targetLocation.regionId : null;
  const spyCaptured = spy ? spy.captured : false;

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
        spyRegionId,
        spyCaptured,
      },
    },
  });
}

/**
 * Resolve reveal-direction: compute reference distance, find adjacent locations
 * one step closer to the mastermind, select uniformly. Handle d=0 (reveal own location).
 * (Reqs 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8)
 */
async function resolveRevealDirection(
  clue: {
    playerId: string;
    originLocationId: string;
    roundNumber: number;
  },
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
    // Player is at mastermind's location — reveal their own location (Req 13.4)
    revealedLocationId = clue.originLocationId;
  } else {
    // Find adjacent locations that are one step closer to the mastermind (Req 13.3)
    const adjacencies = await tx.adjacency.findMany({
      where: {
        OR: [
          { locationAId: clue.originLocationId },
          { locationBId: clue.originLocationId },
        ],
      },
    });

    // Extract neighbor IDs from bidirectional adjacency edges
    const neighborIds = adjacencies.map((a) =>
      a.locationAId === clue.originLocationId ? a.locationBId : a.locationAId
    );

    // Filter to neighbors exactly one step closer (distance = referenceDistance - 1)
    const candidates: string[] = [];
    for (const neighborId of neighborIds) {
      const dist = await getShortestPathDistance(neighborId, mastermindLocationId);
      if (dist === referenceDistance - 1) {
        candidates.push(neighborId);
      }
    }

    // Sort candidates to ensure deterministic selection regardless of
    // adjacency return order (confluence property — Req 14.7)
    candidates.sort();

    // Select uniformly at random from candidates (Req 13.3)
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
