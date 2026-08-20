import { NextResponse } from "next/server";
import {
  getOrCreatePlayerId,
  playerIdCookieHeader,
} from "@/lib/auth/player-session";
import { joinRoom } from "@/lib/lobby/join-room";

export async function POST(request: Request) {
  const playerId = getOrCreatePlayerId(request);

  let body: { roomCode?: string; displayName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body", code: "INVALID_INPUT" },
      { status: 400 }
    );
  }

  const { roomCode, displayName } = body;

  if (!roomCode || typeof roomCode !== "string") {
    return NextResponse.json(
      { success: false, error: "roomCode is required", code: "INVALID_INPUT" },
      { status: 400 }
    );
  }

  if (!displayName || typeof displayName !== "string") {
    return NextResponse.json(
      {
        success: false,
        error: "displayName is required",
        code: "INVALID_INPUT",
      },
      { status: 400 }
    );
  }

  const result = await joinRoom({ playerId, displayName, roomCode });

  if (!result.success) {
    const statusMap: Record<string, number> = {
      ROOM_NOT_FOUND: 404,
      ROOM_FULL: 409,
      GAME_ALREADY_STARTED: 409,
      ALREADY_IN_ROOM: 409,
      MUST_LEAVE_CURRENT_ROOM: 409,
      INVALID_INPUT: 400,
    };
    const statusCode = statusMap[result.code] || 400;
    return NextResponse.json(result, { status: statusCode });
  }

  const response = NextResponse.json(result, { status: 200 });
  response.headers.set("Set-Cookie", playerIdCookieHeader(playerId));
  return response;
}
