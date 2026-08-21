// **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 17.2, 17.3**

vi.mock("@/lib/turn-engine", () => ({
  submitAction: vi.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "../route";
import { submitAction } from "@/lib/turn-engine";
import type {
  TurnActionSuccess,
  TurnActionError,
} from "@/lib/turn-engine/types";

const mockSubmitAction = submitAction as ReturnType<typeof vi.fn>;

function createRequest(
  body: unknown,
  options: { cookie?: string } = {}
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  return new NextRequest("http://localhost/api/game/test-room-id/action", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function createInvalidJsonRequest(
  options: { cookie?: string } = {}
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  return new NextRequest("http://localhost/api/game/test-room-id/action", {
    method: "POST",
    headers,
    body: "not-valid-json{{{",
  });
}

const defaultParams = { params: Promise.resolve({ roomId: "test-room-id" }) };

describe("POST /api/game/[roomId]/action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("authentication", () => {
    it("returns 401 when no player-id cookie is present", async () => {
      const req = createRequest({ actionType: "SKIP" });
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.code).toBe("UNAUTHENTICATED");
      expect(mockSubmitAction).not.toHaveBeenCalled();
    });

    it("returns 401 when cookie header has no player-id", async () => {
      const req = createRequest(
        { actionType: "SKIP" },
        { cookie: "other-cookie=value" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.success).toBe(false);
      expect(mockSubmitAction).not.toHaveBeenCalled();
    });
  });

  describe("request validation", () => {
    it("returns 400 when body is invalid JSON", async () => {
      const req = createInvalidJsonRequest({ cookie: "player-id=test-player" });
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.code).toBe("INVALID_REQUEST");
    });

    it("returns 400 when body is missing actionType", async () => {
      const req = createRequest(
        { targetLocationId: "loc-1" },
        { cookie: "player-id=test-player" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
      expect(body.code).toBe("INVALID_REQUEST");
    });
  });

  describe("full turn cycle (slot 1 + slot 2 + resolution)", () => {
    it("returns 200 with slot 1 result on successful action", async () => {
      const successResult: TurnActionSuccess = {
        success: true,
        actionType: "MOVE",
        slotNumber: 1,
        remainingSlots: 1,
        updatedLocationId: "location-b",
      };
      mockSubmitAction.mockResolvedValue(successResult);

      const req = createRequest(
        { actionType: "MOVE", targetLocationId: "location-b" },
        { cookie: "player-id=test-player" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.actionType).toBe("MOVE");
      expect(body.slotNumber).toBe(1);
      expect(body.remainingSlots).toBe(1);
      expect(body.updatedLocationId).toBe("location-b");
      expect(mockSubmitAction).toHaveBeenCalledWith(
        "test-room-id",
        "test-player",
        { actionType: "MOVE", targetLocationId: "location-b" }
      );
    });

    it("returns 200 with resolution data when slot 2 completes the turn", async () => {
      const successResult: TurnActionSuccess = {
        success: true,
        actionType: "SKIP",
        slotNumber: 2,
        remainingSlots: 0,
        resolution: {
          spyResult: {
            type: "clue",
            notebookEntry: {
              regionId: "region-1",
              roundNumber: 1,
              stepsAway: 3,
            },
          },
        },
      };
      mockSubmitAction.mockResolvedValue(successResult);

      const req = createRequest(
        { actionType: "SKIP" },
        { cookie: "player-id=test-player" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.slotNumber).toBe(2);
      expect(body.remainingSlots).toBe(0);
      expect(body.resolution).toBeDefined();
      expect(body.resolution.spyResult.type).toBe("clue");
      expect(body.resolution.spyResult.notebookEntry.stepsAway).toBe(3);
    });

    it("passes correct roomId from route params", async () => {
      mockSubmitAction.mockResolvedValue({
        success: true,
        actionType: "SKIP",
        slotNumber: 1,
        remainingSlots: 1,
      });

      const req = createRequest(
        { actionType: "SKIP" },
        { cookie: "player-id=player-abc" }
      );
      const customParams = {
        params: Promise.resolve({ roomId: "custom-room-xyz" }),
      };
      const response = await POST(req, customParams);

      expect(response.status).toBe(200);
      expect(mockSubmitAction).toHaveBeenCalledWith(
        "custom-room-xyz",
        "player-abc",
        { actionType: "SKIP" }
      );
    });
  });

  describe("not-your-turn rejection (wrong player -> 403)", () => {
    it("returns 403 when submitAction returns NOT_YOUR_TURN error", async () => {
      const errorResult: TurnActionError = {
        success: false,
        error: "It is not your turn",
        code: "NOT_YOUR_TURN",
      };
      mockSubmitAction.mockResolvedValue(errorResult);

      const req = createRequest(
        { actionType: "MOVE", targetLocationId: "loc-1" },
        { cookie: "player-id=wrong-player" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.code).toBe("NOT_YOUR_TURN");
    });
  });

  describe("invalid move rejection (non-adjacent -> 422)", () => {
    it("returns 422 when submitAction returns INVALID_MOVE error", async () => {
      const errorResult: TurnActionError = {
        success: false,
        error: "Target location is not adjacent",
        code: "INVALID_MOVE",
      };
      mockSubmitAction.mockResolvedValue(errorResult);

      const req = createRequest(
        { actionType: "MOVE", targetLocationId: "non-adjacent-loc" },
        { cookie: "player-id=test-player" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.success).toBe(false);
      expect(body.code).toBe("INVALID_MOVE");
    });

    it("returns 422 when submitAction returns INVALID_TRANSPORT error", async () => {
      const errorResult: TurnActionError = {
        success: false,
        error: "Invalid transport: plane requires both endpoints to be hubs",
        code: "INVALID_TRANSPORT",
      };
      mockSubmitAction.mockResolvedValue(errorResult);

      const req = createRequest(
        { actionType: "MOVE", targetLocationId: "non-hub-loc" },
        { cookie: "player-id=test-player" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.success).toBe(false);
      expect(body.code).toBe("INVALID_TRANSPORT");
    });

    it("returns 422 when submitAction returns SAME_LOCATION_MOVE error", async () => {
      const errorResult: TurnActionError = {
        success: false,
        error: "Cannot move to the same location",
        code: "SAME_LOCATION_MOVE",
      };
      mockSubmitAction.mockResolvedValue(errorResult);

      const req = createRequest(
        { actionType: "MOVE", targetLocationId: "current-loc" },
        { cookie: "player-id=test-player" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.success).toBe(false);
      expect(body.code).toBe("SAME_LOCATION_MOVE");
    });

    it("returns 422 when submitAction returns DUPLICATE_CAPTURE_ATTEMPT error", async () => {
      const errorResult: TurnActionError = {
        success: false,
        error: "Only one capture attempt per turn",
        code: "DUPLICATE_CAPTURE_ATTEMPT",
      };
      mockSubmitAction.mockResolvedValue(errorResult);

      const req = createRequest(
        { actionType: "CAPTURE_ATTEMPT" },
        { cookie: "player-id=test-player" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.success).toBe(false);
      expect(body.code).toBe("DUPLICATE_CAPTURE_ATTEMPT");
    });
  });

  describe("game-end flow (win -> room status finished, subsequent actions rejected)", () => {
    it("returns 200 with game-won resolution on successful capture", async () => {
      const successResult: TurnActionSuccess = {
        success: true,
        actionType: "CAPTURE_ATTEMPT",
        slotNumber: 2,
        remainingSlots: 0,
        resolution: {
          captureAttempt: {
            result: "success",
            locationId: "mastermind-loc",
            winnerId: "test-player",
            mastermindLocationId: "mastermind-loc",
          },
        },
      };
      mockSubmitAction.mockResolvedValue(successResult);

      const req = createRequest(
        { actionType: "SKIP" },
        { cookie: "player-id=test-player" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.resolution.captureAttempt.result).toBe("success");
      expect(body.resolution.captureAttempt.winnerId).toBe("test-player");
      expect(body.resolution.captureAttempt.mastermindLocationId).toBe(
        "mastermind-loc"
      );
    });

    it("returns 409 when game is no longer active (finished)", async () => {
      const errorResult: TurnActionError = {
        success: false,
        error: "Game not active",
        code: "GAME_NOT_ACTIVE",
      };
      mockSubmitAction.mockResolvedValue(errorResult);

      const req = createRequest(
        { actionType: "SKIP" },
        { cookie: "player-id=test-player" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.code).toBe("GAME_NOT_ACTIVE");
    });
  });

  describe("concurrency (race two requests, only one succeeds)", () => {
    it("returns 409 when submitAction returns CONCURRENCY_CONFLICT error", async () => {
      const errorResult: TurnActionError = {
        success: false,
        error: "Concurrency conflict — retry your action",
        code: "CONCURRENCY_CONFLICT",
      };
      mockSubmitAction.mockResolvedValue(errorResult);

      const req = createRequest(
        { actionType: "MOVE", targetLocationId: "loc-1" },
        { cookie: "player-id=test-player" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.success).toBe(false);
      expect(body.code).toBe("CONCURRENCY_CONFLICT");
    });

    it("handles race condition: first request succeeds, second gets conflict", async () => {
      // Simulate: first call succeeds, second call returns concurrency error
      mockSubmitAction
        .mockResolvedValueOnce({
          success: true,
          actionType: "MOVE",
          slotNumber: 1,
          remainingSlots: 1,
          updatedLocationId: "loc-1",
        } as TurnActionSuccess)
        .mockResolvedValueOnce({
          success: false,
          error: "Concurrency conflict — retry your action",
          code: "CONCURRENCY_CONFLICT",
        } as TurnActionError);

      const req1 = createRequest(
        { actionType: "MOVE", targetLocationId: "loc-1" },
        { cookie: "player-id=test-player" }
      );
      const req2 = createRequest(
        { actionType: "MOVE", targetLocationId: "loc-1" },
        { cookie: "player-id=test-player" }
      );

      // Fire both requests concurrently
      const [response1, response2] = await Promise.all([
        POST(req1, { params: Promise.resolve({ roomId: "test-room-id" }) }),
        POST(req2, { params: Promise.resolve({ roomId: "test-room-id" }) }),
      ]);

      const body1 = await response1.json();
      const body2 = await response2.json();

      expect(response1.status).toBe(200);
      expect(body1.success).toBe(true);

      expect(response2.status).toBe(409);
      expect(body2.success).toBe(false);
      expect(body2.code).toBe("CONCURRENCY_CONFLICT");
    });
  });

  describe("additional error code mappings", () => {
    it("returns 404 when player is NOT_IN_ROOM", async () => {
      const errorResult: TurnActionError = {
        success: false,
        error: "Player not in a room",
        code: "NOT_IN_ROOM",
      };
      mockSubmitAction.mockResolvedValue(errorResult);

      const req = createRequest(
        { actionType: "SKIP" },
        { cookie: "player-id=test-player" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.code).toBe("NOT_IN_ROOM");
    });

    it("returns 422 when INVALID_CARD error", async () => {
      const errorResult: TurnActionError = {
        success: false,
        error: "Card not found or already consumed",
        code: "INVALID_CARD",
      };
      mockSubmitAction.mockResolvedValue(errorResult);

      const req = createRequest(
        { actionType: "USE_CARD", cardId: "bad-card" },
        { cookie: "player-id=test-player" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.success).toBe(false);
      expect(body.code).toBe("INVALID_CARD");
    });

    it("returns 422 when INVALID_SLOT_ORDER error", async () => {
      const errorResult: TurnActionError = {
        success: false,
        error: "Must submit slot 1 before slot 2",
        code: "INVALID_SLOT_ORDER",
      };
      mockSubmitAction.mockResolvedValue(errorResult);

      const req = createRequest(
        { actionType: "SKIP" },
        { cookie: "player-id=test-player" }
      );
      const response = await POST(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(422);
      expect(body.success).toBe(false);
      expect(body.code).toBe("INVALID_SLOT_ORDER");
    });
  });
});
