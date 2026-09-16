import { useEffect } from 'react';
import { useStore } from './store';
import { Home } from './screens/Home';
import { Lobby } from './screens/Lobby';
import { Game } from './screens/Game';

export function App() {
  const room = useStore((s) => s.room);
  const session = useStore((s) => s.session);
  const connected = useStore((s) => s.connected);
  const toasts = useStore((s) => s.toasts);
  const theme = useStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  let screen;
  if (!session || !room) screen = <Home />;
  else if (room.phase === 'lobby') screen = <Lobby room={room} />;
  else screen = <Game room={room} />;

  return (
    <>
      {screen}
      {session && !connected && <div className="conn-banner">Reconnecting…</div>}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}
      </div>
    </>
  );
}
