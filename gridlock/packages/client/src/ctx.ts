import type { MatchSnapshot, RoomState } from "@gridlock/shared";
import type { GameSocket } from "./net/client.js";

export type Screen = "callsign" | "menu" | "play" | "lobby" | "deploy" | "battle" | "options" | "credits" | "builder";
export type NetworkStep = "choose" | "create" | "join";

export interface ChatLine {
  name: string;
  text: string;
  at: number;
}

export interface Ctx {
  net: GameSocket;
  screen: Screen;
  playMode: "skirmish" | "network";
  networkStep: NetworkStep;
  name: string;
  banner: string;
  room: RoomState | null;
  match: MatchSnapshot | null;
  chat: ChatLine[];
  inspect: number | null;
  connected: boolean;
  pendingJoin: string | null;
  /** Skirmish to open once the link is up, or false. */
  pendingSkirmish: boolean;
  pendingSkirmishMap: string | null;
  leaveOpen: boolean;
  winner: { playerId: string; team: number } | null;
  goto: (screen: Screen) => void;
  setName: (name: string) => void;
  /** Open a skirmish lobby, on `mapId` when given (Map Builder play test). */
  enterSkirmish: (mapId?: string) => void;
  render: () => void;
}
