# Requirements Document

## Introduction

The game-panels feature delivers the non-map, non-submission portions of the in-game screen: the responsive layout shell, the Turn HUD, the private Notebook panel, the public Event Feed panel, and the Action Card hand (with CardTile and TargetPicker subcomponents). Together these panels give the player full visibility into turn state, private clues, public history, and held cards — everything needed to make informed decisions before submitting an action.

This spec is scoped to **rendering and interaction within the panels**. Action submission (the HTTP POST and its lifecycle) belongs to the `game-wiring` spec. Map rendering (SVG world map, routes, city markers, tokens, zoom/pan) belongs to the `game-map` spec.

Five constraints shape every requirement below:

1. **Zero new dependencies.** All icons are inline SVG components. Styling uses Tailwind CSS v4. No icon library, no animation library, no virtualisation library. The `fast-check`, `vitest`, and Testing Library stack already installed covers all testing needs.
2. **`useGamePoll` is the sole game-state source.** Every panel reads from the `GamePollState` returned by the existing `useGamePoll` hook. Panels do not fetch game state independently.
3. **`useMapData` is the sole name-resolution source.** Location ids, region ids, and adjacency are resolved through a `useMapData` hook that wraps the cached `GET /api/map` response. Panels fall back to raw identifiers when map data is unavailable.
4. **Dark theme, accessible.** The screen uses a dark surface (`bg-gray-900` / `text-white`) consistent with the existing `EndScreen`. All panels meet WCAG 2.1 AA contrast requirements and are fully keyboard-navigable.
5. **Inline SVG icons.** Each of the 13 event types and 10 card identifiers renders a distinct inline SVG glyph authored in TypeScript/JSX. No `<image>` elements, no external icon resources.

Explicitly out of scope: map rendering and viewport controls (`game-map`), action submission HTTP lifecycle (`game-wiring`), the `EndScreen` component (already implemented), lobby navigation, and schema/seed changes.

## Glossary

### Systems

- **Game_Screen_Shell**: The top-level layout component at the game route that composes the map region and all four panels. Owns responsive breakpoint logic and panel composition; owns no game rules and no rendering internals of any panel.
- **Turn_HUD**: The panel displaying round number, current turn identity, action budget, turn order, viewer status indicators, and blockade indicators.
- **Notebook_Panel**: The panel rendering the viewer's private clue notebook entries, pending clues, entry-type filter, and empty state.
- **Event_Feed_Panel**: The panel rendering the public event log in reverse-chronological order with inline-SVG icons, human-readable sentences, relative timestamps, round markers, and scroll management.
- **Card_Hand**: The panel rendering the viewer's held action cards as interactive tiles with category colouring, disabled states, and a target-picker subcomponent.
- **Card_Tile**: The button component representing one action card, rendering its glyph, name, description, and category colour treatment.
- **Target_Picker**: The overlay component that collects a target player selection for cards with `targetRequirement: "player"`.
- **Event_Icon**: The pure component rendering one of 13 distinct inline SVG glyphs keyed by `GameEventType`, plus a neutral fallback.
- **Card_Icon**: The pure component rendering one of 10 distinct inline SVG glyphs keyed by `CardIdentifier`, plus a neutral fallback.

### Data Terminology

- **Game_Poll_State**: The `GamePollState` payload from `useGamePoll`, defined in `lib/turn-engine/types.ts`.
- **Viewer**: The player identified by `Game_Poll_State.viewerPlayerId`.
- **Viewer_Turn**: The condition `Game_Poll_State.currentPlayerId === Game_Poll_State.viewerPlayerId`.
- **Actions_Remaining**: `Game_Poll_State.actionsRemaining`.
- **Action_Budget**: `Game_Poll_State.actionBudget`.
- **Map_Data**: The `MapData` payload from `useMapData`, defined in `lib/map/types.ts`.
- **Name_Lookup**: A function from a Location id or Region id present in Map_Data to its `name` string, returning a fallback string when the id is absent.
- **Notebook_Entry**: One of the four discriminated variants of `DiscriminatedNotebookEntry`: `spy-proximity`, `mastermind_distance`, `mastermind_direction`, `phone_bug`.
- **Pending_Clue**: An entry in `privateData.pendingClues`, shaped `{ cardIdentifier, roundNumber }`.
- **Game_Event_Type**: One of 13 values: `game-won`, `game-draw`, `capture-failed`, `spy-captured-reward-collected`, `player-moved`, `card-used`, `player-skipped`, `turn-skipped`, `blockade-activated`, `blockade-lifted`, `action-penalty-applied`, `player-relocated`, `extra-turn-started`.
- **Card_Identifier**: One of 10 values: `close-all-roads`, `close-all-airways`, `close-all-sea-routes`, `lose-an-action`, `locate-the-mastermind`, `bug-a-phone`, `reveal-direction`, `drop-ship`, `extra-turn`, `open-all-roads`.
- **Card_Category**: One of `sabotage`, `clue`, `booster`.
- **Target_Requirement**: One of `none` or `player`.
- **Active_Blockade**: An entry in `Game_Poll_State.activeBlockades`, shaped `{ transportType, casterPlayerId, creationRound }`.
- **Viewer_Blocked_Transports**: The set of `TransportType` values for which `activeBlockades` contains an entry whose `casterPlayerId` differs from the Viewer's player id.
- **Transport_Type**: One of `car`, `plane`, `boat`.

### UI Terminology

- **Desktop_Layout**: The layout applied at a viewport width of 1024 CSS pixels or greater, presenting the map and all four panels simultaneously.
- **Compact_Layout**: The layout applied at a viewport width below 1024 CSS pixels, presenting one selected panel at a time via a tab control.
- **Panel_Tab**: A focusable tab in the Compact_Layout tab bar that activates one panel.
- **Selection_Callback**: The function a Card_Tile calls when the player activates that card, passing `{ cardId, cardIdentifier, targetRequirement }` upward without initiating any HTTP request.

## Requirements

### Requirement 1: Game Screen Shell and Responsive Layout

**User Story:** As a player, I want the game screen to arrange the map and information panels sensibly on both desktop and mobile, so that I can play comfortably regardless of device.

#### Acceptance Criteria

1. WHILE the viewport width is 1024 CSS pixels or greater, THE Game_Screen_Shell SHALL apply Desktop_Layout, rendering the map region and all four panels (Turn_HUD, Notebook_Panel, Event_Feed_Panel, Card_Hand) simultaneously.
2. WHILE the viewport width is below 1024 CSS pixels, THE Game_Screen_Shell SHALL apply Compact_Layout, rendering the map region and exactly one panel at a time controlled by a tab bar.
3. WHILE Compact_Layout is applied, THE Game_Screen_Shell SHALL render the tab bar with one Panel_Tab per panel: Turn_HUD, Notebook, Feed, and Cards.
4. WHILE Compact_Layout is applied, THE Game_Screen_Shell SHALL select the Turn_HUD tab on first render.
5. WHILE Compact_Layout is applied, WHEN a player activates a Panel_Tab, THE Game_Screen_Shell SHALL render only the panel associated with that tab.
6. WHILE Compact_Layout is applied, THE Game_Screen_Shell SHALL retain the scroll position of each panel when the player switches tabs and returns.
7. THE Game_Screen_Shell SHALL apply the dark surface treatment `bg-gray-900` with `text-white` to its root element.
8. THE Game_Screen_Shell SHALL assign a distinct ARIA landmark role and accessible name to the map region and to each panel region.
9. THE Game_Screen_Shell SHALL implement the tab bar using the WAI-ARIA Tabs pattern with `role="tablist"`, `role="tab"`, and `role="tabpanel"` attributes.
10. THE Game_Screen_Shell SHALL render each panel inside an independent error boundary so that a rendering failure in one panel leaves all other panels and the map rendered.

### Requirement 2: Turn HUD — Round and Turn Identity

**User Story:** As a player, I want to see the current round, whose turn it is, and how many actions remain, so that I always know where the game stands.

#### Acceptance Criteria

1. THE Turn_HUD SHALL render `Game_Poll_State.currentRound` with a label "Round".
2. THE Turn_HUD SHALL render the display name of the player whose `playerId` equals `Game_Poll_State.currentPlayerId`.
3. WHILE Viewer_Turn holds, THE Turn_HUD SHALL render the text "Your turn" with an emphasis treatment visually distinct from the non-viewer state.
4. WHILE Viewer_Turn does not hold, THE Turn_HUD SHALL render the text "Waiting for {displayName}" where `{displayName}` is the current player's display name.
5. THE Turn_HUD SHALL render Actions_Remaining and Action_Budget together in the form "{N} of {M} actions".
6. WHILE Actions_Remaining equals 0 and Viewer_Turn holds, THE Turn_HUD SHALL render a "Turn ending" indicator.

### Requirement 3: Turn HUD — Turn Order List

**User Story:** As a player, I want to see the order of play and where everyone is, so that I can anticipate upcoming turns.

#### Acceptance Criteria

1. THE Turn_HUD SHALL render a Turn_Order_List containing one entry per `Game_Poll_State.players` entry, ordered by ascending `turnPosition`.
2. THE Turn_HUD SHALL label each Turn_Order_List entry with the player's display name, `turnPosition`, and the resolved location name for that player's `locationId`.
3. THE Turn_HUD SHALL mark the Turn_Order_List entry whose `playerId` equals `Game_Poll_State.currentPlayerId` as the current turn with both a visual indicator and `aria-current="true"`.
4. THE Turn_HUD SHALL mark the Turn_Order_List entry whose `playerId` equals `Game_Poll_State.viewerPlayerId` with the text "(you)".
5. WHEN Name_Lookup is unavailable for a player's `locationId`, THE Turn_HUD SHALL render the raw `locationId` string in place of the resolved name.

### Requirement 4: Turn HUD — Status Indicators

**User Story:** As a player, I want to see warnings about upcoming penalties, skipped turns, and extra turns, so that I can plan around them.

#### Acceptance Criteria

1. WHILE `privateData.skipNextTurn` is `true`, THE Turn_HUD SHALL render an indicator with the text "Your next turn will be skipped".
2. WHILE `privateData.actionPenaltyFlag` is `true`, THE Turn_HUD SHALL render an indicator with the text "You lose one action next turn".
3. WHILE `privateData.pendingExtraTurns` is greater than 0, THE Turn_HUD SHALL render an indicator stating the count of extra turns owed to the Viewer in the form "{N} extra turn(s) pending".
4. WHILE `privateData.skipNextTurn` is `false` and `privateData.actionPenaltyFlag` is `false` and `privateData.pendingExtraTurns` equals 0, THE Turn_HUD SHALL render zero status indicators.

### Requirement 5: Turn HUD — Blockade Indicators

**User Story:** As a player, I want to see which transport types are currently blocked against me and who caused it, so that I understand my movement constraints.

#### Acceptance Criteria

1. THE Turn_HUD SHALL render one Blockade_Indicator per member of Viewer_Blocked_Transports, each naming the blocked Transport_Type and the display name of the caster player.
2. WHILE Viewer_Blocked_Transports is empty, THE Turn_HUD SHALL render zero Blockade_Indicators.
3. WHERE an `activeBlockades` entry has a `casterPlayerId` equal to the Viewer's player id, THE Turn_HUD SHALL render an indicator stating the Viewer cast that blockade and SHALL exclude that Transport_Type from the Viewer_Blocked_Transports set.
4. THE Turn_HUD SHALL render blockade indicators with distinct visual treatment per Transport_Type so that blocked roads, airways, and sea routes are distinguishable without relying on colour alone.

### Requirement 6: Notebook Panel — Entry Rendering

**User Story:** As a player, I want my private clue log rendered clearly with place names and round numbers, so that I can deduce the Mastermind's location.

#### Acceptance Criteria

1. THE Notebook_Panel SHALL render exactly one row per entry of `privateData.notebook`.
2. THE Notebook_Panel SHALL order rows by ascending `roundNumber`, preserving the original array order for entries sharing a `roundNumber`.
3. THE Notebook_Panel SHALL render the round number on every row.
4. WHERE a Notebook_Entry has `entryType` equal to `spy-proximity`, THE Notebook_Panel SHALL render the resolved region name for `regionId` and the `stepsAway` value described as distance to the Spy.
5. WHERE a Notebook_Entry has `entryType` equal to `mastermind_distance`, THE Notebook_Panel SHALL render the resolved location name for `locationId` and the `stepsAway` value described as distance to the Mastermind.
6. WHERE a Notebook_Entry has `entryType` equal to `mastermind_direction`, THE Notebook_Panel SHALL render the resolved location name for `locationId` described as one step closer to the Mastermind.
7. WHERE a Notebook_Entry has `entryType` equal to `phone_bug`, THE Notebook_Panel SHALL render the display name for `targetPlayerId`, the resolved location name for `targetLocationId`, the `mastermindStepsAway` value, and the Spy status derived from `spyCaptured` and `spyRegionId`.
8. WHERE a Notebook_Entry has `entryType` equal to `phone_bug` and `spyRegionId` is `null`, THE Notebook_Panel SHALL render the text "no spy information" in place of a region name.
9. IF a Notebook_Entry carries an `entryType` value absent from the four known variants, THEN THE Notebook_Panel SHALL render a row containing the round number and the text "Unrecognised clue".
10. THE Notebook_Panel SHALL render each entry type with a distinct visual label or badge so that entries are distinguishable at a glance.

### Requirement 7: Notebook Panel — Pending Clues, Filter, and Empty State

**User Story:** As a player, I want to see which clues are pending, filter by clue type, and know when I have no clues yet, so that I can manage my information efficiently.

#### Acceptance Criteria

1. THE Notebook_Panel SHALL render one Pending_Clue row per entry of `privateData.pendingClues`, each displaying the card display name for `cardIdentifier` and the text "resolves at end of round {N}" with N set to that entry's `roundNumber`.
2. THE Notebook_Panel SHALL render Pending_Clue rows with a visual treatment distinct from Notebook_Entry rows, using a muted or dashed style to indicate they are unresolved.
3. WHILE `privateData.notebook` and `privateData.pendingClues` are both empty, THE Notebook_Panel SHALL render the text "No clues yet".
4. THE Notebook_Panel SHALL render a filter control offering one option per `entryType` present in `privateData.notebook` plus an "All" option.
5. WHEN a player selects an `entryType` filter option, THE Notebook_Panel SHALL render only the Notebook_Entry rows whose `entryType` matches that option plus all Pending_Clue rows.
6. WHEN a player selects the "All" filter option, THE Notebook_Panel SHALL render every Notebook_Entry row and every Pending_Clue row.
7. THE Notebook_Panel SHALL render the filter control as a group of focusable buttons with `aria-pressed` indicating the active filter.
8. THE Notebook_Panel SHALL read clue data solely from `Game_Poll_State.privateData` and SHALL read zero clue data from `Game_Poll_State.players` or `Game_Poll_State.events`.

### Requirement 8: Event Feed Panel — Row Rendering

**User Story:** As a player, I want a readable log of what everyone has done with clear icons and sentences, so that I can follow the public record of the game.

#### Acceptance Criteria

1. THE Event_Feed_Panel SHALL render exactly one row per entry of `Game_Poll_State.events`.
2. THE Event_Feed_Panel SHALL order rows by descending `sequenceNumber`.
3. THE Event_Feed_Panel SHALL render a distinct inline-SVG glyph (via Event_Icon) for each of the 13 Game_Event_Type values.
4. THE Event_Feed_Panel SHALL render a human-readable sentence for each of the 13 Game_Event_Type values that resolves every player id in the event payload to a display name and every Location id and Region id to a resolved name via Name_Lookup.
5. IF an event carries a `type` value absent from the 13 Game_Event_Type values, THEN THE Event_Feed_Panel SHALL render a row with a neutral glyph and the text "Unrecognised event".
6. IF an event payload omits a field that its sentence template references, THEN THE Event_Feed_Panel SHALL render "someone" for a missing player reference and "an unknown location" for a missing Location reference.
7. THE Event_Feed_Panel SHALL render each row's sentence as text content so that assistive technology reads the sentence without relying on the glyph.
8. THE Event_Feed_Panel SHALL render a relative timestamp for each row derived from `createdAt`, expressed as whole seconds below 60 seconds, whole minutes below 60 minutes, and whole hours at or above 60 minutes.

### Requirement 9: Event Feed Panel — Round Markers, Scroll, and Empty State

**User Story:** As a player, I want the event feed to group events by round, scroll smoothly to new events, and tell me when there is nothing yet, so that the log stays navigable.

#### Acceptance Criteria

1. THE Event_Feed_Panel SHALL render a round marker heading above the first row of each distinct `roundNumber` in the rendered order.
2. WHILE the Event_Feed_Panel scroll position is within 40 CSS pixels of the newest row, WHEN a poll response adds events, THE Event_Feed_Panel SHALL auto-scroll to the newest row.
3. WHILE the Event_Feed_Panel scroll position is more than 40 CSS pixels from the newest row, WHEN a poll response adds events, THE Event_Feed_Panel SHALL retain the current scroll position and SHALL render a control that names the count of unseen events and scrolls to the newest row when activated.
4. WHILE `Game_Poll_State.events` is empty, THE Event_Feed_Panel SHALL render the text "No events yet".
5. THE Event_Feed_Panel SHALL render newly added rows inside an ARIA live region with `aria-live` set to `polite` so that screen readers announce new events without interrupting.

### Requirement 10: Card Hand — Card Display

**User Story:** As a player, I want to see each card I hold with its name, description, category colour, and a distinct icon, so that I understand my options.

#### Acceptance Criteria

1. THE Card_Hand SHALL render exactly one Card_Tile per entry of `privateData.actionCards`.
2. THE Card_Tile SHALL render a display name of at most 40 characters and a description of at most 120 characters for each of the 10 Card_Identifier values.
3. THE Card_Tile SHALL render a distinct inline-SVG glyph (via Card_Icon) for each of the 10 Card_Identifier values.
4. THE Card_Tile SHALL apply a distinct colour treatment per Card_Category: one colour for `sabotage`, one for `clue`, one for `booster`.
5. IF a card's `cardIdentifier` is absent from the 10 known values, THEN THE Card_Tile SHALL render a neutral glyph, the raw `cardIdentifier` as its display name, and the text "Unrecognised card" as its description.
6. WHILE `privateData.actionCards` is empty, THE Card_Hand SHALL render the text "No cards in hand".
7. WHILE `privateData.pendingReward` is not `null`, THE Card_Hand SHALL render a notice naming the resolved region name for `pendingReward.regionId` and the text "{rewardTier} card(s) incoming".

### Requirement 11: Card Hand — Interaction and Disabled States

**User Story:** As a player, I want to activate a card on my turn and be told when I cannot, so that I never accidentally play a card or wonder why nothing happened.

#### Acceptance Criteria

1. WHILE Viewer_Turn holds and Actions_Remaining is greater than 0 and no action submission is in flight, THE Card_Hand SHALL render every Card_Tile in an enabled state.
2. WHILE Viewer_Turn does not hold, THE Card_Hand SHALL render every Card_Tile in a disabled state with `aria-disabled="true"`.
3. WHILE Actions_Remaining equals 0, THE Card_Hand SHALL render every Card_Tile in a disabled state with `aria-disabled="true"`.
4. WHILE an action submission is in flight, THE Card_Hand SHALL render every Card_Tile in a disabled state with `aria-disabled="true"`.
5. THE Card_Tile SHALL be rendered as a focusable `button` element with an accessible name comprising the card display name and its Card_Category.
6. WHERE a card's `targetRequirement` is `none`, WHEN a player activates that Card_Tile, THE Card_Hand SHALL invoke the Selection_Callback with `{ cardId, cardIdentifier, targetRequirement: "none" }`.
7. WHERE a card's `targetRequirement` is `player`, WHEN a player activates that Card_Tile, THE Card_Hand SHALL render the Target_Picker and SHALL invoke zero Selection_Callbacks until a target is chosen.

### Requirement 12: Target Picker

**User Story:** As a player using a card that targets another player, I want a clear picker showing eligible targets so that I can choose confidently.

#### Acceptance Criteria

1. THE Target_Picker SHALL render one focusable option per `Game_Poll_State.players` entry whose `playerId` differs from the Viewer's player id.
2. THE Target_Picker SHALL label each option with that player's display name.
3. THE Target_Picker SHALL exclude the Viewer from the option list.
4. WHEN a player activates a Target_Picker option, THE Card_Hand SHALL invoke the Selection_Callback with `{ cardId, cardIdentifier, targetRequirement: "player", targetPlayerId }` for the chosen player.
5. WHEN a player activates the Target_Picker cancel control, THE Card_Hand SHALL dismiss the Target_Picker, SHALL invoke zero Selection_Callbacks, and SHALL return focus to the originating Card_Tile.
6. WHEN the Target_Picker is rendered, THE Card_Hand SHALL move focus to the first option in the Target_Picker.
7. WHILE the Target_Picker is rendered, THE Card_Hand SHALL confine sequential keyboard navigation (Tab and Shift+Tab) to the Target_Picker controls.
8. THE Target_Picker SHALL be rendered as a list with `role="listbox"` and each option with `role="option"`.

### Requirement 13: Event Icon Component

**User Story:** As a player, I want each event type to have a recognisable icon so that I can scan the feed quickly.

#### Acceptance Criteria

1. THE Event_Icon SHALL render a distinct inline-SVG glyph for each of the 13 Game_Event_Type values.
2. THE Event_Icon SHALL accept a `type` prop typed as `string` and SHALL render a neutral fallback glyph for any value outside the 13 known types.
3. THE Event_Icon SHALL render the SVG at a fixed width and height of 16 pixels.
4. THE Event_Icon SHALL mark the SVG with `aria-hidden="true"` so that assistive technology skips the decorative glyph.
5. THE Event_Icon SHALL be implemented as a pure component that re-renders only when the `type` prop changes.

### Requirement 14: Card Icon Component

**User Story:** As a player, I want each card to have a recognisable icon so that I can identify cards at a glance.

#### Acceptance Criteria

1. THE Card_Icon SHALL render a distinct inline-SVG glyph for each of the 10 Card_Identifier values.
2. THE Card_Icon SHALL accept an `identifier` prop typed as `string` and SHALL render a neutral fallback glyph for any value outside the 10 known identifiers.
3. THE Card_Icon SHALL render the SVG at a fixed width and height of 24 pixels.
4. THE Card_Icon SHALL mark the SVG with `aria-hidden="true"` so that assistive technology skips the decorative glyph.
5. THE Card_Icon SHALL be implemented as a pure component that re-renders only when the `identifier` prop changes.

### Requirement 15: Accessibility

**User Story:** As a player using a keyboard or screen reader, I want all panels to be fully navigable and announced correctly, so that I can play the game without a pointer.

#### Acceptance Criteria

1. THE Game_Screen_Shell SHALL render a visible focus indicator on every focusable element within the panels, distinguishable from the unfocused treatment.
2. THE Game_Screen_Shell SHALL render all body text and control labels at a contrast ratio of at least 4.5:1 against the dark background.
3. THE Game_Screen_Shell SHALL render Card_Category colours at a contrast ratio of at least 3:1 against the Card_Tile background.
4. THE Turn_HUD SHALL convey turn ownership, Actions_Remaining, and blockade status through text content and not through colour alone.
5. THE Notebook_Panel SHALL render filter state through `aria-pressed` on filter buttons so that the active filter is conveyed to assistive technology.
6. THE Event_Feed_Panel SHALL convey round boundaries through heading elements (`role="heading"`) so that screen readers can navigate between rounds.
7. THE Card_Hand SHALL announce disabled card reasons via `aria-disabled` and a visually hidden status message when the player is not on their turn.
8. WHEN the Target_Picker is open, THE Card_Hand SHALL trap focus within the picker until it is dismissed.
9. THE Game_Screen_Shell SHALL render the Compact_Layout tab bar as a WAI-ARIA Tabs pattern with correct `aria-selected`, `aria-controls`, and keyboard arrow-key navigation between tabs.

### Requirement 16: Graceful Degradation

**User Story:** As a player, I want a failure in one panel to leave the rest of my screen usable, so that partial data does not end my game.

#### Acceptance Criteria

1. THE Game_Screen_Shell SHALL render the map region, Turn_HUD, Notebook_Panel, Event_Feed_Panel, and Card_Hand such that a rendering failure in one panel leaves all other panels rendered.
2. WHEN a panel's error boundary catches a rendering error, THE Game_Screen_Shell SHALL render a fallback message in that panel's region stating the panel name and "failed to render".
3. WHEN Name_Lookup is unavailable (map data not yet loaded or failed), THE Notebook_Panel and Event_Feed_Panel SHALL render raw identifiers in place of resolved names and SHALL not throw.
4. IF `Game_Poll_State.privateData` is absent or malformed, THEN THE Notebook_Panel and Card_Hand SHALL render their empty states and SHALL not throw.
5. IF `Game_Poll_State.events` is absent or malformed, THEN THE Event_Feed_Panel SHALL render "No events yet" and SHALL not throw.

## Correctness Properties

### Property 1: Notebook row count

*For any* `privateData.notebook` array of length N, the Notebook_Panel renders exactly N Notebook_Entry rows.

**Validates: Requirements 6.1**

### Property 2: Notebook data isolation

*For any* Game_Poll_State, the Notebook_Panel renders zero clue values that are absent from `privateData.notebook` or `privateData.pendingClues`.

**Validates: Requirements 7.8**

### Property 3: Event feed row count

*For any* `Game_Poll_State.events` array of length N, the Event_Feed_Panel renders exactly N event rows.

**Validates: Requirements 8.1**

### Property 4: Event type totality

*For any* of the 13 Game_Event_Type values, the Event_Icon renders a glyph that is not the neutral fallback.

**Validates: Requirements 13.1, 8.3**

### Property 5: Card identifier totality

*For any* of the 10 Card_Identifier values, the Card_Icon renders a glyph that is not the neutral fallback, and the Card_Tile renders a display name that is not the raw identifier.

**Validates: Requirements 14.1, 10.2, 10.3**

### Property 6: Card disabled state correctness

*For any* Game_Poll_State, every Card_Tile is disabled if and only if Viewer_Turn does not hold, or Actions_Remaining equals 0, or an action submission is in flight.

**Validates: Requirements 11.1, 11.2, 11.3, 11.4**

### Property 7: Target picker exclusion

*For any* Game_Poll_State and any card whose Target_Requirement is `player`, the Target_Picker options are exactly the players whose `playerId` differs from `viewerPlayerId`.

**Validates: Requirements 12.1, 12.3**

### Property 8: Name resolution fallback

*For any* Location id or Region id absent from Map_Data, Name_Lookup returns a non-empty fallback string and the consuming panel does not throw.

**Validates: Requirements 3.5 (Turn HUD), 16.3**

### Property 9: Event feed ordering

*For any* events array, the rendered rows appear in strictly descending `sequenceNumber` order.

**Validates: Requirements 8.2**

### Property 10: Notebook ordering

*For any* notebook array, the rendered Notebook_Entry rows appear in ascending `roundNumber` order, with ties preserving the original array index order.

**Validates: Requirements 6.2**

## Recorded Decisions

**D-1 — Selection_Callback boundary, not submission.** Card_Hand and Card_Tile invoke a Selection_Callback that passes `{ cardId, cardIdentifier, targetRequirement, targetPlayerId? }` up to the parent. They do not issue HTTP requests. The parent (`game-wiring`) owns the actual `POST /api/game/{roomId}/action` call. This keeps panel logic free of network concerns and allows the Card_Hand to be tested in isolation.

**D-2 — Tab bar over accordion or bottom sheet.** Compact layout uses a tab bar because it maps directly to WAI-ARIA Tabs, needs no gesture handling, and prevents panels from pushing the map off-screen. Accordions and bottom sheets were rejected for mobile because they introduce scroll-inside-scroll and drag-physics complexity.

**D-3 — Inline SVG over icon library.** All 13 event icons and 10 card icons are inline SVG `<svg>` elements authored as React components. This avoids adding any icon library (lucide, heroicons, etc.) and keeps the zero-new-deps constraint intact. Each icon is small (16–24px, simple geometry) so file size impact is negligible.

**D-4 — Error boundaries per panel.** Each panel is wrapped in its own React error boundary so that a rendering crash in one (e.g., unexpected data shape) does not blank the entire game screen. The fallback is a simple text message naming the broken panel.

**D-5 — Card category colours are additive, not sole carriers.** The three category colours (`sabotage`, `clue`, `booster`) are applied as border/accent colours alongside text labels, so colour-blind players can still distinguish categories.

**D-6 — No new `useMapData` hook file shipped by this spec.** This spec assumes `useMapData` is provided by the `game-map` spec or a shared data-layer spec. The panels accept Name_Lookup as a prop or context value. If `useMapData` does not yet exist at implementation time, panels will receive a `nameLookup` prop that the parent provides.

## Known Limitations

**L-1 — Event feed is unbounded.** `useGamePoll` merges events indefinitely. At the 20-round default limit (~100 events max) this is acceptable. For longer custom games, virtualisation may be needed but is out of scope.

**L-2 — Relative timestamps do not self-refresh.** Timestamps re-render only when the 3-second poll delivers fresh state. Displayed times may lag by up to one poll interval.

**L-3 — No card art.** Cards render a simple geometric glyph plus text. Illustrated card art is out of scope for MVP and would require external assets.
