import { describe, expect, it } from 'vitest';
import { GameSession } from '../src/game/GameSession';
import { intoxicationFor } from '../src/game/DifficultyManager';
import { GAME_CONFIG } from '../src/app/GameConfig';

const DT = GAME_CONFIG.physics.fixedStep;

describe('GameSession scoring', () => {
  it('distance and score increase monotonically and stay consistent', () => {
    const s = new GameSession();
    s.reset(1);
    s.godmode = true;
    let lastD = 0;
    for (let t = 0; t < 5; t += DT) {
      s.step(DT, -Math.sign(s.balance.angle));
      expect(s.distance).toBeGreaterThanOrEqual(lastD);
      lastD = s.distance;
      expect(s.score).toBe(Math.floor(s.distance * GAME_CONFIG.scoring.scorePerMeter));
    }
    expect(s.distance).toBeGreaterThan(5 * GAME_CONFIG.walking.baseSpeed * 0.9);
  });

  it('reset clears all run state', () => {
    const s = new GameSession();
    s.reset(1);
    for (let t = 0; t < 30; t += DT) s.step(DT, 0);
    s.reset(2);
    expect(s.distance).toBe(0);
    expect(s.score).toBe(0);
    expect(s.intoxication).toBe(0);
    expect(s.balance.angle).toBe(0);
    expect(s.fallen).toBe(false);
    expect(s.drinkProgress).toBe(-1);
  });

  it('intoxication curve is monotonic and clamped', () => {
    let prev = 0;
    for (let d = 0; d <= 5000; d += 50) {
      const k = intoxicationFor(d);
      expect(k).toBeGreaterThanOrEqual(prev);
      expect(k).toBeLessThanOrEqual(1);
      prev = k;
    }
    expect(intoxicationFor(0)).toBe(0);
    expect(intoxicationFor(GAME_CONFIG.intoxication.progressionDistance)).toBeCloseTo(1, 5);
  });
});
