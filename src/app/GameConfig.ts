/** Every tunable in one place. Angles are in degrees unless noted. */
export const GAME_CONFIG = {
  physics: {
    fixedStep: 1 / 120,
    /** Inverted-pendulum term: how strongly gravity pulls a lean further over (deg/s² per deg). */
    gravityGain: 2.2,
    /** Extra gravity gain at full intoxication (makes late game heavier). */
    gravityGainDrunk: 1.6,
    /**
     * Fairness invariant: inputStrength must exceed gravity at ~dangerAngle plus
     * peak wobble (~1.7 × wobbleAmp) so a committed correction can always win
     * until the very end. Check with `npm run feel`.
     */
    inputStrength: 130, // deg/s² at full input, sober
    inputStrengthDrunk: 115, // at full intoxication (less effective when drunk)
    damping: 0.985, // per fixed step, sober
    dampingDrunk: 0.991, // less damping when drunk => more momentum
    maxAngularAccel: 260, // deg/s² clamp on the sum of forces (fairness)
    maxAngularVel: 140, // deg/s
    /** Random drunk torque amplitude (deg/s²). */
    wobbleAmp: 12,
    wobbleAmpDrunk: 27,
    fallAngle: 46,
    /** Seconds the angle must stay beyond fallAngle before the fall commits. */
    fallGrace: 0.28,
    dangerAngle: 30,
  },
  input: {
    deadzone: 0.05,
    smoothing: 14, // 1/s exp smoothing rate
    sensitivity: 1.0,
    /** Mouse: fraction of viewport width that maps to full correction. */
    mouseRange: 0.28,
    /** Tilt degrees that map to full correction. */
    tiltRange: 22,
    keyboardRamp: 8, // 1/s
  },
  stumble: {
    baseInterval: 11,
    minInterval: 3.2,
    baseImpulse: 34, // deg/s. Recoverable with ~0.2 s reaction: v²/(2·net) + 0.2·v < 40°
    maxImpulse: 62,
    telegraph: 0.22, // seconds arms flare before the shove lands
    shakeAmp: 0.05,
  },
  drink: {
    firstAfter: 9,
    interval: 16,
    intervalDrunk: 9,
    duration: 2.4,
    intoxicationStep: 0.06,
    postWobbleTime: 2.5,
    postWobbleMult: 2.2,
  },
  intoxication: {
    /** Distance (m) at which distance-based intoxication reaches ~1. */
    progressionDistance: 1800,
  },
  walking: {
    baseSpeed: 2.2, // m/s
    maxSpeed: 3.6,
    stepLength: 0.95,
  },
  scoring: { scorePerMeter: 10 },
  world: {
    segmentLength: 14,
    segmentCount: 8,
    roadWidth: 7,
    sidewalkWidth: 2.4,
    fogNear: 18,
    fogFar: 80,
  },
  camera: {
    fov: 42,
    height: 2.3,
    distance: 7.2,
    lookAtHeight: 1.05,
    swayAmp: 0.025,
    shakeDecay: 6,
  },
  fall: { slowMo: 0.42, sequenceTime: 2.1 },
  hudUpdateHz: 12,
} as const;

export type GameConfig = typeof GAME_CONFIG;
