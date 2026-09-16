// Converts the raw station/connection text files (from github.com/AlexElvers/scotland-yard-data)
// into JSON used by the shared game code, and sanity-checks the graph.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8').trim().split(/\r?\n/);

const stations = read('scripts/raw/stations.txt').map((line) => {
  const [id, x, y] = line.split(' ');
  return { id: +id, x: +x, y: +y };
});
const typeMap = { taxi: 'taxi', bus: 'bus', underground: 'underground', water: 'ferry' };
const edges = read('scripts/raw/connections.txt').map((line) => {
  const [a, b, t] = line.split(' ');
  if (!typeMap[t]) throw new Error(`Unknown type ${t}`);
  return [+a, +b, typeMap[t]];
});

const ids = new Set(stations.map((s) => s.id));
if (ids.size !== 199) throw new Error(`Expected 199 stations, got ${ids.size}`);
for (let i = 1; i <= 199; i++) if (!ids.has(i)) throw new Error(`Missing station ${i}`);
const seen = new Set();
for (const [a, b, t] of edges) {
  if (!ids.has(a) || !ids.has(b)) throw new Error(`Edge to unknown station ${a}-${b}`);
  const key = `${Math.min(a, b)}-${Math.max(a, b)}-${t}`;
  if (seen.has(key)) throw new Error(`Duplicate edge ${key}`);
  seen.add(key);
}
const adj = new Map([...ids].map((i) => [i, []]));
for (const [a, b] of edges) { adj.get(a).push(b); adj.get(b).push(a); }
const visited = new Set([1]);
const queue = [1];
while (queue.length) for (const n of adj.get(queue.shift())) if (!visited.has(n)) { visited.add(n); queue.push(n); }
if (visited.size !== 199) throw new Error('Graph is not connected');

writeFileSync(new URL('shared/map/stations.json', root), JSON.stringify(stations));
writeFileSync(new URL('shared/map/edges.json', root), JSON.stringify(edges));
console.log(`Imported ${stations.length} stations and ${edges.length} edges.`);
