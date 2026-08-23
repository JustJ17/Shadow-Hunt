# Shadow Hunt

Shadow Hunt is a turn-based, browser-based multiplayer deduction game for 2–4 players. Players race to capture a hidden Mastermind concealed somewhere across a 40-location world map spanning six regions, using clues gathered by hunting down hidden Spy operatives in each region. Built with Next.js, TypeScript, Prisma, and Postgres, and developed end-to-end through Kiro's spec-driven workflow.

## Problem It Solves

Hidden-information deduction games are traditionally either physical — requiring everyone in the same room — or digital but synchronous, requiring every player online at the same moment. Shadow Hunt is built turn-based and async from the ground up: players take turns whenever they're free, with no real-time infrastructure required.

## Key Features

### Implemented and working

- Room creation and joining via shareable 6-character codes (public or private rooms)
- 2–4 player lobbies with ready-up, host transfer, and automatic disconnection handling
- 40-location world map across 6 regions (Europe, Asia, Africa, North America, South America, Oceania) with three transport types (plane, car, boat)
- SVG world map with equirectangular projection, zoom/pan controls, city markers, route rendering, and player tokens
- Hidden Mastermind placement — location stored server-side, never leaked to clients until game end
- One hidden Spy per region, capturable for tiered reward cards
- Full turn engine: Move, Skip, Capture Attempt, Use Card actions with validation, optimistic locking, and action budgets
- Private Notebook: spy-proximity clues recorded per-investigate action (distance from spy to player's current location within a region)
- Action Cards system with 6 card types: Blockade (car/plane/boat), Open All Roads, Lose An Action, Drop Ship, Extra Turn, and Clue cards (Locate the Mastermind, Bug a Phone, Reveal Direction)
- Blockade mechanics with caster immunity, one-round window, and mutual restriction rules
- Win detection (correct Capture Attempt) and draw detection (max round limit reached)
- End-of-game screen revealing Mastermind location
- Event feed with monotonically ordered game events
- Client-side polling (3–5s interval) for near-live multiplayer feel
- Lobby-to-game navigation on game start
- ActionBar with move selection (map click or fallback list), capture, and skip buttons
- Card hand with target picker for targeted card effects
- 67+ test files using Vitest and fast-check (property-based testing)
- Cookie-based anonymous player identity — no login required

### Designed, not yet implemented

- Mode B: Moving Target (Mastermind relocates under trigger conditions)
- PWA manifest and offline support
- Spectator mode
- More than 4 players

## Setup Instructions

```bash
# Clone the repo
git clone https://github.com/JustJ17/Shadow-Hunt.git
cd Shadow-Hunt

# Install dependencies
npm install

# Copy environment file and add your Postgres connection string
cp .env.example .env
# Edit .env — set DATABASE_URL to a Postgres connection string
# Example: DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# Generate Prisma client
npx prisma generate

# Push schema to database (or use migrations)
npx prisma db push
# Alternative: npx prisma migrate deploy

# Seed the map data (40 locations, adjacencies, regions)
npx prisma db seed

# Start development server
npm run dev
```

Open http://localhost:3000 to play.

**Database:** This project uses Postgres via [Neon](https://neon.tech) or [Supabase](https://supabase.com) free tier. Both work — $0 cost, standard free-tier rate limits apply. See [Neon free tier limits](https://neon.tech/docs/introduction/plans#free-plan) or [Supabase free tier limits](https://supabase.com/pricing).

## Usage — How to Play

1. Open the app in a browser. No login required — a player identity is created automatically via cookies.
2. **Create a room** from the home page. Choose public or private visibility, then share the 6-character room code with other players.
3. **Join a room** by entering the code, or browse public rooms.
4. In the lobby, all players **ready up**. The host starts the game when 2–4 players are ready.
5. The game begins: each player starts at a random hub location. The Mastermind is hidden at one of the 40 locations. One Spy is hidden in each of the 6 regions.
6. On your turn, you have 2 actions. Choose from:
   - **Move** — click an adjacent city on the map (highlighted in green) or use the fallback list
   - **Skip** — end your turn early
   - **Capture Attempt** — declare that the Mastermind is at your current location. Correct = you win. Incorrect = turn ends with a penalty.
   - **Use Card** — play an Action Card from your hand (if you have any)
7. Capture a Spy by ending your move at its location to earn reward cards.
8. Your **Notebook** (private) records clues about how far you are from the nearest Spy in your region each time you investigate.
9. First player to correctly locate and capture the Mastermind wins. If the max round limit is reached, the game ends in a draw.

Test with multiple browser tabs or devices — each tab gets its own player identity.

## How Kiro Was Used

This project was built entirely through Kiro's spec-driven workflow. The development process followed a structured pipeline for each feature:

**Requirements → Design → Implementation Tasks**

Each game system was developed as a separate spec under `.kiro/specs/`, iterating on requirements and design before generating implementation task lists that Kiro executed autonomously.

### Steering files (`.kiro/steering/`)

Three steering files kept every session consistent:

- `tech-stack.md` — Stack choices (Next.js App Router, Prisma, Postgres, Tailwind, Vercel), conventions (naming, testing requirements, documentation rules)
- `game-design.md` — The complete game ruleset: map layout, turn structure, clue delivery, action cards, win conditions
- `documentation.md` — Documentation-as-source-of-truth policy, ensuring ARCHITECTURE.md and design docs stayed current

### Specs built (`.kiro/specs/`)

| Spec folder | What it covers |
|---|---|
| `lobby-player-join` | Room creation, joining, leaving, ready toggle, game start, polling, disconnection |
| `map-game-initialization` | Prisma schema for map, seed script (40 cities, adjacencies), game init (threat + spy placement) |
| `adjacency-transport-type` | Transport types (plane/car/boat) on map edges, migration, seed update |
| `movement-turn-actions` | Full turn engine: validation, action executors, turn advancement, event feed, notebook |
| `win-detection-game-end` | Win/draw detection, GameResult model, end screen, max round limit |
| `action-cards` | Card system: registry, dispatcher, 6 card effects, blockades, extra turns, round-end resolution |
| `game-map` | SVG world map: coordinates, projection, map data hook, route/marker/token layers, zoom/pan |
| `game-panels` | UI panels: TurnHud, NotebookPanel, EventFeedPanel, CardHand, GameScreenShell |
| `game-wiring` | Connecting hooks to UI: useSubmitAction, useGamePoll refetch, ActionBar, legal moves, navigation |

Each spec contains `requirements.md`, `design.md`, and `tasks.md` with granular subtasks. Property-based tests (fast-check) were written alongside every game-logic module as part of the task definitions.

## Testing Instructions

**Live deployment:** [FILL IN: deployment URL]

**Local setup:** Follow the Setup Instructions above. No test credentials are needed — there is no authentication system beyond automatic cookie-based player identity. Judges can open multiple browser tabs to simulate multiple players in the same room.

**Run the test suite:**

```bash
npm run test
```

This runs 67+ test files covering lobby logic, map engine, turn engine, action cards, game UI utilities, hooks, and API routes.

**Suggested judge walkthrough:**

1. Open two browser tabs to http://localhost:3000
2. In tab 1: create a room, note the 6-character code
3. In tab 2: join with that code
4. Both tabs: click Ready
5. Tab 1 (host): click Start Game
6. Both tabs redirect to the game screen — take turns moving, using cards, and attempting captures

## Third-Party Attribution

- See [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) for the IP/originality audit trail
- See [`assets/ATTRIBUTIONS.md`](assets/ATTRIBUTIONS.md) for third-party asset attributions (currently none — all assets are original)

### Core dependencies

| Dependency | Purpose | License |
|---|---|---|
| [Next.js](https://nextjs.org/) 16.3.1 | Full-stack React framework | MIT |
| [React](https://react.dev/) 19.2.8 | UI library | MIT |
| [Prisma](https://www.prisma.io/) 7.9.1 | Type-safe database ORM | Apache-2.0 |
| [Tailwind CSS](https://tailwindcss.com/) 4 | Utility-first styling | MIT |
| [Vitest](https://vitest.dev/) 4.1.11 | Test runner | MIT |
| [fast-check](https://fast-check.dev/) 4.9.0 | Property-based testing | MIT |

**Infrastructure:** Postgres via [Neon](https://neon.tech) free tier, deployed on [Vercel](https://vercel.com) free tier. All standard open-source and free-tier tools — no paid licenses required to run this project.

## Demo Video

[FILL IN: video link — ≤3 minutes]

## Repo Layout

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full technical deep-dive: system overview, tech stack rationale, folder structure, data flow, and key module ownership boundaries.

```
shadow-hunt/
├── .kiro/           # Specs, steering files (the Kiro workflow)
├── app/             # Next.js pages + API routes
├── lib/             # Game engine, lobby logic, hooks, UI utilities
├── prisma/          # Schema, migrations, seed script
├── docs/            # Compliance audit trail
├── assets/          # Attribution records
└── ARCHITECTURE.md  # System-level source of truth
```
