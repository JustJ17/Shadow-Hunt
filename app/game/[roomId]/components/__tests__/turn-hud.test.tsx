/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import fc from "fast-check";
import { TurnHud } from "../turn-hud";
import type {
  GamePollState,
  ActiveBlockadeData,
} from "@/lib/turn-engine/types";
import type { NameLookupFn } from "@/lib/game-ui/event-messages";
import type { TransportType } from "@/lib/map/types";

// --- Helpers ---

function makeState(overrides: Partial<GamePollState> = {}): GamePollState {
  return {
    roomId: "room-1",
    status: "in-progress",
    viewerPlayerId: "player-1",
    currentPlayerId: "player-1",
    currentRound: 3,
    actionsRemaining: 2,
    actionBudget: 3,
    players: [
      {
        playerId: "player-1",
        displayName: "Alice",
        locationId: "loc-london",
        turnPosition: 1,
        skipNextTurn: false,
      },
      {
        playerId: "player-2",
        displayName: "Bob",
        locationId: "loc-paris",
        turnPosition: 2,
        skipNextTurn: false,
      },
    ],
    privateData: {
      notebook: [],
      actionCards: [],
      pendingReward: null,
      skipNextTurn: false,
      actionPenaltyFlag: false,
      pendingExtraTurns: 0,
      pendingClues: [],
    },
    events: [],
    activeBlockades: [],
    ...overrides,
  };
}

const defaultNameLookup: NameLookupFn = (id, _kind) => {
  const names: Record<string, string> = {
    "loc-london": "London",
    "loc-paris": "Paris",
    "loc-berlin": "Berlin",
    "loc-rome": "Rome",
  };
  return names[id] ?? id;
};

// --- Unit Tests ---

describe("TurnHud", () => {
  describe("Round display (Requirement 2.1)", () => {
    it("renders the current round number", () => {
      render(<TurnHud state={makeState({ currentRound: 5 })} nameLookup={defaultNameLookup} />);
      expect(screen.getByText("Round 5")).toBeInTheDocument();
    });
  });

  describe("Turn identity (Requirements 2.3, 2.4)", () => {
    it("renders 'Your turn' when viewer is the current player", () => {
      const state = makeState({
        viewerPlayerId: "player-1",
        currentPlayerId: "player-1",
      });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);
      expect(screen.getByText("Your turn")).toBeInTheDocument();
    });

    it("renders 'Waiting for {name}' when another player is current", () => {
      const state = makeState({
        viewerPlayerId: "player-1",
        currentPlayerId: "player-2",
      });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);
      const waitingText = screen.getByText(/Waiting for/);
      expect(waitingText).toBeInTheDocument();
      expect(waitingText.textContent).toContain("Bob");
    });
  });

  describe("Action budget text (Requirement 2.5)", () => {
    it("renders actions remaining of action budget", () => {
      const state = makeState({ actionsRemaining: 1, actionBudget: 3 });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);
      expect(screen.getByText("1 of 3 actions")).toBeInTheDocument();
    });
  });

  describe("Turn ending indicator (Requirement 2.6)", () => {
    it("renders 'Turn ending' when actionsRemaining is 0 and it is viewer's turn", () => {
      const state = makeState({
        viewerPlayerId: "player-1",
        currentPlayerId: "player-1",
        actionsRemaining: 0,
      });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);
      expect(screen.getByText("Turn ending")).toBeInTheDocument();
    });

    it("does NOT render 'Turn ending' when actionsRemaining is 0 but it is not viewer's turn", () => {
      const state = makeState({
        viewerPlayerId: "player-1",
        currentPlayerId: "player-2",
        actionsRemaining: 0,
      });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);
      expect(screen.queryByText("Turn ending")).not.toBeInTheDocument();
    });

    it("does NOT render 'Turn ending' when actionsRemaining > 0", () => {
      const state = makeState({ actionsRemaining: 1 });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);
      expect(screen.queryByText("Turn ending")).not.toBeInTheDocument();
    });
  });

  describe("Turn order list (Requirements 3.1-3.5)", () => {
    it("renders all players in ascending turnPosition order", () => {
      const state = makeState({
        players: [
          { playerId: "p3", displayName: "Charlie", locationId: "loc-berlin", turnPosition: 3, skipNextTurn: false },
          { playerId: "p1", displayName: "Alice", locationId: "loc-london", turnPosition: 1, skipNextTurn: false },
          { playerId: "p2", displayName: "Bob", locationId: "loc-paris", turnPosition: 2, skipNextTurn: false },
        ],
        currentPlayerId: "p2",
        viewerPlayerId: "p1",
      });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);

      const list = screen.getByRole("list", { name: "Turn order" });
      const items = within(list).getAllByRole("listitem");
      expect(items).toHaveLength(3);

      // Verify order by position numbers (1, 2, 3)
      expect(items[0]).toHaveTextContent("1");
      expect(items[0]).toHaveTextContent("Alice");
      expect(items[1]).toHaveTextContent("2");
      expect(items[1]).toHaveTextContent("Bob");
      expect(items[2]).toHaveTextContent("3");
      expect(items[2]).toHaveTextContent("Charlie");
    });

    it("marks the current player's entry with aria-current", () => {
      const state = makeState({
        currentPlayerId: "player-2",
        viewerPlayerId: "player-1",
      });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);

      const list = screen.getByRole("list", { name: "Turn order" });
      const items = within(list).getAllByRole("listitem");

      // player-2 (Bob) is at turnPosition 2, so it's the second item
      expect(items[1]).toHaveAttribute("aria-current", "true");
      expect(items[0]).not.toHaveAttribute("aria-current");
    });

    it("renders '(you)' label on the viewer's entry", () => {
      const state = makeState({
        viewerPlayerId: "player-1",
        currentPlayerId: "player-2",
      });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);

      const list = screen.getByRole("list", { name: "Turn order" });
      const items = within(list).getAllByRole("listitem");
      expect(items[0]).toHaveTextContent("(you)");
      expect(items[1]).not.toHaveTextContent("(you)");
    });

    it("renders resolved location names via nameLookup", () => {
      render(<TurnHud state={makeState()} nameLookup={defaultNameLookup} />);
      const list = screen.getByRole("list", { name: "Turn order" });
      expect(list).toHaveTextContent("London");
      expect(list).toHaveTextContent("Paris");
    });
  });

  describe("Blockade indicators (Requirements 5.1-5.4)", () => {
    it("renders opponent-cast blockades with caster name and transport label", () => {
      const state = makeState({
        viewerPlayerId: "player-1",
        activeBlockades: [
          { transportType: "car", casterPlayerId: "player-2", creationRound: 1 },
          { transportType: "plane", casterPlayerId: "player-2", creationRound: 2 },
        ],
      });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);

      const section = screen.getByLabelText("Blockade indicators");
      expect(section).toHaveTextContent("Roads blocked by Bob");
      expect(section).toHaveTextContent("Airways blocked by Bob");
    });

    it("renders self-cast blockades separately with 'You blocked' text", () => {
      const state = makeState({
        viewerPlayerId: "player-1",
        activeBlockades: [
          { transportType: "boat", casterPlayerId: "player-1", creationRound: 1 },
        ],
      });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);

      const section = screen.getByLabelText("Blockade indicators");
      expect(section).toHaveTextContent("You blocked Sea routes");
    });

    it("does NOT show self-cast blockades as opponent blockades", () => {
      const state = makeState({
        viewerPlayerId: "player-1",
        activeBlockades: [
          { transportType: "car", casterPlayerId: "player-1", creationRound: 1 },
        ],
      });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);

      const section = screen.getByLabelText("Blockade indicators");
      expect(section).not.toHaveTextContent("blocked by");
    });

    it("renders no blockade indicators section when activeBlockades is empty", () => {
      const state = makeState({ activeBlockades: [] });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);
      expect(screen.queryByLabelText("Blockade indicators")).not.toBeInTheDocument();
    });
  });

  describe("Status indicators (Requirements 4.1-4.4)", () => {
    it("renders skip next turn indicator when skipNextTurn is true", () => {
      const state = makeState({
        privateData: {
          notebook: [],
          actionCards: [],
          pendingReward: null,
          skipNextTurn: true,
          actionPenaltyFlag: false,
          pendingExtraTurns: 0,
          pendingClues: [],
        },
      });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);
      expect(screen.getByText("Your next turn will be skipped")).toBeInTheDocument();
    });

    it("renders action penalty indicator when actionPenaltyFlag is true", () => {
      const state = makeState({
        privateData: {
          notebook: [],
          actionCards: [],
          pendingReward: null,
          skipNextTurn: false,
          actionPenaltyFlag: true,
          pendingExtraTurns: 0,
          pendingClues: [],
        },
      });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);
      expect(screen.getByText("You lose one action next turn")).toBeInTheDocument();
    });

    it("renders extra turns indicator when pendingExtraTurns > 0", () => {
      const state = makeState({
        privateData: {
          notebook: [],
          actionCards: [],
          pendingReward: null,
          skipNextTurn: false,
          actionPenaltyFlag: false,
          pendingExtraTurns: 2,
          pendingClues: [],
        },
      });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);
      expect(screen.getByText("2 extra turn(s) pending")).toBeInTheDocument();
    });

    it("renders no status indicators section when all flags are off", () => {
      const state = makeState({
        privateData: {
          notebook: [],
          actionCards: [],
          pendingReward: null,
          skipNextTurn: false,
          actionPenaltyFlag: false,
          pendingExtraTurns: 0,
          pendingClues: [],
        },
      });
      render(<TurnHud state={state} nameLookup={defaultNameLookup} />);
      expect(screen.queryByLabelText("Status indicators")).not.toBeInTheDocument();
    });
  });
});

// --- Property-Based Tests ---

describe("TurnHud — Property Tests", () => {
  /**
   * Property 2: Name resolution fallback
   * For any GamePollState where nameLookup returns the raw id,
   * the component renders that raw id without throwing.
   *
   * **Validates: Requirements 3.5**
   */
  describe("Property 2: Name resolution fallback", () => {
    const rawIdLookup: NameLookupFn = (id, _kind) => id;

    const arbLocationId = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);
    const arbPlayerId = fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0);

    const arbPlayer = fc.record({
      playerId: arbPlayerId,
      displayName: fc.string({ minLength: 1, maxLength: 30 }),
      locationId: arbLocationId,
      turnPosition: fc.integer({ min: 1, max: 10 }),
      skipNextTurn: fc.boolean(),
    });

    const arbState = fc
      .record({
        currentRound: fc.integer({ min: 1, max: 100 }),
        actionsRemaining: fc.integer({ min: 0, max: 5 }),
        actionBudget: fc.integer({ min: 1, max: 5 }),
        players: fc.array(arbPlayer, { minLength: 1, maxLength: 4 }),
        skipNextTurn: fc.boolean(),
        actionPenaltyFlag: fc.boolean(),
        pendingExtraTurns: fc.integer({ min: 0, max: 3 }),
      })
      .map((rec) => {
        const viewerPlayerId = rec.players[0].playerId;
        const currentPlayerId = rec.players[Math.floor(Math.random() * rec.players.length)].playerId;
        return makeState({
          currentRound: rec.currentRound,
          actionsRemaining: rec.actionsRemaining,
          actionBudget: rec.actionBudget,
          players: rec.players,
          viewerPlayerId,
          currentPlayerId,
          privateData: {
            notebook: [],
            actionCards: [],
            pendingReward: null,
            skipNextTurn: rec.skipNextTurn,
            actionPenaltyFlag: rec.actionPenaltyFlag,
            pendingExtraTurns: rec.pendingExtraTurns,
            pendingClues: [],
          },
          activeBlockades: [],
        });
      });

    it("renders without throwing when nameLookup returns the raw id", () => {
      fc.assert(
        fc.property(arbState, (state) => {
          const { container } = render(
            <TurnHud state={state} nameLookup={rawIdLookup} />,
          );
          // Verify we rendered something — the section landmark exists
          expect(container.querySelector("[aria-label='Turn HUD']")).not.toBeNull();
          // Verify the raw locationId of the first player appears in the output
          const firstPlayerLocId = state.players.sort(
            (a, b) => a.turnPosition - b.turnPosition,
          )[0].locationId;
          expect(container.textContent).toContain(firstPlayerLocId);
        }),
        { numRuns: 50 },
      );
    });
  });

  /**
   * Property 21: Blockade indicator count
   * For any GamePollState with N blockades where casterPlayerId !== viewerPlayerId,
   * the TurnHud renders exactly N opponent blockade indicators.
   *
   * **Validates: Requirements 5.1, 5.2**
   */
  describe("Property 21: Blockade indicator count", () => {
    const transportTypes: TransportType[] = ["car", "plane", "boat"];

    const arbTransportType = fc.constantFrom(...transportTypes);

    const arbBlockade = (viewerPlayerId: string) =>
      fc.record({
        transportType: arbTransportType,
        casterPlayerId: fc.constantFrom("opp-1", "opp-2", "opp-3", viewerPlayerId),
        creationRound: fc.integer({ min: 1, max: 20 }),
      }) as fc.Arbitrary<ActiveBlockadeData>;

    it("renders exactly N opponent blockade indicators for N non-viewer blockades", () => {
      const viewerPlayerId = "viewer-1";

      fc.assert(
        fc.property(
          fc.array(arbBlockade(viewerPlayerId), { minLength: 0, maxLength: 6 }),
          (blockades) => {
            const expectedOpponentCount = blockades.filter(
              (b) => b.casterPlayerId !== viewerPlayerId,
            ).length;

            const state = makeState({
              viewerPlayerId,
              currentPlayerId: viewerPlayerId,
              players: [
                { playerId: viewerPlayerId, displayName: "Viewer", locationId: "loc-london", turnPosition: 1, skipNextTurn: false },
                { playerId: "opp-1", displayName: "Opp1", locationId: "loc-paris", turnPosition: 2, skipNextTurn: false },
                { playerId: "opp-2", displayName: "Opp2", locationId: "loc-berlin", turnPosition: 3, skipNextTurn: false },
                { playerId: "opp-3", displayName: "Opp3", locationId: "loc-rome", turnPosition: 4, skipNextTurn: false },
              ],
              activeBlockades: blockades,
            });

            const { container } = render(
              <TurnHud state={state} nameLookup={defaultNameLookup} />,
            );

            if (blockades.length === 0) {
              // No blockade section at all
              expect(container.querySelector("[aria-label='Blockade indicators']")).toBeNull();
            } else {
              // Count opponent blockade indicators (elements containing "blocked by")
              const blockadeSection = container.querySelector("[aria-label='Blockade indicators']");
              if (expectedOpponentCount === 0) {
                // Only self-cast, no "blocked by" text
                if (blockadeSection) {
                  const opponentIndicators = Array.from(
                    blockadeSection.querySelectorAll("div"),
                  ).filter((el) => el.textContent?.includes("blocked by"));
                  expect(opponentIndicators).toHaveLength(0);
                }
              } else {
                expect(blockadeSection).not.toBeNull();
                const opponentIndicators = Array.from(
                  blockadeSection!.querySelectorAll("div"),
                ).filter((el) => el.textContent?.includes("blocked by"));
                expect(opponentIndicators).toHaveLength(expectedOpponentCount);
              }
            }
          },
        ),
        { numRuns: 80 },
      );
    });
  });
});
