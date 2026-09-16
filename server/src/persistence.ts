import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Room } from './rooms';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'rooms.json');
let timer: NodeJS.Timeout | null = null;

/** Snapshots all rooms to disk (debounced) so a server restart doesn't lose games. */
export function scheduleSave(rooms: Map<string, Room>) {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${FILE}.tmp`;
      writeFileSync(tmp, JSON.stringify([...rooms.values()]));
      renameSync(tmp, FILE);
    } catch (err) {
      console.error('Failed to save rooms', err);
    }
  }, 500);
}

export function loadRooms(rooms: Map<string, Room>) {
  if (!existsSync(FILE)) return;
  try {
    const saved = JSON.parse(readFileSync(FILE, 'utf8')) as Room[];
    for (const room of saved) {
      for (const p of room.players) p.connections = 0;
      room.previews = [];
      rooms.set(room.code, room);
    }
    console.log(`Restored ${saved.length} room(s) from disk.`);
  } catch (err) {
    console.error('Could not restore rooms', err);
  }
}
