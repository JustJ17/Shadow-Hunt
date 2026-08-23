# Design Document — game-wiring

## Overview

This feature wires presentational game-screen components to the existing turn-engine API. It introduces a single action-submission hook (`useSubmitAction`), a pure error-mapping module, extends the existing `useGamePoll` hook with an imperative `refetch()` method, and connects interactive components (city markers, action bar, card hand) to server-side action resolution. It also bridges the lobby→game transition with a client-side redirect.

No new dependencies are added. All code uses Next.js App Router, React 19, TypeScript strict mode, and Tailwind v4 dark theme.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  app/game/[roomId]/page.tsx (game screen)                           │
│                                                                     │
│  ┌───────────────────────────┐   ┌────────────────────────────────┐ │
│  │ useGamePoll(roomId)       │   │ useSubmitAction(roomId)         │ │
│  │ → state, error, isLoading │   │ → submit, isSubmitting, error  │ │
│  │ → refetch (NEW)           │   │   ↳ calls POST /api/.../action │ │
│  └───────────┬───────────────┘   │   ↳ calls refetch on success   │ │
│              │                    └────────────┬───────────────────┘ │
│              │                                 │                     │
│  ┌───────────▼─────────────────────────────────▼───────────────────┐│
│  │ Presentational Layer                                            ││
│  │  ┌──────────────┐  ┌────────────┐  ┌──────────────────────┐    ││
│  │  │ CityMarkers  │  │ ActionBar  │  │ CardHand             │    ││
│  │  │ (move clicks)│  │ (skip/cap) │  │ (card select)        │    ││
│  │  └──────────────┘  └────────────┘  └──────────────────────┘    ││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────┐
│  app/lobby/[code]/page.tsx                 │
│  useLobbyPoll() → state.roomId            │
│  when status = "in-progress" → redirect   │
│  to /game/${roomId}                        │
└────────────────────────────────────────────┘

┌────────────────────────────────────┐
│  lib/game-ui/error-messages.ts     │
│  Pure map: TurnActionErrorCode     │
│  | "UNKNOWN" → human sentence      │
└────────────────────────────────────┘
```

## Components & Interfaces

### 1. `useSubmitAction` Hook — `lib/hooks/use-submit-action.ts`

```typescript
import type { ActionPayload, TurnActionErrorCode } from "@/lib/turn-engine/types";

interface UseSubmitActionResult {
  submit: (payload: ActionPayload) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}

export function useSubmitAction(
  roomId: string,
  refetch: () => void
): UseSubmitActionResult;
```

**Behavior:**
1. On `submit(payload)`:
   - If `isSubmitting` is already `true`, return immediately (in-flight guard).
   - Set `isSubmitting = true`, clear `error` to `null`.
   - POST to `/api/game/${roomId}/action` with JSON body.
   - On 2xx: call `refetch()`.
   - On non-2xx with `{ code }`: set `error` to `errorMessageFor(code)`. If `code === "CONCURRENCY_CONFLICT"`, also call `refetch()`.
   - On network failure (fetch throws): set `error` to `errorMessageFor("UNKNOWN")`.
   - Set `isSubmitting = false`.

**Design decisions:**
- `refetch` is injected as a parameter rather than importing `useGamePoll` directly, enabling testability and decoupling.
- The hook does not manage optimistic UI — the refetch after success drives the state update.
- The in-flight guard uses a `useRef` flag (not state) to avoid race conditions from React batching.

### 2. Error Message Mapping — `lib/game-ui/error-messages.ts`

```typescript
import type { TurnActionErrorCode } from "@/lib/turn-engine/types";

const ERROR_MESSAGES: Record<TurnActionErrorCode | "UNKNOWN", string> = {
  NOT_IN_ROOM: "You are not a participant in this game.",
  GAME_NOT_ACTIVE: "This game is no longer active.",
  NOT_YOUR_TURN: "It is not your turn yet.",
  NO_ACTIONS_REMAINING: "You have no actions remaining this turn.",
  INVALID_MOVE: "That is not a valid move destination.",
  INVALID_TRANSPORT: "No transport route connects you to that location.",
  SAME_LOCATION_MOVE: "You are already at that location.",
  ROADS_BLOCKED: "All road routes are currently blocked by a blockade.",
  AIRWAYS_BLOCKED: "All air routes are currently blocked by a blockade.",
  SEA_ROUTES_BLOCKED: "All sea routes are currently blocked by a blockade.",
  DUPLICATE_CAPTURE_ATTEMPT: "You have already made a capture attempt this turn.",
  INVALID_CARD: "That card is not available in your hand.",
  UNKNOWN_CARD_TYPE: "Card type not recognized.",
  INVALID_CARD_TARGET: "Invalid target player for that card.",
  CONCURRENCY_CONFLICT: "Another action was processed simultaneously. The board has been refreshed.",
  UNKNOWN_ACTION_TYPE: "Unrecognized action type.",
  UNKNOWN: "Something went wrong. Please check your connection and try again.",
};

export function errorMessageFor(code: TurnActionErrorCode | "UNKNOWN"): string {
  return ERROR_MESSAGES[code];
}
```

**Design decisions:**
- Pure module with no React imports — can be unit-tested without rendering.
- Exhaustive `Record` type ensures compile-time coverage of all codes.

### 3. `useGamePoll` Extension — `lib/hooks/use-game-poll.ts`

The existing hook is extended to expose a `refetch` function.

```typescript
interface UseGamePollResult {
  state: GamePollState | null;
  error: string | null;
  isLoading: boolean;
  refetch: () => void; // NEW
}
```

**`refetch()` implementation:**
1. Clear the active `setInterval` via `intervalRef`.
2. If a poll is already in-flight (tracked via `isPollingRef`), skip the immediate fetch but still reset the timer.
3. Execute `poll()` immediately.
4. Restart `setInterval` from zero.

Uses a new `isPollingRef` boolean to prevent concurrent requests.

### 4. Legal-Move Computation — `lib/game-ui/legal-moves.ts`

```typescript
import type { AdjacencyListEntry, TransportType } from "@/lib/map/types";
import type { ActiveBlockadeData } from "@/lib/turn-engine/types";

export interface LegalMoveEntry {
  locationId: string;
  transport: TransportType;
}

export function computeLegalMoves(
  viewerLocationId: string,
  adjacency: AdjacencyListEntry[],
  blockedTransports: Set<TransportType>,
  viewerLocationIsHub: boolean
): LegalMoveEntry[];
```

**Algorithm:**
1. Find the entry in `adjacency` where `locationId === viewerLocationId`.
2. For each edge in that entry:
   - Skip if `edge.transport` is in `blockedTransports`.
   - Skip if `edge.transport === "plane"` and either the origin or the target is not a hub (plane-non-hub rule).
   - Otherwise include `{ locationId: edge.targetLocationId, transport: edge.transport }`.
3. Return the filtered list.

**Design decisions:**
- Pure function, no hooks — easily testable with property-based tests.
- Accepts `blockedTransports` as a `Set<TransportType>` derived from `GamePollState.activeBlockades`.
- The hub check for planes requires knowing whether the *target* is a hub; the caller must pass a lookup or the adjacency data must include this. Since `AdjacencyListEntry.edges` includes `isSameRegion` but not `isHub`, the function also requires `viewerLocationIsHub` and a separate `hubLocationIds: Set<string>` parameter:

```typescript
export function computeLegalMoves(
  viewerLocationId: string,
  adjacency: AdjacencyListEntry[],
  blockedTransports: Set<TransportType>,
  hubLocationIds: Set<string>
): LegalMoveEntry[];
```

Updated algorithm step 2: Skip plane edges if neither `viewerLocationId` nor `edge.targetLocationId` is in `hubLocationIds`.

### 5. CityMarkers Enhancement — `app/game/[roomId]/components/city-markers.tsx`

New props:

```typescript
interface CityMarkersProps {
  // ...existing props (locations, viewerLocationId, etc.)
  legalMoveIds: Set<string>;
  isViewerTurn: boolean;
  isSubmitting: boolean;
  onMoveSelect: (targetLocationId: string) => void;
}
```

**Behavior:**
- When `isViewerTurn && !isSubmitting`: markers in `legalMoveIds` receive highlight styling (e.g., `ring-2 ring-emerald-400`) and are clickable/focusable.
- When `!isViewerTurn || isSubmitting`: all click/keyboard handlers are no-ops; no highlights shown.
- Each highlighted marker has `tabIndex={0}`, `role="button"`, `aria-label="Move to {locationName}"`, and responds to Enter/Space.
- A `<MoveFallbackList>` component renders below the map when the viewport is narrow (Tailwind `hidden sm:block` on map, `block sm:hidden` on fallback).

### 6. ActionBar — `app/game/[roomId]/components/action-bar.tsx`

```typescript
interface ActionBarProps {
  isViewerTurn: boolean;
  isSubmitting: boolean;
  actionsRemaining: number;
  captureAttemptFlag: boolean;
  error: string | null;
  onSkip: () => void;
  onCaptureAttempt: () => void;
}
```

**Internal state:**
- `showConfirm: boolean` — controls the capture confirmation prompt.

**Behavior:**
- Buttons disabled when `!isViewerTurn || isSubmitting || actionsRemaining === 0`.
- "Capture Attempt" additionally disabled when `captureAttemptFlag === true`.
- Confirmation: inline prompt within the bar ("Are you sure? This ends your turn if wrong.") with Confirm/Cancel. On Cancel: hide prompt, return focus to Capture button. On Confirm: call `onCaptureAttempt`.
- Error region: `<div role="alert" aria-live="assertive">{error}</div>` renders only when `error` is non-null.

### 7. Card Play Wiring — Game Page Integration

The game page component orchestrates the connection:

```typescript
// In app/game/[roomId]/page.tsx (simplified)
const { state, refetch } = useGamePoll(roomId);
const { submit, isSubmitting, error } = useSubmitAction(roomId, refetch);

const handleCardSelect = (card: ActionCardPollData, targetPlayerId?: string) => {
  const payload: UseCardPayload = {
    actionType: "USE_CARD",
    cardId: card.id,
    ...(card.targetRequirement !== "none" && targetPlayerId
      ? { targetPlayerId }
      : {}),
  };
  submit(payload);
};

<CardHand
  cards={state.privateData.actionCards}
  isSubmitting={isSubmitting}
  isViewerTurn={state.viewerPlayerId === state.currentPlayerId}
  onCardSelect={handleCardSelect}
/>
```

### 8. Lobby-to-Game Navigation — `app/lobby/[code]/page.tsx`

**Changes to `LobbyState`:**

```typescript
// lib/lobby/types.ts — add field
export interface LobbyState {
  roomCode: string;
  roomId: string; // NEW — database room identifier
  status: RoomStatus;
  visibility: RoomVisibility;
  players: LobbyPlayer[];
  hostId: string;
}
```

**Navigation logic in lobby page:**

```typescript
const router = useRouter();
const { state } = useLobbyPoll();
const [isNavigating, setIsNavigating] = useState(false);

useEffect(() => {
  if (
    state?.status === "in-progress" &&
    state.roomId &&
    state.roomId.length > 0 &&
    !isNavigating
  ) {
    setIsNavigating(true);
    router.push(`/game/${state.roomId}`);
  }
}, [state, router, isNavigating]);
```

While `isNavigating`, the page shows a loading spinner and disables all interactive elements.

## Data Flow

### Action Submission Flow

```
Player clicks city / button / card
  → submit(payload)
    → [in-flight guard check]
    → isSubmitting = true, error = null
    → POST /api/game/{roomId}/action  { payload }
    → Server validates, resolves turn
    → 200 { success: true, ... }
       → refetch() → immediate poll → state updates → UI re-renders
    → 4xx { success: false, code, error }
       → error = errorMessageFor(code)
       → if CONCURRENCY_CONFLICT → also refetch()
    → Network error
       → error = errorMessageFor("UNKNOWN")
    → isSubmitting = false
```

### Lobby Transition Flow

```
Lobby page polling every 3s
  → GET /api/rooms/poll
  → response: { status: "in-progress", roomId: "abc-123", ... }
  → useEffect detects in-progress + valid roomId
  → router.push("/game/abc-123")
  → Game page renders, useGamePoll starts
```

## Error Handling

| Scenario | User sees | System action |
|---|---|---|
| Action rejected (16 codes) | Mapped human-readable sentence in ActionBar error region | No state change |
| Concurrency conflict | "Another action was processed..." message | Refetch to sync state |
| Network failure | "Something went wrong..." | No state change, player can retry |
| In-flight double-click | Nothing (silently dropped) | Guard prevents second request |
| Lobby roomId missing | No navigation (stays on lobby) | Continues polling |

## Accessibility

- ActionBar error region uses `role="alert"` + `aria-live="assertive"` for screen reader announcement.
- All action buttons use `aria-disabled="true"` (not `disabled` attribute) when inactive to remain in tab order.
- CityMarkers highlighted targets are focusable (`tabIndex={0}`) with `role="button"` and descriptive `aria-label`.
- Compact-viewport fallback provides accessible button list for move selection.
- Confirmation dialog manages focus: on open, focus moves to Confirm; on Cancel, focus returns to Capture button.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Submit sends correct POST for any valid ActionPayload

*For any* valid `ActionPayload` (across all four discriminated union variants — MOVE, SKIP, CAPTURE_ATTEMPT, USE_CARD with varying `targetLocationId`, `cardId`, and `targetPlayerId` values), calling `submit(payload)` SHALL result in a POST request to `/api/game/${roomId}/action` with the payload serialized as the JSON body.

**Validates: Requirements 1.2**

### Property 2: In-flight guard prevents concurrent submissions

*For any* number N > 1 of `submit()` calls made while a prior submission is still in-flight, exactly one HTTP request SHALL be sent; all subsequent calls return without sending.

**Validates: Requirements 1.3**

### Property 3: Error codes map to distinct human-readable messages

*For any* two distinct values `a` and `b` from the set of 16 `TurnActionErrorCode` values plus `"UNKNOWN"`, `errorMessageFor(a) !== errorMessageFor(b)`.

**Validates: Requirements 2.2**

### Property 4: Non-2xx error code produces mapped error message

*For any* `TurnActionErrorCode` returned in a non-2xx response, the hook's `error` value SHALL equal `errorMessageFor(code)` after the submission completes.

**Validates: Requirements 1.5**

### Property 5: New submission clears previous error

*For any* prior `error` value (non-null) held by the hook, when a new `submit()` call begins, `error` SHALL transition to `null` before the request is sent.

**Validates: Requirements 1.8**

### Property 6: isSubmitting lifecycle for any outcome

*For any* `ActionPayload` and any response outcome (2xx success, non-2xx error, network failure), `isSubmitting` SHALL be `true` during the request and `false` after the response or error is processed.

**Validates: Requirements 1.9**

### Property 7: Legal-move highlighting matches computed legal set

*For any* viewer location, adjacency graph, set of blocked transports, and hub-location set, the CityMarkers component SHALL highlight exactly the locations returned by `computeLegalMoves(...)` — no more, no fewer.

**Validates: Requirements 3.3, 3.4**

### Property 8: Blockade exclusion from legal moves

*For any* adjacency edge where `edge.transport` is contained in the active `blockedTransports` set, `computeLegalMoves` SHALL exclude `edge.targetLocationId` from its result.

**Validates: Requirements 3.6**

### Property 9: Click on legal destination produces correct MOVE payload

*For any* location ID present in the computed legal-move set, activating (click or keyboard) its city marker SHALL invoke `submit` with `{ actionType: "MOVE", targetLocationId: <that ID> }`.

**Validates: Requirements 3.1**

### Property 10: Card select produces correct USE_CARD payload with conditional targetPlayerId

*For any* card where `targetRequirement === "none"`, the submit payload SHALL be `{ actionType: "USE_CARD", cardId }` with no `targetPlayerId`. *For any* card where `targetRequirement === "player"` and a `targetPlayerId` is provided, the submit payload SHALL include `{ actionType: "USE_CARD", cardId, targetPlayerId }`.

**Validates: Requirements 5.1, 5.5**

### Property 11: Lobby navigation on in-progress with valid roomId

*For any* non-empty `roomId` string, when `useLobbyPoll` returns a state with `status === "in-progress"` and that `roomId`, the lobby page SHALL perform a client-side navigation to `/game/${roomId}`.

**Validates: Requirements 6.3**

### Property 12: Refetch resets poll interval and triggers immediate poll

*For any* point in the polling cycle, calling `refetch()` SHALL clear the current interval, execute an immediate `poll()`, and restart the interval timer from zero — resulting in the next automatic poll occurring exactly `POLL_INTERVAL_MS` after the refetch call.

**Validates: Requirements 7.2**

### Property 13: Successful refetch updates state and clears error

*For any* prior `error` value and any successful poll response triggered by `refetch()`, the hook SHALL update `state` to the new response data and set `error` to `null`.

**Validates: Requirements 7.5**
