import { describe, it, expect, vi } from "vitest";
import { CARD_REGISTRY } from "@/lib/turn-engine/cards/registry";
import { dispatchCard } from "@/lib/turn-engine/cards/dispatcher";
import { CARD_POOL, LEGACY_CARD_TYPES } from "@/lib/turn-engine/cards/types";
import type { CardIdentifier } from "@/lib/turn-engine/cards/types";

// --- Mock TransactionClient ---

function makeMockTx(overrides: { targetMembership?: unknown } = {}) {
  return {
    roomPlayer: {
      findUnique: vi.fn().mockResolvedValue(overrides.targetMembership ?? null),
    },
    playerPosition: {
      update: vi.fn().mockResolvedValue({}),
    },
    blockade: {
      create: vi.fn().mockResolvedValue({}),
    },
    gameEvent: {
      aggregate: vi.fn().mockResolvedValue({ _max: { sequenceNumber: 0 } }),
      create: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe("Card Registry", () => {
  it("contains exactly 10 entries", () => {
    expect(CARD_REGISTRY.size).toBe(10);
  });

  it("contains all 10 Card_Pool identifiers", () => {
    for (const id of CARD_POOL) {
      expect(CARD_REGISTRY.has(id)).toBe(true);
    }
  });

  describe("category assignments", () => {
    it("assigns sabotage to close-all-roads, close-all-airways, close-all-sea-routes, and lose-an-action", () => {
      const sabotageCards: CardIdentifier[] = [
        "close-all-roads",
        "close-all-airways",
        "close-all-sea-routes",
        "lose-an-action",
      ];
      for (const id of sabotageCards) {
        expect(CARD_REGISTRY.get(id)!.category).toBe("sabotage");
      }
    });

    it("assigns clue to locate-the-mastermind, bug-a-phone, and reveal-direction", () => {
      const clueCards: CardIdentifier[] = [
        "locate-the-mastermind",
        "bug-a-phone",
        "reveal-direction",
      ];
      for (const id of clueCards) {
        expect(CARD_REGISTRY.get(id)!.category).toBe("clue");
      }
    });

    it("assigns booster to drop-ship, extra-turn, and open-all-roads", () => {
      const boosterCards: CardIdentifier[] = ["drop-ship", "extra-turn", "open-all-roads"];
      for (const id of boosterCards) {
        expect(CARD_REGISTRY.get(id)!.category).toBe("booster");
      }
    });
  });

  describe("targetRequirement assignments", () => {
    it("assigns player to lose-an-action only", () => {
      expect(CARD_REGISTRY.get("lose-an-action")!.targetRequirement).toBe("player");
    });

    it("assigns none to all other cards", () => {
      const nonTargetedCards: CardIdentifier[] = [
        "close-all-roads",
        "close-all-airways",
        "close-all-sea-routes",
        "locate-the-mastermind",
        "bug-a-phone",
        "reveal-direction",
        "drop-ship",
        "extra-turn",
        "open-all-roads",
      ];
      for (const id of nonTargetedCards) {
        expect(CARD_REGISTRY.get(id)!.targetRequirement).toBe("none");
      }
    });
  });

  describe("resolutionTiming assignments", () => {
    it("assigns immediate to blockade, lose-an-action, drop-ship, extra-turn, and open-all-roads", () => {
      const immediateCards: CardIdentifier[] = [
        "close-all-roads",
        "close-all-airways",
        "close-all-sea-routes",
        "lose-an-action",
        "drop-ship",
        "extra-turn",
        "open-all-roads",
      ];
      for (const id of immediateCards) {
        expect(CARD_REGISTRY.get(id)!.resolutionTiming).toBe("immediate");
      }
    });

    it("assigns end-of-round to locate-the-mastermind, bug-a-phone, and reveal-direction", () => {
      const endOfRoundCards: CardIdentifier[] = [
        "locate-the-mastermind",
        "bug-a-phone",
        "reveal-direction",
      ];
      for (const id of endOfRoundCards) {
        expect(CARD_REGISTRY.get(id)!.resolutionTiming).toBe("end-of-round");
      }
    });
  });

  it("every entry has a handler function", () => {
    for (const [, def] of CARD_REGISTRY) {
      expect(typeof def.handler).toBe("function");
    }
  });

  it("every entry identifier matches its map key", () => {
    for (const [key, def] of CARD_REGISTRY) {
      expect(def.identifier).toBe(key);
    }
  });
});

describe("Card Dispatcher - dispatchCard", () => {
  const defaultArgs = {
    playerId: "player-1",
    roomId: "room-1",
    playerLocationId: "loc-1",
    currentRound: 1,
    casterTurnPosition: 0,
    rng: () => 0.5,
  };

  describe("unknown card type rejection", () => {
    it("returns UNKNOWN_CARD_TYPE for a completely unknown card", async () => {
      const tx = makeMockTx();
      const result = await dispatchCard(
        "non-existent-card",
        defaultArgs.playerId,
        defaultArgs.roomId,
        undefined,
        defaultArgs.playerLocationId,
        defaultArgs.currentRound,
        defaultArgs.casterTurnPosition,
        tx,
        defaultArgs.rng
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("UNKNOWN_CARD_TYPE");
      }
    });

    it.each(LEGACY_CARD_TYPES)(
      "returns UNKNOWN_CARD_TYPE for legacy card type '%s'",
      async (legacyType) => {
        const tx = makeMockTx();
        const result = await dispatchCard(
          legacyType,
          defaultArgs.playerId,
          defaultArgs.roomId,
          undefined,
          defaultArgs.playerLocationId,
          defaultArgs.currentRound,
          defaultArgs.casterTurnPosition,
          tx,
          defaultArgs.rng
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.code).toBe("UNKNOWN_CARD_TYPE");
        }
      }
    );
  });

  describe("target validation for player-targeted cards (lose-an-action)", () => {
    it("returns INVALID_CARD_TARGET when no target is provided", async () => {
      const tx = makeMockTx();
      const result = await dispatchCard(
        "lose-an-action",
        defaultArgs.playerId,
        defaultArgs.roomId,
        undefined,
        defaultArgs.playerLocationId,
        defaultArgs.currentRound,
        defaultArgs.casterTurnPosition,
        tx,
        defaultArgs.rng
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_CARD_TARGET");
        expect(result.message).toContain("requires a target");
      }
    });

    it("returns INVALID_CARD_TARGET when targeting self", async () => {
      const tx = makeMockTx();
      const result = await dispatchCard(
        "lose-an-action",
        defaultArgs.playerId,
        defaultArgs.roomId,
        defaultArgs.playerId, // targeting self
        defaultArgs.playerLocationId,
        defaultArgs.currentRound,
        defaultArgs.casterTurnPosition,
        tx,
        defaultArgs.rng
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_CARD_TARGET");
        expect(result.message).toContain("Cannot target yourself");
      }
    });

    it("returns INVALID_CARD_TARGET when target is not a room member", async () => {
      const tx = makeMockTx({ targetMembership: null });
      const result = await dispatchCard(
        "lose-an-action",
        defaultArgs.playerId,
        defaultArgs.roomId,
        "player-not-in-room",
        defaultArgs.playerLocationId,
        defaultArgs.currentRound,
        defaultArgs.casterTurnPosition,
        tx,
        defaultArgs.rng
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_CARD_TARGET");
        expect(result.message).toContain("not in this room");
      }
      // Verify tx.roomPlayer.findUnique was called to check membership
      expect(tx.roomPlayer.findUnique).toHaveBeenCalledWith({
        where: {
          playerId_roomId: { playerId: "player-not-in-room", roomId: defaultArgs.roomId },
        },
      });
    });

    it("succeeds with valid target who is a room member", async () => {
      const tx = makeMockTx({
        targetMembership: { playerId: "player-2", roomId: "room-1" },
      });
      const result = await dispatchCard(
        "lose-an-action",
        defaultArgs.playerId,
        defaultArgs.roomId,
        "player-2",
        defaultArgs.playerLocationId,
        defaultArgs.currentRound,
        defaultArgs.casterTurnPosition,
        tx,
        defaultArgs.rng
      );

      expect(result.success).toBe(true);
    });
  });

  describe("target validation for non-targeted cards", () => {
    it("returns INVALID_CARD_TARGET when target supplied for a non-targeted card", async () => {
      const tx = makeMockTx();
      const result = await dispatchCard(
        "close-all-roads",
        defaultArgs.playerId,
        defaultArgs.roomId,
        "player-2", // target not allowed
        defaultArgs.playerLocationId,
        defaultArgs.currentRound,
        defaultArgs.casterTurnPosition,
        tx,
        defaultArgs.rng
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe("INVALID_CARD_TARGET");
        expect(result.message).toContain("does not accept a target");
      }
    });
  });

  describe("successful dispatch", () => {
    it("returns success: true for a valid non-targeted card with no target", async () => {
      const tx = makeMockTx();
      const result = await dispatchCard(
        "close-all-roads",
        defaultArgs.playerId,
        defaultArgs.roomId,
        undefined,
        defaultArgs.playerLocationId,
        defaultArgs.currentRound,
        defaultArgs.casterTurnPosition,
        tx,
        defaultArgs.rng
      );

      expect(result.success).toBe(true);
    });

    it("invokes the handler when dispatch succeeds", async () => {
      const tx = makeMockTx({
        targetMembership: { playerId: "player-2", roomId: "room-1" },
      });
      // For lose-an-action with valid target, the no-op handler runs without error
      const result = await dispatchCard(
        "lose-an-action",
        defaultArgs.playerId,
        defaultArgs.roomId,
        "player-2",
        defaultArgs.playerLocationId,
        defaultArgs.currentRound,
        defaultArgs.casterTurnPosition,
        tx,
        defaultArgs.rng
      );

      expect(result.success).toBe(true);
    });
  });
});
