import { useEffect } from 'react';
import { TICKET_COLOR, TICKET_ICON } from '../lib/derive';

export function HowToPlay({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet help" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="How to play">
        <div className="sheet-head">
          <h3>How to play</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <section>
          <h4>The goal</h4>
          <p><b>Mr X</b> hides somewhere in London. The <b>detectives</b> work together to land on his station.
            Mr X wins if he stays free until the travel log is full (24 rounds by default).</p>
        </section>

        <section>
          <h4>Each round</h4>
          <ol>
            <li>Mr X moves in secret. Everyone sees <i>which ticket</i> he used, but not where he went.</li>
            <li>Each detective then moves once, in order. Two detectives can’t share a station.</li>
            <li>On <b>reveal rounds</b> (marked 👁 in the travel log) Mr X’s station is shown to everyone.</li>
          </ol>
        </section>

        <section>
          <h4>Tickets</h4>
          <ul className="help-tickets">
            {(['taxi', 'bus', 'underground'] as const).map((t) => (
              <li key={t}><span style={{ background: TICKET_COLOR[t] }}>{TICKET_ICON[t]}</span>
                {t === 'taxi' ? 'Taxi — short hops along yellow lines.' : t === 'bus' ? 'Bus — medium jumps along green lines.' : 'Underground — long jumps along red lines.'}
              </li>
            ))}
            <li><span style={{ background: TICKET_COLOR.black }}>{TICKET_ICON.black}</span>
              Black ticket (Mr X only) — any transport, including the dashed ferry lines, and hides which one he used.</li>
            <li><span style={{ background: TICKET_COLOR.double }}>{TICKET_ICON.double}</span>
              Double move (Mr X only) — two moves in one turn.</li>
          </ul>
          <p className="muted small">Detectives start with 10 taxi, 8 bus and 4 underground tickets. Tickets they use go to Mr X. A detective with no usable ticket is skipped.</p>
        </section>

        <section>
          <h4>Tips for detectives</h4>
          <ul>
            <li>The red glow (🔍) shows every station Mr X could be at, worked out from his last reveal and the tickets he has used since. Brighter means more likely.</li>
            <li>Tap any station to drop a pin for your team, and use the 🔒 Detectives chat — Mr X can’t see either.</li>
            <li>Before a reveal, spread out around the glow so you can pounce afterwards.</li>
          </ul>
        </section>

        <section>
          <h4>Tips for Mr X</h4>
          <ul>
            <li>Orange ⚠ zones are stations a detective can reach next turn.</li>
            <li>Turn on “Detectives’ view” to see how well hidden you are. The move picker tells you how many possible spots each ticket leaves.</li>
            <li>Save black tickets and double moves for right after a reveal.</li>
            <li>Playing next to someone? Tap 🙈 Hide.</li>
          </ul>
        </section>

        <button className="btn primary" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}
