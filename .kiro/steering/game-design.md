# Steering: Game Design — Shadow Hunt (working title)

Core rules and mechanics. Every spec (lobby, movement, clue engine, capture/win condition) must stay consistent with this file. If a spec's design would conflict with something here, flag it — don't silently deviate.

## Concept
A turn-based, hidden-information deduction game for 2–4 players. A Main Threat is hidden somewhere on the map at game start. Players travel between locations, gather clues, and race to be the first to correctly capture it. Inspired by the "hidden target across regions" concept of classic deduction board games — map, characters, clue delivery, and card system are original, not reproduced from any existing game.

## Map
- The world is divided into Regions (working default: 6), each containing several Locations (working default: 6–10 each, ~40 total for MVP).
- Fictional place names — not real-world cities — to keep the map fully original.
- [TBD: finalize exact region/location list and names before the Movement spec]

## Players & Roles
- 2–4 human players, all racing individually to be first to capture the Main Threat (not team vs. team in the base mode).
- The Main Threat is a hidden game entity, not a player — its true location lives server-side and is never sent to any client until it's captured.
- Spy NPCs: one hidden per region, capturable for Action Cards (see below).

## Turn Structure — MVP (Mode A: Stakeout)
1. Turns proceed in a fixed round-robin order.
2. On their turn, a player takes exactly one action:
   - **Move** — travel to a connected location.
   - **Investigate** — receive a clue about the Main Threat's location, recorded in your private Notebook.
   - **Capture Attempt** — declare that you believe the Main Threat is at your current location. Resolves immediately: correct = you win the game; incorrect = turn ends, no other penalty (MVP simplicity — penalties can be added later).
   - **Confront Spy** (only if a Spy NPC is present at your current location) — capture it, gain one random Action Card.
3. Game ends when a player wins via a correct Capture Attempt, or a maximum round limit is reached (draw).

## The Notebook (private clue delivery)
- Each player has a private, persistent Notebook — an ordered list of entries, one per Investigate action.
- Each entry records: the location investigated, the round number, and the clue received.
- Clue content (MVP default): a "proximity tier" relative to the Main Threat's true location — Very Close / Close / Far / Very Far, based on distance between the investigated location and the true one. (Alternative on the table: elimination-style "not in Region X" clues — easy to swap if proximity tiers feel too strong or too weak once playtested.)
- The Notebook is never shared with other players. It is each player's own hidden-information tool, and the sole channel through which they learn anything about the target's location.

## Action Cards
- Earned only by confronting a Spy NPC.
- One-time-use special abilities. MVP starter set (expand later if time allows): Reveal Region (narrows the Main Threat to one region), Extra Move (take two actions this turn), Peek Clue (see another location's proximity tier without spending a turn there).
- [TBD: finalize exact card list and effects before implementing this subsystem]

## Stretch Mode — Mode B: Moving Target
- Same core loop, but the Main Threat relocates under trigger conditions (e.g. every N rounds, or it evades to an adjacent region after a failed Capture Attempt at its location).
- Explicitly out of scope until Mode A is fully working end-to-end.

## Explicitly out of scope for MVP
- Mode B (moving target)
- Any real-time/WebSocket behavior — stays turn-based/async per `.kiro/steering/tech-stack.md`
- More than 4 players
- Spectator mode