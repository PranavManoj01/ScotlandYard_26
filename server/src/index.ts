import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server, type Socket } from 'socket.io';
import { RuleError } from '../../shared/rules/engine';
import type { ClientToServer, ServerToClient } from '../../shared/protocol';
import { RoomError, RoomManager, type Room } from './rooms';
import { loadRooms, scheduleSave } from './persistence';

const PORT = Number(process.env.PORT ?? 3000);
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, '../../client/dist');

type SocketData = { code?: string; playerId?: string };
type IO = Server<ClientToServer, ServerToClient, {}, SocketData>;
type ClientSocket = Socket<ClientToServer, ServerToClient, {}, SocketData>;

const app = express();
const http = createServer(app);
const io: IO = new Server(http, { cors: { origin: true } });

function broadcast(room: Room, events?: Parameters<ServerToClient['game:events']>[0]) {
  scheduleSave(manager.rooms);
  const sockets = io.sockets.adapter.rooms.get(room.code);
  if (!sockets) return;
  for (const id of sockets) {
    const socket = io.sockets.sockets.get(id) as ClientSocket | undefined;
    const playerId = socket?.data.playerId;
    if (!socket || !playerId || !room.players.some((p) => p.id === playerId)) continue;
    socket.emit('room:state', manager.view(room, playerId));
    if (events?.length) socket.emit('game:events', events);
  }
}

const manager = new RoomManager(broadcast);
loadRooms(manager.rooms);

io.on('connection', (socket: ClientSocket) => {
  /** Runs a handler, reporting rule/room errors back through the ack instead of crashing. */
  const guard = <A extends unknown[]>(fn: (...args: A) => void) => (...args: A) => {
    const ack = args.find((a) => typeof a === 'function') as ((r: unknown) => void) | undefined;
    try {
      fn(...args);
      ack?.({ ok: true });
    } catch (err) {
      if (err instanceof RoomError || err instanceof RuleError) ack?.({ ok: false, error: err.message });
      else {
        console.error(err);
        ack?.({ ok: false, error: 'Something went wrong' });
      }
    }
  };

  const current = () => {
    const { code, playerId } = socket.data;
    if (!code || !playerId) throw new RoomError('Join a room first');
    const room = manager.get(code);
    manager.player(room, playerId);
    return { room, playerId };
  };

  const attach = (room: Room, playerId: string) => {
    if (socket.data.code && socket.data.playerId) {
      const prev = manager.rooms.get(socket.data.code);
      socket.leave(socket.data.code);
      if (prev) manager.setConnected(prev, socket.data.playerId, -1);
    }
    socket.data = { code: room.code, playerId };
    socket.join(room.code);
    manager.setConnected(room, playerId, 1);
  };

  socket.on('room:create', ({ name }, ack) => {
    try {
      const { room, player } = manager.create(name);
      attach(room, player.id);
      ack({ ok: true, code: room.code, playerId: player.id, token: player.token });
    } catch (err) {
      ack({ ok: false, error: (err as Error).message });
    }
  });

  socket.on('room:join', ({ code, name, token }, ack) => {
    try {
      const { room, player } = manager.join(code, name, token);
      attach(room, player.id);
      ack({ ok: true, code: room.code, playerId: player.id, token: player.token });
    } catch (err) {
      ack({ ok: false, error: err instanceof RoomError ? err.message : 'Could not join' });
    }
  });

  socket.on('room:leave', guard(() => {
    const { room, playerId } = current();
    socket.leave(room.code);
    manager.setConnected(room, playerId, -1);
    socket.data = {};
    manager.leave(room, playerId);
  }));

  socket.on('lobby:setRole', guard(({ playerId, role }) => {
    const c = current();
    manager.setRole(c.room, c.playerId, playerId, role);
  }));
  socket.on('lobby:settings', guard((patch) => {
    const c = current();
    manager.updateSettings(c.room, c.playerId, patch);
  }));
  socket.on('seat:assign', guard(({ seat, playerId }) => {
    const c = current();
    manager.assignSeat(c.room, c.playerId, seat, playerId);
  }));
  socket.on('game:start', guard(() => {
    const c = current();
    manager.start(c.room, c.playerId);
  }));
  socket.on('game:move', guard(({ pieceIndex, ticket, to }) => {
    const c = current();
    manager.move(c.room, c.playerId, pieceIndex, { ticket, to });
  }));
  socket.on('game:double', guard(({ first, second }) => {
    const c = current();
    manager.doubleMove(c.room, c.playerId, first, second);
  }));
  socket.on('team:ping', guard(({ station, label }) => {
    const c = current();
    manager.ping(c.room, c.playerId, station, label);
  }));
  socket.on('team:preview', guard((preview) => {
    const c = current();
    manager.preview(c.room, c.playerId, preview);
  }));
  socket.on('chat:send', guard(({ channel, text }) => {
    const c = current();
    manager.chat(c.room, c.playerId, channel, text);
  }));
  socket.on('host:pause', guard((paused) => {
    const c = current();
    manager.pause(c.room, c.playerId, paused);
  }));
  socket.on('host:kick', guard((playerId) => {
    const c = current();
    manager.kick(c.room, c.playerId, playerId);
    for (const id of io.sockets.adapter.rooms.get(c.room.code) ?? []) {
      const s = io.sockets.sockets.get(id) as ClientSocket | undefined;
      if (s?.data.playerId === playerId) {
        s.emit('room:kicked');
        s.leave(c.room.code);
        s.data = {};
      }
    }
  }));
  socket.on('host:end', guard(() => {
    const c = current();
    manager.end(c.room, c.playerId);
  }));
  socket.on('host:rematch', guard(({ rotateMrX }) => {
    const c = current();
    manager.rematch(c.room, c.playerId, rotateMrX);
  }));
  socket.on('undo:request', guard(() => {
    const c = current();
    manager.requestUndo(c.room, c.playerId);
  }));
  socket.on('undo:vote', guard((accept) => {
    const c = current();
    manager.voteUndo(c.room, c.playerId, accept);
  }));

  socket.on('disconnect', () => {
    const { code, playerId } = socket.data;
    const room = code ? manager.rooms.get(code) : undefined;
    if (room && playerId) manager.setConnected(room, playerId, -1);
  });
});

// Turn timers and cleanup of idle rooms.
setInterval(() => {
  const now = Date.now();
  for (const room of manager.rooms.values()) {
    try {
      manager.checkTimeout(room, now);
    } catch (err) {
      console.error('Timeout move failed', err);
    }
    const idle = room.players.every((p) => p.connections === 0);
    if (idle && now - room.lastActivity > 24 * 60 * 60 * 1000) manager.rooms.delete(room.code);
  }
}, 1000);

// Skip virtual adapters (VirtualBox, Hyper-V/WSL, VMware, Docker) that other devices can't reach.
const lanUrls = () => Object.entries(networkInterfaces())
  .filter(([name]) => !/virtualbox|vethernet|vmware|docker|wsl|loopback/i.test(name))
  .flatMap(([, addrs]) => addrs ?? [])
  // 192.168.56.x is VirtualBox's default host-only network, whatever the adapter is called.
  .filter((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('192.168.56.'))
  .map((a) => `http://${a.address}:${PORT}`);

/**
 * The best link to share with other players. Prefers a running ngrok tunnel (read from ngrok's
 * local API), otherwise falls back to LAN addresses so a host on localhost never shares "localhost".
 */
app.get('/api/public-url', async (_req, res) => {
  try {
    const response = await fetch('http://127.0.0.1:4040/api/tunnels', { signal: AbortSignal.timeout(800) });
    const data = (await response.json()) as { tunnels: { public_url: string; config?: { addr?: string } }[] };
    // Only use a tunnel that forwards to this server's port (another app may have its own tunnel).
    const tunnel = data.tunnels.find((t) => t.public_url.startsWith('https') && /:(\d+)\/?$/.exec(t.config?.addr ?? '')?.[1] === String(PORT));
    if (tunnel) return res.json({ url: tunnel.public_url, source: 'ngrok', lan: lanUrls() });
  } catch { /* ngrok not running */ }
  res.json({ url: null, source: 'lan', lan: lanUrls() });
});

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/socket\.io).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send('Client not built. Run "npm run dev" and open the Vite URL, or "npm run host".'));
}

http.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Is the game server already running in another terminal?`);
    console.error('  Stop it first, or pick another port. PowerShell: $env:PORT=3001; npm run host\n');
    process.exit(1);
  }
  throw err;
});

http.listen(PORT, () => {
  console.log(`\n  Scotland Yard server running`);
  console.log(`  Local:   http://localhost:${PORT}`);
  for (const url of lanUrls()) console.log(`  Network: ${url}   (same Wi-Fi)`);
  console.log(`\n  Share over the internet:  ngrok http ${PORT}\n`);
});
