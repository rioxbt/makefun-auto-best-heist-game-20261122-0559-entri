// Sound, synthesised in the browser: no audio files ship with the game, every cue is built from
// oscillators and a little filtered noise the moment it is needed. The context is created on the
// first gesture (browsers refuse one before that) and every cue is a no-op until then, so the
// simulation never has to know whether sound is available.
const STATE = { context: null, master: null, muted: false };

export function initAudio() {
  if (!STATE.context) {
    const Ctor = window.AudioContext ?? window.webkitAudioContext;
    if (!Ctor) return null;
    STATE.context = new Ctor();
    STATE.master = STATE.context.createGain();
    STATE.master.gain.value = 0.9;
    STATE.master.connect(STATE.context.destination);
  }
  if (STATE.context.state === 'suspended') STATE.context.resume();
  return STATE.context;
}

export function setMuted(value) {
  STATE.muted = value;
  if (STATE.master) STATE.master.gain.value = value ? 0 : 0.9;
}

function blip({ freq = 440, to = null, type = 'sine', dur = 0.14, gain = 0.07, when = 0 }) {
  if (!STATE.context || STATE.muted) return;
  const t = STATE.context.currentTime + when;
  const osc = STATE.context.createOscillator();
  const amp = STATE.context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(STATE.master);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

function hiss({ dur = 0.3, gain = 0.05, freq = 900, when = 0 }) {
  if (!STATE.context || STATE.muted) return;
  const t = STATE.context.currentTime + when;
  const frames = Math.max(1, Math.floor(STATE.context.sampleRate * dur));
  const buffer = STATE.context.createBuffer(1, frames, STATE.context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const source = STATE.context.createBufferSource();
  source.buffer = buffer;
  const filter = STATE.context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 0.8;
  const amp = STATE.context.createGain();
  amp.gain.value = gain;
  source.connect(filter).connect(amp).connect(STATE.master);
  source.start(t);
  source.stop(t + dur + 0.02);
}

export const sfx = {
  step() {
    hiss({ dur: 0.05, gain: 0.02, freq: 520 });
  },
  loot() {
    blip({ freq: 660, to: 990, type: 'triangle', dur: 0.16, gain: 0.08 });
    blip({ freq: 990, to: 1320, type: 'triangle', dur: 0.14, gain: 0.05, when: 0.08 });
  },
  spotted() {
    blip({ freq: 880, to: 1180, type: 'square', dur: 0.09, gain: 0.045 });
  },
  alert() {
    blip({ freq: 320, to: 180, type: 'sawtooth', dur: 0.34, gain: 0.07 });
    blip({ freq: 480, to: 240, type: 'sawtooth', dur: 0.3, gain: 0.05, when: 0.1 });
  },
  emp() {
    blip({ freq: 1400, to: 120, type: 'sawtooth', dur: 0.34, gain: 0.07 });
  },
  smoke() {
    hiss({ dur: 0.5, gain: 0.06, freq: 380 });
  },
  denied() {
    blip({ freq: 180, to: 140, type: 'square', dur: 0.12, gain: 0.05 });
  },
  caught() {
    blip({ freq: 400, to: 90, type: 'sawtooth', dur: 0.7, gain: 0.09 });
    blip({ freq: 260, to: 70, type: 'sawtooth', dur: 0.8, gain: 0.07, when: 0.12 });
  },
  clear() {
    [523, 659, 784, 1046].forEach((freq, i) => blip({ freq, type: 'triangle', dur: 0.2, gain: 0.06, when: i * 0.09 }));
  },
  won() {
    [523, 659, 784, 1046, 1318].forEach((freq, i) => blip({ freq, type: 'triangle', dur: 0.5, gain: 0.06, when: i * 0.12 }));
    hiss({ dur: 0.6, gain: 0.03, freq: 2400, when: 0.5 });
  },
};
