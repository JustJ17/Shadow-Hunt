/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import fc from "fast-check";
import type { GamePollState } from "@/lib/turn-engine/types";
import type { MapData } from "@/lib/map/types";

// --- Mock child components to isolate GameScreenShell logic ---

vi.mock("../turn-hud", () => ({
  TurnHud: ({ state, nameLookup }: { state: GamePollState; nameLookup: (id: string, kind: "location" | "region") => string }) => (
    <div data-testid="mock-turn-hud">
      TurnHud: {state.players.map((p) => `${p.displayName}@${nameLookup(p.locationId, "location")}`).join(", ")}
    </div>
  ),
}));

vi.mock("../notebook-panel", () => ({
  NotebookPanel: () => <div data-testid="mock-notebook-panel">NotebookPanel</div>,
}));

vi.mock("../event-feed-panel", () => ({
  EventFeedPanel: () => <div data-testid="mock-event-feed-panel">EventFeedPanel</div>,
}));

vi.mock("../card-hand", () => ({
  CardHand: () => <div data-testid="mock-card-hand">CardHand</div>,
}));

import { GameScreenShell } from "../game-screen-shell";
import { PanelErrorBoundary } from "../panel-error-boundary";

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
      { playerId: "player-1", displayName: "Alice", locationId: "loc-london", turnPosition: 1, skipNextTurn: false },
      { playerId: "player-2", displayName: "Bob", locationId: "loc-paris", turnPosition: 2, skipNextTurn: false },
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

function makeMapData(): MapData {
  return {
    regions: [
      {
        id: "europe",
        name: "Europe",
        hubLocationId: "loc-london",
        locations: [
          { id: "loc-london", name: "London", regionId: "europe", isHub: true, latitude: 51.5, longitude: -0.1 },
          { id: "loc-paris", name: "Paris", regionId: "europe", isHub: false, latitude: 48.8, longitude: 2.3 },
        ],
      },
    ],
    adjacency: [
      { locationId: "loc-london", adjacentLocationIds: ["loc-paris"], edges: [{ targetLocationId: "loc-paris", isSameRegion: true, transport: "car" }] },
      { locationId: "loc-paris", adjacentLocationIds: ["loc-london"], edges: [{ targetLocationId: "loc-london", isSameRegion: true, transport: "car" }] },
    ],
  };
}

const defaultProps = {
  state: makeState(),
  mapData: makeMapData(),
  isSubmitting: false,
  onCardSelect: vi.fn(),
  mapSlot: <div data-testid="mock-map-slot">Map</div>,
};

// --- Unit Tests ---

describe("GameScreenShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Desktop layout (Requirement 1.1)", () => {
    it("renders all 4 panels simultaneously in the desktop grid", () => {
      const { container } = render(<GameScreenShell {...defaultProps} />);

      // Desktop layout is in the DOM (hidden via CSS at narrow widths)
      const desktopGrid = container.querySelector(".lg\\:grid");
      expect(desktopGrid).not.toBeNull();

      // All 4 panel test ids appear in the document
      const turnHuds = container.querySelectorAll("[data-testid='mock-turn-hud']");
      const notebooks = container.querySelectorAll("[data-testid='mock-notebook-panel']");
      const feeds = container.querySelectorAll("[data-testid='mock-event-feed-panel']");
      const cards = container.querySelectorAll("[data-testid='mock-card-hand']");

      // Desktop renders its own set + compact renders the active tab = at least 1 of each in DOM
      expect(turnHuds.length).toBeGreaterThanOrEqual(1);
      expect(notebooks.length).toBeGreaterThanOrEqual(1);
      expect(feeds.length).toBeGreaterThanOrEqual(1);
      expect(cards.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Compact layout (Requirements 1.2, 1.3)", () => {
    it("renders a tab bar with role='tablist' containing 4 tabs", () => {
      render(<GameScreenShell {...defaultProps} />);

      const tablist = screen.getByRole("tablist", { name: "Panels" });
      expect(tablist).toBeInTheDocument();

      const tabs = within(tablist).getAllByRole("tab");
      expect(tabs).toHaveLength(4);
    });

    it("renders tabs with labels: HUD, Notebook, Feed, Cards", () => {
      render(<GameScreenShell {...defaultProps} />);

      const tablist = screen.getByRole("tablist", { name: "Panels" });
      const tabs = within(tablist).getAllByRole("tab");

      expect(tabs[0]).toHaveTextContent("HUD");
      expect(tabs[1]).toHaveTextContent("Notebook");
      expect(tabs[2]).toHaveTextContent("Feed");
      expect(tabs[3]).toHaveTextContent("Cards");
    });
  });

  describe("Default tab (Requirement 1.4)", () => {
    it("selects the HUD tab by default (aria-selected='true')", () => {
      render(<GameScreenShell {...defaultProps} />);

      const hudTab = screen.getByRole("tab", { name: "HUD" });
      expect(hudTab).toHaveAttribute("aria-selected", "true");
    });

    it("other tabs are not selected by default", () => {
      render(<GameScreenShell {...defaultProps} />);

      const notebookTab = screen.getByRole("tab", { name: "Notebook" });
      const feedTab = screen.getByRole("tab", { name: "Feed" });
      const cardsTab = screen.getByRole("tab", { name: "Cards" });

      expect(notebookTab).toHaveAttribute("aria-selected", "false");
      expect(feedTab).toHaveAttribute("aria-selected", "false");
      expect(cardsTab).toHaveAttribute("aria-selected", "false");
    });
  });

  describe("Tab switching (Requirement 1.5)", () => {
    it("clicking Notebook tab selects it", () => {
      render(<GameScreenShell {...defaultProps} />);

      const notebookTab = screen.getByRole("tab", { name: "Notebook" });
      fireEvent.click(notebookTab);

      expect(notebookTab).toHaveAttribute("aria-selected", "true");
      const hudTab = screen.getByRole("tab", { name: "HUD" });
      expect(hudTab).toHaveAttribute("aria-selected", "false");
    });

    it("switching to Feed tab renders the feed panel in the tabpanel", () => {
      render(<GameScreenShell {...defaultProps} />);

      const feedTab = screen.getByRole("tab", { name: "Feed" });
      fireEvent.click(feedTab);

      const tabpanel = screen.getByRole("tabpanel");
      expect(within(tabpanel).getByTestId("mock-event-feed-panel")).toBeInTheDocument();
    });

    it("switching to Cards tab renders the card hand in the tabpanel", () => {
      render(<GameScreenShell {...defaultProps} />);

      const cardsTab = screen.getByRole("tab", { name: "Cards" });
      fireEvent.click(cardsTab);

      const tabpanel = screen.getByRole("tabpanel");
      expect(within(tabpanel).getByTestId("mock-card-hand")).toBeInTheDocument();
    });
  });

  describe("ARIA landmarks (Requirements 1.8, 1.9)", () => {
    it("renders a <main> landmark for the map region", () => {
      render(<GameScreenShell {...defaultProps} />);

      // Should have at least one main element
      const mains = screen.getAllByRole("main");
      expect(mains.length).toBeGreaterThanOrEqual(1);
    });

    it("renders tabpanel with correct aria-labelledby", () => {
      render(<GameScreenShell {...defaultProps} />);

      const tabpanel = screen.getByRole("tabpanel");
      const hudTab = screen.getByRole("tab", { name: "HUD" });

      expect(tabpanel).toHaveAttribute("aria-labelledby", hudTab.id);
    });

    it("tab has aria-controls pointing to the panel", () => {
      render(<GameScreenShell {...defaultProps} />);

      const hudTab = screen.getByRole("tab", { name: "HUD" });
      const tabpanel = screen.getByRole("tabpanel");

      expect(hudTab).toHaveAttribute("aria-controls", tabpanel.id);
    });
  });

  describe("Tab keyboard navigation (Requirement 15.9)", () => {
    it("ArrowRight moves to next tab", () => {
      render(<GameScreenShell {...defaultProps} />);

      const hudTab = screen.getByRole("tab", { name: "HUD" });
      fireEvent.keyDown(hudTab, { key: "ArrowRight" });

      const notebookTab = screen.getByRole("tab", { name: "Notebook" });
      expect(notebookTab).toHaveAttribute("aria-selected", "true");
    });

    it("ArrowLeft wraps from first to last tab", () => {
      render(<GameScreenShell {...defaultProps} />);

      const hudTab = screen.getByRole("tab", { name: "HUD" });
      fireEvent.keyDown(hudTab, { key: "ArrowLeft" });

      const cardsTab = screen.getByRole("tab", { name: "Cards" });
      expect(cardsTab).toHaveAttribute("aria-selected", "true");
    });

    it("ArrowRight wraps from last to first tab", () => {
      render(<GameScreenShell {...defaultProps} />);

      // Navigate to Cards tab first
      const cardsTab = screen.getByRole("tab", { name: "Cards" });
      fireEvent.click(cardsTab);

      fireEvent.keyDown(cardsTab, { key: "ArrowRight" });
      const hudTab = screen.getByRole("tab", { name: "HUD" });
      expect(hudTab).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("Error boundary catches panel crash (Requirements 1.10, 16.1, 16.2)", () => {
    it("shows fallback when a child throws inside PanelErrorBoundary", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { getByText } = render(
        <PanelErrorBoundary panelName="Notebook">
          <ThrowingPanel />
        </PanelErrorBoundary>,
      );

      expect(getByText("Notebook failed to render")).toBeInTheDocument();
      consoleSpy.mockRestore();
    });

    it("other content outside the boundary remains rendered", () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { container } = render(
        <div>
          <div data-testid="outside">Still here</div>
          <PanelErrorBoundary panelName="Event Feed">
            <ThrowingPanel />
          </PanelErrorBoundary>
        </div>,
      );

      expect(container.querySelector("[data-testid='outside']")).not.toBeNull();
      expect(container.textContent).toContain("Event Feed failed to render");
      consoleSpy.mockRestore();
    });
  });

  describe("Name resolution fallback when mapData is null (Requirement 16.3)", () => {
    it("renders raw location ids when mapData is null", () => {
      const { container } = render(
        <GameScreenShell
          {...defaultProps}
          mapData={null}
        />,
      );

      // The TurnHud mock renders location names via nameLookup
      // When mapData is null, nameLookup returns raw ids
      expect(container.textContent).toContain("loc-london");
      expect(container.textContent).toContain("loc-paris");
    });

    it("renders resolved names when mapData is provided", () => {
      const { container } = render(
        <GameScreenShell {...defaultProps} />,
      );

      expect(container.textContent).toContain("London");
      expect(container.textContent).toContain("Paris");
    });
  });

  describe("Map slot rendering", () => {
    it("renders the mapSlot content", () => {
      render(<GameScreenShell {...defaultProps} />);

      const mapSlots = screen.getAllByTestId("mock-map-slot");
      expect(mapSlots.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Dark theme (Requirement 1.7)", () => {
    it("applies bg-gray-900 and text-white to root element", () => {
      const { container } = render(<GameScreenShell {...defaultProps} />);

      const root = container.firstElementChild;
      expect(root?.className).toContain("bg-gray-900");
      expect(root?.className).toContain("text-white");
    });
  });
});

// --- Property-Based Tests ---

describe("GameScreenShell — Property Tests", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  /**
   * Property 1: Error boundary isolation
   * For any single panel component that throws during render, all other panels
   * and the map slot remain rendered, and the faulting panel's region displays
   * a fallback message containing that panel's name and "failed to render".
   *
   * **Validates: Requirements 1.10, 16.1, 16.2**
   */
  describe("Property 1: Error boundary isolation", () => {
    it("a crashing panel shows fallback while other panels and the map remain", () => {
      const panelNames = ["Turn HUD", "Notebook", "Event Feed", "Card Hand"];

      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: panelNames.length - 1 }),
          (crashIndex) => {
            const panels = panelNames.map((name, i) => {
              const child =
                i === crashIndex ? (
                  <ThrowingPanel />
                ) : (
                  <div data-testid={`panel-${i}`}>OK</div>
                );
              return (
                <PanelErrorBoundary key={name} panelName={name}>
                  {child}
                </PanelErrorBoundary>
              );
            });

            const { container, unmount } = render(
              <div>
                <div data-testid="map-slot">Map</div>
                {panels}
              </div>,
            );

            // The crashing panel shows its fallback
            const crashedName = panelNames[crashIndex];
            expect(container.textContent).toContain(
              `${crashedName} failed to render`,
            );

            // The map slot still renders
            expect(
              container.querySelector("[data-testid='map-slot']"),
            ).not.toBeNull();

            // All other panels still render
            for (let i = 0; i < panelNames.length; i++) {
              if (i !== crashIndex) {
                expect(
                  container.querySelector(`[data-testid='panel-${i}']`),
                ).not.toBeNull();
              }
            }

            unmount();
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  /**
   * Property 2: Name resolution fallback
   * For any Location id or Region id absent from MapData (or when MapData is null),
   * nameLookup returns a non-empty string equal to the raw id, and no consuming
   * panel throws.
   *
   * **Validates: Requirements 3.5, 16.3**
   */
  describe("Property 2: Name resolution fallback", () => {
    const arbLocationId = fc
      .string({ minLength: 1, maxLength: 30 })
      .filter((s) => s.trim().length > 0 && !s.includes(",") && !s.includes("@"));

    const arbPlayer = (locId: fc.Arbitrary<string>) =>
      fc.record({
        playerId: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        displayName: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
        locationId: locId,
        turnPosition: fc.integer({ min: 1, max: 10 }),
        skipNextTurn: fc.boolean(),
      });

    it("renders without throwing and shows raw ids when mapData is null", () => {
      fc.assert(
        fc.property(
          fc.array(arbPlayer(arbLocationId), { minLength: 1, maxLength: 4 }),
          (players) => {
            const state = makeState({
              players,
              viewerPlayerId: players[0].playerId,
              currentPlayerId: players[0].playerId,
            });

            const { container, unmount } = render(
              <GameScreenShell
                state={state}
                mapData={null}
                isSubmitting={false}
                onCardSelect={() => {}}
                mapSlot={<div>Map</div>}
              />,
            );

            // Component rendered without throwing
            expect(container.firstElementChild).not.toBeNull();

            // Raw location ids appear in the rendered output (via our TurnHud mock)
            for (const player of players) {
              expect(container.textContent).toContain(player.locationId);
            }

            unmount();
          },
        ),
        { numRuns: 50 },
      );
    });

    it("returns raw id for ids not in provided mapData", () => {
      fc.assert(
        fc.property(
          arbLocationId.filter(
            (id) => id !== "loc-london" && id !== "loc-paris",
          ),
          (unknownLocationId) => {
            const state = makeState({
              players: [
                {
                  playerId: "player-1",
                  displayName: "Alice",
                  locationId: unknownLocationId,
                  turnPosition: 1,
                  skipNextTurn: false,
                },
              ],
              viewerPlayerId: "player-1",
              currentPlayerId: "player-1",
            });

            const { container, unmount } = render(
              <GameScreenShell
                state={state}
                mapData={makeMapData()}
                isSubmitting={false}
                onCardSelect={() => {}}
                mapSlot={<div>Map</div>}
              />,
            );

            // The unknown location id appears as raw text (not resolved)
            expect(container.textContent).toContain(unknownLocationId);

            unmount();
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});

// --- Test helper component ---

function ThrowingPanel(): JSX.Element {
  throw new Error("Panel crash!");
}
