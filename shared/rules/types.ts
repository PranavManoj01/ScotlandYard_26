export type Transport = 'taxi' | 'bus' | 'underground' | 'ferry';
export type MoveTicket = 'taxi' | 'bus' | 'underground' | 'black';
export type Ticket = MoveTicket | 'double';
export type TicketCounts = Record<Ticket, number>;
export type Side = 'mrx' | 'detectives';

export interface Piece {
  id: string; // 'mrx' | 'red' | 'blue' ...
  role: 'mrx' | 'detective';
  name: string;
  color: string;
  position: number;
  tickets: TicketCounts;
}

export interface Move { ticket: MoveTicket; to: number }

export interface LogEntry {
  /** 1-based travel-log slot. */
  round: number;
  ticket: MoveTicket;
  /** Station shown to everyone on reveal rounds, otherwise null. */
  revealed: number | null;
  /** 1 or 2 when part of a double move. */
  doublePart: 1 | 2 | null;
  /** Detective positions when Mr X made this move (public info). */
  detectivesAt: number[];
}

export interface Settings {
  detectiveCount: number;
  totalRounds: number;
  revealRounds: number[];
  ticketsToMrX: boolean;
  helper: 'on' | 'toggle' | 'off';
  turnSeconds: 0 | 60 | 120;
  spectatorGodView: boolean;
  randomMrX: boolean;
}

export interface DetectiveMoveRecord { pieceId: string; from: number; to: number; ticket: MoveTicket | null; round: number }

export interface GameState {
  settings: Settings;
  /** pieces[0] is always Mr X. */
  pieces: Piece[];
  /** Index into pieces whose turn it is. */
  turn: number;
  log: LogEntry[];
  /** SECRET: Mr X's true station after each log entry; index 0 = start. */
  mrxPath: number[];
  detectiveMoves: DetectiveMoveRecord[];
  detectiveStarts: number[];
  /** Did any detective move during the current detective phase? */
  anyDetectiveMoved: boolean;
  winner: Side | null;
  winReason: string | null;
}

export type GameEvent =
  | { type: 'moved'; pieceId: string; ticket: MoveTicket; to: number | null; round?: number; revealed?: number | null }
  | { type: 'skipped'; pieceId: string }
  | { type: 'revealed'; round: number; station: number }
  | { type: 'gameOver'; winner: Side; reason: string };
