# Shadow Circuit — Architecture

_Last updated: 2026-08-24 — map visual redesign: replaced placeholder continent silhouettes, added SVG filter defs and CSS animations to world-map.tsx_

## Overview
Shadow Circuit (working title) is a turn-based, hidden-information deduction game for 2–4 players. Browser-based, installable to a phone home screen via PWA. Built for the Ready, Spec, Ship Hackathon using Kiro.

Inspired by the core "hidden target + travel + private clues" concept of a classic deduction board game. All names, art, maps, characters, and specific mechanics are original — see `docs/COMPLIANCE.md`.

## Tech Stack & Why
| Layer | Choice | Why |
|---|---|---|
| Frontend + Backend | Next.js (App Router) + TypeScript | One language, one repo; strict typing catches mistakes (including AI-generated ones) at compile time, not in front of a judge |
| Database | Postgres (Neon or Supabase free tier) | Real persistence across the judging period — not in-memory state that resets on redeploy |
| ORM | Prisma | Type-safe queries, matches TypeScript |
| Hosting | Vercel | Zero-config for Next.js, reliable free tier |
| Multiplayer model | Turn-based / async, with short client polling for a "live" feel | Far more robust to build and test solo in a short window than WebSockets; a judge can test with two browser tabs, no coordination needed |
| Mobile | PWA manifest + responsive design | Installable to a phone home screen without a second codebase |

## Folder Structure (planned)
```
shadow-circuit/
├── .kiro/
│   ├── specs/
│   ├── steering/
│   └── hooks/
├── app/                 # Next.js routes (UI + API)
├── lib/                 # game engine, db client, shared logic
├── prisma/               # schema + migrations
├── public/               # manifest, icons, static assets
├── docs/
│   └── COMPLIANCE.md
├── assets/
│   └── ATTRIBUTIONS.md
├── ARCHITECTURE.md
└── README.md
```

## Data Flow (planned)
1. Player opens the app → joins or creates a room (lobby).
2. Server assigns hidden roles/target, stores game state in Postgres.
3. Player takes a turn (move / investigate / guess) → API route validates against the game engine in `lib/` → writes new state → returns the updated view.
4. Other players' clients poll for updates on a short interval while a game session is open.
5. Win condition is checked after each turn; game ends, result is shown.

## Key Modules
_Fill in as each spec is implemented — one line per module, "owns X / doesn't own Y."_
- `lib/engine/` — TBD
- `lib/rooms/` — TBD
- `app/api/` — TBD
- `lib/map/projection.ts` — Owns equirectangular projection from lat/lng to SVG viewBox coordinates. Doesn't own rendering.
- `lib/hooks/use-map-data.ts` — Owns client-side map data fetching, caching, and id→name/coordinate/region/adjacency lookups. Doesn't own server-side data access.
- `app/game/[roomId]/components/world-map.tsx` — Owns SVG map rendering, detailed continent silhouette paths, SVG filter definitions (city-glow, token-shadow), CSS pulse animations, region tinting, and composition of route/marker/token layers. Doesn't own game logic, action submission, or projection math.
- `lib/game-ui/card-metadata.ts` — Owns static card display metadata (displayName, description, category) for all CardIdentifier values. Doesn't own card game logic or rendering.
- `lib/hooks/use-submit-action.ts` — Owns client-side action submission (POST to action API), in-flight guard, error mapping, and refetch-on-success. Doesn't own game state polling or UI rendering.
- `app/game/[roomId]/components/game-screen-shell.tsx` — Owns responsive layout shell (desktop grid + compact tab bar), name/player lookups, and panel composition via error boundaries. Doesn't own panel internals, map rendering, or action submission.

## How .kiro/ fits in
Each game system (lobby, movement, clue engine, win condition) gets its own spec under `.kiro/specs/`. Steering rules in `.kiro/steering/` encode the stack and documentation conventions below so every Kiro session stays consistent.

## Open Decisions / TODO
- [ ] Final game name (working title: Shadow Circuit)
- [ ] Exact private-clue-delivery mechanic (Notebook — see game-design.md)
- [ ] Player count supported (2–4 assumed)
- [done] Map layout (original, TBD)
