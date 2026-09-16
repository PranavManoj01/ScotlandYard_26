import { randomBytes, randomUUID } from 'node:crypto';
import { DEFAULT_SETTINGS } from '../../shared/rules/constants';
import {
  applyDoubleMove, applyMove, canDoubleMove, createGame, randomMove,
} from '../../shared/rules/engine';
import type { GameEvent, GameState, Move, Settings } from '../../shared/rules/types';
import {
  HIDDEN, PING_LABELS, type ChatMessage, type Phase, type Ping, type PingLabel, type Preview, type Role, type RoomView,
} from '../../shared/protocol';

export class RoomError extends Error {}

export interface PlayerRec {
  id: string;
  token: string;
  name: string;
  role: Role;
  connections: number;
}

export interface Room {
  code: string;
  hostId: string;
  players: PlayerRec[];
  settings: Settings;
  assignments: (string | null)[];
  phase: Phase;
  game: GameState | null;
  undoStack: GameState[];
  chat: ChatMessage[];
  pings: Ping[];
  previews: Preview[];
  paused: boolean;
  turnDeadline: number | null;
  undoVote: { requestedBy: string; votes: string[] } | null;
  lastActivity: number;
}

const MAX_CHAT = 200;
const cleanName = (name: string) => (name ?? '').trim().slice(0, 20) || 'Player';

function newCode(existing: Map<string, Room>): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const code = [...randomBytes(4)].map((b) => alphabet[b % alphabet.length]).join('');
    if (!existing.has(code)) return code;
  }
}

export function validateSettings(current: Settings, patch: Partial<Settings>): Settings {
  const next = { ...current, ...patch };
  const count = Math.round(Number(next.detectiveCount));
  if (!(count >= 1 && count <= 5)) throw new RoomError('Detectives must be between 1 and 5');
  const rounds = Math.round(Number(next.totalRounds));
  if (!(rounds >= 5 && rounds <= 30)) throw new RoomError('Rounds must be between 5 and 30');
  const reveals = [...new Set((next.revealRounds ?? []).map(Number))]
    .filter((r) => Number.isInteger(r) && r >= 1 && r <= rounds)
    .sort((a, b) => a - b);
  if (!['on', 'toggle', 'off'].includes(next.helper)) throw new RoomError('Invalid helper setting');
  if (![0, 60, 120].includes(next.turnSeconds)) throw new RoomError('Invalid turn timer');
  return {
    detectiveCount: count,
    totalRounds: rounds,
    revealRounds: reveals,
    ticketsToMrX: !!next.ticketsToMrX,
    helper: next.helper,
    turnSeconds: next.turnSeconds,
    spectatorGodView: !!next.spectatorGodView,
    randomMrX: !!next.randomMrX,
  };
}

export class RoomManager {
  rooms = new Map<string, Room>();

  constructor(private onChange: (room: Room, events?: GameEvent[]) => void = () => {}) {}

  get(code: string): Room {
    const room = this.rooms.get((code ?? '').toUpperCase().trim());
    if (!room) throw new RoomError('Room not found');
    return room;
  }

  player(room: Room, playerId: string): PlayerRec {
    const p = room.players.find((x) => x.id === playerId);
    if (!p) throw new RoomError('You are not in this room');
    return p;
  }

  private requireHost(room: Room, playerId: string) {
    if (room.hostId !== playerId) throw new RoomError('Only the host can do that');
  }

  private touch(room: Room, events?: GameEvent[]) {
    room.lastActivity = Date.now();
    this.onChange(room, events);
  }

  create(name: string): { room: Room; player: PlayerRec } {
    const player: PlayerRec = { id: randomUUID(), token: randomUUID(), name: cleanName(name), role: 'detective', connections: 0 };
    const room: Room = {
      code: newCode(this.rooms),
      hostId: player.id,
      players: [player],
      settings: { ...DEFAULT_SETTINGS },
      assignments: Array(DEFAULT_SETTINGS.detectiveCount).fill(null),
      phase: 'lobby',
      game: null,
      undoStack: [],
      chat: [],
      pings: [],
      previews: [],
      paused: false,
      turnDeadline: null,
      undoVote: null,
      lastActivity: Date.now(),
    };
    this.rooms.set(room.code, room);
    this.touch(room);
    return { room, player };
  }

  join(code: string, name: string, token?: string): { room: Room; player: PlayerRec } {
    const room = this.get(code);
    const existing = token ? room.players.find((p) => p.token === token) : undefined;
    if (existing) return { room, player: existing };
    if (room.players.length >= 16) throw new RoomError('Room is full');
    let finalName = cleanName(name);
    const taken = new Set(room.players.map((p) => p.name.toLowerCase()));
    for (let i = 2; taken.has(finalName.toLowerCase()); i++) finalName = `${cleanName(name).slice(0, 17)} ${i}`;
    const player: PlayerRec = {
      id: randomUUID(), token: randomUUID(), name: finalName,
      role: room.phase === 'lobby' ? 'detective' : 'spectator', connections: 0,
    };
    room.players.push(player);
    this.systemChat(room, `${player.name} joined${player.role === 'spectator' ? ' as a spectator' : ''}.`);
    this.touch(room);
    return { room, player };
  }

  setConnected(room: Room, playerId: string, delta: 1 | -1) {
    const p = room.players.find((x) => x.id === playerId);
    if (!p) return;
    p.connections = Math.max(0, p.connections + delta);
    this.touch(room);
  }

  leave(room: Room, playerId: string) {
    const p = this.player(room, playerId);
    if (room.phase !== 'lobby') {
      // Keep their seat so the host can reassign it; just drop them to spectator if they held nothing.
      p.connections = 0;
      this.touch(room);
      return;
    }
    this.remove(room, playerId);
  }

  private remove(room: Room, playerId: string) {
    room.players = room.players.filter((p) => p.id !== playerId);
    room.assignments = room.assignments.map((a) => (a === playerId ? null : a));
    if (room.hostId === playerId && room.players.length) {
      room.hostId = (room.players.find((p) => p.connections > 0) ?? room.players[0]).id;
    }
    if (!room.players.length) {
      this.rooms.delete(room.code);
      return;
    }
    this.touch(room);
  }

  kick(room: Room, hostId: string, playerId: string) {
    this.requireHost(room, hostId);
    if (playerId === hostId) throw new RoomError('You cannot kick yourself');
    const p = this.player(room, playerId);
    if (room.phase === 'playing' && (p.role === 'mrx' || room.assignments.includes(playerId))) {
      throw new RoomError('Reassign their seats before kicking them');
    }
    this.systemChat(room, `${p.name} was removed by the host.`);
    this.remove(room, playerId);
  }

  setRole(room: Room, actorId: string, playerId: string, role: Role) {
    if (actorId !== playerId) this.requireHost(room, actorId);
    if (room.phase !== 'lobby') throw new RoomError('Roles can only change in the lobby');
    if (!['mrx', 'detective', 'spectator'].includes(role)) throw new RoomError('Invalid role');
    const p = this.player(room, playerId);
    if (role === 'mrx') {
      const current = room.players.find((x) => x.role === 'mrx' && x.id !== playerId);
      if (current && actorId !== room.hostId) throw new RoomError(`${current.name} is already Mr X`);
      if (current) current.role = 'detective';
    }
    p.role = role;
    if (role !== 'detective') room.assignments = room.assignments.map((a) => (a === playerId ? null : a));
    this.touch(room);
  }

  updateSettings(room: Room, actorId: string, patch: Partial<Settings>) {
    this.requireHost(room, actorId);
    if (room.phase !== 'lobby') throw new RoomError('Settings are locked during a game');
    room.settings = validateSettings(room.settings, patch);
    room.assignments = Array.from({ length: room.settings.detectiveCount }, (_, i) => room.assignments[i] ?? null);
    this.touch(room);
  }

  /** seat -1 = Mr X, seat 0..n-1 = detective slot. Works in the lobby and mid-game (host only). */
  assignSeat(room: Room, actorId: string, seat: number, playerId: string | null) {
    this.requireHost(room, actorId);
    const target = playerId ? this.player(room, playerId) : null;
    if (seat === -1) {
      if (!target) throw new RoomError('Mr X needs a player');
      const current = room.players.find((p) => p.role === 'mrx');
      if (current && current.id !== target.id) current.role = room.phase === 'lobby' ? 'detective' : 'spectator';
      target.role = 'mrx';
      room.assignments = room.assignments.map((a) => (a === target.id ? null : a));
      if (room.phase !== 'lobby') this.systemChat(room, `${target.name} now controls Mr X.`);
    } else {
      if (!(seat >= 0 && seat < room.assignments.length)) throw new RoomError('Invalid seat');
      if (target) {
        if (target.role === 'mrx') throw new RoomError('Mr X cannot control a detective');
        target.role = 'detective';
      }
      room.assignments[seat] = target?.id ?? null;
      if (room.phase !== 'lobby' && target) this.systemChat(room, `${target.name} now controls detective ${seat + 1}.`);
    }
    this.touch(room);
  }

  start(room: Room, actorId: string, rng: () => number = Math.random) {
    this.requireHost(room, actorId);
    if (room.phase === 'playing') throw new RoomError('Game already running');
    const active = room.players.filter((p) => p.role !== 'spectator');
    if (room.settings.randomMrX) {
      if (active.length < 2) throw new RoomError('Need at least 2 players');
      const pick = active[Math.floor(rng() * active.length)];
      for (const p of active) p.role = p === pick ? 'mrx' : 'detective';
      room.assignments = room.assignments.map((a) => (a === pick.id ? null : a));
    }
    const mrx = room.players.filter((p) => p.role === 'mrx');
    const detectives = room.players.filter((p) => p.role === 'detective');
    if (mrx.length !== 1) throw new RoomError('Someone must play Mr X');
    if (!detectives.length) throw new RoomError('At least one player must be a detective');

    // Fill any empty or stale detective seats round-robin, favouring players with fewest seats.
    const valid = new Set(detectives.map((d) => d.id));
    room.assignments = room.assignments.map((a) => (a && valid.has(a) ? a : null));
    for (let i = 0; i < room.assignments.length; i++) {
      if (room.assignments[i]) continue;
      const counts = detectives.map((d) => ({ d, n: room.assignments.filter((a) => a === d.id).length }));
      counts.sort((a, b) => a.n - b.n);
      room.assignments[i] = counts[0].d.id;
    }

    room.game = createGame(room.settings, rng);
    room.phase = 'playing';
    room.undoStack = [];
    room.pings = [];
    room.previews = [];
    room.paused = false;
    room.undoVote = null;
    this.resetDeadline(room);
    this.systemChat(room, 'The game has started. Mr X makes the first move.');
    this.touch(room);
  }

  controls(room: Room, playerId: string, pieceIndex: number): boolean {
    const p = room.players.find((x) => x.id === playerId);
    if (!p) return false;
    if (pieceIndex === 0) return p.role === 'mrx';
    return room.assignments[pieceIndex - 1] === playerId;
  }

  private requirePlaying(room: Room) {
    if (room.phase !== 'playing' || !room.game) throw new RoomError('No game in progress');
    if (room.paused) throw new RoomError('The game is paused');
  }

  private commit(room: Room, state: GameState, events: GameEvent[]) {
    room.undoStack.push(room.game!);
    if (room.undoStack.length > 60) room.undoStack.shift();
    const newRound = state.log.length !== room.game!.log.length;
    room.game = state;
    room.previews = [];
    room.undoVote = null;
    if (newRound) room.pings = [];
    if (state.winner) {
      room.phase = 'over';
      room.turnDeadline = null;
    } else {
      this.resetDeadline(room);
    }
    this.touch(room, events);
  }

  move(room: Room, playerId: string, pieceIndex: number, move: Move) {
    this.requirePlaying(room);
    if (!this.controls(room, playerId, pieceIndex)) throw new RoomError('That is not your piece');
    const { state, events } = applyMove(room.game!, pieceIndex, move);
    this.commit(room, state, events);
  }

  doubleMove(room: Room, playerId: string, first: Move, second: Move) {
    this.requirePlaying(room);
    if (!this.controls(room, playerId, 0)) throw new RoomError('Only Mr X can double move');
    if (!canDoubleMove(room.game!)) throw new RoomError('Double move not available');
    const { state, events } = applyDoubleMove(room.game!, first, second);
    this.commit(room, state, events);
  }

  /** Called periodically: plays a random move for whoever ran out of time. */
  checkTimeout(room: Room, now = Date.now()) {
    if (room.phase !== 'playing' || !room.game || room.paused || !room.turnDeadline || now < room.turnDeadline) return;
    const move = randomMove(room.game, room.game.turn);
    if (!move) return;
    const piece = room.game.pieces[room.game.turn];
    this.systemChat(room, `${piece.name} ran out of time, so a random move was made.`);
    const { state, events } = applyMove(room.game, room.game.turn, move);
    this.commit(room, state, events);
  }

  private resetDeadline(room: Room) {
    room.turnDeadline = room.settings.turnSeconds && !room.paused ? Date.now() + room.settings.turnSeconds * 1000 : null;
  }

  pause(room: Room, actorId: string, paused: boolean) {
    this.requireHost(room, actorId);
    if (room.phase !== 'playing') return;
    room.paused = paused;
    this.resetDeadline(room);
    this.systemChat(room, paused ? 'The host paused the game.' : 'The host resumed the game.');
    this.touch(room);
  }

  end(room: Room, actorId: string) {
    this.requireHost(room, actorId);
    if (room.phase !== 'playing' || !room.game) return;
    room.game = { ...room.game, winReason: 'The host ended the game.' };
    room.phase = 'over';
    room.turnDeadline = null;
    this.touch(room);
  }

  rematch(room: Room, actorId: string, rotateMrX: boolean) {
    this.requireHost(room, actorId);
    if (room.phase === 'playing') throw new RoomError('Finish or end the current game first');
    if (rotateMrX) {
      const active = room.players.filter((p) => p.role !== 'spectator');
      const idx = active.findIndex((p) => p.role === 'mrx');
      if (active.length > 1) {
        const next = active[(idx + 1) % active.length];
        for (const p of active) p.role = p === next ? 'mrx' : 'detective';
        room.assignments = room.assignments.map((a) => (a === next.id ? null : a));
      }
    }
    room.phase = 'lobby';
    room.game = null;
    room.undoStack = [];
    room.pings = [];
    room.previews = [];
    room.undoVote = null;
    room.turnDeadline = null;
    this.touch(room);
  }

  requestUndo(room: Room, playerId: string) {
    this.requirePlaying(room);
    const p = this.player(room, playerId);
    if (p.role === 'spectator') throw new RoomError('Spectators cannot undo');
    if (!room.undoStack.length) throw new RoomError('Nothing to undo');
    room.undoVote = { requestedBy: playerId, votes: [playerId] };
    this.systemChat(room, `${p.name} asked to undo the last move.`);
    this.resolveUndo(room);
  }

  voteUndo(room: Room, playerId: string, accept: boolean) {
    if (!room.undoVote) return;
    const p = this.player(room, playerId);
    if (p.role === 'spectator') return;
    if (!accept) {
      room.undoVote = null;
      this.systemChat(room, `${p.name} declined the undo.`);
      this.touch(room);
      return;
    }
    if (!room.undoVote.votes.includes(playerId)) room.undoVote.votes.push(playerId);
    this.resolveUndo(room);
  }

  private resolveUndo(room: Room) {
    const voters = room.players.filter((p) => p.role !== 'spectator' && p.connections > 0);
    if (voters.every((v) => room.undoVote!.votes.includes(v.id))) {
      room.game = room.undoStack.pop()!;
      room.undoVote = null;
      room.previews = [];
      this.resetDeadline(room);
      this.systemChat(room, 'The last move was undone.');
    }
    this.touch(room);
  }

  ping(room: Room, playerId: string, station: number, label: PingLabel) {
    const p = this.player(room, playerId);
    if (p.role !== 'detective' || room.phase !== 'playing') return;
    if (!PING_LABELS.includes(label) || !(station >= 1 && station <= 199)) return;
    room.pings = room.pings.filter((x) => !(x.playerId === playerId && x.station === station));
    room.pings.push({ id: randomUUID(), station, label, playerId, name: p.name, at: Date.now() });
    if (room.pings.length > 20) room.pings.shift();
    this.touch(room);
  }

  preview(room: Room, playerId: string, preview: { pieceIndex: number; to: number | null; ticket: Preview['ticket'] }) {
    if (room.phase !== 'playing' || !this.controls(room, playerId, preview.pieceIndex) || preview.pieceIndex === 0) return;
    room.previews = room.previews.filter((x) => x.pieceIndex !== preview.pieceIndex);
    if (preview.to) room.previews.push({ pieceIndex: preview.pieceIndex, to: preview.to, ticket: preview.ticket, playerId });
    this.touch(room);
  }

  chat(room: Room, playerId: string, channel: 'all' | 'team', text: string) {
    const p = this.player(room, playerId);
    const clean = (text ?? '').trim().slice(0, 300);
    if (!clean) return;
    if (channel === 'team' && p.role !== 'detective') throw new RoomError('Only detectives can use team chat');
    room.chat.push({ id: randomUUID(), channel, playerId, name: p.name, text: clean, at: Date.now() });
    if (room.chat.length > MAX_CHAT) room.chat.shift();
    this.touch(room);
  }

  private systemChat(room: Room, text: string) {
    room.chat.push({ id: randomUUID(), channel: 'all', playerId: 'system', name: 'System', text, at: Date.now() });
    if (room.chat.length > MAX_CHAT) room.chat.shift();
  }

  /** Builds what one particular player is allowed to see. Never leaks Mr X to detectives. */
  view(room: Room, playerId: string): RoomView {
    const me = this.player(room, playerId);
    const seesMrX = me.role === 'mrx' || room.phase === 'over' || (me.role === 'spectator' && room.settings.spectatorGodView);
    const onTeam = me.role === 'detective';
    let game = room.game;
    if (game && !seesMrX) {
      game = structuredClone(game);
      game.pieces[0].position = HIDDEN;
      game.mrxPath = [];
    }
    const pieces = room.game
      ? room.game.pieces.map((_, i) => i).filter((i) => this.controls(room, playerId, i))
      : [];
    return {
      code: room.code,
      you: { playerId, name: me.name, role: me.role, isHost: room.hostId === playerId, pieces, seesMrX },
      players: room.players.map((p) => ({
        id: p.id, name: p.name, role: p.role, connected: p.connections > 0, isHost: p.id === room.hostId,
      })),
      settings: room.settings,
      assignments: room.assignments,
      phase: room.phase,
      game,
      chat: room.chat.filter((c) => c.channel === 'all' || onTeam),
      pings: onTeam ? room.pings : [],
      previews: onTeam ? room.previews : [],
      paused: room.paused,
      turnDeadline: room.turnDeadline,
      undoVote: room.undoVote,
      canUndo: room.undoStack.length > 0,
    };
  }
}
