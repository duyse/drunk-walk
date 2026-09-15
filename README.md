# DRUNK WALK

A weird, funny, retro-3D endless browser game. A progressively drunk man walks toward the camera; you counter-steer his balance to keep him upright for as many meters as possible before he inevitably falls.

**Counter-steering is the whole game:** he leans LEFT → you push RIGHT. He leans RIGHT → you push LEFT. You are not moving him; you are fighting his momentum.

## Tech stack

- [Three.js](https://threejs.org/) for low-poly WebGL rendering (only runtime dependency)
- TypeScript + [Vite](https://vitejs.dev/)
- [Vitest](https://vitest.dev/) for unit tests
- Plain HTML/CSS overlays for UI (no framework)
- WebAudio-synthesized sound effects (no audio files)
- Hand-written PWA manifest + service worker

## Install / run / build

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # typecheck + production build into dist/
npm run preview   # serve dist/
npm test          # unit tests
npm run lint      # tsc --noEmit
npm run feel      # headless 60 Hz balance-feel simulation (tuning aid)
```

## Controls

### Desktop
- **Mouse**: move horizontally. Cursor right of center = push right; left = push left. Full correction at ±28 % of the viewport width from center.
- **Keyboard**: `A`/`D` or `←`/`→` (ramped, for accessibility).
- `Esc` / `P` pause. `Enter` starts from the menu; `Space`/`Enter` restarts on the result screen.

### Mobile
- **Tilt** the phone left/right (primary). Requires a calibration step, see below.
- **Touch drag** fallback: drag horizontally from wherever you touch; release returns to neutral.
- Control preference (auto / mouse / tilt / touch) is in Settings.

### Sensor permission (iOS 13+)
Safari requires `DeviceOrientationEvent.requestPermission()` inside a user gesture. The "Calibrate & Start" tap triggers it. Handled outcomes: granted → tilt; denied / unsupported / no data within ~1 s → message "Motion controls unavailable. Using touch controls instead." and the run starts with touch. Gameplay is never blocked on the sensor.

### Calibration
When you tap Calibrate, the current tilt (gamma in portrait, beta in landscape, chosen from `screen.orientation.angle`) is stored as the neutral baseline. Subsequent readings are relative to that baseline, wrapped for the ±90° gamma discontinuity, clamped at ±22° → ±1, then smoothed by the shared input filter.

## Physics overview

`src/player/BalanceController.ts` is a pure, testable inverted-pendulum:

```
accel   = gravityGain(k) · angle          // upright is unstable: leans grow on their own
        + wobbleTorque                    // continuous drunk noise from DrunkMotion
        + input · inputStrength(k)        // your counter-steer
accel   = clamp(accel, ±maxAngularAccel)  // fairness cap
angVel += accel · dt + stumbleImpulse
angVel *= damping(k)^(dt/fixedStep)
angle  += angVel · dt
fall when |angle| > fallAngle for longer than fallGrace
```

`k` is intoxication (0..1). Because upright is unstable, both "hold the mouse to one side" and "leave it centered" fall within seconds; only active counter-steering survives. Input is deadzoned (0.05), exponentially smoothed, and sensitivity-scaled in `InputManager` before it reaches physics. Physics runs at a fixed 120 Hz inside a `requestAnimationFrame` loop with a capped delta.

**Fairness invariant** (documented in `GameConfig.physics`): full input must exceed gravity at the danger angle plus peak wobble, and stumble impulses are capped so a ~0.2 s human reaction can still recover. `npm run feel` simulates human-like controllers (delay, noise, limited gain) at four skill levels and reports median survival; it also confirms the two exploits fail.

## Difficulty progression

- `intoxication = smoothstep(sqrt(distance / 1800 m))` plus `+0.06` per drink. Drinks start after 9 s and recur every 16 s (down to 9 s when drunk). Each drink is followed by 2.5 s of doubled wobble.
- Intoxication scales wobble amplitude, reduces damping (more momentum), weakens input slightly, shortens the stumble interval (11 s → 3.2 s) and grows stumble impulses (34 → 62 °/s). Stumbles are telegraphed by an arm flare 0.22 s before the shove and never push him further in a direction he is already far over.
- Visually: sleepier eyes, rosy cheeks, bigger sway, irregular stride, more head bob, more arm flailing.
- Past intoxication 1.0 a small "overdrive" keeps creeping with distance (capped at 1.3, still inside the fairness invariant) so endless runs never plateau.

## Leaderboard architecture

`src/leaderboard/LeaderboardService.ts` defines:

```ts
interface LeaderboardService {
  getTopScores(limit?: number): Promise<ScoreEntry[]>;
  submitScore(entry: ScoreEntry): Promise<void>;
  getPlayerRank(score: number): Promise<number | null>;
}
```

`LocalLeaderboardService` implements it on top of `StorageService` (localStorage with in-memory fallback), seeded with 8 demo entries, keeps the top 50, sorts by score then time, and validates entries with `isPlausibleEntry` (name 3–16 sanitized chars, finite non-negative numbers, score consistent with distance, distance consistent with run time × max speed). `ScoreEntry` carries `runTime` and `distance` so a future server can run the same checks.

### Replacing it with a real backend
Implement the interface (Supabase, Firebase, REST…) and swap the single construction in `GameApp`:

```ts
this.leaderboard = new RemoteLeaderboardService(fetchImpl);
```

Nothing else in the game touches storage for scores. Keep secrets server-side; the client should only send `{ name, score, distance, runTime, timestamp }` and the server should re-run `isPlausibleEntry`-style checks.

## Debug mode

- `?debug=true` — overlay with FPS, state, distance, score, angle, angular velocity, intoxication, speed, input (and its source), wobble torque, stumble timer, drink timer, fall timer, segment count. Buttons: force stumble, force fall, sober, drunk, toggle god mode.
- `?godmode=true` — never fall.
- `?skipIntro=true` — skip the tutorial.
- `window.drunkwalk` exposes the `GameApp` instance in the console.

## Performance notes

- One `HemisphereLight`, one shadow-casting `DirectionalLight` (512/1024 map, off on LOW), one rim light, one point light for the face. No post-processing.
- 8 recycled street segments; props are pooled per segment and only re-positioned on recycle. Windows and road dashes are `InstancedMesh`. All geometry/material shared.
- Particles: a single `Points` buffer, capped at 40 (16 on LOW).
- HUD text updates at 12 Hz; the balance meter is one transform write per frame.
- Pixel ratio capped at 1.5 / 1.25 / 1.0 by quality tier. Quality tier from cores/memory/UA/resolution, plus a 4-second FPS probe that steps down once.
- Physics is identical across quality tiers.

## Assets / licensing

Everything is original and generated in code: primitive-built character, canvas-drawn face texture, procedural city, synthesized audio, SVG icon. No assets from the reference video or any third party. Three.js is MIT.

## Deployment

Static hosting only, no server:

```bash
npm run build
# upload dist/ to Vercel / Netlify / Cloudflare Pages / GitHub Pages / any static host
```

`base: './'` is set in `vite.config.ts`, so it works from a sub-path. Bump `CACHE` in `public/sw.js` when deploying a new version so the service worker refreshes.
