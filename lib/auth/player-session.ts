const PLAYER_ID_COOKIE = "player-id";

/**
 * Reads the player ID from the request's cookie header, or generates a new one.
 * For MVP, player identity is session-based — no full auth required.
 */
export function getOrCreatePlayerId(req: Request): string {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(new RegExp(`${PLAYER_ID_COOKIE}=([^;]+)`));
  if (match) {
    return match[1];
  }
  return crypto.randomUUID();
}

/**
 * Returns a Set-Cookie header value that persists the player ID.
 * Use this when setting the cookie on a Response for new players.
 */
export function playerIdCookieHeader(playerId: string): string {
  return `${PLAYER_ID_COOKIE}=${playerId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`;
}
