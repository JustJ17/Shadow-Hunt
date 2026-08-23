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
  DrawOutcome,
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

// Card system
export {
  CARD_POOL,
  LEGACY_CARD_TYPES,
} from "./cards/types";
export type {
  CardIdentifier,
  CardCategory,
  TargetRequirement,
  ResolutionTiming,
  CardDefinition,
  CardEffectContext,
} from "./cards/types";
export { CARD_REGISTRY } from "./cards/registry";
export { dispatchCard } from "./cards/dispatcher";
export type { DispatchResult, DispatchError } from "./cards/dispatcher";

// Resolution
export { resolveRoundEnd } from "./resolution/resolve-round-end";
