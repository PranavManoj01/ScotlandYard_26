// Dev helper: joins an existing room with simple bot detectives that make random legal moves,
// so you can try the game alone. If a bot is made Mr X in the lobby it plays Mr X too. Usage: npx tsx scripts/bots.ts <ROOMCODE> [count] [url]
import { io } from 'socket.io-client';
import { legalMoves } from '../shared/rules/engine';
import type { RoomView } from '../shared/protocol';

const [code, count = '2', url = 'http://localhost:3000'] = process.argv.slice(2);
if (!code) {
  console.error('Usage: npx tsx scripts/bots.ts <ROOMCODE> [count] [url]');
  process.exit(1);
}

for (let i = 1; i <= Number(count); i++) {
  const socket = io(url, { transports: ['websocket'], forceNew: true });
  const name = `Bot ${i}`;
  let busy = false;
  socket.on('connect', () => {
    socket.emit('room:join', { code, name }, (res: any) => console.log(name, res.ok ? 'joined' : res.error));
  });
  socket.on('room:state', (room: RoomView) => {
    const game = room.game;
    if (room.phase !== 'playing' || !game || room.paused || busy || !room.you.pieces.includes(game.turn)) return;
    busy = true;
    setTimeout(() => {
      const moves = legalMoves(game, game.turn);
      const move = moves[Math.floor(Math.random() * moves.length)];
      socket.emit('game:move', { pieceIndex: game.turn, ...move }, () => { busy = false; });
    }, 900);
  });
}
