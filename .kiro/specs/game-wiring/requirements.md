# Requirements Document

## Introduction

Wire the interactive game-screen components to the turn-engine API so players can submit moves, skip turns, attempt captures, play action cards, and navigate from lobby to an active game. This feature creates the `useSubmitAction` hook, an error-message mapping layer, extends the existing `useGamePoll` with an imperative `refetch()`, and connects the presentational components (map city markers, action bar, card hand) to actual server-side action resolution. Zero new dependencies; all code uses Next.js 16, React 19, TypeScript strict, Tailwind v4 dark theme.

## Glossary

- **ActionSubmitHook**: The `useSubmitAction` React hook at `lib/hooks/use-submit-action.ts` that manages POST requests to the action API.
- **ActionAPI**: The `POST /api/game/[roomId]/action` route handler that accepts `ActionPayload` and returns `TurnActionResult`.
- **GamePollHook**: The `useGamePoll` React hook at `lib/hooks/use-game-poll.ts` that polls game state.
- **ErrorMapper**: The module at `lib/game-ui/error-messages.ts` that maps `TurnActionErrorCode` values to human-readable sentences.
- **ActionBar**: The UI component providing Skip and Capture Attempt buttons plus error display.
- **CityMarkers**: The existing SVG map component at `app/game/[roomId]/components/city-markers.tsx` rendering clickable location circles.
- **CardHand**: The existing component at `app/game/[roomId]/components/card-hand.tsx` rendering the player's action cards.
- **LobbyPollHook**: The `useLobbyPoll` React hook at `lib/hooks/use-lobby-poll.ts`.
- **LobbyState**: The TypeScript interface at `lib/lobby/types.ts` representing room state returned by the lobby poll endpoint.
- **TurnActionErrorCode**: A union of 16 string literal error codes defined in `lib/turn-engine/types.ts`.
- **InFlightGuard**: Logic within ActionSubmitHook that prevents duplicate concurrent submissions.

## Requirements

### Requirement 1: Action Submission Hook

**User Story:** As a player, I want my game actions submitted reliably to the server so that my moves are processed without duplicate requests or silent failures.

#### Acceptance Criteria

1. THE ActionSubmitHook SHALL export a function `useSubmitAction(roomId: string)` returning an object with properties `submit`, `isSubmitting`, and `error`.
2. WHEN `submit` is called with a valid `ActionPayload`, THE ActionSubmitHook SHALL send a POST request to `/api/game/${roomId}/action` with the payload as JSON body.
3. WHILE `isSubmitting` is true, THE ActionSubmitHook SHALL reject additional calls to `submit` by returning immediately without sending a request.
4. WHEN the ActionAPI responds with a 2xx status, THE ActionSubmitHook SHALL call `refetch()` on the GamePollHook to retrieve fresh state immediately.
5. WHEN the ActionAPI responds with a non-2xx status containing a `code` field, THE ActionSubmitHook SHALL set `error` to the human-readable string returned by the ErrorMapper for that code.
6. WHEN the ActionAPI responds with error code `CONCURRENCY_CONFLICT`, THE ActionSubmitHook SHALL call `refetch()` on the GamePollHook in addition to setting the error.
7. WHEN a network transport failure occurs, THE ActionSubmitHook SHALL set `error` to the ErrorMapper output for a fallback unknown error.
8. WHEN a new submission begins, THE ActionSubmitHook SHALL clear any previous `error` value.
9. THE ActionSubmitHook SHALL set `isSubmitting` to true before the request and to false after the response or error is processed.

### Requirement 2: Error Message Mapping

**User Story:** As a player, I want clear error messages when my actions fail so that I understand what went wrong and what to do next.

#### Acceptance Criteria

1. THE ErrorMapper SHALL export a function `errorMessageFor(code: TurnActionErrorCode | "UNKNOWN"): string`.
2. THE ErrorMapper SHALL return a distinct human-readable sentence for each of the 16 `TurnActionErrorCode` values: NOT_IN_ROOM, GAME_NOT_ACTIVE, NOT_YOUR_TURN, NO_ACTIONS_REMAINING, INVALID_MOVE, INVALID_TRANSPORT, SAME_LOCATION_MOVE, ROADS_BLOCKED, AIRWAYS_BLOCKED, SEA_ROUTES_BLOCKED, DUPLICATE_CAPTURE_ATTEMPT, INVALID_CARD, UNKNOWN_CARD_TYPE, INVALID_CARD_TARGET, CONCURRENCY_CONFLICT, UNKNOWN_ACTION_TYPE.
3. WHEN called with `"UNKNOWN"`, THE ErrorMapper SHALL return a generic network-error sentence.
4. THE ErrorMapper SHALL contain no UI rendering logic — it is a pure mapping module.

### Requirement 3: Move Selection Wiring

**User Story:** As a player, I want to click a city on the map to move there so that navigation feels intuitive and immediate.

#### Acceptance Criteria

1. WHEN the viewer clicks a CityMarker that represents a legal move destination, THE CityMarkers component SHALL invoke the ActionSubmitHook `submit` with `{ actionType: "MOVE", targetLocationId }`.
2. WHILE it is not the viewer's turn, THE CityMarkers component SHALL disable click handlers on all markers.
3. WHILE it is the viewer's turn, THE CityMarkers component SHALL apply a visual highlight (distinct fill or ring) to markers representing locations adjacent to the viewer's current position via legal transport.
4. WHILE it is the viewer's turn, THE CityMarkers component SHALL remove the highlight from markers that are not legal move destinations.
5. WHILE a submission is in-flight, THE CityMarkers component SHALL disable click handlers on all markers.
6. WHEN a transport route to a destination is blocked by an active blockade, THE CityMarkers component SHALL exclude that destination from legal-move highlighting.
7. THE CityMarkers component SHALL remain keyboard accessible — each highlighted marker is focusable and activatable via Enter or Space.
8. IF the map SVG is not visible or is obscured (e.g., on compact layout), THEN THE system SHALL provide a list-based fallback displaying legal move destinations as accessible buttons that invoke the same submission logic.

### Requirement 4: Action Bar Component

**User Story:** As a player, I want dedicated buttons for skipping my turn and attempting capture so that I can take non-movement actions without confusion.

#### Acceptance Criteria

1. THE ActionBar SHALL render a "Skip Turn" button that invokes ActionSubmitHook `submit` with `{ actionType: "SKIP" }` when activated.
2. THE ActionBar SHALL render a "Capture Attempt" button that invokes ActionSubmitHook `submit` with `{ actionType: "CAPTURE_ATTEMPT" }` when activated, only after the player confirms via a confirmation step.
3. WHEN the "Capture Attempt" button is activated, THE ActionBar SHALL display a confirmation prompt before submitting the action.
4. WHEN the player dismisses the confirmation prompt, THE ActionBar SHALL not submit any action and SHALL return focus to the "Capture Attempt" button.
5. WHILE it is not the viewer's turn, THE ActionBar SHALL render all action buttons in a disabled state with `aria-disabled="true"`.
6. WHILE a submission is in-flight, THE ActionBar SHALL render all action buttons in a disabled state.
7. WHILE actions remaining is zero, THE ActionBar SHALL render all action buttons in a disabled state.
8. WHEN the ActionSubmitHook `error` is non-null, THE ActionBar SHALL display the error string in an ARIA live region with `aria-live="assertive"`.
9. THE ActionBar SHALL clear the displayed error when a new submission begins.
10. WHEN the player has already made a capture attempt this turn, THE ActionBar SHALL disable the "Capture Attempt" button independently of other conditions.

### Requirement 5: Card Play Wiring

**User Story:** As a player, I want to play action cards from my hand so that I can use special abilities during my turn.

#### Acceptance Criteria

1. WHEN the CardHand component emits an `onCardSelect` callback with a card object, THE system SHALL invoke ActionSubmitHook `submit` with `{ actionType: "USE_CARD", cardId, targetPlayerId? }`.
2. WHILE a submission is in-flight, THE CardHand component SHALL receive `isSubmitting: true` and disable all card tiles.
3. WHILE it is not the viewer's turn, THE CardHand component SHALL receive `isViewerTurn: false` and disable all card tiles.
4. WHEN a card-play submission fails, THE ActionBar error display SHALL show the error from the ErrorMapper for the returned code.
5. THE card-play wiring SHALL pass `targetPlayerId` to the `submit` payload only when the selected card's `targetRequirement` is not `"none"`.

### Requirement 6: Lobby-to-Game Navigation

**User Story:** As a player, I want to be automatically redirected to the game screen when the game starts so that the transition is seamless.

#### Acceptance Criteria

1. THE LobbyState interface SHALL include a `roomId: string` field representing the database identifier of the room.
2. THE lobby poll API endpoint SHALL include the `roomId` value in its response payload.
3. WHEN the LobbyPollHook detects `status` equal to `"in-progress"`, THE lobby page SHALL perform a client-side navigation to `/game/${roomId}`.
4. THE lobby page SHALL not navigate until both `status` is `"in-progress"` and `roomId` is a non-empty string.
5. WHILE navigation is in progress, THE lobby page SHALL display a loading indicator and disable interactive elements to prevent double navigation.

### Requirement 7: Extend GamePollHook with refetch

**User Story:** As a player, I want the game state to refresh immediately after I take an action so that I see the result without waiting for the next poll cycle.

#### Acceptance Criteria

1. THE GamePollHook SHALL return an additional `refetch` function in its result object alongside `state`, `error`, and `isLoading`.
2. WHEN `refetch` is called, THE GamePollHook SHALL clear the current polling interval, execute an immediate poll, and restart the interval timer from zero.
3. WHEN `refetch` is called while a poll is already in progress, THE GamePollHook SHALL not initiate a second concurrent request.
4. THE GamePollHook SHALL maintain its existing behavior: merging incremental events, stopping on "finished" status, and using `afterSequence` for delta fetches.
5. WHEN `refetch` triggers a successful poll, THE GamePollHook SHALL update the `state` value and clear any existing `error`.
