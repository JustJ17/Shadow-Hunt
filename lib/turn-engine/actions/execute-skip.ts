/**
 * SKIP action executor. Consumes an action slot without any side effects.
 * No state changes occur — position, notebook, cards, and flags remain unchanged.
 */
export function executeSkip(): void {
  // Intentionally empty — SKIP is a no-op that just consumes the action slot
}
