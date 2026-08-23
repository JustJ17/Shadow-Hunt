// Feature: action-cards
// Property 3: Open All Roads Universal Wipe
// **Validates: Requirements 7.1, 7.2, 7.3, 7.6**

import fc from "fast-check";
import { handleOpenAllRoads } from "../open-all-roads";
import { getActiveBlockades } from "../blockade-utils";
import type { CardEffectContext } from "../../types";
import type { TransportType } from "@/lib/map/types";

const TRANSPORT_TYPES: TransportType[] = ["car", "plane", "boat"];

/**
 * Property 3: Open All Roads Universal Wipe
 *
 * For any set of Active_Blockades (varying in count, transport type, and caster),
 * playing `open-all-roads` results in an empty Active_Blockade set. Playing it a
 * second time produces the same (empty) result — the operation is idempotent on
 * the blockade state.
 */
describe("Open All Roads Universal Wipe — Property 3", () => {
  /**
   * Creates a mock transaction client that simulates blockade state.
   * The blockades array is mutable — updateMany modifies it in place to
   * allow verifying state after handler invocation.
   */
  function createMockTx(blockades: Array<{ id: string; roomId: string; lifted: boolean; [key: string]: unknown }>) {
    let sequenceNumber = 0;

    return {
      blockade: {
        findMany: vi.fn().mockImplementation(({ where }) => {
          return Promise.resolve(
            blockades.filter((b) => b.roomId === where.roomId && b.lifted === where.lifted)
          );
        }),
        updateMany: vi.fn().mockImplementation(({ where, data }) => {
          const ids: string[] = where.id.in;
          for (const b of blockades) {
            if (ids.includes(b.id)) {
              b.lifted = data.lifted;
            }
          }
          return Promise.resolve({ count: ids.length });
        }),
      },
      gameEvent: {
        aggregate: vi.fn().mockImplementation(() => {
          return Promise.resolve({ _max: { sequenceNumber: sequenceNumber } });
        }),
        create: vi.fn().mockImplementation(() => {
          sequenceNumber++;
          return Promise.resolve({});
        }),
      },
    } as unknown as CardEffectContext["tx"];
  }

  /**
   * Generates an arbitrary set of blockade records that are all active
   * (i.e., within the blockade window for the "current" turn ordinal).
   *
   * We fix currentRound = creationRound and currentTurnPosition > casterTurnPosition
   * to guarantee all generated blockades are in-window.
   */
  const arbBlockadeSet = fc
    .record({
      roomId: fc.uuid(),
      currentRound: fc.integer({ min: 1, max: 50 }),
      count: fc.integer({ min: 0, max: 10 }),
    })
    .chain(({ roomId, currentRound, count }) => {
      return fc
        .record({
          casterTurnPositions: fc.array(fc.integer({ min: 0, max: 4 }), {
            minLength: count,
            maxLength: count,
          }),
          transportTypes: fc.array(fc.constantFrom(...TRANSPORT_TYPES), {
            minLength: count,
            maxLength: count,
          }),
          casterPlayerIds: fc.array(fc.uuid(), { minLength: count, maxLength: count }),
          playerId: fc.uuid(),
        })
        .map(({ casterTurnPositions, transportTypes, casterPlayerIds, playerId }) => {
          const blockades = Array.from({ length: count }, (_, i) => ({
            id: `blockade-${i}`,
            roomId,
            transportType: transportTypes[i],
            casterPlayerId: casterPlayerIds[i],
            creationRound: currentRound,
            casterTurnPosition: casterTurnPositions[i],
            lifted: false,
          }));

          // Current turn position must be strictly greater than ALL caster positions
          const maxCasterPos =
            blockades.length > 0
              ? Math.max(...blockades.map((b) => b.casterTurnPosition))
              : 0;

          return {
            roomId,
            currentRound,
            currentTurnPosition: maxCasterPos + 1,
            blockades,
            playerId,
          };
        });
    });

  it("after playing open-all-roads, all active blockades are lifted (universal wipe)", async () => {
    await fc.assert(
      fc.asyncProperty(arbBlockadeSet, async ({ roomId, currentRound, currentTurnPosition, blockades, playerId }) => {
        const tx = createMockTx(blockades);

        const ctx: CardEffectContext = {
          roomId,
          playerId,
          playerLocationId: "loc-1",
          currentRound,
          casterTurnPosition: currentTurnPosition,
          tx,
          rng: Math.random,
        };

        // Play open-all-roads
        await handleOpenAllRoads(ctx);

        // After the call, all blockades should be lifted
        const activeAfter = await getActiveBlockades(roomId, currentRound, currentTurnPosition, tx);
        expect(activeAfter).toHaveLength(0);

        // Verify the underlying records are all marked lifted
        for (const b of blockades) {
          expect(b.lifted).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("playing open-all-roads a second time produces the same empty result (idempotence)", async () => {
    await fc.assert(
      fc.asyncProperty(arbBlockadeSet, async ({ roomId, currentRound, currentTurnPosition, blockades, playerId }) => {
        const tx = createMockTx(blockades);

        const ctx: CardEffectContext = {
          roomId,
          playerId,
          playerLocationId: "loc-1",
          currentRound,
          casterTurnPosition: currentTurnPosition,
          tx,
          rng: Math.random,
        };

        // First play
        await handleOpenAllRoads(ctx);
        const activeAfterFirst = await getActiveBlockades(roomId, currentRound, currentTurnPosition, tx);
        expect(activeAfterFirst).toHaveLength(0);

        // Second play — should not throw, and result is still empty
        await handleOpenAllRoads(ctx);
        const activeAfterSecond = await getActiveBlockades(roomId, currentRound, currentTurnPosition, tx);
        expect(activeAfterSecond).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });

  it("open-all-roads lifts blockades of ALL transport types equally", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.uuid(), // playerId
        fc.integer({ min: 1, max: 50 }), // currentRound
        fc.integer({ min: 0, max: 4 }), // casterTurnPosition (for blockades)
        async (roomId, playerId, currentRound, casterPos) => {
          // Create one blockade of each transport type
          const blockades = TRANSPORT_TYPES.map((transport, i) => ({
            id: `blockade-${transport}-${i}`,
            roomId,
            transportType: transport,
            casterPlayerId: `caster-${i}`,
            creationRound: currentRound,
            casterTurnPosition: casterPos,
            lifted: false,
          }));

          const currentTurnPosition = casterPos + 1; // Ensures all are in-window
          const tx = createMockTx(blockades);

          const ctx: CardEffectContext = {
            roomId,
            playerId,
            playerLocationId: "loc-1",
            currentRound,
            casterTurnPosition: currentTurnPosition,
            tx,
            rng: Math.random,
          };

          await handleOpenAllRoads(ctx);

          // All three transport types' blockades should be lifted
          for (const b of blockades) {
            expect(b.lifted).toBe(true);
          }
          const active = await getActiveBlockades(roomId, currentRound, currentTurnPosition, tx);
          expect(active).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("open-all-roads lifts blockades from all casters including the playing player", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // roomId
        fc.uuid(), // playerId (who plays open-all-roads)
        fc.integer({ min: 1, max: 50 }), // currentRound
        fc.integer({ min: 0, max: 3 }), // casterTurnPosition
        fc.array(fc.uuid(), { minLength: 1, maxLength: 5 }), // other caster ids
        async (roomId, playerId, currentRound, casterPos, otherCasters) => {
          // Create blockades from the player AND from other casters
          const blockades = [
            // Blockade by the playing player
            {
              id: "blockade-self",
              roomId,
              transportType: "car" as string,
              casterPlayerId: playerId,
              creationRound: currentRound,
              casterTurnPosition: casterPos,
              lifted: false,
            },
            // Blockades by other casters
            ...otherCasters.map((casterId, i) => ({
              id: `blockade-other-${i}`,
              roomId,
              transportType: TRANSPORT_TYPES[i % TRANSPORT_TYPES.length] as string,
              casterPlayerId: casterId,
              creationRound: currentRound,
              casterTurnPosition: casterPos,
              lifted: false,
            })),
          ];

          const currentTurnPosition = casterPos + 1;
          const tx = createMockTx(blockades);

          const ctx: CardEffectContext = {
            roomId,
            playerId,
            playerLocationId: "loc-1",
            currentRound,
            casterTurnPosition: currentTurnPosition,
            tx,
            rng: Math.random,
          };

          await handleOpenAllRoads(ctx);

          // ALL blockades — including the one created by playerId — should be lifted
          for (const b of blockades) {
            expect(b.lifted).toBe(true);
          }
          const active = await getActiveBlockades(roomId, currentRound, currentTurnPosition, tx);
          expect(active).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
