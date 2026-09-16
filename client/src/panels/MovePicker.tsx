import { useState } from 'react';
import { transportsAt } from '../../../shared/map/graph';
import { canDoubleMove } from '../../../shared/rules/engine';
import type { GameState, LogEntry, Move, MoveTicket } from '../../../shared/rules/types';
import { TICKET_COLOR, TICKET_ICON, possibleAfter, threatZones } from '../lib/derive';

interface Props {
  game: GameState;
  pieceIndex: number;
  station: number;
  tickets: MoveTicket[];
  /** Set when choosing the second half of a double move. */
  firstMove: Move | null;
  possible: Map<number, number> | null;
  onConfirm: (ticket: MoveTicket, startDouble: boolean) => void;
  onCancel: () => void;
}

const LABEL: Record<MoveTicket, string> = { taxi: 'Taxi', bus: 'Bus', underground: 'Underground', black: 'Black ticket' };

export function MovePicker({ game, pieceIndex, station, tickets, firstMove, possible, onConfirm, onCancel }: Props) {
  const piece = game.pieces[pieceIndex];
  const isMrX = pieceIndex === 0;
  const [useDouble, setUseDouble] = useState(false);
  const round = game.log.length + (firstMove ? 2 : 1);
  const warnings: { tone: 'danger' | 'info' | 'good'; text: string }[] = [];

  let prefix: LogEntry[] = [];
  if (isMrX) {
    if (firstMove) {
      prefix = [{
        round: round - 1, ticket: firstMove.ticket, doublePart: 1,
        revealed: game.settings.revealRounds.includes(round - 1) ? firstMove.to : null,
        detectivesAt: game.pieces.slice(1).map((p) => p.position),
      }];
    }
    if (game.settings.revealRounds.includes(round)) {
      warnings.push({ tone: 'danger', text: `Round ${round} is a reveal round — everyone will see you at ${station}.` });
    }
    const threat = threatZones(game).get(station);
    if (threat === 1) warnings.push({ tone: 'danger', text: 'A detective can reach this station on their next move.' });
    else if (threat === 2) warnings.push({ tone: 'info', text: 'Detectives are two moves away from here.' });
    if (tickets.length === 1 && tickets[0] === 'black' && transportsAt(station).includes('ferry')) {
      warnings.push({ tone: 'info', text: 'Ferry route — only a black ticket works here.' });
    }
  } else if (possible) {
    const p = possible.get(station);
    if (p) warnings.push({ tone: 'good', text: `Mr X could be here (${Math.round(p * 100)}% by the helper's estimate).` });
  }

  const doubleAvailable = isMrX && !firstMove && canDoubleMove(game);

  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet move-picker" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="sheet-head">
          <div>
            <p className="eyebrow">
              {isMrX ? (firstMove ? 'Double move · second step' : `Round ${round}`) : piece.name}
            </p>
            <h3>Move to <span className="station-badge">{station}</span></h3>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Cancel">✕</button>
        </div>

        {warnings.map((w, i) => <p key={i} className={`warn ${w.tone}`}>{w.text}</p>)}

        <div className="ticket-choices">
          {tickets.map((t) => {
            const left = piece.tickets[t] - 1 - (firstMove?.ticket === t ? 1 : 0);
            const hiddenIn = isMrX ? possibleAfter(game, t, station, round, prefix) : null;
            return (
              <button key={t} className="ticket-choice" style={{ '--tc': TICKET_COLOR[t] } as React.CSSProperties}
                onClick={() => onConfirm(t, useDouble)}>
                <span className="tc-icon">{TICKET_ICON[t]}</span>
                <span className="tc-body">
                  <b>{LABEL[t]}</b>
                  <small>
                    {left} left after{t === 'black' ? ' · hides transport' : ''}
                    {hiddenIn !== null && !game.settings.revealRounds.includes(round) && (
                      <> · <span className={hiddenIn <= 3 ? 'bad' : ''}>{hiddenIn} possible spots</span></>
                    )}
                  </small>
                </span>
              </button>
            );
          })}
        </div>

        {doubleAvailable && (
          <label className="double-toggle">
            <input type="checkbox" checked={useDouble} onChange={(e) => setUseDouble(e.target.checked)} />
            <span><b>Use double move</b> ({game.pieces[0].tickets.double} left) — pick a second destination right after.</span>
          </label>
        )}
      </div>
    </div>
  );
}
