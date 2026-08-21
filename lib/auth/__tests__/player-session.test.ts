import { getOrCreatePlayerId, playerIdCookieHeader } from "../player-session";

describe("getOrCreatePlayerId", () => {
  it("returns the player ID from an existing cookie", () => {
    const req = new Request("http://localhost/api/rooms", {
      headers: { cookie: "player-id=abc-123-def" },
    });
    expect(getOrCreatePlayerId(req)).toBe("abc-123-def");
  });

  it("generates a new UUID when no cookie is present", () => {
    const req = new Request("http://localhost/api/rooms");
    const id = getOrCreatePlayerId(req);
    // UUID v4 format: 8-4-4-4-12 hex chars
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("extracts player-id correctly when multiple cookies are present", () => {
    const req = new Request("http://localhost/api/rooms", {
      headers: { cookie: "session=xyz; player-id=my-player-id; theme=dark" },
    });
    expect(getOrCreatePlayerId(req)).toBe("my-player-id");
  });

  it("generates a new UUID when cookie header is empty", () => {
    const req = new Request("http://localhost/api/rooms", {
      headers: { cookie: "" },
    });
    const id = getOrCreatePlayerId(req);
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it("generates unique IDs on successive calls without a cookie", () => {
    const req1 = new Request("http://localhost/api/rooms");
    const req2 = new Request("http://localhost/api/rooms");
    expect(getOrCreatePlayerId(req1)).not.toBe(getOrCreatePlayerId(req2));
  });
});

describe("playerIdCookieHeader", () => {
  it("returns a properly formatted Set-Cookie header value", () => {
    const header = playerIdCookieHeader("test-player-id");
    expect(header).toBe(
      "player-id=test-player-id; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400"
    );
  });

  it("includes HttpOnly flag for security", () => {
    const header = playerIdCookieHeader("any-id");
    expect(header).toContain("HttpOnly");
  });

  it("sets SameSite=Strict for CSRF protection", () => {
    const header = playerIdCookieHeader("any-id");
    expect(header).toContain("SameSite=Strict");
  });

  it("sets Max-Age to 24 hours (86400 seconds)", () => {
    const header = playerIdCookieHeader("any-id");
    expect(header).toContain("Max-Age=86400");
  });
});
