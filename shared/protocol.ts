import type { GameEvent, GameState, MoveTicket, Settings } from './rules/types';

export type Role = 'mrx' | 'detective' | 'spectator';
export type Phase = 'lobby' | 'playing' | 'over';

/** Mr X's position is replaced with this value for anyone who must not see it. */
export const HIDDEN = 0;

export interface PlayerView {
  id: string;
  name: string;
  role: Role;
  connected: boolean;
  isHost: boolean;
}

export interface ChatMessage {
  id: string;
  channel: 'all' | 'team';
  playerId: string;
  name: string;
  text: string;
  at: number;
}

export const PING_LABELS = ["I'll cover", 'Block here', 'Suspect', 'Help'] as const;
export type PingLabel = (typeof PING_LABELS)[number];

export interface Ping { id: string; station: number; label: PingLabel; playerId: string; name: string; at: number }
export interface Preview { pieceIndex: number; to: number; ticket: MoveTicket | null; playerId: string }

export interface RoomView {
  code: string;
  you: { playerId: string; name: string; role: Role; isHost: boolean; pieces: number[]; seesMrX: boolean };
  players: PlayerView[];
  settings: Settings;
  /** detective slot (piece index - 1) -> controlling player id */
  assignments: (string | null)[];
  phase: Phase;
  /** Projected per viewer: Mr X's position is HIDDEN and mrxPath empty unless you may see it. */
  game: GameState | null;
  chat: ChatMessage[];
  pings: Ping[];
  previews: Preview[];
  paused: boolean;
  turnDeadline: number | null;
  undoVote: { requestedBy: string; votes: string[] } | null;
  canUndo: boolean;
}

export type Ack<T = {}> = (res: ({ ok: true } & T) | { ok: false; error: string }) => void;
export type Session = { code: string; playerId: string; token: string };

export interface ClientToServer {
  'room:create': (p: { name: string }, ack: Ack<Session>) => void;
  'room:join': (p: { code: string; name: string; token?: string }, ack: Ack<Session>) => void;
  'room:leave': () => void;
  'lobby:setRole': (p: { playerId: string; role: Role }, ack?: Ack) => void;
  'lobby:settings': (p: Partial<Settings>, ack?: Ack) => void;
  'seat:assign': (p: { seat: number; playerId: string | null }, ack?: Ack) => void;
  'game:start': (ack?: Ack) => void;
  'game:move': (p: { pieceIndex: number; ticket: MoveTicket; to: number }, ack?: Ack) => void;
  'game:double': (p: { first: { ticket: MoveTicket; to: number }; second: { ticket: MoveTicket; to: number } }, ack?: Ack) => void;
  'team:ping': (p: { station: number; label: PingLabel }) => void;
  'team:preview': (p: { pieceIndex: number; to: number | null; ticket: MoveTicket | null }) => void;
  'chat:send': (p: { channel: 'all' | 'team'; text: string }) => void;
  'host:pause': (paused: boolean) => void;
  'host:kick': (playerId: string) => void;
  'host:end': () => void;
  'host:rematch': (p: { rotateMrX: boolean }) => void;
  'undo:request': () => void;
  'undo:vote': (accept: boolean) => void;
}

export interface ServerToClient {
  'room:state': (room: RoomView) => void;
  'game:events': (events: GameEvent[]) => void;
  'room:kicked': () => void;
}
