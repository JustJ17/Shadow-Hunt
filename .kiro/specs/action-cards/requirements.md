# Requirements Document

## Introduction

The Action Cards system implements the MVP card subsystem for Shadow Hunt. It builds directly on the Movement & Turn Actions implementation, which already provides the two-action-slot turn loop, the `USE_CARD` action, the `ActionCard` model, the Spy capture reward flow, the Notebook, and the public Event Feed. In the current codebase `USE_CARD` marks a card consumed and then calls an explicitly empty `dispatchCardEffect` stub, so no card has any effect yet. This spec defines the ten MVP cards, their effects, their resolution timing, and the turn-engine changes required to support them.

The MVP card pool has ten cards in three categories: **Sabotage** (interfere with other agents or movement routes), **Clues** (provide information about the Mastermind and/or the Spy), and **Boosters** (provide movement or turn advantages). There is no separate Investigate action — Clue cards are the only mechanism through which a Player learns Mastermind-location information.

Three changes to existing behavior are structural and are called out explicitly because they extend the turn engine rather than sitting beside it:

1. **A per-turn action budget.** The turn engine currently hardcodes two action slots (`GameTurn.currentSlot: 1 | 2`) with no notion of "number of actions available". `Lose an Action` requires a variable Action_Budget.
2. **An extra-turn mechanism.** No concept of a bonus turn exists. The `extra-turn` card requires new turn state so that turn advancement re-grants the turn to the same Player instead of advancing.
3. **A Round_End_Resolution phase.** Only per-turn resolution (`resolveEndOfTurn`) exists today. The three Clue cards create pending clues that resolve at the end of the Round, which requires a new resolution hook at the point where the Round number increments.

Two distance utilities exist in the codebase and must not be confused. Mastermind distance uses the full-graph BFS in `lib/map/distance.ts` (`getShortestPathDistance`), which includes `plane` edges and validates distances within [0, 6]. Spy proximity continues to use the separate car/boat-only BFS in `lib/turn-engine/spy-distance.ts`. No third pathfinding implementation is introduced.

The four existing placeholder card type strings (`"locator"`, `"extra-move"`, `"reveal-region"`, `"peek-clue"`) are replaced by the ten canonical Card_Identifiers defined in this spec. The existing 5-card hand cap in the reward flow is removed. All card effects are resolved server-side; the client is never trusted for card ownership, targets, randomness, distances, blockade state, penalties, extra turns, or rewards. Communication remains poll-based per `tech-stack.md`; no WebSockets are introduced.

Scope note: this spec covers server-side engine work, the `USE_CARD` API surface, and the data returned by game-state polling. Card-playing UI is out of scope (the active game screen is a placeholder today) — see Open Question O-1.

## Glossary

### Systems

- **Card_Engine**: The server-side module that resolves card effects, owns temporary-effect lifecycle, and dispatches `USE_CARD` through the Card_Registry.
- **Card_Registry**: The declarative table of Card_Definitions. Each entry declares a Card_Identifier, Card_Category, Target_Requirement, Resolution_Timing, and effect handler.
- **Turn_Engine**: The existing server-side module managing turn order, action validation and execution, and end-of-turn resolution (`lib/turn-engine/`).
- **Move_Validator**: The existing pure validation function `validateAction` in `lib/turn-engine/validate-action.ts`, which receives its inputs from `submitAction`.
- **Round_End_Resolver**: The new resolution phase that resolves all Pending_Clue records for a Round at the moment that Round completes.
- **Notebook**: A Player's private, append-only, multi-type clue log, persisted as `NotebookEntry` rows.
- **Event_Feed**: The existing public append-only log (`GameEvent`), ordered by `sequenceNumber` per Room.
- **Distance_Utility**: The existing full-graph BFS shortest-path utility in `lib/map/distance.ts` (`getShortestPathDistance`), which includes `car`, `boat`, and `plane` edges. Graph diameter is 6.
- **Spy_Distance_Utility**: The existing car/boat-only BFS in `lib/turn-engine/spy-distance.ts`, used exclusively for Spy-proximity clues.

### Card terminology

- **Card_Identifier**: The canonical persisted string value of `ActionCard.type`. The ten MVP values are: `close-all-roads`, `close-all-airways`, `close-all-sea-routes`, `lose-an-action`, `locate-the-mastermind`, `bug-a-phone`, `reveal-direction`, `drop-ship`, `extra-turn`, `open-all-roads`.
- **Card_Display_Name**: The player-facing name of a card: Close All Roads, Close All Airways, Close All Sea Routes, Lose an Action, Locate the Mastermind, Bug a Phone, Reveal Direction, Drop Ship, Extra Turn, Open All Roads.
- **Card_Category**: One of `sabotage`, `clue`, `booster`.
- **Card_Definition**: A Card_Registry entry: Card_Identifier, Card_Category, Target_Requirement, Resolution_Timing, effect handler.
- **Target_Requirement**: One of `none` (the card accepts no target) or `player` (the card requires another Player as target).
- **Resolution_Timing**: One of `immediate` (the effect resolves inside the same transaction as the `USE_CARD` submission) or `end-of-round` (the effect creates a Pending_Clue resolved by the Round_End_Resolver).
- **Legacy_Card_Type**: One of the four superseded placeholder strings `"locator"`, `"extra-move"`, `"reveal-region"`, `"peek-clue"`.
- **Card_Pool**: The set of all ten Card_Identifiers, used as the draw source for reward randomization.

### Movement and effect terminology

- **Transport_Type**: The existing Prisma enum `plane | car | boat` on `Adjacency.transport`.
- **Roads**: Adjacency edges with Transport_Type `car`.
- **Airways**: Adjacency edges with Transport_Type `plane`.
- **Sea_Routes**: Adjacency edges with Transport_Type `boat`.
- **Blockade**: A persisted temporary effect record that blocks one Transport_Type for all Players other than the Blockade_Caster. Fields: Room, Transport_Type, Blockade_Caster, creation Round number, Blockade_Caster turnPosition.
- **Blockade_Caster**: The Player who played the Blockade-creating card.
- **Turn_Ordinal**: The pair (Round number, turnPosition) of a turn, compared lexicographically. Turn_Ordinal defines a total order over all normal turns in a game.
- **Blockade_Window**: The set of turns whose Turn_Ordinal is strictly greater than the Turn_Ordinal of the turn in which a Blockade was created and strictly less than (creation Round + 1, Blockade_Caster turnPosition). The Blockade_Caster's next normal turn is the first turn outside the Blockade_Window.
- **Active_Blockade**: A Blockade whose Blockade_Window includes the current turn and which has not been lifted by Open All Roads.
- **Action_Budget**: The number of actions available to a Player for a single turn. Default_Action_Budget is 2. Minimum_Action_Budget is 1.
- **Default_Action_Budget**: 2, matching the existing two-action-slot turn.
- **Actions_Remaining**: The count of unspent actions in the current turn, initialized to Action_Budget when the turn begins and decremented by 1 for each accepted action.
- **Action_Penalty_Flag**: A per-Player boolean flag set by Lose an Action, which reduces the target's Action_Budget by 1 on the next turn that target begins.
- **Pending_Extra_Turns**: A per-Player non-negative integer count of extra turns owed to that Player, incremented by the `extra-turn` card.
- **Extra_Turn**: A turn granted by the `extra-turn` card, taken by the same Player immediately after that Player's current turn completes, carrying the Turn_Ordinal of the granting turn.
- **Pending_Clue**: A persisted record created by an `end-of-round` card, storing everything the Round_End_Resolver needs: Room, Player, Card_Identifier, Round number, and Origin_Location.
- **Origin_Location**: The Player's Location at the moment a Clue card was played, captured so that later movement in the same Round does not change the clue.
- **Round_End_Resolution**: The phase that resolves all Pending_Clue records for Round R at the moment Round R completes, before draw detection for Round R + 1.

### Existing entities referenced

- **Player**: A participant in an active game session, identified by `playerId` via the `RoomPlayer` record.
- **Current_Player**: The Player whose turn it currently is.
- **Mastermind**: The hidden Main Threat, whose true Location is stored server-side in `GameThreat`.
- **Spy_NPC**: The hidden `GameSpy` entity, one per Region, capturable for card rewards.
- **Capture_Order**: The game-wide sequential counter (1 through 6) of Spy_NPC captures.
- **Reward_Tier**: The number of cards granted for a Spy capture, derived from Capture_Order.
- **Skip_Next_Turn_Flag**: The existing per-Player flag (`PlayerPosition.skipNextTurn`) set by a failed Capture Attempt.
- **Region**: A map region. The map has 6 Regions and 40 Locations.

## Requirements

### Requirement 1: Card Pool and Canonical Card Identifiers

**User Story:** As a developer, I want a single declarative registry of the nine MVP cards with stable identifiers, so that card behavior is defined in one place and new cards can be added without rewriting the USE_CARD flow.

#### Acceptance Criteria

1. THE Card_Registry SHALL define exactly ten Card_Definitions, one for each Card_Identifier: `close-all-roads`, `close-all-airways`, `close-all-sea-routes`, `lose-an-action`, `locate-the-mastermind`, `bug-a-phone`, `reveal-direction`, `drop-ship`, `extra-turn`, `open-all-roads`.
2. THE Card_Registry SHALL assign Card_Category `sabotage` to `close-all-roads`, `close-all-airways`, `close-all-sea-routes`, and `lose-an-action`.
3. THE Card_Registry SHALL assign Card_Category `clue` to `locate-the-mastermind`, `bug-a-phone`, and `reveal-direction`.
4. THE Card_Registry SHALL assign Card_Category `booster` to `drop-ship`, `extra-turn`, and `open-all-roads`.
5. THE Card_Registry SHALL assign Target_Requirement `player` to `lose-an-action` and Target_Requirement `none` to the other nine Card_Identifiers.
6. THE Card_Registry SHALL assign Resolution_Timing `immediate` to `close-all-roads`, `close-all-airways`, `close-all-sea-routes`, `lose-an-action`, `drop-ship`, `extra-turn`, and `open-all-roads`.
7. THE Card_Registry SHALL assign Resolution_Timing `end-of-round` to `locate-the-mastermind`, `bug-a-phone`, and `reveal-direction`.
8. THE Card_Engine SHALL persist each granted card's Card_Identifier in `ActionCard.type`.
9. THE Card_Engine SHALL exclude every Legacy_Card_Type from the Card_Pool, so that no newly granted card carries a Legacy_Card_Type value.
10. IF a `USE_CARD` submission references a card whose `ActionCard.type` value is absent from the Card_Registry, THEN THE Card_Engine SHALL reject the submission with error code `UNKNOWN_CARD_TYPE`, leave the card unconsumed, and leave Actions_Remaining unchanged.
11. THE Card_Engine SHALL treat Card_Display_Name values as presentation-only labels derived from Card_Identifier values, so that persisted state and API payloads carry Card_Identifier values.

### Requirement 2: USE_CARD Submission with Optional Target

**User Story:** As a player, I want to play a card and, where the card requires it, name a target, so that targeted cards resolve against the agent I choose.

#### Acceptance Criteria

1. THE Turn_Engine SHALL accept an optional `targetPlayerId` field on the `USE_CARD` action payload alongside the existing `cardId` field.
2. WHEN a Player submits `USE_CARD`, THE Turn_Engine SHALL validate that the submitting Player is the Current_Player, that the submitting Player owns the referenced card, and that the referenced card is unconsumed, before resolving any card effect.
3. IF the submitting Player does not own the referenced card or the referenced card is already consumed, THEN THE Turn_Engine SHALL reject the submission with the existing error code `INVALID_CARD` and leave all game state unchanged.
4. WHEN a Player submits `USE_CARD` for a card whose Target_Requirement is `player`, THE Card_Engine SHALL validate that `targetPlayerId` is present, that `targetPlayerId` identifies a Player who is a member of the same Room, and that `targetPlayerId` differs from the submitting Player's identifier.
5. IF a card whose Target_Requirement is `player` is submitted without `targetPlayerId`, with a `targetPlayerId` that is not a member of the Room, or with a `targetPlayerId` equal to the submitting Player's identifier, THEN THE Card_Engine SHALL reject the submission with error code `INVALID_CARD_TARGET`, leave the card unconsumed, and leave Actions_Remaining unchanged.
6. IF a `targetPlayerId` is supplied for a card whose Target_Requirement is `none`, THEN THE Card_Engine SHALL reject the submission with error code `INVALID_CARD_TARGET`, leave the card unconsumed, and leave Actions_Remaining unchanged.
7. WHEN a `USE_CARD` submission passes validation, THE Turn_Engine SHALL mark the card consumed, decrement Actions_Remaining by 1, and dispatch the Card_Identifier to the Card_Registry effect handler within the same database transaction.
8. THE Turn_Engine SHALL accept a `USE_CARD` submission in any action of a turn, including the final action of the turn.
9. THE Card_Engine SHALL resolve every card effect using the Card_Registry, so that adding a Card_Definition adds a playable card without modifying the `USE_CARD` submission path.

### Requirement 3: Card Resolution Timing

**User Story:** As a game designer, I want immediate cards to take effect when played and clue cards to resolve at the end of the round, so that clue information reflects a consistent round-end snapshot.

#### Acceptance Criteria

1. WHEN a card whose Resolution_Timing is `immediate` is played, THE Card_Engine SHALL apply that card's full effect within the same transaction that consumes the card.
2. WHEN a card whose Resolution_Timing is `end-of-round` is played, THE Card_Engine SHALL create a Pending_Clue record containing the Room, the playing Player, the Card_Identifier, the current Round number, and the Origin_Location, and SHALL defer all clue computation to Round_End_Resolution.
3. THE Card_Engine SHALL set Origin_Location to the playing Player's Location at the moment the card is played.
4. WHEN Round_End_Resolution computes a clue for a Pending_Clue record, THE Round_End_Resolver SHALL use the persisted Origin_Location, so that any Location change made by that Player after playing the card leaves the clue unchanged.
5. THE Card_Engine SHALL allow a Player to hold multiple unresolved Pending_Clue records within the same Round, including multiple records for the same Card_Identifier.
6. WHEN a Pending_Clue record is resolved, THE Round_End_Resolver SHALL mark that record resolved, so that each Pending_Clue record produces at most one Notebook entry.

### Requirement 4: Global Blockade Cards — Activation

**User Story:** As a player, I want to shut down a whole transport network for the other agents, so that I can slow their progress while my own routes stay open.

#### Acceptance Criteria

1. WHEN a Player plays `close-all-roads`, THE Card_Engine SHALL create a Blockade for Transport_Type `car` recording the Room, the playing Player as Blockade_Caster, the current Round number, and the Blockade_Caster's turnPosition.
2. WHEN a Player plays `close-all-airways`, THE Card_Engine SHALL create a Blockade for Transport_Type `plane` recording the same fields as Requirement 4.1.
3. WHEN a Player plays `close-all-sea-routes`, THE Card_Engine SHALL create a Blockade for Transport_Type `boat` recording the same fields as Requirement 4.1.
4. THE Card_Engine SHALL restrict every Blockade's effect to Players other than that Blockade's Blockade_Caster, so that a Blockade_Caster's own MOVE actions are unaffected by that Blockade.
5. THE Card_Engine SHALL evaluate a Transport_Type as blocked for a Player when at least one Active_Blockade exists for that Transport_Type whose Blockade_Caster differs from that Player, so that two Blockades of the same Transport_Type produce the same restriction as one for any affected Player.
6. WHERE two different Players have each created an Active_Blockade for the same Transport_Type, THE Card_Engine SHALL treat that Transport_Type as blocked for every Player except the Blockade_Caster of every such Blockade, so that each of the two Blockade_Casters remains restricted by the other Blockade_Caster's Blockade.
7. THE Card_Engine SHALL leave all `Adjacency` rows unmodified when creating or expiring a Blockade, so that a Blockade is a temporary state effect rather than a change to the map.
8. WHEN a Blockade is created, THE Card_Engine SHALL emit a public Event_Feed entry of type `blockade-activated` containing the Blockade_Caster's identifier, the Transport_Type, and the Round number.

### Requirement 5: Blockade Lifecycle and Expiry

**User Story:** As a game designer, I want a blockade to cost every other agent exactly one turn of that transport type, so that "lasts one round" has a single unambiguous meaning regardless of turn order.

#### Acceptance Criteria

1. THE Card_Engine SHALL treat a Blockade as active for exactly the turns inside that Blockade's Blockade_Window, so that every other Player is affected for exactly one of that Player's turns.
2. THE Card_Engine SHALL derive Blockade_Window from the Blockade's persisted creation Round number and Blockade_Caster turnPosition, so that blockade state is server-authoritative and survives a server restart.
3. WHEN the Blockade_Caster's next normal turn begins, THE Card_Engine SHALL treat that Blockade as expired, so that the Blockade restricts no MOVE action from that turn onward.
4. THE Card_Engine SHALL exclude expired Blockades from every blockade evaluation.
5. WHERE a turn is an Extra_Turn, THE Card_Engine SHALL assign that turn the Turn_Ordinal of the granting turn for the purpose of Blockade_Window comparison.
6. WHEN a Blockade expires, THE Card_Engine SHALL leave the Adjacency data and all Player Locations unchanged.
7. THE Card_Engine SHALL apply a Blockade only to MOVE actions submitted during the Blockade_Window, so that a MOVE completed before the Blockade was created remains valid.

### Requirement 6: Movement Validation Against Sabotage Effects

**User Story:** As a player, I want the server to reject moves that violate an active blockade with a clear reason, so that restrictions are enforced consistently rather than being hidden by the client.

#### Acceptance Criteria

1. THE Move_Validator SHALL evaluate a MOVE action in the following order, returning on the first failure: adjacency of the requested connection, Transport_Type restriction from Active_Blockades, individual movement restriction on the submitting Player, sufficiency of Actions_Remaining, and the remaining existing movement rules (same-Location rejection and the plane-Hub rule).
2. THE Turn_Engine SHALL load the Active_Blockade set for the current turn and pass that set into the Move_Validator, so that the Move_Validator remains a pure function.
3. IF a MOVE action requests an edge with Transport_Type `car` while Roads are blocked for the submitting Player, THEN THE Move_Validator SHALL reject the action with error code `ROADS_BLOCKED`, a message stating that roads are currently blocked, and no change to the submitting Player's Location.
4. IF a MOVE action requests an edge with Transport_Type `plane` while Airways are blocked for the submitting Player, THEN THE Move_Validator SHALL reject the action with error code `AIRWAYS_BLOCKED`, a message stating that airways are currently blocked, and no change to the submitting Player's Location.
5. IF a MOVE action requests an edge with Transport_Type `boat` while Sea_Routes are blocked for the submitting Player, THEN THE Move_Validator SHALL reject the action with error code `SEA_ROUTES_BLOCKED`, a message stating that sea routes are currently blocked, and no change to the submitting Player's Location.
6. WHEN a MOVE action is rejected because of an Active_Blockade, THE Turn_Engine SHALL leave Actions_Remaining unchanged, so that the submitting Player may submit a different action in place of the rejected one.
7. THE Card_Engine SHALL enforce movement restrictions exclusively through the Move_Validator, so that card effect handlers change game state without duplicating movement validation.
8. THE Card_Engine SHALL leave Drop Ship relocation unaffected by Active_Blockades, so that Drop Ship relocates the playing Player while any Transport_Type is blocked.

### Requirement 7: Open All Roads

**User Story:** As a player, I want to clear all transport blockades at once, so that I can restore full movement for everyone and counter any sabotage.

#### Acceptance Criteria

1. WHEN a Player plays `open-all-roads`, THE Card_Engine SHALL lift every Active_Blockade in the Room, regardless of Transport_Type and regardless of Blockade_Caster.
2. THE Card_Engine SHALL lift blockades of Transport_Type `car`, `plane`, and `boat` equally when `open-all-roads` is played.
3. THE Card_Engine SHALL lift blockades created by the playing Player as well as blockades created by other Players.
4. WHEN `open-all-roads` is played and the Room holds no Active_Blockade, THE Card_Engine SHALL consume the card, decrement Actions_Remaining by 1, and change no other game state.
5. THE Card_Engine SHALL leave all `Adjacency` rows unmodified when lifting Blockades.
6. WHEN `open-all-roads` is played twice in succession, THE Card_Engine SHALL produce an empty Active_Blockade set after the first play, and the second play SHALL have no additional effect beyond consuming the card.
7. WHEN Blockades are lifted, THE Card_Engine SHALL emit a public Event_Feed entry of type `blockade-lifted` containing the playing Player's identifier and the count of Blockades lifted.

### Requirement 8: Lose an Action and the Per-Turn Action Budget

**User Story:** As a player, I want to strip an action from another agent's next turn, so that I can slow a rival who is closing in on the Mastermind.

#### Acceptance Criteria

1. THE Turn_Engine SHALL maintain Actions_Remaining as persisted turn state, initialized to the Current_Player's Action_Budget when that Player's turn begins.
2. THE Turn_Engine SHALL compute Action_Budget as Default_Action_Budget reduced by 1 when the Current_Player's Action_Penalty_Flag is set, bounded below by Minimum_Action_Budget.
3. WHEN an action submission is accepted, THE Turn_Engine SHALL decrement Actions_Remaining by 1.
4. WHEN Actions_Remaining reaches 0, THE Turn_Engine SHALL run end-of-turn resolution and then proceed to turn advancement, so that a turn with Action_Budget 1 ends after a single action.
5. IF an action submission arrives while Actions_Remaining is 0, THEN THE Turn_Engine SHALL reject the submission with error code `NO_ACTIONS_REMAINING` and change no game state.
6. WHEN a Player plays `lose-an-action` against a valid target, THE Card_Engine SHALL set the target Player's Action_Penalty_Flag and leave the target Player's current turn state unchanged, so that no in-progress turn is interrupted.
7. WHEN a Player whose Action_Penalty_Flag is set begins a turn, THE Turn_Engine SHALL set that turn's Action_Budget to Default_Action_Budget minus 1 and clear the Action_Penalty_Flag, so that the penalty applies to exactly one turn.
8. WHERE a Player's Action_Penalty_Flag is already set, THE Card_Engine SHALL consume an additional `lose-an-action` card, decrement the playing Player's Actions_Remaining by 1, and leave the target's Action_Budget at Default_Action_Budget minus 1, so that penalties do not stack below Minimum_Action_Budget.
9. WHERE the next turn a penalized Player begins is an Extra_Turn, THE Turn_Engine SHALL apply the Action_Penalty_Flag to that Extra_Turn and clear the flag.
10. THE Turn_Engine SHALL persist Action_Penalty_Flag values in the database, so that the penalty survives a server restart.
11. WHEN `lose-an-action` is played, THE Card_Engine SHALL emit a public Event_Feed entry of type `action-penalty-applied` containing the playing Player's identifier and the target Player's identifier.

### Requirement 9: Drop Ship

**User Story:** As a player, I want to be airlifted far across the map, so that I can reach a distant region I suspect without spending many turns travelling.

#### Acceptance Criteria

1. WHEN a Player plays `drop-ship`, THE Card_Engine SHALL compute the candidate set of Locations L where the Distance_Utility distance from the playing Player's current Location to L is at least 4 and L's Region differs from the playing Player's current Region.
2. WHEN the candidate set is non-empty, THE Card_Engine SHALL select one Location from the candidate set using a uniform random distribution computed server-side and SHALL update the playing Player's Location to the selected Location.
3. IF the candidate set is empty, THEN THE Card_Engine SHALL select, using a uniform random distribution, one Location among the Locations in a different Region from the playing Player's current Region having the greatest Distance_Utility distance from the playing Player's current Location, and SHALL update the playing Player's Location to the selected Location.
4. THE Card_Engine SHALL derive the candidate set from the existing Location and Region data and the Distance_Utility, so that no second pathfinding implementation is introduced.
5. THE Card_Engine SHALL exclude the destination choice from client input, so that the destination is determined entirely server-side.
6. WHEN Drop Ship relocation completes, THE Card_Engine SHALL emit a public Event_Feed entry of type `player-relocated` containing the playing Player's identifier, the origin Location, the destination Location, and the cause `drop-ship`.
7. WHEN Drop Ship relocation completes and the playing Player's turn still has Actions_Remaining above 0, THE Turn_Engine SHALL validate any subsequent action in that turn from the destination Location.
8. WHEN Drop Ship relocation completes, THE Turn_Engine SHALL apply the existing end-of-turn Spy and reward resolution to the playing Player's final Location for that turn, so that relocation into or out of a Spy Region resolves through the existing rules.

### Requirement 10: Extra Turn Card

**User Story:** As a player, I want to play an Extra Turn card to get a whole additional turn after my current one, so that I can act twice in a row when timing matters.

#### Acceptance Criteria

1. WHEN a Player plays `extra-turn`, THE Card_Engine SHALL increment that Player's Pending_Extra_Turns by 1 and SHALL leave that turn's Actions_Remaining otherwise unchanged, so that the `extra-turn` card grants no additional action within the current turn.
2. WHEN a turn completes for a Player whose Pending_Extra_Turns is greater than 0, THE Turn_Engine SHALL decrement Pending_Extra_Turns by 1 and grant that same Player a new turn with Actions_Remaining initialized to that Player's Action_Budget, a cleared capture-attempt flag, and the Round number unchanged.
3. THE Turn_Engine SHALL run the existing end-of-turn resolution for the granting turn before the Extra_Turn begins, so that the granting turn resolves completely first.
4. THE Turn_Engine SHALL run the existing end-of-turn resolution for the Extra_Turn when the Extra_Turn completes, so that an Extra_Turn behaves as a normal turn.
5. THE Turn_Engine SHALL leave the Round number unchanged when granting or completing an Extra_Turn, so that Extra_Turns do not advance the Round and do not affect draw detection against `Room.maxRoundLimit`.
6. WHEN an Extra_Turn completes and Pending_Extra_Turns is 0, THE Turn_Engine SHALL advance the turn to the next Player in turnPosition order from the granting Player's turnPosition, so that turn order resumes as though the Extra_Turn had not occurred.
7. WHERE a Player plays `extra-turn` more than once before that Player's Pending_Extra_Turns are consumed, THE Turn_Engine SHALL grant one Extra_Turn per increment, one at a time.
8. WHEN an Extra_Turn begins, THE Turn_Engine SHALL emit a public Event_Feed entry of type `extra-turn-started` containing the Player's identifier and the Round number, so that the Event_Feed records the granting turn and the Extra_Turn as separate turns.
9. WHERE a Player is due an Extra_Turn and that Player's Skip_Next_Turn_Flag is set, THE Turn_Engine SHALL clear the Skip_Next_Turn_Flag, decrement Pending_Extra_Turns by 1, emit the existing `turn-skipped` event, and advance turn order, so that the Extra_Turn is consumed by the skip penalty.
10. WHERE the last Player in turnPosition order holds Pending_Extra_Turns greater than 0, THE Turn_Engine SHALL grant every owed Extra_Turn before the Round number increments, so that Round_End_Resolution runs after all turns of the Round.
11. THE Turn_Engine SHALL persist Pending_Extra_Turns in the database, so that owed Extra_Turns survive a server restart.

### Requirement 11: Locate the Mastermind

**User Story:** As a player, I want to learn how many steps away the Mastermind is from where I played the card, so that I can triangulate the Mastermind's location across rounds.

#### Acceptance Criteria

1. WHEN a Player plays `locate-the-mastermind`, THE Card_Engine SHALL create a Pending_Clue record with the Card_Identifier `locate-the-mastermind`, the current Round number, and Origin_Location set to the playing Player's Location at that moment, and SHALL add no Notebook entry at that time.
2. WHEN Round_End_Resolution resolves a `locate-the-mastermind` Pending_Clue, THE Round_End_Resolver SHALL compute the Distance_Utility shortest-path distance between the Pending_Clue's Origin_Location and the Mastermind's true Location.
3. WHEN the distance is computed, THE Round_End_Resolver SHALL append a Notebook entry of type `mastermind_distance` containing `locationId` set to the Pending_Clue's Origin_Location, `roundNumber` set to the Pending_Clue's Round number, and `stepsAway` set to the computed distance.
4. THE Round_End_Resolver SHALL compute Mastermind distance using the Distance_Utility full-graph shortest path, so that `car`, `boat`, and `plane` edges are all included and the Spy_Distance_Utility remains reserved for Spy proximity clues.
5. THE Round_End_Resolver SHALL restrict the Mastermind's true Location to server-side use, so that no API response, Event_Feed entry, or Notebook entry produced by this card contains the Mastermind's Location identifier.
6. THE Round_End_Resolver SHALL produce a `stepsAway` value within the inclusive range 0 to 6, matching the map's graph diameter.

### Requirement 12: Bug a Phone

**User Story:** As a player, I want to eavesdrop on a random rival, so that I gain information about the Mastermind and the Spy from that rival's position.

#### Acceptance Criteria

1. WHEN a Player plays `bug-a-phone`, THE Card_Engine SHALL create a Pending_Clue record with the Card_Identifier `bug-a-phone` and the current Round number, and SHALL add no Notebook entry at that time.
2. WHEN Round_End_Resolution resolves a `bug-a-phone` Pending_Clue, THE Round_End_Resolver SHALL select one target Player using a uniform random distribution over the Players in the Room whose `status` is `connected`, excluding the playing Player.
3. IF no Player other than the playing Player has `status` `connected`, THEN THE Round_End_Resolver SHALL select one target Player using a uniform random distribution over all Players in the Room excluding the playing Player.
4. WHERE the Room contains exactly two Players, THE Round_End_Resolver SHALL select the single other Player as the target.
5. THE Round_End_Resolver SHALL perform target selection server-side, so that no client input influences the selected target.
6. WHEN a target Player is selected, THE Round_End_Resolver SHALL compute `mastermindStepsAway` as the Distance_Utility shortest-path distance between the target Player's Location at resolution time and the Mastermind's true Location.
7. WHEN the target Player's current Region holds a Spy_NPC that is not captured, THE Round_End_Resolver SHALL set `spyRegionId` to the target Player's current Region identifier and `spyCaptured` to false.
8. WHEN the target Player's current Region holds a Spy_NPC that is captured, THE Round_End_Resolver SHALL set `spyRegionId` to the target Player's current Region identifier and `spyCaptured` to true, regardless of which Player captured that Spy_NPC.
9. IF the target Player's current Region holds no Spy_NPC record, THEN THE Round_End_Resolver SHALL set `spyRegionId` to null and `spyCaptured` to false.
10. WHEN the clue is computed, THE Round_End_Resolver SHALL append a Notebook entry of type `phone_bug` containing `roundNumber`, `targetPlayerId`, `targetLocationId`, `mastermindStepsAway`, `spyRegionId`, and `spyCaptured`.
11. THE Round_End_Resolver SHALL restrict the `phone_bug` entry contents to the fields listed in Requirement 12.10, so that the target Player's Notebook, held cards, Pending_Clues, and Pending_Reward state remain private.

### Requirement 13: Reveal Direction

**User Story:** As a player, I want a city that lies on a path toward the Mastermind, so that I know which way to travel without learning the exact hiding place.

#### Acceptance Criteria

1. WHEN a Player plays `reveal-direction`, THE Card_Engine SHALL create a Pending_Clue record with the Card_Identifier `reveal-direction`, the current Round number, and Origin_Location set to the playing Player's Location at that moment, and SHALL add no Notebook entry at that time.
2. WHEN Round_End_Resolution resolves a `reveal-direction` Pending_Clue, THE Round_End_Resolver SHALL compute the reference distance as the Distance_Utility distance between the Pending_Clue's Origin_Location and the Mastermind's true Location.
3. WHILE the reference distance is greater than 0, THE Round_End_Resolver SHALL build the candidate set of Locations adjacent to the Origin_Location whose Distance_Utility distance to the Mastermind's true Location equals the reference distance minus 1, and SHALL select one candidate using a uniform random distribution.
4. WHEN the reference distance equals 0, THE Round_End_Resolver SHALL select the Origin_Location as the revealed Location.
5. WHEN a Location is selected, THE Round_End_Resolver SHALL append a Notebook entry of type `mastermind_direction` containing `locationId` set to the selected Location and `roundNumber` set to the Pending_Clue's Round number.
6. THE Round_End_Resolver SHALL select the revealed Location from the existing `Location` records connected by existing `Adjacency` records, so that every revealed Location is a valid city on the map.
7. THE Round_End_Resolver SHALL derive candidate distances from the Distance_Utility, so that no second pathfinding implementation is introduced.
8. THE Round_End_Resolver SHALL exclude the Mastermind's true Location identifier from the `mastermind_direction` entry whenever the reference distance is greater than 0.

### Requirement 14: Round End Resolution

**User Story:** As a game designer, I want a single round-end phase that resolves all pending clues, so that clue delivery is deterministic and ordered relative to draw detection.

#### Acceptance Criteria

1. WHEN the final turn of Round R completes and turn advancement would set the Round number to R + 1, THE Turn_Engine SHALL run Round_End_Resolution for Round R before applying the Round number increment.
2. WHEN Round_End_Resolution runs for Round R, THE Round_End_Resolver SHALL resolve every unresolved Pending_Clue record whose Round number equals R.
3. THE Round_End_Resolver SHALL run Round_End_Resolution for Round R before draw detection against `Room.maxRoundLimit`, so that clues created in the final Round of a game are delivered before the game is recorded as a draw.
4. WHEN the final turn of Round R is skipped because of a Skip_Next_Turn_Flag, THE Turn_Engine SHALL still run Round_End_Resolution for Round R, so that clue delivery does not depend on the last Player acting.
5. THE Round_End_Resolver SHALL resolve all Pending_Clue records for a Round within the same database transaction as the turn advancement that triggered Round_End_Resolution.
6. IF the Room status becomes `finished` because of a successful Capture Attempt, THEN THE Round_End_Resolver SHALL mark all unresolved Pending_Clue records for that Room resolved without appending Notebook entries, so that no clue is delivered after the game has ended.
7. THE Round_End_Resolver SHALL produce identical Notebook entry contents regardless of the order in which the Pending_Clue records of a single Round are processed.
8. THE Round_End_Resolver SHALL run Round_End_Resolution exactly once per Round per Room.

### Requirement 15: Notebook Support for Multiple Entry Types

**User Story:** As a player, I want my notebook to hold every kind of clue I have earned, so that I can review spy proximity, mastermind distance, direction, and phone-bug information together.

#### Acceptance Criteria

1. THE Notebook SHALL support four entry types identified by `entryType`: the existing `spy-proximity`, plus `mastermind_distance`, `mastermind_direction`, and `phone_bug`.
2. THE Notebook SHALL preserve the existing `spy-proximity` entry behavior and field usage (`regionId`, `roundNumber`, `stepsAway`), so that Spy proximity clues continue to be produced by the existing Spy resolution path using the Spy_Distance_Utility.
3. THE Notebook SHALL store the type-specific fields of `mastermind_distance`, `mastermind_direction`, and `phone_bug` entries in the existing `NotebookEntry.payload` JSON field, so that each entry type carries only the fields relevant to that entry type.
4. THE Notebook SHALL store `mastermind_distance` entries with payload fields `type`, `locationId`, `roundNumber`, and `stepsAway`.
5. THE Notebook SHALL store `mastermind_direction` entries with payload fields `type`, `locationId`, and `roundNumber`.
6. THE Notebook SHALL store `phone_bug` entries with payload fields `type`, `roundNumber`, `targetPlayerId`, `targetLocationId`, `mastermindStepsAway`, `spyRegionId`, and `spyCaptured`.
7. WHEN a Player queries the Notebook, THE Notebook SHALL return entries of all four entry types belonging to that Player for that game session, ordered by creation time ascending, up to the existing maximum of 200 entries per response.
8. WHEN a Player polls game state, THE Turn_Engine SHALL include Notebook entries of all four entry types in that Player's private data, using a discriminated representation keyed on entry type.
9. THE Notebook SHALL restrict every Player's entries to that Player, and IF a request attempts to read another Player's Notebook, THEN THE Notebook SHALL reject the request with an access-denied error.
10. THE Notebook SHALL return each entry with the same field values that were written for that entry, so that reading an entry reproduces the written clue exactly.

### Requirement 16: Card Granting Through Spy Capture Rewards

**User Story:** As a player, I want spy captures to award cards from the real MVP pool with a guaranteed mastermind clue, so that capturing a spy always advances my search.

#### Acceptance Criteria

1. THE Card_Engine SHALL grant cards only through the existing Spy capture reward flow.
2. THE Card_Engine SHALL derive the number of cards granted from Capture_Order: 1st capture grants 4 cards, 2nd grants 3 cards, 3rd grants 2 cards, and 4th through 6th each grant 1 card.
3. WHEN a reward is granted, THE Card_Engine SHALL include exactly one guaranteed card with Card_Identifier `locate-the-mastermind`, including for single-card rewards.
4. WHEN a reward grants more than one card, THE Card_Engine SHALL draw each remaining card from the Card_Pool using a uniform random distribution computed server-side, permitting duplicate Card_Identifiers within a single reward.
5. THE Card_Engine SHALL persist each granted card as an `ActionCard` record with `consumed` false and a Card_Identifier from the Card_Pool.
6. THE Card_Engine SHALL exclude client input from reward composition, so that card type selection is determined entirely server-side.
7. WHEN a reward is granted, THE Card_Engine SHALL grant the full number of cards derived from Capture_Order regardless of how many cards the receiving Player already holds.

### Requirement 17: Removal of the Card Hand Limit

**User Story:** As a player, I want to keep every card I earn, so that a large reward is never partially discarded.

#### Acceptance Criteria

1. THE Card_Engine SHALL apply no maximum hand size to the number of unconsumed cards a Player holds.
2. THE Card_Engine SHALL grant every card of a reward even when the receiving Player holds five or more unconsumed cards.
3. THE Card_Engine SHALL exclude the error code `HAND_FULL` from every card granting and card usage response path.
4. THE Turn_Engine SHALL remove `HAND_FULL` from the action error code definitions once no code path returns that value.
5. THE Turn_Engine SHALL return every unconsumed card a Player holds in that Player's private polling data, without truncating the list to five entries.

### Requirement 18: Public Event Feed for Card Activity

**User Story:** As a player, I want the shared tablet to show what cards other agents played and what changed, so that I can react to sabotage without seeing anyone's private clues.

#### Acceptance Criteria

1. WHEN a `USE_CARD` action is accepted, THE Turn_Engine SHALL append an Event_Feed entry of type `card-used` containing the playing Player's identifier and the Card_Identifier.
2. WHERE the played card's Target_Requirement is `player`, THE Turn_Engine SHALL include the target Player's identifier in the `card-used` entry payload.
3. THE Turn_Engine SHALL support the additional Event_Feed entry types `blockade-activated`, `blockade-lifted`, `action-penalty-applied`, `player-relocated`, and `extra-turn-started`, in addition to the existing entry types.
4. THE Turn_Engine SHALL exclude clue content from the Event_Feed, so that no Event_Feed entry contains a Mastermind distance, a revealed direction Location, a `phone_bug` payload, or the Mastermind's Location while the game is in progress.
5. THE Turn_Engine SHALL assign each new Event_Feed entry the next monotonically increasing sequence number for that Room, so that Event_Feed ordering remains total.
6. WHEN an Extra_Turn is granted, THE Turn_Engine SHALL order the `extra-turn-started` entry after every entry produced by the granting turn, so that the two turns are distinguishable in the Event_Feed.

### Requirement 19: Game State Polling for Card State

**User Story:** As a frontend developer, I want polling to return everything needed to render cards, blockades, and remaining actions, so that the client can present the card system without extra endpoints or WebSockets.

#### Acceptance Criteria

1. WHEN a Player polls game state, THE Turn_Engine SHALL include that Player's unconsumed cards, each with the card identifier, the Card_Identifier value, the Card_Category, and the Target_Requirement.
2. WHEN a Player polls game state, THE Turn_Engine SHALL include the current turn's Actions_Remaining and Action_Budget.
3. WHEN a Player polls game state, THE Turn_Engine SHALL include the set of Active_Blockades for the Room, each with the Transport_Type, the Blockade_Caster identifier, and the Round number in which that Blockade was created.
4. WHEN a Player polls game state, THE Turn_Engine SHALL include that Player's Action_Penalty_Flag value and Pending_Extra_Turns count.
5. WHEN a Player polls game state, THE Turn_Engine SHALL include that Player's unresolved Pending_Clue records, each with the Card_Identifier and the Round number.
6. THE Turn_Engine SHALL restrict another Player's Notebook entries, Pending_Clue contents, and unconsumed card list to that Player, so that polling exposes no other Player's private card or clue data.
7. THE Turn_Engine SHALL exclude the Mastermind's Location from every polling response while `Room.status` is `in-progress`.
8. THE Turn_Engine SHALL serve all card state through the existing polling endpoint, so that no WebSocket transport is introduced.

### Requirement 20: Server Authority and Hidden Information

**User Story:** As a game designer, I want every card outcome decided on the server, so that a modified client cannot fabricate effects or learn hidden state.

#### Acceptance Criteria

1. THE Card_Engine SHALL determine card ownership, card validity, target validity, random Drop Ship destinations, random Bug a Phone targets, Mastermind distances, revealed directions, Spy status, Blockade state, Action_Penalty_Flag state, Extra_Turn grants, and reward composition server-side.
2. THE Card_Engine SHALL ignore every client-supplied value other than the card identifier and the optional `targetPlayerId`, so that no client-supplied effect parameter influences resolution.
3. THE Card_Engine SHALL restrict the Mastermind's true Location to server-side computation, so that clue calculation never serializes the Mastermind's Location to a client while the game is in progress.
4. WHEN a card effect resolves, THE Card_Engine SHALL return to the acting Player only the information that card is designed to reveal.
5. THE Card_Engine SHALL persist every temporary effect (Blockade, Action_Penalty_Flag, Pending_Extra_Turns, Pending_Clue) in the database, so that effect activation and expiration are decided from server state rather than client state.

### Requirement 21: Card Framework Extensibility

**User Story:** As a developer, I want a reusable card framework, so that adding a card later does not require changing the turn engine or the USE_CARD flow.

#### Acceptance Criteria

1. THE Card_Registry SHALL express each card as data declaring the Card_Identifier, Card_Category, Target_Requirement, Resolution_Timing, and effect handler.
2. THE Card_Engine SHALL resolve `USE_CARD` by looking up the Card_Definition for the card's Card_Identifier and invoking that Card_Definition's effect handler.
3. THE Card_Engine SHALL derive target validation from each Card_Definition's Target_Requirement, so that target rules live in the Card_Registry rather than in the submission path.
4. THE Round_End_Resolver SHALL derive round-end resolution from each Card_Definition's Resolution_Timing, so that adding an `end-of-round` card requires no change to the Round_End_Resolver dispatch logic.
5. THE Card_Engine SHALL reuse the existing `Location`, `Region`, `RoomPlayer`, `PlayerPosition`, `GameTurn`, `ActionCard`, and `NotebookEntry` models where those models already carry the required data.
6. THE Card_Engine SHALL reuse the Distance_Utility for every Mastermind distance and Drop Ship distance computation, so that the codebase holds exactly two distance implementations: the full-graph Distance_Utility and the car/boat-only Spy_Distance_Utility.

### Requirement 22: Atomicity and Concurrency for Card Effects

**User Story:** As a developer, I want card resolution to be transactional, so that concurrent submissions cannot leave half-applied effects.

#### Acceptance Criteria

1. THE Card_Engine SHALL resolve each card effect within the existing Serializable transaction that processes the action submission.
2. THE Card_Engine SHALL apply card consumption, Actions_Remaining decrement, effect state changes, and Event_Feed entries atomically, so that a failed resolution leaves no partial state.
3. IF a card resolution transaction fails because of a serialization conflict, THEN THE Turn_Engine SHALL roll back all changes, leave the card unconsumed, and return the existing error code `CONCURRENCY_CONFLICT`.
4. THE Turn_Engine SHALL acquire the existing row-level lock on the Room's turn state before resolving a card effect, so that concurrent submissions for the same turn are serialized.
5. THE Round_End_Resolver SHALL resolve Pending_Clue records within the same transaction as the triggering turn advancement, so that a rolled-back turn advancement also rolls back clue delivery.

## Correctness Properties

These properties are intended for property-based testing with fast-check against real database transactions rolled back after each case. Each property names the requirements it covers.

### Blockades

- **P1 (Caster immunity invariant, Req 4.4):** For all Blockade sequences and all MOVE actions, no MOVE by a Blockade_Caster is rejected because of that same Blockade_Caster's own Blockade.
- **P2 (Blockade non-stacking / idempotence, Req 4.5):** For all Rounds and all Players P, the set of blocked Transport_Types for P after the same Blockade_Caster creates k ≥ 1 Blockades of one Transport_Type equals the set after creating exactly 1.
- **P3 (Blockade window totality, Req 5.1, 5.3):** For all turns T and all Blockades B, a MOVE on B's Transport_Type by a non-caster is rejected if and only if Turn_Ordinal(T) lies inside Blockade_Window(B).
- **P4 (Blockade expiry, Req 5.3):** For all Blockades B, every MOVE submitted at or after the Blockade_Caster's next normal turn is unaffected by B.
- **P5 (Map immutability, Req 4.7, 5.6, 7.5):** For all sequences of card plays, the full set of `Adjacency` rows and the `Location`/`Region` rows are byte-identical before and after.
- **P6 (Open All Roads idempotence, Req 7.1, 7.6):** For all Blockade sets, applying `open-all-roads` once yields an empty Active_Blockade set, and applying it twice yields the same (empty) set.

### Action budget and extra turns

- **P7 (Budget bounds invariant, Req 8.1–8.4):** For all turn sequences, Actions_Remaining always lies within [0, Default_Action_Budget], and Action_Budget always lies within [Minimum_Action_Budget, Default_Action_Budget].
- **P8 (Penalty cap, Req 8.7, 8.8):** For all k ≥ 1 `lose-an-action` cards resolved against the same target before that target's next turn, the target's Action_Budget on that turn equals exactly Default_Action_Budget − 1.
- **P9 (Turn accounting, Req 8.3, 8.4):** For all turns, the number of accepted actions in that turn equals that turn's Action_Budget.
- **P10 (Extra turn round invariance, Req 10.5):** For all sequences containing k `extra-turn` plays, the Round number after all turns complete equals the Round number of an equivalent sequence with zero `extra-turn` plays.
- **P11 (Turn order restoration, Req 10.6):** For all `extra-turn` plays by Player P, the Player holding the turn after P's Extra_Turns complete equals the Player who would hold the turn had no Extra_Turn been granted.
- **P12 (Extra turn count, Req 10.2, 10.7):** For all k `extra-turn` plays by Player P in one turn, P takes exactly k Extra_Turns before turn order advances.

### Drop Ship destination

- **P13 (Destination validity, Req 9.1–9.3):** For all origin Locations O, the selected destination D satisfies Region(D) ≠ Region(O), and either distance(O, D) ≥ 4, or distance(O, D) equals the maximum distance from O among all Locations outside Region(O).
- **P14 (Destination totality, Req 9.3):** For all 40 origin Locations, `drop-ship` produces a destination — no origin yields an undefined result.

### Clues

- **P15 (Mastermind distance correctness, Req 11.2, 11.3, 11.6):** For all `locate-the-mastermind` plays, the resulting entry's `stepsAway` equals `getShortestPathDistance(entry.locationId, mastermindLocationId)` and lies within [0, 6].
- **P16 (Origin location stability, Req 3.4, 11.1):** For all `locate-the-mastermind` plays followed by any number of MOVE actions by the same Player in the same Round, the resulting entry's `locationId` equals the Player's Location at the moment the card was played.
- **P17 (Direction monotonicity, Req 13.3):** For all `reveal-direction` plays where reference distance d > 0, the revealed Location is adjacent to the Origin_Location and satisfies `getShortestPathDistance(revealed, mastermind) == d − 1`.
- **P18 (Direction totality, Req 13.3, 13.4):** For all (Origin_Location, Mastermind Location) pairs over the 40-Location map, `reveal-direction` produces exactly one valid revealed Location.
- **P19 (Bug a Phone target validity, Req 12.2–12.4):** For all `bug-a-phone` resolutions, `targetPlayerId` differs from the playing Player's identifier and identifies a member of the same Room.
- **P20 (Bug a Phone distance correctness, Req 12.6):** For all `bug-a-phone` resolutions, `mastermindStepsAway` equals `getShortestPathDistance(targetLocationId, mastermindLocationId)`.
- **P21 (Bug a Phone spy reporting, Req 12.7–12.9):** For all `bug-a-phone` resolutions, `spyCaptured` is true if and only if the `GameSpy` record for the target's current Region exists and is captured, and `spyRegionId` is non-null if and only if that record exists.
- **P22 (Round-end confluence, Req 14.7):** For all sets of Pending_Clue records within one Round, the multiset of resulting Notebook entries is independent of the resolution order, holding random draws fixed.

### Notebook

- **P23 (Notebook write/read round trip, Req 15.4–15.6, 15.10):** For all generated Notebook entries of all four entry types, writing the entry and then reading it through `getPlayerNotebook` and through the polling response yields field values equal to those written.
- **P24 (Notebook privacy, Req 15.9, 19.6):** For all Player pairs (A, B) with A ≠ B, no request by A returns any Notebook entry belonging to B, and any direct attempt is rejected.
- **P25 (Spy-proximity preservation, Req 15.2):** For all game sequences, `spy-proximity` entries produced with the card system enabled are identical to those produced by the existing Spy resolution path, and continue to use the Spy_Distance_Utility.

### Rewards and hand size

- **P26 (Reward composition, Req 16.2–16.4):** For all Capture_Order values 1–6, the granted card count equals the tier (4, 3, 2, 1, 1, 1), exactly one granted card has Card_Identifier `locate-the-mastermind` as the guaranteed card, and every granted Card_Identifier belongs to the Card_Pool.
- **P27 (No hand cap, Req 17.1, 17.2, 17.7):** For all pre-existing hand sizes h ≥ 0, granting a reward of tier t results in hand size h + t.
- **P28 (No legacy types, Req 1.9):** For all rewards granted, no granted Card_Identifier equals a Legacy_Card_Type.

### Hidden information and atomicity

- **P29 (Mastermind location never leaked, Req 11.5, 18.4, 19.7, 20.3):** For all API responses, Event_Feed entries, and Notebook entries produced while `Room.status` is `in-progress`, the serialized payload contains the Mastermind's Location identifier only when that identifier was independently selected as a revealed direction Location.
- **P30 (Rejected submissions are inert, Req 2.3, 2.5, 2.6, 6.6, 22.3):** For all rejected `USE_CARD` and MOVE submissions, the full game state (cards, positions, Blockades, Notebook, Actions_Remaining, Event_Feed) is unchanged from the pre-submission snapshot.
- **P31 (Effect atomicity, Req 22.2):** For all card plays whose transaction is rolled back, no card is consumed, no Blockade exists, no Notebook entry exists, and no Event_Feed entry exists for that play.

### Testing notes

- P1–P14, P17, P18, P22, P26–P28, P30, P31 are strong property-test candidates: behavior varies meaningfully with input, the logic under test is this project's own, and cost per case is low.
- P5, P29 are best expressed as invariant checks over serialized snapshots rather than per-field assertions.
- P15, P16, P20 depend on the existing Distance_Utility as an oracle; the property tests assert agreement with that utility rather than re-implementing BFS.
- Randomized selection (Drop Ship destination, Bug a Phone target, reward draws, direction tie-breaks) requires an injectable random source so that properties can hold the draw fixed while varying other inputs.

## Decisions Recorded for Review

These points were ambiguous in the source material. Each has been resolved into a testable acceptance criterion above; the resolution chosen is stated here for confirmation.

- **D-1 Card count.** The pool contains 10 cards, matching the enumerated list. (Req 1.1)
- **D-2 Blockade expiry semantics.** "Lasts one round" is defined as the Blockade_Window: every turn strictly after the casting turn and strictly before the Blockade_Caster's next normal turn, in lexicographic (Round, turnPosition) order. Every other Player therefore loses that Transport_Type for exactly one of their own turns, regardless of where the caster sits in turn order. (Req 5.1–5.3)
- **D-3 Two casters, same transport.** Blockades do not stack in strength, but each Blockade is evaluated independently. If two Players each close Roads in the same window, each is immune to their own Blockade and blocked by the other's. (Req 4.6)
- **D-4 Open All Roads scope.** Open All Roads lifts every active blockade in the room regardless of transport type or caster. It is a universal counter to all sabotage blockades. The card name is thematic and does not limit its mechanical scope to road-only blockades. (Req 7.1–7.3)
- **D-5 Action budget.** Default_Action_Budget is 2, matching today's two slots. Lose an Action sets the affected turn to 1 action. A card played on a 1-action turn consumes that turn's only action. (Req 8.1–8.4)
- **D-6 Lose an Action stacking.** The penalty is a boolean flag, so repeated targeting caps at N−1; the extra card is still consumed with no further effect. (Req 8.8)
- **D-7 Extra turn and rounds.** An `extra-turn` card grants an Extra_Turn that carries the granting turn's Round number and Turn_Ordinal. Extra_Turns never increment the Round and therefore never affect `maxRoundLimit` draw detection. (Req 10.5)
- **D-8 Drop Ship mid-turn.** Drop Ship is a pure relocation with no extra turn component. Playing it as any action in a turn changes the player's location; subsequent actions and end-of-turn resolution operate from the new location. (Req 9.7, 9.8)
- **D-9 Drop Ship fallback.** If no Location is both ≥ 4 steps away and in another Region, the destination is the farthest Location outside the current Region, chosen uniformly among ties. With 6 Regions this fallback is always non-empty. (Req 9.3)
- **D-10 Reveal Direction algorithm.** The revealed Location is an adjacent Location whose Mastermind distance is exactly one less than the Origin_Location's, chosen uniformly among ties. When the Player is already at the Mastermind's Location (distance 0), the entry records the Player's own Location. That case does disclose that the Mastermind is at the Player's current Location — see Open Question O-2. (Req 13.3, 13.4)
- **D-11 Bug a Phone target pool.** Connected Players are preferred; if none are connected, the pool falls back to all other Players. With 2 Players the selection is deterministic. (Req 12.2–12.4)
- **D-12 Bug a Phone spy semantics.** `spyCaptured` reports whether the target's Region's Spy is captured by anyone; the identity of the capturing Player is deliberately not revealed, since that is another Player's private information. `spyRegionId` is null only when no Spy record exists for the Region. (Req 12.7–12.9)
- **D-13 Legacy card types.** The four placeholder strings are removed from the grant path. No data migration is specified because sessions are ephemeral; any card row still carrying a Legacy_Card_Type is rejected at play time with `UNKNOWN_CARD_TYPE`. (Req 1.9, 1.10)
- **D-14 Reward tier beyond 4th.** The existing behavior continues: 4th, 5th, and 6th captures each grant 1 card. The source table stops at 4th, but there are 6 Regions and therefore up to 6 captures. (Req 16.2)
- **D-15 Pending clues at game end.** Clues pending for the final Round of a game are resolved before draw detection, so a draw still delivers them. Clues pending when a Capture Attempt wins the game are discarded unresolved. (Req 14.3, 14.6)
- **D-16 Entry type naming.** The source material's snake_case clue type names (`mastermind_distance`, `mastermind_direction`, `phone_bug`) are preserved exactly, alongside the existing kebab-case `spy-proximity`. Card_Identifiers use kebab-case to match the existing `ActionCard.type` convention. (Req 1.1, 15.1)

## Open Questions

- **O-1 UI scope.** This document covers the server engine, the `USE_CARD` API surface, and polling payloads. The active game screen is currently a placeholder with no card-playing UI. Confirm whether card-playing UI belongs in this spec or a follow-up spec.
- **O-2 Reveal Direction at distance 0.** Recording the Player's own Location when the Player is already standing on the Mastermind's Location effectively confirms the exact hiding place. The alternative is to suppress the entry or record a neutral marker. Confirm the preferred behavior.
- **O-3 Extra turn consumed by a skip penalty.** Requirement 10.9 lets a failed Capture Attempt in the granting turn consume the Extra Turn granted by the `extra-turn` card. The alternative is to preserve the Extra_Turn and apply the skip to the following normal turn. Confirm the preferred behavior.
