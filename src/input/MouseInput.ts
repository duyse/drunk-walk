import { GAME_CONFIG } from '../app/GameConfig';
import type { InputSource } from './InputManager';

/** Horizontal cursor offset from screen center → -1..1. Pure mapping is static for tests. */
export class MouseInput implements InputSource {
  readonly name = 'mouse';
  raw = 0;
  active = true;
  private onMove = (e: MouseEvent) => {
    this.raw = MouseInput.map(e.clientX, window.innerWidth);
  };

  attach(): void {
    window.addEventListener('mousemove', this.onMove, { passive: true });
  }
  detach(): void {
    window.removeEventListener('mousemove', this.onMove);
  }

  static map(x: number, width: number): number {
    const half = width * GAME_CONFIG.input.mouseRange;
    return Math.max(-1, Math.min(1, (x - width / 2) / half));
  }
}
