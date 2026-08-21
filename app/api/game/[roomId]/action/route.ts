import { NextRequest, NextResponse } from "next/server";
import { submitAction } from "@/lib/turn-engine";
import { ActionPayload, TurnActionErrorCode } from "@/lib/turn-engine/types";

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

export async function POST(
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

  // Parse action from request body
  let action: ActionPayload;
  try {
    action = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid request body", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  // Validate action shape
  if (!action || !action.actionType) {
    return NextResponse.json(
      { success: false, error: "Missing actionType", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  // Submit the action through the turn engine
  const result = await submitAction(roomId, playerId, action);

  if (result.success) {
    return NextResponse.json(result, { status: 200 });
  }

  // Map error codes to HTTP status codes
  const statusMap: Record<TurnActionErrorCode, number> = {
    NOT_IN_ROOM: 404,
    NOT_YOUR_TURN: 403,
    GAME_NOT_ACTIVE: 409,
    CONCURRENCY_CONFLICT: 409,
    INVALID_MOVE: 422,
    INVALID_TRANSPORT: 422,
    SAME_LOCATION_MOVE: 422,
    DUPLICATE_CAPTURE_ATTEMPT: 422,
    INVALID_CARD: 422,
    HAND_FULL: 422,
    INVALID_SLOT_ORDER: 422,
    UNKNOWN_ACTION_TYPE: 422,
  };

  const statusCode = statusMap[result.code] || 500;
  return NextResponse.json(result, { status: statusCode });
}
