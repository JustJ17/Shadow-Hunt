import { NextRequest, NextResponse } from "next/server";
import { getGameResult } from "@/lib/turn-engine/game-result";

const PLAYER_ID_COOKIE = "player-id";

/**
 * Extracts player ID from request cookies.
 * Returns null if no player-id cookie is present (unauthenticated).
 */
function getPlayerId(req: NextRequest): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`${PLAYER_ID_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  // Extract roomId from route params
  const { roomId } = await params;

  // Extract playerId from auth cookie — reject if not authenticated
  const playerId = getPlayerId(request);
  if (!playerId) {
    return NextResponse.json(
      { success: false, error: "Authentication required", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  try {
    const result = await getGameResult(roomId, playerId);
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";

    if (message === "Access denied") {
      return NextResponse.json(
        { success: false, error: "Access denied", code: "ACCESS_DENIED" },
        { status: 403 }
      );
    }
    if (message === "Room not found") {
      return NextResponse.json(
        { success: false, error: "Room not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
