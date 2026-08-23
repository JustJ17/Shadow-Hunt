# Requirements Document

## Introduction

The Active Game UI is the complete in-game surface for Shadow Hunt. Today `app/game/[roomId]/page.tsx` polls game state correctly and delegates to a finished `EndScreen` when `status === "finished"`, but the active branch renders a placeholder div reading "Game in progress — active game view coming soon." No client code anywhere in the repository calls `POST /api/game/{roomId}/action`, and no client code consumes `GET /api/map`. The game is therefore unplayable through the browser despite a complete server-side turn engine. This spec closes that gap.

The feature covers ten surfaces on one screen: an interactive SVG world map, route rendering per transport type, animated player tokens, action controls (Move, Skip, Capture Attempt, Use Card), the turn and action HUD, the private Notebook panel, the public Event Feed panel, the Action Card hand, the lobby-to-game navigation handoff, and shared map-data loading with id-to-name resolution.

Three constraints shape every requirement below.

**All visuals are code.** Every graphic in this feature is inline SVG authored as TypeScript/JSX, or Tailwind CSS. No raster images, no external map tiles, no illustrated card art, no icon font, no SVG sprite files fetched over the network. Continent landmasses are hand-authored SVG paths at a deliberately stylized level of detail — this is an aesthetic decision, not a fidelity compromise, and it is what keeps the dependency count at zero (see Decision D-2).

**Zero new third-party packages.** Animation uses CSS transitions and transforms. Icons are inline SVG components. Projection is roughly twenty lines of arithmetic. `fast-check@4.9.0` and the vitest + Testing Library stack are already installed, so the testing strategy needs no additions either. Per `.kiro/steering/tech-stack.md`, any new package would require an ARCHITECTURE.md tech-stack note; this spec is written so that none is needed.

**The server is authoritative.** The client renders poll state and submits actions. It does not compute the Mastermind's location, does not compute clue values, does not decide turn order, and does not optimistically mutate turn state. After a successful action submission the client re-polls immediately rather than predicting the result (see Decision D-8).

Two schema-level gaps block the UI and are in scope for this spec.

1. **No coordinates exist.** The `Location` Prisma model is `{ id, name, regionId, isHub }`. Rendering a geographic map requires latitude and longitude. This spec adds `latitude Float` and `longitude Float` to `Location`, seeds real-world values for all 40 cities, and exposes them through `MapData` (see Decision D-1).
2. **`LobbyState` has no room id.** Verified in `lib/lobby/types.ts`: `LobbyState` is `{ roomCode, status, visibility, players, hostId }`. The game route is `/game/[roomId]` and `getGamePollState` treats that segment as `Room.id`, so the lobby cannot currently construct the destination URL. `lib/lobby/poll-state.ts` already holds `room.id` in scope, so exposing it is a one-line change. This spec adds `roomId` to `LobbyState`.

One dependency note: `lib/turn-engine/query-turn-state.ts` imports `CARD_REGISTRY` from `lib/turn-engine/cards/registry`. That module and `lib/turn-engine/cards/types.ts` (which defines the ten `CardIdentifier` values, `CardCategory`, and `TargetRequirement`) are present in the working tree, so the Action Cards types dependency is satisfied. The UI is nonetheless required to degrade gracefully on an unrecognized card identifier rather than crash, because card identifiers arrive as runtime JSON and the pool may grow.

Explicitly out of scope: Spy markers on the map (see Limitation L-1), Mode B moving-target behaviour, WebSockets, spectator mode, changing `EndScreen`, and the stale "Create Next App" metadata in `app/layout.tsx`.

## Glossary

### Systems

- **Game_Screen**: The client component at `app/game/[roomId]/page.tsx` that owns screen-level layout, loading state, error state, and the delegation to `EndScreen`. Owns composition; owns no game rules.
- **World_Map**: The inline-SVG map component. Owns the SVG root, viewBox, landmasses, region tinting, and composition of Route_Layer, Marker_Layer, Label_Layer, and Token_Layer.
- **Map_Projection**: The pure function converting a `{ latitude, longitude }` pair to a `{ x, y }` point in Map_ViewBox coordinates. Owns projection arithmetic; owns no rendering.
- **Route_Layer**: The SVG group rendering one path per Adjacency edge.
- **Marker_Layer**: The SVG group rendering one City_Marker per Location.
- **Label_Layer**: The SVG group rendering City_Label text elements.
- **Token_Layer**: The SVG group rendering one Player_Token per player.
- **Map_Viewport**: The pan and zoom controller that owns Zoom_Level and pan offset and applies them to the World_Map transform.
- **Action_Controls**: The component group that offers Move, Skip, Capture Attempt, and Use Card, and owns Action_Submission lifecycle and error presentation.
- **Action_Client**: The typed client module that issues `POST /api/game/{roomId}/action` and maps Turn_Action_Error_Code values to Error_Message strings.
- **Turn_HUD**: The component displaying round number, current turn, Actions_Remaining over Action_Budget, Turn_Order_List, Viewer_Status_Indicators, and Blockade_Indicators.
- **Notebook_Panel**: The component rendering `privateData.notebook` and `privateData.pendingClues`.
- **Event_Feed_Panel**: The component rendering `events` in reverse-chronological order.
- **Card_Hand**: The component rendering `privateData.actionCards`, the Target_Picker, and `privateData.pendingReward`.
- **Map_Data_Provider**: The client module that fetches `GET /api/map` once per browser session, caches the result, and exposes Name_Lookup, Coordinate_Lookup, Region_Lookup, and Adjacency_Lookup.
- **Lobby_Screen**: The client component at `app/lobby/[code]/page.tsx`.
- **Map_Seed**: The seed script `prisma/seed.ts` and the Prisma schema definition of `Location`.
- **Map_Data_Service**: The existing server module `lib/map/get-map-data.ts` returning `MapData`.
- **Lobby_Poll_Service**: The existing server module `lib/lobby/poll-state.ts` returning `LobbyState`.

### Data terminology

- **Game_Poll_State**: The `GamePollState` payload returned by `GET /api/game/{roomId}/state`, defined in `lib/turn-engine/types.ts`.
- **Viewer**: The player identified by `Game_Poll_State.viewerPlayerId` — the person looking at the screen.
- **Viewer_Turn**: The condition `Game_Poll_State.currentPlayerId === Game_Poll_State.viewerPlayerId`.
- **Actions_Remaining**: `Game_Poll_State.actionsRemaining`.
- **Action_Budget**: `Game_Poll_State.actionBudget`.
- **Map_Data**: The `MapData` payload returned by `GET /api/map`, comprising `regions` (each with `locations`) and `adjacency`.
- **Location_Coordinate**: The `{ latitude, longitude }` pair on a Location record, in decimal degrees. Latitude is within [-90, 90]; longitude is within [-180, 180].
- **Name_Lookup**: A total function from a Location id or Region id present in Map_Data to that record's `name`.
- **Coordinate_Lookup**: A total function from a Location id present in Map_Data to its Location_Coordinate.
- **Region_Lookup**: A total function from a Location id present in Map_Data to the Region record containing that Location.
- **Adjacency_Lookup**: A total function from a Location id present in Map_Data to that Location's `edges` array.
- **Transport_Type**: One of `car`, `plane`, `boat`.
- **Hub_Location**: A Location whose `isHub` is `true`. There are 6, one per region.
- **Non_Hub_Location**: A Location whose `isHub` is `false`. There are 34.
- **Notebook_Entry**: One of the four discriminated variants of `DiscriminatedNotebookEntry`: `spy-proximity`, `mastermind_distance`, `mastermind_direction`, `phone_bug`.
- **Pending_Clue**: An entry in `privateData.pendingClues`, shaped `{ cardIdentifier, roundNumber }`, representing a clue that resolves at the end of the named round.
- **Game_Event_Type**: One of the 13 values of `GameEventType`: `game-won`, `game-draw`, `capture-failed`, `spy-captured-reward-collected`, `player-moved`, `card-used`, `player-skipped`, `turn-skipped`, `blockade-activated`, `blockade-lifted`, `action-penalty-applied`, `player-relocated`, `extra-turn-started`.
- **Card_Identifier**: One of the ten values of `CardIdentifier` defined in `lib/turn-engine/cards/types.ts`.
- **Card_Category**: One of `sabotage`, `clue`, `booster`.
- **Target_Requirement**: One of `none` or `player`. Only `lose-an-action` declares `player`.
- **Active_Blockade**: An entry in `Game_Poll_State.activeBlockades`, shaped `{ transportType, casterPlayerId, creationRound }`.
- **Viewer_Blocked_Transports**: The set of Transport_Type values for which `activeBlockades` contains an entry whose `casterPlayerId` differs from the Viewer's player id.
- **Turn_Action_Error_Code**: One of the 16 `TurnActionErrorCode` values, plus the transport-level codes `UNAUTHENTICATED` and `UNKNOWN`.
- **Error_Message**: A player-facing sentence, at most 120 characters, explaining a rejected action in game terms rather than protocol terms.

### UI terminology

- **Map_ViewBox**: The SVG `viewBox` of the World_Map, a rectangle of fixed width 1000 and fixed height 500 user units, with origin at (0, 0).
- **Zoom_Level**: A scalar multiplier applied to the World_Map contents, within the closed interval [1, 4].
- **City_Marker**: The interactive SVG element representing one Location.
- **City_Label**: The SVG `text` element carrying a Location's name.
- **Player_Token**: The SVG element representing one player's current Location.
- **Token_Cluster**: The set of Player_Tokens whose players share one `locationId`.
- **Token_Offset**: The per-token displacement, in Map_ViewBox user units, applied to separate the members of a Token_Cluster.
- **Legal_Move_Target**: A Location that is adjacent to the Viewer's current Location by at least one edge whose Transport_Type is absent from Viewer_Blocked_Transports, and, where that edge's Transport_Type is `plane`, both endpoint Locations are Hub_Locations.
- **Route_Style**: The visual treatment of an edge, determined solely by Transport_Type: `car` is a solid straight stroke, `boat` is a dashed straight stroke, `plane` is a solid quadratic bezier arc.
- **Action_Submission**: One in-flight `POST /api/game/{roomId}/action` request.
- **Capture_Confirmation**: The two-step interaction gating a `CAPTURE_ATTEMPT` submission behind an explicit confirming interaction.
- **Target_Picker**: The interaction that collects a `targetPlayerId` for a card whose Target_Requirement is `player`.
- **Panel_Set**: The four non-map surfaces: Turn_HUD, Card_Hand, Notebook_Panel, Event_Feed_Panel.
- **Desktop_Layout**: The layout used at a viewport width of 1024 CSS pixels or greater, presenting the World_Map and all four members of Panel_Set simultaneously.
- **Compact_Layout**: The layout used at a viewport width below 1024 CSS pixels, presenting the World_Map plus one selected member of Panel_Set at a time via a tab control.
- **Reduced_Motion**: The state in which the CSS media query `(prefers-reduced-motion: reduce)` matches.
- **Motion_Duration**: The duration of a Player_Token position transition, 600 milliseconds when Reduced_Motion does not match and 0 milliseconds when it does.

## Requirements

### Requirement 1: Game Screen Shell and Layout

**User Story:** As a player in an active game, I want a single screen that shows the map alongside my turn state, cards, notebook, and the event feed, so that I can play the game without navigating between views.

#### Acceptance Criteria

1. WHILE `Game_Poll_State.status` equals `in-progress`, THE Game_Screen SHALL render the World_Map and all four members of Panel_Set.
2. WHILE `Game_Poll_State.status` equals `finished`, THE Game_Screen SHALL render `EndScreen` with the existing `roomId`, `playerId`, and `events` props and SHALL omit the World_Map and Panel_Set.
3. WHILE the first poll response for the room has not yet arrived, THE Game_Screen SHALL render a loading indicator containing the accessible text "Loading game".
4. IF the poll for game state fails, THEN THE Game_Screen SHALL render the error text returned by the poll hook and a link to the application root.
5. WHILE the viewport width is 1024 CSS pixels or greater, THE Game_Screen SHALL apply Desktop_Layout.
6. WHILE the viewport width is below 1024 CSS pixels, THE Game_Screen SHALL apply Compact_Layout with the Turn_HUD tab selected on first render.
7. WHILE Compact_Layout is applied, WHEN a player activates a Panel_Set tab, THE Game_Screen SHALL render that panel and SHALL retain the scroll position of each panel across tab switches.
8. THE Game_Screen SHALL apply the dark surface treatment already used by `EndScreen` (`bg-gray-900` with `text-white`) to its root element.
9. THE Game_Screen SHALL assign a distinct ARIA landmark role and accessible name to the World_Map region and to each member of Panel_Set.

### Requirement 2: Location Coordinates in Schema and Seed

**User Story:** As a developer, I want city coordinates stored in the database and served by the map API, so that the client has one authoritative source for map geometry.

#### Acceptance Criteria

1. THE Map_Seed SHALL define `latitude` and `longitude` as non-nullable `Float` fields on the `Location` model.
2. THE Map_Seed SHALL provide a Location_Coordinate for each of the 40 seeded Locations.
3. THE Map_Seed SHALL set each Location's `latitude` to that city's real-world latitude in decimal degrees within [-90, 90] and `longitude` to that city's real-world longitude in decimal degrees within [-180, 180].
4. THE Map_Seed SHALL include a Prisma migration that adds the `latitude` and `longitude` columns.
5. THE Map_Data_Service SHALL include `latitude` and `longitude` on every entry of `Map_Data.regions[].locations[]`.
6. WHEN the seed script runs against a database that already contains the 40 Locations, THE Map_Seed SHALL set the Location_Coordinate values on the existing rows and SHALL leave the total Location count at 40.

### Requirement 3: Map Data Loading and Caching

**User Story:** As a player, I want the map, city names, and routes to load once and stay loaded, so that panels can show readable place names without repeated network calls.

#### Acceptance Criteria

1. WHEN the Game_Screen mounts and no cached Map_Data exists for the browser session, THE Map_Data_Provider SHALL issue one `GET /api/map` request.
2. WHILE cached Map_Data exists for the browser session, THE Map_Data_Provider SHALL serve Map_Data from the cache and SHALL issue zero additional `GET /api/map` requests.
3. WHEN two or more components request Map_Data before the first response arrives, THE Map_Data_Provider SHALL return the same in-flight promise to every caller and SHALL issue exactly one `GET /api/map` request.
4. THE Map_Data_Provider SHALL expose Name_Lookup, Coordinate_Lookup, Region_Lookup, and Adjacency_Lookup derived from the cached Map_Data.
5. WHEN Name_Lookup receives a Location id or Region id that is absent from Map_Data, THE Map_Data_Provider SHALL return the string `Unknown location` for a Location id and `Unknown region` for a Region id.
6. IF the `GET /api/map` request fails, THEN THE Game_Screen SHALL render the Turn_HUD, Notebook_Panel, Event_Feed_Panel, and Card_Hand with identifier-based fallback text in place of resolved names, SHALL render a map-unavailable notice in place of the World_Map, and SHALL offer a control that retries the `GET /api/map` request.

### Requirement 4: Map Projection

**User Story:** As a player, I want each city to appear at a stable, sensible position on the map, so that I can build a mental model of the world and reason about distance.

#### Acceptance Criteria

1. THE Map_Projection SHALL convert a Location_Coordinate to a Map_ViewBox point using an equirectangular projection, mapping longitude -180 to x = 0, longitude 180 to x = 1000, latitude 90 to y = 0, and latitude -90 to y = 500.
2. WHEN Map_Projection receives the same Location_Coordinate twice, THE Map_Projection SHALL return the same point on both calls.
3. THE Map_Projection SHALL return a point whose x lies within [0, 1000] and whose y lies within [0, 500] for every Location_Coordinate whose latitude lies within [-90, 90] and whose longitude lies within [-180, 180].
4. THE Map_Projection SHALL be implemented as a pure function that reads no module-level mutable state.
5. WHEN Map_Projection receives two Location_Coordinate values with equal latitude of which the first has the smaller longitude, THE Map_Projection SHALL return a point for the first whose x is less than the x returned for the second.
6. WHEN Map_Projection receives two Location_Coordinate values with equal longitude of which the first has the greater latitude, THE Map_Projection SHALL return a point for the first whose y is less than the y returned for the second.

### Requirement 5: World Map Rendering

**User Story:** As a player, I want a legible stylized world map with the 40 cities marked and grouped by region, so that I can see where everyone is and where I can go.

#### Acceptance Criteria

1. THE World_Map SHALL render one inline SVG element whose `viewBox` is `0 0 1000 500`.
2. THE World_Map SHALL render stylized landmass shapes as SVG `path` elements authored in TypeScript source.
3. THE World_Map SHALL render zero `image` elements and SHALL reference zero external raster or tile resources.
4. THE World_Map SHALL render one City_Marker for each Location in Map_Data.
5. THE World_Map SHALL position each City_Marker at the Map_ViewBox point returned by Map_Projection for that Location's Location_Coordinate.
6. THE World_Map SHALL render each City_Marker for a Hub_Location with a larger radius and a distinct outline treatment from every City_Marker for a Non_Hub_Location.
7. THE World_Map SHALL assign each of the 6 regions a distinct fill hue and SHALL apply that hue to the City_Markers of that region's Locations.
8. THE World_Map SHALL render the Route_Layer before the Marker_Layer in document order so that City_Markers paint above routes.
9. WHILE Zoom_Level equals 1, THE Label_Layer SHALL render a City_Label for each Hub_Location and for the Viewer's current Location.
10. WHILE Zoom_Level is greater than 1, THE Label_Layer SHALL render a City_Label for each Location whose projected point lies inside the visible portion of Map_ViewBox.
11. THE Label_Layer SHALL offset each City_Label from its City_Marker so that the label text does not overlap the marker shape.
12. THE World_Map SHALL scale City_Marker radii and stroke widths by the reciprocal of Zoom_Level so that marker size in CSS pixels remains constant across Zoom_Level values.

### Requirement 6: Route Rendering

**User Story:** As a player, I want to tell at a glance whether a connection is a road, a sea route, or a flight, so that I can plan movement and understand which blockades affect me.

#### Acceptance Criteria

1. THE Route_Layer SHALL render one path for each unordered pair of Locations connected by an edge in `Map_Data.adjacency`, rendering each pair once.
2. WHERE an edge's Transport_Type is `car`, THE Route_Layer SHALL render a straight line with a solid stroke.
3. WHERE an edge's Transport_Type is `boat`, THE Route_Layer SHALL render a straight line with a dashed stroke.
4. WHERE an edge's Transport_Type is `plane`, THE Route_Layer SHALL render a quadratic bezier curve whose control point is displaced perpendicular to the straight line between the endpoints by at least 8 Map_ViewBox user units.
5. THE Route_Layer SHALL render `plane` edges with a stroke colour distinct from the stroke colours used for `car` and `boat` edges.
6. WHILE a Transport_Type is a member of Viewer_Blocked_Transports, THE Route_Layer SHALL render every edge of that Transport_Type with a reduced opacity and SHALL include the text "blocked" in that edge's accessible description.
7. THE Route_Layer SHALL mark every route path as hidden from assistive technology, delegating route information to the Turn_HUD and to City_Marker descriptions.

### Requirement 7: Map Viewport, Zoom, and Pan

**User Story:** As a player, I want to zoom into a crowded region and move around the map, so that I can read city labels and pick move targets precisely.

#### Acceptance Criteria

1. THE Map_Viewport SHALL initialise Zoom_Level to 1 and pan offset to zero.
2. WHEN a player activates the zoom-in control, THE Map_Viewport SHALL multiply Zoom_Level by 1.5 and SHALL clamp the result to a maximum of 4.
3. WHEN a player activates the zoom-out control, THE Map_Viewport SHALL divide Zoom_Level by 1.5 and SHALL clamp the result to a minimum of 1.
4. WHEN a player activates the reset-view control, THE Map_Viewport SHALL set Zoom_Level to 1 and pan offset to zero.
5. WHILE Zoom_Level is greater than 1, WHEN a player performs a pointer drag on the World_Map, THE Map_Viewport SHALL translate the pan offset by the drag delta divided by Zoom_Level.
6. WHILE Zoom_Level is greater than 1, WHEN a player presses an arrow key with the World_Map focused, THE Map_Viewport SHALL translate the pan offset by 50 Map_ViewBox user units divided by Zoom_Level along the corresponding axis.
7. THE Map_Viewport SHALL clamp the pan offset so that the visible portion of Map_ViewBox remains inside the rectangle `0 0 1000 500`.
8. WHILE Zoom_Level equals 1, THE Map_Viewport SHALL hold the pan offset at zero.
9. THE Map_Viewport SHALL expose the zoom-in, zoom-out, and reset-view controls as focusable `button` elements with accessible names.

### Requirement 8: Player Tokens and Movement Animation

**User Story:** As a player, I want to see where every agent is and watch them travel when they move, so that I can track my rivals between polls.

#### Acceptance Criteria

1. THE Token_Layer SHALL render one Player_Token for each entry of `Game_Poll_State.players`.
2. THE Token_Layer SHALL position each Player_Token at the Map_ViewBox point returned by Map_Projection for that player's `locationId`, displaced by that token's Token_Offset.
3. THE Token_Layer SHALL render the Viewer's Player_Token with a distinct outline treatment and SHALL include the Viewer's display name followed by " (you)" in that token's accessible name.
4. WHILE two or more players share one `locationId`, THE Token_Layer SHALL assign each member of that Token_Cluster a Token_Offset that differs from the Token_Offset of every other member of the same Token_Cluster by at least 6 Map_ViewBox user units.
5. THE Token_Layer SHALL derive each Token_Offset from the player's `turnPosition` so that a player's offset within a given Token_Cluster is the same on every render.
6. WHEN a poll response reports a `locationId` for a player that differs from the previously rendered `locationId` for that player, THE Token_Layer SHALL transition that Player_Token from the previous point to the new point over Motion_Duration using a CSS transform transition.
7. WHILE a Player_Token transition is in progress, WHEN a poll response reports a further `locationId` change for that player, THE Token_Layer SHALL retarget the transition to the newest point from the token's current rendered position.
8. WHILE Reduced_Motion matches, THE Token_Layer SHALL set Motion_Duration to 0 milliseconds.
9. THE Token_Layer SHALL render each Player_Token with the player's display name as its accessible name and the resolved name of the player's Location in its accessible description.
10. THE Token_Layer SHALL render the Token_Layer after the Marker_Layer in document order so that Player_Tokens paint above City_Markers.

### Requirement 9: Move Selection and Legal Targets

**User Story:** As a player on my turn, I want the map to show me exactly where I can travel, so that I do not waste an action on an illegal move.

#### Acceptance Criteria

1. WHILE Viewer_Turn holds and Actions_Remaining is greater than 0, THE World_Map SHALL render every Legal_Move_Target City_Marker with a highlight treatment.
2. WHILE Viewer_Turn holds and Actions_Remaining is greater than 0, WHEN a player activates a Legal_Move_Target City_Marker, THE Action_Controls SHALL submit an Action_Submission with `{ actionType: "MOVE", targetLocationId }` for that Location.
3. THE World_Map SHALL render every City_Marker that is not a Legal_Move_Target with `aria-disabled` set to `true` and SHALL ignore activation of that marker.
4. WHILE Viewer_Turn does not hold, THE World_Map SHALL render zero Legal_Move_Target highlights and SHALL ignore activation of every City_Marker.
5. WHILE Actions_Remaining equals 0, THE World_Map SHALL render zero Legal_Move_Target highlights and SHALL ignore activation of every City_Marker.
6. THE Action_Controls SHALL render a list control containing one focusable entry per Legal_Move_Target, labelled with that Location's resolved name and the Transport_Type of the connecting edge, that submits the same Action_Submission as activating the corresponding City_Marker.
7. WHERE an edge from the Viewer's Location has Transport_Type `plane` and the Viewer's Location is a Non_Hub_Location, THE Action_Controls SHALL exclude that edge's target Location from the Legal_Move_Target set.
8. WHERE an edge from the Viewer's Location has a Transport_Type that is a member of Viewer_Blocked_Transports, THE Action_Controls SHALL exclude that edge's target Location from the Legal_Move_Target set unless another edge to the same target Location has an unblocked Transport_Type.
9. WHILE the Legal_Move_Target set is empty and Viewer_Turn holds, THE Action_Controls SHALL render the text "No legal moves available" in the move list control.

### Requirement 10: Action Submission and Error Handling

**User Story:** As a player, I want my actions to reach the server reliably and to be told plainly when one is refused, so that I always know the state of my turn.

#### Acceptance Criteria

1. THE Action_Client SHALL issue `POST /api/game/{roomId}/action` with a JSON body matching one of the four `ActionPayload` variants.
2. WHILE Viewer_Turn holds and Actions_Remaining is greater than 0 and no Action_Submission is in flight, THE Action_Controls SHALL render the Skip control, the Capture Attempt control, and the Card_Hand card controls in an enabled state.
3. WHILE Viewer_Turn does not hold, THE Action_Controls SHALL render the Skip control, the Capture Attempt control, and every Card_Hand card control in a disabled state.
4. WHILE Actions_Remaining equals 0, THE Action_Controls SHALL render the Skip control, the Capture Attempt control, and every Card_Hand card control in a disabled state.
5. WHILE an Action_Submission is in flight, THE Action_Controls SHALL render every action control in a disabled state and SHALL issue zero further Action_Submissions.
6. WHEN a player activates the Capture Attempt control, THE Action_Controls SHALL render a Capture_Confirmation that names the Viewer's current Location and offers a confirm control and a cancel control, and SHALL issue zero Action_Submissions until the confirm control is activated.
7. WHEN a player activates the Capture_Confirmation cancel control, THE Action_Controls SHALL dismiss the Capture_Confirmation, SHALL issue zero Action_Submissions, and SHALL return focus to the Capture Attempt control.
8. WHEN an Action_Submission returns a 2xx response, THE Action_Controls SHALL trigger an immediate poll of `GET /api/game/{roomId}/state` rather than waiting for the next scheduled poll interval.
9. WHEN an Action_Submission returns a non-2xx response carrying a Turn_Action_Error_Code, THE Action_Controls SHALL render the Error_Message mapped from that code in a live region and SHALL re-enable the action controls that Requirement 10.2 permits.
10. THE Action_Client SHALL define a distinct Error_Message for each of `NOT_IN_ROOM`, `GAME_NOT_ACTIVE`, `NOT_YOUR_TURN`, `NO_ACTIONS_REMAINING`, `INVALID_MOVE`, `INVALID_TRANSPORT`, `SAME_LOCATION_MOVE`, `ROADS_BLOCKED`, `AIRWAYS_BLOCKED`, `SEA_ROUTES_BLOCKED`, `DUPLICATE_CAPTURE_ATTEMPT`, `INVALID_CARD`, `UNKNOWN_CARD_TYPE`, `INVALID_CARD_TARGET`, `CONCURRENCY_CONFLICT`, `UNKNOWN_ACTION_TYPE`, and `UNAUTHENTICATED`.
11. IF an Action_Submission returns a response body whose error code is absent from the set named in Requirement 10.10, THEN THE Action_Client SHALL return the Error_Message mapped from `UNKNOWN`.
12. IF an Action_Submission fails at the transport layer, THEN THE Action_Controls SHALL render the Error_Message mapped from `UNKNOWN` and SHALL re-enable the action controls that Requirement 10.2 permits.
13. WHEN an Action_Submission returns the Turn_Action_Error_Code `CONCURRENCY_CONFLICT`, THE Action_Controls SHALL trigger an immediate poll of `GET /api/game/{roomId}/state` in addition to rendering the Error_Message.

### Requirement 11: Turn and Action HUD

**User Story:** As a player, I want to see the round, whose turn it is, how many actions I have left, and what is currently working against me, so that I can plan.

#### Acceptance Criteria

1. THE Turn_HUD SHALL render `Game_Poll_State.currentRound`.
2. THE Turn_HUD SHALL render the display name of the player whose `playerId` equals `Game_Poll_State.currentPlayerId`.
3. WHILE Viewer_Turn holds, THE Turn_HUD SHALL render the text "Your turn" with an emphasis treatment distinct from the treatment used when Viewer_Turn does not hold.
4. THE Turn_HUD SHALL render Actions_Remaining and Action_Budget together in the form "N of M actions".
5. THE Turn_HUD SHALL render a Turn_Order_List containing one entry per `Game_Poll_State.players` entry, ordered by ascending `turnPosition`, each labelled with the player's display name, `turnPosition`, and the resolved name of that player's Location.
6. THE Turn_HUD SHALL mark the Turn_Order_List entry whose `playerId` equals `Game_Poll_State.currentPlayerId` as the current turn for assistive technology.
7. WHILE `privateData.skipNextTurn` is `true`, THE Turn_HUD SHALL render an indicator with the text "Your next turn will be skipped".
8. WHILE `privateData.actionPenaltyFlag` is `true`, THE Turn_HUD SHALL render an indicator with the text "You lose one action next turn".
9. WHILE `privateData.pendingExtraTurns` is greater than 0, THE Turn_HUD SHALL render an indicator naming the count of extra turns owed to the Viewer.
10. THE Turn_HUD SHALL render one Blockade_Indicator per member of Viewer_Blocked_Transports, each naming the blocked Transport_Type and the display name of the caster.
11. WHILE Viewer_Blocked_Transports is empty, THE Turn_HUD SHALL render zero Blockade_Indicators.
12. WHERE an `activeBlockades` entry has a `casterPlayerId` equal to the Viewer's player id, THE Turn_HUD SHALL render an indicator stating that the Viewer cast that blockade and SHALL exclude that Transport_Type from Viewer_Blocked_Transports.

### Requirement 12: Notebook Panel

**User Story:** As a player, I want my private clue log rendered clearly with real place names and round numbers, so that I can deduce where the Mastermind is.

#### Acceptance Criteria

1. THE Notebook_Panel SHALL render exactly one row per entry of `privateData.notebook`.
2. THE Notebook_Panel SHALL order rows by ascending `roundNumber`, preserving the array order of `privateData.notebook` for entries sharing a `roundNumber`.
3. WHERE a Notebook_Entry has `entryType` equal to `spy-proximity`, THE Notebook_Panel SHALL render the resolved region name for `regionId` and the `stepsAway` value described as steps to the Spy.
4. WHERE a Notebook_Entry has `entryType` equal to `mastermind_distance`, THE Notebook_Panel SHALL render the resolved location name for `locationId` and the `stepsAway` value described as steps to the Mastermind.
5. WHERE a Notebook_Entry has `entryType` equal to `mastermind_direction`, THE Notebook_Panel SHALL render the resolved location name for `locationId` described as one step closer to the Mastermind.
6. WHERE a Notebook_Entry has `entryType` equal to `phone_bug`, THE Notebook_Panel SHALL render the display name for `targetPlayerId`, the resolved location name for `targetLocationId`, the `mastermindStepsAway` value, and the Spy status derived from `spyCaptured` and `spyRegionId`.
7. WHERE a Notebook_Entry has `entryType` equal to `phone_bug` and `spyRegionId` is `null`, THE Notebook_Panel SHALL render the text "no spy information" in place of a region name.
8. THE Notebook_Panel SHALL render the round number on every row.
9. THE Notebook_Panel SHALL render one Pending_Clue row per entry of `privateData.pendingClues`, each naming the card display name for `cardIdentifier` and the text "resolves at the end of round N" with N set to that entry's `roundNumber`.
10. THE Notebook_Panel SHALL render Pending_Clue rows with a visual treatment distinct from the treatment used for Notebook_Entry rows.
11. WHILE `privateData.notebook` and `privateData.pendingClues` are both empty, THE Notebook_Panel SHALL render the text "No clues yet".
12. THE Notebook_Panel SHALL render a filter control offering one option per Notebook_Entry type present in `privateData.notebook` plus an all-entries option, and WHEN a player selects a type option, THE Notebook_Panel SHALL render only the rows whose `entryType` matches that option.
13. THE Notebook_Panel SHALL read clue data only from `Game_Poll_State.privateData` and SHALL read zero clue data from `Game_Poll_State.players` or `Game_Poll_State.events`.
14. IF a Notebook_Entry carries an `entryType` value that is absent from the four known variants, THEN THE Notebook_Panel SHALL render a row containing the round number and the text "Unrecognised clue".

### Requirement 13: Event Feed Panel

**User Story:** As a player, I want a readable log of what everyone has done, so that I can follow the public record of the game.

#### Acceptance Criteria

1. THE Event_Feed_Panel SHALL render exactly one row per entry of `Game_Poll_State.events`.
2. THE Event_Feed_Panel SHALL order rows by descending `sequenceNumber`.
3. THE Event_Feed_Panel SHALL render a distinct inline-SVG glyph for each of the 13 Game_Event_Type values.
4. THE Event_Feed_Panel SHALL render a sentence for each of the 13 Game_Event_Type values that resolves every player id in the event payload to a display name and every Location id and Region id in the event payload to a resolved name.
5. IF an event carries a `type` value that is absent from the 13 Game_Event_Type values, THEN THE Event_Feed_Panel SHALL render a row with a neutral glyph and the text "Unrecognised event".
6. IF an event payload omits a field that its sentence references, THEN THE Event_Feed_Panel SHALL render the fallback text "someone" for a missing player reference and "an unknown location" for a missing Location reference.
7. THE Event_Feed_Panel SHALL render a relative time for each row derived from `createdAt`, expressed in whole seconds below 60 seconds, whole minutes below 60 minutes, and whole hours at or above 60 minutes.
8. THE Event_Feed_Panel SHALL render a round marker above the first row of each distinct `roundNumber` in the rendered order.
9. WHILE the Event_Feed_Panel scroll position is within 40 CSS pixels of the newest row, WHEN a poll response adds events, THE Event_Feed_Panel SHALL scroll to the newest row.
10. WHILE the Event_Feed_Panel scroll position is more than 40 CSS pixels from the newest row, WHEN a poll response adds events, THE Event_Feed_Panel SHALL retain the current scroll position and SHALL render a control that scrolls to the newest row and names the count of unseen events.
11. WHILE `Game_Poll_State.events` is empty, THE Event_Feed_Panel SHALL render the text "No events yet".
12. THE Event_Feed_Panel SHALL render each row's sentence as text content so that assistive technology reads the sentence without relying on the glyph.

### Requirement 14: Card Hand

**User Story:** As a player, I want to see the cards I hold, understand what each does, and play one on my turn, so that I can use the card subsystem.

#### Acceptance Criteria

1. THE Card_Hand SHALL render exactly one card control per entry of `privateData.actionCards`.
2. THE Card_Hand SHALL render a display name, a description of at most 120 characters, and a distinct inline-SVG glyph for each of the ten Card_Identifier values.
3. THE Card_Hand SHALL apply a distinct colour treatment to each of the three Card_Category values and SHALL apply the treatment matching each card's `category`.
4. IF a card's `cardIdentifier` is absent from the ten Card_Identifier values, THEN THE Card_Hand SHALL render that card with a neutral glyph, the raw `cardIdentifier` as its display name, and the text "Unrecognised card" as its description.
5. WHERE a card's `targetRequirement` is `none`, WHEN a player activates that card control, THE Card_Hand SHALL submit an Action_Submission with `{ actionType: "USE_CARD", cardId }`.
6. WHERE a card's `targetRequirement` is `player`, WHEN a player activates that card control, THE Card_Hand SHALL render a Target_Picker containing one focusable option per `Game_Poll_State.players` entry whose `playerId` differs from the Viewer's player id, and SHALL issue zero Action_Submissions until an option is activated.
7. WHEN a player activates a Target_Picker option, THE Card_Hand SHALL submit an Action_Submission with `{ actionType: "USE_CARD", cardId, targetPlayerId }` for the activated option.
8. WHEN a player activates the Target_Picker cancel control, THE Card_Hand SHALL dismiss the Target_Picker, SHALL issue zero Action_Submissions, and SHALL return focus to the originating card control.
9. THE Card_Hand SHALL exclude the Viewer from the Target_Picker options.
10. WHILE `privateData.actionCards` is empty, THE Card_Hand SHALL render the text "No cards in hand".
11. WHILE `privateData.pendingReward` is not `null`, THE Card_Hand SHALL render a notice naming the resolved region name for `pendingReward.regionId` and the `pendingReward.rewardTier` count of cards owed.
12. THE Card_Hand SHALL render each card control as a focusable `button` element with an accessible name comprising the card display name and its Card_Category.

### Requirement 15: Lobby to Game Navigation

**User Story:** As a player waiting in a lobby, I want to be taken into the game when it starts, so that I do not have to reload the page or find the URL myself.

#### Acceptance Criteria

1. THE Lobby_Poll_Service SHALL include `roomId` set to the room's `Room.id` in every `LobbyState` it returns.
2. WHEN the lobby poll reports `status` equal to `in-progress`, THE Lobby_Screen SHALL navigate to `/game/{roomId}` using the `roomId` from the poll payload.
3. THE Lobby_Screen SHALL perform the navigation described in Requirement 15.2 for the host player and for every non-host player.
4. WHEN the lobby poll reports `status` equal to `in-progress` on two or more consecutive poll responses, THE Lobby_Screen SHALL perform the navigation exactly once.
5. IF the lobby poll reports `status` equal to `in-progress` and `roomId` is absent from the payload, THEN THE Lobby_Screen SHALL render a link to the game and SHALL perform zero navigations.
6. THE Lobby_Screen SHALL navigate using the Next.js App Router client navigation API rather than assigning to `window.location`.

### Requirement 16: Accessibility

**User Story:** As a player using a keyboard or a screen reader, I want to play the whole game without a pointer, so that the game is usable for me.

#### Acceptance Criteria

1. THE World_Map SHALL expose each City_Marker as a focusable element reachable in Location-name order by sequential keyboard navigation.
2. WHEN a City_Marker has focus and a player presses Enter or Space, THE World_Map SHALL perform the same action as pointer activation of that City_Marker.
3. THE World_Map SHALL assign each City_Marker an accessible name comprising the Location's resolved name, its region's resolved name, and the text "hub" where the Location is a Hub_Location.
4. WHILE a Location is a Legal_Move_Target, THE World_Map SHALL include the text "legal move target" in that City_Marker's accessible description.
5. THE World_Map SHALL assign the SVG root an accessible name and an accessible description that names the Viewer's current Location and the count of Legal_Move_Targets.
6. THE Game_Screen SHALL render a visible focus indicator on every focusable element, with the indicator distinguishable from the element's unfocused treatment.
7. THE Action_Controls SHALL render Error_Message text inside an ARIA live region with `aria-live` set to `assertive`.
8. THE Event_Feed_Panel SHALL render newly added rows inside an ARIA live region with `aria-live` set to `polite`.
9. WHILE Reduced_Motion matches, THE Game_Screen SHALL apply a transition duration of 0 milliseconds to every Player_Token transform transition and every Map_Viewport transform transition.
10. THE Game_Screen SHALL render body text and control labels at a contrast ratio of at least 4.5 to 1 against their background, and City_Marker and route strokes at a contrast ratio of at least 3 to 1 against the landmass fill.
11. WHEN the Capture_Confirmation is rendered, THE Action_Controls SHALL move focus to the Capture_Confirmation and SHALL confine sequential keyboard navigation to the Capture_Confirmation controls while it remains rendered.
12. THE Game_Screen SHALL convey turn ownership, Actions_Remaining, and blockade status through text content and not through colour alone.

### Requirement 17: Graceful Degradation

**User Story:** As a player, I want one broken piece of data to leave the rest of the screen usable, so that a partial failure does not end my game.

#### Acceptance Criteria

1. IF a `Game_Poll_State.players` entry carries a `locationId` that is absent from Map_Data, THEN THE Token_Layer SHALL omit that Player_Token and SHALL render every other Player_Token.
2. IF a poll response omits `privateData`, THEN THE Game_Screen SHALL render the World_Map, Turn_HUD, and Event_Feed_Panel, and SHALL render the Notebook_Panel and Card_Hand in their empty states.
3. IF the Map_Data_Provider has no cached Map_Data, THEN THE Notebook_Panel and Event_Feed_Panel SHALL render raw identifiers in place of resolved names.
4. WHEN a poll response arrives after the Game_Screen has unmounted, THE Game_Screen SHALL perform zero state updates.
5. THE Game_Screen SHALL render the World_Map, Turn_HUD, Notebook_Panel, Event_Feed_Panel, and Card_Hand such that a rendering failure in one of them leaves the others rendered.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

These are candidate properties recorded during requirements gathering. The design phase will run the prework analysis and produce the authoritative property set; this section states the intent so that requirements and design stay aligned.

### Property 1: Projection determinism

*For any* Location_Coordinate, two calls to Map_Projection with that coordinate return identical points.

**Validates: Requirements 4.2, 4.4**

### Property 2: Projection bounds

*For any* Location_Coordinate whose latitude lies within [-90, 90] and whose longitude lies within [-180, 180], Map_Projection returns a point whose x lies within [0, 1000] and whose y lies within [0, 500].

**Validates: Requirements 4.1, 4.3**

### Property 3: Projection monotonicity

*For any* pair of Location_Coordinates, a greater longitude yields a greater or equal x, and a greater latitude yields a lesser or equal y.

**Validates: Requirements 4.5, 4.6**

### Property 4: Name resolution totality

*For any* Notebook_Entry or Game_Event payload generated from valid Map_Data, every Location id and Region id it references resolves through Name_Lookup to a non-empty string that is not an identifier.

**Validates: Requirements 3.4, 12.3, 12.4, 12.5, 12.6, 13.4**

### Property 5: Legal move set equals filtered adjacency

*For any* Viewer Location, Map_Data adjacency set, and set of Active_Blockades, the Legal_Move_Target set equals the set of Locations reachable by one edge whose Transport_Type is unblocked for the Viewer, excluding `plane` edges where the Viewer's Location is not a Hub_Location.

**Validates: Requirements 9.1, 9.7, 9.8**

### Property 6: Notebook row count and isolation

*For any* `privateData.notebook` array, the Notebook_Panel renders exactly one row per entry, and *for any* Game_Poll_State the rendered output contains no clue value that is absent from `privateData`.

**Validates: Requirements 12.1, 12.13**

### Property 7: Event feed type totality

*For any* Game_Event_Type value and any payload for that type, the Event_Feed_Panel renders a row that does not contain the text "Unrecognised event".

**Validates: Requirements 13.3, 13.4, 13.5**

### Property 8: Card hand identifier totality

*For any* Card_Identifier value, the Card_Hand renders a display name and description that do not contain the text "Unrecognised card", and *for any* string outside that set the Card_Hand renders the fallback treatment without throwing.

**Validates: Requirements 14.2, 14.4**

### Property 9: Token offsets are distinct within a cluster

*For any* set of players sharing one `locationId`, the Token_Offsets assigned to those players are pairwise distinct and pairwise separated by at least 6 Map_ViewBox user units.

**Validates: Requirements 8.4, 8.5**

### Property 10: Action controls disabled exactly when illegal

*For any* Game_Poll_State, the Skip control, Capture Attempt control, and every Card_Hand card control are disabled if and only if Viewer_Turn does not hold, or Actions_Remaining equals 0, or an Action_Submission is in flight.

**Validates: Requirements 10.2, 10.3, 10.4, 10.5**

### Property 11: Error code mapping totality

*For any* Turn_Action_Error_Code, the Action_Client returns a non-empty Error_Message of at most 120 characters, and *for any* unrecognized code it returns the `UNKNOWN` Error_Message.

**Validates: Requirements 10.10, 10.11**

### Property 12: Target picker excludes the viewer

*For any* Game_Poll_State and any card whose Target_Requirement is `player`, the Target_Picker options are exactly the players whose `playerId` differs from `viewerPlayerId`.

**Validates: Requirements 14.6, 14.9**

### Property 13: Route style is a function of transport type

*For any* Adjacency edge, the rendered Route_Style is determined solely by the edge's Transport_Type.

**Validates: Requirements 6.2, 6.3, 6.4**

### Property 14: Single map fetch

*For any* number of concurrent Map_Data requests within one browser session, the Map_Data_Provider issues exactly one `GET /api/map` request.

**Validates: Requirements 3.1, 3.2, 3.3**

## Recorded Decisions

**D-1 — Coordinates live in the database.** `latitude` and `longitude` become non-nullable `Float` columns on `Location`, seeded in `prisma/seed.ts` and returned by `/api/map`. Rationale: the documentation steering rule forbids stating the same fact twice, and a frontend constants file would duplicate the 40-city list that the seed already owns. `/api/map` is already cached `public, max-age=86400, immutable`, so the client pays for the coordinates once. Rejected alternative: a `lib/map/coordinates.ts` constants file — cheaper to write, but it creates a second city list that will drift from the seed.

**D-2 — Stylized hand-authored landmasses.** Continents are SVG `path` elements written by hand in TypeScript at low vertex counts. Rationale: zero dependencies, small bundle, and a coherent art direction that reads as a spy-thriller board rather than an atlas. Rejected alternative: `world-atlas` TopoJSON plus `d3-geo` for real coastlines — accurate, but it adds two runtime dependencies, two ARCHITECTURE.md tech-stack rows, and a projection abstraction the game does not otherwise need.

**D-3 — Equirectangular projection.** Longitude maps linearly to x, latitude linearly to y, into a 1000 by 500 viewBox. Rationale: the arithmetic is two multiplications, the viewBox is a clean 2:1 rectangle, and bounds checking is trivial to state as a property. Mercator was considered and rejected: it distorts high latitudes and none of the 40 cities is polar, so the extra `log`/`tan` math buys nothing. The stylized landmasses are authored against this projection, so changing it later means re-authoring the paths.

**D-4 — Zoom and pan are both in MVP scope.** Requirement 7 specifies zoom controls, pointer drag pan, and keyboard arrow pan, all gated to Zoom_Level greater than 1. Rationale: Europe and Asia hold 16 of the 40 cities and are geographically tight; zoom without pan would let a player magnify a region and then be unable to reach the parts of it that scrolled out of the viewBox. Both are implemented as a single SVG transform on one group, so pan costs little beyond zoom.

**D-5 — Compact layout uses tabs.** Below 1024 CSS pixels the four panels collapse into a tab control above the map. Rationale: tabs are a single focusable widget with well-understood ARIA semantics and no gesture handling, whereas a bottom sheet needs drag physics and an accordion lets panels push the map off-screen. Panel scroll position is retained across tab switches so that switching away from the event feed and back does not lose the reader's place.

**D-6 — Move has both a map affordance and a list affordance.** Requirement 9.6 mandates a list of Legal_Move_Targets alongside clickable City_Markers. Rationale: the list gives keyboard and screen-reader users a linear path to the same action, names the Transport_Type explicitly, and stays usable on a phone where markers are small.

**D-7 — Card and error copy live in the UI layer.** Card display names, card descriptions, event sentences, and Error_Message strings are UI presentation, defined in the client modules that render them, keyed off the identifiers and codes the server sends. Rationale: the server owns identifiers and codes; the client owns wording. This keeps the API payloads free of presentation strings.

**D-8 — Re-poll after action, no optimistic mutation.** A successful Action_Submission triggers an immediate poll rather than a local prediction of the new turn state. Rationale: an action can cascade — end-of-turn resolution, spy resolution, blockade lifecycle, extra turns, round-end clue resolution, draw detection — and reproducing that cascade on the client would duplicate the turn engine and drift from it. The 3-second poll interval plus an immediate post-action poll keeps the perceived latency to the round trip.

**D-9 — No new dependencies.** Verified against `package.json`: `fast-check@4.9.0`, `vitest@4`, `@testing-library/react@16`, `@testing-library/jest-dom@7`, and `jsdom@29` are already installed, so the property and component tests this spec calls for need no additions. Animation uses CSS transitions, icons are inline SVG components, and the projection is hand-written arithmetic. No ARCHITECTURE.md tech-stack row is required by this spec.

**D-10 — `LobbyState` gains `roomId`.** Verified in `lib/lobby/types.ts`: `LobbyState` exposes `roomCode` but no `roomId`, while `/game/[roomId]` and `getGamePollState` both require `Room.id`. `lib/lobby/poll-state.ts` already holds `room.id` in scope. Adding the field to the interface and the return object is the minimal fix and is in scope here. Rejected alternative: resolving code to id through a new API call from the lobby — an extra round trip for data the poll already has.

**D-11 — Action Cards dependency is satisfied.** `lib/turn-engine/cards/types.ts` (defining the ten `CardIdentifier` values, `CardCategory`, and `TargetRequirement`) and `lib/turn-engine/cards/registry.ts` are present, so `query-turn-state.ts` compiles and the poll payload carries real card metadata. The Card_Hand is still required to handle an unrecognized identifier (Requirement 14.4) because identifiers arrive as runtime JSON and the pool may grow.

## Known Limitations

**L-1 — The map cannot show Spies.** `GamePollState` contains no `GameSpy` data at all, by design: spy locations are hidden until captured. The World_Map therefore renders no spy markers, and the only public trace of a spy is a `spy-captured-reward-collected` event, which carries a `regionId` and so reveals the region but not the location. The Notebook's `spy-proximity` entries remain the Viewer's private channel for spy information. Adding spy markers would require the poll payload to expose captured-spy locations — out of scope here.

**L-2 — Route rendering may crowd at Zoom_Level 1.** With 40 cities and 72 edges in a 1000 by 500 viewBox, dense regions will overlap at the default zoom. Requirements 5.9 and 5.10 mitigate the label case by showing only hub and viewer labels until the player zooms in. Edge crowding is accepted for MVP.

**L-3 — Relative timestamps do not self-refresh.** Requirement 13.7 derives relative times from `createdAt` on render. Rows re-render on each 3-second poll while the game is active, so displayed times stay within one poll interval of accurate without a dedicated timer.

## Open Questions

**O-1 — Landmass fidelity.** Requirement 5.2 mandates stylized hand-authored paths and Decision D-2 sets the direction, but the vertex budget per continent is not fixed. Design should settle on a target so the six landmass paths look like one set rather than six independent efforts.

**O-2 — Region hue palette.** Requirement 5.7 requires six distinct hues and Requirement 16.10 sets contrast floors. The specific palette is a design-phase choice; it needs to survive the dark `bg-gray-900` background and remain distinguishable for common colour-vision deficiencies, which is why Requirement 16.12 forbids colour as the sole carrier of state.

**O-3 — Token shape vocabulary.** Requirement 8.3 requires the Viewer's token to be distinguishable from rivals', and Requirement 8.4 requires cluster separation. Whether rival tokens differ from each other by hue, by shape, or by an initial glyph is open.

**O-4 — Event feed retention.** `useGamePoll` merges events indefinitely, so a long game accumulates an unbounded array. Whether the Event_Feed_Panel caps rendered rows, virtualises, or renders all of them is deferred to design. At the 20-round default round limit the volume is small enough that rendering all rows is likely fine.

**O-5 — Capture confirmation copy.** Requirement 10.6 requires the confirmation to name the Viewer's current Location. Whether it also warns that a failed attempt consumes the action and cannot be repeated at the same Location that turn (`DUPLICATE_CAPTURE_ATTEMPT`) is a copy decision for design.
