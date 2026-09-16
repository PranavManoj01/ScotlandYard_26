let ctx: AudioContext | null = null;

/** Short notification chime; silently does nothing where audio is unavailable. */
export function chime(kind: 'turn' | 'reveal' | 'end' = 'turn') {
  try {
    ctx ??= new AudioContext();
    const notes = kind === 'turn' ? [660, 880] : kind === 'reveal' ? [440, 330, 220] : [523, 659, 784, 1046];
    notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      const t = ctx!.currentTime + i * 0.12;
      osc.frequency.value = freq;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch { /* no audio */ }
}

export function vibrate(pattern: number | number[] = 120) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}
