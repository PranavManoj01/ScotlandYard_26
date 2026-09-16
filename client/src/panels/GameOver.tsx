import type { RoomView } from '../../../shared/protocol';
import { detectivesAtStep, hops } from '../lib/derive';
import { socket } from '../socket';

export function GameOver({ room, onReplay, onClose }: { room: RoomView; onReplay: () => void; onClose: () => void }) {
  const game = room.game!;
  const mine = room.you.role === 'mrx' ? 'mrx' : room.you.role === 'detective' ? 'detectives' : null;
  const won = game.winner && mine === game.winner;
  const title = !game.winner ? 'Game ended' : game.winner === 'mrx' ? 'Mr X escaped!' : 'Mr X is caught!';

  const stats = game.pieces.slice(1).map((p, i) => {
    let closest = Infinity;
    for (let step = 0; step <= game.log.length; step++) {
      const at = detectivesAtStep(game, step)[i];
      closest = Math.min(closest, hops(at, game.mrxPath[Math.min(step, game.mrxPath.length - 1)]));
    }
    const moves = game.detectiveMoves.filter((m) => m.pieceId === p.id && m.ticket);
    return { piece: p, closest, moves: moves.length };
  });
  const mrxBlack = game.log.filter((l) => l.ticket === 'black').length;
  const doubles = game.log.filter((l) => l.doublePart === 1).length;

  return (
    <div className="sheet-backdrop">
      <div className={`sheet result ${game.winner ?? ''}`}>
        <p className="eyebrow">{won ? 'Victory' : mine && game.winner ? 'Defeat' : 'Result'}</p>
        <h2>{title}</h2>
        <p>{game.winReason}</p>

        <div className="stats">
          <div className="stat"><b>{game.log.length}</b><span>rounds played</span></div>
          <div className="stat"><b>{mrxBlack}</b><span>black tickets</span></div>
          <div className="stat"><b>{doubles}</b><span>double moves</span></div>
        </div>
        <table className="stat-table">
          <thead><tr><th>Detective</th><th>Moves</th><th>Closest to Mr X</th></tr></thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.piece.id}>
                <td><span className="swatch" style={{ background: s.piece.color }} /> {s.piece.name}</td>
                <td>{s.moves}</td>
                <td>{s.closest === 0 ? 'Caught him' : `${s.closest} stop${s.closest === 1 ? '' : 's'}`}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row gap wrap">
          <button className="btn primary" onClick={onReplay}>▶ Replay Mr X’s route</button>
          <button className="btn ghost" onClick={onClose}>View board</button>
        </div>
        {room.you.isHost ? (
          <div className="row gap wrap rematch">
            <button className="btn" onClick={() => socket.emit('host:rematch', { rotateMrX: false })}>Rematch</button>
            <button className="btn" onClick={() => socket.emit('host:rematch', { rotateMrX: true })}>Rematch, next player is Mr X</button>
          </div>
        ) : <p className="muted small">The host can start a rematch.</p>}
      </div>
    </div>
  );
}
