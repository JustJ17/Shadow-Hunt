# Implementation Plan: Action Cards

## Overview

Implement the 10-card MVP card subsystem for Shadow Hunt. This replaces the `dispatchCardEffect` stub with a full Card Registry, per-turn action budget (replacing the hardcoded two-slot system), global transport blockades, extra-turn mechanics, and a Round End Resolution phase for deferred clue delivery. All logic runs within existing Serializable Prisma transactions.

## Tasks

- [x] 1. Schema migrations and data model changes
  - [x] 1.1 Create Prisma migration: add Blockade and PendingClue models, extend GameTurn and PlayerPosition
    - Add `Blockade` model with fields: id, roomId, transportType, casterPlayerId, creationRound, casterTurnPosition, lifted (default false). Map to `blockades` table with index on `[roomId, lifted]`
    - Add `PendingClue` model with fields: id, roomId, playerId, cardIdentifier, roundNumber, originLocationId, resolved (default false), createdAt. Map to `pending_clues` table with index on `[roomId, roundNumber, resolved]`
    - Extend `GameTurn`: add `actionsRemaining` (Int, default 2), `actionBudget` (Int, default 2), `isExtraTurn` (Boolean, default false). Remove `currentSlot` field
    - Extend `PlayerPosition`: add `actionPenaltyFlag` (Boolean, default false), `pendingExtraTurns` (Int, default 0)
    - Add `blockades` and `pendingClues` relations to the `Room` model
    - Run `npx prisma migrate dev` to generate and apply migration
    - _Requirements: 5.2, 8.10, 10.11, 20.5, 22.1_

- [x] 2. Card system core types and registry
  - [x] 2.1 Create `lib/turn-engine/cards/types.ts` with card type definitions
    - Define `CardIdentifier` union type (10 values), `CardCategory`, `TargetRequirement`, `ResolutionTiming` types
    - Define `CardDefinition` interface with identifier, category, targetRequirement, resolutionTiming, handler
    - Define `CardEffectContext` interface with roomId, playerId, targetPlayerId, playerLocationId, currentRound, casterTurnPosition, tx, rng
    - Export `CARD_POOL` array (all 10 identifiers) and `LEGACY_CARD_TYPES` array
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.11, 21.1_

  - [x] 2.2 Create `lib/turn-engine/cards/registry.ts` with the Card Registry map
    - Create `CARD_REGISTRY` as `ReadonlyMap<CardIdentifier, CardDefinition>` with all 10 entries
    - Import placeholder handler functions (to be implemented later) — use temporary no-op handlers initially
    - Assign correct category, targetRequirement, and resolutionTiming per card
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 21.1, 21.2_

  - [x] 2.3 Create `lib/turn-engine/cards/dispatcher.ts` with target validation and dispatch logic
    - Implement `dispatchCard` function: look up CardDefinition from registry, validate target per Target_Requirement, invoke handler
    - Return `UNKNOWN_CARD_TYPE` if card type not in registry (catches legacy types)
    - Return `INVALID_CARD_TARGET` if target missing/self/non-member for `player` cards, or if target supplied for `none` cards
    - _Requirements: 1.10, 2.4, 2.5, 2.6, 2.9, 21.2, 21.3_

  - [x] 2.4 Write unit tests for Card Registry and Dispatcher
    - Test all 10 definitions present with correct metadata
    - Test target validation: self-targeting, missing target, non-member target, extra target on non-targeted card
    - Test UNKNOWN_CARD_TYPE for legacy card types
    - _Requirements: 1.1–1.11, 2.4–2.6_

- [x] 3. Update turn engine types
  - [x] 3.1 Update `lib/turn-engine/types.ts` with new error codes, event types, and polling types
    - Add error codes: `NO_ACTIONS_REMAINING`, `ROADS_BLOCKED`, `AIRWAYS_BLOCKED`, `SEA_ROUTES_BLOCKED`, `UNKNOWN_CARD_TYPE`, `INVALID_CARD_TARGET`
    - Remove `HAND_FULL` and `INVALID_SLOT_ORDER` from `TurnActionErrorCode`
    - Add `BlockadeState` interface with `blockedTransports: Set<TransportType>`
    - Update `TurnState` to use `actionsRemaining` and `actionBudget` instead of `currentSlot`
    - Add new event types to `GameEventData.type`: `blockade-activated`, `blockade-lifted`, `action-penalty-applied`, `player-relocated`, `extra-turn-started`
    - Add `UseCardPayload.targetPlayerId?: string` to the action payload
    - Add discriminated notebook entry types: `SpyProximityEntry`, `MastermindDistanceEntry`, `MastermindDirectionEntry`, `PhoneBugEntry`
    - Add `ActiveBlockadeData`, `PendingClueData`, `ActionCardPollData` interfaces
    - Update `PlayerPrivateData` with `actionPenaltyFlag`, `pendingExtraTurns`, `pendingClues`
    - Update `GamePollState` with `actionsRemaining`, `actionBudget`, `activeBlockades`
    - Update `TurnActionSuccess` to return `actionsRemaining` instead of `slotNumber`/`remainingSlots`
    - _Requirements: 6.3–6.5, 8.5, 15.1, 15.3–15.6, 17.4, 18.3, 19.1–19.5_

- [x] 4. Blockade evaluation utility
  - [x] 4.1 Create `lib/turn-engine/cards/effects/blockade-utils.ts` with blockade window logic
    - Implement `isWithinBlockadeWindow(creationRound, casterTurnPosition, currentRound, currentTurnPosition)` pure function
    - Implement `getActiveBlockades(roomId, currentRound, currentTurnPosition, tx)` — queries non-lifted blockades and filters by window
    - Implement `computeBlockedTransports(activeBlockades, playerId)` — returns `Set<TransportType>` of transports blocked for a specific player (excludes blockades cast by that player)
    - _Requirements: 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 4.2 Write property test for blockade window (Property 2: Blockade Window Totality)
    - **Property 2: Blockade Window Totality**
    - **Validates: Requirements 5.1, 5.3, 5.4, 5.7**

  - [x] 4.3 Write property test for caster immunity (Property 1: Caster Immunity Invariant)
    - **Property 1: Caster Immunity Invariant**
    - **Validates: Requirements 4.4, 6.3, 6.4, 6.5**

- [x] 5. Update validateAction with blockade and budget checks
  - [x] 5.1 Refactor `lib/turn-engine/validate-action.ts` to accept `BlockadeState` and `actionsRemaining` parameters
    - Add `blockadeState: BlockadeState` and `actionsRemaining: number` parameters to `validateAction`
    - Add `NO_ACTIONS_REMAINING` check before action-type dispatch
    - Update `validateMove` to check blockade state AFTER adjacency check and BEFORE same-location/hub rules
    - Return `ROADS_BLOCKED`, `AIRWAYS_BLOCKED`, or `SEA_ROUTES_BLOCKED` when a transport is blocked for the player
    - Leave Drop Ship relocation unaffected by blockades (blockade check is in Move validator only)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 8.5_

  - [x] 5.2 Write property test for rejected submissions inert (Property 25: Rejected Submissions Are Inert)
    - **Property 25: Rejected Submissions Are Inert**
    - **Validates: Requirements 2.3, 2.5, 2.6, 6.6, 22.3**

- [x] 6. Implement immediate card effect handlers
  - [x] 6.1 Create `lib/turn-engine/cards/effects/blockade.ts` — blockade card handlers
    - Implement `handleCloseAllRoads`, `handleCloseAllAirways`, `handleCloseAllSeaRoutes`
    - Each creates a Blockade record with the room, transport type, caster, round, and turnPosition
    - Emit `blockade-activated` event via `emitEvent`
    - _Requirements: 4.1, 4.2, 4.3, 4.7, 4.8_

  - [x] 6.2 Create `lib/turn-engine/cards/effects/open-all-roads.ts` — lift all active blockades
    - Query active blockades using `getActiveBlockades`, mark them all as `lifted: true`
    - Emit `blockade-lifted` event with count of lifted blockades
    - Handle no-op case (zero active blockades) — still consume card and emit event with count 0
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 6.3 Create `lib/turn-engine/cards/effects/lose-an-action.ts` — set action penalty flag
    - Set `actionPenaltyFlag: true` on target player's `PlayerPosition`
    - Emit `action-penalty-applied` event with caster and target identifiers
    - Non-stacking: if flag already true, still consume the card (no additional effect)
    - _Requirements: 8.6, 8.7, 8.8, 8.11_

  - [x] 6.4 Create `lib/turn-engine/cards/effects/drop-ship.ts` — relocate player to distant location
    - Load all locations with regions, compute Distance_Utility distances from origin
    - Build candidate set: locations in different region with distance >= 4
    - Fallback: if empty, take locations with max distance in different region
    - Select uniformly via injectable `rng`, update player's locationId
    - Emit `player-relocated` event with origin, destination, cause `drop-ship`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 6.5 Create `lib/turn-engine/cards/effects/extra-turn.ts` — increment pending extra turns
    - Increment `pendingExtraTurns` by 1 on player's `PlayerPosition`
    - No other state change (extra turn granted after current turn completes)
    - _Requirements: 10.1_

  - [x] 6.6 Create `lib/turn-engine/cards/effects/clue-cards.ts` — create PendingClue records
    - Implement `handleLocateTheMastermind`, `handleBugAPhone`, `handleRevealDirection`
    - Each creates a `PendingClue` record with roomId, playerId, cardIdentifier, roundNumber, originLocationId, resolved: false
    - Origin_Location captured at play time (player's current location)
    - _Requirements: 3.2, 3.3, 3.5, 11.1, 12.1, 13.1_

  - [x] 6.7 Write property test for Drop Ship destination (Property 9: Drop Ship Destination Validity)
    - **Property 9: Drop Ship Destination Validity**
    - **Validates: Requirements 9.1, 9.2, 9.3**

  - [x] 6.8 Write property test for Drop Ship ignores blockades (Property 10: Drop Ship Ignores Blockades)
    - **Property 10: Drop Ship Ignores Blockades**
    - **Validates: Requirements 6.8**

  - [x] 6.9 Write property test for Open All Roads idempotence (Property 3: Open All Roads Universal Wipe)
    - **Property 3: Open All Roads Universal Wipe**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.6**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update submitAction with action budget and card dispatch
  - [x] 8.1 Refactor `lib/turn-engine/submit-action.ts` to use action budget instead of slots
    - Replace slot-based logic with `actionsRemaining` / `actionBudget` system
    - Load blockade state and pass to `validateAction`
    - For `USE_CARD`: look up card type, call `dispatchCard` from Card Dispatcher (replacing `executeUseCard` stub), handle `UNKNOWN_CARD_TYPE` and `INVALID_CARD_TARGET` errors before card consumption
    - Mark card consumed and decrement `actionsRemaining` AFTER successful dispatch
    - When `actionsRemaining` reaches 0: run end-of-turn resolution and advance turn
    - When `actionsRemaining` > 0 after action: return intermediate success with remaining count
    - Compute `actionBudget` at turn start based on `actionPenaltyFlag` (clear flag on use)
    - Emit `card-used` event with Card_Identifier and optional targetPlayerId
    - _Requirements: 2.1, 2.2, 2.3, 2.7, 2.8, 8.1, 8.2, 8.3, 8.4, 8.7, 18.1, 18.2, 22.1, 22.2, 22.4_

  - [x] 8.2 Write property test for action budget bounds (Property 5: Action Budget Bounds)
    - **Property 5: Action Budget Bounds**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4**

  - [x] 8.3 Write property test for penalty non-stacking (Property 6: Penalty Non-Stacking Cap)
    - **Property 6: Penalty Non-Stacking Cap**
    - **Validates: Requirements 8.7, 8.8**

- [x] 9. Update advanceTurn with extra turns and round-end hook
  - [x] 9.1 Refactor `lib/turn-engine/advance-turn.ts` to support extra turns and round-end resolution
    - Before advancing to next player: check if current player has `pendingExtraTurns > 0`
    - If yes: decrement `pendingExtraTurns`, compute action budget (apply penalty if flagged), reset turn state for same player (fresh `actionsRemaining`, cleared `captureAttemptFlag`, `isExtraTurn: true`), emit `extra-turn-started` event
    - On round boundary (wrapping from last player to first): call `resolveRoundEnd` BEFORE incrementing round number
    - Handle `skipNextTurn` consuming extra turns per Req 10.9: if next player has skip flag AND `pendingExtraTurns > 0`, clear skip, decrement extra turns, emit `turn-skipped`, continue to next player
    - Ensure last player's extra turns complete before round increments (Req 10.10)
    - Compute action budget for each new turn start (apply penalty flag if set, clear it)
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 14.1_

  - [x] 9.2 Write property test for extra turn round invariance (Property 7: Extra Turn Round Invariance)
    - **Property 7: Extra Turn Round Invariance**
    - **Validates: Requirements 10.5**

  - [x] 9.3 Write property test for extra turn count and order restoration (Property 8: Extra Turn Count and Order Restoration)
    - **Property 8: Extra Turn Count and Order Restoration**
    - **Validates: Requirements 10.2, 10.6, 10.7**

- [x] 10. Implement Round End Resolver
  - [x] 10.1 Create `lib/turn-engine/resolution/resolve-round-end.ts`
    - Implement `resolveRoundEnd(roomId, roundNumber, tx, rng)` function
    - Check room status: if `finished`, mark all pending clues resolved without entries (Req 14.6)
    - Load all unresolved `PendingClue` records for the given round
    - Load mastermind location from `GameThreat`
    - For `locate-the-mastermind`: compute `getShortestPathDistance(originLocation, mastermindLocation)`, create `NotebookEntry` with entryType `mastermind_distance` and payload
    - For `bug-a-phone`: select random target (prefer connected, fallback all others), compute mastermind distance from target position, check spy status in target's region, create `NotebookEntry` with entryType `phone_bug` and payload
    - For `reveal-direction`: compute reference distance, find adjacent locations one step closer, select uniformly, handle d=0 case (reveal own location), create `NotebookEntry` with entryType `mastermind_direction` and payload
    - Mark each clue `resolved: true` after processing
    - _Requirements: 3.4, 11.2, 11.3, 11.4, 11.5, 11.6, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9, 12.10, 12.11, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 14.2, 14.3, 14.5, 14.6, 14.7, 14.8_

  - [x] 10.2 Write property test for mastermind distance correctness (Property 11: Mastermind Distance Correctness)
    - **Property 11: Mastermind Distance Correctness**
    - **Validates: Requirements 11.2, 11.3, 11.6**

  - [x] 10.3 Write property test for origin location stability (Property 12: Origin Location Stability)
    - **Property 12: Origin Location Stability**
    - **Validates: Requirements 3.4, 11.1, 13.1**

  - [x] 10.4 Write property test for direction monotonicity (Property 13: Direction Monotonicity)
    - **Property 13: Direction Monotonicity**
    - **Validates: Requirements 13.3, 13.4**

  - [x] 10.5 Write property test for direction totality (Property 14: Direction Totality)
    - **Property 14: Direction Totality**
    - **Validates: Requirements 13.3, 13.6**

  - [x] 10.6 Write property test for bug-a-phone target validity (Property 15: Bug a Phone Target Validity)
    - **Property 15: Bug a Phone Target Validity**
    - **Validates: Requirements 12.2, 12.3, 12.4**

  - [x] 10.7 Write property test for bug-a-phone distance correctness (Property 16: Bug a Phone Distance Correctness)
    - **Property 16: Bug a Phone Distance Correctness**
    - **Validates: Requirements 12.6**

  - [x] 10.8 Write property test for bug-a-phone spy reporting (Property 17: Bug a Phone Spy Reporting)
    - **Property 17: Bug a Phone Spy Reporting**
    - **Validates: Requirements 12.7, 12.8, 12.9**

  - [x] 10.9 Write property test for round-end confluence (Property 18: Round End Confluence)
    - **Property 18: Round End Confluence**
    - **Validates: Requirements 14.7**

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Update reward granting with new Card Pool
  - [x] 12.1 Refactor `grantRewardCards` in `lib/turn-engine/resolution/resolve-spy-reward.ts`
    - Remove the 5-card hand cap logic entirely
    - Replace the old card type array with `CARD_POOL` from `cards/types.ts`
    - Guarantee exactly one `locate-the-mastermind` card per reward (even single-card rewards)
    - Draw remaining cards from `CARD_POOL` uniformly via injectable `rng`
    - Accept `rng` parameter (default `Math.random`) for testability
    - Allow duplicates within a single reward
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 17.1, 17.2_

  - [x] 12.2 Write property test for reward composition (Property 22: Reward Composition)
    - **Property 22: Reward Composition**
    - **Validates: Requirements 16.2, 16.3, 16.4, 1.9**

  - [x] 12.3 Write property test for no hand cap (Property 23: No Hand Cap)
    - **Property 23: No Hand Cap**
    - **Validates: Requirements 17.1, 17.2**

- [x] 13. Update polling and notebook support
  - [x] 13.1 Update `lib/turn-engine/query-turn-state.ts` with card system state
    - Return player's unconsumed cards with card identifier, category, and target requirement (looked up from registry)
    - Return `actionsRemaining` and `actionBudget` from turn state
    - Return active blockades for the room (transport type, caster, creation round)
    - Return player's `actionPenaltyFlag` and `pendingExtraTurns`
    - Return player's unresolved pending clues (card identifier and round number)
    - Return all 4 notebook entry types using discriminated union keyed on `entryType`
    - Ensure no other player's private data is exposed
    - Remove slot-based fields from response
    - _Requirements: 15.1, 15.3, 15.7, 15.8, 15.9, 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8_

  - [x] 13.2 Update `lib/turn-engine/notebook.ts` to support all four entry types
    - Extend `getPlayerNotebook` to return entries of all 4 types ordered by creation time
    - Parse `payload` JSON field for `mastermind_distance`, `mastermind_direction`, and `phone_bug` entries
    - Preserve existing `spy-proximity` behavior (uses `regionId`, `stepsAway` columns directly)
    - Enforce max 200 entries per response
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.10_

  - [x] 13.3 Write property test for notebook write/read round trip (Property 19: Notebook Write/Read Round Trip)
    - **Property 19: Notebook Write/Read Round Trip**
    - **Validates: Requirements 15.4, 15.5, 15.6, 15.10**

  - [x] 13.4 Write property test for notebook privacy (Property 20: Notebook Privacy)
    - **Property 20: Notebook Privacy**
    - **Validates: Requirements 15.9, 19.6**

- [x] 14. Wire Card Registry handlers and integration
  - [x] 14.1 Update Card Registry imports to point to real effect handler implementations
    - Replace any temporary no-op handler references in `registry.ts` with real imports from `effects/` modules
    - Ensure all 10 handlers are correctly wired
    - _Requirements: 21.2_

  - [x] 14.2 Remove old `executeUseCard` stub and update imports
    - Delete or replace `lib/turn-engine/actions/execute-use-card.ts` stub (the `dispatchCardEffect` no-op)
    - Update `submit-action.ts` to use Card Dispatcher instead of `executeUseCard`
    - _Requirements: 2.9, 21.2_

  - [x] 14.3 Update `lib/turn-engine/index.ts` barrel exports for new card modules
    - Export card types, registry, dispatcher from the turn-engine barrel
    - Export new resolution module
    - _Requirements: 21.5_

- [x] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Remaining property tests and integration tests
  - [x] 16.1 Write property test for map immutability (Property 4: Map Immutability)
    - **Property 4: Map Immutability**
    - **Validates: Requirements 4.7, 5.6, 7.5**

  - [x] 16.2 Write property test for mastermind location never leaked (Property 24: Mastermind Location Never Leaked)
    - **Property 24: Mastermind Location Never Leaked**
    - **Validates: Requirements 11.5, 18.4, 19.7, 20.3**

  - [x] 16.3 Write property test for effect atomicity (Property 26: Effect Atomicity)
    - **Property 26: Effect Atomicity**
    - **Validates: Requirements 22.2, 22.3**

  - [x] 16.4 Write property test for target validation completeness (Property 27: Target Validation Completeness)
    - **Property 27: Target Validation Completeness**
    - **Validates: Requirements 2.4, 2.5, 2.6**

  - [x] 16.5 Write property test for dual blockade mutual restriction (Property 28: Dual Blockade Mutual Restriction)
    - **Property 28: Dual Blockade Mutual Restriction**
    - **Validates: Requirements 4.6**

  - [x] 16.6 Write property test for spy proximity preservation (Property 21: Spy Proximity Preservation)
    - **Property 21: Spy Proximity Preservation**
    - **Validates: Requirements 15.2**

  - [x] 16.7 Write property test for event feed monotonic ordering (Property 31: Event Feed Monotonic Ordering)
    - **Property 31: Event Feed Monotonic Ordering**
    - **Validates: Requirements 18.5, 18.6**

  - [x] 16.8 Write property test for pending clues discarded on game win (Property 30: Pending Clues Discarded on Game Win)
    - **Property 30: Pending Clues Discarded on Game Win**
    - **Validates: Requirements 14.6**

  - [x] 16.9 Write property test for round-end resolution executes once per round (Property 29: Round End Resolution Executes Once Per Round)
    - **Property 29: Round End Resolution Executes Once Per Round**
    - **Validates: Requirements 14.1, 14.4, 14.8**

- [x] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- All card effects run within the existing Serializable transaction in `submitAction`
- The injectable `rng` parameter enables deterministic property testing
- The `currentSlot` removal in task 1.1 requires updating all existing tests that reference `currentSlot`
- Drop Ship uses `getShortestPathDistance` from `lib/map/distance.ts` (full graph BFS including plane edges)
- Spy proximity continues using `lib/turn-engine/spy-distance.ts` (car/boat only)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "4.1"] },
    { "id": 3, "tasks": ["2.4", "4.2", "4.3", "5.1", "6.1", "6.2", "6.3", "6.4", "6.5", "6.6"] },
    { "id": 4, "tasks": ["5.2", "6.7", "6.8", "6.9", "8.1"] },
    { "id": 5, "tasks": ["8.2", "8.3", "9.1", "12.1"] },
    { "id": 6, "tasks": ["9.2", "9.3", "10.1", "12.2", "12.3"] },
    { "id": 7, "tasks": ["10.2", "10.3", "10.4", "10.5", "10.6", "10.7", "10.8", "10.9", "13.1", "13.2"] },
    { "id": 8, "tasks": ["13.3", "13.4", "14.1", "14.2", "14.3"] },
    { "id": 9, "tasks": ["16.1", "16.2", "16.3", "16.4", "16.5", "16.6", "16.7", "16.8", "16.9"] }
  ]
}
```
