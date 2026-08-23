# Requirements Document

## Introduction

The Win Detection & Game End system handles the final phase of a Shadow Hunt game session: detecting terminal conditions (win or draw), persisting a game result record, and rendering an end-screen UI. It builds on the Movement & Turn Actions spec, which already resolves Capture Attempts (setting Room status to "finished" and emitting a `game-won` event on success). This spec adds draw detection when rounds exceed a configurable maximum, a queryable game result record, Mastermind reveal on game end (both win and draw), and a simple end-screen view.

The Turn_Engine's `advanceTurn` function increments the round counter after all players have acted in a round. This spec hooks into that round-advancement logic to check whether the new round exceeds the configured maximum, triggering a draw if so.

## Glossary

- **Turn_Engine**: The server-side module responsible for managing turn order, action execution, end-of-turn resolution, and now game-end detection.
- **Room**: The game session entity; status values are "waiting", "in-progress", or "finished".
- **Round**: One complete cycle of all Players taking their turns. Tracked by the `currentRound` field in GameTurn.
- **Max_Round_Limit**: A configurable positive integer (default: 20) representing the maximum number of complete Rounds before the game ends in a draw.
- **Game_Result**: A persistent record storing the outcome of a finished game: either "win" (with winnerId, winning locationId, and mastermindLocationId) or "draw" (with the round at which the draw was declared and mastermindLocationId).
- **Draw_Condition**: The state reached when `advanceTurn` increments the round counter to a value exceeding Max_Round_Limit with no prior successful Capture Attempt.
- **End_Screen**: A client-side UI view displayed when the game has finished, showing the game outcome to all players.
- **Mastermind**: The hidden Main Threat entity whose true Location is stored server-side and revealed upon game end (both win and draw).
- **Event_Feed**: The public ordered log of game events (the "Tablet"), visible to all players.
- **Game_Won_Event**: An Event_Feed entry of type "game-won" containing winnerId and mastermindLocationId, emitted by the Capture Attempt resolution in the Movement & Turn Actions spec.
- **Game_Draw_Event**: An Event_Feed entry of type "game-draw" emitted when Max_Round_Limit is exceeded, containing the round number at which the draw was declared and mastermindLocationId.
- **Player**: A participant in an active game session.

## Requirements

### Requirement 1: Draw Detection on Round Advancement

**User Story:** As a game designer, I want the game to end as a draw when the maximum round limit is exceeded without a winner, so that games do not continue indefinitely.

#### Acceptance Criteria

1. WHEN `advanceTurn` increments the round counter to a value exceeding Max_Round_Limit, THE Turn_Engine SHALL transition the Room status from "in-progress" to "finished" within the same database transaction.
2. WHEN the Draw_Condition is detected, THE Turn_Engine SHALL append a Game_Draw_Event to the Event_Feed with the next monotonically increasing sequence number, containing the round number at which the draw was declared and a "game-draw" type.
3. WHEN the Draw_Condition is detected, THE Turn_Engine SHALL include the Mastermind's Location (mastermindLocationId) in the Game_Draw_Event payload.
4. WHEN the Draw_Condition is detected, THE Turn_Engine SHALL create a Game_Result record with outcome "draw", the round number at which the draw was declared, mastermindLocationId, and a null winner field.
5. THE Turn_Engine SHALL use a default Max_Round_Limit of 20 rounds.
6. THE Turn_Engine SHALL store the Max_Round_Limit as a configurable integer value associated with the Room, set at game initialization time, immutable during the game, and constrained to a minimum of 1 and a maximum of 100.
7. IF the Room status is already "finished" when `advanceTurn` executes (due to a successful Capture Attempt resolved earlier in the same turn), THEN THE Turn_Engine SHALL NOT evaluate the Draw_Condition.

### Requirement 2: Game Result Persistence

**User Story:** As a developer, I want a queryable game result record created when the game ends, so that the end-screen and future features (stats, history) can retrieve the outcome.

#### Acceptance Criteria

1. WHEN a game ends via a successful Capture Attempt, THE Turn_Engine SHALL create a Game_Result record with outcome "win", the winnerId, the winning locationId (where the capture was made), the mastermindLocationId, and the round number at which the win occurred.
2. WHEN a game ends via the Draw_Condition (round number exceeds the configured maximum round limit), THE Turn_Engine SHALL create a Game_Result record with outcome "draw", the round number at which the draw was declared, and the mastermindLocationId.
3. THE Turn_Engine SHALL create exactly one Game_Result record per finished game session, enforced by a unique constraint on roomId.
4. THE Turn_Engine SHALL store the Game_Result record in the database within the same transaction that transitions the Room to "finished".
5. WHEN a client queries the Game_Result for a Room that is in "finished" status, THE Turn_Engine SHALL return the stored outcome, the round number, the mastermindLocationId, and for a "win" outcome additionally include the winnerId and winning locationId.
6. WHEN a client queries the Game_Result for a Room that is not yet in "finished" status, THE Turn_Engine SHALL return a response indicating the game is still in progress without any outcome data.
7. IF a client queries the Game_Result for a Room that does not exist, THEN THE Turn_Engine SHALL return an error indicating the room was not found.
8. IF a client queries the Game_Result for a Room that the client is not a member of, THEN THE Turn_Engine SHALL return an error indicating access denied.

### Requirement 3: Mastermind Location Reveal on Game End

**User Story:** As a player, I want to see the Mastermind's true location revealed when the game ends (via win or draw), so that I can understand the answer to the puzzle.

#### Acceptance Criteria

1. WHEN the game ends (via a successful Capture Attempt or a draw), THE End_Screen SHALL display the Mastermind's true Location (name and region) to all Players in the Room.
2. THE End_Screen SHALL retrieve the Mastermind's Location from the Game_Won_Event payload (mastermindLocationId field) or the Game_Draw_Event payload (mastermindLocationId field) or from the Game Result API, not from any separate query to hidden game state.
3. WHEN the game ends via a draw, THE End_Screen SHALL display the Mastermind's true Location (name and region) to all Players in the Room.

### Requirement 4: Action Rejection After Game End

**User Story:** As a developer, I want all action submissions rejected once the game has ended, so that no further state changes are possible on a finished game.

#### Acceptance Criteria

1. WHEN the Room status is "finished" (from either a win or a draw), THE Turn_Engine SHALL reject all action submissions for that Room and return an error indicating the game has ended, using the same GAME_NOT_ACTIVE rejection applied by the existing Room status check at the beginning of action processing.
2. IF an action submission arrives after the Room status has transitioned to "finished" due to a draw but before the client has received the draw notification, THEN THE Turn_Engine SHALL reject the submission with the same GAME_NOT_ACTIVE error, relying on the Room status check that occurs within the existing SELECT FOR UPDATE lock on the game_turns row.
3. THE Turn_Engine SHALL handle the draw-triggered lock using the same mechanism already used for win-triggered lock (Room status check at the beginning of action processing), requiring no additional lock implementation.

### Requirement 5: Game End Event Types

**User Story:** As a frontend developer, I want distinct event types for win and draw in the Event Feed, so that the client can render the appropriate end-screen based on event type.

#### Acceptance Criteria

1. WHEN a game ends via a successful Capture Attempt, THE Turn_Engine SHALL emit a "game-won" event (already defined in Movement & Turn Actions spec) containing: winnerId, the Location where the capture was made, and mastermindLocationId.
2. WHEN the Draw_Condition is detected (round counter exceeds the Room's configured Max_Round_Limit, default 20), THE Turn_Engine SHALL emit a "game-draw" event containing: the round number at which the draw was declared, mastermindLocationId, and a reason field set to "max-rounds-exceeded".
3. THE Turn_Engine SHALL NOT emit both a "game-won" and a "game-draw" event for the same game session.
4. THE Turn_Engine SHALL assign the "game-draw" event a monotonically increasing sequence number consistent with other events in the Room's Event_Feed.
5. WHEN the Turn_Engine advances the turn after the last Player in a Round and the new round counter exceeds the Room's Max_Round_Limit, THE Turn_Engine SHALL evaluate the draw condition before beginning a new Round.

### Requirement 6: End-Screen UI — Win Outcome

**User Story:** As a player, I want to see a clear win screen showing who won and how, so that the game conclusion is satisfying and informative.

#### Acceptance Criteria

1. WHEN the game status is "finished" and the Event_Feed contains a "game-won" event, THE End_Screen SHALL display the winning Player's display name.
2. WHEN the game status is "finished" and the Event_Feed contains a "game-won" event, THE End_Screen SHALL display the Location name where the successful Capture Attempt was made.
3. WHEN the game status is "finished" and the Event_Feed contains a "game-won" event, THE End_Screen SHALL display the Mastermind's true Location name (resolved from mastermindLocationId).
4. WHEN the game status is "finished" and the Event_Feed contains a "game-won" event, THE End_Screen SHALL render the winning Player's display name with a dedicated visual indicator (such as a trophy icon, distinct background color, or label) that is not applied to other Players, so that the winner is identifiable without reading all names.
5. WHEN the game status transitions to "finished" with a "game-won" event, THE End_Screen SHALL render automatically for all Players currently in the Room without requiring manual navigation.
6. IF the End_Screen cannot resolve the winning Player's display name or a Location name from the Game Result API within 5 seconds, THEN THE End_Screen SHALL display a fallback message indicating that result details are unavailable and prompt the Player to refresh.
7. WHEN the End_Screen is displayed, THE End_Screen SHALL indicate whether the viewing Player is the winner (e.g., a "You won!" heading) or is a non-winning participant (e.g., a "[Player name] found the target" heading).

### Requirement 7: End-Screen UI — Draw Outcome

**User Story:** As a player, I want to see a clear draw screen when the game ends without a winner, so that I understand why the game ended.

#### Acceptance Criteria

1. WHEN the game status is "finished" and the Event_Feed contains a "game-draw" event, THE End_Screen SHALL display a heading indicating the game ended in a draw.
2. WHEN the game status is "finished" and the Event_Feed contains a "game-draw" event, THE End_Screen SHALL display the reason (maximum rounds exceeded) and the round number at which the draw was declared.
3. WHEN the game ends in a draw, THE End_Screen SHALL display the Mastermind's true Location name (resolved from mastermindLocationId in the game-draw event or Game Result API).
4. THE End_Screen SHALL be accessible to all Players in the Room without requiring any specific role or status.

### Requirement 8: End-Screen Navigation and Access

**User Story:** As a frontend developer, I want the end-screen to be reachable via normal polling flow, so that players see the result without special navigation.

#### Acceptance Criteria

1. WHEN a Player's polling response returns Room status "finished", THE client application SHALL automatically transition the game view to the End_Screen without requiring any user interaction.
2. THE End_Screen SHALL determine the game outcome by examining the Event_Feed for the presence of a "game-won" or "game-draw" event and rendering the corresponding outcome view (win or draw).
3. IF the Room status is "finished" but the Event_Feed contains neither a "game-won" nor a "game-draw" event, THEN THE End_Screen SHALL display a generic "game ended" message and provide the navigation option to leave the Room.
4. WHEN a Player navigates directly to a game URL for a Room with status "finished", THE client application SHALL display the End_Screen on initial render without first displaying the active game view.
5. THE End_Screen SHALL include a navigation element that returns the Player to the lobby screen.
6. THE End_Screen SHALL render using data available from the existing game state polling endpoint (status, events, player data), without requiring a separate dedicated API endpoint.

### Requirement 9: Game Result Query API

**User Story:** As a frontend developer, I want an API endpoint to query the game result, so that the end-screen can fetch structured outcome data.

#### Acceptance Criteria

1. THE Turn_Engine SHALL expose a GET API endpoint that accepts a Room identifier and requires cookie-based session authentication, returning the Game_Result for the specified Room.
2. WHEN the Room status is "finished" with a "win" outcome, THE API SHALL return: outcome "win", winnerId, winner's displayName, winning locationId, winning location name, mastermindLocationId, and Mastermind location name.
3. WHEN the Room status is "finished" with a "draw" outcome, THE API SHALL return: outcome "draw", the round number at which the draw was declared, the reason "max-rounds-exceeded", mastermindLocationId, and Mastermind location name.
4. WHEN the Room status is not "finished", THE API SHALL return a response with outcome "in-progress" and no result data.
5. IF the requesting Player is not a member of the specified Room, THEN THE API SHALL return an error response indicating access denied with HTTP status 403.
6. THE API SHALL resolve location identifiers to their stored location name values in the response, so the client does not need a separate location lookup.
7. IF the request does not contain a valid session cookie, THEN THE API SHALL return an error response indicating authentication is required with HTTP status 401.
8. IF the specified Room does not exist, THEN THE API SHALL return an error response indicating the room was not found with HTTP status 404.
