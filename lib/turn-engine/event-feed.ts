import { TransactionClient } from "@/lib/turn-engine/types";
import { prisma } from "@/lib/prisma";

/**
 * Emits a public game event to the Event Feed.
 * Assigns the next monotonically increasing sequence number for this room.
 */
export async function emitEvent(
  roomId: string,
  type: string,
  payload: Record<string, unknown>,
  roundNumber: number,
  tx: TransactionClient
): Promise<void> {
  // Get the current max sequence number for this room
  const maxResult = await tx.gameEvent.aggregate({
    where: { roomId },
    _max: { sequenceNumber: true },
  });

  const nextSequence = (maxResult._max.sequenceNumber ?? 0) + 1;

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

/**
 * Returns events from the Event Feed with sequence number > afterSequence.
 * Limited to 50 entries per response.
 */
export async function getEventsFeed(
  roomId: string,
  afterSequence: number = 0,
  limit: number = 50
): Promise<
  {
    id: string;
    sequenceNumber: number;
    roundNumber: number;
    type: string;
    payload: unknown;
    createdAt: Date;
  }[]
> {
  return prisma.gameEvent.findMany({
    where: {
      roomId,
      sequenceNumber: { gt: afterSequence },
    },
    orderBy: { sequenceNumber: "asc" },
    take: Math.min(limit, 50),
  });
}
