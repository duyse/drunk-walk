import { GAME_CONFIG } from '../app/GameConfig';

const P = GAME_CONFIG.physics;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface BalanceInput {
  /** -1..1 corrective input. Positive pushes the body toward the RIGHT (+angle). */
  input: number;
  intoxication: number; // 0..1
  /** Continuous drunk torque, deg/s² (from DrunkMotion). */
  wobbleTorque: number;
  /** One-shot angular velocity impulse, deg/s. */
  impulse: number;
}

/**
 * Pure inverted-pendulum arcade balance. Angle > 0 = leaning RIGHT.
 * Upright is an unstable equilibrium: gravity amplifies any lean, so the player
 * must actively counter-steer. Holding one side or idling both fail.
 */
export class BalanceController {
  angle = 0; // degrees
  angularVelocity = 0; // deg/s
  fallTimer = 0;
  fallen = false;

  reset(): void {
    this.angle = 0;
    this.angularVelocity = 0;
    this.fallTimer = 0;
    this.fallen = false;
  }

  step(dt: number, b: BalanceInput): void {
    if (this.fallen) return;
    const k = b.intoxication;
    const gravity = lerp(P.gravityGain, P.gravityGainDrunk, k) * this.angle;
    const correction = b.input * lerp(P.inputStrength, P.inputStrengthDrunk, k);
    let accel = gravity + b.wobbleTorque + correction;
    accel = Math.max(-P.maxAngularAccel, Math.min(P.maxAngularAccel, accel));

    this.angularVelocity += accel * dt + b.impulse;
    // Damping is specified per fixed step; rescale for the actual dt.
    const damp = Math.pow(lerp(P.damping, P.dampingDrunk, k), dt / P.fixedStep);
    this.angularVelocity *= damp;
    this.angularVelocity = Math.max(-P.maxAngularVel, Math.min(P.maxAngularVel, this.angularVelocity));

    this.angle += this.angularVelocity * dt;

    if (Math.abs(this.angle) > P.fallAngle) {
      this.fallTimer += dt;
      if (this.fallTimer >= P.fallGrace) this.fallen = true;
    } else {
      this.fallTimer = Math.max(0, this.fallTimer - dt * 2);
    }
  }

  /** 0..1 how close to the fall threshold. */
  get danger(): number {
    return Math.min(1, Math.abs(this.angle) / P.fallAngle);
  }
}
