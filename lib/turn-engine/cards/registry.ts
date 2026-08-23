import {
  CardDefinition,
  CardIdentifier,
} from "./types";
import {
  handleCloseAllRoads,
  handleCloseAllAirways,
  handleCloseAllSeaRoutes,
} from "./effects/blockade";
import { handleLoseAnAction } from "./effects/lose-an-action";
import {
  handleLocateTheMastermind,
  handleBugAPhone,
  handleRevealDirection,
} from "./effects/clue-cards";
import { handleDropShip } from "./effects/drop-ship";
import { handleExtraTurn } from "./effects/extra-turn";
import { handleOpenAllRoads } from "./effects/open-all-roads";

export const CARD_REGISTRY: ReadonlyMap<CardIdentifier, CardDefinition> = new Map([
  [
    "close-all-roads",
    {
      identifier: "close-all-roads",
      category: "sabotage",
      targetRequirement: "none",
      resolutionTiming: "immediate",
      handler: handleCloseAllRoads,
    },
  ],
  [
    "close-all-airways",
    {
      identifier: "close-all-airways",
      category: "sabotage",
      targetRequirement: "none",
      resolutionTiming: "immediate",
      handler: handleCloseAllAirways,
    },
  ],
  [
    "close-all-sea-routes",
    {
      identifier: "close-all-sea-routes",
      category: "sabotage",
      targetRequirement: "none",
      resolutionTiming: "immediate",
      handler: handleCloseAllSeaRoutes,
    },
  ],
  [
    "lose-an-action",
    {
      identifier: "lose-an-action",
      category: "sabotage",
      targetRequirement: "player",
      resolutionTiming: "immediate",
      handler: handleLoseAnAction,
    },
  ],
  [
    "locate-the-mastermind",
    {
      identifier: "locate-the-mastermind",
      category: "clue",
      targetRequirement: "none",
      resolutionTiming: "end-of-round",
      handler: handleLocateTheMastermind,
    },
  ],
  [
    "bug-a-phone",
    {
      identifier: "bug-a-phone",
      category: "clue",
      targetRequirement: "none",
      resolutionTiming: "end-of-round",
      handler: handleBugAPhone,
    },
  ],
  [
    "reveal-direction",
    {
      identifier: "reveal-direction",
      category: "clue",
      targetRequirement: "none",
      resolutionTiming: "end-of-round",
      handler: handleRevealDirection,
    },
  ],
  [
    "drop-ship",
    {
      identifier: "drop-ship",
      category: "booster",
      targetRequirement: "none",
      resolutionTiming: "immediate",
      handler: handleDropShip,
    },
  ],
  [
    "extra-turn",
    {
      identifier: "extra-turn",
      category: "booster",
      targetRequirement: "none",
      resolutionTiming: "immediate",
      handler: handleExtraTurn,
    },
  ],
  [
    "open-all-roads",
    {
      identifier: "open-all-roads",
      category: "booster",
      targetRequirement: "none",
      resolutionTiming: "immediate",
      handler: handleOpenAllRoads,
    },
  ],
]);
