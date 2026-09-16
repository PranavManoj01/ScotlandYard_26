import { neighbours } from '../map/graph';
import { MRX_STARTS, TICKET_TRANSPORTS } from './constants';
import type { LogEntry } from './types';

/**
 * Where could Mr X be, using only public information: the last reveal, the tickets used since,
 * and where the detectives were standing. Returns station -> likelihood (sums to 1), modelling
 * Mr X as picking uniformly among his options at each step.
 */
export function possibleLocations(log: LogEntry[], detectivesNow: number[]): Map<number, number> {
  let start = -1;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].revealed !== null) { start = i; break; }
  }

  let current = new Map<number, number>();
  if (start >= 0) {
    current.set(log[start].revealed!, 1);
  } else {
    const blocked = new Set(log[0]?.detectivesAt ?? detectivesNow);
    const starts = MRX_STARTS.filter((s) => !blocked.has(s));
    for (const s of starts) current.set(s, 1 / starts.length);
  }

  for (let i = start + 1; i < log.length; i++) {
    const entry = log[i];
    const blocked = new Set(entry.detectivesAt);
    const next = new Map<number, number>();
    for (const [station, weight] of current) {
      // A detective standing on this station means Mr X would already have been caught there.
      if (blocked.has(station)) continue;
      const options = new Set<number>();
      for (const t of TICKET_TRANSPORTS[entry.ticket]) {
        for (const n of neighbours(station, t)) if (!blocked.has(n)) options.add(n);
      }
      for (const n of options) next.set(n, (next.get(n) ?? 0) + weight / options.size);
    }
    current = next;
  }

  for (const d of detectivesNow) current.delete(d);
  const total = [...current.values()].reduce((a, b) => a + b, 0);
  if (total > 0) for (const [k, v] of current) current.set(k, v / total);
  return current;
}
