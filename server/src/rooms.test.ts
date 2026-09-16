import { describe, expect, it } from 'vitest';
import { legalMoves } from '../../shared/rules/engine';
import { HIDDEN } from '../../shared/protocol';
import { RoomError, RoomManager } from './rooms';

function setup() {
  const m = new RoomManager();
  const { room, player: host } = m.create('Host');
  const { player: x } = m.join(room.code, 'Sneaky');
  const { player: d } = m.join(room.code, 'Sherlock');
  m.setRole(room, x.id, x.id, 'mrx');
  m.updateSettings(room, host.id, { detectiveCount: 3 });
  return { m, room, host, x, d };
}

describe('rooms', () => {
  it('reconnects with a token instead of adding a new player', () => {
    const { m, room, x } = setup();
    const again = m.join(room.code, 'whatever', x.token);
    expect(again.player.id).toBe(x.id);
    expect(room.players).toHaveLength(3);
  });

  it('auto-assigns detective seats on start', () => {
    const { m, room, host, d } = setup();
    m.start(room, host.id);
    expect(room.assignments.sort()).toEqual([d.id, host.id, host.id].sort());
    expect(room.game!.pieces).toHaveLength(4);
  });

  it('only the host can start or change settings', () => {
    const { m, room, d } = setup();
    expect(() => m.start(room, d.id)).toThrow(RoomError);
    expect(() => m.updateSettings(room, d.id, { totalRounds: 10 })).toThrow(RoomError);
  });

  it('never shows Mr X to detectives or spectators during play', () => {
    const { m, room, host, x, d } = setup();
    const { player: spec } = m.join(room.code, 'Watcher');
    m.start(room, host.id);
    let guard = 0;
    while (room.phase === 'playing' && guard++ < 300) {
      const g = room.game!;
      const secret = g.pieces[0].position;
      for (const id of [host.id, d.id, spec.id]) {
        const view = m.view(room, id);
        expect(view.game!.pieces[0].position).toBe(HIDDEN);
        expect(view.game!.mrxPath).toEqual([]);
        const revealed = new Set(view.game!.log.map((l) => l.revealed));
        if (!revealed.has(secret) && !g.pieces.slice(1).some((p) => p.position === secret)) {
          // The secret station may legitimately appear as a detective position or old reveal; otherwise nowhere.
          expect(JSON.stringify(view.game!.log)).not.toContain(`"revealed":${secret}`);
        }
      }
      expect(m.view(room, x.id).game!.pieces[0].position).toBe(secret);
      const turn = g.turn;
      const owner = turn === 0 ? x.id : room.assignments[turn - 1]!;
      const moves = legalMoves(g, turn);
      m.move(room, owner, turn, moves[Math.floor(Math.random() * moves.length)]);
    }
    expect(room.phase).toBe('over');
    expect(m.view(room, d.id).game!.pieces[0].position).not.toBe(HIDDEN);
  });

  it('rejects moving a piece you do not control', () => {
    const { m, room, host, d } = setup();
    m.start(room, host.id);
    const move = legalMoves(room.game!, 0)[0];
    expect(() => m.move(room, d.id, 0, move)).toThrow(RoomError);
  });

  it('undo requires every connected player to agree', () => {
    const { m, room, host, x, d } = setup();
    for (const p of [host, x, d]) m.setConnected(room, p.id, 1);
    m.start(room, host.id);
    const before = room.game!;
    m.move(room, x.id, 0, legalMoves(before, 0)[0]);
    m.requestUndo(room, x.id);
    expect(room.game).not.toBe(before);
    m.voteUndo(room, host.id, true);
    m.voteUndo(room, d.id, true);
    expect(room.game).toBe(before);
  });

  it('keeps team chat and pings away from Mr X', () => {
    const { m, room, host, x, d } = setup();
    m.start(room, host.id);
    m.chat(room, d.id, 'team', 'he is near 100');
    m.ping(room, d.id, 100, 'Suspect');
    expect(m.view(room, x.id).chat.some((c) => c.channel === 'team')).toBe(false);
    expect(m.view(room, x.id).pings).toEqual([]);
    expect(m.view(room, host.id).pings).toHaveLength(1);
  });
});
