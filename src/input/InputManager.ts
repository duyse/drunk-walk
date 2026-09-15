import { GAME_CONFIG } from '../app/GameConfig';

const I = GAME_CONFIG.input;

/** A source writes a raw -1..1 value into `raw`; the manager blends and smooths. */
export interface InputSource {
  readonly name: string;
  raw: number;
  active: boolean;
  attach(): void;
  detach(): void;
}

/**
 * Mutable runtime input state read directly by the game loop (no event chains).
 * Merges every source into one normalized, deadzoned, smoothed value.
 */
export class InputManager {
  private sources: InputSource[] = [];
  /** Smoothed normalized correction, -1..1. */
  value = 0;
  sensitivity: number = I.sensitivity;
  enabled = true;

  add(source: InputSource): this {
    this.sources.push(source);
    source.attach();
    return this;
  }

  remove(source: InputSource): void {
    source.detach();
    this.sources = this.sources.filter((s) => s !== source);
  }

  get(name: string): InputSource | undefined {
    return this.sources.find((s) => s.name === name);
  }

  /** Which source is currently steering (for HUD hints/debug). */
  get activeSource(): string {
    let best: InputSource | null = null;
    for (const s of this.sources) if (s.active && (!best || Math.abs(s.raw) > Math.abs(best.raw))) best = s;
    return best?.name ?? 'none';
  }

  update(dt: number): number {
    let raw = 0;
    for (const s of this.sources) if (s.active && Math.abs(s.raw) > Math.abs(raw)) raw = s.raw;
    if (!this.enabled) raw = 0;
    const target = InputManager.normalize(raw, this.sensitivity);
    const a = 1 - Math.exp(-I.smoothing * dt);
    this.value += (target - this.value) * a;
    return this.value;
  }

  reset(): void {
    this.value = 0;
    for (const s of this.sources) s.raw = 0;
  }

  detachAll(): void {
    for (const s of this.sources) s.detach();
    this.sources = [];
  }

  /** Deadzone + sensitivity + clamp. Pure, tested. */
  static normalize(raw: number, sensitivity = 1): number {
    const a = Math.abs(raw);
    if (a < I.deadzone) return 0;
    const scaled = ((a - I.deadzone) / (1 - I.deadzone)) * sensitivity;
    return Math.sign(raw) * Math.min(1, scaled);
  }
}
