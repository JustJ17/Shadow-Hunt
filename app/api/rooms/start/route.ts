import { NextResponse } from "next/server";
import { getOrCreatePlayerId } from "@/lib/auth/player-session";
import { startGame } from "@/lib/lobby/start-game";

export async function POST(request: Request) {
  const playerId = getOrCreatePlayerId(request);

  const result = await startGame({ playerId });

  if (!result.success) {
    const statusMap: Record<string, number> = {
      NOT_IN_ROOM: 404,
      NOT_HOST: 403,
      GAME_ALREADY_STARTED: 409,
      INSUFFICIENT_PLAYERS: 422,
      PLAYERS_NOT_READY: 422,
    };
    const statusCode = statusMap[result.code] || 400;
    return NextResponse.json(result, { status: statusCode });
  }

  return NextResponse.json(result, { status: 200 });
}
