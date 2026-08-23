# Implementation Plan: game-wiring

## Overview

Wire the presentational game-screen components to the turn-engine API. This involves creating the error-messages module, extending `useGamePoll` with `refetch()`, building the `useSubmitAction` hook, a pure legal-moves utility, then connecting CityMarkers, ActionBar, CardHand, and lobby navigation to these hooks. Zero new dependencies; TypeScript strict, Tailwind v4 dark theme.

## Tasks

- [x] 1. Error message mapping module
  - [x] 1.1 Create `lib/game-ui/error-messages.ts` with the `errorMessageFor` function
    - Export a `Record<TurnActionErrorCode | "UNKNOWN", string>` with 17 distinct human-readable messages
    - Export `errorMessageFor(code)` returning the mapped string
    - Pure module — no React imports, no side-effects
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 1.2 Write unit test for `errorMessageFor`
    - **Property 3: Error codes map to distinct human-readable messages**
    - **Validates: Requirements 2.2**
    - Test that all 16 codes plus "UNKNOWN" return distinct non-empty strings
    - Test that each code returns the exact expected sentence

- [x] 2. Extend `useGamePoll` with `refetch()`
  - [x] 2.1 Add `refetch` function to `lib/hooks/use-game-poll.ts`
    - Add `isPollingRef` to prevent concurrent fetches
    - `refetch()` clears current interval, executes immediate `poll()`, restarts interval from zero
    - Skip immediate fetch if `isPollingRef` is already true (concurrent guard)
    - Return `refetch` in the hook result alongside `state`, `error`, `isLoading`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 2.2 Write unit test for `refetch` behavior
    - **Property 12: Refetch resets poll interval and triggers immediate poll**
    - **Property 13: Successful refetch updates state and clears error**
    - **Validates: Requirements 7.2, 7.5**
    - Mock `fetch` and `setInterval`/`clearInterval`, verify interval reset and immediate poll call

- [x] 3. Action submission hook
  - [x] 3.1 Create `lib/hooks/use-submit-action.ts` implementing `useSubmitAction`
    - Accepts `roomId: string` and `refetch: () => void`
    - Returns `{ submit, isSubmitting, error }`
    - In-flight guard via `useRef` — reject concurrent `submit()` calls
    - POST to `/api/game/${roomId}/action` with JSON payload
    - On 2xx: call `refetch()`
    - On non-2xx with `{ code }`: set `error` via `errorMessageFor(code)`; also `refetch()` on CONCURRENCY_CONFLICT
    - On network failure: set `error` to `errorMessageFor("UNKNOWN")`
    - Clear `error` at start of each new submission
    - Set `isSubmitting = true` before request, `false` after resolution
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9_

  - [x] 3.2 Write unit tests for `useSubmitAction`
    - **Property 1: Submit sends correct POST for any valid ActionPayload**
    - **Property 2: In-flight guard prevents concurrent submissions**
    - **Property 4: Non-2xx error code produces mapped error message**
    - **Property 5: New submission clears previous error**
    - **Property 6: isSubmitting lifecycle for any outcome**
    - **Validates: Requirements 1.2, 1.3, 1.5, 1.8, 1.9**
    - Mock `fetch`, test 2xx/4xx/network-error flows, verify refetch called on success and CONCURRENCY_CONFLICT

- [x] 4. Checkpoint — Verify hooks compile and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Legal-move computation utility
  - [x] 5.1 Create `lib/game-ui/legal-moves.ts` with `computeLegalMoves`
    - Pure function: accepts `viewerLocationId`, `adjacency: AdjacencyListEntry[]`, `blockedTransports: Set<TransportType>`, `hubLocationIds: Set<string>`
    - Returns `LegalMoveEntry[]` (each with `locationId` and `transport`)
    - Filters out edges where `transport` is blocked
    - Filters out plane edges when neither origin nor target is in `hubLocationIds`
    - _Requirements: 3.3, 3.4, 3.6_

  - [x] 5.2 Write unit tests for `computeLegalMoves`
    - **Property 7: Legal-move highlighting matches computed legal set**
    - **Property 8: Blockade exclusion from legal moves**
    - **Validates: Requirements 3.3, 3.4, 3.6**
    - Test blocked transports excluded, plane-hub rule, standard adjacency output

- [x] 6. CityMarkers enhancement
  - [x] 6.1 Update `app/game/[roomId]/components/city-markers.tsx` with move selection
    - Add props: `legalMoveIds`, `isViewerTurn`, `isSubmitting`, `onMoveSelect`
    - Highlight markers in `legalMoveIds` with `ring-2 ring-emerald-400` when `isViewerTurn && !isSubmitting`
    - Disable click/keyboard on all markers when `!isViewerTurn || isSubmitting`
    - Make highlighted markers focusable (`tabIndex={0}`, `role="button"`, `aria-label="Move to {name}"`)
    - Handle Enter/Space key for activation
    - On activation, call `onMoveSelect(targetLocationId)`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7_

  - [x] 6.2 Create `MoveFallbackList` component for compact viewports
    - Render below the map; visible on narrow viewports (`block sm:hidden`), hidden on wider (`hidden sm:block` on map)
    - Display legal move destinations as accessible buttons
    - Invoke same `onMoveSelect` callback
    - _Requirements: 3.8_

- [x] 7. ActionBar component
  - [x] 7.1 Create `app/game/[roomId]/components/action-bar.tsx`
    - Props: `isViewerTurn`, `isSubmitting`, `actionsRemaining`, `captureAttemptFlag`, `error`, `onSkip`, `onCaptureAttempt`
    - "Skip Turn" button calls `onSkip`
    - "Capture Attempt" button with inline confirmation prompt
    - Confirmation shows "Are you sure? This ends your turn if wrong." with Confirm/Cancel
    - On Cancel: hide prompt, return focus to Capture button
    - On Confirm: call `onCaptureAttempt`
    - Disable all buttons when `!isViewerTurn || isSubmitting || actionsRemaining === 0`
    - Disable Capture button when `captureAttemptFlag === true`
    - Use `aria-disabled="true"` (not HTML `disabled`) to keep buttons in tab order
    - Error region: `<div role="alert" aria-live="assertive">` renders when `error` is non-null
    - Dark theme styling with Tailwind v4
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [x] 7.2 Write unit tests for ActionBar
    - Test button disabled states, confirmation flow, error display, focus management
    - **Validates: Requirements 4.3, 4.4, 4.5, 4.6, 4.7, 4.8**

- [x] 8. Card play wiring
  - [x] 8.1 Wire `onCardSelect` handler in game page
    - In `app/game/[roomId]/page.tsx`: construct `UseCardPayload` from card selection
    - Include `targetPlayerId` only when `card.targetRequirement !== "none"`
    - Pass `isSubmitting` and `isViewerTurn` props to CardHand
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 9. Lobby-to-game navigation
  - [x] 9.1 Add `roomId` field to `LobbyState` interface in `lib/lobby/types.ts`
    - Add `roomId: string` to the `LobbyState` interface
    - _Requirements: 6.1_

  - [x] 9.2 Update lobby poll API to include `roomId` in response
    - Ensure the `/api/rooms/poll` response payload includes `roomId`
    - _Requirements: 6.2_

  - [x] 9.3 Add redirect logic to `app/lobby/[code]/page.tsx`
    - Detect `state.status === "in-progress"` && `state.roomId` non-empty
    - Guard with `isNavigating` state to prevent double navigation
    - `router.push(\`/game/${state.roomId}\`)`
    - Show loading spinner and disable interactive elements while navigating
    - _Requirements: 6.3, 6.4, 6.5_

  - [x] 9.4 Write unit test for lobby navigation logic
    - **Property 11: Lobby navigation on in-progress with valid roomId**
    - **Validates: Requirements 6.3, 6.4**
    - Test that navigation triggers only with both conditions met; test double-nav guard

- [x] 10. Page integration — wire hooks to game screen
  - [x] 10.1 Integrate all hooks and components into `app/game/[roomId]/page.tsx`
    - Call `useGamePoll(roomId)` with new `refetch` return
    - Call `useSubmitAction(roomId, refetch)`
    - Compute `legalMoveIds` from `computeLegalMoves(...)` using poll state + adjacency
    - Wire `onMoveSelect` → `submit({ actionType: "MOVE", targetLocationId })`
    - Wire `onSkip` → `submit({ actionType: "SKIP" })`
    - Wire `onCaptureAttempt` → `submit({ actionType: "CAPTURE_ATTEMPT" })`
    - Wire `handleCardSelect` → `submit(UseCardPayload)`
    - Pass error, isSubmitting, isViewerTurn to all child components
    - _Requirements: 1.2, 3.1, 4.1, 4.2, 5.1_
    - **Property 9: Click on legal destination produces correct MOVE payload**
    - **Property 10: Card select produces correct USE_CARD payload with conditional targetPlayerId**

- [x] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Zero new dependencies — all implementations use built-in React/Next.js APIs
- All components use dark theme (`bg-gray-900`, `text-white`, etc.) consistent with existing pages

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "5.1", "9.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "5.2", "9.2"] },
    { "id": 2, "tasks": ["2.2", "3.1", "6.1", "6.2", "7.1", "9.3"] },
    { "id": 3, "tasks": ["3.2", "7.2", "8.1", "9.4"] },
    { "id": 4, "tasks": ["10.1"] }
  ]
}
```
