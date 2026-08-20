export type RoomStatus = "waiting" | "in-progress" | "abandoned";
export type PlayerStatus = "connected" | "disconnected";
export type ReadyState = "ready" | "not-ready";
export type RoomVisibility = "public" | "private";

export interface LobbyPlayer {
  id: string;
  displayName: string;
  isHost: boolean;
  readyState: ReadyState;
  status: PlayerStatus;
  turnPosition: number | null;
}

export interface LobbyState {
  roomCode: string;
  status: RoomStatus;
  visibility: RoomVisibility;
  players: LobbyPlayer[];
  hostId: string;
}

export interface CreateRoomResult {
  success: true;
  roomCode: string;
  state: LobbyState;
}

export interface JoinRoomResult {
  success: true;
  state: LobbyState;
}

export interface LeaveRoomResult {
  success: true;
  roomDeleted: boolean;
}

export interface ToggleReadyResult {
  success: true;
  newReadyState: ReadyState;
}

export interface StartGameResult {
  success: true;
  turnOrder: { playerId: string; position: number }[];
}

export interface PollStateResult {
  success: true;
  state: LobbyState;
}

export interface PublicRoomListResult {
  rooms: {
    roomCode: string;
    hostName: string;
    playerCount: number;
  }[];
}

export interface LobbyError {
  success: false;
  error: string;
  code: LobbyErrorCode;
}

export type LobbyErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "GAME_ALREADY_STARTED"
  | "ALREADY_IN_ROOM"
  | "MUST_LEAVE_CURRENT_ROOM"
  | "INSUFFICIENT_PLAYERS"
  | "PLAYERS_NOT_READY"
  | "NOT_HOST"
  | "NOT_IN_ROOM"
  | "CANNOT_LEAVE_ACTIVE_GAME"
  | "INVALID_INPUT";
