import { PrismaClient } from "@/app/generated/prisma/client";

export interface GameState {
  roomId: string;
  threat: {
    id: string;
    locationId: string;
  };
  spies: SpyPlacement[];
}

export interface SpyPlacement {
  id: string;
  regionId: string;
  locationId: string;
  captured: boolean;
  capturedByPlayerId: string | null;
}

export interface InitializeGameResult {
  success: true;
  threatLocationId: string;
  spyPlacements: SpyPlacement[];
}

export interface GameInitError {
  success: false;
  error: string;
  code: "INITIALIZATION_FAILED" | "NO_LOCATIONS_FOUND" | "INVALID_ROUND_LIMIT";
}

export type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;
