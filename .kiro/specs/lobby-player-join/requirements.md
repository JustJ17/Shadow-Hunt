# Requirements Document

## Introduction

This document defines the requirements for the Lobby and Player Join system in Shadow Hunt. The lobby allows a host to create a game room, configure basic settings, and have other players join before the game starts. It covers room creation, joining via room code or public listing, player readiness, lobby state management, and player disconnection handling during active games.

## Glossary

- **Host**: The player who creates a game room and has authority over room settings and game start.
- **Room**: A game session lobby where players gather before the game begins.
- **Room_Code**: A unique, short alphanumeric identifier (exactly 6 characters, case-insensitive) used to join a specific room.
- **Player**: A human user who joins a room to participate in a game.
- **Lobby_System**: The server-side subsystem responsible for managing room lifecycle, player membership, and readiness state.
- **Room_Visibility**: A setting indicating whether a room is publicly listed ("public") or only accessible via Room_Code ("private").
- **Polling_Service**: The client-side mechanism that sends periodic requests to the server to fetch updated game state.
- **Disconnected_Player**: A player who has not polled the server within the configured disconnection timeout threshold.
- **Display_Name**: A player-provided name shown to other players in the lobby and during the game.
- **Last_Activity_Timestamp**: The server-recorded time of a player's most recent polling request, used for disconnection detection.

## Requirements

### Requirement 1: Room Creation

**User Story:** As a player, I want to create a new game room, so that I can host a game session for others to join.

#### Acceptance Criteria

1. WHEN a player requests to create a room with a valid display name, THE Lobby_System SHALL generate a unique Room_Code, create a new room record in Postgres, and assign the player as Host.
2. WHEN a room is created, THE Lobby_System SHALL set the room status to "waiting", the player count to 1, and the Host's readiness state to "not ready".
3. THE Lobby_System SHALL generate Room_Codes that are exactly 6 alphanumeric characters, case-insensitive, and unique across all active rooms.
4. WHEN a room is created, THE Lobby_System SHALL return the generated Room_Code and the initial room state to the Host's client.
5. IF a player requests to create a room while already a member of another room, THEN THE Lobby_System SHALL return an error indicating the player must leave their current room first.

### Requirement 2: Joining a Room via Room Code

**User Story:** As a player, I want to join an existing room using a room code, so that I can play with friends who shared their code.

#### Acceptance Criteria

1. WHEN a player submits a valid Room_Code for a room in "waiting" status with fewer than 4 players, THE Lobby_System SHALL perform a case-insensitive lookup of the Room_Code, add the player to the room, and return the current lobby state.
2. IF a player submits a Room_Code that does not match any active room, THEN THE Lobby_System SHALL return an error indicating the room was not found.
3. IF a player submits a Room_Code for a room that already has 4 players, THEN THE Lobby_System SHALL return an error indicating the room is full.
4. IF a player submits a Room_Code for a room that is not in "waiting" status, THEN THE Lobby_System SHALL return an error indicating the game has already started.
5. IF a player submits a Room_Code for a room they are already a member of, THEN THE Lobby_System SHALL return an error indicating the player is already in the room.
6. IF a player who is already a member of another room submits a Room_Code to join a different room, THEN THE Lobby_System SHALL return an error indicating the player must leave their current room before joining a new one.

### Requirement 3: Player Limit Enforcement

**User Story:** As a host, I want the system to enforce a maximum of 4 players per room, so that the game stays within its designed player count.

#### Acceptance Criteria

1. THE Lobby_System SHALL maintain a player count per room that never exceeds 4, including the Host and any players with a "disconnected" status.
2. IF a join request arrives for a room that has reached the 4-player maximum, THEN THE Lobby_System SHALL reject the request, return an error indicating the room is full, and leave the existing room state unchanged.
3. WHEN a player is added to a room, THE Lobby_System SHALL increment the room's player count by 1 and prevent further joins once the count equals 4.

### Requirement 4: Minimum Player Enforcement

**User Story:** As a host, I want the system to require at least 2 players before starting, so that the game is playable.

#### Acceptance Criteria

1. IF the Host requests to start the game and fewer than 2 players (including the Host) are in the room, THEN THE Lobby_System SHALL reject the request and return an error indicating insufficient players.
2. WHEN 2 or more players (including the Host) are present, all non-host players are ready, and the Host requests to start, THE Lobby_System SHALL transition the room to "in-progress" status.
3. IF a non-Host player sends a start-game request, THEN THE Lobby_System SHALL reject the request and return an error indicating only the Host can start the game.

### Requirement 5: Player Readiness

**User Story:** As a player, I want to indicate that I am ready to play, so that the host knows when everyone is prepared.

#### Acceptance Criteria

1. WHEN a player joins a room, THE Lobby_System SHALL set that player's readiness state to "not ready" by default.
2. WHEN a player in the room toggles their ready status, THE Lobby_System SHALL update and persist that player's readiness state, switching between "ready" and "not ready".
3. IF the Host attempts to start the game and at least one non-host player is not ready, THEN THE Lobby_System SHALL reject the request and return an error indicating not all players are ready.
4. WHEN a new player joins a room that already has players, THE Lobby_System SHALL reset all existing players' readiness states to "not ready".

### Requirement 6: Host Leaving the Lobby

**User Story:** As a player, I want the room to remain functional if the host leaves before the game starts, so that we don't lose our gathered group.

#### Acceptance Criteria

1. WHEN the Host leaves a room in "waiting" status and at least one other player remains, THE Lobby_System SHALL assign host privileges to the remaining player with the earliest join timestamp.
2. WHEN the Host leaves a room in "waiting" status and no other players remain, THE Lobby_System SHALL delete the room.
3. WHEN a new Host is assigned, THE Lobby_System SHALL notify all remaining players of the new host identity via the next polling response.
4. WHEN a new Host is assigned, THE Lobby_System SHALL remove the readiness state from the newly assigned Host and preserve the readiness states of all other remaining players.
5. IF the Host has not polled the server within the disconnection timeout threshold while the room is in "waiting" status, THEN THE Lobby_System SHALL treat the Host as having left and apply the same host-transfer or room-deletion logic.

### Requirement 7: Player Leaving the Lobby

**User Story:** As a player, I want to leave a room before the game starts, so that I can change my mind without affecting others.

#### Acceptance Criteria

1. WHEN a non-host player leaves a room in "waiting" status, THE Lobby_System SHALL remove the player from the room, decrement the player count, and persist the change.
2. WHEN a player leaves, THE Lobby_System SHALL reset all remaining players' readiness states to "not ready".
3. WHEN a player leaves the room, THE Lobby_System SHALL include the updated player list in the next polling response to all remaining players.
4. IF a player attempts to leave a room that is in "in-progress" status, THEN THE Lobby_System SHALL return an error indicating they cannot leave during an active game.

### Requirement 8: Game Start Transition

**User Story:** As a host, I want to start the game when everyone is ready, so that we can begin playing.

#### Acceptance Criteria

1. WHEN the Host requests to start the game and all preconditions are met (minimum 2 players, all non-host players ready), THE Lobby_System SHALL transition the room status from "waiting" to "in-progress".
2. WHEN the room transitions to "in-progress", THE Lobby_System SHALL assign each player a unique turn position from 1 to N (where N is the total number of players) using a randomized order, and include the assigned turn order in the lobby state returned by subsequent polling responses.
3. WHEN the room transitions to "in-progress", THE Lobby_System SHALL prevent any new players from joining the room for the duration of the game session.
4. IF a player attempts to join a room that is in "in-progress" status, THEN THE Lobby_System SHALL reject the request and return an error indicating the game has already started.

### Requirement 9: Lobby State Polling

**User Story:** As a player, I want to see real-time updates of who is in the lobby and their readiness, so that I know when we can start.

#### Acceptance Criteria

1. WHEN a player polls the lobby state, THE Lobby_System SHALL return the current list of players, their readiness states, the host identity, and the room status.
2. THE Lobby_System SHALL respond to each polling request within 500 milliseconds under normal operation with up to 4 concurrent players per room polling at intervals of 3 to 5 seconds.
3. WHEN a player successfully polls the lobby state, THE Lobby_System SHALL update that player's last-activity timestamp to the current server time, serving as the liveness signal for disconnection detection.
4. IF a player polls a room that no longer exists or that the player is not a member of, THEN THE Lobby_System SHALL return an error indicating the room was not found or the player is not in the room.

### Requirement 10: Room Visibility (Public vs Private)

**User Story:** As a host, I want to choose whether my room is publicly listed or private, so that I can either play with friends only or allow anyone to join.

#### Acceptance Criteria

1. WHEN a player creates a room, THE Lobby_System SHALL require the Host to specify a Room_Visibility of either "public" or "private".
2. WHILE a room has Room_Visibility set to "public" and status is "waiting" and player count is below 4, THE Lobby_System SHALL include the room in the public room list accessible from the main page, displaying for each room the Host's name, current player count, and Room_Code.
3. WHILE a room has Room_Visibility set to "private", THE Lobby_System SHALL exclude the room from the public room list.
4. WHILE a room has Room_Visibility set to "private", THE Lobby_System SHALL allow players to join only via Room_Code.
5. WHEN multiple players attempt to join a public room simultaneously and only one slot remains, THE Lobby_System SHALL ensure exactly one player successfully joins and all other concurrent requests receive an error indicating the room is full, without exceeding the 4-player maximum.
6. IF a concurrent join request fails due to the room reaching capacity during the operation, THEN THE Lobby_System SHALL return an error indicating the room is full without corrupting room state.
7. WHEN the Host changes the Room_Visibility setting while the room is in "waiting" status, THE Lobby_System SHALL update the room's listing presence in the public room list within the next polling cycle.
8. THE Lobby_System SHALL display a maximum of 50 public rooms in the public room list, ordered by most recently created first.

### Requirement 11: Player Disconnection During Active Game

**User Story:** As a player, I want the game to continue smoothly if another player disconnects, so that the remaining players are not blocked from playing.

#### Acceptance Criteria

1. IF a player has not polled the server within the configured disconnection timeout threshold, THEN THE Lobby_System SHALL mark that player's status as "disconnected".
2. WHEN a Disconnected_Player's turn arrives in the turn order, THE Lobby_System SHALL automatically skip that turn and advance to the next player in sequence.
3. WHEN a Disconnected_Player resumes polling within the same game session before being removed, THE Lobby_System SHALL restore that player's status to "connected" and allow the player to take actions on their next scheduled turn.
4. WHILE a player is marked as "disconnected", THE Lobby_System SHALL continue the game turn sequence with all remaining connected players without pausing or waiting for the disconnected player.
5. THE Lobby_System SHALL use a disconnection timeout threshold of 10 seconds, which is at least twice the maximum expected polling interval of 5 seconds, to avoid false disconnection detection due to transient network delays.
6. WHEN a player's status changes between "connected" and "disconnected", THE Lobby_System SHALL include the updated status in the next polling response to all other players in the room.
7. IF all players in a game session are marked as "disconnected" and none reconnect within 60 seconds, THEN THE Lobby_System SHALL terminate the game session and set the room status to "abandoned".
8. IF a player remains in "disconnected" status for more than 5 consecutive minutes during an active game, THEN THE Lobby_System SHALL permanently remove that player from the game session and treat them as having forfeited.
