import { GAME_CONFIG } from '../app/GameConfig';

const P = GAME_CONFIG.physics;
const S = GAME_CONFIG.stumble;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Small seeded PRNG (mulberry32) so runs are reproducible in debug. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1D value noise: interpolates between random lattice values. */
class ValueNoise {
  private vals: number[] = [];
  constructor(rng: () => number) {
    for (let i = 0; i < 256; i++) this.vals.push(rng() * 2 - 1);
  }
  at(t: number): number {
    const i = Math.floor(t);
    const f = t - i;
    const s = f * f * (3 - 2 * f);
    const a = this.vals[i & 255];
    const b = this.vals[(i + 1) & 255];
    return a + (b - a) * s;
  }
}

export interface StumbleEvent {
  /** Seconds until the shove lands (telegraph phase while > 0). */
  timer: number;
  impulse: number; // deg/s, signed
  fired: boolean;
}

/**
 * Generates continuous drunk torque + scheduled stumble impulses.
 * Output has continuity (noise + drifting sines), never per-frame jitter.
 */
export class DrunkMotion {
  private rng: () => number;
  private noise: ValueNoise;
  private t = 0;
  private phase = [0, 0, 0];
  private nextStumbleIn: number = S.baseInterval;
  stumble: StumbleEvent | null = null;
  /** Temporary multiplier (e.g. after drinking). */
  extraWobble = 1;
  extraWobbleTimer = 0;
  wobbleTorque = 0;
  /** Set when a stumble telegraph begins (animator/audio consume it). */
  onStumbleStart: ((impulse: number) => void) | null = null;

  constructor(seed = 1) {
    this.rng = makeRng(seed);
    this.noise = new ValueNoise(this.rng);
  }

  reset(seed?: number): void {
    if (seed !== undefined) {
      this.rng = makeRng(seed);
      this.noise = new ValueNoise(this.rng);
    }
    this.t = 0;
    this.phase = [0, 0, 0];
    this.nextStumbleIn = S.baseInterval * 0.6;
    this.stumble = null;
    this.extraWobble = 1;
    this.extraWobbleTimer = 0;
    this.wobbleTorque = 0;
  }

  boostWobble(mult: number, seconds: number): void {
    this.extraWobble = mult;
    this.extraWobbleTimer = seconds;
  }

  /** Returns the impulse (deg/s) to apply this step, usually 0. */
  update(dt: number, intoxication: number, currentAngle: number): number {
    this.t += dt;
    const k = intoxication;

    // Low-frequency sways with slowly drifting frequencies.
    this.phase[0] += dt * (0.55 + 0.25 * k);
    this.phase[1] += dt * (0.9 + 0.5 * k);
    this.phase[2] += dt * (1.7 + 0.9 * k);
    const sway =
      Math.sin(this.phase[0]) * 0.6 + Math.sin(this.phase[1] * 1.3 + 1.7) * 0.3 + Math.sin(this.phase[2] + 0.4) * 0.15;
    const n = this.noise.at(this.t * (0.8 + 1.4 * k)) * 0.8 + this.noise.at(this.t * 3.1 + 40) * 0.25;

    if (this.extraWobbleTimer > 0) {
      this.extraWobbleTimer -= dt;
      if (this.extraWobbleTimer <= 0) this.extraWobble = 1;
    }
    const amp = lerp(P.wobbleAmp, P.wobbleAmpDrunk, k) * this.extraWobble;
    // Bias slightly away from whichever side he's already on? No — that would be
    // a hidden helper. Keep it honest: pure noise.
    this.wobbleTorque = (sway + n) * amp;

    // Stumble scheduling.
    let impulse = 0;
    if (this.stumble) {
      this.stumble.timer -= dt;
      if (this.stumble.timer <= 0 && !this.stumble.fired) {
        this.stumble.fired = true;
        impulse = this.stumble.impulse;
      }
      if (this.stumble.timer < -0.6) this.stumble = null;
    } else {
      this.nextStumbleIn -= dt;
      if (this.nextStumbleIn <= 0) {
        const mag = lerp(S.baseImpulse, S.maxImpulse, k) * (0.7 + this.rng() * 0.3);
        // Fairness: never shove further in the direction he is already far over.
        let dir = this.rng() < 0.5 ? -1 : 1;
        if (Math.abs(currentAngle) > P.dangerAngle * 0.7) dir = -Math.sign(currentAngle) || dir;
        this.stumble = { timer: S.telegraph, impulse: mag * dir, fired: false };
        this.onStumbleStart?.(mag * dir);
        const interval = Math.max(S.minInterval, lerp(S.baseInterval, S.minInterval, k));
        this.nextStumbleIn = interval * (0.7 + this.rng() * 0.6);
      }
    }
    return impulse;
  }

  /** 0..1 while a stumble is being telegraphed (arms flare). */
  get telegraph(): number {
    if (!this.stumble || this.stumble.fired) return 0;
    return 1 - this.stumble.timer / S.telegraph;
  }

  forceStumble(): void {
    this.nextStumbleIn = 0;
    this.stumble = null;
  }
}
