// The scan sound, ported from the demo app. Call these only from a tap, or iOS stays silent.
let audio: AudioContext | undefined;
function ctx(): AudioContext | null {
  try {
    const A = window.AudioContext || (window as any).webkitAudioContext;
    audio = audio || new A();
    if (audio.state === 'suspended') void audio.resume();
    return audio;
  } catch { return null; }
}
function master(a: AudioContext) {
  const m = a.createGain();
  m.gain.value = 0.32;
  m.connect(a.destination);
  return m;
}

// The short chirp, like a detector's low-battery beep.
export function chirp() {
  const a = ctx(); if (!a) return;
  try {
    const t = a.currentTime, m = master(a);
    const o = a.createOscillator(), g = a.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(2900, t);
    o.frequency.exponentialRampToValueAtTime(3400, t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(m);
    o.start(t); o.stop(t + 0.1);
  } catch { /* no audio, no problem */ }
}

// The coin-drop tail. Plays when the money lands.
export function coin() {
  const a = ctx(); if (!a) return;
  try {
    const t = a.currentTime, m = master(a);
    [2637, 3520, 4186, 5274].forEach((f, i) => {
      const s = a.createOscillator(), sg = a.createGain(), st = t + i * 0.045;
      s.type = 'sine';
      s.frequency.setValueAtTime(f, st);
      sg.gain.setValueAtTime(0.0001, st);
      sg.gain.exponentialRampToValueAtTime(0.35, st + 0.005);
      sg.gain.exponentialRampToValueAtTime(0.0001, st + 0.35);
      s.connect(sg).connect(m);
      s.start(st); s.stop(st + 0.4);
    });
  } catch { /* no audio, no problem */ }
}
