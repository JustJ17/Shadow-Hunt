# Requirements Document

## Introduction

The Map & Game Initialization system manages the static map data (regions, locations, adjacency graph) and the dynamic game-start logic that places hidden entities (Main Threat and Spy NPCs) onto the map. The map is seeded once into Postgres via Prisma and queried at runtime. Game initialization is triggered by the existing Lobby spec's `startGame` function and produces the initial hidden game state that drives all subsequent turn-based gameplay.

Adjacency is a hand-authored edge list based on real-world geographic proximity between cities, not a derived or fully-connected graph. Density varies by region: compact regions such as Europe are densely linked, while large regions such as Africa and Asia are sparser. Locations in the same Region may require multiple hops to reach one another, and the shortest route between two same-region Locations may pass through other Regions. The graph treats the world as a globe, so trans-Pacific crossings connect North America, Asia, and Oceania directly.

Clues are exact step counts. When a player Investigates, the value returned is the precise shortest-path distance in adjacency edges between the investigated Location and the Main Threat's Location. There is no bucketing into qualitative tiers.

The resulting map has been verified to have the following properties: 40 Locations across 6 Regions with 72 adjacency edges (55 intra-region, 17 inter-region), a connected graph, a diameter of 6, an average shortest-path distance of 3.15, a minimum Adjacency_Degree of 2, and a unique shortest-path distance vector for every Location.

## Glossary

- **Map_Service**: The server-side module responsible for seeding, storing, and querying map data (regions, locations, adjacency).
- **Game_Initializer**: The server-side module responsible for placing the Main Threat and Spy NPCs on the map when a game starts.
- **Region**: A named geographical area containing multiple Locations. There are exactly 6 Regions in the MVP map.
- **Location**: A named place within a Region. Each Location belongs to exactly one Region.
- **Hub**: A designated Location within each Region that carries the Hub-to-Hub inter-region links defined in Requirement 3. Hubs are not the only Locations with inter-region adjacency; non-Hub Locations may also hold inter-region edges where cities are geographically close across a region boundary or connected by a long-haul great-circle route.
- **Adjacency**: A bidirectional connection between two Locations indicating a player can travel between them in one Move action.
- **Adjacency_Edge_List**: The authoritative, hand-authored set of Location pairs that are adjacent. An edge exists only if the pair appears in this list.
- **Intra-Region_Adjacency**: An adjacency edge between two Locations that belong to the same Region, defined explicitly in the Adjacency_Edge_List based on real-world geographic proximity. Shared Region membership alone does not create adjacency.
- **Inter-Region_Adjacency**: An adjacency edge between two Locations that belong to different Regions. Includes Hub-to-Hub links, non-Hub links where cities are geographically close across a region boundary, and long-haul great-circle links such as trans-Pacific crossings.
- **Adjacency_Degree**: The number of Locations adjacent to a given Location.
- **Shortest-Path_Distance**: The minimum number of adjacency edges traversed between two Locations over the full adjacency graph, including inter-region edges. The maximum Shortest-Path_Distance over all Location pairs (the map diameter) is 6.
- **Main_Threat**: A hidden game entity placed at one Location on game start. Its location is stored server-side and never exposed to any client until a correct Capture Attempt.
- **Spy_NPC**: A hidden game entity placed at one Location per Region on game start. Capturable by players for Action Cards.
- **Game_State**: The server-side record of a game session's hidden information (Main Threat location, Spy NPC locations) associated with a Room.
- **Room**: An existing lobby entity (from the lobby-player-join spec) representing a game session.

## Requirements

### Requirement 1: Map Data Schema

**User Story:** As a developer, I want the map data (regions, locations, adjacency) stored in Postgres via Prisma, so that the game engine can query connectivity and distances at runtime.

#### Acceptance Criteria

1. THE Map_Service SHALL store exactly 6 Regions, each with a unique name and a designated Hub Location.
2. THE Map_Service SHALL store exactly 40 Locations, each belonging to exactly one Region and identified by a unique name.
3. THE Map_Service SHALL store exactly 72 adjacency edges, comprising 55 Intra-Region_Adjacency edges and 17 Inter-Region_Adjacency edges.
4. THE Map_Service SHALL store every adjacency edge as a bidirectional relationship between a pair of distinct Locations.
5. WHEN a Location is stored, THE Map_Service SHALL record whether that Location is the Hub of its Region.
6. THE Map_Service SHALL store an Adjacency_Degree of at least 2 for every Location.
7. THE Map_Service SHALL store adjacency edges only between two distinct Locations, so that no Location is adjacent to itself.

### Requirement 2: Intra-Region Adjacency

**User Story:** As a game designer, I want intra-region adjacency defined by a hand-authored edge list based on real-world geographic proximity, so that travel within a Region requires meaningful routing decisions instead of one-hop access to every city.

#### Acceptance Criteria

1. THE Map_Service SHALL define exactly 55 Intra-Region_Adjacency edges in total, distributed as Europe 14, Asia 11, Africa 11, North America 8, South America 6, and Oceania 5.
2. THE Map_Service SHALL define exactly the following 14 Europe edges: London–Paris, London–Madrid, London–Berlin, Paris–Madrid, Paris–Berlin, Paris–Rome, Paris–Vienna, Berlin–Warsaw, Berlin–Vienna, Warsaw–Vienna, Vienna–Rome, Vienna–Athens, Rome–Athens, Rome–Madrid.
3. THE Map_Service SHALL define exactly the following 11 Asia edges: Tokyo–Seoul, Tokyo–Beijing, Tokyo–Manila, Seoul–Beijing, Beijing–Hanoi, Beijing–New Delhi, Hanoi–Bangkok, Hanoi–Manila, Bangkok–New Delhi, Bangkok–Jakarta, Jakarta–Manila.
4. THE Map_Service SHALL define exactly the following 11 Africa edges: Cairo–Addis Ababa, Cairo–Casablanca, Cairo–Nairobi, Casablanca–Accra, Accra–Lagos, Lagos–Nairobi, Lagos–Cape Town, Addis Ababa–Nairobi, Nairobi–Dar es Salaam, Dar es Salaam–Pretoria, Pretoria–Cape Town.
5. THE Map_Service SHALL define exactly the following 8 North America edges: Washington D.C.–Toronto, Washington D.C.–Ottawa, Washington D.C.–Havana, Washington D.C.–Mexico City, Ottawa–Toronto, Havana–Mexico City, Havana–Panama City, Mexico City–Panama City.
6. THE Map_Service SHALL define exactly the following 6 South America edges: Brasília–Bogotá, Brasília–Buenos Aires, Brasília–Lima, Bogotá–Lima, Lima–Santiago, Buenos Aires–Santiago.
7. THE Map_Service SHALL define exactly the following 5 Oceania edges: Canberra–Auckland, Canberra–Wellington, Canberra–Suva, Auckland–Wellington, Auckland–Suva.
8. WHEN an adjacency query is issued from either endpoint of an Intra-Region_Adjacency edge, THE Map_Service SHALL return the opposite endpoint.
9. THE Map_Service SHALL treat two Locations in the same Region as adjacent only if the pair appears in the Adjacency_Edge_List, so that shared Region membership alone does not imply adjacency.
10. THE Map_Service SHALL define each Region's Intra-Region_Adjacency edges such that the sub-graph induced by that Region's Locations is connected, so that every Location in a Region is reachable from every other Location in the same Region without leaving that Region.
11. THE Map_Service SHALL exclude self-referencing pairs from the Adjacency_Edge_List, so that no Location is adjacent to itself.

### Requirement 3: Inter-Region Adjacency

**User Story:** As a game engine consumer, I want Locations connected across Regions via Hub-to-Hub links, geographically close non-Hub links, and long-haul great-circle crossings, so that players can cross Region boundaries along plausible real-world routes on a globe.

#### Acceptance Criteria

1. THE Map_Service SHALL define an adjacency edge between London and Tokyo.
2. THE Map_Service SHALL define an adjacency edge between London and Cairo.
3. THE Map_Service SHALL define an adjacency edge between London and Washington D.C.
4. THE Map_Service SHALL define an adjacency edge between Tokyo and Cairo.
5. THE Map_Service SHALL define an adjacency edge between Tokyo and Canberra.
6. THE Map_Service SHALL define an adjacency edge between Cairo and Brasília.
7. THE Map_Service SHALL define an adjacency edge between Washington D.C. and Brasília.
8. THE Map_Service SHALL define an adjacency edge between Madrid and Casablanca.
9. THE Map_Service SHALL define an adjacency edge between Athens and Cairo.
10. THE Map_Service SHALL define an adjacency edge between New Delhi and Cairo.
11. THE Map_Service SHALL define an adjacency edge between Panama City and Bogotá.
12. THE Map_Service SHALL define an adjacency edge between Jakarta and Canberra.
13. THE Map_Service SHALL define an adjacency edge between Cape Town and Brasília.
14. THE Map_Service SHALL define an adjacency edge between Auckland and Santiago.
15. THE Map_Service SHALL define an adjacency edge between Tokyo and Mexico City.
16. THE Map_Service SHALL define an adjacency edge between Beijing and Toronto.
17. THE Map_Service SHALL define an adjacency edge between Suva and Manila.
18. THE Map_Service SHALL define exactly 17 Inter-Region_Adjacency edges in total, comprising 7 Hub-to-Hub edges and 10 non-Hub edges.
19. WHEN an adjacency query is issued from either endpoint of an Inter-Region_Adjacency edge, THE Map_Service SHALL return the opposite endpoint.

### Requirement 4: Map Data Seeding

**User Story:** As a developer, I want a repeatable seeding mechanism for map data, so that the database can be populated reliably across environments.

#### Acceptance Criteria

1. THE Map_Service SHALL provide a seed script that populates all Regions, Locations, and adjacency edges in a single idempotent operation.
2. WHEN the seed script is executed against an empty database, THE Map_Service SHALL create 6 Regions, 40 Locations, 55 Intra-Region_Adjacency edges, and 17 Inter-Region_Adjacency edges, totaling 72 adjacency edges.
3. WHEN the seed script is executed against a database that already contains map data, THE Map_Service SHALL leave the record counts at 6 Regions, 40 Locations, and 72 adjacency edges without creating duplicate records.
4. IF the seed script encounters an error during execution, THEN THE Map_Service SHALL roll back all changes and report the failure.

### Requirement 5: Map Data Querying

**User Story:** As a game engine consumer, I want to query location adjacency and region membership, so that move validation and clue distance calculations can operate efficiently.

#### Acceptance Criteria

1. WHEN a query requests all Locations adjacent to a given Location, THE Map_Service SHALL return the complete set of Locations sharing an adjacency edge with that Location, spanning both same-region and cross-region edges.
2. WHEN a query requests all Locations within a given Region, THE Map_Service SHALL return the complete set of Locations belonging to that Region.
3. WHEN a query requests the Shortest-Path_Distance between two Locations, THE Map_Service SHALL return the minimum number of adjacency edges traversed.
4. THE Map_Service SHALL compute Shortest-Path_Distance over the full adjacency graph including Inter-Region_Adjacency edges, so that the shortest route between two Locations in the same Region may pass through Locations in other Regions.
5. WHEN a query requests the Shortest-Path_Distance from a Location to itself, THE Map_Service SHALL return 0.
6. WHEN a query requests the clue value for an investigated Location relative to the Main Threat Location, THE Map_Service SHALL return the exact Shortest-Path_Distance as an integer number of steps, without bucketing or classification.
7. THE Map_Service SHALL return a Shortest-Path_Distance in the inclusive range 0 to 6 for any pair of Locations, where 6 is the map diameter.

### Requirement 6: Game Initialization Trigger

**User Story:** As a game developer, I want game initialization to be triggered from the existing Lobby start-game action, so that the map entities are placed immediately when a game begins.

#### Acceptance Criteria

1. WHEN the Lobby start-game action completes successfully, THE Game_Initializer SHALL execute game initialization for the associated Room.
2. IF game initialization fails, THEN THE Game_Initializer SHALL roll back the Room status to "waiting" and return an error to the start-game caller.
3. THE Game_Initializer SHALL complete initialization within a single database transaction alongside the Room status transition to "in-progress".

### Requirement 7: Main Threat Placement

**User Story:** As a game designer, I want the Main Threat placed at a random Location on game start, so that every game session has a unique hidden target.

#### Acceptance Criteria

1. WHEN game initialization executes, THE Game_Initializer SHALL select exactly one Location from the full set of 40 Locations as the Main Threat location using a uniform random distribution.
2. THE Game_Initializer SHALL store the Main Threat location exclusively in server-side database records associated with the game session.
3. THE Game_Initializer SHALL exclude the Main Threat location from all API responses, poll results, and client-visible state until a correct Capture Attempt occurs.

### Requirement 8: Spy NPC Placement

**User Story:** As a game designer, I want one Spy NPC placed in a random Location per Region on game start, so that players can encounter Spies across the map.

#### Acceptance Criteria

1. WHEN game initialization executes, THE Game_Initializer SHALL place exactly one Spy NPC per Region, totaling 6 Spy NPCs.
2. THE Game_Initializer SHALL select the Spy NPC Location within each Region using a uniform random distribution from the Locations in that Region.
3. THE Game_Initializer SHALL store Spy NPC locations exclusively in server-side database records associated with the game session.
4. THE Game_Initializer SHALL exclude Spy NPC locations from all API responses, poll results, and client-visible state until a player is at the same Location as a Spy NPC.
5. THE Game_Initializer SHALL allow a Spy NPC to be placed at the same Location as the Main Threat (no exclusion rule).

### Requirement 9: Game State Persistence

**User Story:** As a game engine consumer, I want game state (Main Threat and Spy NPC locations) persisted in Postgres, so that game sessions survive server restarts and can be queried across multiple turns.

#### Acceptance Criteria

1. THE Game_Initializer SHALL persist the Main Threat location as a record referencing the game session (Room) and the target Location.
2. THE Game_Initializer SHALL persist each Spy NPC location as a record referencing the game session (Room), the Region, and the assigned Location.
3. WHEN a Spy NPC is captured by a player, THE Game_Initializer SHALL mark that Spy NPC record as captured and record which player captured it.
4. THE Game_Initializer SHALL support querying the Main Threat location and all Spy NPC locations for a given game session in a single database call.

### Requirement 10: Read-Only Map API

**User Story:** As a frontend developer, I want an API endpoint that returns the full map structure (regions, locations, adjacency), so that the client can render a map view.

#### Acceptance Criteria

1. WHEN a client requests the map data, THE Map_Service SHALL return all 6 Regions with their Locations and an explicit adjacency list for each Location enumerating every Location sharing an adjacency edge with it.
2. THE Map_Service SHALL enumerate each Location's adjacency list from the stored Adjacency_Edge_List, so that the response does not require the client to infer adjacency from Region membership.
3. WHEN the map data response includes an adjacency edge, THE Map_Service SHALL indicate whether that edge connects two Locations within the same Region or two Locations in different Regions.
4. THE Map_Service SHALL exclude all hidden game state (Main Threat location, Spy NPC locations) from the map data response.
5. THE Map_Service SHALL include the Hub designation for each Location in the response.
6. THE Map_Service SHALL return the map data in a single API call without requiring authentication or an active game session.

### Requirement 11: Data Integrity Constraints

**User Story:** As a developer, I want database-level constraints ensuring map data integrity, so that invalid states cannot be persisted.

#### Acceptance Criteria

1. THE Map_Service SHALL enforce that each Location belongs to exactly one Region via a foreign key constraint.
2. THE Map_Service SHALL enforce that each Region has exactly one Hub Location.
3. THE Map_Service SHALL enforce that adjacency edges reference valid Locations via foreign key constraints.
4. THE Map_Service SHALL store each adjacency edge under a single canonical ordering of the two endpoint Location identifiers and enforce uniqueness on that ordered pair, so that no duplicate edge exists between the same pair of Locations in either direction.
5. THE Map_Service SHALL enforce that the two endpoints of an adjacency edge are distinct Locations.
6. THE Map_Service SHALL maintain the full adjacency graph as connected, so that every Location is reachable from every other Location.
7. IF a Location is deleted, THEN THE Map_Service SHALL cascade-delete all adjacency edges referencing that Location.
8. THE Map_Service SHALL maintain an adjacency graph in which every Location has a unique vector of Shortest-Path_Distances to all 40 Locations, so that no two Locations are indistinguishable by exact step-count clues.
