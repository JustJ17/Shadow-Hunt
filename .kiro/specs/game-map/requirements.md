# Requirements: Game Map

## Introduction

The Game Map is the interactive SVG world map for Shadow Hunt's in-game screen. It renders the world, routes between cities, city markers, and animated player tokens. The map is the visual board on which all gameplay takes place — players observe positions, plan routes, and (in a future spec) select move targets by interacting with it.

This spec covers the visual rendering layer only. It adds coordinate data to the schema, implements map projection, provides a client-side map data hook, renders the SVG map with continent shapes and region tinting, draws routes per transport type, places city markers and player tokens, and provides zoom/pan interaction.

**Zero new npm dependencies.** All visuals are inline SVG authored in TypeScript/JSX plus Tailwind CSS and CSS transitions. No raster images, no external map tiles, no icon fonts.

**Server-authoritative data.** The map fetches static data from `GET /api/map` and renders player positions from the existing `useGamePoll` hook. It does not compute game logic.

Explicitly out of scope: action submission / move selection interactivity (game-wiring spec), Notebook/Event Feed/Card Hand panels (game-panels spec), layout shell / responsive tabs (game-panels spec), lobby navigation (game-wiring spec).

## Glossary

- **Map_ViewBox**: The SVG `viewBox` of the World Map: `0 0 1000 500` (1000 user units wide, 500 tall).
- **Location_Coordinate**: A `{ latitude, longitude }` pair in decimal degrees on a Location record.
- **Map_Projection**: The pure function converting Location_Coordinate to a `{ x, y }` point in Map_ViewBox coordinates via equirectangular projection.
- **Hub_Location**: A Location whose `isHub` is `true`. There are 6, one per region.
- **Non_Hub_Location**: A Location whose `isHub` is `false`. There are 34.
- **Transport_Type**: One of `car`, `plane`, `boat`.
- **Viewer**: The player identified by `GamePollState.viewerPlayerId`.
- **Viewer_Blocked_Transports**: The set of Transport_Type values for which `activeBlockades` contains an entry whose `casterPlayerId` differs from the Viewer's player id.
- **Token_Cluster**: The set of Player Tokens whose players share one `locationId`.
- **Token_Offset**: Per-token displacement in Map_ViewBox user units, applied to separate members of a Token_Cluster.
- **Zoom_Level**: A scalar multiplier applied to the World Map contents, clamped to [1, 4].
- **Reduced_Motion**: The state where CSS media query `(prefers-reduced-motion: reduce)` matches.
- **Motion_Duration**: Duration of Player Token position transition: 600ms normally, 0ms when Reduced_Motion matches.

## Requirements

### Requirement 1: Location Coordinates in Schema and Seed

**User Story:** As a developer, I want city coordinates stored in the database and served by the map API, so that the client has one authoritative source for map geometry.

#### Acceptance Criteria

1. THE Prisma schema SHALL define `latitude` and `longitude` as non-nullable `Float` fields on the `Location` model.
2. THE seed script SHALL provide a Location_Coordinate for each of the 40 seeded Locations using real-world latitude/longitude values.
3. THE seed script SHALL set each Location's `latitude` within [-90, 90] and `longitude` within [-180, 180].
4. A Prisma migration SHALL add the `latitude` and `longitude` columns to the `locations` table.
5. THE `MapData` type in `lib/map/types.ts` SHALL include `latitude` and `longitude` on the `Location` interface.
6. THE `getFullMapData()` function SHALL include `latitude` and `longitude` on every entry of `regions[].locations[]`.
7. WHEN the seed script runs against a database that already contains the 40 Locations, it SHALL update the coordinate values on existing rows via idempotent upserts.

### Requirement 2: Map Projection

**User Story:** As a player, I want each city to appear at a stable, sensible position on the map, so that I can build a mental model of the world and reason about distance.

#### Acceptance Criteria

1. THE Map_Projection SHALL convert a Location_Coordinate to a Map_ViewBox point using: `x = (longitude + 180) / 360 * 1000`, `y = (90 - latitude) / 180 * 500`.
2. THE Map_Projection SHALL be a pure function with no side effects and no module-level mutable state.
3. THE Map_Projection SHALL return a point whose x lies within [0, 1000] and whose y lies within [0, 500] for every valid Location_Coordinate.
4. THE Map_Projection SHALL be deterministic: the same input always produces the same output.
5. For two coordinates at the same latitude, the one with smaller longitude SHALL produce a smaller x.
6. For two coordinates at the same longitude, the one with greater latitude SHALL produce a smaller y.
7. THE Map_Projection SHALL ship with a unit test file.

### Requirement 3: Map Data Hook

**User Story:** As a player, I want the map data to load once and stay cached, so that all components can resolve city names and coordinates without repeated network calls.

#### Acceptance Criteria

1. THE hook SHALL fetch `GET /api/map` once per component lifecycle and cache the result.
2. WHILE cached MapData exists, the hook SHALL serve data from cache and issue zero additional requests.
3. WHEN two or more components call the hook before the first response arrives, exactly one `GET /api/map` request SHALL be issued (request deduplication).
4. THE hook SHALL expose: `idToName(locationId)` lookup, `idToCoordinates(locationId)` lookup, `idToRegion(locationId)` lookup, `idToAdjacency(locationId)` lookup.
5. WHEN a lookup receives an id not present in MapData, it SHALL return a safe fallback value (e.g. "Unknown" for name, null for coordinates).
6. IF the `GET /api/map` request fails, the hook SHALL expose an error state and a retry function. Components SHALL render gracefully without map data.

### Requirement 4: SVG World Map Component

**User Story:** As a player, I want a stylized world map that shows all 40 cities grouped by region, so that I can see the game board at a glance.

#### Acceptance Criteria

1. THE World Map SHALL render one inline SVG element with `viewBox="0 0 1000 500"`.
2. THE World Map SHALL render hand-authored stylized continent paths as decorative SVG `path` elements (not geographic-precision).
3. THE World Map SHALL render zero `<image>` elements and reference zero external resources.
4. THE World Map SHALL apply a distinct fill colour to each of the 6 regions for visual grouping (region tinting).
5. THE World Map SHALL apply the dark theme (`bg-gray-900` background) consistent with existing game components.
6. THE World Map SHALL include an accessible name via `role="img"` and `aria-label`.

### Requirement 5: Route Rendering

**User Story:** As a player, I want to distinguish road, sea, and air routes at a glance and see which are blocked, so that I can plan my movement.

#### Acceptance Criteria

1. THE Route Layer SHALL render one visual per unordered pair of connected Locations in MapData adjacency (each edge rendered once, deduplicated).
2. WHERE Transport_Type is `car`, the route SHALL be rendered as a solid stroke straight line.
3. WHERE Transport_Type is `boat`, the route SHALL be rendered as a dashed stroke straight line.
4. WHERE Transport_Type is `plane`, the route SHALL be rendered as a quadratic bezier arc with a control point displaced perpendicular to the straight line between endpoints.
5. `plane` edges SHALL use a stroke colour distinct from `car` and `boat` edges.
6. WHILE a Transport_Type is a member of Viewer_Blocked_Transports, every edge of that type SHALL render with reduced opacity (dimmed) and include "blocked" in its accessible description.
7. Route paths SHALL be `aria-hidden="true"` to avoid assistive technology noise.

### Requirement 6: City Markers

**User Story:** As a player, I want to see each city clearly on the map with hubs standing out, so that I can identify key locations.

#### Acceptance Criteria

1. THE Marker Layer SHALL render one City Marker per Location in MapData.
2. Each City Marker SHALL be positioned at the Map_ViewBox point returned by Map_Projection for that Location's coordinates.
3. Hub_Location markers SHALL be rendered with a larger radius and/or distinct shape from Non_Hub_Location markers.
4. City Markers SHALL inherit their region's fill colour.
5. City Markers SHALL be rendered as click targets (for wiring in a later spec — the click handler is out of scope but the element must be interactive-ready with appropriate cursor and role).
6. THE Marker Layer SHALL render after the Route Layer in document order so markers paint above routes.

### Requirement 7: Player Tokens

**User Story:** As a player, I want to see where every agent is on the map and watch them move between polls, so that I can track my rivals.

#### Acceptance Criteria

1. THE Token Layer SHALL render one Player Token per entry of `GamePollState.players`.
2. Each Player Token SHALL be positioned at the Map_ViewBox point for that player's `locationId`, displaced by Token_Offset.
3. The Viewer's Player Token SHALL have a visually distinct highlighted ring.
4. WHILE two or more players share one `locationId`, each member of the Token_Cluster SHALL receive a Token_Offset that differs from every other member by at least 6 Map_ViewBox user units.
5. Token_Offset SHALL be derived from the player's `turnPosition` so that offset is deterministic across renders.
6. WHEN a poll response reports a new `locationId` for a player, the Token SHALL transition from the old position to the new position using `CSS transition: transform 600ms`.
7. WHILE `prefers-reduced-motion: reduce` matches, Motion_Duration SHALL be 0ms (instant move, no animation).
8. The Token Layer SHALL render after the Marker Layer in document order so tokens paint above markers.
9. Each Player Token SHALL have `aria-label` containing the player's display name (with "(you)" suffix for the Viewer).

### Requirement 8: Zoom and Pan

**User Story:** As a player, I want to zoom into a crowded region and pan around, so that I can read labels and see token positions clearly.

#### Acceptance Criteria

1. Zoom/pan state `{ zoom, panX, panY }` SHALL be applied as an SVG transform on a `<g>` wrapper element.
2. Zoom_Level SHALL be clamped to the interval [1, 4].
3. Mouse wheel on the map SHALL zoom in/out.
4. Pointer drag on the map SHALL pan (when zoomed in).
5. Keyboard `+`/`-` SHALL zoom in/out. Arrow keys SHALL pan.
6. On-screen zoom-in, zoom-out, and reset buttons SHALL be rendered as focusable `<button>` elements with accessible names.
7. Pan SHALL be clamped so the visible area stays within the `0 0 1000 500` viewBox bounds.
8. WHILE Zoom_Level equals 1, pan SHALL be locked at zero.
