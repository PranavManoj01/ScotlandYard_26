import { useEffect, useState } from 'react';

const isLocalhost = () => ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

export interface ShareInfo {
  /** Link other players can actually open, or null if we couldn't find one. */
  url: string | null;
  /** Why this link was chosen, shown as a hint to the host. */
  note: string | null;
}

/**
 * Works out the link to give friends. On ngrok/LAN addresses the current origin already works.
 * On localhost it asks the server for a running ngrok tunnel, then falls back to the LAN address.
 */
export function useShareUrl(code: string): ShareInfo {
  const [info, setInfo] = useState<ShareInfo>(() => isLocalhost()
    ? { url: null, note: 'Looking for your ngrok link…' }
    : { url: `${location.origin}/r/${code}`, note: null });

  useEffect(() => {
    if (!isLocalhost()) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/public-url');
        const data = (await res.json()) as { url: string | null; lan: string[] };
        if (cancelled) return;
        if (data.url) setInfo({ url: `${data.url}/r/${code}`, note: 'Using your ngrok link.' });
        else if (data.lan[0]) setInfo({ url: `${data.lan[0]}/r/${code}`, note: 'ngrok isn’t running — this link only works on the same Wi-Fi.' });
        else setInfo({ url: null, note: 'Start ngrok (ngrok http 3000) to get a link friends can open.' });
      } catch {
        if (!cancelled) setInfo({ url: null, note: 'Could not work out a shareable link.' });
      }
    };
    load();
    // Keep checking so starting ngrok after creating the room still updates the link.
    const timer = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [code]);

  return info;
}
