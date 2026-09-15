import { GAME_CONFIG } from '../app/GameConfig';

const smoothstep = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

/**
 * Distance → intoxication (0..1). Fast early ramp then long tail so late-game
 * stays survivable: sqrt shape eased with smoothstep.
 */
export function intoxicationFor(distance: number): number {
  const t = Math.sqrt(Math.max(0, distance) / GAME_CONFIG.intoxication.progressionDistance);
  return smoothstep(t);
}

export function walkingSpeedFor(intoxication: number): number {
  const w = GAME_CONFIG.walking;
  // Speeds up a little, then stumbles slow him slightly at the very end.
  const t = Math.sin(intoxication * Math.PI * 0.6);
  return w.baseSpeed + (w.maxSpeed - w.baseSpeed) * t;
}
