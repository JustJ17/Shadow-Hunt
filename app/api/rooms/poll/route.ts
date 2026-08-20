import { NextResponse } from "next/server";
import { getOrCreatePlayerId } from "@/lib/auth/player-session";
import { pollState } from "@/lib/lobby/poll-state";

export async function GET(request: Request) {
  const playerId = getOrCreatePlayerId(request);

  const result = await pollState({ playerId });

  if (!result.success) {
    const statusCode = result.code === "NOT_IN_ROOM" ? 404 : 400;
    return NextResponse.json(result, { status: statusCode });
  }

  return NextResponse.json(result, { status: 200 });
}
