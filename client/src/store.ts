import { create } from 'zustand';
import type { RoomView, Session } from '../../shared/protocol';
import type { GameEvent } from '../../shared/rules/types';
import { request, socket } from './socket';

export interface Toast { id: number; text: string; tone: 'info' | 'reveal' | 'danger' | 'success' }

interface Store {
  connected: boolean;
  session: Session | null;
  room: RoomView | null;
  toasts: Toast[];
  lastEvents: { id: number; events: GameEvent[] } | null;
  theme: 'dark' | 'light';
  sound: boolean;
  setSound: (on: boolean) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
  setTheme: (t: 'dark' | 'light') => void;
  leave: () => void;
}

const storage = {
  get<T>(key: string): T | null {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
  },
  set(key: string, value: unknown) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch { /* storage unavailable */ }
  },
};

export const savedName = () => storage.get<string>('sy:name') ?? '';
export const lastSession = () => storage.get<Session>('sy:session');

let toastId = 0;

export const useStore = create<Store>((set, get) => ({
  connected: socket.connected,
  session: null,
  room: null,
  toasts: [],
  lastEvents: null,
  theme: storage.get<'dark' | 'light'>('sy:theme') ?? 'dark',
  sound: storage.get<boolean>('sy:sound') ?? true,
  setSound: (sound) => {
    storage.set('sy:sound', sound);
    set({ sound });
  },
  toast: (text, tone = 'info') => {
    const id = ++toastId;
    set({ toasts: [...get().toasts, { id, text, tone }].slice(-4) });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 4000);
  },
  setTheme: (theme) => {
    storage.set('sy:theme', theme);
    set({ theme });
  },
  leave: () => {
    socket.emit('room:leave');
    storage.set('sy:session', null);
    set({ session: null, room: null });
    history.replaceState(null, '', '/');
  },
}));

function onSession(session: Session, name: string) {
  storage.set('sy:session', session);
  storage.set('sy:name', name);
  useStore.setState({ session });
  if (location.pathname !== `/r/${session.code}`) history.replaceState(null, '', `/r/${session.code}`);
}

export async function createRoom(name: string) {
  const res = await request('room:create', { name });
  if (!res.ok) return res.error;
  onSession(res as unknown as Session, name);
  return null;
}

export async function joinRoom(code: string, name: string) {
  const prev = lastSession();
  const token = prev && prev.code === code.toUpperCase() ? prev.token : undefined;
  const res = await request('room:join', { code: code.toUpperCase(), name, token });
  if (!res.ok) return res.error;
  onSession(res as unknown as Session, name);
  return null;
}

socket.on('connect', async () => {
  useStore.setState({ connected: true });
  // Rejoin automatically after a refresh, network blip or server restart.
  const session = useStore.getState().session ?? lastSession();
  const urlCode = location.pathname.match(/^\/r\/([A-Z0-9]{4})/i)?.[1]?.toUpperCase();
  if (session && (!urlCode || urlCode === session.code)) {
    const res = await request('room:join', { code: session.code, name: savedName(), token: session.token });
    if (res.ok) onSession(res as unknown as Session, savedName());
    else {
      storage.set('sy:session', null);
      useStore.setState({ session: null, room: null });
    }
  }
});
socket.on('disconnect', () => useStore.setState({ connected: false }));
socket.on('room:state', (room) => useStore.setState({ room }));
socket.on('room:kicked', () => {
  storage.set('sy:session', null);
  useStore.setState({ session: null, room: null });
  useStore.getState().toast('You were removed from the room.', 'danger');
  history.replaceState(null, '', '/');
});
let eventsId = 0;
socket.on('game:events', (events) => useStore.setState({ lastEvents: { id: ++eventsId, events } }));
