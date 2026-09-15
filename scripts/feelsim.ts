// 60 Hz headless feel simulation: a "human" controller with reaction delay,
// noise, and limited gain plays the real GameSession. Reports survival time
// and distance per skill level, plus whether holding one side / idling fails.
import { GameSession } from '../src/game/GameSession.ts';
import { GAME_CONFIG } from '../src/app/GameConfig.ts';

const DT = GAME_CONFIG.physics.fixedStep;
const STEP = 1 / 60;

function playRun({ delayMs, kp, kd, noise, seed, maxSeconds = 600, policy = 'human' }) {
  const s = new GameSession();
  s.reset(seed);
  const delaySteps = Math.round(delayMs / 1000 / STEP);
  const hist = [];
  let input = 0;
  let rnd = seed * 7 + 1;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  let t = 0;
  let maxIntox = 0;
  while (t < maxSeconds && !s.fallen) {
    hist.push({ a: s.balance.angle, v: s.balance.angularVelocity });
    const obs = hist[Math.max(0, hist.length - 1 - delaySteps)];
    let target;
    if (policy === 'hold') target = 1;
    else if (policy === 'idle') target = 0;
    else target = -(obs.a * kp + obs.v * kd) + rand() * noise;
    target = Math.max(-1, Math.min(1, target));
    input += (target - input) * (1 - Math.exp(-GAME_CONFIG.input.smoothing * STEP)); // same smoothing as InputManager
    for (let k = 0; k < STEP / DT; k++) s.step(DT, input);
    t += STEP;
    maxIntox = Math.max(maxIntox, s.intoxication);
  }
  return { t: +t.toFixed(1), dist: Math.round(s.distance), intox: +maxIntox.toFixed(2), fell: s.fallen };
}

const levels = {
  clumsy: { delayMs: 260, kp: 0.05, kd: 0.008, noise: 0.25 },
  decent: { delayMs: 180, kp: 0.07, kd: 0.012, noise: 0.15 },
  good: { delayMs: 130, kp: 0.09, kd: 0.016, noise: 0.08 },
  expert: { delayMs: 90, kp: 0.11, kd: 0.02, noise: 0.04 },
};
for (const [name, cfg] of Object.entries(levels)) {
  const runs = [1, 2, 3, 4, 5].map((seed) => playRun({ ...cfg, seed }));
  const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[2];
  console.log(name.padEnd(8), 'median survive', med('t') + 's', 'median dist', med('dist') + 'm', 'runs:', runs.map((r) => `${r.t}s/${r.dist}m/i${r.intox}`).join(' '));
}
console.log('hold-right', playRun({ seed: 1, policy: 'hold', delayMs: 0, kp: 0, kd: 0, noise: 0 }));
console.log('idle      ', playRun({ seed: 1, policy: 'idle', delayMs: 0, kp: 0, kd: 0, noise: 0 }));
