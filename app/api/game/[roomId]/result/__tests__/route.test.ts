// **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8**

vi.mock("@/lib/turn-engine/game-result", () => ({
  getGameResult: vi.fn(),
}));

import { NextRequest } from "next/server";
import { GET } from "../route";
import { getGameResult } from "@/lib/turn-engine/game-result";
import type {
  GameResultWin,
  GameResultDraw,
  GameResultInProgress,
} from "@/lib/turn-engine/game-result";

const mockGetGameResult = getGameResult as ReturnType<typeof vi.fn>;

function createRequest(options: { cookie?: string } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (options.cookie) {
    headers.cookie = options.cookie;
  }
  return new NextRequest("http://localhost/api/game/test-room-id/result", {
    method: "GET",
    headers,
  });
}

const defaultParams = { params: Promise.resolve({ roomId: "test-room-id" }) };

describe("GET /api/game/[roomId]/result", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("authentication (Requirement 9.7)", () => {
    it("returns 401 when no player-id cookie is present", async () => {
      const req = createRequest();
      const response = await GET(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Authentication required");
      expect(body.code).toBe("UNAUTHENTICATED");
      expect(mockGetGameResult).not.toHaveBeenCalled();
    });

    it("returns 401 when cookie header has no player-id", async () => {
      const req = createRequest({ cookie: "other-cookie=value" });
      const response = await GET(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.success).toBe(false);
      expect(body.code).toBe("UNAUTHENTICATED");
      expect(mockGetGameResult).not.toHaveBeenCalled();
    });
  });

  describe("access control (Requirement 9.5)", () => {
    it("returns 403 when player is not a room member", async () => {
      mockGetGameResult.mockRejectedValue(new Error("Access denied"));

      const req = createRequest({ cookie: "player-id=non-member-player" });
      const response = await GET(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Access denied");
      expect(body.code).toBe("ACCESS_DENIED");
    });
  });

  describe("room not found (Requirement 9.8)", () => {
    it("returns 404 when room does not exist", async () => {
      mockGetGameResult.mockRejectedValue(new Error("Room not found"));

      const req = createRequest({ cookie: "player-id=test-player" });
      const customParams = {
        params: Promise.resolve({ roomId: "non-existent-room" }),
      };
      const response = await GET(req, customParams);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Room not found");
      expect(body.code).toBe("NOT_FOUND");
    });
  });

  describe("in-progress game (Requirement 9.4)", () => {
    it("returns 200 with in-progress outcome when game is not finished", async () => {
      const inProgressResult: GameResultInProgress = {
        outcome: "in-progress",
      };
      mockGetGameResult.mockResolvedValue(inProgressResult);

      const req = createRequest({ cookie: "player-id=test-player" });
      const response = await GET(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.outcome).toBe("in-progress");
      expect(body).not.toHaveProperty("winnerId");
      expect(body).not.toHaveProperty("roundNumber");
      expect(body).not.toHaveProperty("reason");
    });
  });

  describe("win outcome (Requirement 9.2)", () => {
    it("returns 200 with complete win response shape", async () => {
      const winResult: GameResultWin = {
        outcome: "win",
        winnerId: "winner-player-id",
        winnerDisplayName: "ShadowSlayer",
        winLocationId: "location-abc",
        winLocationName: "Central Park",
        mastermindLocationId: "location-abc",
        mastermindLocationName: "Central Park",
        roundNumber: 5,
      };
      mockGetGameResult.mockResolvedValue(winResult);

      const req = createRequest({ cookie: "player-id=test-player" });
      const response = await GET(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.outcome).toBe("win");
      expect(body.winnerId).toBe("winner-player-id");
      expect(body.winnerDisplayName).toBe("ShadowSlayer");
      expect(body.winLocationId).toBe("location-abc");
      expect(body.winLocationName).toBe("Central Park");
      expect(body.mastermindLocationId).toBe("location-abc");
      expect(body.mastermindLocationName).toBe("Central Park");
      expect(body.roundNumber).toBe(5);
    });

    it("passes correct roomId and playerId to getGameResult", async () => {
      mockGetGameResult.mockResolvedValue({ outcome: "in-progress" });

      const req = createRequest({ cookie: "player-id=player-xyz" });
      const customParams = {
        params: Promise.resolve({ roomId: "room-456" }),
      };
      await GET(req, customParams);

      expect(mockGetGameResult).toHaveBeenCalledWith("room-456", "player-xyz");
    });
  });

  describe("draw outcome (Requirement 9.3)", () => {
    it("returns 200 with complete draw response shape", async () => {
      const drawResult: GameResultDraw = {
        outcome: "draw",
        roundNumber: 20,
        reason: "max-rounds-exceeded",
        mastermindLocationId: "location-hidden",
        mastermindLocationName: "Abandoned Warehouse",
      };
      mockGetGameResult.mockResolvedValue(drawResult);

      const req = createRequest({ cookie: "player-id=test-player" });
      const response = await GET(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.outcome).toBe("draw");
      expect(body.roundNumber).toBe(20);
      expect(body.reason).toBe("max-rounds-exceeded");
      expect(body.mastermindLocationId).toBe("location-hidden");
      expect(body.mastermindLocationName).toBe("Abandoned Warehouse");
      expect(body).not.toHaveProperty("winnerId");
      expect(body).not.toHaveProperty("winLocationId");
    });
  });

  describe("internal server error", () => {
    it("returns 500 when an unexpected error occurs", async () => {
      mockGetGameResult.mockRejectedValue(new Error("Database connection lost"));

      const req = createRequest({ cookie: "player-id=test-player" });
      const response = await GET(req, defaultParams);
      const body = await response.json();

      expect(response.status).toBe(500);
      expect(body.success).toBe(false);
      expect(body.error).toBe("Internal server error");
      expect(body.code).toBe("INTERNAL_ERROR");
    });
  });
});
