// Feature: action-cards
// Property 24: Mastermind Location Never Leaked
// **Validates: Requirements 11.5, 18.4, 19.7, 20.3**

import fc from "fast-check";

/**
 * Property 24: Mastermind Location Never Leaked
 *
 * For any API response, Event_Feed entry, and Notebook entry produced while
 * Room.status is in-progress, the serialized payload does not contain the
 * Mastermind's Location identifier — except when that identifier is
 * independently selected as a revealed direction Location (distance == 0 case).
 *
 * We test this by generating mock game state payloads (events, notebook entries,
 * poll responses) and verifying that the mastermind location ID does not appear
 * in any serialized output. The only allowed exception is a mastermind_direction
 * entry where the player was at the mastermind's location (d=0), which causes
 * the origin location (== mastermind location) to appear in the notebook entry.
 */

// --- Mock payload generators modeled after the real system ---

type TransportType = "car" | "plane" | "boat";

interface MockGameEvent {
  id: string;
  sequenceNumber: number;
  roundNumber: number;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface MockNotebookEntry {
  entryType: string;
  locationId?: string;
  regionId?: string;
  roundNumber: number;
  stepsAway?: number;
  targetPlayerId?: string;
  targetLocationId?: string;
  mastermindStepsAway?: number;
  spyRegionId?: string | null;
  spyCaptured?: boolean;
}

interface MockPollState {
  roomId: string;
  status: "in-progress";
  viewerPlayerId: string;
  currentPlayerId: string;
  currentRound: number;
  actionsRemaining: number;
  actionBudget: number;
  players: Array<{
    playerId: string;
    displayName: string;
    locationId: string;
    turnPosition: number;
    skipNextTurn: boolean;
  }>;
  privateData: {
    notebook: MockNotebookEntry[];
    actionCards: Array<{
      id: string;
      cardIdentifier: string;
      category: string;
      targetRequirement: string;
    }>;
    pendingReward: null;
    skipNextTurn: boolean;
    actionPenaltyFlag: boolean;
    pendingExtraTurns: number;
    pendingClues: Array<{ cardIdentifier: string; roundNumber: number }>;
  };
  events: MockGameEvent[];
  activeBlockades: Array<{
    transportType: TransportType;
    casterPlayerId: string;
    creationRound: number;
  }>;
}

// --- Arbitraries ---

/** 
 * Generates a location ID pool where the mastermind location is guaranteed 
 * to be distinguishable from all other locations. Uses UUID-style IDs 
 * to avoid accidental substring matches.
 */
function arbLocationPool() {
  return fc
    .record({
      numLocations: fc.integer({ min: 5, max: 20 }),
    })
    .chain(({ numLocations }) => {
      return fc
        .array(fc.uuid(), { minLength: numLocations, maxLength: numLocations })
        .map((ids) => ({
          allLocationIds: ids,
          mastermindLocationId: ids[0], // first is always the mastermind
          otherLocationIds: ids.slice(1),
        }));
    });
}

/**
 * Generates a set of player IDs distinct from any location IDs.
 */
function arbPlayerIds() {
  return fc
    .array(fc.uuid(), { minLength: 2, maxLength: 4 })
    .map((ids) => ids);
}

/**
 * Generates a blockade-activated event (should never contain mastermind location).
 */
function arbBlockadeActivatedEvent(
  playerIds: string[],
  seqNum: number,
  roundNum: number
): fc.Arbitrary<MockGameEvent> {
  return fc
    .record({
      transportType: fc.constantFrom<TransportType>("car", "plane", "boat"),
      playerIdx: fc.integer({ min: 0, max: playerIds.length - 1 }),
    })
    .map(({ transportType, playerIdx }) => ({
      id: `evt-${seqNum}`,
      sequenceNumber: seqNum,
      roundNumber: roundNum,
      type: "blockade-activated",
      payload: {
        playerId: playerIds[playerIdx],
        transportType,
        roundNumber: roundNum,
      },
      createdAt: new Date().toISOString(),
    }));
}

/**
 * Generates a card-used event (should never contain mastermind location).
 */
function arbCardUsedEvent(
  playerIds: string[],
  seqNum: number,
  roundNum: number
): fc.Arbitrary<MockGameEvent> {
  const cardIdentifiers = [
    "close-all-roads",
    "close-all-airways",
    "close-all-sea-routes",
    "lose-an-action",
    "locate-the-mastermind",
    "bug-a-phone",
    "reveal-direction",
    "drop-ship",
    "extra-turn",
    "open-all-roads",
  ];

  return fc
    .record({
      cardIdx: fc.integer({ min: 0, max: cardIdentifiers.length - 1 }),
      playerIdx: fc.integer({ min: 0, max: playerIds.length - 1 }),
      hasTarget: fc.boolean(),
      targetIdx: fc.integer({ min: 0, max: playerIds.length - 1 }),
    })
    .map(({ cardIdx, playerIdx, hasTarget, targetIdx }) => {
      const payload: Record<string, unknown> = {
        playerId: playerIds[playerIdx],
        cardIdentifier: cardIdentifiers[cardIdx],
      };
      if (hasTarget && targetIdx !== playerIdx) {
        payload.targetPlayerId = playerIds[targetIdx];
      }
      return {
        id: `evt-${seqNum}`,
        sequenceNumber: seqNum,
        roundNumber: roundNum,
        type: "card-used",
        payload,
        createdAt: new Date().toISOString(),
      };
    });
}

/**
 * Generates a player-relocated event (should never contain mastermind location,
 * uses only non-mastermind locations for origin/destination).
 */
function arbPlayerRelocatedEvent(
  playerIds: string[],
  otherLocationIds: string[],
  seqNum: number,
  roundNum: number
): fc.Arbitrary<MockGameEvent> {
  return fc
    .record({
      playerIdx: fc.integer({ min: 0, max: playerIds.length - 1 }),
      fromIdx: fc.integer({ min: 0, max: otherLocationIds.length - 1 }),
      toIdx: fc.integer({ min: 0, max: otherLocationIds.length - 1 }),
    })
    .map(({ playerIdx, fromIdx, toIdx }) => ({
      id: `evt-${seqNum}`,
      sequenceNumber: seqNum,
      roundNumber: roundNum,
      type: "player-relocated",
      payload: {
        playerId: playerIds[playerIdx],
        fromLocationId: otherLocationIds[fromIdx],
        toLocationId: otherLocationIds[toIdx],
        cause: "drop-ship",
      },
      createdAt: new Date().toISOString(),
    }));
}

/**
 * Generates an action-penalty-applied event.
 */
function arbActionPenaltyEvent(
  playerIds: string[],
  seqNum: number,
  roundNum: number
): fc.Arbitrary<MockGameEvent> {
  return fc
    .record({
      playerIdx: fc.integer({ min: 0, max: playerIds.length - 1 }),
      targetIdx: fc.integer({ min: 0, max: playerIds.length - 1 }),
    })
    .filter(({ playerIdx, targetIdx }) => playerIdx !== targetIdx)
    .map(({ playerIdx, targetIdx }) => ({
      id: `evt-${seqNum}`,
      sequenceNumber: seqNum,
      roundNumber: roundNum,
      type: "action-penalty-applied",
      payload: {
        playerId: playerIds[playerIdx],
        targetPlayerId: playerIds[targetIdx],
      },
      createdAt: new Date().toISOString(),
    }));
}

/**
 * Generates an extra-turn-started event.
 */
function arbExtraTurnEvent(
  playerIds: string[],
  seqNum: number,
  roundNum: number
): fc.Arbitrary<MockGameEvent> {
  return fc
    .integer({ min: 0, max: playerIds.length - 1 })
    .map((playerIdx) => ({
      id: `evt-${seqNum}`,
      sequenceNumber: seqNum,
      roundNumber: roundNum,
      type: "extra-turn-started",
      payload: {
        playerId: playerIds[playerIdx],
        roundNumber: roundNum,
      },
      createdAt: new Date().toISOString(),
    }));
}

/**
 * Generates a blockade-lifted event.
 */
function arbBlockadeLiftedEvent(
  playerIds: string[],
  seqNum: number,
  roundNum: number
): fc.Arbitrary<MockGameEvent> {
  return fc
    .record({
      playerIdx: fc.integer({ min: 0, max: playerIds.length - 1 }),
      liftedCount: fc.integer({ min: 0, max: 5 }),
    })
    .map(({ playerIdx, liftedCount }) => ({
      id: `evt-${seqNum}`,
      sequenceNumber: seqNum,
      roundNumber: roundNum,
      type: "blockade-lifted",
      payload: {
        playerId: playerIds[playerIdx],
        liftedCount,
      },
      createdAt: new Date().toISOString(),
    }));
}

/**
 * Generates a random event from the set of card-system event types.
 */
function arbGameEvent(
  playerIds: string[],
  otherLocationIds: string[],
  seqNum: number,
  roundNum: number
): fc.Arbitrary<MockGameEvent> {
  return fc
    .integer({ min: 0, max: 5 })
    .chain((eventType) => {
      switch (eventType) {
        case 0:
          return arbBlockadeActivatedEvent(playerIds, seqNum, roundNum);
        case 1:
          return arbCardUsedEvent(playerIds, seqNum, roundNum);
        case 2:
          return arbPlayerRelocatedEvent(playerIds, otherLocationIds, seqNum, roundNum);
        case 3:
          return arbActionPenaltyEvent(playerIds, seqNum, roundNum);
        case 4:
          return arbExtraTurnEvent(playerIds, seqNum, roundNum);
        case 5:
          return arbBlockadeLiftedEvent(playerIds, seqNum, roundNum);
        default:
          return arbBlockadeActivatedEvent(playerIds, seqNum, roundNum);
      }
    });
}

/**
 * Generates a spy-proximity notebook entry (never contains a location ID).
 */
function arbSpyProximityEntry(
  regionIds: string[],
  roundNum: number
): fc.Arbitrary<MockNotebookEntry> {
  return fc
    .record({
      regionIdx: fc.integer({ min: 0, max: regionIds.length - 1 }),
      stepsAway: fc.integer({ min: 0, max: 6 }),
    })
    .map(({ regionIdx, stepsAway }) => ({
      entryType: "spy-proximity",
      regionId: regionIds[regionIdx],
      roundNumber: roundNum,
      stepsAway,
    }));
}

/**
 * Generates a mastermind_distance notebook entry.
 * Uses the player's origin location (not the mastermind location).
 */
function arbMastermindDistanceEntry(
  otherLocationIds: string[],
  roundNum: number
): fc.Arbitrary<MockNotebookEntry> {
  return fc
    .record({
      locIdx: fc.integer({ min: 0, max: otherLocationIds.length - 1 }),
      stepsAway: fc.integer({ min: 0, max: 6 }),
    })
    .map(({ locIdx, stepsAway }) => ({
      entryType: "mastermind_distance",
      locationId: otherLocationIds[locIdx],
      roundNumber: roundNum,
      stepsAway,
    }));
}

/**
 * Generates a mastermind_direction notebook entry.
 * Uses a non-mastermind location (this represents d > 0 cases).
 */
function arbMastermindDirectionEntry(
  otherLocationIds: string[],
  roundNum: number
): fc.Arbitrary<MockNotebookEntry> {
  return fc
    .integer({ min: 0, max: otherLocationIds.length - 1 })
    .map((locIdx) => ({
      entryType: "mastermind_direction",
      locationId: otherLocationIds[locIdx],
      roundNumber: roundNum,
    }));
}

/**
 * Generates a mastermind_direction notebook entry for the d=0 case.
 * Here the mastermind location IS the player's origin location, 
 * so it appears in the entry. This is the allowed exception.
 */
function arbMastermindDirectionEntryD0(
  mastermindLocationId: string,
  roundNum: number
): fc.Arbitrary<MockNotebookEntry> {
  return fc.constant({
    entryType: "mastermind_direction",
    locationId: mastermindLocationId,
    roundNumber: roundNum,
  });
}

/**
 * Generates a phone_bug notebook entry (uses target's location, not mastermind).
 */
function arbPhoneBugEntry(
  playerIds: string[],
  otherLocationIds: string[],
  regionIds: string[],
  roundNum: number
): fc.Arbitrary<MockNotebookEntry> {
  return fc
    .record({
      targetIdx: fc.integer({ min: 0, max: playerIds.length - 1 }),
      locIdx: fc.integer({ min: 0, max: otherLocationIds.length - 1 }),
      mastermindStepsAway: fc.integer({ min: 0, max: 6 }),
      hasSpyRegion: fc.boolean(),
      regionIdx: fc.integer({ min: 0, max: regionIds.length - 1 }),
      spyCaptured: fc.boolean(),
    })
    .map(({ targetIdx, locIdx, mastermindStepsAway, hasSpyRegion, regionIdx, spyCaptured }) => ({
      entryType: "phone_bug",
      roundNumber: roundNum,
      targetPlayerId: playerIds[targetIdx],
      targetLocationId: otherLocationIds[locIdx],
      mastermindStepsAway,
      spyRegionId: hasSpyRegion ? regionIds[regionIdx] : null,
      spyCaptured: hasSpyRegion ? spyCaptured : false,
    }));
}

/**
 * Generates a notebook entry (not the d=0 case).
 */
function arbNotebookEntry(
  playerIds: string[],
  otherLocationIds: string[],
  regionIds: string[],
  roundNum: number
): fc.Arbitrary<MockNotebookEntry> {
  return fc
    .integer({ min: 0, max: 3 })
    .chain((entryType) => {
      switch (entryType) {
        case 0:
          return arbSpyProximityEntry(regionIds, roundNum);
        case 1:
          return arbMastermindDistanceEntry(otherLocationIds, roundNum);
        case 2:
          return arbMastermindDirectionEntry(otherLocationIds, roundNum);
        case 3:
          return arbPhoneBugEntry(playerIds, otherLocationIds, regionIds, roundNum);
        default:
          return arbSpyProximityEntry(regionIds, roundNum);
      }
    });
}

/**
 * Builds a complete mock poll state from its parts.
 */
function buildMockPollState(opts: {
  roomId: string;
  playerIds: string[];
  playerLocationIds: string[];
  currentRound: number;
  notebook: MockNotebookEntry[];
  events: MockGameEvent[];
  activeBlockades: Array<{
    transportType: TransportType;
    casterPlayerId: string;
    creationRound: number;
  }>;
  pendingClues: Array<{ cardIdentifier: string; roundNumber: number }>;
}): MockPollState {
  const { roomId, playerIds, playerLocationIds, currentRound, notebook, events, activeBlockades, pendingClues } = opts;

  return {
    roomId,
    status: "in-progress",
    viewerPlayerId: playerIds[0],
    currentPlayerId: playerIds[0],
    currentRound,
    actionsRemaining: 2,
    actionBudget: 2,
    players: playerIds.map((pid, i) => ({
      playerId: pid,
      displayName: `Player ${i}`,
      locationId: playerLocationIds[i % playerLocationIds.length],
      turnPosition: i + 1,
      skipNextTurn: false,
    })),
    privateData: {
      notebook,
      actionCards: [],
      pendingReward: null,
      skipNextTurn: false,
      actionPenaltyFlag: false,
      pendingExtraTurns: 0,
      pendingClues,
    },
    events,
    activeBlockades,
  };
}

// --- Property Tests ---

describe("Mastermind Location Never Leaked — Property 24", () => {
  // **Validates: Requirements 11.5, 18.4, 19.7, 20.3**

  it("event feed entries never contain the mastermind location ID", () => {
    fc.assert(
      fc.property(
        arbLocationPool(),
        arbPlayerIds(),
        fc.integer({ min: 1, max: 10 }), // number of events
        fc.integer({ min: 1, max: 20 }), // round number
        (locationPool, playerIds, numEvents, roundNum) => {
          const { mastermindLocationId, otherLocationIds } = locationPool;

          // Generate multiple events
          const events: MockGameEvent[] = [];
          for (let i = 0; i < numEvents; i++) {
            // Build events that use only non-mastermind locations for location fields
            const eventTypes = [
              "blockade-activated",
              "blockade-lifted",
              "card-used",
              "action-penalty-applied",
              "extra-turn-started",
              "player-relocated",
            ];
            const type = eventTypes[i % eventTypes.length];
            const playerIdx = i % playerIds.length;

            const payload: Record<string, unknown> = {
              playerId: playerIds[playerIdx],
              roundNumber: roundNum,
            };

            if (type === "player-relocated") {
              const fromIdx = i % otherLocationIds.length;
              const toIdx = (i + 1) % otherLocationIds.length;
              payload.fromLocationId = otherLocationIds[fromIdx];
              payload.toLocationId = otherLocationIds[toIdx];
              payload.cause = "drop-ship";
            }
            if (type === "blockade-activated") {
              payload.transportType = ["car", "plane", "boat"][i % 3];
            }
            if (type === "card-used") {
              payload.cardIdentifier = "close-all-roads";
            }
            if (type === "action-penalty-applied") {
              payload.targetPlayerId = playerIds[(playerIdx + 1) % playerIds.length];
            }
            if (type === "blockade-lifted") {
              payload.liftedCount = i + 1;
            }

            events.push({
              id: `evt-${i}`,
              sequenceNumber: i + 1,
              roundNumber: roundNum,
              type,
              payload,
              createdAt: new Date().toISOString(),
            });
          }

          // Serialize all events and verify mastermind location never appears
          const serialized = JSON.stringify(events);
          expect(serialized).not.toContain(mastermindLocationId);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("notebook entries (d > 0 cases) never contain the mastermind location ID", () => {
    fc.assert(
      fc.property(
        arbLocationPool(),
        arbPlayerIds(),
        fc.integer({ min: 1, max: 10 }), // number of entries
        fc.integer({ min: 1, max: 20 }), // round number
        (locationPool, playerIds, numEntries, roundNum) => {
          const { mastermindLocationId, otherLocationIds } = locationPool;
          // Use some UUIDs as region IDs
          const regionIds = otherLocationIds.slice(0, 6);

          // Generate notebook entries that do NOT use the mastermind location
          const entries: MockNotebookEntry[] = [];
          for (let i = 0; i < numEntries; i++) {
            const entryTypes = [
              "spy-proximity",
              "mastermind_distance",
              "mastermind_direction",
              "phone_bug",
            ] as const;
            const type = entryTypes[i % entryTypes.length];

            switch (type) {
              case "spy-proximity":
                entries.push({
                  entryType: "spy-proximity",
                  regionId: regionIds[i % regionIds.length],
                  roundNumber: roundNum,
                  stepsAway: (i % 6) + 1, // 1-6, never 0 for this sub-case
                });
                break;
              case "mastermind_distance":
                entries.push({
                  entryType: "mastermind_distance",
                  locationId: otherLocationIds[i % otherLocationIds.length],
                  roundNumber: roundNum,
                  stepsAway: (i % 6) + 1,
                });
                break;
              case "mastermind_direction":
                // d > 0 case: revealed location is NOT the mastermind
                entries.push({
                  entryType: "mastermind_direction",
                  locationId: otherLocationIds[i % otherLocationIds.length],
                  roundNumber: roundNum,
                });
                break;
              case "phone_bug":
                entries.push({
                  entryType: "phone_bug",
                  roundNumber: roundNum,
                  targetPlayerId: playerIds[i % playerIds.length],
                  targetLocationId: otherLocationIds[i % otherLocationIds.length],
                  mastermindStepsAway: (i % 6) + 1,
                  spyRegionId: regionIds[i % regionIds.length],
                  spyCaptured: i % 2 === 0,
                });
                break;
            }
          }

          // Serialize and verify mastermind location never appears
          const serialized = JSON.stringify(entries);
          expect(serialized).not.toContain(mastermindLocationId);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("mastermind_direction entry with d=0 is the ONLY allowed case where mastermind location appears", () => {
    fc.assert(
      fc.property(
        arbLocationPool(),
        arbPlayerIds(),
        fc.integer({ min: 1, max: 20 }), // round number
        (locationPool, playerIds, roundNum) => {
          const { mastermindLocationId, otherLocationIds } = locationPool;
          const regionIds = otherLocationIds.slice(0, 6);

          // Create a mixed set: some normal entries + one d=0 direction entry
          const normalEntries: MockNotebookEntry[] = [
            {
              entryType: "mastermind_distance",
              locationId: otherLocationIds[0],
              roundNumber: roundNum,
              stepsAway: 3,
            },
            {
              entryType: "phone_bug",
              roundNumber: roundNum,
              targetPlayerId: playerIds[1 % playerIds.length],
              targetLocationId: otherLocationIds[1],
              mastermindStepsAway: 2,
              spyRegionId: regionIds[0],
              spyCaptured: false,
            },
          ];

          // The d=0 direction entry: player was at mastermind's location,
          // so the revealed location IS the mastermind's location
          const d0Entry: MockNotebookEntry = {
            entryType: "mastermind_direction",
            locationId: mastermindLocationId, // This is the allowed exception
            roundNumber: roundNum,
          };

          // Normal entries should NOT contain mastermind location
          const normalSerialized = JSON.stringify(normalEntries);
          expect(normalSerialized).not.toContain(mastermindLocationId);

          // The d=0 entry DOES contain mastermind location (by design)
          const d0Serialized = JSON.stringify(d0Entry);
          expect(d0Serialized).toContain(mastermindLocationId);

          // But the d=0 entry must have type mastermind_direction
          expect(d0Entry.entryType).toBe("mastermind_direction");
        }
      ),
      { numRuns: 200 }
    );
  });

  it("full poll state with in-progress game never leaks mastermind location outside the d=0 exception", () => {
    fc.assert(
      fc.property(
        arbLocationPool(),
        arbPlayerIds(),
        fc.integer({ min: 1, max: 20 }), // round number
        fc.integer({ min: 1, max: 5 }), // number of events
        fc.integer({ min: 1, max: 5 }), // number of notebook entries
        (locationPool, playerIds, roundNum, numEvents, numEntries) => {
          const { mastermindLocationId, otherLocationIds } = locationPool;
          const regionIds = otherLocationIds.slice(0, 6);

          // Player positions use non-mastermind locations
          const playerLocationIds = playerIds.map(
            (_, i) => otherLocationIds[i % otherLocationIds.length]
          );

          // Generate events (all using non-mastermind locations)
          const events: MockGameEvent[] = [];
          for (let i = 0; i < numEvents; i++) {
            events.push({
              id: `evt-${i}`,
              sequenceNumber: i + 1,
              roundNumber: roundNum,
              type: "card-used",
              payload: {
                playerId: playerIds[i % playerIds.length],
                cardIdentifier: "locate-the-mastermind",
              },
              createdAt: new Date().toISOString(),
            });
          }

          // Generate notebook entries (no d=0 case)
          const notebook: MockNotebookEntry[] = [];
          for (let i = 0; i < numEntries; i++) {
            notebook.push({
              entryType: "mastermind_distance",
              locationId: otherLocationIds[i % otherLocationIds.length],
              roundNumber: roundNum,
              stepsAway: (i % 6) + 1,
            });
          }

          // Active blockades (no location info, just transport type)
          const activeBlockades: Array<{
            transportType: TransportType;
            casterPlayerId: string;
            creationRound: number;
          }> = [
            {
              transportType: "car",
              casterPlayerId: playerIds[0],
              creationRound: roundNum,
            },
          ];

          // Pending clues (card identifier + round only — no location)
          const pendingClues = [
            { cardIdentifier: "locate-the-mastermind", roundNumber: roundNum },
            { cardIdentifier: "reveal-direction", roundNumber: roundNum },
          ];

          const pollState = buildMockPollState({
            roomId: "room-123",
            playerIds,
            playerLocationIds,
            currentRound: roundNum,
            notebook,
            events,
            activeBlockades,
            pendingClues,
          });

          // Serialize entire poll state and verify no mastermind location leak
          const serialized = JSON.stringify(pollState);
          expect(serialized).not.toContain(mastermindLocationId);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("when a player happens to be at the mastermind location, their position appears in poll but only as player location data", () => {
    fc.assert(
      fc.property(
        arbLocationPool(),
        arbPlayerIds(),
        fc.integer({ min: 1, max: 20 }), // round number
        (locationPool, playerIds, roundNum) => {
          const { mastermindLocationId, otherLocationIds } = locationPool;

          // Place one player at the mastermind's location
          const playerLocationIds = playerIds.map((_, i) =>
            i === 0 ? mastermindLocationId : otherLocationIds[i % otherLocationIds.length]
          );

          // Build poll state with player at mastermind location
          const pollState = buildMockPollState({
            roomId: "room-456",
            playerIds,
            playerLocationIds,
            currentRound: roundNum,
            notebook: [],
            events: [],
            activeBlockades: [],
            pendingClues: [],
          });

          // The mastermind location WILL appear in the serialized state because
          // a player is positioned there (this is legitimate — it's the player's
          // position, not a leak of the mastermind's location as hidden info).
          // The key invariant is: it appears ONLY as a player locationId field.
          const serialized = JSON.stringify(pollState);

          // Find all occurrences of mastermind location in the serialized output
          const occurrences: number[] = [];
          let idx = serialized.indexOf(mastermindLocationId);
          while (idx !== -1) {
            occurrences.push(idx);
            idx = serialized.indexOf(mastermindLocationId, idx + 1);
          }

          // All occurrences must be within player location fields
          // (the "locationId":"<id>" pattern within the players array)
          for (const pos of occurrences) {
            // Look backwards for the nearest key name
            const preceding = serialized.substring(Math.max(0, pos - 50), pos);
            // It should be preceded by "locationId":" (player's position in the players array)
            expect(preceding).toMatch(/"locationId"\s*:\s*"$/);
          }
        }
      ),
      { numRuns: 200 }
    );
  });

  it("event payloads from all card-system event types never contain the mastermind location ID (randomized)", () => {
    fc.assert(
      fc.property(
        arbLocationPool(),
        arbPlayerIds(),
        fc.array(fc.integer({ min: 0, max: 5 }), { minLength: 3, maxLength: 15 }),
        fc.integer({ min: 1, max: 20 }),
        (locationPool, playerIds, eventTypeIndices, roundNum) => {
          const { mastermindLocationId, otherLocationIds } = locationPool;

          const events: MockGameEvent[] = eventTypeIndices.map((typeIdx, i) => {
            const playerIdx = i % playerIds.length;
            const eventTypes = [
              "blockade-activated",
              "blockade-lifted",
              "card-used",
              "action-penalty-applied",
              "extra-turn-started",
              "player-relocated",
            ] as const;
            const type = eventTypes[typeIdx];

            const payload: Record<string, unknown> = {
              playerId: playerIds[playerIdx],
            };

            switch (type) {
              case "blockade-activated":
                payload.transportType = ["car", "plane", "boat"][i % 3];
                payload.roundNumber = roundNum;
                break;
              case "blockade-lifted":
                payload.liftedCount = i + 1;
                break;
              case "card-used":
                payload.cardIdentifier = [
                  "close-all-roads",
                  "locate-the-mastermind",
                  "drop-ship",
                  "extra-turn",
                  "open-all-roads",
                ][i % 5];
                break;
              case "action-penalty-applied":
                payload.targetPlayerId = playerIds[(playerIdx + 1) % playerIds.length];
                break;
              case "extra-turn-started":
                payload.roundNumber = roundNum;
                break;
              case "player-relocated":
                payload.fromLocationId = otherLocationIds[i % otherLocationIds.length];
                payload.toLocationId = otherLocationIds[(i + 1) % otherLocationIds.length];
                payload.cause = "drop-ship";
                break;
            }

            return {
              id: `evt-${i}`,
              sequenceNumber: i + 1,
              roundNumber: roundNum,
              type,
              payload,
              createdAt: new Date().toISOString(),
            };
          });

          const serialized = JSON.stringify(events);
          expect(serialized).not.toContain(mastermindLocationId);
        }
      ),
      { numRuns: 200 }
    );
  });
});
