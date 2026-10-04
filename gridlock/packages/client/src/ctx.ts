import type { MatchSnapshot, RoomState, SaveGame } from "@gridlock/shared";
import type { GameSocket } from "./net/client.js";

export type Screen = "callsign" | "menu" | "play" | "lobby" | "deploy" | "battle" | "options" | "credits" | "builder";
export type NetworkStep = "choose" | "create" | "join";
export type PausePane = "menu" | "save" | "load" | "options";

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
  /** Save to open once the link is up, from the main menu. */
  pendingLoad: SaveGame | null;
  leaveOpen: boolean;
  /** Which page of the skirmish pause menu is up. */
  pausePane: PausePane;
  /** Main menu is showing saved games. */
  menuLoad: boolean;
  saveDraft: string;
  saveOverwriteId: string | null;
  saveDeleteId: string | null;
  saveWaiting: boolean;
  winner: { playerId: string; team: number } | null;
  goto: (screen: Screen) => void;
  setName: (name: string) => void;
  /** Open a skirmish lobby, on `mapId` when given (Map Builder play test). */
  enterSkirmish: (mapId?: string) => void;
  /** Esc in a skirmish. Holds the sim and opens the pause menu. */
  holdSkirmish: () => void;
  /** Resume from the pause menu. The sim steps again. */
  resumeSkirmish: () => void;
  render: () => void;
}
