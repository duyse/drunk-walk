import * as THREE from 'three';
import { GAME_CONFIG } from './GameConfig';
import { GameState, StateMachine } from './GameState';
import { GameLoop } from '../game/GameLoop';
import { GameSession } from '../game/GameSession';
import { CharacterRig } from '../player/CharacterRig';
import { CharacterAnimator } from '../player/CharacterAnimator';
import { RoadManager } from '../world/RoadManager';
import { InputManager } from '../input/InputManager';
import { MouseInput } from '../input/MouseInput';
import { KeyboardInput } from '../input/KeyboardInput';
import { TouchInput } from '../input/TouchInput';
import { DeviceOrientationInput } from '../input/DeviceOrientationInput';
import { Renderer } from '../rendering/Renderer';
import { CameraController } from '../rendering/CameraController';
import { Effects } from '../rendering/Effects';
import { AudioManager } from '../audio/AudioManager';
import { StorageService } from '../storage/StorageService';
import { LocalLeaderboardService } from '../leaderboard/LocalLeaderboardService';
import { sanitizeName, type LeaderboardService } from '../leaderboard/LeaderboardService';
import { $, fmt, GameHUD, renderLeaderboard, ScreenRouter } from '../ui/Screens';
import { DebugOverlay } from '../debug/DebugOverlay';

export type ControlPref = 'auto' | 'mouse' | 'tilt' | 'touch';

export interface Settings {
  playerName: string | null;
  bestScore: number;
  bestDistance: number;
  soundEnabled: boolean;
  musicEnabled: boolean;
  controlPreference: ControlPref;
  sensitivity: number;
  tutorialCompleted: boolean;
}

const isTouchDevice = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

/** Owns everything. One instance per page; runs are reset in place, never re-created. */
export class GameApp {
  readonly state = new StateMachine();
  readonly storage = new StorageService();
  readonly settings: Settings;
  readonly leaderboard: LeaderboardService;
  readonly session = new GameSession();
  readonly input = new InputManager();
  readonly audio = new AudioManager();
  private renderer: Renderer;
  private camera: CameraController;
  private scene = new THREE.Scene();
  private rig = new CharacterRig();
  private animator = new CharacterAnimator(this.rig);
  private road: RoadManager;
  private effects = new Effects();
  private loop: GameLoop;
  private screens = new ScreenRouter();
  private hud = new GameHUD();
  private keyboard = new KeyboardInput();
  private mouse = new MouseInput();
  private touch: TouchInput;
  private tilt = new DeviceOrientationInput();
  private debug: DebugOverlay | null = null;
  private lastResultRank: number | null = null;
  private pendingEntry: { score: number; distance: number; runTime: number } | null = null;
  private flags = new URLSearchParams(location.search);

  constructor(canvas: HTMLCanvasElement) {
    this.settings = {
      playerName: null,
      bestScore: 0,
      bestDistance: 0,
      soundEnabled: true,
      musicEnabled: true,
      controlPreference: 'auto',
      sensitivity: 1,
      tutorialCompleted: false,
      ...this.storage.get<Partial<Settings>>('settings', {}),
    };
    this.leaderboard = new LocalLeaderboardService(this.storage);
    this.renderer = new Renderer(canvas);
    this.camera = new CameraController(this.renderer.aspect);
    this.touch = new TouchInput(canvas);
    this.road = new RoadManager(7, this.renderer.quality);
    this.buildScene();
    this.loop = new GameLoop(GAME_CONFIG.physics.fixedStep, (dt) => this.fixed(dt), (dt) => this.frame(dt));
    this.wireInput();
    this.wireUI();
    this.wireSession();
    this.applySettings();
    if (this.flags.get('debug') === 'true') this.debug = new DebugOverlay(this);
    if (this.flags.get('godmode') === 'true') this.session.godmode = true;

    window.addEventListener('resize', () => this.camera.setAspect(this.renderer.aspect));
    this.camera.setAspect(this.renderer.aspect);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state.is(GameState.PLAYING)) this.pause();
    });
    window.addEventListener('blur', () => {
      if (this.state.is(GameState.PLAYING)) this.pause();
    });
  }

  // ---------- Scene ----------
  private buildScene(): void {
    const s = this.scene;
    const W = GAME_CONFIG.world;
    s.background = new THREE.Color(0x060c18);
    s.fog = new THREE.Fog(0x060c18, W.fogNear, W.fogFar);
    s.add(new THREE.HemisphereLight(0x6fa3d8, 0x0a1426, 1.3));
    const key = new THREE.DirectionalLight(0xbfe0ff, 1.8);
    key.position.set(2.5, 6, 6);
    // Cheap face light: one point light just in front of the character.
    const face = new THREE.PointLight(0xa8d8ff, 6, 6, 2);
    face.position.set(0.6, 2.2, 2.2);
    s.add(face);
    key.target.position.set(0, 1, -2);
    s.add(key, key.target);
    if (this.renderer.quality !== 'low') {
      key.castShadow = true;
      key.shadow.mapSize.set(this.renderer.quality === 'high' ? 1024 : 512, this.renderer.quality === 'high' ? 1024 : 512);
      key.shadow.camera.left = key.shadow.camera.bottom = -4;
      key.shadow.camera.right = key.shadow.camera.top = 4;
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 20;
      key.shadow.bias = -0.002;
    }
    // Rim/fill from behind so the silhouette pops against the dark road.
    const rim = new THREE.DirectionalLight(0x3f7fc0, 0.6);
    rim.position.set(-3, 4, -6);
    s.add(rim);
    s.add(this.road.group, this.rig.root, this.effects.points);
    this.renderer.onQualityChange = (q) => {
      key.castShadow = q !== 'low';
      this.effects.setBudget(q === 'low' ? 16 : 40);
    };
    this.effects.setBudget(this.renderer.quality === 'low' ? 16 : 40);
  }

  // ---------- Wiring ----------
  private wireInput(): void {
    this.input.add(this.mouse).add(this.keyboard).add(this.touch);
    // Tilt is attached during calibration; adding it here registers it in the manager only.
    this.input.add(this.tilt);
    this.tilt.detach();
  }

  private wireSession(): void {
    this.session.onEvent = (e, v) => {
      switch (e) {
        case 'stumble':
          this.audio.play('stumble', 0.7);
          this.camera.addShake(GAME_CONFIG.stumble.shakeAmp * (0.6 + this.session.intoxication));
          break;
        case 'drink-start':
          this.audio.play('bottle');
          break;
        case 'drink-end':
          this.audio.play('drink');
          this.effects.burst(0.2, 1.7, 0.1, 4, 0.3);
          break;
        case 'recover':
          this.audio.play('recover', 0.6);
          break;
        case 'fall':
          this.audio.play('fall');
          this.camera.addShake(0.5);
          this.effects.burst(0, 0.1, 0, 14, 1.2);
          break;
        case 'milestone':
          this.audio.play('milestone', 0.7);
          this.hud.showToast(`${fmt(v ?? 0)} m`);
          break;
      }
    };
    this.animator.onStep = (side, hard) => {
      if (!this.state.is(GameState.PLAYING)) return;
      this.audio.play('step', hard ? 0.9 : 0.5);
      this.effects.burst(side * 0.15, 0.05, 0.1, hard ? 5 : 2, hard ? 0.8 : 0.4);
      if (hard) this.camera.addShake(0.08);
    };
  }

  private wireUI(): void {
    const click = (id: string, fn: () => void) =>
      $(id).addEventListener('click', (e) => {
        e.preventDefault();
        this.audio.unlock();
        this.audio.play('click');
        fn();
      });
    click('btn-start', () => this.startRequested());
    click('btn-leaderboard', () => this.showLeaderboard(GameState.MENU));
    click('btn-settings', () => this.showSettings());
    click('btn-tut-go', () => {
      this.settings.tutorialCompleted = true;
      this.saveSettings();
      this.afterTutorial();
    });
    click('btn-calib', () => void this.calibrateAndStart());
    click('btn-calib-skip', () => {
      this.touch.active = true;
      this.beginRun();
      this.hud.showHint('Drag left / right to balance');
    });
    click('btn-pause', () => this.pause());
    click('btn-resume', () => this.resume());
    click('btn-restart', () => {
      this.state.transition(GameState.MENU);
      this.beginRun();
    });
    click('btn-quit', () => this.toMenu());
    click('btn-again', () => this.beginRun());
    click('btn-go-lb', () => this.showLeaderboard(GameState.GAME_OVER));
    click('btn-go-menu', () => this.toMenu());
    click('btn-lb-back', () => this.state.transition(this.state.previous) && this.screens.show(this.state.current === GameState.MENU ? 'menu' : 'gameover'));
    click('btn-set-back', () => this.leaveSettings());
    $('name-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.audio.unlock();
      void this.submitName();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state.is(GameState.PLAYING)) this.pause();
        else if (this.state.is(GameState.PAUSED)) this.resume();
      }
      if ((e.code === 'Space' || e.code === 'Enter') && this.state.is(GameState.GAME_OVER) && $('name-form').hidden) this.beginRun();
      if (e.code === 'Enter' && this.state.is(GameState.MENU)) this.startRequested();
    });
  }

  private applySettings(): void {
    const s = this.settings;
    this.audio.setMuted(!s.soundEnabled);
    this.audio.setMusic(s.musicEnabled);
    this.input.sensitivity = s.sensitivity;
    $('menu-best').textContent = fmt(s.bestScore);
  }

  saveSettings(): void {
    this.storage.set('settings', this.settings);
    this.applySettings();
  }

  // ---------- Flow ----------
  boot(): void {
    if (this.flags.get('skipIntro') === 'true') this.settings.tutorialCompleted = true;
    this.state.transition(GameState.MENU);
    this.session.reset();
    this.screens.show('menu');
    this.loop.start();
  }

  private useTilt(): boolean {
    const p = this.settings.controlPreference;
    if (p === 'mouse') return false;
    if (p === 'touch') return false;
    if (p === 'tilt') return DeviceOrientationInput.supported;
    return isTouchDevice() && DeviceOrientationInput.supported;
  }

  private startRequested(): void {
    if (!this.settings.tutorialCompleted) {
      const mobile = isTouchDevice();
      $('tut-desktop').hidden = mobile;
      $('tut-mobile').hidden = !mobile;
      this.screens.show('menu', 'tutorial');
      return;
    }
    this.afterTutorial();
  }

  private afterTutorial(): void {
    if (this.useTilt()) {
      this.state.transition(GameState.CALIBRATING);
      $('calib-msg').textContent = 'Hold your phone naturally in your playing position. Keep it still.';
      this.screens.show('calib');
      return;
    }
    if (isTouchDevice()) this.touch.active = true;
    this.beginRun();
  }

  private async calibrateAndStart(): Promise<void> {
    const status = await this.tilt.requestPermission();
    let ok = status === 'ready';
    if (ok) ok = await this.tilt.waitForData();
    if (!ok) {
      $('calib-msg').textContent = 'Motion controls unavailable. Using touch controls instead.';
      this.tilt.active = false;
      this.touch.active = true;
      setTimeout(() => this.beginRun(), 900);
      return;
    }
    this.tilt.calibrate();
    this.tilt.active = true;
    this.touch.active = false;
    $('calib-msg').textContent = 'READY!';
    setTimeout(() => this.beginRun(), 250);
  }

  /** Instant restart: reset state in place, no allocations. */
  beginRun(): void {
    if (!this.state.is(GameState.CALIBRATING, GameState.MENU, GameState.GAME_OVER, GameState.PAUSED)) return;
    this.session.reset();
    this.road.reset();
    this.animator.reset();
    this.effects.clear();
    this.input.reset();
    this.hud.reset();
    this.lastResultRank = null;
    this.pendingEntry = null;
    this.loop.timeScale = 1;
    this.loop.resync();
    this.state.transition(GameState.PLAYING);
    this.screens.show('hud');
    document.body.classList.add('playing');
    this.audio.startAmbience();
    if (!isTouchDevice()) this.hud.showHint('Push against the direction he leans');
  }

  pause(): void {
    if (!this.state.transition(GameState.PAUSED)) return;
    this.screens.show('hud', 'pause');
    document.body.classList.remove('playing');
  }

  resume(): void {
    if (!this.state.transition(GameState.PLAYING)) return;
    this.input.reset();
    this.loop.resync();
    this.screens.show('hud');
    document.body.classList.add('playing');
  }

  private toMenu(): void {
    this.state.transition(GameState.MENU);
    this.session.reset();
    this.animator.reset();
    this.effects.clear();
    this.loop.timeScale = 1;
    this.screens.show('menu');
    document.body.classList.remove('playing');
    this.audio.stopAmbience();
    $('menu-best').textContent = fmt(this.settings.bestScore);
  }

  private async onGameOver(): Promise<void> {
    this.state.transition(GameState.GAME_OVER);
    document.body.classList.remove('playing');
    const s = this.session;
    const isBest = s.score > this.settings.bestScore;
    if (isBest) {
      this.settings.bestScore = s.score;
      this.settings.bestDistance = s.distance;
      this.saveSettings();
      this.audio.play('record');
    }
    $('go-newbest').hidden = !isBest;
    $('go-distance').textContent = `${fmt(s.distance)} m`;
    $('go-score').textContent = fmt(s.score);
    $('go-best').textContent = fmt(this.settings.bestScore);
    $('go-rank').textContent = '…';
    this.screens.show('gameover');
    this.pendingEntry = { score: s.score, distance: s.distance, runTime: s.time };
    if (this.settings.playerName) await this.submitPending();
    else {
      $('go-rank').textContent = `#${(await this.leaderboard.getPlayerRank(s.score)) ?? '—'}`;
      $('name-form').hidden = false;
      $('name-err').textContent = '';
      ($('name-input') as HTMLInputElement).value = '';
    }
  }

  private async submitName(): Promise<void> {
    const name = sanitizeName(($('name-input') as HTMLInputElement).value);
    if (!name) {
      $('name-err').textContent = 'Use 3–16 letters, numbers, spaces, _ or -.';
      return;
    }
    this.settings.playerName = name;
    this.saveSettings();
    $('name-form').hidden = true;
    await this.submitPending();
  }

  private async submitPending(): Promise<void> {
    if (!this.pendingEntry || !this.settings.playerName) return;
    const e = this.pendingEntry;
    this.pendingEntry = null;
    try {
      await this.leaderboard.submitScore({ ...e, name: this.settings.playerName, timestamp: Date.now(), isPlayer: true });
      this.lastResultRank = await this.leaderboard.getPlayerRank(e.score);
      $('go-rank').textContent = this.lastResultRank ? `#${this.lastResultRank}` : '—';
    } catch (err) {
      console.warn('leaderboard submit failed', err);
      $('go-rank').textContent = '—';
    }
  }

  private async showLeaderboard(from: GameState): Promise<void> {
    if (!this.state.transition(GameState.LEADERBOARD)) return;
    let entries: Awaited<ReturnType<LeaderboardService['getTopScores']>> = [];
    try {
      entries = await this.leaderboard.getTopScores(10);
    } catch (err) {
      console.warn('leaderboard load failed', err);
    }
    renderLeaderboard(entries, this.settings.playerName, from === GameState.GAME_OVER ? this.session.score : null);
    this.screens.show('leaderboard');
  }

  private showSettings(): void {
    if (!this.state.transition(GameState.SETTINGS)) return;
    const s = this.settings;
    ($('set-name') as HTMLInputElement).value = s.playerName ?? '';
    ($('set-sound') as HTMLInputElement).checked = s.soundEnabled;
    ($('set-music') as HTMLInputElement).checked = s.musicEnabled;
    ($('set-control') as HTMLSelectElement).value = s.controlPreference;
    ($('set-sens') as HTMLInputElement).value = String(s.sensitivity);
    ($('set-tut') as HTMLInputElement).checked = !s.tutorialCompleted;
    $('set-name-err').textContent = '';
    this.screens.show('settings');
  }

  private leaveSettings(): void {
    const s = this.settings;
    const raw = ($('set-name') as HTMLInputElement).value;
    if (raw.trim()) {
      const name = sanitizeName(raw);
      if (!name) {
        $('set-name-err').textContent = 'Nickname: 3–16 letters, numbers, spaces, _ or -.';
        return;
      }
      s.playerName = name;
    }
    s.soundEnabled = ($('set-sound') as HTMLInputElement).checked;
    s.musicEnabled = ($('set-music') as HTMLInputElement).checked;
    s.controlPreference = ($('set-control') as HTMLSelectElement).value as ControlPref;
    s.sensitivity = parseFloat(($('set-sens') as HTMLInputElement).value) || 1;
    s.tutorialCompleted = !($('set-tut') as HTMLInputElement).checked;
    this.saveSettings();
    this.state.transition(GameState.MENU);
    this.screens.show('menu');
  }

  // ---------- Loop ----------
  private fixed(dt: number): void {
    if (this.state.is(GameState.PLAYING)) {
      this.keyboard.update(dt);
      const input = this.input.update(dt);
      if (this.session.step(dt, input)) {
        this.state.transition(GameState.FALLING);
        this.loop.timeScale = GAME_CONFIG.fall.slowMo;
        this.input.enabled = false;
      }
    } else if (this.state.is(GameState.FALLING)) {
      if (this.session.stepFall(dt)) {
        this.loop.timeScale = 1;
        this.input.enabled = true;
        void this.onGameOver();
      }
    }
  }

  private frame(dt: number): void {
    const s = this.session;
    const playing = this.state.is(GameState.PLAYING);
    const menu = this.state.is(GameState.MENU, GameState.LEADERBOARD, GameState.SETTINGS, GameState.CALIBRATING);
    const moving = playing || this.state.is(GameState.FALLING) || menu;
    if (menu) {
      // Demo mode: slow stroll with gentle sway so the menu feels alive.
      s.walkPhase += dt * 4;
      s.distance += dt * 1.2;
    }
    if (moving) {
      const speed = menu ? 1.2 : this.state.is(GameState.FALLING) ? s.walkingSpeed * (1 - s.fallProgress) : s.walkingSpeed;
      this.road.update(dt, speed);
      this.effects.update(dt, speed);
    }
    if (!this.state.is(GameState.PAUSED)) {
      const menuAngle = menu ? Math.sin(performance.now() * 0.0011) * 7 : 0;
      this.animator.update(dt, {
        angle: menu ? menuAngle : s.balance.angle,
        angularVelocity: menu ? 0 : s.balance.angularVelocity,
        intoxication: menu ? 0.35 : s.intoxication,
        walkPhase: s.walkPhase,
        stumbleTelegraph: s.motion.telegraph,
        drink: s.drinkProgress,
        fall: s.fallProgress,
        sinceRecovery: s.sinceRecovery,
        idle: false,
      });
      this.camera.update(dt, menu ? menuAngle * 0.5 : s.balance.angle, s.walkPhase);
    }
    if (playing) {
      this.hud.update(dt, s.distance, s.score, s.balance.angle);
      this.renderer.probe(dt);
    }
    this.renderer.render(this.scene, this.camera.camera);
    this.debug?.update(this.loop.fps);
  }

  // Debug hooks
  forceStumble(): void {
    this.session.motion.forceStumble();
  }
  forceFall(): void {
    this.session.balance.angle = GAME_CONFIG.physics.fallAngle + 5;
    this.session.balance.fallTimer = 1;
  }
  get roadSegments(): number {
    return this.road.segmentCount;
  }
  get activeInput(): string {
    return this.input.activeSource;
  }
}
