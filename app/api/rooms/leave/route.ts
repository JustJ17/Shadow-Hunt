import { NextResponse } from "next/server";
import { getOrCreatePlayerId } from "@/lib/auth/player-session";
import { leaveRoom } from "@/lib/lobby/leave-room";

export async function POST(request: Request) {
  const playerId = getOrCreatePlayerId(request);

  const result = await leaveRoom({ playerId });

  if (!result.success) {
    const statusMap: Record<string, number> = {
      NOT_IN_ROOM: 404,
      CANNOT_LEAVE_ACTIVE_GAME: 409,
    };
    const statusCode = statusMap[result.code] || 400;
    return NextResponse.json(result, { status: statusCode });
  }

  return NextResponse.json(result, { status: 200 });
}
