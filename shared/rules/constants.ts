import type { Settings, TicketCounts, MoveTicket, Transport } from './types';

export const DETECTIVE_STARTS = [13, 26, 29, 34, 50, 53, 91, 94, 103, 112, 117, 123, 138, 141, 155, 174];
export const MRX_STARTS = [35, 45, 51, 71, 78, 104, 106, 127, 132, 146, 166, 170, 172];

export const DETECTIVE_COLORS = [
  { id: 'red', name: 'Red', color: '#e5484d' },
  { id: 'blue', name: 'Blue', color: '#3e8ef7' },
  { id: 'green', name: 'Green', color: '#30a46c' },
  { id: 'yellow', name: 'Yellow', color: '#f5c518' },
  { id: 'purple', name: 'Purple', color: '#9d6cf0' },
];

export const detectiveTickets = (): TicketCounts => ({ taxi: 10, bus: 8, underground: 4, black: 0, double: 0 });
export const mrxTickets = (detectives: number): TicketCounts => ({ taxi: 4, bus: 3, underground: 3, black: detectives, double: 2 });

export const DEFAULT_SETTINGS: Settings = {
  detectiveCount: 5,
  totalRounds: 24,
  revealRounds: [3, 8, 13, 18, 24],
  ticketsToMrX: true,
  helper: 'on',
  turnSeconds: 0,
  spectatorGodView: false,
  randomMrX: false,
};

export const TICKET_TRANSPORTS: Record<MoveTicket, Transport[]> = {
  taxi: ['taxi'],
  bus: ['bus'],
  underground: ['underground'],
  black: ['taxi', 'bus', 'underground', 'ferry'],
};

export const TICKET_LABEL: Record<string, string> = {
  taxi: 'Taxi', bus: 'Bus', underground: 'Underground', black: 'Black', double: 'Double move',
};
