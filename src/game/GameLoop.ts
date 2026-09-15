/** rAF loop with clamped delta and a fixed-step accumulator for physics. */
export class GameLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  running = false;
  /** Global time scale (slow-mo during the fall). */
  timeScale = 1;
  fps = 60;
  private fpsAcc = 0;
  private fpsN = 0;

  constructor(
    private fixedStep: number,
    private onFixed: (dt: number) => void,
    private onFrame: (dt: number) => void,
    private maxDelta = 0.1,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      let dt = (now - this.last) / 1000;
      this.last = now;
      if (dt > this.maxDelta) dt = this.maxDelta;
      this.fpsAcc += dt;
      this.fpsN++;
      if (this.fpsAcc >= 0.5) {
        this.fps = this.fpsN / this.fpsAcc;
        this.fpsAcc = 0;
        this.fpsN = 0;
      }
      const scaled = dt * this.timeScale;
      this.acc += scaled;
      let steps = 0;
      while (this.acc >= this.fixedStep && steps < 8) {
        this.onFixed(this.fixedStep);
        this.acc -= this.fixedStep;
        steps++;
      }
      if (steps === 8) this.acc = 0; // spiral-of-death guard
      this.onFrame(scaled);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Call after a pause so the next frame doesn't get a giant delta. */
  resync(): void {
    this.last = performance.now();
    this.acc = 0;
  }
}
