import { EDGES, neighbours } from '../../../shared/map/graph';
import { TICKET_TRANSPORTS } from '../../../shared/rules/constants';
import { detectivePositions, legalMoves } from '../../../shared/rules/engine';
import { possibleLocations } from '../../../shared/rules/possibleLocations';
import type { GameState, LogEntry, MoveTicket } from '../../../shared/rules/types';

export const TICKET_COLOR: Record<string, string> = {
  taxi: '#e8b93a',
  bus: '#2fa36b',
  underground: '#dc4a52',
  black: '#1b1d22',
  double: '#8b5cf6',
  ferry: '#8a94a6',
};
export const TICKET_ICON: Record<string, string> = {
  taxi: '🚕', bus: '🚌', underground: 'Ⓤ', black: '⬛', double: '2×',
};

/** Stations any detective could reach on their next move -> 1, or within two moves -> 2. */
export function threatZones(game: GameState): Map<number, 1 | 2> {
  const zones = new Map<number, 1 | 2>();
  for (let i = 1; i < game.pieces.length; i++) {
    const p = game.pieces[i];
    const tickets = (['taxi', 'bus', 'underground'] as MoveTicket[]).filter((t) => p.tickets[t] > 0);
    const step = (from: number[]) => {
      const out = new Set<number>();
      for (const s of from) for (const t of tickets) for (const n of neighbours(s, TICKET_TRANSPORTS[t][0])) out.add(n);
      return out;
    };
    const one = step([p.position]);
    for (const s of one) zones.set(s, 1);
    for (const s of step([...one])) if (!zones.has(s)) zones.set(s, 2);
  }
  return zones;
}

/** Possible-set size if Mr X used `ticket` to go to `to` now (what detectives would deduce). */
export function possibleAfter(game: GameState, ticket: MoveTicket, to: number, round: number, prefix: LogEntry[] = []): number {
  const revealed = game.settings.revealRounds.includes(round) ? to : null;
  const entry: LogEntry = { round, ticket, revealed, doublePart: null, detectivesAt: detectivePositions(game) };
  return possibleLocations([...game.log, ...prefix, entry], detectivePositions(game)).size;
}

export function nextRevealIn(game: GameState): number | null {
  const next = game.settings.revealRounds.find((r) => r > game.log.length);
  return next ? next - game.log.length : null;
}

const adjacencyAny = new Map<number, Set<number>>();
for (const [a, b] of EDGES) {
  if (!adjacencyAny.has(a)) adjacencyAny.set(a, new Set());
  if (!adjacencyAny.has(b)) adjacencyAny.set(b, new Set());
  adjacencyAny.get(a)!.add(b);
  adjacencyAny.get(b)!.add(a);
}
export const areAdjacent = (a: number, b: number) => adjacencyAny.get(a)?.has(b) ?? false;

/** Shortest hop count between two stations using any transport. */
export function hops(from: number, to: number): number {
  if (from === to) return 0;
  const seen = new Set([from]);
  let frontier = [from];
  for (let d = 1; frontier.length; d++) {
    const next: number[] = [];
    for (const s of frontier) for (const n of adjacencyAny.get(s) ?? []) {
      if (n === to) return d;
      if (!seen.has(n)) { seen.add(n); next.push(n); }
    }
    frontier = next;
  }
  return Infinity;
}

/** Tickets that connect two adjacent stations (for route planning). */
export function ticketsBetween(a: number, b: number): MoveTicket[] {
  const out: MoveTicket[] = [];
  for (const [x, y, t] of EDGES) {
    if ((x === a && y === b) || (x === b && y === a)) out.push(t === 'ferry' ? 'black' : t);
  }
  return out;
}

/** Detective positions after round `step` is complete (Mr X's move `step` plus the detectives' replies). */
export function detectivesAtStep(game: GameState, step: number): number[] {
  const positions = [...game.detectiveStarts];
  const ids = game.pieces.slice(1).map((p) => p.id);
  for (const m of game.detectiveMoves) {
    if (m.round <= step) positions[ids.indexOf(m.pieceId)] = m.to;
  }
  return positions;
}

export { legalMoves };
