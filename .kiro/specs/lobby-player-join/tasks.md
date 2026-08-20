# Implementation Plan: Lobby & Player Join

## Overview

Implement the full lobby system for Shadow Hunt — room creation, joining via code or public listing, readiness toggling, game-start transition, player departure, host transfer, polling-based state sync, and disconnection detection. All logic lives in `lib/lobby/`, exposed via Next.js API routes under `app/api/rooms/`, with Prisma as the data layer against Postgres.

## Tasks

- [x] 1. Set up project infrastructure and shared types
  - [x] 1.1 Add Vitest and fast-check to the project
    - Install `vitest`, `@vitejs/plugin-react`, and `fast-check` as dev dependencies
    - Create `vitest.config.ts` at the project root configured for TypeScript path resolution
    - Add `"test": "vitest --run"` script to package.json
    - _Requirements: Tech stack convention — every function ships with a unit test_

  - [x] 1.2 Add Prisma models for Room and RoomPlayer
    - Add the `Room` and `RoomPlayer` models to `prisma/schema.prisma` as specified in the design
    - Include all indexes, unique constraints, and the cascade delete relation
    - Generate the Prisma client (`npx prisma generate`)
    - Create and apply a migration (`npx prisma migrate dev --name add-lobby-models`)
    - _Requirements: 1.1, 2.1, 3.1, 11.1_

  - [x] 1.3 Create shared lobby types in `lib/lobby/types.ts`
    - Define `RoomStatus`, `PlayerStatus`, `ReadyState`, `RoomVisibility` type aliases
    - Define `LobbyPlayer`, `LobbyState`, all result interfaces, `LobbyError`, and `LobbyErrorCode`
    - _Requirements: All (shared foundation)_

  - [x] 1.4 Create Prisma client singleton in `lib/prisma.ts`
    - Export a shared Prisma client instance with proper singleton pattern for Next.js dev/hot-reload
    - _Requirements: Tech stack convention_

  - [x] 1.5 Create player session utility in `lib/auth/player-session.ts`
    - Implement `getOrCreatePlayerId(req: Request): string` that reads a player ID from a cookie or generates a new one
    - Use a simple session cookie approach for MVP
    - _Requirements: Design — Player Identity section_

- [-] 2. Checkpoint - Commit infrastructure setup
  - Ensure all setup tasks pass basic validation
  - `git add -A && git commit -m "feat(lobby): project infrastructure and shared types"`

- [ ] 3. Implement room creation
  - [x] 3.1 Implement room code generator in `lib/lobby/room-code.ts`
    - Generate a 6-character uppercase alphanumeric code
    - Retry on collision (check against active rooms in DB)
    - _Requirements: 1.3_

  - [-] 3.2 Write property test for room code generation
    - **Property 1: Room creation produces valid initial state (code format subset)**
    - Verify generated codes are always 6 chars, uppercase, alphanumeric
    - **Validates: Requirements 1.3**

  - [-] 3.3 Implement `createRoom` in `lib/lobby/create-room.ts`
    - Accept `playerId`, `displayName`, `visibility`
    - Validate input (display name 1–30 chars, trimmed, no whitespace-only)
    - Check single-room constraint (player not already in a room)
    - Generate unique room code, create room + player in a transaction
    - Set host=true, readyState="not-ready", playerCount=1, status="waiting"
    - Return `CreateRoomResult` or `LobbyError`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 10.1_

  - [~] 3.4 Write property test for room creation
    - **Property 1: Room creation produces valid initial state**
    - **Property 2: Single-room constraint**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 2.5, 2.6**

  - [~] 3.5 Create API route `app/api/rooms/route.ts` (POST)
    - Validate request body, extract playerId from session
    - Delegate to `createRoom`, return JSON with appropriate HTTP status codes
    - _Requirements: 1.1, 1.4_

  - [~] 3.6 Write unit test for POST /api/rooms route
    - Test happy path, invalid input (400), already in room (409)
    - _Requirements: 1.1, 1.5_

- [ ] 4. Implement room joining
  - [~] 4.1 Implement `joinRoom` in `lib/lobby/join-room.ts`
    - Accept `playerId`, `displayName`, `roomCode`
    - Normalize roomCode to uppercase
    - Validate: room exists, room in "waiting" status, room not full (<4 players), player not already in any room, player not already in this room
    - Add player in a transaction, increment playerCount
    - Reset all existing players' readiness to "not-ready" on successful join
    - Return `JoinRoomResult` or `LobbyError`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.2, 3.3, 5.1, 5.4_

  - [~] 4.2 Write property tests for room joining
    - **Property 3: Join succeeds only when all preconditions are met**
    - **Property 4: Player count invariant (join subset)**
    - **Property 5: Player count arithmetic (join subset)**
    - **Property 8: Membership changes reset readiness (join subset)**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 5.1, 5.4**

  - [~] 4.3 Create API route `app/api/rooms/join/route.ts` (POST)
    - Validate request body (roomCode required, displayName required)
    - Delegate to `joinRoom`, return JSON with appropriate HTTP status codes
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [~] 4.4 Write unit test for POST /api/rooms/join route
    - Test happy path, room not found (404), room full (409), already in room (409), game started (409)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [~] 5. Checkpoint - Commit room creation and joining
  - Ensure all tests pass, ask the user if questions arise.
  - `git add -A && git commit -m "feat(lobby): infrastructure, room creation, and room joining"`

- [ ] 6. Implement player leaving and host transfer
  - [~] 6.1 Implement `leaveRoom` in `lib/lobby/leave-room.ts`
    - Accept `playerId`
    - Validate: player is in a room, room is in "waiting" status (reject if "in-progress")
    - If host leaves and others remain: transfer host to player with earliest joinedAt, set new host readyState to "not-ready"
    - If host leaves and no one remains: delete room
    - If non-host leaves: remove player, decrement playerCount
    - On any successful leave: reset remaining players' readiness to "not-ready"
    - Return `LeaveRoomResult` or `LobbyError`
    - _Requirements: 6.1, 6.2, 6.4, 7.1, 7.2, 7.4_

  - [~] 6.2 Write property tests for leaving and host transfer
    - **Property 5: Player count arithmetic (leave subset)**
    - **Property 8: Membership changes reset readiness (leave subset)**
    - **Property 9: Host transfer preserves room continuity**
    - **Property 11: Cannot leave during active game**
    - **Validates: Requirements 6.1, 6.2, 6.4, 6.5, 7.1, 7.2, 7.4**

  - [~] 6.3 Create API route `app/api/rooms/leave/route.ts` (POST)
    - Extract playerId from session
    - Delegate to `leaveRoom`, return JSON with appropriate HTTP status codes
    - _Requirements: 7.1, 7.4_

  - [~] 6.4 Write unit test for POST /api/rooms/leave route
    - Test host leaving with transfer, host leaving empty room (deletion), non-host leaving, cannot leave active game (409)
    - _Requirements: 6.1, 6.2, 7.1, 7.4_

- [ ] 7. Implement readiness toggle and game start
  - [~] 7.1 Implement `toggleReady` in `lib/lobby/toggle-ready.ts`
    - Accept `playerId`
    - Validate: player is in a room, room is in "waiting" status
    - Flip readyState between "ready" and "not-ready"
    - Return `ToggleReadyResult` or `LobbyError`
    - _Requirements: 5.2_

  - [~] 7.2 Write property test for ready toggle
    - **Property 7: Ready toggle is an involution**
    - **Validates: Requirements 5.2**

  - [~] 7.3 Create API route `app/api/rooms/ready/route.ts` (POST)
    - Extract playerId from session
    - Delegate to `toggleReady`, return JSON
    - _Requirements: 5.2_

  - [~] 7.4 Implement `startGame` in `lib/lobby/start-game.ts`
    - Accept `playerId`
    - Validate: player is host, room in "waiting" status, at least 2 players, all non-host players ready
    - In a transaction: set room status to "in-progress", assign random turn positions (1..N permutation)
    - Return `StartGameResult` or `LobbyError`
    - _Requirements: 4.1, 4.2, 4.3, 8.1, 8.2, 8.3_

  - [~] 7.5 Write property tests for game start
    - **Property 6: Game start preconditions**
    - **Property 10: Turn positions form a valid permutation**
    - **Validates: Requirements 4.1, 4.2, 4.3, 8.1, 8.2**

  - [~] 7.6 Create API route `app/api/rooms/start/route.ts` (POST)
    - Extract playerId from session
    - Delegate to `startGame`, return JSON
    - _Requirements: 8.1_

  - [~] 7.7 Write unit tests for POST /api/rooms/ready and POST /api/rooms/start routes
    - Test toggle happy path, start precondition failures (403, 409)
    - _Requirements: 4.1, 4.2, 4.3, 5.2, 5.3_

- [~] 8. Checkpoint - Commit leaving, readiness, and game start
  - Ensure all tests pass, ask the user if questions arise.
  - `git add -A && git commit -m "feat(lobby): leaving, host transfer, readiness, and game start"`

- [ ] 9. Implement polling and public room listing
  - [~] 9.1 Implement `pollState` in `lib/lobby/poll-state.ts`
    - Accept `playerId`
    - Validate: player is in a room
    - Update player's `lastActivityAt` to current server time
    - Return full `LobbyState` (player list with readiness, host identity, room status, turn positions)
    - Call `processDisconnections` for the room
    - Return `PollStateResult` or `LobbyError`
    - _Requirements: 9.1, 9.3, 11.1_

  - [~] 9.2 Write property test for poll state
    - **Property 12: Poll response completeness**
    - **Validates: Requirements 9.1, 9.3**

  - [~] 9.3 Implement `listPublicRooms` in `lib/lobby/list-public-rooms.ts`
    - Query rooms where visibility="public", status="waiting", playerCount < 4
    - Order by createdAt descending, limit to 50
    - Return roomCode, hostName, playerCount for each
    - _Requirements: 10.2, 10.3, 10.8_

  - [~] 9.4 Write property test for public room listing
    - **Property 13: Public room listing correctness**
    - **Validates: Requirements 10.2, 10.3, 10.8**

  - [~] 9.5 Create API route `app/api/rooms/poll/route.ts` (GET)
    - Extract playerId from session
    - Delegate to `pollState`, return JSON
    - _Requirements: 9.1, 9.3_

  - [~] 9.6 Create API route `app/api/rooms/public/route.ts` (GET)
    - Delegate to `listPublicRooms`, return JSON
    - _Requirements: 10.2, 10.8_

  - [~] 9.7 Write unit tests for GET /api/rooms/poll and GET /api/rooms/public routes
    - Test poll updates lastActivityAt, poll when not in room (404), public listing returns correct rooms
    - _Requirements: 9.1, 9.3, 9.4, 10.2, 10.8_

- [ ] 10. Implement disconnection detection
  - [~] 10.1 Implement `processDisconnections` in `lib/lobby/disconnection.ts`
    - Accept `roomId`
    - Query all players in room where `lastActivityAt` is older than 10s from now
    - Mark those players as "disconnected", set `disconnectedAt`
    - For rooms in "waiting" status: trigger host transfer if host is disconnected
    - For rooms in "in-progress" status: disconnected players' turns will be skipped (handled by game engine)
    - _Requirements: 11.1, 11.5, 11.6, 6.5_

  - [~] 10.2 Implement reconnection logic in `pollState`
    - When a disconnected player polls, restore their status to "connected", clear `disconnectedAt`
    - _Requirements: 11.3_

  - [~] 10.3 Implement `checkAbandonedRooms` in `lib/lobby/disconnection.ts`
    - Query rooms in "in-progress" where ALL players are disconnected and the earliest `disconnectedAt` is older than 60s
    - Set room status to "abandoned"
    - _Requirements: 11.7_

  - [~] 10.4 Implement forfeit logic for extended disconnection
    - In `processDisconnections`, check for players disconnected for more than 5 minutes in "in-progress" rooms
    - Permanently remove them (delete RoomPlayer, decrement playerCount)
    - _Requirements: 11.8_

  - [~] 10.5 Write property tests for disconnection detection
    - **Property 14: Disconnection detection and reconnection**
    - **Property 16: Room abandonment on total disconnection**
    - **Property 17: Forfeit on extended disconnection**
    - **Validates: Requirements 11.1, 11.3, 11.7, 11.8**

- [~] 11. Checkpoint - Commit polling and disconnection
  - Ensure all tests pass, ask the user if questions arise.
  - `git add -A && git commit -m "feat(lobby): polling, public rooms, and disconnection detection"`

- [ ] 12. Implement client-side polling hook and lobby UI
  - [~] 12.1 Create `lib/hooks/use-lobby-poll.ts` custom hook
    - Implement polling at 3–5s interval using `setInterval` + `fetch`
    - Return `{ state, error, isLoading }`
    - Clean up interval on unmount
    - Handle errors gracefully (retry on transient failures)
    - _Requirements: 9.1, 9.2_

  - [~] 12.2 Create lobby UI page at `app/lobby/[code]/page.tsx`
    - Display player list with readiness indicators
    - Show host badge
    - Display room code for sharing
    - Show ready/not-ready toggle button
    - Show start game button (host only, enabled when preconditions met)
    - Show leave button
    - Show connected/disconnected status per player
    - Use Tailwind CSS for styling
    - _Requirements: 9.1, 5.2, 7.3, 6.3_

  - [~] 12.3 Create room creation UI component
    - Form with display name input and visibility toggle (public/private)
    - On submit, POST to /api/rooms and redirect to lobby page
    - _Requirements: 1.1, 10.1_

  - [~] 12.4 Create join room UI component
    - Form with display name input and room code input
    - On submit, POST to /api/rooms/join and redirect to lobby page
    - Display validation errors from the API
    - _Requirements: 2.1_

  - [~] 12.5 Create public room browser component
    - Poll GET /api/rooms/public at 5s interval
    - Display list of available rooms with host name, player count, and join button
    - _Requirements: 10.2, 10.8_

- [ ] 13. Wire everything together and final integration
  - [~] 13.1 Create main page layout with create/join/browse options
    - Update `app/page.tsx` to include navigation to create room, join by code, or browse public rooms
    - _Requirements: 1.1, 2.1, 10.2_

  - [~] 13.2 Add error handling and loading states across all UI components
    - Show appropriate error messages for all `LobbyErrorCode` values
    - Add loading spinners during API calls
    - _Requirements: All error handling requirements_

  - [~] 13.3 Write integration tests for full lobby flow
    - Test create → join → ready → start flow end-to-end
    - Test host transfer on leave
    - Test concurrent join race condition
    - _Requirements: 1.1, 2.1, 5.2, 8.1, 6.1, 10.5, 10.6_

- [~] 14. Final checkpoint - Commit client UI and integration
  - Ensure all tests pass, ask the user if questions arise.
  - `git add -A && git commit -m "feat(lobby): client UI and final integration"`

- [ ] 15. Create user test scenarios document
  - [~] 15.1 Create `docs/lobby-test-scenarios.md`
    - Write step-by-step manual test scenarios a user can follow in the browser to verify the lobby works
    - Include a "Prerequisites" section explaining how to run the project locally
    - Scenarios should cover: create room, share code, join room, see players appear, toggle ready, start game, leave room, host transfer
    - Each scenario should have numbered steps with expected results
    - _Requirements: All (manual verification)_

- [ ] 16. Create local development setup guide
  - [~] 16.1 Create `docs/LOCAL-SETUP.md`
    - Document: clone, install deps, set up .env with DATABASE_URL, run prisma migrate, run dev server
    - Include a troubleshooting section for common issues (Neon SSL, prisma generate, etc.)
    - _Requirements: Tech stack convention (developer onboarding)_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Commits happen at each checkpoint to keep git history clean and reviewable
- Property tests validate universal correctness properties defined in the design
- Unit tests validate specific examples and edge cases
- The polling hook uses `setInterval` — no WebSockets per tech stack convention
- All file names use kebab-case per project conventions
- Vitest is used as the test runner (TypeScript-native, fast, Next.js compatible)
- fast-check is used for property-based testing

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.5"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3"] },
    { "id": 4, "tasks": ["3.4", "3.5", "4.1"] },
    { "id": 5, "tasks": ["3.6", "4.2", "4.3"] },
    { "id": 6, "tasks": ["4.4", "6.1", "7.1"] },
    { "id": 7, "tasks": ["6.2", "6.3", "7.2", "7.3", "7.4"] },
    { "id": 8, "tasks": ["6.4", "7.5", "7.6"] },
    { "id": 9, "tasks": ["7.7", "9.1", "9.3"] },
    { "id": 10, "tasks": ["9.2", "9.4", "9.5", "9.6"] },
    { "id": 11, "tasks": ["9.7", "10.1"] },
    { "id": 12, "tasks": ["10.2", "10.3", "10.4"] },
    { "id": 13, "tasks": ["10.5"] },
    { "id": 14, "tasks": ["12.1", "12.3", "12.4", "12.5"] },
    { "id": 15, "tasks": ["12.2"] },
    { "id": 16, "tasks": ["13.1", "13.2"] },
    { "id": 17, "tasks": ["13.3"] },
    { "id": 18, "tasks": ["15.1", "16.1"] }
  ]
}
```
