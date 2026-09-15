import { GAME_CONFIG } from '../app/GameConfig';
import type { InputSource } from './InputManager';

export type SensorStatus = 'unsupported' | 'needs-permission' | 'denied' | 'ready' | 'no-data';

/**
 * Tilt-to-balance. Reads DeviceOrientation, subtracts a calibrated neutral
 * baseline, converts to -1..1. Picks gamma (portrait) or beta (landscape).
 */
export class DeviceOrientationInput implements InputSource {
  readonly name = 'tilt';
  raw = 0;
  active = false;
  status: SensorStatus = 'unsupported';
  private baseline = 0;
  private lastTilt = 0;
  private samples = 0;

  private onOrient = (e: DeviceOrientationEvent) => {
    const tilt = DeviceOrientationInput.tiltFrom(e.beta, e.gamma, screenAngle());
    if (tilt === null) return;
    this.samples++;
    this.lastTilt = tilt;
    if (this.status === 'needs-permission' || this.status === 'unsupported') this.status = 'ready';
    if (this.active) this.raw = DeviceOrientationInput.map(tilt, this.baseline, GAME_CONFIG.input.tiltRange);
  };

  static get supported(): boolean {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  }

  static get needsPermission(): boolean {
    const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent;
    return typeof D?.requestPermission === 'function';
  }

  /** Must be called from a user gesture on iOS. */
  async requestPermission(): Promise<SensorStatus> {
    if (!DeviceOrientationInput.supported) return (this.status = 'unsupported');
    if (DeviceOrientationInput.needsPermission) {
      try {
        const D = (window as unknown as { DeviceOrientationEvent: { requestPermission: () => Promise<string> } })
          .DeviceOrientationEvent;
        const res = await D.requestPermission();
        if (res !== 'granted') return (this.status = 'denied');
      } catch {
        return (this.status = 'denied');
      }
    }
    this.status = 'ready';
    this.attach();
    return this.status;
  }

  /** Resolves true if any orientation sample arrived within `ms`. */
  waitForData(ms = 900): Promise<boolean> {
    const start = this.samples;
    return new Promise((resolve) => {
      const t0 = performance.now();
      const tick = () => {
        if (this.samples > start) return resolve(true);
        if (performance.now() - t0 > ms) {
          this.status = 'no-data';
          return resolve(false);
        }
        requestAnimationFrame(tick);
      };
      tick();
    });
  }

  /** Save the current tilt as neutral. */
  calibrate(): void {
    this.baseline = this.lastTilt;
    this.raw = 0;
  }

  attach(): void {
    if (!DeviceOrientationInput.supported) return;
    window.addEventListener('deviceorientation', this.onOrient, { passive: true });
    if (this.status === 'unsupported') this.status = DeviceOrientationInput.needsPermission ? 'needs-permission' : 'ready';
  }
  detach(): void {
    window.removeEventListener('deviceorientation', this.onOrient);
    this.raw = 0;
  }

  /** Pure: choose the axis that represents left/right tilt for the screen orientation. */
  static tiltFrom(beta: number | null, gamma: number | null, angle: number): number | null {
    if (beta === null || gamma === null) return null;
    switch (angle) {
      case 90:
        return beta;
      case -90:
      case 270:
        return -beta;
      case 180:
        return -gamma;
      default:
        return gamma;
    }
  }

  /** Pure: relative tilt → -1..1 with clamp. */
  static map(tilt: number, baseline: number, range: number): number {
    let d = tilt - baseline;
    // gamma wraps at ±90 when the phone flips; keep it continuous.
    if (d > 90) d -= 180;
    if (d < -90) d += 180;
    return Math.max(-1, Math.min(1, d / range));
  }
}

function screenAngle(): number {
  const o = screen.orientation?.angle;
  if (typeof o === 'number') return o;
  const w = (window as unknown as { orientation?: number }).orientation;
  return typeof w === 'number' ? w : 0;
}
