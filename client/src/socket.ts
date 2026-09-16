import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../../shared/protocol';

// Relative connection: works on localhost, LAN IPs and any ngrok domain.
export const socket: Socket<ServerToClient, ClientToServer> = io({ autoConnect: true });

type AckResult = { ok: true } | { ok: false; error: string };

/** Emits an event that takes an ack and resolves with its result. */
export function request<E extends keyof ClientToServer>(
  event: E,
  ...args: Parameters<ClientToServer[E]> extends [infer P, ...any[]] ? (NonNullable<P> extends Function ? [] : [P]) : []
): Promise<AckResult & Record<string, any>> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ ok: false, error: 'Server did not respond' }), 8000);
    (socket.emit as any)(event, ...args, (res: AckResult) => {
      clearTimeout(timeout);
      resolve(res);
    });
  });
}
