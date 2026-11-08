/* Negosyante PH: sound effects, synthesized with WebAudio (no audio files to download). */
'use strict';
let AC = null;
function audioCtx() {
  if (AC) { if (AC.state === 'suspended') AC.resume().catch(() => {}); return AC; }
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
  try { AC = new C(); } catch (e) { AC = null; }
  return AC;
}
// one short note: frequency, start offset, length, wave type, volume
function tone(ac, f, t0, len, type, vol, slideTo) {
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + t0;
  o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + len);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + len + 0.02);
}
function noise(ac, t0, len, vol) {   // the "chk" of a cash drawer
  const n = Math.floor(ac.sampleRate * len), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 1800; g.gain.value = vol || 0.12;
  s.buffer = buf; s.connect(f); f.connect(g); g.connect(ac.destination); s.start(ac.currentTime + t0);
}
const SFX = {
  tap: (a) => tone(a, 660, 0, 0.05, 'triangle', 0.05),
  open: (a) => { tone(a, 523, 0, 0.12, 'triangle', 0.12); tone(a, 784, 0.09, 0.18, 'triangle', 0.12); },
  coin: (a) => { tone(a, 1318, 0, 0.08, 'square', 0.05); tone(a, 1760, 0.07, 0.22, 'square', 0.05); },
  cash: (a) => { noise(a, 0, 0.07, 0.1); tone(a, 2093, 0.06, 0.35, 'sine', 0.14); tone(a, 2637, 0.06, 0.35, 'sine', 0.08); },
  notify: (a) => { tone(a, 880, 0, 0.12, 'sine', 0.12); tone(a, 1175, 0.11, 0.2, 'sine', 0.1); },
  approve: (a) => { tone(a, 587, 0, 0.09, 'triangle', 0.12); tone(a, 880, 0.08, 0.16, 'triangle', 0.12); },
  decline: (a) => { tone(a, 440, 0, 0.12, 'triangle', 0.1); tone(a, 330, 0.1, 0.18, 'triangle', 0.1); },
  hire: (a) => { [523, 659, 784].forEach((f, i) => tone(a, f, i * 0.07, 0.16, 'triangle', 0.11)); },
  bad: (a) => { tone(a, 220, 0, 0.25, 'sawtooth', 0.07, 150); },
  stage: (a) => { [523, 659, 784, 1047].forEach((f, i) => tone(a, f, i * 0.11, 0.3, 'triangle', 0.13)); tone(a, 1568, 0.46, 0.5, 'sine', 0.08); },
  fanfare: (a) => { [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(a, f, i * 0.1, i === 6 ? 0.6 : 0.16, 'square', 0.06)); }
};
function sfx(name) {
  if (typeof SET !== 'undefined' && !SET.sound) return;
  const a = audioCtx(); if (!a || !SFX[name]) return;
  try { SFX[name](a); } catch (e) { /* audio is optional */ }
}
// phones only allow sound after a tap: unlock on the first one
document.addEventListener('pointerdown', () => audioCtx(), { once: true });
