export class SoundFX {
  /** The game's one SoundFX, for world ambience (the Sphere's storm) that can't be handed the instance. */
  static current: SoundFX | null = null;
  private ctx: AudioContext | null = null;
  public enabled = true;

  constructor() {
    SoundFX.current = this;
  }

  /** Tab hidden: silence everything (a running car engine would drone on); the next sound resumes it. */
  public setPaused(paused: boolean): void {
    if (this.ctx) void (paused ? this.ctx.suspend() : this.ctx.resume());
  }

  private ensureCtx(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public playMeow(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.38);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.44);
  }

  public playPuff(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.28);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.45));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.Q.value = 1.4;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playVapeRip(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.55);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(380, now + 0.55);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  public playBusBell(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [660, 880].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);
      gain.gain.setValueAtTime(0.11, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.26);
    });
  }

  public playSteal(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.11);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playCash(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [880, 1318].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.10, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.24);
    });
  }

  public playJackpot(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [523, 659, 784, 1046, 1318].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.07;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.32);
    });
  }

  private engine: { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;

  public startEngine(): void {
    const ctx = this.ensureCtx();
    if (!ctx || this.engine) return;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    filter.type = 'lowpass';
    filter.frequency.value = 520;
    gain.gain.value = 0.035;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc2.start();
    this.engine = { osc, osc2, gain };
    this.setEngine(0);
  }

  public setEngine(speed: number): void {
    if (!this.engine || !this.ctx) return;
    const f = 38 + Math.abs(speed) * 3.2;
    this.engine.osc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
    this.engine.osc2.frequency.setTargetAtTime(f * 0.5, this.ctx.currentTime, 0.08);
    this.engine.gain.gain.setTargetAtTime(this.enabled ? 0.03 + Math.min(0.04, Math.abs(speed) * 0.0015) : 0, this.ctx.currentTime, 0.1);
  }

  public stopEngine(): void {
    if (!this.engine) return;
    this.engine.osc.stop();
    this.engine.osc2.stop();
    this.engine = null;
  }

  public playHonk(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const f of [392, 494]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.setValueAtTime(0.06, now + 0.32);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.42);
    }
  }

  public playCrash(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.4);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.18));
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
  }

  private storm: { src: AudioBufferSourceNode; lp: BiquadFilterNode; whistle: BiquadFilterNode; gain: GainNode; wg: GainNode; rumble: OscillatorNode; rg: GainNode } | null = null;

  /**
   * The Sphere show's wind roar (synthesized brown noise through a moving low-pass, plus a whistling band)
   * and a sub-bass seat rumble. level 0 fades it all out and frees the nodes; call it ~10×/s.
   */
  public setStorm(level: number, wind: number, rumble = 0): void {
    if (!this.enabled || level <= 0.001) {
      if (this.storm && this.ctx) {
        const s = this.storm;
        this.storm = null;
        const now = this.ctx.currentTime;
        s.gain.gain.setTargetAtTime(0, now, 0.25);
        s.wg.gain.setTargetAtTime(0, now, 0.25);
        s.rg.gain.setTargetAtTime(0, now, 0.25);
        s.src.stop(now + 1.6);
        s.rumble.stop(now + 1.6);
      }
      return;
    }
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (!this.storm) {
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b0 = 0;
      let peak = 0;
      for (let i = 0; i < len; i++) {
        b0 = 0.985 * b0 + (Math.random() * 2 - 1) * 0.15;
        data[i] = b0;
        peak = Math.max(peak, Math.abs(b0));
      }
      // Seamless loop: crossfade the tail into the head
      const fade = Math.floor(ctx.sampleRate * 0.25);
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        data[i] = data[i] * k + data[len - fade + i] * (1 - k);
      }
      for (let i = 0; i < len; i++) data[i] /= peak || 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopEnd = (len - fade) / ctx.sampleRate;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300;
      lp.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(lp);
      lp.connect(gain);
      gain.connect(ctx.destination);
      const whistle = ctx.createBiquadFilter();
      whistle.type = 'bandpass';
      whistle.frequency.value = 700;
      whistle.Q.value = 6;
      const wg = ctx.createGain();
      wg.gain.value = 0;
      src.connect(whistle);
      whistle.connect(wg);
      wg.connect(ctx.destination);
      const rumbleOsc = ctx.createOscillator();
      rumbleOsc.type = 'sine';
      rumbleOsc.frequency.value = 36;
      const rg = ctx.createGain();
      rg.gain.value = 0;
      rumbleOsc.connect(rg);
      rg.connect(ctx.destination);
      src.start();
      rumbleOsc.start();
      this.storm = { src, lp, whistle, gain, wg, rumble: rumbleOsc, rg };
    }
    const s = this.storm;
    const now = ctx.currentTime;
    const gust = 0.75 + 0.25 * Math.sin(now * 0.9) * Math.sin(now * 0.37 + 1.1);
    s.gain.gain.setTargetAtTime(level * (0.05 + 0.3 * wind * gust), now, 0.2);
    s.lp.frequency.setTargetAtTime(220 + 1500 * wind * gust, now, 0.25);
    s.whistle.frequency.setTargetAtTime(520 + 900 * wind * gust, now, 0.3);
    s.wg.gain.setTargetAtTime(level * 0.05 * wind * wind * gust, now, 0.3);
    s.rg.gain.setTargetAtTime(level * rumble * 0.22, now, 0.15);
  }

  /** Thunder: a sharp crack, then a long low rumble. `delay` (s) is the light-to-sound lag. */
  public playThunder(intensity = 1, delay = 0): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const len = Math.floor(ctx.sampleRate * 3.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / ctx.sampleRate;
      b0 = 0.97 * b0 + (Math.random() * 2 - 1) * 0.3;
      const env = Math.exp(-t * 1.3) * (0.6 + 0.4 * Math.sin(t * 9 + Math.sin(t * 3) * 2));
      data[i] = (b0 * env + (t < 0.12 ? (Math.random() * 2 - 1) * (1 - t / 0.12) * 0.8 : 0)) * 0.6;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, now);
    lp.frequency.exponentialRampToValueAtTime(160, now + 0.5);
    const gain = ctx.createGain();
    gain.gain.value = 0.42 * intensity;
    src.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
  }

  public playBusted(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.linearRampToValueAtTime(160, now + 0.32);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  }
}
