# Lobby & Player Join — Manual Test Scenarios

Step-by-step scenarios you can follow in the browser to verify the lobby system works correctly.

## Prerequisites

1. **Clone and install:**
   ```bash
   git clone <repository-url>
   cd Shadow-Hunt
   npm install
   ```

2. **Set up the database:**
   - Copy `.env.example` to `.env` and set `DATABASE_URL` to your Postgres connection string.
   - Run migrations:
     ```bash
     npx prisma migrate dev
     ```

3. **Start the dev server:**
   ```bash
   npm run dev
   ```
   The app should be running at `http://localhost:3000`.

4. **Open two browser windows (or tabs):**
   - **Window A** — represents the host / first player.
   - **Window B** — represents a second player joining the room.
   - For scenarios involving more players, open additional windows (C, D).

5. **Tip:** Use different browsers or incognito/private mode for each window so player sessions stay separate.

---

## Scenario 1: Create a Room

**Goal:** Verify a player can create a new room and lands in the lobby.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In Window A, navigate to `http://localhost:3000`. | The home page loads with options to create a room, join by code, or browse public rooms. |
| 2 | Click "Create Room" (or the equivalent button). | A form appears asking for a display name and room visibility (public/private). |
| 3 | Enter a display name (e.g. "Alice") and select "Private". | The form accepts the input. |
| 4 | Click "Submit" / "Create". | The page redirects to the lobby view (`/lobby/<ROOM_CODE>`). |
| 5 | Observe the lobby page. | You see: a 6-character room code displayed prominently, yourself listed as a player with a "Host" badge, your readiness showing "Not Ready", and a "Start Game" button (disabled). |

---

## Scenario 2: Join by Code

**Goal:** Verify a second player can join an existing room using the room code.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In Window A, note the 6-character room code shown on the lobby page. | Code is visible (e.g. "AB3X9K"). |
| 2 | In Window B, navigate to `http://localhost:3000`. | Home page loads. |
| 3 | Click "Join Room" (or equivalent). | A form appears asking for a display name and room code. |
| 4 | Enter a display name (e.g. "Bob") and paste the room code from Step 1. | The form accepts the input. |
| 5 | Click "Submit" / "Join". | Window B redirects to the same lobby page (`/lobby/<ROOM_CODE>`). |
| 6 | In Window B, observe the player list. | Both "Alice" (Host) and "Bob" are listed. Both show "Not Ready". |
| 7 | In Window A, wait 3–5 seconds for the next poll cycle. | Alice's view updates to show "Bob" in the player list. Both players show "Not Ready" (readiness was reset on join). |

---

## Scenario 3: Toggle Ready

**Goal:** Verify players can toggle their readiness state and others see the update.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In Window B (Bob), click the "Ready" button. | Bob's readiness indicator changes to "Ready". |
| 2 | In Window A (Alice), wait for the next poll (3–5s). | Alice's lobby view shows Bob as "Ready". |
| 3 | In Window B (Bob), click "Ready" again to unready. | Bob's indicator switches back to "Not Ready". |
| 4 | In Window A, wait for the next poll. | Alice's view shows Bob as "Not Ready" again. |
| 5 | In Window B, click "Ready" one more time to set as "Ready". | Bob shows "Ready". |

---

## Scenario 4: Start Game

**Goal:** Verify the host can start the game when all non-host players are ready, and that preconditions are enforced.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In Window A (Alice, Host), with Bob showing "Not Ready", click "Start Game". | An error is displayed: not all players are ready. The game does not start. |
| 2 | Ensure Bob is "Ready" (from Scenario 3 Step 5). | Bob's readiness shows "Ready" in both windows. |
| 3 | In Window A, click "Start Game". | The room transitions to "in-progress". The lobby UI updates to show the game has started and displays turn order. |
| 4 | In Window B, wait for the next poll. | Bob's view also shows the game has started with the assigned turn order. |
| 5 | (Optional) Verify no one else can join: In a new Window C, try joining with the same room code. | An error is returned indicating the game has already started. |

---

## Scenario 5: Leave Room

**Goal:** Verify a non-host player can leave a room in "waiting" status and the player list updates.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start fresh: Create a room in Window A ("Alice"), join from Window B ("Bob"). Both players are in the lobby. | Lobby shows Alice (Host) and Bob. |
| 2 | In Window B (Bob), click "Leave Room". | Bob is removed from the lobby and redirected to the home page. |
| 3 | In Window A, wait for the next poll. | Alice's player list now shows only herself. Her readiness is reset to "Not Ready". |
| 4 | (Optional) In Window B, try joining the same room again. | Bob successfully re-joins. Both players appear in the lobby. |

---

## Scenario 6: Host Transfer

**Goal:** Verify that when the host leaves, the longest-tenured remaining player becomes the new host.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a room in Window A ("Alice"). Join from Window B ("Bob"). Optionally join from Window C ("Charlie"). | Lobby shows Alice (Host), Bob, and optionally Charlie. |
| 2 | In Window A (Alice, Host), click "Leave Room". | Alice is removed from the lobby and redirected to the home page. |
| 3 | In Window B, wait for the next poll. | Bob now has the "Host" badge. Bob's readiness is set to "Not Ready". Charlie's (if present) readiness may also be reset. |
| 4 | Verify Bob can now start the game (if preconditions met) or that the "Start Game" button is visible to Bob. | The Start Game button appears for Bob (the new host). |
| 5 | (Edge case) If Bob is the only remaining player and he also leaves, the room should be deleted. Try joining the same room code from another window. | Error: room not found. |

---

## Scenario 7: Browse Public Rooms

**Goal:** Verify public rooms appear in the browse list and can be joined from there.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In Window A, create a room with visibility set to "Public" and display name "Alice". | Room is created and you land in the lobby. |
| 2 | In Window B, navigate to `http://localhost:3000`. | Home page loads. |
| 3 | Click "Browse Rooms" (or equivalent tab/section). | A list of public rooms is displayed. |
| 4 | Verify the room created by Alice appears in the list. | The list shows a room with host name "Alice", player count "1/4", and the room code. |
| 5 | Click "Join" next to Alice's room (or enter the code from the listing). | Window B joins the room and redirects to the lobby page. |
| 6 | In Window A, wait for the next poll. | Alice's lobby now shows the new player in the list. |
| 7 | Fill the room to 4 players (join from Windows C and D). | Room shows 4/4 players. |
| 8 | In a new Window E, browse public rooms. | Alice's room no longer appears in the public list (it's full). |

---

## Scenario 8: Disconnection

**Goal:** Verify that closing a tab triggers disconnection detection after the timeout threshold.

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create a room in Window A ("Alice") and join from Window B ("Bob"). | Both players appear in the lobby. |
| 2 | Close Window B entirely (simulating a disconnect). | Nothing happens immediately — the server hasn't detected it yet. |
| 3 | In Window A, wait approximately 10–15 seconds (disconnection timeout is 10s, plus one poll cycle). | Bob's status changes to "Disconnected" in Alice's player list. |
| 4 | Re-open a window and have Bob rejoin (or poll) with the same player session. | Bob's status returns to "Connected". |
| 5 | (In-game variant) Start a game with 2+ players, then close one player's window. Wait 10+ seconds. | The disconnected player is shown as "Disconnected". Their turns are skipped automatically. |
| 6 | (Abandonment) Close ALL player windows for a room in "in-progress" status. Wait 60+ seconds. | The room transitions to "abandoned" status (verifiable via database or API). |
| 7 | (Forfeit) With a game in progress, keep one player disconnected for 5+ minutes. | That player is permanently removed from the game session. |

---

## Quick Reference: Error Messages

| Situation | Expected Error |
|-----------|---------------|
| Create/join while already in a room | "Must leave current room first" |
| Join with an invalid room code | "Room not found" |
| Join a full room (4 players) | "Room is full" |
| Join a room where game started | "Game has already started" |
| Start with < 2 players | "Insufficient players" |
| Start when not all ready | "Not all players are ready" |
| Non-host tries to start | "Only the host can start the game" |
| Leave during an active game | "Cannot leave during an active game" |
