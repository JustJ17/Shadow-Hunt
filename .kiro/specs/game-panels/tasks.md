# Implementation Plan: game-panels

## Overview

Implement the non-map, non-submission portions of the active game screen: utility modules for event message formatting and card metadata, inline-SVG icon components, the PanelErrorBoundary, four data panels (TurnHud, NotebookPanel, EventFeedPanel, CardHand with CardTile and TargetPicker), the responsive GameScreenShell layout, and the page rewrite to compose everything. Zero new dependencies; all styling via Tailwind CSS v4 on a dark theme; full ARIA accessibility.

## Tasks

- [x] 1. Utility modules
  - [x] 1.1 Create `lib/game-ui/event-messages.ts` — event message formatter and relative timestamp
    - Export `formatEventMessage(event, nameLookup, playerLookup): string` with template map for all 13 `GameEventType` values
    - Export `formatRelativeTimestamp(createdAt, now?): string` returning `"Xs"` / `"Xm"` / `"Xh"`
    - Unknown types return `"Unrecognised event"`; missing payload fields resolve to `"someone"` / `"an unknown location"`
    - _Requirements: 8.4, 8.5, 8.6, 8.8_

  - [x] 1.2 Write unit tests for `event-messages.ts`
    - Test all 13 event type messages resolve player/location names
    - Test unknown event type returns fallback
    - Test missing payload fields produce `"someone"` / `"an unknown location"`
    - Test relative timestamp boundaries: <60s, <60min, ≥60min
    - **Property 11: Relative timestamp formatting**
    - **Property 12: Event message name resolution**
    - **Property 13: Unknown event type fallback**
    - **Property 14: Missing event payload fallback**
    - **Validates: Requirements 8.4, 8.5, 8.6, 8.8**

  - [x] 1.3 Create `lib/game-ui/card-metadata.ts` — card display metadata lookup
    - Export `getCardMeta(identifier: string): CardMeta` for the 10 known `CardIdentifier` values
    - Each entry: `displayName` (≤40 chars), `description` (≤120 chars), `category`
    - Unknown identifiers: `{ displayName: identifier, description: "Unrecognised card", category: "booster" }`
    - _Requirements: 10.2, 10.5_

  - [x] 1.4 Write unit tests for `card-metadata.ts`
    - Test all 10 known identifiers return valid metadata with correct category
    - Test `displayName` length ≤40 and `description` length ≤120
    - Test unknown identifier returns raw identifier as displayName
    - **Property 8: Card icon and metadata totality**
    - **Property 15: Card metadata bounds**
    - **Property 16: Unknown card identifier fallback**
    - **Validates: Requirements 10.2, 10.5, 14.1**

- [x] 2. Icon components
  - [x] 2.1 Create `app/game/[roomId]/components/event-icon.tsx` — EventIcon component
    - Pure component rendering 13 distinct inline-SVG glyphs keyed by `GameEventType` plus a neutral circle fallback
    - Fixed 16×16 px, `aria-hidden="true"`, memoised with `React.memo`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 2.2 Create `app/game/[roomId]/components/card-icon.tsx` — CardIcon component
    - Pure component rendering 10 distinct inline-SVG glyphs keyed by `CardIdentifier` plus a neutral fallback
    - Fixed 24×24 px, `aria-hidden="true"`, memoised with `React.memo`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 2.3 Write unit tests for EventIcon and CardIcon
    - Test all 13 event types render a glyph distinct from fallback
    - Test all 10 card identifiers render a glyph distinct from fallback
    - Test unknown type/identifier renders fallback glyph
    - Test `aria-hidden="true"` is present
    - **Property 7: Event icon totality**
    - **Property 8: Card icon and metadata totality**
    - **Validates: Requirements 13.1, 13.2, 14.1, 14.2**

- [~] 3. Checkpoint — Utilities and icons
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. PanelErrorBoundary and TurnHud
  - [x] 4.1 Create `app/game/[roomId]/components/panel-error-boundary.tsx`
    - Class component with `componentDidCatch`
    - Props: `panelName: string`, `children: React.ReactNode`
    - Fallback UI: `"{panelName} failed to render"` in a muted container
    - _Requirements: 1.10, 16.1, 16.2_

  - [x] 4.2 Create `app/game/[roomId]/components/turn-hud.tsx` — TurnHud component
    - Props: `state: GamePollState`, `nameLookup: NameLookupFn`
    - Render round badge, turn identity ("Your turn" / "Waiting for {name}"), action budget (`"{N} of {M} actions"`), "Turn ending" indicator
    - Turn order list: one entry per player ordered by `turnPosition`, showing displayName, position, resolved location; `aria-current="true"` on current player; "(you)" label on viewer
    - Status indicators: `skipNextTurn`, `actionPenaltyFlag`, `pendingExtraTurns` — conditionally rendered
    - Blockade indicators: one per `activeBlockades` entry where `casterPlayerId !== viewerPlayerId`, showing transport type + caster name; self-cast blockades shown separately
    - Distinct visual treatment per transport type using icon shape + text (not colour alone)
    - Falls back to raw `locationId` when `nameLookup` returns raw id
    - _Requirements: 2.1–2.6, 3.1–3.5, 4.1–4.4, 5.1–5.4, 15.4_

  - [x] 4.3 Write unit tests for TurnHud
    - Test round number displayed
    - Test "Your turn" vs "Waiting for {name}" based on `currentPlayerId`
    - Test action budget text
    - Test "Turn ending" when `actionsRemaining === 0` and viewer's turn
    - Test turn order list renders all players in order with `aria-current`
    - Test blockade indicators filter out self-cast blockades
    - Test status indicators shown/hidden correctly
    - **Property 2: Name resolution fallback**
    - **Property 21: Blockade indicator count**
    - **Validates: Requirements 2.1–2.6, 3.1–3.5, 4.1–4.4, 5.1–5.4**

- [x] 5. NotebookPanel
  - [x] 5.1 Create `app/game/[roomId]/components/notebook-panel.tsx`
    - Props: `privateData: PlayerPrivateData | undefined`, `nameLookup: NameLookupFn`, `playerLookup: PlayerLookupFn`
    - Render notebook entries ordered ascending by `roundNumber` (stable sort preserving array order for ties)
    - Discriminated rendering for 4 entry types: `spy-proximity`, `mastermind_distance`, `mastermind_direction`, `phone_bug`
    - Unknown `entryType` renders "Unrecognised clue" with round number
    - Distinct visual badge per entry type
    - Pending clues: muted/dashed style, "resolves at end of round {N}"
    - Filter control: buttons per present `entryType` + "All", with `aria-pressed`
    - Empty state: "No clues yet" when notebook and pendingClues both empty
    - Graceful degradation: renders empty state if `privateData` is undefined
    - _Requirements: 6.1–6.10, 7.1–7.8, 15.5, 16.3, 16.4_

  - [x] 5.2 Write unit tests for NotebookPanel
    - Test row count matches notebook array length
    - Test ordering by roundNumber with tie-breaking
    - Test all 4 entry type renderings with resolved names
    - Test unknown entry type fallback
    - Test filter buttons appear for present types only
    - Test filter selection shows only matching entries + all pending clues
    - Test empty state rendered when both arrays empty
    - Test graceful handling of undefined privateData
    - **Property 3: Notebook row count**
    - **Property 4: Notebook ordering**
    - **Property 17: Unknown notebook entry type fallback**
    - **Property 18: Notebook filter correctness**
    - **Property 19: Notebook filter options match present types**
    - **Property 20: Notebook data isolation**
    - **Validates: Requirements 6.1–6.10, 7.1–7.8**

- [x] 6. EventFeedPanel
  - [x] 6.1 Create `app/game/[roomId]/components/event-feed-panel.tsx`
    - Props: `events: GameEventData[] | undefined`, `nameLookup: NameLookupFn`, `playerLookup: PlayerLookupFn`
    - Render event rows in descending `sequenceNumber` order with EventIcon + formatted sentence + relative timestamp
    - Round marker headings (`role="heading" aria-level="3"`) above first event of each round
    - Auto-scroll: scroll to newest when within 40px; show "N unseen events" pill when further away
    - ARIA live region (`aria-live="polite"`) wrapping new events
    - Unknown event type: neutral glyph + "Unrecognised event"
    - Empty state: "No events yet"
    - Graceful degradation: renders empty state if `events` is undefined
    - _Requirements: 8.1–8.8, 9.1–9.5, 15.6, 16.3, 16.5_

  - [x] 6.2 Write unit tests for EventFeedPanel
    - Test row count equals events array length
    - Test descending sequenceNumber order
    - Test round markers appear for each distinct roundNumber
    - Test event sentences render resolved names
    - Test unknown event type renders fallback
    - Test empty state rendered when events is empty or undefined
    - Test `aria-live="polite"` region present
    - **Property 5: Event feed row count**
    - **Property 6: Event feed ordering**
    - **Property 23: Round marker count**
    - **Validates: Requirements 8.1–8.8, 9.1–9.5**

- [~] 7. Checkpoint — Panels sans CardHand
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. CardHand, CardTile, and TargetPicker
  - [x] 8.1 Create `app/game/[roomId]/components/card-tile.tsx`
    - Props: `card: ActionCardPollData`, `disabled: boolean`, `onActivate: (card) => void`
    - Render `<button>` with CardIcon, displayName, description from `getCardMeta`, category colour border/accent
    - Category colours: sabotage → `border-red-500 text-red-400`, clue → `border-blue-500 text-blue-400`, booster → `border-green-500 text-green-400`
    - `aria-disabled="true"` when disabled (keep focusable); accessible name = displayName + category
    - _Requirements: 10.2, 10.3, 10.4, 10.5, 11.5_

  - [x] 8.2 Create `app/game/[roomId]/components/target-picker.tsx`
    - Props: `players`, `viewerPlayerId`, `onSelect`, `onCancel`, `returnFocusRef`
    - Render `role="listbox"` with one `role="option"` per non-viewer player
    - Focus trapped: Tab/Shift+Tab confined; first option focused on mount; cancel returns focus to `returnFocusRef`
    - _Requirements: 12.1–12.8, 15.8_

  - [x] 8.3 Create `app/game/[roomId]/components/card-hand.tsx`
    - Props: `actionCards`, `isViewerTurn`, `actionsRemaining`, `isSubmitting`, `onCardSelect`, `players`, `viewerPlayerId`, `pendingReward`, `nameLookup`
    - Render one CardTile per `actionCards` entry; disabled when `!isViewerTurn || actionsRemaining === 0 || isSubmitting`
    - `targetRequirement: "none"` → invoke `onCardSelect` immediately
    - `targetRequirement: "player"` → show TargetPicker, invoke `onCardSelect` on selection
    - Pending reward notice: "{rewardTier} card(s) incoming" with region name
    - Empty state: "No cards in hand"
    - Visually hidden status message explaining disabled reason for screen readers
    - _Requirements: 10.1, 10.6, 10.7, 11.1–11.7, 15.7_

  - [x] 8.4 Write unit tests for CardTile, TargetPicker, and CardHand
    - Test CardTile renders display name, description, icon, category colour
    - Test disabled CardTile has `aria-disabled="true"`
    - Test TargetPicker excludes viewer from options
    - Test TargetPicker cancel returns focus
    - Test CardHand renders correct tile count
    - Test enabled/disabled logic for all conditions
    - Test no-target card immediate callback
    - Test player-target card shows TargetPicker
    - Test empty state and pending reward notice
    - **Property 9: Card disabled state correctness**
    - **Property 10: Target picker exclusion**
    - **Property 22: Card hand tile count**
    - **Property 24: No-target card immediate callback**
    - **Property 25: Target selection callback**
    - **Validates: Requirements 10.1–10.7, 11.1–11.7, 12.1–12.8**

- [~] 9. Checkpoint — All panels complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. GameScreenShell and page rewrite
  - [x] 10.1 Create `app/game/[roomId]/components/game-screen-shell.tsx`
    - Props: `state`, `mapData`, `isSubmitting`, `onCardSelect`, `mapSlot`
    - Build `nameLookup` and `playerLookup` from `mapData` and `state.players`
    - Desktop layout (≥1024px): CSS Grid with map left + right sidebar (TurnHud, NotebookPanel, EventFeedPanel) + bottom CardHand
    - Compact layout (<1024px): map top (~40vh), tab bar, single active panel
    - Tab bar: WAI-ARIA Tabs pattern — `role="tablist"`, `role="tab"` with `aria-selected`, `role="tabpanel"` with `aria-controls`/`aria-labelledby`, arrow-key navigation
    - Default tab: "hud"; scroll position preserved per panel via `useRef`
    - Each panel wrapped in `PanelErrorBoundary`
    - ARIA landmarks: `<main>` for map, `<section aria-label="...">` per panel
    - Root element: `bg-gray-900 text-white`
    - Focus indicators: `focus-visible:ring-2 focus-visible:ring-blue-400` on all interactive elements
    - _Requirements: 1.1–1.10, 15.1–15.3, 15.9, 16.1–16.5_

  - [x] 10.2 Rewrite `app/game/[roomId]/page.tsx` to compose GameScreenShell
    - Replace the "active game view" placeholder with `<GameScreenShell>` passing `state`, `mapData: null` (until game-map ships), `isSubmitting: false` (until game-wiring ships), a no-op `onCardSelect`, and a placeholder map slot
    - Keep existing loading, error, and finished states intact
    - _Requirements: 1.1, 1.7_

  - [-] 10.3 Write unit tests for GameScreenShell
    - Test desktop layout renders all panels simultaneously
    - Test compact layout renders tab bar with 4 tabs
    - Test tab switching shows correct panel
    - Test default tab is "hud"
    - Test error boundary catches panel crash and shows fallback
    - Test ARIA landmarks present
    - Test `nameLookup` returns raw id when `mapData` is null
    - **Property 1: Error boundary isolation**
    - **Property 2: Name resolution fallback**
    - **Validates: Requirements 1.1–1.10, 15.1, 15.9, 16.1–16.5**

- [~] 11. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.
  - Verify ARCHITECTURE.md updated with `lib/game-ui/` module and `game-screen-shell` component entries.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `useMapData` hook is provided externally (by `game-map` spec); until it ships, `mapData: null` is passed and `nameLookup` returns raw ids
- The `onCardSelect` callback is consumed externally (by `game-wiring` spec); until it ships, a no-op is passed
- Zero new dependencies — all icons are inline SVG, styling is Tailwind v4, testing uses existing vitest + Testing Library

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "2.1", "2.2", "4.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "2.3", "4.2"] },
    { "id": 2, "tasks": ["4.3", "5.1", "6.1", "8.1", "8.2"] },
    { "id": 3, "tasks": ["5.2", "6.2", "8.3"] },
    { "id": 4, "tasks": ["8.4", "10.1"] },
    { "id": 5, "tasks": ["10.2", "10.3"] }
  ]
}
```
