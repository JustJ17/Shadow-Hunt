// Re-export TransactionClient for use by turn-engine modules
export type { TransactionClient } from "@/lib/game/types";

import type { TransportType } from "@/lib/map/types";
import type {
  CardIdentifier,
  CardCategory,
  TargetRequirement,
} from "@/lib/turn-engine/cards/types";

// --- Action Types ---

export type ActionType = "MOVE" | "SKIP" | "CAPTURE_ATTEMPT" | "USE_CARD";

export interface MoveActionPayload {
  actionType: "MOVE";
  targetLocationId: string;
}

export interface SkipActionPayload {
  actionType: "SKIP";
}

export interface CaptureAttemptPayload {
  actionType: "CAPTURE_ATTEMPT";
}

export interface UseCardPayload {
  actionType: "USE_CARD";
  cardId: string;
  targetPlayerId?: string;
}

export type ActionPayload =
  | MoveActionPayload
  | SkipActionPayload
  | CaptureAttemptPayload
  | UseCardPayload;

// --- Turn State ---

export interface TurnState {
  id: string;
  roomId: string;
  currentPlayerId: string;
  currentRound: number;
  actionsRemaining: number;
  actionBudget: number;
  captureAttemptFlag: boolean;
  isExtraTurn: boolean;
  version: number; // optimistic concurrency
}

// --- Results ---

export interface TurnActionSuccess {
  success: true;
  actionType: ActionType;
  actionsRemaining: number;
  updatedLocationId?: string; // present for MOVE
  resolution?: EndOfTurnResolution; // present when turn completes (actionsRemaining reaches 0)
}

export interface TurnActionError {
  success: false;
  error: string;
  code: TurnActionErrorCode;
}

export type TurnActionResult = TurnActionSuccess | TurnActionError;

export type TurnActionErrorCode =
  | "NOT_IN_ROOM"
  | "GAME_NOT_ACTIVE"
  | "NOT_YOUR_TURN"
  | "NO_ACTIONS_REMAINING"
  | "INVALID_MOVE"
  | "INVALID_TRANSPORT"
  | "SAME_LOCATION_MOVE"
  | "ROADS_BLOCKED"
  | "AIRWAYS_BLOCKED"
  | "SEA_ROUTES_BLOCKED"
  | "DUPLICATE_CAPTURE_ATTEMPT"
  | "INVALID_CARD"
  | "UNKNOWN_CARD_TYPE"
  | "INVALID_CARD_TARGET"
  | "CONCURRENCY_CONFLICT"
  | "UNKNOWN_ACTION_TYPE";

// --- End-of-Turn Resolution ---

export interface EndOfTurnResolution {
  captureAttempt?: CaptureAttemptOutcome;
  spyResult?: SpyResolutionOutcome;
  drawResult?: DrawOutcome;
}

export interface DrawOutcome {
  roundNumber: number;
  mastermindLocationId: string;
  reason: "max-rounds-exceeded";
}

export interface CaptureAttemptOutcome {
  result: "success" | "failed";
  locationId: string;
  winnerId?: string; // present on success
  mastermindLocationId?: string; // revealed on success only
}

export interface SpyResolutionOutcome {
  type: "clue" | "spy-captured" | "spy-captured-reward-collected" | "none";
  notebookEntry?: NotebookEntryData;
  captureOrder?: number;
  rewardTier?: number;
  message?: string;
}

export interface NotebookEntryData {
  regionId: string;
  roundNumber: number;
  stepsAway: number;
}

// --- Polling State ---

export interface GamePollState {
  roomId: string;
  status: "in-progress" | "finished";
  viewerPlayerId: string;
  currentPlayerId: string;
  currentRound: number;
  actionsRemaining: number;
  actionBudget: number;
  players: PlayerPollData[];
  privateData: PlayerPrivateData;
  events: GameEventData[];
  activeBlockades: ActiveBlockadeData[];
}

export interface PlayerPollData {
  playerId: string;
  displayName: string;
  locationId: string;
  turnPosition: number;
  skipNextTurn: boolean;
}

export interface PlayerPrivateData {
  notebook: DiscriminatedNotebookEntry[];
  actionCards: ActionCardPollData[];
  pendingReward: PendingRewardData | null;
  skipNextTurn: boolean;
  actionPenaltyFlag: boolean;
  pendingExtraTurns: number;
  pendingClues: PendingClueData[];
}

export interface ActionCardData {
  id: string;
  type: string; // e.g., "locator", "extra-move", "reveal-region"
  consumed: boolean;
}

export interface PendingRewardData {
  regionId: string; // the region where the spy was captured
  captureOrder: number;
  rewardTier: number; // number of cards to grant
}

export interface GameEventData {
  id: string;
  sequenceNumber: number;
  roundNumber: number;
  type:
    | "game-won"
    | "game-draw"
    | "capture-failed"
    | "spy-captured-reward-collected"
    | "player-moved"
    | "card-used"
    | "player-skipped"
    | "turn-skipped"
    | "blockade-activated"
    | "blockade-lifted"
    | "action-penalty-applied"
    | "player-relocated"
    | "extra-turn-started";
  payload: Record<string, unknown>;
  createdAt: string;
}

// --- Draw Detection ---

export interface DrawDetectionResult {
  drawDetected: boolean;
  drawEvent?: {
    roundNumber: number;
    mastermindLocationId: string;
  };
}

// --- Blockade State ---

export interface BlockadeState {
  blockedTransports: Set<TransportType>;
}

// --- Discriminated Notebook Entry Types ---

export type NotebookEntryType =
  | "spy-proximity"
  | "mastermind_distance"
  | "mastermind_direction"
  | "phone_bug";

export interface SpyProximityEntry {
  entryType: "spy-proximity";
  regionId: string;
  roundNumber: number;
  stepsAway: number;
}

export interface MastermindDistanceEntry {
  entryType: "mastermind_distance";
  locationId: string;
  roundNumber: number;
  stepsAway: number;
}

export interface MastermindDirectionEntry {
  entryType: "mastermind_direction";
  locationId: string;
  roundNumber: number;
}

export interface PhoneBugEntry {
  entryType: "phone_bug";
  roundNumber: number;
  targetPlayerId: string;
  targetLocationId: string;
  mastermindStepsAway: number;
  spyRegionId: string | null;
  spyCaptured: boolean;
}

export type DiscriminatedNotebookEntry =
  | SpyProximityEntry
  | MastermindDistanceEntry
  | MastermindDirectionEntry
  | PhoneBugEntry;

// --- Active Blockade Polling Data ---

export interface ActiveBlockadeData {
  transportType: TransportType;
  casterPlayerId: string;
  creationRound: number;
}

// --- Pending Clue Data ---

export interface PendingClueData {
  cardIdentifier: string;
  roundNumber: number;
}

// --- Action Card Polling Data ---

export interface ActionCardPollData {
  id: string;
  cardIdentifier: CardIdentifier;
  category: CardCategory;
  targetRequirement: TargetRequirement;
}

// --- Game Event Type (standalone type alias) ---

export type GameEventType =
  | "game-won"
  | "game-draw"
  | "capture-failed"
  | "spy-captured-reward-collected"
  | "player-moved"
  | "card-used"
  | "player-skipped"
  | "turn-skipped"
  | "blockade-activated"
  | "blockade-lifted"
  | "action-penalty-applied"
  | "player-relocated"
  | "extra-turn-started";
