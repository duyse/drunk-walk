import { GAME_CONFIG } from '../app/GameConfig';
import type { ScoreEntry } from '../leaderboard/LeaderboardService';

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

export const fmt = (n: number): string => Math.floor(n).toLocaleString('en-US');

/** Show exactly one overlay screen (or none). */
export class ScreenRouter {
  private ids = ['menu', 'tutorial', 'calib', 'hud', 'pause', 'gameover', 'leaderboard', 'settings'];
  show(...ids: string[]): void {
    for (const id of this.ids) $(id).classList.toggle('on', ids.includes(id));
  }
}

/** HUD: text updated at a throttled rate; meter dot every frame (one transform write). */
export class GameHUD {
  private dist = $('hud-distance');
  private score = $('hud-score');
  private dot = $('meter').querySelector('i')!;
  private toast = $('toast');
  private hint = $('hint');
  private acc = 0;
  private toastTimer = 0;
  private lastDist = -1;
  private lastScore = -1;

  update(dt: number, distance: number, score: number, angle: number): void {
    this.acc += dt;
    if (this.acc >= 1 / GAME_CONFIG.hudUpdateHz) {
      this.acc = 0;
      const d = Math.floor(distance);
      if (d !== this.lastDist) this.dist.textContent = `${fmt(d)} m`;
      if (score !== this.lastScore) this.score.textContent = fmt(score);
      this.lastDist = d;
      this.lastScore = score;
    }
    const half = $('meter').clientWidth / 2;
    const x = Math.max(-1, Math.min(1, angle / GAME_CONFIG.physics.fallAngle)) * half;
    this.dot.style.transform = `translateX(${x.toFixed(1)}px) rotate(45deg)`;
    const danger = Math.abs(angle) / GAME_CONFIG.physics.fallAngle;
    const cls = danger > 0.78 ? 'danger' : danger > 0.55 ? 'warn' : '';
    if (this.dot.className !== cls) this.dot.className = cls;
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('on');
    }
  }

  showToast(text: string, seconds = 1.4, record = false): void {
    this.toast.textContent = text;
    this.toast.classList.toggle('record', record);
    this.toast.classList.add('on');
    this.toastTimer = seconds;
  }

  showHint(text: string, seconds = 3): void {
    this.hint.textContent = text;
    this.hint.classList.add('on');
    setTimeout(() => this.hint.classList.remove('on'), seconds * 1000);
  }

  reset(): void {
    this.lastDist = this.lastScore = -1;
    this.dist.textContent = '0 m';
    this.score.textContent = '0';
    this.toast.classList.remove('on');
    this.toastTimer = 0;
  }
}

export function renderLeaderboard(entries: ScoreEntry[], playerName: string | null, playerScore: number | null): void {
  const tbody = $('lb-list');
  tbody.replaceChildren(); // textContent-only rows: no HTML injection possible
  let highlighted = false;
  entries.forEach((e, i) => {
    const tr = document.createElement('tr');
    const isMe = !highlighted && e.name === playerName && (playerScore === null || e.score === playerScore);
    if (isMe) {
      tr.className = 'me';
      highlighted = true;
    }
    for (const [text, cls] of [
      [`#${i + 1}`, ''],
      [e.name, ''],
      [fmt(e.score), 'num'],
    ] as const) {
      const td = document.createElement('td');
      td.textContent = text;
      if (cls) td.className = cls;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  if (entries.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = 'No scores yet.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}
