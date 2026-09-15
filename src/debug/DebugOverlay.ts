import type { GameApp } from '../app/GameApp';
import { $ } from '../ui/Screens';

/** ?debug=true panel. Text rebuilt at 10 Hz; nothing here runs in production. */
export class DebugOverlay {
  private el = $('debug');
  private text = document.createElement('div');
  private acc = 0;

  constructor(private app: GameApp) {
    this.el.style.display = 'block';
    this.el.appendChild(this.text);
    const btn = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = fn;
      this.el.appendChild(b);
    };
    btn('stumble', () => app.forceStumble());
    btn('fall', () => app.forceFall());
    btn('sober', () => {
      app.session.drinkIntox = 0;
      app.session.distance = 0;
    });
    btn('drunk', () => (app.session.drinkIntox = 1));
    btn('god', () => (app.session.godmode = !app.session.godmode));
  }

  update(fps: number): void {
    this.acc++;
    if (this.acc % 6 !== 0) return;
    const s = this.app.session;
    this.text.textContent = [
      `state        ${this.app.state.current}`,
      `fps          ${fps.toFixed(0)}`,
      `distance     ${s.distance.toFixed(1)} m`,
      `score        ${s.score}`,
      `angle        ${s.balance.angle.toFixed(1)}°`,
      `angVel       ${s.balance.angularVelocity.toFixed(1)}°/s`,
      `intox        ${s.intoxication.toFixed(3)}`,
      `speed        ${s.walkingSpeed.toFixed(2)} m/s`,
      `input        ${s.input.toFixed(2)} (${this.app.activeInput})`,
      `wobble       ${s.motion.wobbleTorque.toFixed(1)}`,
      `stumble      ${s.motion.stumble ? s.motion.stumble.timer.toFixed(2) : '-'}`,
      `drink        ${s.drinkProgress >= 0 ? s.drinkProgress.toFixed(2) : `in ${s.drinkTimer.toFixed(1)}s`}`,
      `fallTimer    ${s.balance.fallTimer.toFixed(2)}`,
      `segments     ${this.app.roadSegments}`,
      `godmode      ${s.godmode}`,
    ].join('\n');
  }
}
