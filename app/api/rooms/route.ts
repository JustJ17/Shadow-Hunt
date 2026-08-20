import { NextResponse } from "next/server";
import {
  getOrCreatePlayerId,
  playerIdCookieHeader,
} from "@/lib/auth/player-session";
import { createRoom } from "@/lib/lobby/create-room";

export async function POST(request: Request) {
  const playerId = getOrCreatePlayerId(request);

  // Parse body
  let body: { displayName?: string; visibility?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body", code: "INVALID_INPUT" },
      { status: 400 }
    );
  }

  const { displayName, visibility } = body;

  // Validate required fields
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

  if (visibility && visibility !== "public" && visibility !== "private") {
    return NextResponse.json(
      {
        success: false,
        error: "visibility must be 'public' or 'private'",
        code: "INVALID_INPUT",
      },
      { status: 400 }
    );
  }

  const result = await createRoom({
    playerId,
    displayName,
    visibility: (visibility as "public" | "private") || "private",
  });

  if (!result.success) {
    const statusCode = result.code === "MUST_LEAVE_CURRENT_ROOM" ? 409 : 400;
    return NextResponse.json(result, { status: statusCode });
  }

  // Set the player ID cookie on the response
  const response = NextResponse.json(result, { status: 201 });
  response.headers.set("Set-Cookie", playerIdCookieHeader(playerId));
  return response;
}
