// Feature: action-cards
// Property 27: Target Validation Completeness
// **Validates: Requirements 2.4, 2.5, 2.6**
//
// For any card with Target_Requirement `player` and for any `targetPlayerId`,
// the submission is accepted iff targetPlayerId is present, identifies a room member,
// and differs from the submitting player.
// For any card with Target_Requirement `none`, supplying any targetPlayerId results
// in rejection with INVALID_CARD_TARGET.

import fc from "fast-check";
import { describe, it, expect, vi } from "vitest";

// Mock distance utility so drop-ship handler doesn't need a DB
vi.mock("@/lib/map/distance", () => ({
  getShortestPathDistance: vi.fn().mockResolvedValue(5),
  initializeDistanceMatrix: vi.fn().mockResolvedValue(undefined),
  getDistanceMatrix: vi.fn().mockResolvedValue(new Map()),
}));

import { dispatchCard } from "@/lib/turn-engine/cards/dispatcher";
import { CARD_POOL, CardIdentifier } from "@/lib/turn-engine/cards/types";
import { CARD_REGISTRY } from "@/lib/turn-engine/cards/registry";

// --- Derive card groups from registry metadata ---

const PLAYER_TARGETED_CARDS: CardIdentifier[] = CARD_POOL.filter(
  (id) => CARD_REGISTRY.get(id)!.targetRequirement === "player"
);

const NON_TARGETED_CARDS: CardIdentifier[] = CARD_POOL.filter(
  (id) => CARD_REGISTRY.get(id)!.targetRequirement === "none"
);

// --- Mock Transaction ---

function makeMockTx(opts: { targetIsMember: boolean; originLocationId?: string } = { targetIsMember: false }) {
  return {
    roomPlayer: {
      findUnique: vi.fn().mockResolvedValue(
        opts.targetIsMember ? { playerId: "target", roomId: "room" } : null
      ),
    },
    playerPosition: {
      update: vi.fn().mockResolvedValue({}),
    },
    blockade: {
      create: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({}),
    },
    gameEvent: {
      aggregate: vi.fn().mockResolvedValue({ _max: { sequenceNumber: 0 } }),
      create: vi.fn().mockResolvedValue({}),
    },
    pendingClue: {
      create: vi.fn().mockResolvedValue({}),
    },
    location: {
      findMany: vi.fn().mockResolvedValue(
        opts.originLocationId
          ? [
              { id: opts.originLocationId, regionId: "region-a" },
              { id: "distant-loc-1", regionId: "region-b" },
            ]
          : []
      ),
    },
  } as any;
}

// --- Arbitraries ---

const arbPlayerId = fc.uuid();
const arbRoomId = fc.uuid();
const arbLocationId = fc.uuid();
const arbRound = fc.integer({ min: 1, max: 20 });
const arbTurnPosition = fc.integer({ min: 0, max: 3 });

describe("Property 27: Target Validation Completeness", () => {
  // **Validates: Requirements 2.4, 2.5, 2.6**

  describe("Cards with Target_Requirement 'player' — accepted iff valid target provided", () => {
    it("accepted when targetPlayerId is present, differs from submitter, and is a room member", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...PLAYER_TARGETED_CARDS),
          arbPlayerId,
          arbRoomId,
          arbLocationId,
          arbRound,
          arbTurnPosition,
          fc.uuid(), // targetPlayerId
          async (cardType, playerId, roomId, locationId, round, turnPos, targetPlayerId) => {
            // Ensure target differs from submitter
            fc.pre(targetPlayerId !== playerId);

            // Target is a room member
            const tx = makeMockTx({ targetIsMember: true });

            const result = await dispatchCard(
              cardType,
              playerId,
              roomId,
              targetPlayerId,
              locationId,
              round,
              turnPos,
              tx,
              () => 0.5
            );

            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("rejected with INVALID_CARD_TARGET when targetPlayerId is missing", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...PLAYER_TARGETED_CARDS),
          arbPlayerId,
          arbRoomId,
          arbLocationId,
          arbRound,
          arbTurnPosition,
          async (cardType, playerId, roomId, locationId, round, turnPos) => {
            const tx = makeMockTx({ targetIsMember: true });

            const result = await dispatchCard(
              cardType,
              playerId,
              roomId,
              undefined, // missing target
              locationId,
              round,
              turnPos,
              tx,
              () => 0.5
            );

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.code).toBe("INVALID_CARD_TARGET");
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("rejected with INVALID_CARD_TARGET when targetPlayerId equals the submitting player", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...PLAYER_TARGETED_CARDS),
          arbPlayerId,
          arbRoomId,
          arbLocationId,
          arbRound,
          arbTurnPosition,
          async (cardType, playerId, roomId, locationId, round, turnPos) => {
            const tx = makeMockTx({ targetIsMember: true });

            const result = await dispatchCard(
              cardType,
              playerId,
              roomId,
              playerId, // self-target
              locationId,
              round,
              turnPos,
              tx,
              () => 0.5
            );

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.code).toBe("INVALID_CARD_TARGET");
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("rejected with INVALID_CARD_TARGET when targetPlayerId is not a room member", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...PLAYER_TARGETED_CARDS),
          arbPlayerId,
          arbRoomId,
          arbLocationId,
          arbRound,
          arbTurnPosition,
          fc.uuid(), // targetPlayerId
          async (cardType, playerId, roomId, locationId, round, turnPos, targetPlayerId) => {
            fc.pre(targetPlayerId !== playerId);

            // Target is NOT a room member
            const tx = makeMockTx({ targetIsMember: false });

            const result = await dispatchCard(
              cardType,
              playerId,
              roomId,
              targetPlayerId,
              locationId,
              round,
              turnPos,
              tx,
              () => 0.5
            );

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.code).toBe("INVALID_CARD_TARGET");
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Cards with Target_Requirement 'none' — supplying any target is rejected", () => {
    it("rejected with INVALID_CARD_TARGET when any targetPlayerId is supplied", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...NON_TARGETED_CARDS),
          arbPlayerId,
          arbRoomId,
          arbLocationId,
          arbRound,
          arbTurnPosition,
          fc.uuid(), // extraneous targetPlayerId
          async (cardType, playerId, roomId, locationId, round, turnPos, targetPlayerId) => {
            // Ensure target differs from player so it doesn't get caught by self-target logic
            fc.pre(targetPlayerId !== playerId);

            const tx = makeMockTx({ targetIsMember: true });

            const result = await dispatchCard(
              cardType,
              playerId,
              roomId,
              targetPlayerId, // should not be allowed
              locationId,
              round,
              turnPos,
              tx,
              () => 0.5
            );

            expect(result.success).toBe(false);
            if (!result.success) {
              expect(result.code).toBe("INVALID_CARD_TARGET");
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it("accepted when no targetPlayerId is supplied", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...NON_TARGETED_CARDS),
          arbPlayerId,
          arbRoomId,
          arbLocationId,
          arbRound,
          arbTurnPosition,
          async (cardType, playerId, roomId, locationId, round, turnPos) => {
            const tx = makeMockTx({ targetIsMember: false, originLocationId: locationId });

            const result = await dispatchCard(
              cardType,
              playerId,
              roomId,
              undefined, // no target
              locationId,
              round,
              turnPos,
              tx,
              () => 0.5
            );

            expect(result.success).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("Exhaustive card type × target scenario combinations", () => {
    it("every card type handles all target scenarios correctly", async () => {
      // For each card type, generate target scenarios and verify the decision
      type TargetScenario =
        | { kind: "no-target" }
        | { kind: "self-target" }
        | { kind: "valid-member" }
        | { kind: "non-member" };

      const arbTargetScenario: fc.Arbitrary<TargetScenario> = fc.constantFrom(
        { kind: "no-target" } as TargetScenario,
        { kind: "self-target" } as TargetScenario,
        { kind: "valid-member" } as TargetScenario,
        { kind: "non-member" } as TargetScenario
      );

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...CARD_POOL),
          arbTargetScenario,
          arbPlayerId,
          arbRoomId,
          arbLocationId,
          arbRound,
          arbTurnPosition,
          async (cardType, scenario, playerId, roomId, locationId, round, turnPos) => {
            const definition = CARD_REGISTRY.get(cardType)!;

            // Derive targetPlayerId and tx mock from scenario
            let targetPlayerId: string | undefined;
            let isMember = false;

            switch (scenario.kind) {
              case "no-target":
                targetPlayerId = undefined;
                break;
              case "self-target":
                targetPlayerId = playerId;
                break;
              case "valid-member":
                targetPlayerId = `other-${playerId}`;
                isMember = true;
                break;
              case "non-member":
                targetPlayerId = `other-${playerId}`;
                isMember = false;
                break;
            }

            const tx = makeMockTx({ targetIsMember: isMember, originLocationId: locationId });

            const result = await dispatchCard(
              cardType,
              playerId,
              roomId,
              targetPlayerId,
              locationId,
              round,
              turnPos,
              tx,
              () => 0.5
            );

            // Determine expected outcome based on target requirement and scenario
            if (definition.targetRequirement === "player") {
              // Acceptance: target present + is member + not self
              if (scenario.kind === "valid-member") {
                expect(result.success).toBe(true);
              } else {
                // All other scenarios should be rejected
                expect(result.success).toBe(false);
                if (!result.success) {
                  expect(result.code).toBe("INVALID_CARD_TARGET");
                }
              }
            } else {
              // targetRequirement === "none"
              if (scenario.kind === "no-target") {
                expect(result.success).toBe(true);
              } else {
                // Any target supplied → rejection
                expect(result.success).toBe(false);
                if (!result.success) {
                  expect(result.code).toBe("INVALID_CARD_TARGET");
                }
              }
            }
          }
        ),
        { numRuns: 200 }
      );
    });
  });
});
