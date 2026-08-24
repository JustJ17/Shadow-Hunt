# Map Visual Redesign Bugfix Design

## Overview

The world map currently renders continent regions as small abstract polygons (~10–15 point SVG paths) that bear no resemblance to real-world continents. City nodes are tiny and indistinguishable, labels are absent, route lines are thin and undifferentiated, and player tokens float in dark empty space. This fix replaces the visual presentation layer — `CONTINENT_PATHS` data, city marker styling, route line styling, label rendering, and player token anchoring — without touching any game logic, data flow, or movement validation.

The fix is scoped exclusively to:
- `app/game/[roomId]/components/world-map.tsx` (continent path data + SVG defs)
- `app/game/[roomId]/components/city-markers.tsx` (marker sizing, glow effects, labels)
- `app/game/[roomId]/components/route-layer.tsx` (line weight, styling, differentiation)
- `app/game/[roomId]/components/player-tokens.tsx` (token anchoring, color palette, name tooltip)

No changes to: `lib/map/types.ts`, `lib/map/projection.ts`, `map-viewport.tsx` (behavior), game-logic code, data-fetching, or API routes.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the visual defect — continent silhouette paths are abstract polygons that don't resemble real-world continents, city nodes are invisible/indistinguishable, labels are missing, and routes are invisible or undifferentiated.
- **Property (P)**: The desired visual behavior — recognizable stylized continent shapes at correct relative scale, clearly visible labeled city nodes, styled route connections, and properly anchored player tokens.
- **Preservation**: Existing interactive behaviors, game logic, data flow, MapViewport zoom/pan mechanics, move-selection callbacks, and PlayerTokens data flow that must remain unchanged.
- **CONTINENT_PATHS**: The constant array in `world-map.tsx` defining decorative SVG path data for each continent silhouette. Currently contains small abstract polygons.
- **projectToMap()**: The equirectangular projection function in `lib/map/projection.ts` mapping `(latitude, longitude)` → `{x, y}` in the 1000×500 viewBox. NOT modified.
- **MapData**: The type from `lib/map/types.ts` containing `RegionWithLocations[]` and `AdjacencyListEntry[]`. NOT modified.

## Bug Details

### Bug Condition

The bug manifests when the world map renders and the visual output fails to provide geographic context, legible city nodes, route visibility, or proper player token anchoring. The `CONTINENT_PATHS` array contains small abstract polygons instead of recognizable continent silhouettes. The `CityMarkers` component renders nodes at 4–8px radius with no glow and no labels. The `RouteLayer` renders 1px-wide lines with minimal contrast. The `PlayerTokens` component lacks a visible link between the token and its location identity.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type MapRenderOutput (rendered SVG state)
  OUTPUT: boolean

  RETURN (
    input.continentPaths ARE abstract polygons NOT resembling real-world shapes
    OR input.continentPaths ARE undersized relative to their geographic extent
    OR input.cityNodes ARE invisible or indistinguishable (radius < 5px effective)
    OR input.cityLabels ARE absent (no text elements for city names)
    OR input.routeLines ARE invisible or visually undifferentiated (strokeWidth < 1.5)
    OR input.playerTokens ARE NOT visually anchored to a named city node
    OR input.reachableDestinations ARE NOT highlighted during viewer's turn
    OR input.allPlayers ARE NOT all visible as distinct colored tokens
  )
END FUNCTION
```

### Examples

- **Continent shape**: Current Europe path is a 10-point polygon spanning ~90×80 viewBox units. Expected: a recognizable Europe silhouette spanning ~150×130 units at correct geographic position.
- **City visibility**: Current non-hub marker is `r=4/zoom` with region fill at 30% opacity — nearly invisible against the dark background. Expected: `r=5/zoom` minimum with a subtle radial glow and solid stroke.
- **Labels**: Currently zero `<text>` elements on the map. Expected: hub cities always show name labels; non-hub cities show labels on hover or when zoomed.
- **Routes**: Current car route is a 1px gray line (`stroke-gray-500`). Expected: 1.5px solid line with `stroke-gray-400` and slight opacity increase.
- **Player token anchoring**: Current token is a colored circle floating at projected coordinates with no visual link to the city name. Expected: token sits on top of a clearly labeled, glowing city node.
- **Multiple players**: Current implementation renders all player tokens but they can overlap and lack name indicators. Expected: clear distinct colors with tooltip/title showing player names.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Mouse/keyboard clicks on legal-move city markers continue to trigger `onMoveSelect` callback with the correct `locationId`
- `MapViewport` wheel-zoom, pointer-drag pan, keyboard shortcuts (+/-/arrows), and imperative `zoomIn`/`zoomOut`/`reset` methods operate identically
- `PlayerTokens` component continues to receive `players`, `viewerPlayerId`, `locations` props and renders one token per player at their current location using `projectToMap()`
- Cluster offset logic for co-located players remains unchanged
- CSS transition animation for token movement between locations remains unchanged
- Reduced-motion media query behavior remains unchanged
- `RouteLayer` deduplication logic (sorted-id-pair Set) remains unchanged
- Bezier control point calculation for plane routes remains unchanged
- Blocked-transport opacity reduction (`opacity-30`) remains unchanged
- The `1000×500` SVG viewBox, equirectangular projection, `MapData` type, and `AdjacencyListEntry` structure remain unchanged
- All game-logic code in `lib/map/`, `lib/turn-engine/`, `lib/game/` remains unmodified
- Action cards, notebook panel, event feed, and turn HUD remain unaffected

**Scope:**
All inputs that do NOT involve visual rendering of continent shapes, city markers, route lines, labels, or player token presentation are completely unaffected. This includes:
- Movement validation logic
- Turn resolution and game state transitions
- Data fetching and polling
- Zoom/pan interaction mechanics (behavioral, not visual)
- Accessibility roles and ARIA attributes (maintained or improved, never removed)

## Hypothesized Root Cause

The visual defects stem from the initial implementation using placeholder/proof-of-concept art assets that were never upgraded to production-quality visuals:

1. **Undersized Abstract Continent Paths**: The `CONTINENT_PATHS` array in `world-map.tsx` contains hand-typed 10–15 point polygons that were meant as placeholders. They don't approximate real continent coastlines and are far too small relative to the viewBox (Europe spans only ~90×80 units in a 1000×500 viewBox).

2. **Insufficient City Marker Sizing and Contrast**: `CityMarkers` uses `r=4/zoom` for non-hubs with region fill at 30% opacity (`fill-blue-800/30`), providing almost no contrast against the `bg-gray-900` background. No glow/shadow effect makes nodes pop.

3. **Missing Label Rendering**: `CityMarkers` renders zero `<text>` elements — city names are only communicated through `aria-label` attributes, invisible to sighted users.

4. **Thin Undifferentiated Route Lines**: `RouteLayer` uses `strokeWidth={1}` for all transport types with only color differentiation (`gray-500`, `blue-400`, `amber-400`). At 1px, these are barely visible on high-DPI displays.

5. **No Visual Anchoring for Player Tokens**: `PlayerTokens` correctly places tokens at projected coordinates but the underlying city node is too small and unlabeled, so the token appears to float in empty space.

6. **No Reachable-Destination Visual Emphasis**: `CityMarkers` does have an emerald highlight ring for legal moves, but the ring is drawn around a nearly invisible node — the combination fails to communicate reachability clearly.

## Correctness Properties

Property 1: Bug Condition - Continent Shapes Are Recognizable and Correctly Scaled

_For any_ map render where the continent silhouette paths are displayed, the fixed `CONTINENT_PATHS` data SHALL produce SVG paths that span their appropriate geographic extent within the 1000×500 viewBox, are positioned at correct equirectangular coordinates, and contain sufficient path complexity (40+ points per continent minimum) to be recognizable as stylized versions of their real-world shapes.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Bug Condition - City Nodes Are Visible and Labeled

_For any_ city location rendered on the map, the fixed `CityMarkers` component SHALL display each city as a clearly visible circular marker (minimum 5px effective radius) with sufficient contrast against the dark background, a subtle glow effect, and a text label (always visible for hubs; visible on hover or zoom > 1.5 for non-hubs).

**Validates: Requirements 2.4, 2.9, 2.10, 2.12**

Property 3: Bug Condition - Routes Are Visible and Differentiated

_For any_ route connection rendered between cities, the fixed `RouteLayer` SHALL display it with minimum 1.5px stroke width and visually distinct styling per transport type: solid for car, dashed for boat, curved arc for plane — all clearly visible against the dark background.

**Validates: Requirements 2.5, 2.11**

Property 4: Bug Condition - Player Tokens Are Anchored and Distinctly Colored

_For any_ player in the game, the fixed `PlayerTokens` component SHALL render a distinctly colored token clearly anchored to the player's current city node (visually "on top of" the labeled node), with all players simultaneously visible and identifiable.

**Validates: Requirements 2.12, 2.14**

Property 5: Bug Condition - Reachable Destinations Are Highlighted

_For any_ legal move destination during the viewer's turn, the fixed `CityMarkers` SHALL display a prominent interactive indicator (pulsing glow ring, color change, or animated highlight) that clearly distinguishes reachable cities from non-reachable ones.

**Validates: Requirements 2.7, 2.13**

Property 6: Preservation - Interactive Behavior Unchanged

_For any_ user interaction (click on legal move, zoom/pan gesture, keyboard shortcut, drag) the fixed components SHALL produce exactly the same callback invocations, state transitions, and event handling as the original components — no game logic, movement validation, or data flow is altered.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `app/game/[roomId]/components/world-map.tsx`

**Changes**:
1. **Replace CONTINENT_PATHS data**: Replace the 6 abstract polygons with detailed stylized continent silhouettes (60–120 path points each) that span their correct geographic extent in the 1000×500 viewBox using equirectangular positioning. Each path should approximate recognizable coastline outlines.
2. **Add SVG `<defs>` for shared effects**: Add filter definitions for city node glow (`<filter id="city-glow">`), player token shadow, and optionally a subtle continent fill gradient. Add a CSS keyframe for the reachable-destination pulse animation.
3. **Maintain existing component composition order**: Keep the render order (continents → routes → markers → tokens) and all prop passing unchanged.

**File**: `app/game/[roomId]/components/city-markers.tsx`

**Changes**:
1. **Increase marker radii**: Hub cities: `r=8/zoom` → `r=9/zoom`. Non-hub cities: `r=4/zoom` → `r=5/zoom`. This ensures minimum ~5px visibility at default zoom.
2. **Add solid fill with glow**: Replace the region 30%-opacity fill with a solid fill for the inner dot (e.g., `fill-blue-400` for Europe hubs) and apply `filter="url(#city-glow)"` for a subtle radial glow effect.
3. **Render city name labels**: Add a `<text>` element below/beside each marker:
   - Hub cities: always visible, `fontSize={10/zoom}`, white fill with slight shadow
   - Non-hub cities: visible when `zoom > 1.5` or on hover (using CSS `:hover` on the `<g>` parent to toggle `<text>` opacity)
4. **Enhance legal-move highlight**: Replace the simple emerald ring with an animated pulsing glow ring using a CSS animation class. Increase highlight ring radius and stroke width for better visibility.
5. **Maintain all existing interaction logic**: `onClick`, `onKeyDown`, `handleActivate`, `role="button"`, `aria-label`, `tabIndex` — all preserved exactly.

**File**: `app/game/[roomId]/components/route-layer.tsx`

**Changes**:
1. **Increase stroke widths**: Car routes: `1` → `1.5`. Boat routes: `1` → `1.5`. Plane routes: `1` → `1.5`.
2. **Improve contrast/colors**: Car: `stroke-gray-500` → `stroke-gray-400`. Boat: keep `stroke-blue-400`, add `strokeLinecap="round"`. Plane: keep `stroke-amber-400`, add `strokeLinecap="round"`.
3. **Add stroke dash refinement for boat**: Adjust `strokeDasharray` from `"6 4"` to `"8 5"` for better readability.
4. **Add route-type ARIA**: Add `<title>` elements for non-blocked routes indicating transport type (accessibility improvement).
5. **Preserve all existing logic**: Deduplication, bezier calculation, blocked opacity, all unchanged.

**File**: `app/game/[roomId]/components/player-tokens.tsx`

**Changes**:
1. **Increase token size slightly**: `r={6/zoom}` → `r={7/zoom}` for better visibility against enhanced city nodes.
2. **Add name tooltip**: Add `<title>{player.displayName}</title>` inside each token's `<g>` for hover identification.
3. **Enhance viewer highlight**: Viewer ring `r={9/zoom}` → `r={11/zoom}`, add a subtle pulsing glow via CSS animation class.
4. **Improve color palette contrast**: Adjust `PLAYER_COLORS` for better contrast against the dark map:
   - `fill-blue-500` → `fill-cyan-400`
   - `fill-red-500` → `fill-rose-400`
   - `fill-green-500` → `fill-emerald-400`
   - `fill-yellow-500` → `fill-amber-300`
5. **Preserve all existing logic**: Cluster offsets, CSS transitions, reduced-motion, coordinate projection — all unchanged.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the visual defects on unfixed code, then verify the fix produces correct visual output and preserves all interactive behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the visual defects BEFORE implementing the fix. Confirm that the root cause is purely in the SVG path data and component styling.

**Test Plan**: Write snapshot/render tests that inspect the rendered SVG output for path complexity, marker sizing, label presence, and route stroke widths. Run on UNFIXED code to observe failures.

**Test Cases**:
1. **Continent Path Complexity Test**: Assert each continent path in `CONTINENT_PATHS` has >40 path points (will fail — current paths have 10–15 points)
2. **Continent Bounding Box Test**: Assert each continent path's bounding box spans at least its expected proportional area of the viewBox (will fail — current paths are undersized)
3. **City Label Presence Test**: Render `CityMarkers` and assert `<text>` elements exist for hub cities (will fail — no text elements rendered)
4. **Route Stroke Width Test**: Render `RouteLayer` and assert all routes have `strokeWidth >= 1.5` (will fail — current width is 1)
5. **City Node Minimum Radius Test**: Assert non-hub markers have `r >= 5/zoom` (will fail — current is `4/zoom`)

**Expected Counterexamples**:
- Continent paths contain 10–15 points and span < 100 viewBox units
- Zero `<text>` elements in CityMarkers output
- All route strokeWidth values equal 1
- Non-hub radius equals 4/zoom

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed components produce the expected visual output.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := renderWorldMap_fixed(input)
  ASSERT result.continentPaths each have > 40 path points
  ASSERT result.continentPaths each span expected geographic extent
  ASSERT result.cityNodes each have r >= 5/zoom
  ASSERT result.hubCityLabels are rendered as <text> elements
  ASSERT result.routeLines each have strokeWidth >= 1.5
  ASSERT result.playerTokens each are rendered with distinct fill color
  ASSERT result.legalMoveHighlights have animated glow class
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold (interactive behaviors), the fixed components produce identical behavior to the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT WorldMap_fixed(input).onMoveSelect callbacks = WorldMap_original(input).onMoveSelect callbacks
  ASSERT WorldMap_fixed(input).viewportBehavior = WorldMap_original(input).viewportBehavior
  ASSERT WorldMap_fixed(input).ariaAttributes ⊇ WorldMap_original(input).ariaAttributes
  ASSERT WorldMap_fixed(input).playerTokenPositions = WorldMap_original(input).playerTokenPositions
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many random game states (different player positions, different legal move sets) and verifies the interactive behavior is unchanged
- It catches edge cases like co-located players, empty legal-move sets, and boundary locations
- It provides strong guarantees that no behavioral regression was introduced

**Test Plan**: Observe interactive behavior on UNFIXED code (click callbacks, keyboard events, zoom/pan) then write tests asserting the same behavior after fix.

**Test Cases**:
1. **Move Selection Callback Preservation**: For random game states, click on legal-move markers and verify `onMoveSelect` fires with correct `locationId` — unchanged before/after fix
2. **Viewport Interaction Preservation**: Verify zoom/pan state transitions produce identical transform values before/after fix
3. **Accessibility Attribute Preservation**: Verify all existing `role`, `aria-label`, `aria-disabled`, `tabIndex` attributes are preserved or improved (never removed)
4. **Cluster Offset Preservation**: For random player configurations with co-located players, verify token offset positions are identical before/after fix

### Unit Tests

- Test that each `CONTINENT_PATHS` entry has valid SVG path syntax and sufficient complexity
- Test that `CityMarkers` renders `<text>` elements for all hub locations
- Test that `CityMarkers` renders non-hub labels only when zoom > 1.5 threshold
- Test that `RouteLayer` applies correct stroke styles per transport type (solid/dashed/curved)
- Test that `PlayerTokens` renders distinct fill colors for each player position
- Test that legal-move highlight includes animation class name

### Property-Based Tests

- Generate random `MapData` configurations and verify all city nodes render with r >= 5/zoom
- Generate random player position arrays and verify all tokens render with distinct colors and correct clustering
- Generate random legal-move sets and verify highlight ring renders for exactly the legal-move IDs
- Generate random interaction events and verify callback behavior is identical pre/post fix

### Integration Tests

- Render full `WorldMap` with realistic game state and verify complete SVG output includes continents, routes, markers, labels, and tokens in correct order
- Render `WorldMap` at different zoom levels and verify label visibility toggling (hubs always, non-hubs at zoom > 1.5)
- Simulate move selection flow: render with legal moves, click a highlighted marker, verify callback fires with correct location ID
- Verify dark-theme aesthetic: background is `bg-gray-900`, continent fills use muted colors, nodes have glow effects
