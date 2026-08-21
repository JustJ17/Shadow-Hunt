# Implementation Plan: Movement & Turn Actions

## Overview

Implement the core gameplay loop for Shadow Hunt: turn engine, action submission, movement validation, end-of-turn resolution (capture attempt + spy/reward logic), player position tracking, private Notebook, public Event Feed, and two API routes (action submission + game state polling). Builds on the existing map/game initialization system and lobby turn order assignment.

## Tasks

- [x] 1. Prisma schema additions and migration
  - [x] 1.1 Add GameTurn, PlayerPosition, NotebookEntry, GameEvent, and ActionCard models to `prisma/schema.prisma`
    - Add `GameTurn` model with `id`, `roomId` (unique), `currentPlayerId`, `currentRound`, `currentSlot`, `captureAttemptFlag`, `version`, relation to Room, mapped to `game_turns`
    - Add `PlayerPosition` model with `id`, `roomId`, `playerId`, `locationId`, `skipNextTurn`, `pendingRewardRegionId`, `pendingRewardCaptureOrder`, unique on `[roomId, playerId]`, relation to Room and Location, mapped to `player_positions`
    - Add `NotebookEntry` model with `id`, `roomId`, `playerId`, `entryType`, `regionId`, `roundNumber`, `stepsAway`, `payload` (Json), `createdAt`, index on `[roomId, playerId]`, mapped to `notebook_entries`
    - Add `GameEvent` model with `id`, `roomId`, `sequenceNumber`, `roundNumber`, `type`, `payload` (Json), `createdAt`, unique on `[roomId, sequenceNumber]`, index on `[roomId, sequenceNumber]`, mapped to `game_events`
    - Add `ActionCard` model with `id`, `roomId`, `playerId`, `type`, `consumed`, `grantedAt`, index on `[roomId, playerId]`, mapped to `action_cards`
    - Add relation fields to existing `Room` model (`gameTurn`, `playerPositions`, `notebookEntries`, `gameEvents`, `actionCards`)
    - Add `playerPositions` relation to existing `Location` model
    - _Requirements: 7.1, 11.1, 12.1, 6.4, 6.6, 17.1_

  - [x] 1.2 Generate Prisma migration and regenerate client
    - Run `npx prisma migrate dev --name add-turn-engine-models`
    - Verify generated SQL includes all constraints, indexes, and foreign keys
    - _Requirements: 7.1, 11.1, 12.1, 17.1_

- [x] 2. Turn engine types and core infrastructure
  - [x] 2.1 Create turn engine types at `lib/turn-engine/types.ts`
    - Define `ActionType`, `ActionPayload` (union of Move/Skip/CaptureAttempt/UseCard payloads)
    - Define `TurnState`, `TurnActionSuccess`, `TurnActionError`, `TurnActionResult`
    - Define `TurnActionErrorCode` union type
    - Define `EndOfTurnResolution`, `CaptureAttemptOutcome`, `SpyResolutionOutcome`, `NotebookEntryData`
    - Define `GamePollState`, `PlayerPollData`, `PlayerPrivateData`, `ActionCardData`, `PendingRewardData`, `GameEventData`
    - _Requirements: 2.1, 2.4, 15.1, 15.2, 16.1_

  - [x] 2.2 Create player position module at `lib/turn-engine/player-positions.ts`
    - `assignStartingPositions(roomId, playerIds, tx)` — select N distinct regions via Fisher-Yates shuffle, assign each player to that region's Hub location, create `PlayerPosition` records
    - `getPlayerPosition(roomId, playerId)` — return current locationId
    - `getPlayerPositionRecord(roomId, playerId, tx)` — return full PlayerPosition record within transaction
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

  - [x] 2.3 Extend `lib/game/initialize-game.ts` to call `assignStartingPositions` and `createInitialTurnState`
    - After spy placement, call `assignStartingPositions` with player IDs from RoomPlayer records ordered by turnPosition
    - Create `GameTurn` record with first player (turnPosition 1) as currentPlayerId, round 1, slot 1
    - _Requirements: 1.1, 7.2_

  - [x] 2.4 Write property test for starting positions at `lib/turn-engine/__tests__/starting-positions.property.test.ts`
    - **Property 16: Starting Positions at Distinct Hub Locations**
    - For any game with 2–4 players, each player starts at the Hub of a distinct Region, no two sharing a Region
    - **Validates: Requirements 7.2**

- [x] 3. Spy distance module
  - [x] 3.1 Implement spy distance BFS at `lib/turn-engine/spy-distance.ts`
    - `initializeSpyDistanceMatrix()` — load car/boat edges only (exclude plane), build adjacency list, BFS from each location, cache in module scope
    - `computeSpyDistance(fromLocationId, toLocationId)` — return cached distance, lazy-init on first call
    - Follow same pattern as `lib/map/distance.ts` but filter to car/boat edges only
    - _Requirements: 9.7_

  - [x] 3.2 Write property test for spy distance at `lib/turn-engine/__tests__/spy-distance.property.test.ts`
    - **Property 14: Spy Distance Uses Car/Boat Subgraph Only**
    - For any location pair, spy distance >= full-graph distance (since plane shortcuts excluded)
    - Spy distance computed over car/boat-only subgraph matches independent BFS on same subgraph
    - **Validates: Requirements 9.7**

- [x] 4. Action validation and execution
  - [x] 4.1 Implement action validation at `lib/turn-engine/validate-action.ts`
    - `validateAction(action, turnState, playerId, playerPosition, adjacentLocations, playerCards)` — return error or null
    - Validate: correct player, room in-progress, correct slot order
    - MOVE: check adjacency exists, target != current, plane transport requires both endpoints are hubs
    - CAPTURE_ATTEMPT: check no duplicate flag
    - USE_CARD: check player holds card, card not consumed
    - _Requirements: 1.5, 1.6, 2.5, 2.6, 2.7, 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 5.4, 6.1, 6.2_

  - [x] 4.2 Implement MOVE executor at `lib/turn-engine/actions/execute-move.ts`
    - `executeMove(playerId, roomId, targetLocationId, tx)` — update PlayerPosition locationId
    - _Requirements: 3.6, 7.3_

  - [x] 4.3 Implement SKIP executor at `lib/turn-engine/actions/execute-skip.ts`
    - `executeSkip()` — no-op, returns void
    - _Requirements: 4.1_

  - [x] 4.4 Implement CAPTURE_ATTEMPT executor at `lib/turn-engine/actions/execute-capture-attempt.ts`
    - `executeCaptureAttempt(turnStateId, tx)` — set `captureAttemptFlag = true` on GameTurn
    - _Requirements: 5.1, 5.2_

  - [x] 4.5 Implement USE_CARD executor at `lib/turn-engine/actions/execute-use-card.ts`
    - `executeUseCard(playerId, roomId, cardId, tx)` — mark card as consumed, dispatch to placeholder effect handler
    - _Requirements: 6.3, 6.4, 6.5_

  - [x] 4.6 Write property tests for move validation at `lib/turn-engine/__tests__/move-validation.property.test.ts`
    - **Property 5: Move Adjacency Validation** — MOVE valid iff adjacency edge exists and target != current
    - **Property 6: Transport-Mode Movement Rules** — plane requires both endpoints isHub, car/boat always allowed
    - **Property 7: Position Update on Valid Move** — after valid MOVE, position equals target
    - **Property 8: Sequential Slot Position Chaining** — second action validated from post-move position
    - **Validates: Requirements 2.2, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 7.3**

- [x] 5. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. End-of-turn resolution
  - [x] 6.1 Implement capture resolution at `lib/turn-engine/resolution/resolve-capture.ts`
    - `resolveCaptureAttempt(roomId, playerId, playerLocationId, tx)` — compare to Mastermind location
    - On match: update Room status to "finished", record winner, return success outcome
    - On mismatch: set skipNextTurn flag, return failed outcome (without revealing Mastermind location)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 14.1, 14.3, 14.4_

  - [x] 6.2 Implement spy/reward resolution at `lib/turn-engine/resolution/resolve-spy-reward.ts`
    - `resolveSpyAndReward(roomId, playerId, playerLocationId, currentRound, tx)` — evaluate Cases 1–5 in priority order
    - Case 1 (pending reward + left region): grant cards per reward tier (at least 1 locator), clear pending reward, emit public event
    - Case 2 (pending reward + same region): no action
    - Case 3 (spy captured + no pending): no action
    - Case 4 (at uncaptured spy): capture spy, set pending reward, return private message
    - Case 5 (in region with uncaptured spy): compute spy distance, append notebook entry
    - Helper: `computeRewardTier(captureOrder)` — 1→4, 2→3, 3→2, 4-6→1
    - Helper: `grantRewardCards(playerId, roomId, rewardTier, tx)` — select random cards with locator guarantee, enforce max hand size 5
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 10.1, 10.2, 10.3, 10.4, 10.5, 11.2_

  - [x] 6.3 Implement end-of-turn orchestrator at `lib/turn-engine/resolution/resolve-end-of-turn.ts`
    - `resolveEndOfTurn(roomId, playerId, turnState, tx)` — run Step A (capture) then Step B (spy/reward)
    - Skip Step B if capture succeeded (game won)
    - Skip Step A if no capture flag set
    - _Requirements: 8.3, 8.7, 8.8_

  - [x] 6.4 Write property tests for capture resolution at `lib/turn-engine/__tests__/capture-resolution.property.test.ts`
    - **Property 11: Capture Attempt Deferred Resolution at Final Position** — capture resolved against final position after all moves
    - **Property 12: Capture Resolution Correctness** — success iff final location == Mastermind location; on success room→finished, on failure skipNextTurn set
    - **Validates: Requirements 5.1, 5.3, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7**

  - [x] 6.5 Write property tests for spy resolution at `lib/turn-engine/__tests__/spy-resolution.property.test.ts`
    - **Property 13: Step B Priority Case Exclusivity** — exactly one of 5 cases matches and executes per resolution
    - **Property 15: Reward Tier Mapping** — captureOrder maps to correct card count, at least 1 locator guaranteed
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.1, 10.3**

- [x] 7. Turn advancement and event feed
  - [x] 7.1 Implement turn advancement at `lib/turn-engine/advance-turn.ts`
    - `advanceTurn(roomId, turnState, tx)` — find next player in turnPosition order, handle round wrap, skip flagged players (clear flag + emit event for each), handle all-flagged edge case
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 13.2, 13.3, 13.5, 13.6_

  - [x] 7.2 Implement event feed helper at `lib/turn-engine/event-feed.ts`
    - `emitEvent(roomId, type, payload, roundNumber, tx)` — insert GameEvent with next sequence number (MAX+1 for room), monotonically increasing
    - `getEventsFeed(roomId, afterSequence, limit)` — return events with sequence > afterSequence, max 50
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8, 12.9_

  - [x] 7.3 Write property tests for turn advancement at `lib/turn-engine/__tests__/turn-advance.property.test.ts`
    - **Property 1: Round-Robin Turn Advancement** — advances to next turnPosition, wraps with round increment
    - **Property 2: Skip Flag Bypass and Clear** — skipped players cleared sequentially, all-flagged resets round
    - **Property 20: Two-Slot Turn Structure** — exactly 2 slots, slot 1 before slot 2, EoT after slot 2, max 1 capture attempt
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.7, 2.1, 2.3, 2.5, 2.7, 13.2, 13.3, 13.5, 13.6**

  - [x] 7.4 Write property tests for event feed at `lib/turn-engine/__tests__/event-feed.property.test.ts`
    - **Property 18: Event Feed Monotonicity and Completeness** — sequence numbers strictly increasing, round numbers non-decreasing, correct event types emitted
    - **Property 19: Card Validation and Consumption** — valid iff held + not consumed, hand never exceeds 5
    - **Validates: Requirements 12.1, 12.5, 12.6, 12.7, 12.8, 6.1, 6.3, 6.6**

- [x] 8. Submit action orchestrator
  - [x] 8.1 Implement main orchestrator at `lib/turn-engine/submit-action.ts`
    - `submitAction(roomId, playerId, action)` — wrap in `prisma.$transaction` with Serializable isolation
    - Acquire row lock via `SELECT ... FOR UPDATE` on game_turns row
    - Validate room status, player turn, action validity
    - Execute action, emit public event to Event Feed
    - If slot 2: trigger `resolveEndOfTurn`, then `advanceTurn`
    - If slot 1: advance to slot 2, persist capture flag if applicable
    - Return `TurnActionResult` with resolution data
    - _Requirements: 2.2, 2.3, 15.1, 15.2, 15.3, 15.4, 15.5, 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [x] 8.2 Create `lib/turn-engine/index.ts` re-exporting public API
    - Export `submitAction`, `getGamePollState`, types
    - _Requirements: 15.1_

  - [x] 8.3 Write property tests for state preservation and rejection at `lib/turn-engine/__tests__/state-preservation.property.test.ts`
    - **Property 3: Non-Current-Player Rejection** — actions from non-current player rejected, no state change
    - **Property 4: Inactive Game Rejection** — actions on non-in-progress room rejected, no state change
    - **Property 9: Failed Action State Preservation** — invalid actions leave all state unchanged
    - **Property 10: SKIP Is a No-Op** — SKIP changes nothing except slot counter
    - **Validates: Requirements 1.5, 1.6, 2.6, 4.1, 7.4, 14.2, 15.7, 15.8**

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Game state polling
  - [x] 10.1 Implement polling query at `lib/turn-engine/query-turn-state.ts`
    - `getGamePollState(roomId, playerId, afterSequence?)` — return full GamePollState
    - Include all player positions, current turn state, room status
    - Include requesting player's private data (notebook, cards, pending reward, skip flag)
    - Include event feed entries after provided sequence (max 50)
    - Exclude Mastermind location, uncaptured Spy locations
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [x] 10.2 Write property test for information hiding at `lib/turn-engine/__tests__/information-hiding.property.test.ts`
    - **Property 17: Information Hiding in Responses** — poll responses never contain Mastermind location or uncaptured Spy locations; notebook visible only to owner
    - **Validates: Requirements 8.6, 11.1, 11.5, 16.4**

- [x] 11. API route handlers
  - [x] 11.1 Implement action submission API at `app/api/game/[roomId]/action/route.ts`
    - POST handler: extract roomId from params, playerId from auth, action from body
    - Call `submitAction(roomId, playerId, action)`
    - Return appropriate HTTP status codes (200 success, 401 unauth, 403 not turn, 409 conflict/inactive, 422 validation, 404 not in room)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_

  - [x] 11.2 Implement game state polling API at `app/api/game/[roomId]/state/route.ts`
    - GET handler: extract roomId from params, playerId from auth, afterSequence from query
    - Call `getGamePollState(roomId, playerId, afterSequence)`
    - Return 200 with game state, 403/404 for access errors
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_

  - [x] 11.3 Write integration tests for action API at `app/api/game/[roomId]/action/__tests__/action.route.test.ts`
    - Test full turn cycle (slot 1 + slot 2 + resolution)
    - Test auth rejection (no cookie → 401)
    - Test not-your-turn rejection (wrong player → 403)
    - Test invalid move rejection (non-adjacent → 422)
    - Test game-end flow (win → room status finished, subsequent actions rejected)
    - Test concurrency (race two requests, only one succeeds)
    - **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8, 17.2, 17.3**

  - [x] 11.4 Write integration tests for polling API at `app/api/game/[roomId]/state/__tests__/state.route.test.ts`
    - Test response includes all player positions, turn state, events
    - Test private data only visible to requesting player
    - Test sequence-based event pagination (max 50 entries)
    - Test access denied for non-members
    - Test hidden state not exposed
    - **Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5, 16.6**

- [x] 12. Notebook module
  - [x] 12.1 Implement notebook operations at `lib/turn-engine/notebook.ts`
    - `appendNotebookEntry(roomId, playerId, entry, tx)` — insert NotebookEntry of type "spy-proximity"
    - `getPlayerNotebook(roomId, playerId, limit)` — return entries ordered by createdAt asc, max 200
    - Reject cross-player access
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (20 properties total)
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all implementations use TypeScript
- Spy distance matrix uses the same lazy-init pattern as `lib/map/distance.ts` but filters to car/boat edges only
- Concurrency handled via SELECT FOR UPDATE + Serializable isolation level
- Action Cards spec handles the actual card effects — `executeUseCard` dispatches to a placeholder handler
- The Event Feed (Tablet) does NOT emit events for private clue deliveries or spy capture itself (only spy-captured-reward-collected when player exits region)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.2"] },
    { "id": 4, "tasks": ["2.4", "4.1", "4.2", "4.3", "4.4", "4.5"] },
    { "id": 5, "tasks": ["4.6", "6.1", "6.2", "7.2", "12.1"] },
    { "id": 6, "tasks": ["6.3", "7.1"] },
    { "id": 7, "tasks": ["6.4", "6.5", "7.3", "7.4"] },
    { "id": 8, "tasks": ["8.1", "8.2"] },
    { "id": 9, "tasks": ["8.3", "10.1"] },
    { "id": 10, "tasks": ["10.2", "11.1", "11.2"] },
    { "id": 11, "tasks": ["11.3", "11.4"] }
  ]
}
```
