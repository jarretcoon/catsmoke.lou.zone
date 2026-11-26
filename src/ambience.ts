/**
 * The sound of the place Lou is in, all synthesized (no audio files):
 * - inside a casino: a crowd murmur, slot chimes from every side, now and then a jackpot run and chips clacking;
 * - out on the Strip: traffic rumble, a far-off crowd, the odd horn, and a club's bass thump after dark.
 * Quiet by design; [N] turns it off (remembered).
 */
const KEY = 'catsmoke.ambience';
// Slot machines are tuned to a happy major pentatonic, so a whole floor of them never clashes.
const SLOT_NOTES = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51, 1567.98];

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private casinoBed: GainNode | null = null;
  private streetBed: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private on: boolean;
  private indoor = 0;
  private night = 0;
  private nextChime = 0;
  private nextJackpot = 4;
  private nextChips = 1;
  private nextHorn = 6;
  private nextThump = 0;
  private clock = 0;

  constructor() {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {
      saved = null;
    }
    this.on = saved !== 'off';
    const begin = () => {
      this.start();
      window.removeEventListener('pointerdown', begin);
      window.removeEventListener('keydown', begin);
    };
    window.addEventListener('pointerdown', begin);
    window.addEventListener('keydown', begin);
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Flip ambience on/off; returns the new state. */
  toggle(): boolean {
    this.on = !this.on;
    try {
      localStorage.setItem(KEY, this.on ? 'on' : 'off');
    } catch {
      /* private mode: just don't remember */
    }
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.on ? 0.32 : 0, this.ctx.currentTime, 0.2);
    return this.on;
  }

  /** Tab hidden: stop the beds (the game loop that drives them is paused too); visible again: carry on. */
  setPaused(paused: boolean): void {
    if (this.ctx) void (paused ? this.ctx.suspend() : this.ctx.resume());
  }

  private start(): void {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.gain.setTargetAtTime(this.on ? 0.32 : 0, ctx.currentTime, 0.8);
    master.connect(ctx.destination);
    this.master = master;

    // Two seconds of white noise, looped by every bed.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;

    // Casino murmur: voices are mostly 250–1200 Hz; two detuned bands breathing slowly sound like a room of people.
    this.casinoBed = ctx.createGain();
    this.casinoBed.gain.value = 0;
    this.casinoBed.connect(master);
    for (const [f, q, rate] of [
      [420, 0.9, 0.13],
      [880, 1.3, 0.21],
    ] as const) {
      const src = this.loopNoise();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0.35;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = rate;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.12;
      lfo.connect(lfoGain).connect(g.gain);
      lfo.start();
      src.connect(bp).connect(g).connect(this.casinoBed);
    }
    // Air handling: casinos are never quiet even when empty.
    {
      const src = this.loopNoise();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 180;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      src.connect(lp).connect(g).connect(this.casinoBed);
    }

    // Street: traffic rumble + a distant crowd.
    this.streetBed = ctx.createGain();
    this.streetBed.gain.value = 0;
    this.streetBed.connect(master);
    {
      const src = this.loopNoise();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 140;
      const g = ctx.createGain();
      g.gain.value = 0.9;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07; // cars come and go
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.35;
      lfo.connect(lfoGain).connect(g.gain);
      lfo.start();
      src.connect(lp).connect(g).connect(this.streetBed);
    }
    {
      const src = this.loopNoise();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 650;
      bp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.value = 0.16;
      src.connect(bp).connect(g).connect(this.streetBed);
    }
  }

  private loopNoise(): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    // Start each loop at a different point so the beds don't phase against each other.
    src.start(0, Math.random() * 2);
    return src;
  }

  /** A pure-ish bell tone, panned somewhere on the floor. */
  private tone(freq: number, at: number, len: number, vol: number, pan: number, type: OscillatorType = 'triangle'): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0005, at + len);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    o.connect(g).connect(p).connect(this.casinoBed!);
    o.start(at);
    o.stop(at + len + 0.05);
  }

  private burst(at: number, freq: number, len: number, vol: number, pan: number, bed: GainNode): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 2.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0005, at + len);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    src.connect(f).connect(g).connect(p).connect(bed);
    src.start(at, Math.random() * 1.5, len + 0.02);
  }

  /** `indoor` 0..1 (casino/shop), `night` 0..1. Call every frame. */
  update(dt: number, indoor: number, night: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.casinoBed || !this.streetBed) return;
    this.clock += dt;
    this.indoor += (indoor - this.indoor) * Math.min(1, dt * 2);
    this.night = night;
    const now = ctx.currentTime;
    this.casinoBed.gain.setTargetAtTime(this.indoor, now, 0.15);
    this.streetBed.gain.setTargetAtTime((1 - this.indoor) * (0.75 + 0.25 * night), now, 0.15);
    if (!this.on || ctx.state !== 'running') return;

    if (this.indoor > 0.3) {
      const k = this.indoor;
      // A slot somewhere plays its little three- or four-note riff.
      if (this.clock > this.nextChime) {
        this.nextChime = this.clock + 0.25 + Math.random() * 0.9;
        const base = Math.floor(Math.random() * 5);
        const pan = Math.random() * 1.6 - 0.8;
        const n = 2 + Math.floor(Math.random() * 3);
        const far = 0.25 + Math.random() * 0.75;
        for (let i = 0; i < n; i++) this.tone(SLOT_NOTES[base + (i % 4)], now + i * 0.085, 0.45, 0.05 * far * k, pan);
      }
      // Somebody hits: a fast run up the scale and a bell that hangs in the air.
      if (this.clock > this.nextJackpot) {
        this.nextJackpot = this.clock + 9 + Math.random() * 16;
        const pan = Math.random() * 1.4 - 0.7;
        for (let i = 0; i < 12; i++) this.tone(SLOT_NOTES[i % SLOT_NOTES.length] * (i >= 9 ? 2 : 1), now + i * 0.06, 0.35, 0.05 * k, pan);
        this.tone(2093, now + 0.8, 1.8, 0.04 * k, pan, 'sine');
      }
      // Chips: short bright clacks in twos and threes.
      if (this.clock > this.nextChips) {
        this.nextChips = this.clock + 0.8 + Math.random() * 2.4;
        const pan = Math.random() * 1.6 - 0.8;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.burst(now + i * (0.05 + Math.random() * 0.05), 3200 + Math.random() * 1500, 0.035, 0.18 * k, pan, this.casinoBed);
      }
    } else {
      const k = 1 - this.indoor;
      // A horn down the Boulevard.
      if (this.clock > this.nextHorn) {
        this.nextHorn = this.clock + 7 + Math.random() * 14;
        const o1 = ctx.createOscillator();
        const o2 = ctx.createOscillator();
        o1.type = o2.type = 'sawtooth';
        o1.frequency.value = 392;
        o2.frequency.value = 494;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1400;
        const g = ctx.createGain();
        const len = 0.18 + Math.random() * 0.35;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.025 * k, now + 0.02);
        g.gain.setValueAtTime(0.025 * k, now + len);
        g.gain.linearRampToValueAtTime(0, now + len + 0.05);
        const p = ctx.createStereoPanner();
        p.pan.value = Math.random() * 1.6 - 0.8;
        o1.connect(lp);
        o2.connect(lp);
        lp.connect(g).connect(p).connect(this.streetBed);
        o1.start(now);
        o2.start(now);
        o1.stop(now + len + 0.1);
        o2.stop(now + len + 0.1);
      }
      // After dark a club somewhere is pumping: muffled four-on-the-floor.
      if (this.night > 0.5 && this.clock > this.nextThump) {
        this.nextThump = this.clock + 0.48;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(110, now);
        o.frequency.exponentialRampToValueAtTime(48, now + 0.12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.06 * k * (this.night - 0.5) * 2, now);
        g.gain.exponentialRampToValueAtTime(0.0005, now + 0.2);
        o.connect(g).connect(this.streetBed);
        o.start(now);
        o.stop(now + 0.25);
      }
    }
  }
}
