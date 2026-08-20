# Steering: Tech Stack & Conventions

Always follow these when generating or modifying code in this repo.

## Stack
- Next.js (App Router) + TypeScript, strict mode. No plain JavaScript files.
- Prisma as the only database access layer — no raw SQL unless Prisma genuinely can't express it.
- Postgres (Neon or Supabase) as the database.
- Tailwind CSS for styling.
- Deploy target: Vercel.

## Multiplayer model
- Turn-based / async by default. No WebSockets. Use short client-side polling (every 3–5s) for a near-live feel while a game session is open.

## Conventions
- Naming: camelCase for variables/functions, PascalCase for components and types, kebab-case for file names.
- Every game-logic function in `lib/engine/` ships with at least one unit test in the same task.
- Every new API route has a corresponding test before its task is marked done.
- Don't introduce a new third-party package without a one-line note added to the tech stack table in ARCHITECTURE.md.

## Documentation
- Follow `.kiro/steering/documentation.md`. Do not mark a task complete without also updating the docs it affects.
