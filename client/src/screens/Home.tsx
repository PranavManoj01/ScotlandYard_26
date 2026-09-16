import { useState } from 'react';
import { createRoom, joinRoom, savedName, useStore } from '../store';
import { HowToPlay } from '../panels/HowToPlay';

export function Home() {
  const urlCode = location.pathname.match(/^\/r\/([A-Z0-9]{4})/i)?.[1]?.toUpperCase() ?? '';
  const [name, setName] = useState(savedName());
  const [code, setCode] = useState(urlCode);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const [invite, setInvite] = useState(urlCode);
  const connected = useStore((s) => s.connected);

  const run = async (fn: () => Promise<string | null>) => {
    if (!name.trim()) return setError('Enter your name first');
    setBusy(true);
    setError(await fn());
    setBusy(false);
  };

  return (
    <div className="home">
      <div className="home-card">
        <div className="brand">
          <span className="brand-icon">🕵️</span>
          <h1>Scotland Yard</h1>
          <p>Catch Mr X across London — or be the one they can't find.</p>
        </div>

        <label className="field">
          <span>Your name</span>
          <input value={name} maxLength={20} placeholder="e.g. Sherlock" autoFocus={!name}
            onChange={(e) => setName(e.target.value)} />
        </label>

        {invite ? (
          <>
            <button className="btn primary big" disabled={busy || !connected} onClick={() => run(() => joinRoom(invite, name))}>
              Join room {invite}
            </button>
            <button className="linkish center-link" onClick={() => { setInvite(''); setCode(''); history.replaceState(null, '', '/'); }}>
              Create or join a different game instead
            </button>
          </>
        ) : (
          <>
            <button className="btn primary big" disabled={busy || !connected} onClick={() => run(() => createRoom(name))}>
              Create a new game
            </button>
            <div className="divider"><span>or join a friend</span></div>
            <form className="join-row" onSubmit={(e) => { e.preventDefault(); run(() => joinRoom(code, name)); }}>
              <input value={code} maxLength={4} placeholder="CODE" className="code-input"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
              <button className="btn" disabled={busy || !connected || code.length !== 4}>Join</button>
            </form>
          </>
        )}

        {error && <p className="error">{error}</p>}
        {!connected && <p className="muted small">Connecting to server…</p>}
        <button className="linkish center-link" onClick={() => setHelp(true)}>❓ How to play</button>
      </div>
      {help && <HowToPlay onClose={() => setHelp(false)} />}
    </div>
  );
}
