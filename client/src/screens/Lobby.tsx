import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { DETECTIVE_COLORS } from '../../../shared/rules/constants';
import type { Role, RoomView } from '../../../shared/protocol';
import type { Settings } from '../../../shared/rules/types';
import { request, socket } from '../socket';
import { useStore } from '../store';
import { Chat } from '../panels/Chat';
import { HowToPlay } from '../panels/HowToPlay';
import { useShareUrl } from '../lib/shareUrl';

const ROLE_LABEL: Record<Role, string> = { mrx: 'Mr X', detective: 'Detective', spectator: 'Spectator' };

export function Lobby({ room }: { room: RoomView }) {
  const { you, players, settings } = room;
  const toast = useStore((s) => s.toast);
  const leave = useStore((s) => s.leave);
  const [copied, setCopied] = useState(false);
  const [help, setHelp] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const share = useShareUrl(room.code);
  const link = share.url;

  useEffect(() => {
    if (!link) return setQr(null);
    QRCode.toDataURL(link, { margin: 1, width: 220, color: { dark: '#0e1116', light: '#ffffff' } }).then(setQr, () => setQr(null));
  }, [link]);

  const act = async (p: Promise<{ ok: boolean; error?: string }>) => {
    const res = await p;
    if (!res.ok) toast(res.error ?? 'Failed', 'danger');
  };
  const setRole = (playerId: string, role: Role) => act(request('lobby:setRole', { playerId, role }));
  const update = (patch: Partial<Settings>) => act(request('lobby:settings', patch));

  const mrx = players.find((p) => p.role === 'mrx');
  const detectives = players.filter((p) => p.role === 'detective');
  const problems = [
    !settings.randomMrX && !mrx && 'Someone needs to be Mr X',
    !settings.randomMrX && !detectives.length && 'At least one detective is needed',
    settings.randomMrX && players.filter((p) => p.role !== 'spectator').length < 2 && 'Need at least 2 players',
  ].filter(Boolean) as string[];

  const copy = async () => {
    if (!link) return;
    try {
      if (navigator.share && /Mobi/i.test(navigator.userAgent)) await navigator.share({ title: 'Scotland Yard', url: link });
      else await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* cancelled */ }
  };

  return (
    <div className="lobby">
      <header className="lobby-head">
        <div>
          <p className="eyebrow">Room code</p>
          <h1 className="room-code">{room.code}</h1>
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={() => setHelp(true)}>❓ How to play</button>
          <button className="btn ghost" onClick={leave}>Leave</button>
        </div>
      </header>

      <div className="lobby-grid">
        <section className="card share-card">
          <h2>Invite players</h2>
          <div className="share-body">
            {qr ? <img src={qr} alt={`QR code for ${link}`} className="qr" /> : <div className="qr placeholder">No link yet</div>}
            <div className="share-text">
              <p className="muted small">Scan with a phone camera, or send the link. Or they can enter code <b>{room.code}</b>.</p>
              {link && <input readOnly value={link} onFocus={(e) => e.target.select()} className="share-input" />}
              <button className="btn primary" disabled={!link} onClick={copy}>{copied ? '✓ Copied!' : '🔗 Copy link'}</button>
              {share.note && <p className="muted small">{share.note}</p>}
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Players <span className="muted">({players.length})</span></h2>
          <ul className="player-list">
            {players.map((p) => (
              <li key={p.id} className={p.id === you.playerId ? 'me' : ''}>
                <span className={`dot ${p.connected ? 'online' : ''}`} title={p.connected ? 'Online' : 'Offline'} />
                <span className="pname">{p.name}{p.isHost && ' 👑'}{p.id === you.playerId && <em> (you)</em>}</span>
                {(you.isHost || p.id === you.playerId) ? (
                  <select value={p.role} onChange={(e) => setRole(p.id, e.target.value as Role)}>
                    {(['detective', 'mrx', 'spectator'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </select>
                ) : (
                  <span className={`role-chip ${p.role}`}>{ROLE_LABEL[p.role]}</span>
                )}
                {you.isHost && p.id !== you.playerId && (
                  <button className="icon-btn" title="Remove player" onClick={() => socket.emit('host:kick', p.id)}>✕</button>
                )}
              </li>
            ))}
          </ul>
          {!you.isHost && you.role !== 'mrx' && !mrx && (
            <button className="btn mrx-btn" onClick={() => setRole(you.playerId, 'mrx')}>🎩 I want to be Mr X</button>
          )}
          <p className="muted small">Share the link or code. Players who join mid-game become spectators.</p>
        </section>

        <section className="card">
          <h2>Detective seats</h2>
          <p className="muted small">The full game uses 5 detectives. With fewer players, one person can run several.</p>
          <ul className="seat-list">
            {room.assignments.map((a, i) => (
              <li key={i}>
                <span className="swatch" style={{ background: DETECTIVE_COLORS[i].color }} />
                <span>{DETECTIVE_COLORS[i].name}</span>
                {you.isHost ? (
                  <select value={a ?? ''} onChange={(e) => act(request('seat:assign', { seat: i, playerId: e.target.value || null }))}>
                    <option value="">Auto</option>
                    {detectives.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                ) : (
                  <span className="muted">{players.find((p) => p.id === a)?.name ?? 'Auto'}</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h2>Game settings {!you.isHost && <span className="muted small">(host only)</span>}</h2>
          <fieldset disabled={!you.isHost} className="settings">
            <label>Detectives
              <select value={settings.detectiveCount} onChange={(e) => update({ detectiveCount: +e.target.value })}>
                {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <label>Rounds
              <select value={settings.totalRounds} onChange={(e) => {
                const totalRounds = +e.target.value;
                const revealRounds = totalRounds === 24 ? [3, 8, 13, 18, 24]
                  : [3, 8, 13, 18, 24].map((r) => Math.round((r / 24) * totalRounds)).filter((r, i, arr) => r > 0 && arr.indexOf(r) === i);
                update({ totalRounds, revealRounds });
              }}>
                {[12, 16, 20, 24].map((n) => <option key={n}>{n}</option>)}
              </select>
            </label>
            <label className="wide">Reveal rounds
              <input defaultValue={settings.revealRounds.join(', ')} key={settings.revealRounds.join()}
                onBlur={(e) => update({ revealRounds: e.target.value.split(/[,\s]+/).map(Number).filter(Boolean) })} />
            </label>
            <label>“Where is Mr X” helper
              <select value={settings.helper} onChange={(e) => update({ helper: e.target.value as Settings['helper'] })}>
                <option value="on">Always shown</option>
                <option value="toggle">Toggle per player</option>
                <option value="off">Off (hardcore)</option>
              </select>
            </label>
            <label>Turn timer
              <select value={settings.turnSeconds} onChange={(e) => update({ turnSeconds: +e.target.value as Settings['turnSeconds'] })}>
                <option value={0}>None</option>
                <option value={60}>60 seconds</option>
                <option value={120}>2 minutes</option>
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={settings.ticketsToMrX}
              onChange={(e) => update({ ticketsToMrX: e.target.checked })} /> Used detective tickets go to Mr X</label>
            <label className="check"><input type="checkbox" checked={settings.randomMrX}
              onChange={(e) => update({ randomMrX: e.target.checked })} /> Pick Mr X at random on start</label>
            <label className="check"><input type="checkbox" checked={settings.spectatorGodView}
              onChange={(e) => update({ spectatorGodView: e.target.checked })} /> Spectators can see Mr X</label>
          </fieldset>
        </section>

        <section className="card chat-card">
          <h2>Chat</h2>
          <Chat room={room} compact />
        </section>
      </div>

      {help && <HowToPlay onClose={() => setHelp(false)} />}

      <footer className="lobby-foot">
        {problems.length > 0 && <p className="muted">{problems[0]}</p>}
        {you.isHost ? (
          <button className="btn primary big" disabled={problems.length > 0} onClick={() => act(request('game:start'))}>
            Start game
          </button>
        ) : (
          <p className="muted">Waiting for the host to start…</p>
        )}
      </footer>
    </div>
  );
}
