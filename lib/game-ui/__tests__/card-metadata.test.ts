import { getCardMeta } from "@/lib/game-ui/card-metadata";
import { CARD_POOL } from "@/lib/turn-engine/cards/types";
import type { CardMeta } from "@/lib/game-ui/card-metadata";

describe("getCardMeta", () => {
  const allIdentifiers = CARD_POOL;

  it("returns a CardMeta object for every known CardIdentifier", () => {
    for (const id of allIdentifiers) {
      const meta = getCardMeta(id);
      expect(meta).toBeDefined();
      expect(meta.displayName).toBeTruthy();
      expect(meta.description).toBeTruthy();
      expect(meta.category).toBeTruthy();
    }
  });

  it("returns displayName ≤40 characters for all known identifiers", () => {
    for (const id of allIdentifiers) {
      const meta = getCardMeta(id);
      expect(meta.displayName.length).toBeLessThanOrEqual(40);
    }
  });

  it("returns description ≤120 characters for all known identifiers", () => {
    for (const id of allIdentifiers) {
      const meta = getCardMeta(id);
      expect(meta.description.length).toBeLessThanOrEqual(120);
    }
  });

  it("returns correct category for sabotage cards", () => {
    const sabotageCards = [
      "close-all-roads",
      "close-all-airways",
      "close-all-sea-routes",
      "lose-an-action",
    ];
    for (const id of sabotageCards) {
      expect(getCardMeta(id).category).toBe("sabotage");
    }
  });

  it("returns correct category for clue cards", () => {
    const clueCards = [
      "locate-the-mastermind",
      "bug-a-phone",
      "reveal-direction",
    ];
    for (const id of clueCards) {
      expect(getCardMeta(id).category).toBe("clue");
    }
  });

  it("returns correct category for booster cards", () => {
    const boosterCards = ["drop-ship", "extra-turn", "open-all-roads"];
    for (const id of boosterCards) {
      expect(getCardMeta(id).category).toBe("booster");
    }
  });

  it("returns unique displayNames for each known identifier", () => {
    const names = allIdentifiers.map((id) => getCardMeta(id).displayName);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(allIdentifiers.length);
  });

  it("returns the raw identifier as displayName for unknown identifiers", () => {
    const unknown = "totally-unknown-card";
    const meta = getCardMeta(unknown);
    expect(meta.displayName).toBe(unknown);
  });

  it("returns 'Unrecognised card' as description for unknown identifiers", () => {
    const meta = getCardMeta("some-fake-card");
    expect(meta.description).toBe("Unrecognised card");
  });

  it("returns 'booster' as category for unknown identifiers", () => {
    const meta = getCardMeta("mystery-card");
    expect(meta.category).toBe("booster");
  });

  it("handles empty string as unknown identifier", () => {
    const meta = getCardMeta("");
    expect(meta.displayName).toBe("");
    expect(meta.description).toBe("Unrecognised card");
    expect(meta.category).toBe("booster");
  });

  it("returns displayName that differs from raw identifier for all known cards", () => {
    for (const id of allIdentifiers) {
      const meta = getCardMeta(id);
      expect(meta.displayName).not.toBe(id);
    }
  });

  it("returns specific expected metadata for sample cards", () => {
    const roadsMeta = getCardMeta("close-all-roads");
    expect(roadsMeta.displayName).toBe("Close All Roads");
    expect(roadsMeta.category).toBe("sabotage");

    const locateMeta = getCardMeta("locate-the-mastermind");
    expect(locateMeta.displayName).toBe("Locate the Mastermind");
    expect(locateMeta.category).toBe("clue");

    const extraTurnMeta = getCardMeta("extra-turn");
    expect(extraTurnMeta.displayName).toBe("Extra Turn");
    expect(extraTurnMeta.category).toBe("booster");
  });
});
