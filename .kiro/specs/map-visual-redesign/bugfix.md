# Bugfix Requirements Document

## Introduction

The Shadow Hunt world map currently renders continent regions as small, abstract colored polygons that bear no visual resemblance to actual continent shapes. Players cannot recognize geographic context, making it difficult to understand city positions, plan routes, or feel immersed in a global espionage board game. This is a visual presentation defect — the underlying map data, city connections, movement logic, and game mechanics are all correct and must remain unchanged.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the world map renders continent silhouettes THEN the system displays small abstract polygons (10–15 point SVG paths) that do not resemble recognizable continent shapes

1.2 WHEN a player views the map THEN the system fails to communicate that cities are positioned at real-world geographic locations because the continent shapes provide no geographic reference frame

1.3 WHEN continent regions are rendered THEN the system displays them at incorrect relative scales — all six continents appear roughly the same small size regardless of actual geographic extent

1.4 WHEN city markers are rendered over the continent shapes THEN the system places cities at correct projected coordinates but the mismatch with undersized/misshapen continent paths makes city positions appear disconnected from any landmass

1.5 WHEN route connections are drawn between cities THEN the system renders them as thin undifferentiated lines without clear visual hierarchy, making the map look like a network diagram rather than a board game map

1.6 WHEN the map is viewed on different screen sizes THEN the system displays all elements at a fixed visual density without adapting node/label legibility for smaller viewports

1.7 WHEN city markers are rendered THEN the system fails to display them as distinguishable individual markers — nodes are either invisible, too small, or visually blended into the continent shapes so they cannot be identified

1.8 WHEN the map is displayed THEN the system does not render any city name labels on or near the map nodes, leaving the player unable to identify which city is which from the map alone

1.9 WHEN route connections between cities exist in the data THEN the system fails to render visible lines or arcs on the map, so the player cannot see how cities are connected

1.10 WHEN the player token is rendered at the current location THEN the system displays it floating in empty dark space rather than clearly anchored to a recognizable, named city node

1.11 WHEN a player needs to choose a movement destination THEN the map provides no geographic or visual context for those choices — the player must rely entirely on the text-based "Move to" list below the map rather than being able to identify options spatially on the map

1.12 WHEN multiple players are in a game THEN the system fails to clearly display ALL players' positions on the map — the user cannot see where other players are located

### Expected Behavior (Correct)

2.1 WHEN the world map renders continent silhouettes THEN the system SHALL display recognizable, stylized continent shapes (Europe, Asia, Africa, North America, South America, Oceania) that span their appropriate geographic extent within the 1000×500 viewBox

2.2 WHEN a player views the map THEN the system SHALL provide immediate geographic context so that city positions clearly correspond to real-world locations (e.g., London in northwest Europe, Tokyo in east Asia, Cairo in northeast Africa)

2.3 WHEN continent regions are rendered THEN the system SHALL display them at proportionally correct relative sizes and positions matching an equirectangular world map layout

2.4 WHEN city markers are rendered THEN the system SHALL display each city as a clearly visible node positioned within its corresponding continent shape, with hub cities visually distinguished from non-hub cities, and the current player's location highlighted with a glow or accent effect

2.5 WHEN route connections are drawn between cities THEN the system SHALL render them as subtle but visible lines with visually distinguishable styles per transport type: solid lines for car routes, dashed lines for boat routes, and curved arcs for plane routes

2.6 WHEN the map is viewed on different screen sizes THEN the system SHALL remain legible and usable, with the SVG scaling responsively and city nodes remaining identifiable at common desktop and laptop resolutions

2.7 WHEN a player views reachable destinations during their move turn THEN the system SHALL highlight legal move targets with a visible interactive indicator (glow, ring, or color change) distinguishing them from non-reachable cities

2.8 WHEN the map is displayed THEN the system SHALL maintain the existing dark theme aesthetic (dark background, muted continent fills, subtle glowing nodes) consistent with a modern strategy board game visual style

2.9 WHEN city markers are rendered THEN the system SHALL display each city as a clearly visible circular marker (minimum ~6px radius at default zoom) that stands out against the continent background with sufficient contrast

2.10 WHEN the map is displayed THEN the system SHALL render city name labels near each node — at minimum for hub cities at all zoom levels, and optionally for non-hub cities on hover or at higher zoom levels

2.11 WHEN route connections exist between cities THEN the system SHALL render them as visible lines or arcs so the player can visually trace paths between connected cities on the map

2.12 WHEN the current player's position is displayed THEN the system SHALL clearly anchor the player token to a named, labeled city node — the token must appear visually "at" a recognizable location, not floating in ambiguous empty space

2.13 WHEN a player needs to choose a movement destination THEN the system SHALL provide enough visual context on the map (visible nodes, labels, highlighted reachable targets) that the player can identify their movement options spatially on the map without needing to rely solely on the text-based list

2.14 WHEN multiple players are in a game THEN the system SHALL clearly display ALL players' current positions on the map as distinctly colored/shaped tokens anchored to their respective city nodes, so every player can see where all opponents are located at a glance

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a player clicks a legal move destination THEN the system SHALL CONTINUE TO trigger the existing move selection callback without any change to movement validation or game logic

3.2 WHEN the map data (regions, locations, adjacency) is loaded THEN the system SHALL CONTINUE TO use the existing `MapData` type, `projectToMap()` projection function, and data-fetching pipeline without modification

3.3 WHEN routes are rendered THEN the system SHALL CONTINUE TO use the existing adjacency list data structure and transport type classification (car, boat, plane) from `lib/map/types.ts`

3.4 WHEN player tokens are displayed THEN the system SHALL CONTINUE TO show all players at their current locations using the existing `PlayerTokens` component behavior and data flow

3.5 WHEN zoom and pan interactions are performed THEN the system SHALL CONTINUE TO use the existing `MapViewport` component providing wheel-zoom, pointer-drag pan, and keyboard shortcuts

3.6 WHEN blocked transport routes are displayed THEN the system SHALL CONTINUE TO apply the existing opacity reduction for blockaded route types without changing blockade logic

3.7 WHEN the game engine calculates shortest paths, validates moves, or resolves turn actions THEN the system SHALL CONTINUE TO operate identically — no game-logic code in `lib/map/`, `lib/turn-engine/`, or `lib/game/` is modified

3.8 WHEN action cards, the notebook panel, the event feed, or the turn HUD are displayed THEN the system SHALL CONTINUE TO function identically — this fix is scoped to the map visual layer only

---

## Bug Condition (Structured Pseudocode)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type MapRenderInput (continent path data, viewBox dimensions)
  OUTPUT: boolean

  // The bug triggers when continent silhouette paths are abstract polygons
  // rather than geographically recognizable shapes
  RETURN X.continentPaths ARE simplified abstract polygons
    AND X.continentPaths DO NOT visually resemble real-world continent shapes
    AND X.continentPaths ARE undersized relative to the viewBox geographic extent
END FUNCTION
```

```pascal
// Property: Fix Checking — Continent shapes are recognizable
FOR ALL X WHERE isBugCondition(X) DO
  result ← renderWorldMap'(X)
  ASSERT result.continentPaths visually resemble real-world continent silhouettes
    AND result.continentPaths span appropriate geographic extent in viewBox
    AND result.cityNodes are positioned within their respective continent shapes
    AND result.visualStyle matches dark strategy board game aesthetic
END FOR
```

```pascal
// Property: Preservation Checking — Game logic unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT renderWorldMap(X).gameLogicBehavior = renderWorldMap'(X).gameLogicBehavior
    AND renderWorldMap(X).moveValidation = renderWorldMap'(X).moveValidation
    AND renderWorldMap(X).dataFlow = renderWorldMap'(X).dataFlow
END FOR
```
