// Re-export TransactionClient for use by turn-engine modules
export type { TransactionClient } from "@/lib/game/types";

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
  currentSlot: 1 | 2;
  captureAttemptFlag: boolean;
  version: number; // optimistic concurrency
}

// --- Results ---

export interface TurnActionSuccess {
  success: true;
  actionType: ActionType;
  slotNumber: 1 | 2;
  remainingSlots: number;
  updatedLocationId?: string; // present for MOVE
  resolution?: EndOfTurnResolution; // present when slot 2 completes
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
  | "INVALID_SLOT_ORDER"
  | "INVALID_MOVE"
  | "INVALID_TRANSPORT"
  | "SAME_LOCATION_MOVE"
  | "DUPLICATE_CAPTURE_ATTEMPT"
  | "INVALID_CARD"
  | "HAND_FULL"
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
  currentSlot: 1 | 2;
  players: PlayerPollData[];
  privateData: PlayerPrivateData;
  events: GameEventData[];
}

export interface PlayerPollData {
  playerId: string;
  displayName: string;
  locationId: string;
  turnPosition: number;
  skipNextTurn: boolean;
}

export interface PlayerPrivateData {
  notebook: NotebookEntryData[];
  actionCards: ActionCardData[];
  pendingReward: PendingRewardData | null;
  skipNextTurn: boolean;
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
    | "turn-skipped";
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
