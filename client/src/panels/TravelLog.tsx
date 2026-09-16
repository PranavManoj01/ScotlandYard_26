import type { GameState } from '../../../shared/rules/types';
import { TICKET_COLOR, TICKET_ICON, nextRevealIn } from '../lib/derive';

interface Props {
  game: GameState;
  /** Mr X (or anyone after the game) sees the true station for every round. */
  truePath?: number[] | null;
  onStation: (station: number) => void;
}

export function TravelLog({ game, truePath, onStation }: Props) {
  const { settings, log } = game;
  const revealIn = nextRevealIn(game);
  const slots = Array.from({ length: settings.totalRounds }, (_, i) => i + 1);
  const lastReveal = [...log].reverse().find((l) => l.revealed !== null);

  return (
    <div className="travel-log">
      <div className="log-summary">
        <div>
          <p className="eyebrow">Last seen</p>
          {lastReveal ? (
            <button className="linkish big-num" onClick={() => onStation(lastReveal.revealed!)}>
              {lastReveal.revealed} <small>round {lastReveal.round}</small>
            </button>
          ) : <p className="big-num muted">—</p>}
        </div>
        <div>
          <p className="eyebrow">Surfaces</p>
          <p className="big-num">{revealIn === null ? '—' : revealIn === 1 ? 'next move' : `in ${revealIn}`}</p>
        </div>
      </div>
      <ol className="log-slots">
        {slots.map((round) => {
          const entry = log[round - 1];
          const reveal = settings.revealRounds.includes(round);
          const isNext = round === log.length + 1 && !game.winner;
          const station = entry?.revealed ?? (truePath ? truePath[round] : undefined);
          return (
            <li key={round} className={`slot ${entry ? 'used' : ''} ${reveal ? 'reveal' : ''} ${isNext ? 'next' : ''}
              ${entry?.doublePart ? `double d${entry.doublePart}` : ''}`}>
              <span className="slot-round">{round}</span>
              {entry ? (
                <span className="slot-ticket" style={{ background: TICKET_COLOR[entry.ticket] }} title={entry.ticket}>
                  {TICKET_ICON[entry.ticket]} <span className="t-name">{entry.ticket}</span>
                </span>
              ) : (
                <span className="slot-empty">{isNext ? 'Mr X to move' : ''}</span>
              )}
              {entry?.doublePart === 1 && <span className="double-tag">2×</span>}
              {station !== undefined && entry && (
                <button className={`slot-station ${entry.revealed ? 'public' : 'secret'}`} onClick={() => onStation(station)}
                  title={entry.revealed ? 'Revealed to everyone' : 'Only you can see this'}>
                  {entry.revealed ? '👁' : '🔒'} {station}
                </button>
              )}
              {!entry && reveal && <span className="eye" title="Mr X is revealed this round">👁</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
