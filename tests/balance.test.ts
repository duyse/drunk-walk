import { describe, expect, it } from 'vitest';
import { BalanceController } from '../src/player/BalanceController';
import { DrunkMotion } from '../src/player/DrunkMotion';
import { GAME_CONFIG } from '../src/app/GameConfig';

const DT = GAME_CONFIG.physics.fixedStep;
const run = (b: BalanceController, seconds: number, input: number, intox = 0, wobble = 0) => {
  for (let t = 0; t < seconds; t += DT) b.step(DT, { input, intoxication: intox, wobbleTorque: wobble, impulse: 0 });
};

describe('BalanceController', () => {
  it('stays neutral with zero input at exact neutral', () => {
    const b = new BalanceController();
    run(b, 3, 0);
    expect(Math.abs(b.angle)).toBeLessThan(1e-6);
    expect(b.fallen).toBe(false);
  });

  it('positive input pushes toward the right (+angle), negative toward the left', () => {
    const r = new BalanceController();
    run(r, 0.5, 1);
    expect(r.angle).toBeGreaterThan(0);
    const l = new BalanceController();
    run(l, 0.5, -1);
    expect(l.angle).toBeLessThan(0);
  });

  it('counter-steering recovers a lean', () => {
    const b = new BalanceController();
    b.angle = -15; // leaning left
    run(b, 0.6, 1); // push right
    expect(b.angle).toBeGreaterThan(-15);
  });

  it('damps angular velocity when no forces act', () => {
    const b = new BalanceController();
    b.angularVelocity = 50;
    const before = b.angularVelocity;
    // Gravity term is zero at angle 0 only momentarily; measure a short window.
    b.step(DT, { input: 0, intoxication: 0, wobbleTorque: 0, impulse: 0 });
    expect(Math.abs(b.angularVelocity)).toBeLessThan(before + 0.5);
    expect(b.angularVelocity).toBeLessThan(before);
  });

  it('upright is unstable: a small lean grows without correction', () => {
    const b = new BalanceController();
    b.angle = 2;
    run(b, 2, 0);
    expect(b.angle).toBeGreaterThan(2);
  });

  it('falls only after the grace period beyond fallAngle', () => {
    const b = new BalanceController();
    b.angle = GAME_CONFIG.physics.fallAngle + 1;
    b.step(DT, { input: 0, intoxication: 0, wobbleTorque: 0, impulse: 0 });
    expect(b.fallen).toBe(false);
    run(b, GAME_CONFIG.physics.fallGrace + 0.1, 0);
    expect(b.fallen).toBe(true);
  });

  it('intoxication makes the same wobble produce a larger lean', () => {
    const sober = new BalanceController();
    const drunk = new BalanceController();
    run(sober, 1, 0, 0, 20);
    run(drunk, 1, 0, 1, 20);
    expect(Math.abs(drunk.angle)).toBeGreaterThan(Math.abs(sober.angle));
  });

  it('clamps angular acceleration and velocity (no explosions)', () => {
    const b = new BalanceController();
    run(b, 1, 1, 1, 100000);
    expect(Math.abs(b.angularVelocity)).toBeLessThanOrEqual(GAME_CONFIG.physics.maxAngularVel);
  });
});

describe('DrunkMotion', () => {
  it('is deterministic for a seed and produces continuous torque', () => {
    const a = new DrunkMotion(42);
    const b = new DrunkMotion(42);
    let maxJump = 0;
    let prev = 0;
    for (let i = 0; i < 600; i++) {
      a.update(DT, 0.5, 0);
      b.update(DT, 0.5, 0);
      expect(a.wobbleTorque).toBe(b.wobbleTorque);
      if (i > 0) maxJump = Math.max(maxJump, Math.abs(a.wobbleTorque - prev));
      prev = a.wobbleTorque;
    }
    expect(maxJump).toBeLessThan(5); // no frame-to-frame jitter spikes
  });

  it('schedules stumbles more often when drunk', () => {
    const count = (k: number) => {
      const m = new DrunkMotion(7);
      let n = 0;
      m.onStumbleStart = () => n++;
      for (let t = 0; t < 120; t += DT) m.update(DT, k, 0);
      return n;
    };
    expect(count(1)).toBeGreaterThan(count(0));
  });
});
