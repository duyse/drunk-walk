/**
 * All SFX are synthesized with WebAudio at runtime — no audio files, no
 * licensing, tiny download. Unlocks on first user gesture; never autoplays.
 */
export type Sfx = 'step' | 'stumble' | 'drink' | 'fall' | 'click' | 'record' | 'milestone' | 'recover' | 'bottle';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastPlay = new Map<Sfx, number>();
  private ambience: { osc: OscillatorNode; gain: GainNode } | null = null;
  muted = false;
  musicOn = true;

  /** Call inside a click/touch handler. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null; // audio unavailable: silently no-op
    }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  setMusic(on: boolean): void {
    this.musicOn = on;
    if (!on) this.stopAmbience();
  }

  /** Low drone + slow LFO. Cheap stand-in for a soundtrack. */
  startAmbience(): void {
    if (!this.ctx || !this.master || this.ambience || !this.musicOn) return;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 55;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.11;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 6;
    lfo.connect(lfoGain).connect(osc.frequency);
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 220;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.12, this.ctx.currentTime, 1.5);
    osc.connect(filt).connect(gain).connect(this.master);
    osc.start();
    lfo.start();
    this.ambience = { osc, gain };
  }

  stopAmbience(): void {
    if (!this.ambience || !this.ctx) return;
    const { osc, gain } = this.ambience;
    gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    osc.stop(this.ctx.currentTime + 2);
    this.ambience = null;
  }

  play(s: Sfx, vol = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const now = ctx.currentTime;
    // Concurrency cap: identical SFX at most every 60ms.
    if (now - (this.lastPlay.get(s) ?? -1) < 0.06) return;
    this.lastPlay.set(s, now);
    const g = ctx.createGain();
    g.connect(this.master);
    const env = (peak: number, a: number, d: number) => {
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peak * vol, now + a);
      g.gain.exponentialRampToValueAtTime(0.001, now + a + d);
    };
    const tone = (type: OscillatorType, f0: number, f1: number, dur: number) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, now);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur);
      o.connect(g);
      o.start(now);
      o.stop(now + dur + 0.05);
    };
    const noise = (dur: number, cutoff: number) => {
      if (!this.noise) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      src.connect(f).connect(g);
      src.start(now);
      src.stop(now + dur);
    };
    switch (s) {
      case 'step':
        env(0.25, 0.005, 0.08);
        noise(0.1, 500);
        break;
      case 'stumble':
        env(0.5, 0.01, 0.25);
        tone('sawtooth', 180, 70, 0.25);
        noise(0.2, 900);
        break;
      case 'recover':
        env(0.3, 0.02, 0.2);
        tone('triangle', 300, 520, 0.18);
        break;
      case 'bottle':
        env(0.35, 0.005, 0.12);
        tone('square', 1400, 900, 0.08);
        break;
      case 'drink':
        env(0.3, 0.05, 0.5);
        tone('sine', 220, 330, 0.5);
        noise(0.4, 400);
        break;
      case 'fall':
        env(0.8, 0.01, 0.6);
        tone('sawtooth', 120, 30, 0.6);
        noise(0.5, 300);
        break;
      case 'click':
        env(0.3, 0.003, 0.06);
        tone('square', 900, 600, 0.05);
        break;
      case 'milestone':
        env(0.35, 0.01, 0.35);
        tone('triangle', 660, 990, 0.3);
        break;
      case 'record':
        env(0.5, 0.01, 0.9);
        tone('triangle', 440, 880, 0.4);
        tone('triangle', 660, 1320, 0.7);
        break;
    }
  }
}
