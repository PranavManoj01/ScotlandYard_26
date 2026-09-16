import { describe, expect, it } from 'vitest';
import { EDGES, STATIONS, neighbours } from '../map/graph';
import { DEFAULT_SETTINGS } from './constants';
import {
  applyDoubleMove, applyMove, canDoubleMove, createGame, legalMoves, RuleError,
} from './engine';
import { possibleLocations } from './possibleLocations';
import type { GameState, Settings } from './types';

function game(positions: number[], settings: Partial<Settings> = {}): GameState {
  const state = createGame({ ...DEFAULT_SETTINGS, detectiveCount: positions.length - 1, ...settings }, () => 0.5);
  positions.forEach((p, i) => { state.pieces[i].position = p; });
  state.mrxPath = [positions[0]];
  return state;
}

describe('map', () => {
  it('has the full classic board', () => {
    expect(STATIONS).toHaveLength(199);
    expect(EDGES).toHaveLength(468);
    expect(neighbours(1, 'taxi').sort((a, b) => a - b)).toEqual([8, 9]);
    expect(neighbours(1, 'underground').sort((a, b) => a - b)).toEqual([46]);
    expect(neighbours(115, 'ferry').sort((a, b) => a - b)).toEqual([108, 157]);
  });
});

describe('legal moves', () => {
  it('detectives cannot use ferries or black tickets', () => {
    const s = game([1, 115, 13]);
    const moves = legalMoves(s, 1);
    expect(moves.some((m) => m.ticket === 'black')).toBe(false);
    expect(moves.some((m) => m.to === 157 || m.to === 108)).toBe(false);
  });

  it('Mr X can use a black ticket on the ferry', () => {
    const s = game([115, 1, 13]);
    const moves = legalMoves(s, 0);
    expect(moves).toContainEqual({ ticket: 'black', to: 157 });
    expect(moves.some((m) => m.to === 157 && m.ticket !== 'black')).toBe(false);
  });

  it('blocks stations occupied by detectives', () => {
    const s = game([1, 8, 9]);
    expect(legalMoves(s, 0).some((m) => m.to === 8 || m.to === 9)).toBe(false);
    expect(legalMoves(s, 1).some((m) => m.to === 9)).toBe(false);
  });

  it('respects empty ticket piles', () => {
    const s = game([1, 8, 13]);
    s.pieces[0].tickets.taxi = 0;
    s.pieces[0].tickets.black = 0;
    expect(legalMoves(s, 0).every((m) => m.ticket !== 'taxi')).toBe(true);
  });
});

describe('turns and tickets', () => {
  it('logs Mr X move secretly and reveals on reveal rounds', () => {
    let s = game([1, 13, 26], { revealRounds: [1] });
    const r = applyMove(s, 0, { ticket: 'taxi', to: 8 });
    s = r.state;
    expect(s.log[0]).toMatchObject({ round: 1, ticket: 'taxi', revealed: 8, detectivesAt: [13, 26] });
    expect(r.events.find((e) => e.type === 'moved')).toMatchObject({ to: null });
    expect(s.turn).toBe(1);
  });

  it('rejects moves out of turn', () => {
    const s = game([1, 13, 26]);
    expect(() => applyMove(s, 1, { ticket: 'taxi', to: 4 })).toThrow(RuleError);
  });

  it('gives used detective tickets to Mr X', () => {
    let s = game([1, 13, 26]);
    s = applyMove(s, 0, { ticket: 'taxi', to: 8 }).state;
    const busBefore = s.pieces[0].tickets.bus;
    s = applyMove(s, 1, { ticket: 'bus', to: 14 }).state;
    expect(s.pieces[1].tickets.bus).toBe(7);
    expect(s.pieces[0].tickets.bus).toBe(busBefore + 1);
    expect(s.turn).toBe(2);
  });

  it('double move fills two log slots and returns to detectives', () => {
    const s = game([1, 13, 26]);
    expect(canDoubleMove(s)).toBe(true);
    const r = applyDoubleMove(s, { ticket: 'taxi', to: 8 }, { ticket: 'taxi', to: 18 });
    expect(r.state.log.map((l) => l.doublePart)).toEqual([1, 2]);
    expect(r.state.pieces[0].tickets.double).toBe(1);
    expect(r.state.pieces[0].position).toBe(18);
    expect(r.state.turn).toBe(1);
  });

  it('no double move when fewer than two rounds are left', () => {
    const s = game([1, 13, 26], { totalRounds: 1 });
    expect(canDoubleMove(s)).toBe(false);
  });
});

describe('win conditions', () => {
  it('detective landing on Mr X wins', () => {
    let s = game([1, 13, 26]);
    s = applyMove(s, 0, { ticket: 'taxi', to: 8 }).state;
    // Put blue next to Mr X, red moves elsewhere first.
    s.pieces[2].position = 18;
    s = applyMove(s, 1, { ticket: 'taxi', to: 23 }).state;
    const r = applyMove(s, 2, { ticket: 'taxi', to: 8 });
    expect(r.state.winner).toBe('detectives');
    expect(r.events.at(-1)).toMatchObject({ type: 'gameOver', winner: 'detectives' });
  });

  it('Mr X wins after the final round', () => {
    let s = game([1, 13, 26], { totalRounds: 1 });
    s = applyMove(s, 0, { ticket: 'taxi', to: 8 }).state;
    s = applyMove(s, 1, { ticket: 'taxi', to: 23 }).state;
    s = applyMove(s, 2, { ticket: 'taxi', to: 27 }).state;
    expect(s.winner).toBe('mrx');
  });

  it('Mr X wins when every detective is stuck', () => {
    let s = game([1, 13, 26]);
    for (const p of s.pieces.slice(1)) p.tickets = { taxi: 0, bus: 0, underground: 0, black: 0, double: 0 };
    const r = applyMove(s, 0, { ticket: 'taxi', to: 8 });
    expect(r.events.filter((e) => e.type === 'skipped')).toHaveLength(2);
    expect(r.state.winner).toBe('mrx');
  });

  it('detectives win when Mr X is cornered', () => {
    // Station 2 only has taxi links to 10 and 20.
    const from = neighbours(20, 'taxi').find((n) => n !== 2)!;
    const s = game([2, 10, from]);
    s.pieces[0].tickets.black = 0;
    s.turn = 2;
    s.anyDetectiveMoved = true;
    const r = applyMove(s, 2, { ticket: 'taxi', to: 20 });
    expect(r.state.winner).toBe('detectives');
  });
});

describe('possible locations', () => {
  it('starts from all Mr X start cards before any reveal', () => {
    const set = possibleLocations([], [13, 26]);
    expect(set.size).toBe(13);
  });

  it('expands from the last reveal using ticket types', () => {
    let s = game([1, 13, 26], { revealRounds: [1] });
    s = applyMove(s, 0, { ticket: 'taxi', to: 8 }).state;
    s = applyMove(s, 1, { ticket: 'taxi', to: 23 }).state;
    s = applyMove(s, 2, { ticket: 'taxi', to: 27 }).state;
    s = applyMove(s, 0, { ticket: 'taxi', to: 18 }).state;
    const set = possibleLocations(s.log, s.pieces.slice(1).map((p) => p.position));
    expect([...set.keys()].sort((a, b) => a - b)).toEqual([...neighbours(8, 'taxi')].sort((a, b) => a - b));
    expect(set.has(18)).toBe(true);
    const total = [...set.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1);
  });

  it('never excludes the true position over a random game', () => {
    let s = createGame(DEFAULT_SETTINGS);
    let guard = 0;
    while (!s.winner && guard++ < 500) {
      const moves = legalMoves(s, s.turn);
      const move = moves[Math.floor(Math.random() * moves.length)];
      s = applyMove(s, s.turn, move).state;
      if (s.turn !== 0 || s.winner) continue;
      const set = possibleLocations(s.log, s.pieces.slice(1).map((p) => p.position));
      expect(set.has(s.pieces[0].position)).toBe(true);
    }
    expect(s.winner).not.toBeNull();
  });
});
