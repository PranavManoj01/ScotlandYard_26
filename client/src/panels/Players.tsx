import { useState } from 'react';
import type { RoomView } from '../../../shared/protocol';
import { request, socket } from '../socket';
import { useStore } from '../store';
import { TICKET_COLOR, TICKET_ICON } from '../lib/derive';

export function Players({ room, onStation }: { room: RoomView; onStation: (s: number) => void }) {
  const game = room.game!;
  const toast = useStore((s) => s.toast);
  const [assigning, setAssigning] = useState<number | null>(null);
  const ownerOf = (i: number) => room.players.find((p) => (i === 0 ? p.role === 'mrx' : p.id === room.assignments[i - 1]));

  const assign = async (seat: number, playerId: string) => {
    const res = await request('seat:assign', { seat, playerId });
    if (!res.ok) toast(res.error, 'danger');
    setAssigning(null);
  };

  return (
    <div className="players-panel">
      {game.pieces.map((piece, i) => {
        const owner = ownerOf(i);
        const hidden = piece.position === 0;
        return (
          <div key={piece.id} className={`piece-card ${game.turn === i && !game.winner ? 'turn' : ''}`}
            style={{ '--accent': i === 0 ? '#9aa3b2' : piece.color } as React.CSSProperties}>
            <div className="piece-head">
              <span className={`pawn-dot ${i === 0 ? 'mrx' : ''}`} style={{ background: piece.color }}>{i === 0 ? 'X' : ''}</span>
              <div className="grow">
                <b>{piece.name}</b>
                <span className="muted small">
                  {owner ? owner.name : 'unassigned'}
                  {owner && !owner.connected && <em className="offline"> · offline</em>}
                </span>
              </div>
              {hidden ? <span className="muted small">hidden</span> : (
                <button className="linkish" onClick={() => onStation(piece.position)}>📍 {piece.position}</button>
              )}
            </div>
            <div className="ticket-row">
              {(i === 0 ? (['taxi', 'bus', 'underground', 'black', 'double'] as const) : (['taxi', 'bus', 'underground'] as const)).map((t) => (
                <span key={t} className={`tk ${piece.tickets[t] === 0 ? 'empty' : ''}`} style={{ borderColor: TICKET_COLOR[t] }} title={t}>
                  {TICKET_ICON[t]} {piece.tickets[t]}
                </span>
              ))}
            </div>
            {room.you.isHost && room.phase === 'playing' && (
              assigning === i ? (
                <select autoFocus defaultValue="" onBlur={() => setAssigning(null)} onChange={(e) => assign(i === 0 ? -1 : i - 1, e.target.value)}>
                  <option value="" disabled>Give seat to…</option>
                  {room.players.filter((p) => (i === 0 ? true : p.role !== 'mrx')).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.connected ? '' : ' (offline)'}</option>
                  ))}
                </select>
              ) : (
                <button className="linkish small" onClick={() => setAssigning(i)}>Reassign seat</button>
              )
            )}
          </div>
        );
      })}

      <h3 className="section-title">In the room</h3>
      <ul className="mini-players">
        {room.players.map((p) => (
          <li key={p.id}>
            <span className={`dot ${p.connected ? 'online' : ''}`} />
            {p.name}{p.isHost && ' 👑'} <span className={`role-chip ${p.role}`}>{p.role === 'mrx' ? 'Mr X' : p.role}</span>
            {room.you.isHost && p.id !== room.you.playerId && p.role === 'spectator' && (
              <button className="icon-btn" onClick={() => socket.emit('host:kick', p.id)} title="Remove">✕</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
