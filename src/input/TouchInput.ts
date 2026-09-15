import type { InputSource } from './InputManager';

/**
 * Touch fallback: drag horizontally from the touch-down point. Full correction
 * at `range` px of drag. Releasing returns to neutral.
 */
export class TouchInput implements InputSource {
  readonly name = 'touch';
  raw = 0;
  active = false;
  private startX = 0;
  private id: number | null = null;

  constructor(private el: HTMLElement, private range = 120) {}

  private onStart = (e: TouchEvent) => {
    if (this.id !== null) return;
    const t = e.changedTouches[0];
    this.id = t.identifier;
    this.startX = t.clientX;
    this.raw = 0;
  };
  private onMove = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.id) this.raw = TouchInput.map(t.clientX - this.startX, this.range);
    }
    if (e.cancelable) e.preventDefault();
  };
  private onEnd = (e: TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === this.id) {
        this.id = null;
        this.raw = 0;
      }
    }
  };

  attach(): void {
    this.el.addEventListener('touchstart', this.onStart, { passive: true });
    this.el.addEventListener('touchmove', this.onMove, { passive: false });
    this.el.addEventListener('touchend', this.onEnd);
    this.el.addEventListener('touchcancel', this.onEnd);
  }
  detach(): void {
    this.el.removeEventListener('touchstart', this.onStart);
    this.el.removeEventListener('touchmove', this.onMove);
    this.el.removeEventListener('touchend', this.onEnd);
    this.el.removeEventListener('touchcancel', this.onEnd);
    this.id = null;
    this.raw = 0;
  }

  static map(dx: number, range: number): number {
    return Math.max(-1, Math.min(1, dx / range));
  }
}
