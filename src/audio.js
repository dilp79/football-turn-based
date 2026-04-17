const STORAGE_KEY = "football-turn-audio-muted";
const MASTER_GAIN = 0.26;

function getDefaultMuted() {
  return false;
}

function loadMutedState() {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      return true;
    }
    if (stored === "false") {
      return false;
    }
  } catch {}
  return getDefaultMuted();
}

function saveMutedState(value) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {}
}

class FootballAudio {
  constructor() {
    this.muted = loadMutedState();
    this.context = null;
    this.master = null;
  }

  isMuted() {
    return this.muted;
  }

  async unlock() {
    const context = this.ensureContext();
    if (!context) {
      return false;
    }
    if (context.state === "running") {
      return true;
    }
    try {
      await context.resume();
      return true;
    } catch {
      return false;
    }
  }

  toggleMuted() {
    this.muted = !this.muted;
    saveMutedState(this.muted);
    if (this.master) {
      this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
    }
    return this.muted;
  }

  ensureContext() {
    if (typeof window === "undefined") {
      return null;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    if (!this.context) {
      this.context = new AudioContextCtor({ latencyHint: "interactive" });
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_GAIN;
      this.master.connect(this.context.destination);
    }

    return this.context;
  }

  canPlay() {
    const context = this.ensureContext();
    return Boolean(context && this.master && !this.muted && context.state === "running");
  }

  createEnvelopeNode({ type = "sine", frequency = 440, gain = 0.06, start, duration, detune = 0 }) {
    const context = this.ensureContext();
    if (!context || !this.master) {
      return null;
    }

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.detune.setValueAtTime(detune, start);

    gainNode.gain.setValueAtTime(0.0001, start);
    gainNode.gain.exponentialRampToValueAtTime(gain, start + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gainNode);
    gainNode.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);

    return { oscillator, gainNode };
  }

  playNoise({ start, duration = 0.08, gain = 0.02, filterFrequency = 1400, type = "bandpass" }) {
    const context = this.ensureContext();
    if (!context || !this.master) {
      return;
    }

    const bufferSize = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < bufferSize; index += 1) {
      data[index] = Math.random() * 2 - 1;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gainNode = context.createGain();

    source.buffer = buffer;
    filter.type = type;
    filter.frequency.setValueAtTime(filterFrequency, start);
    gainNode.gain.setValueAtTime(gain, start);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.master);
    source.start(start);
    source.stop(start + duration + 0.03);
  }

  withContext(callback) {
    if (!this.canPlay()) {
      return;
    }
    const context = this.ensureContext();
    callback(context, context.currentTime);
  }

  buy() {
    this.withContext((context, now) => {
      this.createEnvelopeNode({ type: "triangle", frequency: 880, gain: 0.03, start: now, duration: 0.06 });
      this.createEnvelopeNode({ type: "sine", frequency: 1320, gain: 0.02, start: now + 0.045, duration: 0.08 });
    });
  }

  move() {
    this.withContext((context, now) => {
      this.createEnvelopeNode({ type: "square", frequency: 170, gain: 0.025, start: now, duration: 0.05 });
    });
  }

  pass() {
    this.withContext((context, now) => {
      this.playNoise({ start: now, duration: 0.09, gain: 0.018, filterFrequency: 1500 });
      this.createEnvelopeNode({ type: "triangle", frequency: 520, gain: 0.018, start: now, duration: 0.08 });
    });
  }

  shot() {
    this.withContext((context, now) => {
      this.createEnvelopeNode({ type: "sine", frequency: 110, gain: 0.06, start: now, duration: 0.12 });
      this.playNoise({ start: now, duration: 0.07, gain: 0.014, filterFrequency: 900 });
    });
  }

  goal() {
    this.withContext((context, now) => {
      this.createEnvelopeNode({ type: "triangle", frequency: 660, gain: 0.03, start: now, duration: 0.12 });
      this.createEnvelopeNode({ type: "triangle", frequency: 880, gain: 0.032, start: now + 0.11, duration: 0.12 });
      this.createEnvelopeNode({ type: "triangle", frequency: 1320, gain: 0.036, start: now + 0.22, duration: 0.18 });
      this.playNoise({ start: now + 0.02, duration: 0.18, gain: 0.012, filterFrequency: 1700, type: "highpass" });
    });
  }

  save() {
    this.withContext((context, now) => {
      this.createEnvelopeNode({ type: "square", frequency: 220, gain: 0.028, start: now, duration: 0.07 });
      this.createEnvelopeNode({ type: "triangle", frequency: 300, gain: 0.02, start: now + 0.04, duration: 0.08 });
    });
  }

  tackleWon() {
    this.withContext((context, now) => {
      this.createEnvelopeNode({ type: "square", frequency: 240, gain: 0.03, start: now, duration: 0.05 });
      this.playNoise({ start: now, duration: 0.04, gain: 0.015, filterFrequency: 1200 });
    });
  }

  tackleLost() {
    this.withContext((context, now) => {
      this.createEnvelopeNode({ type: "sawtooth", frequency: 180, gain: 0.022, start: now, duration: 0.07, detune: -80 });
    });
  }

  foul() {
    this.withContext((context, now) => {
      const whistle = this.createEnvelopeNode({ type: "sine", frequency: 980, gain: 0.035, start: now, duration: 0.18 });
      if (whistle) {
        whistle.oscillator.frequency.exponentialRampToValueAtTime(1180, now + 0.16);
      }
    });
  }

  dribble() {
    this.withContext((context, now) => {
      this.createEnvelopeNode({ type: "triangle", frequency: 320, gain: 0.022, start: now, duration: 0.05 });
      this.createEnvelopeNode({ type: "triangle", frequency: 420, gain: 0.02, start: now + 0.05, duration: 0.05 });
    });
  }

  turnStart() {
    this.withContext((context, now) => {
      this.createEnvelopeNode({ type: "triangle", frequency: 420, gain: 0.018, start: now, duration: 0.07 });
      this.createEnvelopeNode({ type: "triangle", frequency: 520, gain: 0.016, start: now + 0.06, duration: 0.07 });
    });
  }

  phase() {
    this.withContext((context, now) => {
      this.createEnvelopeNode({ type: "sine", frequency: 300, gain: 0.016, start: now, duration: 0.09 });
      this.createEnvelopeNode({ type: "sine", frequency: 420, gain: 0.014, start: now + 0.08, duration: 0.1 });
    });
  }

  matchEnd() {
    this.withContext((context, now) => {
      this.createEnvelopeNode({ type: "triangle", frequency: 392, gain: 0.02, start: now, duration: 0.11 });
      this.createEnvelopeNode({ type: "triangle", frequency: 523, gain: 0.022, start: now + 0.09, duration: 0.11 });
      this.createEnvelopeNode({ type: "triangle", frequency: 659, gain: 0.024, start: now + 0.18, duration: 0.12 });
      this.createEnvelopeNode({ type: "triangle", frequency: 784, gain: 0.026, start: now + 0.28, duration: 0.18 });
    });
  }
}

export const audio = new FootballAudio();
