import { GAME_CONFIG } from '../app/GameConfig';
import { BalanceController } from '../player/BalanceController';
import { DrunkMotion } from '../player/DrunkMotion';
import { intoxicationFor, walkingSpeedFor } from './DifficultyManager';

const D = GAME_CONFIG.drink;
const S = GAME_CONFIG.scoring;

export type SessionEvent = 'stumble' | 'drink-start' | 'drink-end' | 'recover' | 'fall' | 'milestone';

/** All per-run state. `reset()` makes restart instant; nothing is reallocated. */
export class GameSession {
  readonly balance = new BalanceController();
  readonly motion = new DrunkMotion();
  distance = 0;
  score = 0;
  time = 0;
  intoxication = 0;
  drinkIntox = 0; // extra from drinks
  walkingSpeed: number = GAME_CONFIG.walking.baseSpeed;
  walkPhase = 0;
  input = 0;
  // Drinking
  drinkTimer: number = D.firstAfter;
  drinkProgress = -1;
  // Recovery tracking (for the "I'm fine" pose + sfx)
  private wasDanger = false;
  sinceRecovery = Infinity;
  // Fall
  fallProgress = -1;
  godmode = false;
  private nextMilestone = 0;
  private static MILESTONES = [100, 250, 500, 1000, 2000, 3000, 5000, 7500, 10000];
  onEvent: ((e: SessionEvent, value?: number) => void) | null = null;

  constructor() {
    this.motion.onStumbleStart = () => this.onEvent?.('stumble');
  }

  reset(seed = (Math.random() * 1e9) >>> 0): void {
    this.balance.reset();
    this.motion.reset(seed);
    this.distance = this.score = this.time = 0;
    this.intoxication = this.drinkIntox = 0;
    this.walkingSpeed = GAME_CONFIG.walking.baseSpeed;
    this.walkPhase = 0;
    this.input = 0;
    this.drinkTimer = D.firstAfter;
    this.drinkProgress = -1;
    this.wasDanger = false;
    this.sinceRecovery = Infinity;
    this.fallProgress = -1;
    this.nextMilestone = 0;
  }

  get fallen(): boolean {
    return this.balance.fallen;
  }

  /** One fixed physics step. Returns true on the frame the fall commits. */
  step(dt: number, input: number): boolean {
    if (this.fallen) return false;
    this.time += dt;
    this.input = input;
    this.intoxication = Math.min(1, intoxicationFor(this.distance) + this.drinkIntox);
    this.walkingSpeed = walkingSpeedFor(this.intoxication);

    // Drinking schedule
    if (this.drinkProgress >= 0) {
      this.drinkProgress += dt / D.duration;
      if (this.drinkProgress >= 1) {
        this.drinkProgress = -1;
        this.drinkIntox += D.intoxicationStep;
        this.motion.boostWobble(D.postWobbleMult, D.postWobbleTime);
        this.onEvent?.('drink-end');
      }
    } else {
      this.drinkTimer -= dt;
      if (this.drinkTimer <= 0 && this.balance.danger < 0.45) {
        this.drinkProgress = 0;
        const iv = D.interval + (D.intervalDrunk - D.interval) * this.intoxication;
        this.drinkTimer = iv * (0.8 + Math.random() * 0.4);
        this.onEvent?.('drink-start');
      }
    }

    // Physics difficulty keeps creeping past visual max so endless runs never plateau.
    // Stays inside the fairness invariant (see GameConfig.physics) up to 1.3.
    const overdrive = Math.max(0, this.distance - GAME_CONFIG.intoxication.progressionDistance) / 8000;
    const difficulty = Math.min(1.3, this.intoxication + overdrive);
    const impulse = this.motion.update(dt, difficulty, this.balance.angle);
    this.balance.step(dt, {
      input,
      intoxication: difficulty,
      wobbleTorque: this.motion.wobbleTorque,
      impulse,
    });
    if (this.godmode) {
      this.balance.fallen = false;
      this.balance.fallTimer = 0;
    }

    // Recovery detection
    const danger = this.balance.danger > 0.62;
    if (this.wasDanger && !danger) {
      this.sinceRecovery = 0;
      this.onEvent?.('recover');
    }
    this.wasDanger = danger;
    this.sinceRecovery += dt;

    // Travel
    this.distance += this.walkingSpeed * dt;
    this.walkPhase += (this.walkingSpeed / GAME_CONFIG.walking.stepLength) * Math.PI * dt;
    this.score = Math.floor(this.distance * S.scorePerMeter);
    const ms = GameSession.MILESTONES;
    if (this.nextMilestone < ms.length && this.distance >= ms[this.nextMilestone]) {
      this.onEvent?.('milestone', ms[this.nextMilestone]);
      this.nextMilestone++;
    }

    if (this.fallen) {
      this.fallProgress = 0;
      this.onEvent?.('fall');
      return true;
    }
    return false;
  }

  /** Advance the fall cinematic. Returns true when finished. */
  stepFall(dt: number): boolean {
    this.fallProgress = Math.min(1, this.fallProgress + dt / GAME_CONFIG.fall.sequenceTime);
    return this.fallProgress >= 1;
  }
}
