import { NextResponse } from "next/server";
import { getOrCreatePlayerId } from "@/lib/auth/player-session";
import { toggleReady } from "@/lib/lobby/toggle-ready";

export async function POST(request: Request) {
  const playerId = getOrCreatePlayerId(request);

  const result = await toggleReady({ playerId });

  if (!result.success) {
    const statusMap: Record<string, number> = {
      NOT_IN_ROOM: 404,
      GAME_ALREADY_STARTED: 409,
    };
    const statusCode = statusMap[result.code] || 400;
    return NextResponse.json(result, { status: statusCode });
  }

  return NextResponse.json(result, { status: 200 });
}
