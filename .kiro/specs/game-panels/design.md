# Design Document — game-panels

## Overview

This design describes the architecture for the non-map, non-submission portion of the active game screen: a responsive layout shell, four data panels (Turn HUD, Notebook, Event Feed, Card Hand), two icon components, and two utility modules for event message formatting and card metadata. All components are client-side React; they read from the existing `useGamePoll` hook and resolve names via a `useMapData` hook (provided externally). Panels never issue HTTP requests — action submission belongs to `game-wiring`.

**Boundaries:**
- Owns: layout shell, panels, icon components, event-message formatter, card-metadata utility.
- Does not own: map rendering (`game-map`), action submission HTTP lifecycle (`game-wiring`), `useGamePoll` hook, `useMapData` hook, Prisma schema.

---

## Architecture

### Component Tree

```
GameScreenShell (app/game/[roomId]/components/game-screen-shell.tsx)
├── <Map /> (placeholder slot — game-map spec)
├── PanelErrorBoundary × 4
│   ├── TurnHud (app/game/[roomId]/components/turn-hud.tsx)
│   ├── NotebookPanel (app/game/[roomId]/components/notebook-panel.tsx)
│   ├── EventFeedPanel (app/game/[roomId]/components/event-feed-panel.tsx)
│   └── CardHand (app/game/[roomId]/components/card-hand.tsx)
│       ├── CardTile (app/game/[roomId]/components/card-tile.tsx)
│       └── TargetPicker (app/game/[roomId]/components/target-picker.tsx)
└── Tab bar (rendered only in Compact_Layout)
```

### Utility Modules

| Module | Path | Responsibility |
|--------|------|---------------|
| Event message formatter | `lib/game-ui/event-messages.ts` | Maps `GameEventType` + payload → human-readable sentence. Pure function, no side effects. |
| Card metadata | `lib/game-ui/card-metadata.ts` | Maps `CardIdentifier` → `{ displayName, description, category }`. Static lookup, no IO. |

### Icon Components

| Component | Path | Size | Key count |
|-----------|------|------|-----------|
| EventIcon | `app/game/[roomId]/components/event-icon.tsx` | 16×16 px | 13 types + fallback |
| CardIcon | `app/game/[roomId]/components/card-icon.tsx` | 24×24 px | 10 identifiers + fallback |

---

## Component Interfaces

### GameScreenShell

```typescript
// app/game/[roomId]/components/game-screen-shell.tsx
"use client";

import type { GamePollState } from "@/lib/turn-engine/types";
import type { MapData } from "@/lib/map/types";

interface GameScreenShellProps {
  state: GamePollState;
  mapData: MapData | null;
  isSubmitting: boolean;
  onCardSelect: (selection: CardSelection) => void;
  /** Slot for the map component rendered by game-map spec */
  mapSlot: React.ReactNode;
}

export interface CardSelection {
  cardId: string;
  cardIdentifier: string;
  targetRequirement: "none" | "player";
  targetPlayerId?: string;
}
```

The shell determines layout mode via `useMediaQuery("(min-width: 1024px)")` or a Tailwind-breakpoint approach using CSS classes with responsive visibility (`hidden lg:block` / `lg:hidden`). In Compact_Layout, it maintains a `selectedTab` state initialized to `"hud"`.

### TurnHud

```typescript
// app/game/[roomId]/components/turn-hud.tsx

interface TurnHudProps {
  state: GamePollState;
  nameLookup: NameLookupFn;
}
```

Renders:
- Round badge: `"Round {currentRound}"`
- Turn identity: `"Your turn"` (emphasized) or `"Waiting for {displayName}"`
- Action budget: `"{actionsRemaining} of {actionBudget} actions"`
- Turn ending indicator when `actionsRemaining === 0 && viewerTurn`
- Turn order list: one entry per player, ordered ascending `turnPosition`
- Status indicators: `skipNextTurn`, `actionPenaltyFlag`, `pendingExtraTurns`
- Blockade indicators: per `activeBlockades` entry where `casterPlayerId !== viewerPlayerId`

### NotebookPanel

```typescript
// app/game/[roomId]/components/notebook-panel.tsx

interface NotebookPanelProps {
  privateData: PlayerPrivateData | undefined;
  nameLookup: NameLookupFn;
  playerLookup: PlayerLookupFn;
}
```

Renders:
- Notebook entries ordered ascending `roundNumber` (stable sort on original index for ties)
- Pending clues with muted styling
- Filter buttons offering present entry types + "All" (with `aria-pressed`)
- Empty state: `"No clues yet"`

### EventFeedPanel

```typescript
// app/game/[roomId]/components/event-feed-panel.tsx

interface EventFeedPanelProps {
  events: GameEventData[] | undefined;
  nameLookup: NameLookupFn;
  playerLookup: PlayerLookupFn;
}
```

Renders:
- Event rows in descending `sequenceNumber` order
- Round marker headings (`role="heading"`) above the first event of each round
- Relative timestamps
- ARIA live region for new events
- Auto-scroll logic (within 40px → scroll to newest; otherwise show "N unseen events" pill)
- Empty state: `"No events yet"`

### CardHand

```typescript
// app/game/[roomId]/components/card-hand.tsx

interface CardHandProps {
  actionCards: ActionCardPollData[] | undefined;
  isViewerTurn: boolean;
  actionsRemaining: number;
  isSubmitting: boolean;
  onCardSelect: (selection: CardSelection) => void;
  players: PlayerPollData[];
  viewerPlayerId: string;
  pendingReward: PendingRewardData | null;
  nameLookup: NameLookupFn;
}
```

Manages enabled/disabled state logic and the `TargetPicker` visibility state. When a card with `targetRequirement: "none"` is activated, invokes `onCardSelect` immediately. When `targetRequirement: "player"`, shows `TargetPicker` and waits for a selection.

### CardTile

```typescript
// app/game/[roomId]/components/card-tile.tsx

interface CardTileProps {
  card: ActionCardPollData;
  disabled: boolean;
  onActivate: (card: ActionCardPollData) => void;
}
```

Renders a `<button>` with:
- CardIcon glyph
- Display name and description from `card-metadata.ts`
- Category colour treatment (border/accent): sabotage = red-ish, clue = blue-ish, booster = green-ish
- `aria-disabled="true"` when disabled (uses `aria-disabled` rather than HTML `disabled` to keep the button focusable for screen reader discovery)

### TargetPicker

```typescript
// app/game/[roomId]/components/target-picker.tsx

interface TargetPickerProps {
  players: PlayerPollData[];
  viewerPlayerId: string;
  onSelect: (targetPlayerId: string) => void;
  onCancel: () => void;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
}
```

Renders a `role="listbox"` overlay with one `role="option"` per non-viewer player. Focus is moved to the first option on mount. Tab/Shift+Tab are trapped inside the picker. Cancel returns focus to `returnFocusRef`.

### PanelErrorBoundary

```typescript
// app/game/[roomId]/components/panel-error-boundary.tsx

interface PanelErrorBoundaryProps {
  panelName: string;
  children: React.ReactNode;
}
```

Class component using `componentDidCatch`. Fallback UI: `"{panelName} failed to render"` in a muted styled container.

---

## Utility Module Interfaces

### NameLookupFn / PlayerLookupFn

```typescript
// Derived from MapData + GamePollState.players — passed as props, not fetched by panels.

type NameLookupFn = (id: string, kind: "location" | "region") => string;
// Returns resolved name or the raw id string when MapData is unavailable.

type PlayerLookupFn = (playerId: string) => string;
// Returns displayName or "someone" when player not found.
```

These are constructed in `GameScreenShell` from `MapData` and `state.players`, then threaded to child panels as props.

### Event Message Formatter

```typescript
// lib/game-ui/event-messages.ts

import type { GameEventData } from "@/lib/turn-engine/types";

type NameLookupFn = (id: string, kind: "location" | "region") => string;
type PlayerLookupFn = (playerId: string) => string;

export function formatEventMessage(
  event: GameEventData,
  nameLookup: NameLookupFn,
  playerLookup: PlayerLookupFn,
): string;

export function formatRelativeTimestamp(createdAt: string, now?: Date): string;
// Returns: "Xs" | "Xm" | "Xh"
```

`formatEventMessage` handles all 13 event types via a type-keyed template map. Unknown types return `"Unrecognised event"`. Missing payload fields resolve via the lookup functions which return fallback strings.

`formatRelativeTimestamp` computes the delta between `createdAt` (ISO string) and `now`. Returns `"Ns"` for <60s, `"Nm"` for <60min, `"Nh"` for ≥60min.

### Card Metadata

```typescript
// lib/game-ui/card-metadata.ts

import type { CardIdentifier, CardCategory } from "@/lib/turn-engine/cards/types";

export interface CardMeta {
  displayName: string;   // max 40 characters
  description: string;   // max 120 characters
  category: CardCategory;
}

export function getCardMeta(identifier: string): CardMeta;
// Returns metadata for the 10 known identifiers.
// For unknown identifiers: { displayName: identifier, description: "Unrecognised card", category: "booster" }
```

---

## Data Flow

```
useGamePoll(roomId) ──→ GamePollState
                             │
useMapData(roomId)  ──→ MapData | null
                             │
         ┌───────────────────┴────────────────────┐
         │         GameScreenShell                 │
         │  builds nameLookup, playerLookup        │
         │  manages selectedTab (compact)          │
         │  passes onCardSelect up to parent       │
         └──┬──────┬──────────┬───────────┬───────┘
            │      │          │           │
       TurnHud  Notebook  EventFeed   CardHand
                                          │
                                     TargetPicker
```

**Key data rules:**
1. Panels never call `fetch`. All data comes via props from `GameScreenShell`.
2. `NotebookPanel` reads exclusively from `privateData.notebook` and `privateData.pendingClues`.
3. `EventFeedPanel` reads exclusively from `events`.
4. `CardHand` reads from `privateData.actionCards` and `privateData.pendingReward`.
5. `onCardSelect` (the `Selection_Callback`) is the only output from panels — it flows up to the parent page component, which delegates to `game-wiring`.

---

## Responsive Layout Strategy

### Desktop (≥1024px)

```
┌────────────────────────────────────────────────────────┐
│                    Game Screen Shell                    │
├───────────────────────────────┬────────────────────────┤
│                               │  TurnHud (top-right)   │
│                               ├────────────────────────┤
│          Map Slot             │  NotebookPanel (mid-R)  │
│                               ├────────────────────────┤
│                               │  EventFeedPanel (bot-R) │
├───────────────────────────────┴────────────────────────┤
│                   CardHand (bottom full-width)          │
└────────────────────────────────────────────────────────┘
```

Implemented with CSS Grid:
- `grid-template-columns: 1fr 360px`
- `grid-template-rows: auto 1fr auto`
- Right column is a flex column with three panels stacked.
- Bottom row spans full width for CardHand.

### Compact (<1024px)

```
┌──────────────────────┐
│       Map Slot       │  (top ~40vh)
├──────────────────────┤
│   [HUD][NB][FD][CD]  │  ← tab bar
├──────────────────────┤
│   Active panel        │  (bottom ~60vh, scrollable)
└──────────────────────┘
```

Implemented with:
- `role="tablist"` on tab bar, `role="tab"` on each tab button, `role="tabpanel"` on panel container.
- `aria-selected="true"` on active tab; `aria-controls` links tab to panel.
- Arrow-key navigation between tabs (left/right).
- Scroll position per panel stored in a `useRef<Record<TabId, number>>`.

---

## Error Handling

| Failure Mode | Behaviour |
|---|---|
| Single panel render crash | `PanelErrorBoundary` catches, renders `"{panelName} failed to render"`. Other panels unaffected. |
| `MapData` unavailable | `nameLookup` returns raw id string. No component throws. |
| `privateData` absent/malformed | Notebook and CardHand render empty states. No throw. |
| `events` absent/malformed | EventFeed renders "No events yet". No throw. |
| Unknown `entryType` in notebook | Row renders "Unrecognised clue" with round number. |
| Unknown event `type` | Row renders neutral glyph + "Unrecognised event". |
| Unknown `cardIdentifier` | Tile renders neutral glyph + raw identifier + "Unrecognised card". |
| Missing payload fields in event | Sentence substitutes "someone" / "an unknown location". |

---

## Accessibility Design

| Concern | Implementation |
|---|---|
| Landmark regions | Each panel wrapped in `<section aria-label="...">`. Map gets `<main>`. |
| Tab pattern (compact) | WAI-ARIA Tabs: `role="tablist"`, `role="tab"` (with `aria-selected`), `role="tabpanel"` (with `aria-labelledby`). Arrow-key moves between tabs. |
| Focus management | Target_Picker traps focus on open, returns to originating tile on close. |
| Live region | Event feed wraps new-event area in `aria-live="polite"`. |
| Colour independence | Category colours paired with text labels. Blockade types distinguished by icon shape + text, not colour alone. Turn ownership conveyed by text ("Your turn" vs "Waiting for…"). |
| Focus indicators | All interactive elements use `focus-visible:ring-2 focus-visible:ring-blue-400`. |
| Contrast | Body text: white on gray-900 (≈15:1). Category accents chosen to exceed 3:1 on gray-800 tile background. |
| Card disabled state | `aria-disabled="true"` (not HTML `disabled`) so screen readers can still discover and read the button. Visually reduced opacity. |
| Notebook filter | `aria-pressed="true"` on active filter button. |
| Round headings | `role="heading" aria-level="3"` on round markers in event feed. |

---

## Styling Approach

All styling uses Tailwind CSS v4 utility classes. No custom CSS files beyond `globals.css`. The dark theme (`bg-gray-900`, `text-white`) is applied at the shell level. Panel-level surfaces use `bg-gray-800` with `rounded-lg`.

Category colour tokens:
- Sabotage: `border-red-500`, `text-red-400`
- Clue: `border-blue-500`, `text-blue-400`
- Booster: `border-green-500`, `text-green-400`

Blockade transport icons use shape variation (car = road lines, plane = wing, boat = wave) so that colour is not the sole differentiator.

---

## File Manifest

| File | Type | Exports |
|------|------|---------|
| `app/game/[roomId]/components/game-screen-shell.tsx` | Component | `GameScreenShell` |
| `app/game/[roomId]/components/turn-hud.tsx` | Component | `TurnHud` |
| `app/game/[roomId]/components/notebook-panel.tsx` | Component | `NotebookPanel` |
| `app/game/[roomId]/components/event-feed-panel.tsx` | Component | `EventFeedPanel` |
| `app/game/[roomId]/components/card-hand.tsx` | Component | `CardHand` |
| `app/game/[roomId]/components/card-tile.tsx` | Component | `CardTile` |
| `app/game/[roomId]/components/target-picker.tsx` | Component | `TargetPicker` |
| `app/game/[roomId]/components/event-icon.tsx` | Component | `EventIcon` |
| `app/game/[roomId]/components/card-icon.tsx` | Component | `CardIcon` |
| `app/game/[roomId]/components/panel-error-boundary.tsx` | Component | `PanelErrorBoundary` |
| `lib/game-ui/event-messages.ts` | Utility | `formatEventMessage`, `formatRelativeTimestamp` |
| `lib/game-ui/card-metadata.ts` | Utility | `getCardMeta`, `CardMeta` |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Error boundary isolation

*For any* single panel component that throws during render, all other panels and the map slot remain rendered, and the faulting panel's region displays a fallback message containing that panel's name and "failed to render".

**Validates: Requirements 1.10, 16.1, 16.2**

### Property 2: Name resolution fallback

*For any* Location id or Region id that is absent from MapData (or when MapData is null), `nameLookup` returns a non-empty string equal to the raw id, and no consuming panel throws.

**Validates: Requirements 3.5, 16.3**

### Property 3: Notebook row count

*For any* `privateData.notebook` array of length N, the Notebook_Panel renders exactly N Notebook_Entry rows.

**Validates: Requirements 6.1**

### Property 4: Notebook ordering

*For any* notebook array, the rendered Notebook_Entry rows appear in ascending `roundNumber` order, with ties preserving the original array index order.

**Validates: Requirements 6.2**

### Property 5: Event feed row count

*For any* `events` array of length N, the Event_Feed_Panel renders exactly N event rows.

**Validates: Requirements 8.1**

### Property 6: Event feed ordering

*For any* events array, the rendered rows appear in strictly descending `sequenceNumber` order.

**Validates: Requirements 8.2**

### Property 7: Event icon totality

*For any* of the 13 `GameEventType` values, `EventIcon` renders an inline SVG glyph that is distinct from the neutral fallback glyph.

**Validates: Requirements 8.3, 13.1**

### Property 8: Card icon and metadata totality

*For any* of the 10 `CardIdentifier` values, `CardIcon` renders an inline SVG glyph distinct from the neutral fallback, and `getCardMeta` returns a `displayName` that is not equal to the raw identifier string.

**Validates: Requirements 10.2, 10.3, 14.1**

### Property 9: Card disabled state correctness

*For any* `GamePollState` and any `ActionCardPollData` entry, the Card_Tile is disabled if and only if `currentPlayerId !== viewerPlayerId` OR `actionsRemaining === 0` OR an action submission is in flight.

**Validates: Requirements 11.1, 11.2, 11.3, 11.4**

### Property 10: Target picker exclusion

*For any* `GamePollState` and any card with `targetRequirement: "player"`, the Target_Picker options are exactly the set of players whose `playerId` differs from `viewerPlayerId`.

**Validates: Requirements 12.1, 12.3**

### Property 11: Relative timestamp formatting

*For any* ISO timestamp string `createdAt` and reference time `now`, `formatRelativeTimestamp` returns a string in the form `"Xs"` when delta < 60s, `"Xm"` when delta < 60min, or `"Xh"` when delta ≥ 60min, where X is a non-negative integer.

**Validates: Requirements 8.8**

### Property 12: Event message name resolution

*For any* `GameEventData` whose payload contains player ids and location/region ids that exist in the lookup maps, `formatEventMessage` produces a sentence containing the corresponding display names and location names (not raw ids).

**Validates: Requirements 8.4**

### Property 13: Unknown event type fallback

*For any* event whose `type` string is not one of the 13 known `GameEventType` values, the Event_Feed_Panel renders a row with the neutral fallback glyph and the text "Unrecognised event".

**Validates: Requirements 8.5, 13.2**

### Property 14: Missing event payload fallback

*For any* event whose payload omits a field referenced by its sentence template, `formatEventMessage` substitutes "someone" for a missing player reference and "an unknown location" for a missing location reference.

**Validates: Requirements 8.6**

### Property 15: Card metadata bounds

*For any* of the 10 known `CardIdentifier` values, `getCardMeta` returns a `displayName` of at most 40 characters and a `description` of at most 120 characters.

**Validates: Requirements 10.2**

### Property 16: Unknown card identifier fallback

*For any* string that is not one of the 10 known `CardIdentifier` values, `getCardMeta` returns the raw string as `displayName` and "Unrecognised card" as `description`, and `CardIcon` renders the neutral fallback glyph.

**Validates: Requirements 10.5, 14.2**

### Property 17: Unknown notebook entry type fallback

*For any* notebook entry whose `entryType` is not one of the 4 known variants, the Notebook_Panel renders a row containing the round number and the text "Unrecognised clue".

**Validates: Requirements 6.9**

### Property 18: Notebook filter correctness

*For any* notebook array and any selected `entryType` filter, the Notebook_Panel renders only entries whose `entryType` matches the filter, plus all Pending_Clue rows.

**Validates: Requirements 7.5**

### Property 19: Notebook filter options match present types

*For any* notebook array, the filter control offers exactly the set of distinct `entryType` values present in the array, plus "All".

**Validates: Requirements 7.4**

### Property 20: Notebook data isolation

*For any* `GamePollState`, the Notebook_Panel renders zero clue values that originate from `state.events` or `state.players` and are absent from `state.privateData.notebook` or `state.privateData.pendingClues`.

**Validates: Requirements 7.8**

### Property 21: Blockade indicator count

*For any* `GamePollState`, the Turn_HUD renders exactly as many Blockade_Indicators as there are entries in `activeBlockades` whose `casterPlayerId` differs from `viewerPlayerId`.

**Validates: Requirements 5.1, 5.2**

### Property 22: Card hand tile count

*For any* `privateData.actionCards` array of length N, the Card_Hand renders exactly N Card_Tile elements.

**Validates: Requirements 10.1**

### Property 23: Round marker count

*For any* events array with K distinct `roundNumber` values, the Event_Feed_Panel renders exactly K round marker headings.

**Validates: Requirements 9.1**

### Property 24: No-target card immediate callback

*For any* enabled Card_Tile whose `targetRequirement` is `"none"`, activating it invokes the `Selection_Callback` exactly once with `{ cardId, cardIdentifier, targetRequirement: "none" }` and does not render the Target_Picker.

**Validates: Requirements 11.6**

### Property 25: Target selection callback

*For any* player option in the Target_Picker, activating it invokes the `Selection_Callback` exactly once with `{ cardId, cardIdentifier, targetRequirement: "player", targetPlayerId }` matching the chosen player's id.

**Validates: Requirements 12.4**
