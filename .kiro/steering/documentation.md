# Steering: Documentation as Source of Truth

1. ARCHITECTURE.md is the single source of truth for system-level structure. Each feature's `design.md` (inside its `.kiro/specs/` folder) is the source of truth for that feature's internals.
2. If code and documentation disagree, treat it as a bug. Stop and reconcile — don't silently trust whichever one you read first.
3. No task in any `tasks.md` is marked complete until the documentation it affects (ARCHITECTURE.md, the relevant `design.md`, or README.md) is updated in the same change.
4. Every new module, service, or route gets a one-line "owns X / doesn't own Y" note added to ARCHITECTURE.md's Key Modules section before its implementing task is marked done.
5. Never state the same fact in two documents. Link to the canonical source instead of duplicating it.
6. ARCHITECTURE.md keeps a one-line changelog at the top: "Last updated: [date] — [what changed]." Update it on every structural change.
