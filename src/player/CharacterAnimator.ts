import { GAME_CONFIG } from '../app/GameConfig';
import type { CharacterRig, Face } from './CharacterRig';

const D2R = Math.PI / 180;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const P = GAME_CONFIG.physics;

export interface AnimState {
  angle: number; // deg, +right
  angularVelocity: number; // deg/s
  intoxication: number;
  walkPhase: number; // radians, advances with distance
  stumbleTelegraph: number; // 0..1
  /** 0..1 progress of a drink, or -1 when not drinking. */
  drink: number;
  /** 0..1 progress of the fall sequence, or -1 when upright. */
  fall: number;
  /** Seconds since last big recovery (for the "I'm fine" pose), Infinity if none. */
  sinceRecovery: number;
  idle: boolean; // menu demo
}

/**
 * Procedural layers: walk cycle + lean split across body + arm compensation
 * + head lag + drink + fall + recovery. No keyframes.
 */
export class CharacterAnimator {
  private headLag = 0;
  private torsoLag = 0;
  private armFlail = 0;
  private t = 0;
  private fallDir = 1;
  private lastStepSide = 0;
  onStep: ((side: number, hard: boolean) => void) | null = null;

  constructor(private rig: CharacterRig) {}

  reset(): void {
    this.headLag = this.torsoLag = this.armFlail = 0;
    this.t = 0;
    this.lastStepSide = 0;
    this.rig.bottle.visible = false;
    this.rig.root.rotation.set(0, 0, 0);
    this.rig.root.position.set(0, 0, 0);
    this.rig.setFace('relaxed');
  }

  update(dt: number, s: AnimState): void {
    this.t += dt;
    const r = this.rig;
    const k = s.intoxication;
    const lean = s.angle * D2R;
    const vel = s.angularVelocity;
    const danger = clamp01(Math.abs(s.angle) / P.fallAngle);

    // --- Lag: head and torso trail the pelvis (comedy + readability).
    this.torsoLag += (lean - this.torsoLag) * Math.min(1, dt * 9);
    this.headLag += (this.torsoLag - this.headLag) * Math.min(1, dt * 6);

    // --- Walk cycle. Irregular stride when drunk.
    const ph = s.walkPhase;
    const irregular = Math.sin(ph * 0.37 + this.t * 0.4) * 0.5 * k;
    const swing = s.idle ? 0 : Math.sin(ph + irregular);
    const stride = s.idle ? 0 : 0.55 + 0.25 * k;
    const bob = s.idle ? Math.sin(this.t * 1.6) * 0.008 : Math.abs(Math.cos(ph + irregular)) * 0.045 + 0.01 * k;

    // Step callback when the swing crosses zero.
    const side = swing > 0 ? 1 : -1;
    if (!s.idle && side !== this.lastStepSide && s.fall < 0) {
      this.lastStepSide = side;
      this.onStep?.(side, danger > 0.5);
    }

    // --- Fall sequence overrides most layers.
    if (s.fall >= 0) {
      this.animateFall(dt, s, swing);
      return;
    }

    // --- Root: whole body tilt is split — pelvis gets ~35 %, torso the rest.
    const pelvisLean = lean * 0.35;
    r.root.position.y = bob;
    r.root.position.x = Math.sin(lean) * 0.12; // hips drift under the lean
    r.root.rotation.z = -pelvisLean;
    r.root.rotation.y = Math.sin(this.t * 0.9) * 0.06 * k;
    r.pelvis.rotation.z = -pelvisLean * 0.4;
    r.pelvis.rotation.x = 0.05 + 0.08 * k;

    // Torso: remaining lean + drunk sway + drifting.
    const sway = Math.sin(this.t * 1.1) * 0.05 * k + Math.sin(this.t * 2.3 + 1) * 0.03 * k;
    r.torso.rotation.z = -(this.torsoLag - pelvisLean) * 0.9 + sway;
    r.torso.rotation.x = 0.06 + Math.sin(ph * 2) * 0.02 + 0.1 * k;
    r.torso.rotation.y = swing * 0.12;

    // Head: lags further, bobs more when drunk, tips into the lean.
    const headBob = Math.sin(this.t * 3.1) * 0.06 * k + Math.sin(this.t * 0.6) * 0.1 * k;
    r.head.rotation.z = -(this.headLag - this.torsoLag) * 1.4 + headBob - lean * 0.25;
    r.head.rotation.x = -0.08 + Math.sin(this.t * 1.9) * 0.08 * k + danger * 0.15;
    r.head.rotation.y = Math.sin(this.t * 0.8) * 0.15 * k;

    // --- Legs: walk swing; when leaning, the outside leg plants wide.
    const legAmp = stride;
    const plant = Math.sin(lean) * 0.6; // spread toward the lean
    r.lLeg.rotation.x = swing * legAmp;
    r.rLeg.rotation.x = -swing * legAmp;
    r.lLeg.rotation.z = 0.05 + Math.max(0, -plant) * 1.2 + (s.idle ? 0.12 : 0);
    r.rLeg.rotation.z = -0.05 - Math.max(0, plant) * 1.2 - (s.idle ? 0.12 : 0);
    const kneeL = Math.max(0, -swing) * (0.9 + 0.5 * k) + danger * 0.5;
    const kneeR = Math.max(0, swing) * (0.9 + 0.5 * k) + danger * 0.5;
    r.lShin.rotation.x = -kneeL;
    r.rShin.rotation.x = -kneeR;
    // Feet stay grounded: counter-rotate root lean so the planted foot points down.
    r.lLeg.rotation.z += pelvisLean * 0.5;
    r.rLeg.rotation.z += pelvisLean * 0.5;

    // --- Arms: relaxed swing → extend with |lean| → flail with |vel| / telegraph.
    const flailTarget = clamp01(Math.abs(vel) / 90) * 0.8 + s.stumbleTelegraph + danger * 0.6;
    this.armFlail += (flailTarget - this.armFlail) * Math.min(1, dt * 10);
    const extend = clamp01(Math.abs(s.angle) / 28); // arms come up as he tips
    const flap = Math.sin(this.t * 22) * this.armFlail * 0.5;
    const armSwing = swing * 0.5 * (1 - extend);

    // Arm on the falling side drops, other arm shoots out — that's how people balance.
    const leanSign = Math.sign(s.angle) || 0;
    const outL = extend * (leanSign > 0 ? 1.6 : 0.5);
    const outR = extend * (leanSign < 0 ? 1.6 : 0.5);

    r.lArm.rotation.x = armSwing + flap;
    r.rArm.rotation.x = -armSwing - flap;
    r.lArm.rotation.z = 0.15 + outL + this.armFlail * 0.8 + Math.abs(flap) * 0.5 + 0.1 * k;
    r.rArm.rotation.z = -0.15 - outR - this.armFlail * 0.8 - Math.abs(flap) * 0.5 - 0.1 * k;
    r.lForearm.rotation.x = -0.3 - extend * 0.4 - this.armFlail * 0.6;
    r.rForearm.rotation.x = -0.3 - extend * 0.4 - this.armFlail * 0.6;
    r.lForearm.rotation.z = -0.1;
    r.rForearm.rotation.z = 0.1;

    // "I'm fine" pose right after a save: shoulders back, arms tucked, grin.
    const okay = s.sinceRecovery < 1.2 ? 1 - s.sinceRecovery / 1.2 : 0;
    if (okay > 0) {
      r.lArm.rotation.z = lerp(r.lArm.rotation.z, 0.25, okay * 0.8);
      r.rArm.rotation.z = lerp(r.rArm.rotation.z, -0.25, okay * 0.8);
      r.torso.rotation.x -= okay * 0.15;
      r.head.rotation.x -= okay * 0.1;
    }

    // --- Drinking layer: right arm brings bottle to mouth, head tips back.
    if (s.drink >= 0) {
      r.bottle.visible = true;
      const p = s.drink;
      // 0-0.25 raise, 0.25-0.75 drink, 0.75-1 lower
      const raise = p < 0.25 ? p / 0.25 : p > 0.75 ? 1 - (p - 0.75) / 0.25 : 1;
      const e = raise * raise * (3 - 2 * raise);
      const miss = Math.sin(p * 30) * 0.06 * k; // wobbly aim
      r.rArm.rotation.x = lerp(r.rArm.rotation.x, -1.5, e);
      r.rArm.rotation.z = lerp(r.rArm.rotation.z, -0.5 + miss, e);
      r.rForearm.rotation.x = lerp(r.rForearm.rotation.x, -2.3, e);
      r.rForearm.rotation.z = lerp(r.rForearm.rotation.z, 0.35, e);
      const sip = p > 0.25 && p < 0.75 ? 1 : 0;
      r.head.rotation.x -= e * 0.55 * (0.5 + sip * 0.5);
      r.bottle.rotation.x = -e * 1.2;
    } else {
      r.bottle.visible = false;
      r.bottle.rotation.x = 0;
    }

    // --- Face.
    r.setFace(this.pickFace(s, danger, okay));
  }

  private pickFace(s: AnimState, danger: number, okay: number): Face {
    if (s.drink >= 0 && s.drink > 0.2 && s.drink < 0.8) return 'silly';
    if (danger > 0.85) return 'shocked';
    if (danger > 0.55 || s.stumbleTelegraph > 0) return 'panic';
    if (okay > 0.2) return 'okay';
    if (Math.abs(s.angularVelocity) > 40) return 'confused';
    if (s.intoxication > 0.45) return 'sleepy';
    return 'relaxed';
  }

  /** Fall: scramble → false recovery → tip over onto the road. */
  private animateFall(dt: number, s: AnimState, swing: number): void {
    const r = this.rig;
    const p = s.fall;
    if (p < 0.02) this.fallDir = Math.sign(s.angle) || 1;
    const dir = this.fallDir;
    // phase A (0-0.35): feet scramble, arms flap, still upright-ish
    // phase B (0.35-0.5): brief false recovery (rotates back a bit)
    // phase C (0.5-1): body tips over, lands
    let tilt: number;
    if (p < 0.35) tilt = lerp(P.fallAngle * D2R, (P.fallAngle + 12) * D2R, p / 0.35);
    else if (p < 0.5) tilt = lerp((P.fallAngle + 12) * D2R, (P.fallAngle - 6) * D2R, (p - 0.35) / 0.15);
    else {
      const q = (p - 0.5) / 0.5;
      const e = q * q;
      tilt = lerp((P.fallAngle - 6) * D2R, Math.PI / 2 - 0.05, e);
    }
    const flap = Math.sin(this.t * 26) * (p < 0.5 ? 1 : 0.2);
    const scramble = Math.sin(this.t * 18) * (p < 0.5 ? 0.9 : 0.1);

    r.root.rotation.z = -tilt * dir;
    r.root.rotation.y = dir * p * 0.5;
    // Fall pivot near the feet; body drops as it tips.
    r.root.position.x = Math.sin(tilt) * dir * 0.4;
    r.root.position.y = -Math.max(0, 1 - Math.cos(tilt)) * 0.85;
    r.pelvis.rotation.z = -tilt * dir * 0.15;
    r.torso.rotation.z = -tilt * dir * 0.35 + flap * 0.1;
    r.torso.rotation.x = 0.1 + p * 0.3;
    r.head.rotation.z = -tilt * dir * 0.4 + flap * 0.15;
    r.head.rotation.x = -0.2 + (p > 0.5 ? 0.3 : 0);
    r.lArm.rotation.z = 1.2 + flap * 0.8 + (dir > 0 ? 0.8 : 0);
    r.rArm.rotation.z = -1.2 - flap * 0.8 - (dir < 0 ? 0.8 : 0);
    r.lArm.rotation.x = flap * 0.6;
    r.rArm.rotation.x = -flap * 0.6;
    r.lForearm.rotation.x = -0.4 - Math.abs(flap) * 0.6;
    r.rForearm.rotation.x = -0.4 - Math.abs(flap) * 0.6;
    r.lLeg.rotation.x = scramble * 0.8 + swing * 0.2;
    r.rLeg.rotation.x = -scramble * 0.8 - swing * 0.2;
    r.lLeg.rotation.z = 0.2 + (dir < 0 ? 0.8 * Math.min(1, p * 2) : 0);
    r.rLeg.rotation.z = -0.2 - (dir > 0 ? 0.8 * Math.min(1, p * 2) : 0);
    r.lShin.rotation.x = -Math.abs(scramble) * 0.8 - p * 0.5;
    r.rShin.rotation.x = -Math.abs(scramble) * 0.8 - p * 0.5;
    r.bottle.visible = false;
    r.setFace(p < 0.35 ? 'shocked' : p < 0.5 ? 'okay' : p < 0.85 ? 'panic' : 'dead');
    void dt;
  }
}
