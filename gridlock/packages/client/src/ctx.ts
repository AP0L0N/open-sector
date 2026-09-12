import type { MatchSnapshot, RoomState } from "@gridlock/shared";
import type { GameSocket } from "./net/client.js";

export type Screen = "callsign" | "menu" | "play" | "lobby" | "deploy" | "battle" | "options" | "credits";

export interface ChatLine {
  name: string;
  text: string;
  at: number;
}

export interface Ctx {
  net: GameSocket;
  screen: Screen;
  playMode: "skirmish" | "network";
  name: string;
  banner: string;
  room: RoomState | null;
  match: MatchSnapshot | null;
  chat: ChatLine[];
  inspect: number | null;
  connected: boolean;
  pendingJoin: string | null;
  pendingSkirmish: boolean;
  leaveOpen: boolean;
  winner: { playerId: string; team: number } | null;
  goto: (screen: Screen) => void;
  setName: (name: string) => void;
  enterSkirmish: () => void;
  render: () => void;
}
