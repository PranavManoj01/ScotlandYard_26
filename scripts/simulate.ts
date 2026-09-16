// End-to-end smoke test against a running server: 1 host + Mr X + 4 detectives play random legal
// moves over real sockets until the game ends, checking detectives never receive Mr X's position.
// Usage: npm start (in another terminal), then: npx tsx scripts/simulate.ts [url]
import { io, type Socket } from 'socket.io-client';
import { legalMoves, canDoubleMove, secondMovesAfter } from '../shared/rules/engine';
import { HIDDEN, type RoomView } from '../shared/protocol';

const URL = process.argv[2] ?? 'http://localhost:3000';
type Client = { name: string; socket: Socket; view: RoomView | null; id: string };

const call = (s: Socket, event: string, ...args: unknown[]) =>
  new Promise<any>((resolve) => s.emit(event, ...args, resolve));

async function connect(name: string): Promise<Client> {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const client: Client = { name, socket, view: null, id: '' };
  socket.on('room:state', (v: RoomView) => { client.view = v; });
  await new Promise((r) => socket.on('connect', r));
  return client;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const host = await connect('Host');
  const created = await call(host.socket, 'room:create', { name: 'Host' });
  if (!created.ok) throw new Error(created.error);
  host.id = created.playerId;
  const code = created.code;
  console.log('Room', code);

  const others: Client[] = [];
  for (const name of ['MrX', 'Det1', 'Det2', 'Det3']) {
    const c = await connect(name);
    const res = await call(c.socket, 'room:join', { code, name });
    if (!res.ok) throw new Error(res.error);
    c.id = res.playerId;
    others.push(c);
  }
  const clients = [host, ...others];
  const mrx = others[0];
  await call(mrx.socket, 'lobby:setRole', { playerId: mrx.id, role: 'mrx' });
  const started = await call(host.socket, 'game:start');
  if (!started.ok) throw new Error(started.error);
  await wait(100);

  let moves = 0;
  let doubles = 0;
  while (host.view?.phase === 'playing' && moves < 400) {
    for (const c of clients) {
      if (c === mrx || !c.view?.game) continue;
      if (c.view.game.pieces[0].position !== HIDDEN || c.view.game.mrxPath.length) {
        throw new Error(`LEAK: ${c.name} can see Mr X`);
      }
    }
    const turn = host.view.game!.turn;
    const actor = clients.find((c) => c.view?.you.pieces.includes(turn));
    if (!actor?.view?.game) throw new Error(`No one controls piece ${turn}`);
    const game = actor.view.game;
    const options = legalMoves(game, turn);
    const pick = options[Math.floor(Math.random() * options.length)];
    let res;
    if (turn === 0 && canDoubleMove(game) && Math.random() < 0.1) {
      const seconds = secondMovesAfter(game, pick);
      res = await call(actor.socket, 'game:double', { first: pick, second: seconds[0] });
      doubles++;
    } else {
      res = await call(actor.socket, 'game:move', { pieceIndex: turn, ...pick });
    }
    if (!res.ok) throw new Error(`Move rejected: ${res.error}`);
    moves++;
    await wait(15);
  }
  await wait(100);
  const g = host.view!.game!;
  console.log(`Finished after ${moves} moves (${doubles} double moves), ${g.log.length} rounds.`);
  console.log(`Winner: ${g.winner} — ${g.winReason}`);
  if (host.view!.phase !== 'over') throw new Error('Game did not finish');
  if (host.view!.game!.pieces[0].position === HIDDEN) throw new Error('Mr X not revealed after game over');
  for (const c of clients) c.socket.close();
  console.log('OK: no leaks, game completed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
