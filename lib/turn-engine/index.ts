// Public API for the turn-engine module

// submitAction will be available after task 7.1
export { submitAction } from "./submit-action";

// getGamePollState will be available after task 10.1
export { getGamePollState } from "./query-turn-state";

export type {
  ActionPayload,
  ActionType,
  TurnActionResult,
  TurnActionSuccess,
  TurnActionError,
  TurnActionErrorCode,
  TurnState,
  EndOfTurnResolution,
  CaptureAttemptOutcome,
  SpyResolutionOutcome,
  NotebookEntryData,
  GamePollState,
  PlayerPollData,
  PlayerPrivateData,
  ActionCardData,
  PendingRewardData,
  GameEventData,
  MoveActionPayload,
  SkipActionPayload,
  CaptureAttemptPayload,
  UseCardPayload,
} from "./types";
