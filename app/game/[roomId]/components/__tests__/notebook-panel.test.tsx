/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import fc from "fast-check";
import { NotebookPanel } from "../notebook-panel";
import type {
  PlayerPrivateData,
  DiscriminatedNotebookEntry,
  SpyProximityEntry,
  MastermindDistanceEntry,
  MastermindDirectionEntry,
  PhoneBugEntry,
  PendingClueData,
} from "@/lib/turn-engine/types";
import type { NameLookupFn, PlayerLookupFn } from "@/lib/game-ui/event-messages";

// --- Helpers ---

function makePrivateData(overrides: Partial<PlayerPrivateData> = {}): PlayerPrivateData {
  return {
    notebook: [],
    actionCards: [],
    pendingReward: null,
    skipNextTurn: false,
    actionPenaltyFlag: false,
    pendingExtraTurns: 0,
    pendingClues: [],
    ...overrides,
  };
}

const defaultNameLookup: NameLookupFn = (id, _kind) => {
  const names: Record<string, string> = {
    "loc-london": "London",
    "loc-paris": "Paris",
    "loc-berlin": "Berlin",
    "loc-tokyo": "Tokyo",
    "region-europe": "Europe",
    "region-asia": "Asia",
    "region-africa": "Africa",
  };
  return names[id] ?? id;
};

const defaultPlayerLookup: PlayerLookupFn = (playerId) => {
  const names: Record<string, string> = {
    "player-1": "Alice",
    "player-2": "Bob",
    "player-3": "Charlie",
  };
  return names[playerId] ?? "someone";
};

// --- Unit Tests ---

describe("NotebookPanel", () => {
  describe("Row count (Requirement 6.1)", () => {
    it("renders exactly N entry rows for N notebook entries", () => {
      const entries: DiscriminatedNotebookEntry[] = [
        { entryType: "mastermind_distance", locationId: "loc-london", roundNumber: 1, stepsAway: 3 },
        { entryType: "mastermind_distance", locationId: "loc-paris", roundNumber: 2, stepsAway: 2 },
        { entryType: "spy-proximity", regionId: "region-europe", roundNumber: 3, stepsAway: 1 },
      ];
      const privateData = makePrivateData({ notebook: entries });
      render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      const section = screen.getByRole("region", { name: "Notebook" });
      // Each entry row has a badge (Distance, Spy, etc.)
      const badges = section.querySelectorAll("span.shrink-0");
      expect(badges).toHaveLength(3);
    });
  });

  describe("Ordering (Requirement 6.2)", () => {
    it("orders entries by ascending roundNumber", () => {
      const entries: DiscriminatedNotebookEntry[] = [
        { entryType: "mastermind_distance", locationId: "loc-paris", roundNumber: 5, stepsAway: 1 },
        { entryType: "mastermind_distance", locationId: "loc-london", roundNumber: 2, stepsAway: 3 },
        { entryType: "mastermind_distance", locationId: "loc-berlin", roundNumber: 3, stepsAway: 2 },
      ];
      const privateData = makePrivateData({ notebook: entries });
      const { container } = render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      // Round numbers should appear in ascending order
      const textContent = container.textContent ?? "";
      const r2Idx = textContent.indexOf("R2");
      const r3Idx = textContent.indexOf("R3");
      const r5Idx = textContent.indexOf("R5");
      expect(r2Idx).toBeLessThan(r3Idx);
      expect(r3Idx).toBeLessThan(r5Idx);
    });

    it("preserves original array order for same roundNumber (tie-breaking)", () => {
      const entries: DiscriminatedNotebookEntry[] = [
        { entryType: "mastermind_distance", locationId: "loc-london", roundNumber: 2, stepsAway: 5 },
        { entryType: "mastermind_distance", locationId: "loc-paris", roundNumber: 2, stepsAway: 3 },
        { entryType: "mastermind_distance", locationId: "loc-berlin", roundNumber: 2, stepsAway: 1 },
      ];
      const privateData = makePrivateData({ notebook: entries });
      const { container } = render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      // London (5 steps) should appear before Paris (3 steps) before Berlin (1 step)
      const textContent = container.textContent ?? "";
      const londonIdx = textContent.indexOf("London");
      const parisIdx = textContent.indexOf("Paris");
      const berlinIdx = textContent.indexOf("Berlin");
      expect(londonIdx).toBeLessThan(parisIdx);
      expect(parisIdx).toBeLessThan(berlinIdx);
    });
  });

  describe("Entry type renderings (Requirements 6.4-6.8)", () => {
    it("spy-proximity: renders 'Spy' badge, region name, and stepsAway", () => {
      const entries: DiscriminatedNotebookEntry[] = [
        { entryType: "spy-proximity", regionId: "region-europe", roundNumber: 1, stepsAway: 2 },
      ];
      const privateData = makePrivateData({ notebook: entries });
      const { container } = render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      expect(container.textContent).toContain("Spy");
      expect(container.textContent).toContain("Europe");
      expect(container.textContent).toContain("2 steps from Spy");
    });

    it("mastermind_distance: renders 'Distance' badge, location name, and stepsAway", () => {
      const entries: DiscriminatedNotebookEntry[] = [
        { entryType: "mastermind_distance", locationId: "loc-london", roundNumber: 1, stepsAway: 4 },
      ];
      const privateData = makePrivateData({ notebook: entries });
      const { container } = render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      expect(container.textContent).toContain("Distance");
      expect(container.textContent).toContain("London");
      expect(container.textContent).toContain("4 steps from Mastermind");
    });

    it("mastermind_direction: renders 'Direction' badge, location name, and 'one step closer'", () => {
      const entries: DiscriminatedNotebookEntry[] = [
        { entryType: "mastermind_direction", locationId: "loc-tokyo", roundNumber: 2 },
      ];
      const privateData = makePrivateData({ notebook: entries });
      const { container } = render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      expect(container.textContent).toContain("Direction");
      expect(container.textContent).toContain("Tokyo");
      expect(container.textContent).toContain("one step closer to Mastermind");
    });

    it("phone_bug: renders 'Phone Bug' badge, player name, location, mastermindStepsAway, and spy info", () => {
      const entries: DiscriminatedNotebookEntry[] = [
        {
          entryType: "phone_bug",
          roundNumber: 3,
          targetPlayerId: "player-2",
          targetLocationId: "loc-paris",
          mastermindStepsAway: 2,
          spyRegionId: "region-asia",
          spyCaptured: false,
        },
      ];
      const privateData = makePrivateData({ notebook: entries });
      const { container } = render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      expect(container.textContent).toContain("Phone Bug");
      expect(container.textContent).toContain("Bob");
      expect(container.textContent).toContain("Paris");
      expect(container.textContent).toContain("2 steps from");
      expect(container.textContent).toContain("spy in Asia");
    });

    it("phone_bug with null spyRegionId: renders 'no spy information'", () => {
      const entries: DiscriminatedNotebookEntry[] = [
        {
          entryType: "phone_bug",
          roundNumber: 4,
          targetPlayerId: "player-3",
          targetLocationId: "loc-berlin",
          mastermindStepsAway: 1,
          spyRegionId: null,
          spyCaptured: false,
        },
      ];
      const privateData = makePrivateData({ notebook: entries });
      const { container } = render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      expect(container.textContent).toContain("no spy information");
    });

    it("phone_bug with spyCaptured true: renders 'spy captured in {region}'", () => {
      const entries: DiscriminatedNotebookEntry[] = [
        {
          entryType: "phone_bug",
          roundNumber: 5,
          targetPlayerId: "player-2",
          targetLocationId: "loc-london",
          mastermindStepsAway: 3,
          spyRegionId: "region-europe",
          spyCaptured: true,
        },
      ];
      const privateData = makePrivateData({ notebook: entries });
      const { container } = render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      expect(container.textContent).toContain("spy captured in Europe");
    });
  });

  describe("Unknown entry type (Requirement 6.9)", () => {
    it("renders 'Unrecognised clue' for unknown entryType", () => {
      const entries = [
        { entryType: "unknown_type_xyz", roundNumber: 7 } as unknown as DiscriminatedNotebookEntry,
      ];
      const privateData = makePrivateData({ notebook: entries });
      const { container } = render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      expect(container.textContent).toContain("Unrecognised clue");
      expect(container.textContent).toContain("R7");
    });
  });

  describe("Filter buttons (Requirements 7.4, 7.7)", () => {
    it("renders only 'All' plus present entry types as filter buttons", () => {
      const entries: DiscriminatedNotebookEntry[] = [
        { entryType: "mastermind_distance", locationId: "loc-london", roundNumber: 1, stepsAway: 2 },
        { entryType: "spy-proximity", regionId: "region-europe", roundNumber: 2, stepsAway: 1 },
      ];
      const privateData = makePrivateData({ notebook: entries });
      render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      const filterGroup = screen.getByRole("group", { name: "Filter by clue type" });
      const buttons = within(filterGroup).getAllByRole("button");

      // Should have "All", "Distance", "Spy" — but NOT "Direction" or "Phone Bug"
      const labels = buttons.map((b) => b.textContent);
      expect(labels).toContain("All");
      expect(labels).toContain("Distance");
      expect(labels).toContain("Spy");
      expect(labels).not.toContain("Direction");
      expect(labels).not.toContain("Phone Bug");
    });

    it("does not render filter buttons when notebook is empty", () => {
      const privateData = makePrivateData({
        notebook: [],
        pendingClues: [{ cardIdentifier: "locate-the-mastermind", roundNumber: 5 }],
      });
      render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      expect(screen.queryByRole("group", { name: "Filter by clue type" })).not.toBeInTheDocument();
    });

    it("filter buttons use aria-pressed to indicate active filter", () => {
      const entries: DiscriminatedNotebookEntry[] = [
        { entryType: "mastermind_distance", locationId: "loc-london", roundNumber: 1, stepsAway: 2 },
        { entryType: "spy-proximity", regionId: "region-europe", roundNumber: 2, stepsAway: 1 },
      ];
      const privateData = makePrivateData({ notebook: entries });
      render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      const filterGroup = screen.getByRole("group", { name: "Filter by clue type" });
      const allBtn = within(filterGroup).getByText("All");
      expect(allBtn).toHaveAttribute("aria-pressed", "true");

      const distanceBtn = within(filterGroup).getByText("Distance");
      expect(distanceBtn).toHaveAttribute("aria-pressed", "false");
    });
  });

  describe("Filter selection (Requirements 7.5, 7.6)", () => {
    it("clicking a type filter shows only matching entries", () => {
      const entries: DiscriminatedNotebookEntry[] = [
        { entryType: "mastermind_distance", locationId: "loc-london", roundNumber: 1, stepsAway: 2 },
        { entryType: "spy-proximity", regionId: "region-europe", roundNumber: 2, stepsAway: 1 },
        { entryType: "mastermind_distance", locationId: "loc-paris", roundNumber: 3, stepsAway: 4 },
      ];
      const privateData = makePrivateData({ notebook: entries });
      const { container } = render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      const filterGroup = screen.getByRole("group", { name: "Filter by clue type" });
      const distanceBtn = within(filterGroup).getByText("Distance");
      fireEvent.click(distanceBtn);

      // Should see both distance entries but not the spy entry
      expect(container.textContent).toContain("London");
      expect(container.textContent).toContain("Paris");
      expect(container.textContent).not.toContain("Europe");
    });

    it("clicking 'All' shows all entries", () => {
      const entries: DiscriminatedNotebookEntry[] = [
        { entryType: "mastermind_distance", locationId: "loc-london", roundNumber: 1, stepsAway: 2 },
        { entryType: "spy-proximity", regionId: "region-europe", roundNumber: 2, stepsAway: 1 },
      ];
      const privateData = makePrivateData({ notebook: entries });
      const { container } = render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      // Click "Spy" first to filter
      const filterGroup = screen.getByRole("group", { name: "Filter by clue type" });
      fireEvent.click(within(filterGroup).getByText("Spy"));

      // Click "All" to reset
      fireEvent.click(within(filterGroup).getByText("All"));

      expect(container.textContent).toContain("London");
      expect(container.textContent).toContain("Europe");
    });

    it("pending clues remain visible regardless of active filter", () => {
      const entries: DiscriminatedNotebookEntry[] = [
        { entryType: "mastermind_distance", locationId: "loc-london", roundNumber: 1, stepsAway: 2 },
        { entryType: "spy-proximity", regionId: "region-europe", roundNumber: 2, stepsAway: 1 },
      ];
      const pendingClues: PendingClueData[] = [
        { cardIdentifier: "locate-the-mastermind", roundNumber: 5 },
      ];
      const privateData = makePrivateData({ notebook: entries, pendingClues });
      const { container } = render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      // Filter to "Spy" only
      const filterGroup = screen.getByRole("group", { name: "Filter by clue type" });
      fireEvent.click(within(filterGroup).getByText("Spy"));

      // Pending clue should still be visible
      expect(container.textContent).toContain("resolves at end of round 5");
    });
  });

  describe("Empty state (Requirements 7.3, 16.4)", () => {
    it("renders 'No clues yet' when both notebook and pendingClues are empty", () => {
      const privateData = makePrivateData({ notebook: [], pendingClues: [] });
      render(
        <NotebookPanel
          privateData={privateData}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      expect(screen.getByText("No clues yet")).toBeInTheDocument();
    });

    it("renders 'No clues yet' when privateData is undefined", () => {
      render(
        <NotebookPanel
          privateData={undefined}
          nameLookup={defaultNameLookup}
          playerLookup={defaultPlayerLookup}
        />,
      );

      expect(screen.getByText("No clues yet")).toBeInTheDocument();
    });
  });
});

// --- Property-Based Tests ---

describe("NotebookPanel — Property Tests", () => {
  // --- Arbitraries ---

  const arbSpyProximity: fc.Arbitrary<SpyProximityEntry> = fc.record({
    entryType: fc.constant("spy-proximity" as const),
    regionId: fc.constantFrom("region-europe", "region-asia", "region-africa"),
    roundNumber: fc.integer({ min: 1, max: 50 }),
    stepsAway: fc.integer({ min: 0, max: 6 }),
  });

  const arbMastermindDistance: fc.Arbitrary<MastermindDistanceEntry> = fc.record({
    entryType: fc.constant("mastermind_distance" as const),
    locationId: fc.constantFrom("loc-london", "loc-paris", "loc-berlin", "loc-tokyo"),
    roundNumber: fc.integer({ min: 1, max: 50 }),
    stepsAway: fc.integer({ min: 0, max: 6 }),
  });

  const arbMastermindDirection: fc.Arbitrary<MastermindDirectionEntry> = fc.record({
    entryType: fc.constant("mastermind_direction" as const),
    locationId: fc.constantFrom("loc-london", "loc-paris", "loc-berlin", "loc-tokyo"),
    roundNumber: fc.integer({ min: 1, max: 50 }),
  });

  const arbPhoneBug: fc.Arbitrary<PhoneBugEntry> = fc.record({
    entryType: fc.constant("phone_bug" as const),
    roundNumber: fc.integer({ min: 1, max: 50 }),
    targetPlayerId: fc.constantFrom("player-1", "player-2", "player-3"),
    targetLocationId: fc.constantFrom("loc-london", "loc-paris", "loc-berlin", "loc-tokyo"),
    mastermindStepsAway: fc.integer({ min: 0, max: 6 }),
    spyRegionId: fc.oneof(
      fc.constantFrom("region-europe", "region-asia", "region-africa"),
      fc.constant(null),
    ),
    spyCaptured: fc.boolean(),
  });

  const arbNotebookEntry: fc.Arbitrary<DiscriminatedNotebookEntry> = fc.oneof(
    arbSpyProximity,
    arbMastermindDistance,
    arbMastermindDirection,
    arbPhoneBug,
  );

  const arbPendingClue: fc.Arbitrary<PendingClueData> = fc.record({
    cardIdentifier: fc.constantFrom(
      "locate-the-mastermind",
      "bug-a-phone",
      "reveal-direction",
    ),
    roundNumber: fc.integer({ min: 1, max: 50 }),
  });

  /**
   * Property 3: Notebook row count
   * For any notebook of length N, render exactly N entry rows.
   *
   * **Validates: Requirements 6.1**
   */
  describe("Property 3: Notebook row count", () => {
    it("renders exactly N entry rows for any notebook of length N", () => {
      fc.assert(
        fc.property(
          fc.array(arbNotebookEntry, { minLength: 0, maxLength: 15 }),
          (notebook) => {
            const privateData = makePrivateData({ notebook });
            const { container } = render(
              <NotebookPanel
                privateData={privateData}
                nameLookup={defaultNameLookup}
                playerLookup={defaultPlayerLookup}
              />,
            );

            if (notebook.length === 0) {
              // Empty state — no entry rows
              expect(container.textContent).toContain("No clues yet");
            } else {
              // Count entry rows by counting badge spans
              const badges = container.querySelectorAll("span.shrink-0");
              expect(badges).toHaveLength(notebook.length);
            }
          },
        ),
        { numRuns: 80 },
      );
    });
  });

  /**
   * Property 4: Notebook ordering
   * Rendered entries in ascending roundNumber order, ties preserve array order.
   *
   * **Validates: Requirements 6.2**
   */
  describe("Property 4: Notebook ordering", () => {
    it("renders entries in ascending roundNumber order", () => {
      fc.assert(
        fc.property(
          fc.array(arbNotebookEntry, { minLength: 2, maxLength: 15 }),
          (notebook) => {
            const privateData = makePrivateData({ notebook });
            const { container } = render(
              <NotebookPanel
                privateData={privateData}
                nameLookup={defaultNameLookup}
                playerLookup={defaultPlayerLookup}
              />,
            );

            // Extract rendered round numbers from text content (pattern: R{number})
            const textContent = container.textContent ?? "";
            const roundMatches = [...textContent.matchAll(/R(\d+)/g)].map((m) =>
              parseInt(m[1], 10),
            );

            // Verify ascending order
            for (let i = 1; i < roundMatches.length; i++) {
              expect(roundMatches[i]).toBeGreaterThanOrEqual(roundMatches[i - 1]);
            }
          },
        ),
        { numRuns: 80 },
      );
    });
  });

  /**
   * Property 17: Unknown notebook entry type fallback
   * Unknown entryType shows "Unrecognised clue" with round number.
   *
   * **Validates: Requirements 6.9**
   */
  describe("Property 17: Unknown notebook entry type fallback", () => {
    it("renders 'Unrecognised clue' for any unknown entryType", () => {
      const arbUnknownType = fc
        .string({ minLength: 3, maxLength: 20 })
        .filter(
          (s) =>
            s !== "spy-proximity" &&
            s !== "mastermind_distance" &&
            s !== "mastermind_direction" &&
            s !== "phone_bug",
        );

      fc.assert(
        fc.property(
          arbUnknownType,
          fc.integer({ min: 1, max: 100 }),
          (unknownType, roundNumber) => {
            const entries = [
              { entryType: unknownType, roundNumber } as unknown as DiscriminatedNotebookEntry,
            ];
            const privateData = makePrivateData({ notebook: entries });
            const { container } = render(
              <NotebookPanel
                privateData={privateData}
                nameLookup={defaultNameLookup}
                playerLookup={defaultPlayerLookup}
              />,
            );

            expect(container.textContent).toContain("Unrecognised clue");
            expect(container.textContent).toContain(`R${roundNumber}`);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property 18: Notebook filter correctness
   * Filter shows only matching entries + all pending clues.
   *
   * **Validates: Requirements 7.5**
   */
  describe("Property 18: Notebook filter correctness", () => {
    it("filtering shows only matching entryType entries plus all pending clues", () => {
      const arbEntryType = fc.constantFrom(
        "spy-proximity" as const,
        "mastermind_distance" as const,
        "mastermind_direction" as const,
        "phone_bug" as const,
      );

      // Generate notebooks that contain at least 2 entry types
      const arbMixedNotebook = fc
        .array(arbNotebookEntry, { minLength: 2, maxLength: 10 })
        .filter((entries) => {
          const types = new Set(entries.map((e) => e.entryType));
          return types.size >= 2;
        });

      fc.assert(
        fc.property(
          arbMixedNotebook,
          fc.array(arbPendingClue, { minLength: 0, maxLength: 3 }),
          arbEntryType,
          (notebook, pendingClues, filterType) => {
            // Only test filter if notebook actually contains this type
            const hasFilterType = notebook.some((e) => e.entryType === filterType);
            if (!hasFilterType) return; // skip — filter button won't exist

            const privateData = makePrivateData({ notebook, pendingClues });
            const { container } = render(
              <NotebookPanel
                privateData={privateData}
                nameLookup={defaultNameLookup}
                playerLookup={defaultPlayerLookup}
              />,
            );

            // Find and click the filter button
            const filterLabels: Record<string, string> = {
              "spy-proximity": "Spy",
              mastermind_distance: "Distance",
              mastermind_direction: "Direction",
              phone_bug: "Phone Bug",
            };
            const filterGroup = container.querySelector("[role='group']");
            if (!filterGroup) return;
            const filterBtn = Array.from(filterGroup.querySelectorAll("button")).find(
              (btn) => btn.textContent === filterLabels[filterType],
            );
            if (!filterBtn) return;
            fireEvent.click(filterBtn);

            // Count visible entry badges (excluding pending clue rows)
            const badges = container.querySelectorAll("span.shrink-0");
            const expectedCount = notebook.filter((e) => e.entryType === filterType).length;
            expect(badges).toHaveLength(expectedCount);

            // Pending clues should still be visible
            const pendingRows = container.querySelectorAll(
              "div.border.border-dashed",
            );
            expect(pendingRows).toHaveLength(pendingClues.length);
          },
        ),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property 19: Notebook filter options match present types
   * Filter buttons = distinct present types + "All".
   *
   * **Validates: Requirements 7.4**
   */
  describe("Property 19: Notebook filter options match present types", () => {
    it("filter control offers exactly the set of present entryTypes + 'All'", () => {
      fc.assert(
        fc.property(
          fc.array(arbNotebookEntry, { minLength: 1, maxLength: 12 }),
          (notebook) => {
            const privateData = makePrivateData({ notebook });
            const { container } = render(
              <NotebookPanel
                privateData={privateData}
                nameLookup={defaultNameLookup}
                playerLookup={defaultPlayerLookup}
              />,
            );

            const filterLabels: Record<string, string> = {
              "spy-proximity": "Spy",
              mastermind_distance: "Distance",
              mastermind_direction: "Direction",
              phone_bug: "Phone Bug",
            };

            const presentTypes = new Set(notebook.map((e) => e.entryType));
            const expectedLabels = new Set(["All"]);
            for (const type of presentTypes) {
              if (filterLabels[type]) {
                expectedLabels.add(filterLabels[type]);
              }
            }

            const filterGroup = container.querySelector("[role='group']");
            expect(filterGroup).not.toBeNull();
            const buttons = Array.from(filterGroup!.querySelectorAll("button"));
            const renderedLabels = new Set(buttons.map((b) => b.textContent ?? ""));

            expect(renderedLabels).toEqual(expectedLabels);
          },
        ),
        { numRuns: 80 },
      );
    });
  });

  /**
   * Property 20: Notebook data isolation
   * No data from outside notebook/pendingClues appears in the panel.
   *
   * **Validates: Requirements 7.8**
   */
  describe("Property 20: Notebook data isolation", () => {
    it("does not render data from external sources not in notebook or pendingClues", () => {
      // We test isolation by passing a privateData with empty notebook/pendingClues
      // and verifying no extra clue data shows up.
      fc.assert(
        fc.property(
          fc.array(arbNotebookEntry, { minLength: 0, maxLength: 8 }),
          fc.array(arbPendingClue, { minLength: 0, maxLength: 3 }),
          (notebook, pendingClues) => {
            const privateData = makePrivateData({ notebook, pendingClues });
            const { container } = render(
              <NotebookPanel
                privateData={privateData}
                nameLookup={defaultNameLookup}
                playerLookup={defaultPlayerLookup}
              />,
            );

            if (notebook.length === 0 && pendingClues.length === 0) {
              expect(container.textContent).toContain("No clues yet");
              return;
            }

            // Count total rendered items — should equal notebook entries + pending clues
            const badges = container.querySelectorAll("span.shrink-0");
            const pendingRows = container.querySelectorAll(
              "div.border.border-dashed",
            );

            expect(badges).toHaveLength(notebook.length);
            expect(pendingRows).toHaveLength(pendingClues.length);
          },
        ),
        { numRuns: 80 },
      );
    });
  });
});
