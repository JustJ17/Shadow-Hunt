# Implementation Plan: Win Detection & Game End

## Overview

Implement the game lifecycle completion for Shadow Hunt: draw detection when rounds exceed the configurable maximum, GameResult persistence on both win and draw paths, a Game Result query API, and an EndScreen UI component. Hooks into the existing turn engine (`advanceTurn`, `resolveCaptureAttempt`, `submitAction`) and follows the established Serializable transaction pattern.

## Tasks

- [x] 1. Prisma schema changes and migration
  - [x] 1.1 Add GameResult model and maxRoundLimit field to schema
    - Add `GameResult` model with `id` (cuid), `roomId` (String, @unique), `outcome` (String), `winnerId` (String?), `winLocationId` (String?), `mastermindLocationId` (String), `roundNumber` (Int), `reason` (String?), `createdAt` (DateTime @default(now()))
    - Add relation `room Room @relation(fields: [roomId], references: [id], onDelete: Cascade)`
    - Map to `"game_results"`
    - Add `maxRoundLimit Int @default(20)` field to existing `Room` model
    - Add `gameResult GameResult?` relation field to existing `Room` model
    - _Requirements: 1.5, 1.6, 2.1, 2.2, 2.3, 2.4_

  - [x] 1.2 Generate Prisma migration and regenerate client
    - Run `npx prisma migrate dev --name add-game-result-and-max-round-limit`
    - Verify generated SQL includes unique constraint on `game_results.roomId` and default value for `maxRoundLimit`
    - _Requirements: 2.3, 2.4_

- [x] 2. Type updates and game-result module
  - [x] 2.1 Extend types in `lib/turn-engine/types.ts`
    - Add `"game-draw"` to the `GameEventData.type` union
    - Add `DrawDetectionResult` interface: `{ drawDetected: boolean; drawEvent?: { roundNumber: number; mastermindLocationId: string } }`
    - _Requirements: 5.2, 5.3_

  - [x] 2.2 Create game result module at `lib/turn-engine/game-result.ts`
    - Define `GameResultWin`, `GameResultDraw`, `GameResultInProgress` interfaces
    - Define `GameResultResponse` union type
    - Implement `getGameResult(roomId, playerId)` — verify room exists (throw if not), verify player membership (throw if not member), check room status (return in-progress if not finished), query GameResult with Location joins for names and RoomPlayer join for winner displayName
    - _Requirements: 2.5, 2.6, 2.7, 2.8, 9.1, 9.2, 9.3, 9.6_

  - [x] 2.3 Write property test for Game Result API response shapes at `lib/turn-engine/__tests__/game-result.property.test.ts`
    - **Property 8: Game Result API returns correct shape based on outcome**
    - For any finished game with outcome "win", response includes winnerId, winnerDisplayName, winLocationId, winLocationName, mastermindLocationId, mastermindLocationName, roundNumber
    - For any finished game with outcome "draw", response includes roundNumber, reason, mastermindLocationId, mastermindLocationName
    - **Validates: Requirements 2.5, 9.2, 9.3**

- [x] 3. Modify advanceTurn for draw detection
  - [x] 3.1 Implement draw detection in `lib/turn-engine/advance-turn.ts`
    - Change return type from `Promise<void>` to `Promise<DrawDetectionResult>`
    - After computing `newRound`, query `Room.maxRoundLimit` within the transaction
    - Guard: if room status is already "finished", skip draw detection and return `{ drawDetected: false }`
    - If `newRound > maxRoundLimit`: set Room.status = "finished", fetch mastermind locationId from GameThreat, create GameResult with outcome "draw", emit "game-draw" event with `{ roundNumber, mastermindLocationId, reason: "max-rounds-exceeded" }`, return `{ drawDetected: true, drawEvent: { roundNumber, mastermindLocationId } }`
    - Otherwise proceed with normal turn advancement and return `{ drawDetected: false }`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 5.2, 5.4, 5.5_

  - [x] 3.2 Write property test for draw detection at `lib/turn-engine/__tests__/draw-detection.property.test.ts`
    - **Property 1: Draw triggers exactly when round exceeds limit on an active game**
    - For any game state where room is "in-progress" and advanceTurn increments round beyond maxRoundLimit, system transitions room to "finished", creates GameResult with outcome "draw", and emits "game-draw" event
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4**

  - [x] 3.3 Write property test for draw guard on finished games at `lib/turn-engine/__tests__/draw-detection.property.test.ts`
    - **Property 2: Draw never fires on an already-finished game**
    - For any game state where room status is already "finished", calling advanceTurn does not emit "game-draw" event, does not create GameResult, and does not modify room status
    - **Validates: Requirements 1.7, 5.3**

- [x] 4. Modify resolveCaptureAttempt for GameResult creation on win
  - [x] 4.1 Extend `resolveCaptureAttempt` in `lib/turn-engine/resolution/resolve-capture.ts`
    - Add `roundNumber` parameter (from current turnState.currentRound)
    - On success path (after setting room to "finished"): create GameResult with outcome "win", winnerId = playerId, winLocationId = playerLocationId, mastermindLocationId = threat.locationId, roundNumber
    - Emit "game-won" event with `{ winnerId: playerId, locationId: playerLocationId, mastermindLocationId: threat.locationId }`
    - _Requirements: 2.1, 2.4, 5.1_

  - [x] 4.2 Write property test for win GameResult creation at `lib/turn-engine/__tests__/win-result.property.test.ts`
    - **Property 4: Win creates correct GameResult**
    - For any successful capture attempt, system creates GameResult with outcome "win", correct winnerId, winLocationId matching capture location, correct mastermindLocationId, and current round number
    - **Validates: Requirements 2.1**

  - [x] 4.3 Write property test for mastermind location reveal at `lib/turn-engine/__tests__/win-result.property.test.ts`
    - **Property 9: Mastermind location revealed on both outcomes**
    - For any game-ending event (win or draw), the event payload contains non-null mastermindLocationId matching the actual GameThreat.locationId
    - **Validates: Requirements 1.3, 3.1, 5.1, 5.2**

- [x] 5. Modify submitAction to handle draw result
  - [x] 5.1 Update `submitAction` in `lib/turn-engine/submit-action.ts`
    - Update the `advanceTurn` call to capture the return value `{ drawDetected, drawEvent }`
    - If `drawDetected` is true: skip further turn advancement, include draw info in the `TurnActionResult` resolution (add optional `drawResult` to `EndOfTurnResolution` or use existing structure)
    - Update the condition that guards advanceTurn call — currently skips on capture success; maintain that behavior
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.2 Write property test for action rejection after game end at `lib/turn-engine/__tests__/action-rejection.property.test.ts`
    - **Property 6: Action rejection after game end**
    - For any valid action payload submitted to a room with status "finished", system returns GAME_NOT_ACTIVE error and does not modify game state
    - **Validates: Requirements 4.1, 4.2**

  - [x] 5.3 Write property test for event mutual exclusivity at `lib/turn-engine/__tests__/event-exclusivity.property.test.ts`
    - **Property 7: Event mutual exclusivity**
    - For any finished game session, the Event Feed contains at most one of "game-won" or "game-draw" events, never both
    - **Validates: Requirements 5.3**

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Modify initializeGame for maxRoundLimit
  - [x] 7.1 Update `initializeGame` in `lib/game/initialize-game.ts`
    - Accept optional `maxRoundLimit` parameter (default: 20)
    - Validate range [1, 100] — return error with code `INVALID_ROUND_LIMIT` if out of range
    - Set `maxRoundLimit` on Room record during game initialization (update Room within the transaction)
    - _Requirements: 1.5, 1.6_

  - [x] 7.2 Write property test for maxRoundLimit validation at `lib/game/__tests__/max-round-limit.property.test.ts`
    - **Property 3: maxRoundLimit validation**
    - For any integer value, system accepts it if and only if in range [1, 100]; values outside are rejected
    - **Validates: Requirements 1.6**

- [x] 8. Game Result API route
  - [x] 8.1 Create API route at `app/api/game/[roomId]/result/route.ts`
    - Implement GET handler
    - Extract playerId from cookie (return 401 if missing)
    - Call `getGameResult(roomId, playerId)`
    - Return 200 for success (finished or in-progress response)
    - Return 401 for unauthenticated, 403 for access denied, 404 for room not found
    - Follow existing API route patterns (cookie-based auth from other game routes)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 8.2 Write unit tests for Game Result API route at `app/api/game/[roomId]/result/__tests__/route.test.ts`
    - Test 401 when no session cookie
    - Test 403 when player not a room member
    - Test 404 when room does not exist
    - Test 200 with in-progress response for active game
    - Test 200 with win response shape
    - Test 200 with draw response shape
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.7, 9.8_

- [x] 9. EndScreen component and game page integration
  - [x] 9.1 Create EndScreen component at `app/game/[roomId]/components/EndScreen.tsx`
    - Client component (`"use client"`)
    - Accept props: `roomId`, `playerId`, `events` (GameEventData[])
    - Detect outcome from Event Feed (find "game-won" or "game-draw" event)
    - Fetch `/api/game/[roomId]/result` for display names and location names
    - Win view: winner display name with visual indicator (trophy icon or distinct styling), capture location name, mastermind location name, viewer-specific heading ("You won!" vs "[Name] found the target")
    - Draw view: draw heading, reason (maximum rounds exceeded), round number, mastermind location name
    - Fallback: generic "Game Ended" message if no end event found and API times out (5s)
    - Include "Return to Lobby" navigation link
    - Accessible: proper heading hierarchy, ARIA labels on interactive elements
    - _Requirements: 3.1, 3.2, 3.3, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4, 8.2, 8.3, 8.5_

  - [x] 9.2 Integrate EndScreen into game page at `app/game/[roomId]/page.tsx`
    - When polling returns status "finished" → render EndScreen component instead of active game view
    - On direct navigation to finished game URL → render EndScreen on initial load (no flash of active game view)
    - _Requirements: 8.1, 8.4, 8.6_

  - [x] 9.3 Write component tests for EndScreen at `app/game/[roomId]/components/__tests__/EndScreen.test.tsx`
    - Test renders winner name and trophy indicator for win outcome
    - Test renders "You won!" heading when viewer is the winner
    - Test renders "[Name] found the target" heading when viewer is not the winner
    - Test renders draw heading and reason for draw outcome
    - Test renders mastermind location on both outcomes
    - Test renders "Return to Lobby" navigation link
    - Test renders fallback message when API times out
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.7, 7.1, 7.2, 7.3, 8.3, 8.5_

- [x] 10. Uniqueness constraint property test
  - [x] 10.1 Write property test for exactly one GameResult per game at `lib/turn-engine/__tests__/game-result-uniqueness.property.test.ts`
    - **Property 5: Exactly one GameResult per finished game**
    - For any finished game session, there exists exactly one GameResult record with that roomId; attempting to create a second is prevented by unique constraint
    - **Validates: Requirements 2.3**

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The existing `GAME_NOT_ACTIVE` guard in `submitAction` already rejects actions on finished games — no new lock mechanism needed
- The "game-won" event emission is being moved into `resolveCaptureAttempt` (currently events fire during resolution in `resolve-end-of-turn.ts`); verify existing behavior and adjust accordingly
- Transaction safety: all game-ending operations occur within the existing Serializable transaction in `submitAction`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "4.1", "7.1"] },
    { "id": 3, "tasks": ["2.3", "3.2", "3.3", "4.2", "4.3", "5.1", "7.2"] },
    { "id": 4, "tasks": ["5.2", "5.3", "8.1"] },
    { "id": 5, "tasks": ["8.2", "9.1", "10.1"] },
    { "id": 6, "tasks": ["9.2", "9.3"] }
  ]
}
```
