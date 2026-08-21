# Requirements Document

## Introduction

The Movement & Turn Actions system implements the core gameplay loop for Shadow Hunt: players take turns executing actions on the map, gathering clues about hidden entities, and attempting captures. Each turn consists of exactly two action slots, processed sequentially, followed by an end-of-turn resolution phase that handles Capture Attempt outcomes and Spy proximity/reward logic.

This spec builds on the Map & Game Initialization system (regions, locations, adjacency with transport types, Main Threat placement, Spy NPC placement) and the Lobby spec (room management, turn order assignment). It introduces player positioning, movement validation against transport-type rules, a private Notebook for Spy-proximity clues, Spy capture with tiered rewards, the Mastermind Capture Attempt win condition, and a public Event Feed (Tablet) that logs all player actions visible to everyone.

Transport-mode rules constrain movement: Car and Boat edges allow travel within or between locations as defined in the adjacency graph, while Plane edges connect Hubs across regions. Spy proximity clues use a restricted distance metric computed over Car/Boat edges only (Plane edges excluded), producing a separate shortest-path calculation from the general full-graph distance used for Mastermind clues.

Action Cards are referenced as placeholders in this spec — the USE ACTION CARD action dispatches to an effect handler whose real implementations are defined in the separate Action Cards spec.

## Glossary

- **Turn_Engine**: The server-side module responsible for managing turn order, validating and executing player actions, and running end-of-turn resolution.
- **Player**: A participant in an active game session, identified by playerId, tracked via the RoomPlayer record.
- **Current_Player**: The Player whose turn it currently is, determined by round-robin turn order based on turnPosition.
- **Action_Slot**: One of exactly two action opportunities within a single turn. Each slot accepts one action or a SKIP.
- **MOVE_Action**: An action that moves the Player to an adjacent Location along a valid adjacency edge.
- **SKIP_Action**: An action that consumes an Action_Slot without effect.
- **CAPTURE_ATTEMPT_Action**: An action that flags the Player as attempting a Mastermind capture this turn, resolved during end-of-turn resolution against the Player's final Location.
- **USE_CARD_Action**: An action that consumes a held Action Card and dispatches to a placeholder effect handler.
- **End_Of_Turn_Resolution**: The phase after both Action_Slots are resolved, executing Capture Attempt checks (Step A) and Spy/reward logic (Step B) based on the Player's final Location.
- **Mastermind**: The hidden Main Threat entity whose true Location is stored server-side. A correct Capture Attempt at the Mastermind's Location wins the game.
- **Spy_NPC**: A hidden entity placed one per Region at game start. Capturable by Players for Action Card rewards.
- **Notebook**: A Player's private, append-only log of Spy-proximity clue entries and Mastermind-locator entries (locator entries populated by the Action Cards spec).
- **Notebook_Entry**: A single clue record: regionId, roundNumber, stepsAway (Spy proximity) or locator-type data (from Action Cards).
- **Spy_Distance**: The shortest-path distance from a Location to a Region's Spy, computed over Car/Boat edges only (Plane edges excluded).
- **Capture_Order**: A game-wide sequential counter (1st through 6th) tracking the order in which Spy NPCs are captured across all Players.
- **Reward_Tier**: The number of Action Cards granted based on Capture_Order: 1st capture = 4 cards, 2nd = 3, 3rd = 2, 4th–6th = 1 card.
- **Pending_Reward**: A flag on a Player indicating they have captured a Spy but have not yet left that Spy's Region; reward is granted upon leaving.
- **Skip_Next_Turn_Flag**: A flag set on a Player after a failed Capture Attempt, causing their next turn to be automatically skipped.
- **Event_Feed**: A public, ordered log (the "Tablet") of all player actions and game events (movements, card uses, capture attempts, turn skips, spy reward collections, and game-ending events) visible to all Players.
- **Room**: The game session entity, status transitions from "in-progress" to "finished" upon a successful Capture Attempt.
- **Round**: One complete cycle of all Players taking their turns in order. Round number increments after all Players have acted.

## Requirements

### Requirement 1: Turn Order and Current Player Tracking

**User Story:** As a game engine consumer, I want the system to track whose turn it is and advance turns in round-robin order, so that gameplay proceeds fairly through all players.

#### Acceptance Criteria

1. THE Turn_Engine SHALL determine the Current_Player based on turnPosition values assigned at game start, cycling through positions 1 to N (where N is 2–4) in ascending order.
2. WHEN the Current_Player completes their turn (both Action_Slots filled and End_Of_Turn_Resolution executed), THE Turn_Engine SHALL advance to the next Player in turnPosition order and persist the updated turn state (active playerId, current round number, current action slot number) to the database before returning the response.
3. WHEN all Players have completed their turns in the current Round, THE Turn_Engine SHALL increment the Round number and reset to the Player with turnPosition 1.
4. WHEN a Player's turn begins and their Skip_Next_Turn_Flag is set, THE Turn_Engine SHALL automatically skip that Player's turn, clear the flag, and advance to the next Player without requiring input from that Player.
5. IF a Player who is not the Current_Player submits an action, THEN THE Turn_Engine SHALL reject the submission and return an error response indicating that it is not the submitting Player's turn.
6. IF an action submission is received for a Room whose status is not "in-progress", THEN THE Turn_Engine SHALL reject the submission and return an error response indicating the game is not active.
7. IF all remaining Players in a Round have their Skip_Next_Turn_Flag set, THE Turn_Engine SHALL clear all flags, advance the Round number, and begin the new Round with the Player at turnPosition 1.

### Requirement 2: Action Slot Structure

**User Story:** As a player, I want exactly two action slots per turn so that I can combine actions strategically each turn.

#### Acceptance Criteria

1. THE Turn_Engine SHALL provide exactly two Action_Slots per turn for the Current_Player.
2. THE Turn_Engine SHALL process Action_Slot 1 before Action_Slot 2, so that the outcome of the first action (e.g., a MOVE changing position) is reflected when validating and executing the second action.
3. WHEN both Action_Slots have been submitted and executed, THE Turn_Engine SHALL proceed to End_Of_Turn_Resolution.
4. THE Turn_Engine SHALL accept any combination of the four action types (MOVE, SKIP, CAPTURE_ATTEMPT, USE_CARD) across the two slots, including two SKIPs.
5. IF the Current_Player submits a CAPTURE_ATTEMPT as the second Action_Slot and the first Action_Slot already contains a CAPTURE_ATTEMPT, THEN THE Turn_Engine SHALL reject the submission, return an error indicating that only one CAPTURE_ATTEMPT is allowed per turn, and keep the second Action_Slot empty for a new submission.
6. IF the Current_Player submits an action that fails validation for the current game state (e.g., a MOVE to a non-adjacent Location), THEN THE Turn_Engine SHALL reject the submission, return an error describing the validation failure, and keep that Action_Slot empty for a new submission.
7. THE Turn_Engine SHALL require the Current_Player to submit Action_Slot 1 before accepting a submission for Action_Slot 2.

### Requirement 3: MOVE Action

**User Story:** As a player, I want to move to a connected location on the map, so that I can travel toward targets and gather information.

#### Acceptance Criteria

1. WHEN a Player submits a MOVE_Action with a target Location, THE Turn_Engine SHALL validate that an adjacency edge exists between the Player's current Location and the target Location.
2. WHEN the adjacency edge has transport type `car` or `boat`, THE Turn_Engine SHALL allow the MOVE regardless of whether either endpoint is a Hub Location.
3. WHEN the adjacency edge has transport type `plane`, THE Turn_Engine SHALL allow the MOVE only if both the Player's current Location and the target Location are Hub Locations.
4. IF a MOVE_Action specifies a target Location that is not adjacent to the Player's current Location, THEN THE Turn_Engine SHALL reject the action with an error indicating invalid move and leave the Player's current Location unchanged.
5. IF a MOVE_Action specifies a `plane` edge but either endpoint is not a Hub, THEN THE Turn_Engine SHALL reject the action with an error indicating invalid transport mode and leave the Player's current Location unchanged.
6. WHEN a MOVE_Action is validated successfully, THE Turn_Engine SHALL update the Player's current Location to the target Location before resolving any subsequent action in the same turn.
7. WHEN a Player executes two MOVE_Actions in the same turn, THE Turn_Engine SHALL validate the second MOVE from the Location reached by the first MOVE.
8. IF a MOVE_Action specifies a target Location that is the same as the Player's current Location, THEN THE Turn_Engine SHALL reject the action with an error indicating invalid move.

### Requirement 4: SKIP Action

**User Story:** As a player, I want to skip an action slot without penalty, so that I have flexibility when no action is beneficial.

#### Acceptance Criteria

1. WHEN a Player submits a SKIP_Action, THE Turn_Engine SHALL consume the Action_Slot without modifying the Player's Location, Notebook, held Action Cards, or any flags (e.g., capture-attempt flag, Skip_Next_Turn_Flag).
2. THE Turn_Engine SHALL allow both Action_Slots in a turn to be SKIP_Actions.
3. WHEN a SKIP_Action is successfully consumed, THE Turn_Engine SHALL return an acknowledgment response indicating the slot has been consumed and identifying which Action_Slot (1 or 2) was filled.

### Requirement 5: CAPTURE ATTEMPT Action

**User Story:** As a player, I want to declare a Capture Attempt during my turn, so that I can try to win the game by being at the Mastermind's location.

#### Acceptance Criteria

1. WHEN a Player submits a CAPTURE_ATTEMPT_Action, THE Turn_Engine SHALL record a capture-attempt flag for the current turn without resolving it immediately, deferring resolution to End_Of_Turn_Resolution.
2. THE Turn_Engine SHALL allow a CAPTURE_ATTEMPT_Action in either Action_Slot (first or second).
3. THE Turn_Engine SHALL allow the Player to combine a CAPTURE_ATTEMPT_Action with any other valid action type (MOVE_Action, SKIP_Action, or USE_CARD_Action) in the remaining Action_Slot, with Capture Attempt resolution based on the Player's final Location after both slots are processed.
4. IF a Player submits a CAPTURE_ATTEMPT_Action and a capture-attempt flag has already been recorded for the current turn, THEN THE Turn_Engine SHALL reject the action with an error indicating duplicate capture attempt.
5. THE Turn_Engine SHALL NOT require any target-location parameter on a CAPTURE_ATTEMPT_Action; the Player's final Location at End_Of_Turn_Resolution serves as the implicit target.

### Requirement 6: USE ACTION CARD Action

**User Story:** As a player, I want to use an Action Card from my hand, so that I can gain special abilities during my turn.

#### Acceptance Criteria

1. WHEN a Player submits a USE_CARD_Action specifying a card identifier, THE Turn_Engine SHALL validate that the Player holds the specified card and that the card has not already been consumed.
2. IF the Player does not hold the specified card or the card has already been consumed, THEN THE Turn_Engine SHALL reject the action with an error indicating invalid card.
3. WHEN the card is validated, THE Turn_Engine SHALL remove the card from the Player's hand and mark it as consumed.
4. WHEN the card is marked as consumed, THE Turn_Engine SHALL dispatch the card's type to a placeholder effect handler and include the acting Player and current game state as context.
5. THE Turn_Engine SHALL allow a USE_CARD_Action in either Action_Slot.
6. THE Turn_Engine SHALL enforce a maximum hand size of 5 Action Cards per Player.

### Requirement 7: Player Position Tracking

**User Story:** As a game engine consumer, I want every player's current position persisted and queryable, so that movement, clue calculations, and frontend rendering have consistent position data.

#### Acceptance Criteria

1. THE Turn_Engine SHALL store each Player's current Location in the database as a record referencing the game session (Room), the Player, and the Location.
2. WHEN a game is initialized, THE Turn_Engine SHALL assign each Player a starting Location equal to the Hub Location of a Region selected using a uniform random distribution from the 6 available Regions, with one distinct Region assigned per Player for games with 2–4 players.
3. WHEN a MOVE_Action is executed with a target Location that is adjacent to the Player's current Location, THE Turn_Engine SHALL update the Player's stored current Location to the target Location.
4. IF a MOVE_Action specifies a target Location that is not adjacent to the Player's current Location, THEN THE Turn_Engine SHALL reject the action, preserve the Player's current Location unchanged, and return an error indicating an invalid move.
5. WHEN a client queries player positions for a game session, THE Turn_Engine SHALL return the current Location for every Player in that session, accessible to all Players in the same game session.
6. THE Turn_Engine SHALL NOT require a separate move history log; current position is the authoritative state.

### Requirement 8: End-of-Turn Resolution — Capture Attempt (Step A)

**User Story:** As a game designer, I want Capture Attempts resolved at end of turn against the player's final position, so that players can move and then attempt capture in a single turn.

#### Acceptance Criteria

1. WHEN End_Of_Turn_Resolution executes and a capture-attempt flag is set for the current turn, THE Turn_Engine SHALL compare the Player's final Location (the Location the Player occupies after all actions for that turn have been applied) with the Mastermind's Location.
2. WHEN the Player's final Location matches the Mastermind's Location, THE Turn_Engine SHALL declare that Player the winner, transition the Room status to "finished", and broadcast a public event containing the winning Player's identity and the Mastermind's Location.
3. WHEN the Player's final Location matches the Mastermind's Location, THE Turn_Engine SHALL skip Step B entirely.
4. IF the Player's final Location does not match the Mastermind's Location, THEN THE Turn_Engine SHALL broadcast a public event containing the Player's identity, their final Location, and a "failed" result.
5. IF a Capture Attempt fails, THEN THE Turn_Engine SHALL set the Skip_Next_Turn_Flag on that Player, causing their next turn to be automatically skipped.
6. IF a Capture Attempt fails, THEN THE Turn_Engine SHALL NOT include the Mastermind's actual Location in the failure event or any other client-visible response.
7. IF no capture-attempt flag is set for the current turn, THEN THE Turn_Engine SHALL skip Step A entirely and proceed to Step B.
8. WHEN End_Of_Turn_Resolution executes, THE Turn_Engine SHALL process at most one capture-attempt flag per turn (belonging to the single active Player for that turn).

### Requirement 9: End-of-Turn Resolution — Spy and Reward (Step B)

**User Story:** As a player, I want automatic spy interaction and clue delivery at the end of my turn based on my final position, so that the game advances without extra manual steps.

#### Acceptance Criteria

1. WHEN End_Of_Turn_Resolution reaches Step B, THE Turn_Engine SHALL evaluate conditions in the following priority order, executing only the first matching case:
   - Case 1: Player holds a Pending_Reward AND their final Location's Region differs from the Region where they captured the Spy
   - Case 2: Player holds a Pending_Reward AND their final Location's Region is the same Region where they captured the Spy
   - Case 3: Region's Spy already captured (by any player) and Player holds no Pending_Reward
   - Case 4: Player is at the uncaptured Spy's Location
   - Case 5: Player is in a Region with an uncaptured Spy but not at the Spy's Location

2. WHEN Case 1 matches, THE Turn_Engine SHALL grant the reward (Action Cards per Reward_Tier, guaranteeing at least one Locator-type card), clear the Pending_Reward flag, and broadcast a public "spy-captured-reward-collected" event containing the Player's identity, the Region where the Spy was captured, and the reward tier.

3. WHEN Case 2 matches, THE Turn_Engine SHALL deliver no clue, take no Spy-related action, and leave the Pending_Reward flag unchanged.

4. WHEN Case 3 matches, THE Turn_Engine SHALL deliver no clue and take no Spy-related action.

5. WHEN Case 4 matches, THE Turn_Engine SHALL capture the Spy for that Player, record the Capture_Order (1st through 6th), set the Pending_Reward flag with the corresponding Reward_Tier, and return a private "Spy captured — leave the region to collect your reward" message to that Player only, without broadcasting any public event.

6. WHEN Case 5 matches, THE Turn_Engine SHALL compute the Spy_Distance from the Player's final Location to that Region's Spy Location using Car/Boat edges only and add a private Notebook_Entry with regionId, roundNumber, and stepsAway.

7. THE Turn_Engine SHALL compute Spy_Distance using shortest-path over only edges with transport type `car` or `boat`, excluding all edges with transport type `plane`.

### Requirement 10: Spy Capture Reward Tiers

**User Story:** As a game designer, I want reward tiers based on capture order so that early Spy captures are more valuable, creating urgency.

#### Acceptance Criteria

1. THE Turn_Engine SHALL assign Reward_Tier based on the game-wide Capture_Order: 1st capture = 4 cards, 2nd capture = 3 cards, 3rd capture = 2 cards, 4th through 6th captures = 1 card each.
2. THE Turn_Engine SHALL track Capture_Order as a sequential counter across all Players in the game, incrementing with each Spy capture regardless of which Player captures it.
3. WHEN granting a reward, THE Turn_Engine SHALL guarantee that at least one card in the reward is of Locator type (a card type that provides Mastermind-location information), even for single-card rewards.
4. THE Turn_Engine SHALL store granted Action Cards in the Player's hand as persistent records queryable for the USE_CARD_Action.
5. THE Turn_Engine SHALL select reward cards from the available card pool using uniform random distribution, with the Locator-type guarantee satisfied first before randomizing remaining cards.

### Requirement 11: Notebook — Private Clue Storage

**User Story:** As a player, I want my Spy-proximity clues stored in a private Notebook, so that I can review past clues to deduce Spy locations.

#### Acceptance Criteria

1. THE Turn_Engine SHALL maintain a private Notebook for each Player, created when the game session begins and stored in the database, accessible only to the owning Player.
2. WHEN a Spy-proximity clue is delivered (Case 5 of Step B), THE Turn_Engine SHALL append a Notebook_Entry containing: regionId (the Region of the Spy), roundNumber (the current Round), and stepsAway (the Spy_Distance computed over Car/Boat edges only).
3. THE Turn_Engine SHALL support a second entry type (Locator) for Mastermind-related clues, with the entry structure defined and populated by the Action Cards spec.
4. WHEN a Player queries their Notebook, THE Turn_Engine SHALL return all Notebook entries belonging to that Player for the current game session, ordered by creation time ascending, with a maximum of 200 entries per response.
5. THE Turn_Engine SHALL NOT expose any Player's Notebook entries to other Players in any API response, poll result, or client-visible state.
6. WHEN a request attempts to access another Player's Notebook, THE Turn_Engine SHALL reject the request and return an error indicating access is denied.

### Requirement 12: Public Event Feed (Tablet)

**User Story:** As a player, I want to see a log of all player actions (movements, card uses, capture attempts, and rewards), so that I can track what everyone is doing on the shared Tablet.

#### Acceptance Criteria

1. THE Turn_Engine SHALL maintain an ordered Event_Feed for each game session, where each entry is assigned a monotonically increasing integer sequence number and includes the round number in which the event occurred.
2. WHEN a Capture Attempt succeeds, THE Turn_Engine SHALL add an event containing: the winning Player's identity, the Mastermind's Location, and a "game-won" type.
3. WHEN a Capture Attempt fails, THE Turn_Engine SHALL add an event containing: the attempting Player's identity, the Location where the attempt was made, and a "capture-failed" type.
4. WHEN a Player collects a Pending_Reward (exits the Spy's Region), THE Turn_Engine SHALL add an event containing: the Player's identity, the Region where the Spy was captured, the reward tier, and a "spy-captured-reward-collected" type.
5. WHEN a Player submits a MOVE_Action that is validated successfully, THE Turn_Engine SHALL add an event containing: the Player's identity, the origin Location, the destination Location, the transport type used, and a "player-moved" type.
6. WHEN a Player submits a USE_CARD_Action that is validated successfully, THE Turn_Engine SHALL add an event containing: the Player's identity, the card type (but not the card's effect outcome), and a "card-used" type.
7. WHEN a Player submits a SKIP_Action, THE Turn_Engine SHALL add an event containing: the Player's identity and a "player-skipped" type.
8. THE Turn_Engine SHALL NOT add events for private clue deliveries (Notebook entries) or for internal state changes not visible to other players.
9. WHEN a Player polls the Event_Feed with a sequence number, THE Turn_Engine SHALL return all entries with a sequence number greater than the provided value, up to a maximum of 50 entries per response.

### Requirement 13: Skip-Next-Turn Penalty

**User Story:** As a game designer, I want failed Capture Attempts to cost the player their next turn, so that guessing has a meaningful risk.

#### Acceptance Criteria

1. WHEN a Capture Attempt fails, THE Turn_Engine SHALL set the Skip_Next_Turn_Flag on the failing Player.
2. WHEN a Player's turn begins and Skip_Next_Turn_Flag is set, THE Turn_Engine SHALL skip that Player's entire turn including both Action_Slots and End_Of_Turn_Resolution (no actions executed, no Spy-proximity clue delivered, no Pending_Reward collection evaluated), clear the flag, and advance to the next Player in turn order.
3. WHEN a Player's turn is skipped due to Skip_Next_Turn_Flag, THE Turn_Engine SHALL broadcast a public Event_Feed entry indicating which Player's turn was skipped due to a prior failed Capture Attempt.
4. THE Turn_Engine SHALL persist the Skip_Next_Turn_Flag in the database so that the penalty survives server restarts.
5. THE Turn_Engine SHALL clear the Skip_Next_Turn_Flag only by consuming it (auto-skipping the turn), not by any other game action.
6. IF multiple consecutive Players in turn order each have Skip_Next_Turn_Flag set, THEN THE Turn_Engine SHALL evaluate and skip each flagged Player individually in turn order until reaching a Player without the flag.

### Requirement 14: Game End Condition

**User Story:** As a game designer, I want the game to end immediately when a correct Capture Attempt is made, so that there is a clear winner.

#### Acceptance Criteria

1. WHEN a Capture Attempt succeeds (Player's final Location matches Mastermind Location), THE Turn_Engine SHALL transition the Room status from "in-progress" to "finished".
2. WHEN the Room status transitions to "finished", THE Turn_Engine SHALL reject all subsequent action submissions for that Room and return an error indicating the game has ended.
3. WHEN the game ends via a successful Capture Attempt, THE Turn_Engine SHALL reveal the Mastermind's Location to all players in the Room as part of the game-won event.
4. WHEN a Capture Attempt succeeds, THE Turn_Engine SHALL record the identity of the Player who made the successful Capture Attempt as the winner in the game session state.

### Requirement 15: Turn Action API

**User Story:** As a frontend developer, I want an API endpoint to submit turn actions, so that the client can send player decisions to the server.

#### Acceptance Criteria

1. THE Turn_Engine SHALL expose an API endpoint that accepts a single action submission (one Action_Slot at a time) from the Current_Player, requiring a Room identifier, the action type (MOVE, SKIP, CAPTURE_ATTEMPT, or USE_CARD), and type-specific parameters (target Location for MOVE, card identifier for USE_CARD).
2. WHEN an action is submitted and validated successfully, THE Turn_Engine SHALL execute the action and return a success response containing: the action type executed, the Action_Slot number consumed (1 or 2), and the number of remaining Action_Slots in the current turn.
3. WHEN the second Action_Slot is filled, THE Turn_Engine SHALL automatically trigger End_Of_Turn_Resolution and include in the response: any Notebook_Entry added (regionId, roundNumber, stepsAway), any Spy capture event (region and capture order), any Pending_Reward status change, and any Capture Attempt outcome (success or failure).
4. WHEN a MOVE_Action is executed successfully, THE Turn_Engine SHALL include the Player's updated current Location in the response.
5. IF the action results in a game-ending event, THEN THE Turn_Engine SHALL include the game-won outcome in the response, containing the winning Player's identity and the revealed Mastermind Location.
6. IF the submitting Player is not authenticated, THEN THE Turn_Engine SHALL reject the request with an error indicating authentication required.
7. IF the submitting Player is authenticated but is not the Current_Player for the specified Room, THEN THE Turn_Engine SHALL reject the request with an error indicating it is not the Player's turn.
8. IF the action submission fails validation (invalid move, invalid card, duplicate CAPTURE_ATTEMPT, or unknown action type), THEN THE Turn_Engine SHALL reject the request with an error indicating the specific validation failure reason without modifying any game state.

### Requirement 16: Game State Polling

**User Story:** As a frontend developer, I want to poll for current game state including positions, turn status, and events, so that the client can render an up-to-date game view without WebSockets.

#### Acceptance Criteria

1. THE Turn_Engine SHALL expose an API endpoint returning the current game state for a given Room, including: all Player positions, the Current_Player's identity, the current Round number, the current Action_Slot number, and the Room status.
2. THE Turn_Engine SHALL include the requesting Player's private data (Notebook entries, held Action Cards, Pending_Reward status, Skip_Next_Turn_Flag status) in the polling response.
3. WHEN the request includes a sequence number, THE Turn_Engine SHALL include new Event_Feed entries with sequence numbers greater than the provided value, up to a maximum of 50 entries.
4. THE Turn_Engine SHALL NOT include hidden game state (Mastermind Location, uncaptured Spy Locations) in the polling response.
5. THE Turn_Engine SHALL support polling without requiring the caller to be the Current_Player, so that all Players can observe game progress.
6. IF a polling request specifies a Room that does not exist or the requesting Player is not a member of that Room, THEN THE Turn_Engine SHALL return an error indicating access denied.

### Requirement 17: Data Integrity and Concurrency

**User Story:** As a developer, I want turn actions processed atomically with proper concurrency controls, so that race conditions cannot corrupt game state.

#### Acceptance Criteria

1. THE Turn_Engine SHALL process each action submission within a database transaction encompassing validation, execution, and state updates.
2. THE Turn_Engine SHALL use optimistic or pessimistic locking to prevent two simultaneous submissions from the same Player in the same turn from both being accepted.
3. IF a concurrent action submission conflicts with an in-progress action for the same turn, THEN THE Turn_Engine SHALL reject the conflicting submission with an error indicating a concurrency conflict and leave the Player's Action_Slot state unchanged so the Player may retry.
4. THE Turn_Engine SHALL ensure End_Of_Turn_Resolution executes exactly once per turn, even under concurrent polling or submission pressure.
5. THE Turn_Engine SHALL execute the full turn action (validation, execution, and End_Of_Turn_Resolution if applicable) atomically, so that partial state changes are not visible to other players.
6. IF a database transaction fails due to a deadlock, timeout, or infrastructure error during action processing, THEN THE Turn_Engine SHALL roll back all changes within that transaction, preserve the prior game state, and return an error indicating a transient failure.
