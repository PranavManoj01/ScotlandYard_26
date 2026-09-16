import { neighbours } from '../map/graph';
import {
  DETECTIVE_COLORS, DETECTIVE_STARTS, MRX_STARTS, TICKET_TRANSPORTS, detectiveTickets, mrxTickets,
} from './constants';
import type { GameEvent, GameState, Move, MoveTicket, Piece, Settings } from './types';

export class RuleError extends Error {}

export interface MoveResult { state: GameState; events: GameEvent[] }

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createGame(settings: Settings, rng: () => number = Math.random): GameState {
  const count = Math.max(1, Math.min(5, settings.detectiveCount));
  const detectiveStarts = shuffle(DETECTIVE_STARTS, rng).slice(0, count);
  const mrxStart = shuffle(MRX_STARTS, rng)[0];
  const pieces: Piece[] = [
    { id: 'mrx', role: 'mrx', name: 'Mr X', color: '#15171c', position: mrxStart, tickets: mrxTickets(count) },
    ...detectiveStarts.map((position, i) => ({
      id: DETECTIVE_COLORS[i].id,
      role: 'detective' as const,
      name: `${DETECTIVE_COLORS[i].name} Detective`,
      color: DETECTIVE_COLORS[i].color,
      position,
      tickets: detectiveTickets(),
    })),
  ];
  return {
    settings: { ...settings, detectiveCount: count },
    pieces,
    turn: 0,
    log: [],
    mrxPath: [mrxStart],
    detectiveMoves: [],
    detectiveStarts,
    anyDetectiveMoved: false,
    winner: null,
    winReason: null,
  };
}

export const detectivePositions = (state: GameState) => state.pieces.slice(1).map((p) => p.position);

/** Every legal single move for a piece, ignoring whose turn it is. */
export function legalMoves(state: GameState, pieceIndex: number): Move[] {
  const piece = state.pieces[pieceIndex];
  const blocked = new Set(
    state.pieces.filter((p, i) => p.role === 'detective' && i !== pieceIndex).map((p) => p.position),
  );
  const tickets: MoveTicket[] = piece.role === 'mrx'
    ? ['taxi', 'bus', 'underground', 'black']
    : ['taxi', 'bus', 'underground'];
  const moves: Move[] = [];
  for (const ticket of tickets) {
    if (piece.tickets[ticket] <= 0) continue;
    const seen = new Set<number>();
    for (const transport of TICKET_TRANSPORTS[ticket]) {
      for (const to of neighbours(piece.position, transport)) {
        if (blocked.has(to) || seen.has(to)) continue;
        seen.add(to);
        moves.push({ ticket, to });
      }
    }
  }
  return moves;
}

export function canDoubleMove(state: GameState): boolean {
  return !state.winner && state.turn === 0 && state.pieces[0].tickets.double > 0
    && state.log.length + 2 <= state.settings.totalRounds;
}

/** Legal second moves after Mr X hypothetically makes `first` (for the double-move picker). */
export function secondMovesAfter(state: GameState, first: Move): Move[] {
  const sim = structuredClone(state);
  sim.pieces[0].position = first.to;
  sim.pieces[0].tickets[first.ticket]--;
  return legalMoves(sim, 0);
}

function finish(state: GameState, events: GameEvent[], winner: 'mrx' | 'detectives', reason: string) {
  state.winner = winner;
  state.winReason = reason;
  events.push({ type: 'gameOver', winner, reason });
}

function doMove(state: GameState, index: number, move: Move, doublePart: 1 | 2 | null, events: GameEvent[]) {
  const legal = legalMoves(state, index).some((m) => m.ticket === move.ticket && m.to === move.to);
  if (!legal) throw new RuleError(`Illegal move: ${move.ticket} to ${move.to}`);
  const piece = state.pieces[index];
  piece.tickets[move.ticket]--;

  if (piece.role === 'mrx') {
    const round = state.log.length + 1;
    const revealed = state.settings.revealRounds.includes(round) ? move.to : null;
    state.log.push({ round, ticket: move.ticket, revealed, doublePart, detectivesAt: detectivePositions(state) });
    piece.position = move.to;
    state.mrxPath.push(move.to);
    events.push({ type: 'moved', pieceId: 'mrx', ticket: move.ticket, to: null, round, revealed });
    if (revealed !== null) events.push({ type: 'revealed', round, station: revealed });
    return;
  }

  const from = piece.position;
  piece.position = move.to;
  if (state.settings.ticketsToMrX) state.pieces[0].tickets[move.ticket]++;
  state.detectiveMoves.push({ pieceId: piece.id, from, to: move.to, ticket: move.ticket, round: state.log.length });
  state.anyDetectiveMoved = true;
  events.push({ type: 'moved', pieceId: piece.id, ticket: move.ticket, to: move.to });
  if (move.to === state.pieces[0].position) {
    finish(state, events, 'detectives', `${piece.name} caught Mr X at station ${move.to} in round ${state.log.length}.`);
  }
}

function advanceTurn(state: GameState, events: GameEvent[]) {
  if (state.turn === 0) state.anyDetectiveMoved = false;
  for (let next = state.turn + 1; next < state.pieces.length; next++) {
    if (legalMoves(state, next).length > 0) {
      state.turn = next;
      return;
    }
    const piece = state.pieces[next];
    state.detectiveMoves.push({ pieceId: piece.id, from: piece.position, to: piece.position, ticket: null, round: state.log.length });
    events.push({ type: 'skipped', pieceId: piece.id });
  }
  if (!state.anyDetectiveMoved) {
    finish(state, events, 'mrx', 'Every detective is stuck. Mr X escapes!');
    return;
  }
  if (state.log.length >= state.settings.totalRounds) {
    finish(state, events, 'mrx', `Mr X evaded capture for all ${state.settings.totalRounds} rounds.`);
    return;
  }
  state.turn = 0;
  if (legalMoves(state, 0).length === 0) {
    finish(state, events, 'detectives', 'Mr X is cornered and has no legal move.');
  }
}

export function applyMove(prev: GameState, pieceIndex: number, move: Move): MoveResult {
  if (prev.winner) throw new RuleError('The game is over');
  if (prev.turn !== pieceIndex) throw new RuleError('Not your turn');
  const state = structuredClone(prev);
  const events: GameEvent[] = [];
  doMove(state, pieceIndex, move, null, events);
  if (!state.winner) advanceTurn(state, events);
  return { state, events };
}

export function applyDoubleMove(prev: GameState, first: Move, second: Move): MoveResult {
  if (prev.winner) throw new RuleError('The game is over');
  if (prev.turn !== 0) throw new RuleError('Not your turn');
  if (!canDoubleMove(prev)) throw new RuleError('Double move not available');
  const state = structuredClone(prev);
  const events: GameEvent[] = [];
  state.pieces[0].tickets.double--;
  doMove(state, 0, first, 1, events);
  doMove(state, 0, second, 2, events);
  advanceTurn(state, events);
  return { state, events };
}

/** Picks a random legal move, avoiding black tickets when possible (used for turn timeouts). */
export function randomMove(state: GameState, pieceIndex: number, rng: () => number = Math.random): Move | null {
  const moves = legalMoves(state, pieceIndex);
  if (!moves.length) return null;
  const nonBlack = moves.filter((m) => m.ticket !== 'black');
  const pool = nonBlack.length ? nonBlack : moves;
  return pool[Math.floor(rng() * pool.length)];
}
