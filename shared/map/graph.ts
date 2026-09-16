import stationsJson from './stations.json';
import edgesJson from './edges.json';
import type { Transport } from '../rules/types';

export interface Station { id: number; x: number; y: number }
export type Edge = [number, number, Transport];

export const STATIONS = stationsJson as Station[];
export const EDGES = edgesJson as Edge[];
export const STATION_BY_ID = new Map(STATIONS.map((s) => [s.id, s]));
export const MAP_WIDTH = 1640;
export const MAP_HEIGHT = 1240;

const adjacency = new Map<number, Map<Transport, number[]>>();
for (const s of STATIONS) adjacency.set(s.id, new Map());
for (const [a, b, t] of EDGES) {
  for (const [from, to] of [[a, b], [b, a]]) {
    const byType = adjacency.get(from)!;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(to);
  }
}

export function neighbours(station: number, transport: Transport): number[] {
  return adjacency.get(station)?.get(transport) ?? [];
}

/** Transport types that serve a station, e.g. for drawing station badges. */
export function transportsAt(station: number): Transport[] {
  return [...(adjacency.get(station)?.keys() ?? [])];
}
