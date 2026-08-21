# Implementation Plan: Map & Game Initialization

## Overview

Implement the static map data layer (Regions, Locations, Adjacency) with a Prisma seed script, a precomputed distance matrix, a read-only map API, and the dynamic game initialization logic (Main Threat + Spy NPC placement) integrated into the existing lobby `startGame` transaction.

## Tasks

- [x] 1. Prisma schema additions and migration
  - [x] 1.1 Add Region, Location, Adjacency, GameThreat, and GameSpy models to `prisma/schema.prisma`
    - Add `Region` model with `id`, `name` (unique), `hubLocationId` (unique, optional), and relation to `Location[]`
    - Add `Location` model with `id`, `name` (unique), `regionId`, `isHub`, and relations to `Region`, `Adjacency[]`, `GameThreat[]`, `GameSpy[]`
    - Add `Adjacency` model with `id`, `locationAId`, `locationBId`, `isSameRegion`, unique constraint on `[locationAId, locationBId]`, and indexes
    - Add `GameThreat` model with `id`, `roomId` (unique), `locationId`, `createdAt`, and relations to `Room` and `Location`
    - Add `GameSpy` model with `id`, `roomId`, `regionId`, `locationId`, `captured`, `capturedByPlayerId`, `createdAt`, unique constraint on `[roomId, regionId]`, and relations
    - Add `gameThreat` and `gameSpies` relation fields to the existing `Room` model
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 9.1, 9.2, 11.1, 11.2, 11.3, 11.4, 11.5, 11.7_

  - [x] 1.2 Generate Prisma migration and regenerate client
    - Run `npx prisma migrate dev --name add-map-and-game-models`
    - Verify generated SQL includes all constraints, indexes, and foreign keys
    - _Requirements: 1.1, 1.2, 1.3, 11.1, 11.3, 11.4_

- [x] 2. Map engine types and seed script
  - [x] 2.1 Create shared map types at `lib/map/types.ts`
    - Define `Region`, `Location`, `AdjacencyEdge`, `RegionWithLocations`, `MapData`, `AdjacencyListEntry` interfaces
    - _Requirements: 1.1, 1.2, 10.1_

  - [x] 2.2 Create the Prisma seed script at `prisma/seed.ts`
    - Define the full `MAP_DATA` constant with 6 regions, 40 locations, 55 intra-region edges, and 17 inter-region edges as specified in the design
    - Implement idempotent seeding using upserts within a single Prisma `$transaction`
    - Enforce canonical edge ordering (`locationAId < locationBId` lexicographically) when inserting adjacency edges
    - Set `isSameRegion` flag correctly for each edge
    - Set `isHub` on hub locations and back-reference `hubLocationId` on the Region
    - Configure in `package.json` under `prisma.seed` to run via `prisma db seed`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.1–3.18, 4.1, 4.2, 4.3, 4.4, 11.4, 11.5, 11.6_

  - [x] 2.3 Write property tests for seed idempotency and graph invariants at `lib/map/__tests__/graph-invariants.property.test.ts`
    - **Property 12: Seed idempotency** — run seed multiple times, assert counts remain 6/40/72
    - **Property 2: No self-loops** — for any edge, endpoints are distinct
    - **Property 4: Canonical edge ordering** — for any edge, locationAId < locationBId
    - **Property 3: Minimum adjacency degree** — every location has degree >= 2
    - **Property 6: Full graph connectivity** — BFS from any node reaches all 40 nodes
    - **Validates: Requirements 1.3, 1.6, 1.7, 4.1, 4.3, 11.4, 11.5, 11.6**

- [x] 3. Map query modules
  - [x] 3.1 Implement adjacency query module at `lib/map/adjacency.ts`
    - `getAdjacentLocations(locationId)` — query DB for all locations sharing an edge with the given location (both directions due to canonical ordering)
    - `getAllAdjacencyEdges()` — return all 72 edges
    - _Requirements: 5.1, 2.8, 2.9, 3.19_

  - [x] 3.2 Implement region query module at `lib/map/regions.ts`
    - `getLocationsByRegion(regionId)` — return all locations belonging to a region
    - `getAllRegions()` — return all regions with their locations
    - _Requirements: 5.2, 10.1_

  - [x] 3.3 Implement distance matrix module at `lib/map/distance.ts`
    - `initializeDistanceMatrix()` — load adjacency from DB, run BFS from each of 40 nodes, cache result in module scope
    - `getShortestPathDistance(locationA, locationB)` — return cached distance; lazy-init on first call
    - `getDistanceMatrix()` — return the full Map<string, Map<string, number>>
    - Validate distances are in range [0, 6]
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 3.4 Write property tests for adjacency and distance at `lib/map/__tests__/adjacency.property.test.ts` and `lib/map/__tests__/distance.property.test.ts`
    - **Property 1: Adjacency bidirectionality** — for any edge (A,B), A's neighbors include B and vice versa
    - **Property 10: Adjacency query correctness** — neighbors match exactly the stored edge list
    - **Property 5: Region subgraph connectivity** — intra-region subgraph is connected for each region
    - **Property 7: Shortest-path distance correctness** — matrix distance equals independent BFS
    - **Property 8: Distance range bounded by diameter** — all distances in [0, 6]
    - **Property 9: Unique distance vectors** — no two locations share the same distance vector
    - **Property 11: isSameRegion flag correctness** — flag matches actual region membership
    - **Validates: Requirements 1.4, 2.8, 2.9, 2.10, 3.19, 5.1, 5.3, 5.4, 5.6, 5.7, 10.3, 11.8**

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Map API and full map data
  - [x] 5.1 Implement `lib/map/get-map-data.ts`
    - `getFullMapData()` — return `MapData` containing all regions with locations and per-location adjacency lists with `isSameRegion` flags
    - Include hub designation for each location
    - Exclude all game state (GameThreat, GameSpy)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 5.2 Implement map API route at `app/api/map/route.ts`
    - GET handler returning full map structure as JSON
    - Set `Cache-Control: public, max-age=86400, immutable` header
    - No authentication required
    - Exclude hidden game state from response
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 5.3 Write integration test for map API at `app/api/map/__tests__/map.route.test.ts`
    - Verify response shape contains 6 regions, 40 locations, adjacency lists
    - Verify `isSameRegion` flag is present and correct
    - Verify hub designation is included
    - Verify no game state fields appear in response
    - Verify Cache-Control headers
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6**

- [x] 6. Game initialization logic
  - [x] 6.1 Create game types at `lib/game/types.ts`
    - Define `GameState`, `SpyPlacement`, `InitializeGameResult`, `GameInitError`, `TransactionClient` types
    - _Requirements: 9.1, 9.2_

  - [x] 6.2 Implement `lib/game/place-threat.ts`
    - `placeMainThreat(roomId, allLocationIds, tx)` — select one random location from all 40 using uniform distribution, insert `GameThreat` record, return chosen locationId
    - _Requirements: 7.1, 7.2, 9.1_

  - [x] 6.3 Implement `lib/game/place-spies.ts`
    - `placeSpyNpcs(roomId, regionLocations, tx)` — for each of 6 regions, select one random location from that region's locations using uniform distribution, insert `GameSpy` record
    - Allow spy to be at the same location as the Main Threat (no exclusion)
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 9.2_

  - [x] 6.4 Implement `lib/game/initialize-game.ts`
    - `initializeGame(roomId, tx)` — orchestrate: load all locations grouped by region, call `placeMainThreat`, call `placeSpyNpcs`, return `InitializeGameResult`
    - Handle errors and return `GameInitError` on failure
    - _Requirements: 6.1, 6.3, 7.1, 8.1_

  - [x] 6.5 Implement `lib/game/query-game-state.ts`
    - `getGameState(roomId)` — query Main Threat and all Spy NPCs for a room in a single DB call
    - `markSpyCaptured(spyId, capturedByPlayerId)` — update spy record with captured flag and captor
    - _Requirements: 9.3, 9.4, 7.3, 8.4_

  - [x] 6.6 Write property tests for game initialization at `lib/game/__tests__/initialize-game.property.test.ts`
    - **Property 13: Exactly one threat** — initializeGame creates exactly 1 GameThreat with a valid locationId from the 40 locations
    - **Property 14: One spy per region** — initializeGame creates exactly 6 GameSpy records, one per region, each with a locationId belonging to that region
    - **Validates: Requirements 7.1, 8.1, 8.2, 9.1, 9.2**

  - [x] 6.7 Write property test for spy capture at `lib/game/__tests__/spy-capture.property.test.ts`
    - **Property 15: Spy capture records the captor** — after capture, only the targeted spy is updated with captured=true and the correct capturedByPlayerId
    - **Validates: Requirements 9.3**

- [x] 7. Integration with lobby startGame
  - [x] 7.1 Integrate `initializeGame` into `lib/lobby/start-game.ts`
    - Call `initializeGame(roomId, tx)` inside the existing `$transaction` block after turn position assignment
    - If `initializeGame` fails, the transaction rolls back (room stays "waiting", no game state persisted)
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 7.2 Write integration test for startGame with game initialization at `lib/lobby/__tests__/start-game-init.test.ts`
    - Verify successful start creates Room in-progress + 1 GameThreat + 6 GameSpy
    - Verify failure in initializeGame rolls back everything (room stays "waiting")
    - Verify hidden state is not returned in the startGame response
    - **Validates: Requirements 6.1, 6.2, 6.3, 7.2, 7.3, 8.3**

- [x] 8. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all implementations use TypeScript
- The seed script must be run before any map query or game initialization tests
- Distance matrix is computed lazily at runtime, not stored in DB

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "6.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["2.3", "3.1", "3.2"] },
    { "id": 5, "tasks": ["3.3"] },
    { "id": 6, "tasks": ["3.4", "5.1"] },
    { "id": 7, "tasks": ["5.2", "6.2", "6.3"] },
    { "id": 8, "tasks": ["5.3", "6.4"] },
    { "id": 9, "tasks": ["6.5", "6.6"] },
    { "id": 10, "tasks": ["6.7", "7.1"] },
    { "id": 11, "tasks": ["7.2"] }
  ]
}
```
