import { GAME_CONFIG } from '../app/GameConfig';
import type { InputSource } from './InputManager';

/** A/D and arrows. Ramps toward ±1 so taps give small corrections. */
export class KeyboardInput implements InputSource {
  readonly name = 'keyboard';
  raw = 0;
  active = true;
  private left = false;
  private right = false;

  private onKey = (e: KeyboardEvent) => {
    const down = e.type === 'keydown';
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.left = down;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.right = down;
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  attach(): void {
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
  }
  detach(): void {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    this.left = this.right = false;
  }

  /** Called from the loop so the ramp is frame-rate independent. */
  update(dt: number): void {
    const target = (this.right ? 1 : 0) - (this.left ? 1 : 0);
    const a = 1 - Math.exp(-GAME_CONFIG.input.keyboardRamp * dt);
    this.raw += (target - this.raw) * a;
    if (Math.abs(this.raw) < 0.01 && target === 0) this.raw = 0;
  }
}
