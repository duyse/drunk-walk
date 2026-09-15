import * as THREE from 'three';
import { GAME_CONFIG } from '../app/GameConfig';

const C = GAME_CONFIG.camera;

/** Front-facing camera: sits in front of the man looking back down the road (-Z). */
export class CameraController {
  readonly camera: THREE.PerspectiveCamera;
  private t = 0;
  private shake = 0;
  private shakeSeed = 0;
  private target = new THREE.Vector3(0, C.lookAtHeight, 0);
  /** Extra sideways follow so the camera leans with him slightly. */
  leanFollow = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(C.fov, aspect, 0.1, 120);
    this.camera.position.set(0, C.height, C.distance);
    this.camera.lookAt(this.target);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    // Portrait phones: widen the FOV so the character stays readable.
    this.camera.fov = aspect < 0.8 ? C.fov + (0.8 - aspect) * 40 : C.fov;
    this.camera.updateProjectionMatrix();
  }

  addShake(amount: number): void {
    this.shake = Math.min(1, this.shake + amount);
    this.shakeSeed = Math.random() * 100;
  }

  update(dt: number, leanDeg: number, walkPhase: number): void {
    this.t += dt;
    this.shake = Math.max(0, this.shake - dt * C.shakeDecay * this.shake - dt * 0.2);
    const sway = Math.sin(this.t * 0.7) * C.swayAmp;
    const bob = Math.sin(walkPhase * 2) * 0.012;
    const sx = this.shake * Math.sin(this.t * 61 + this.shakeSeed) * 0.12;
    const sy = this.shake * Math.cos(this.t * 47 + this.shakeSeed) * 0.08;
    this.leanFollow += (leanDeg * 0.006 - this.leanFollow) * Math.min(1, dt * 3);
    this.camera.position.set(sway + sx + this.leanFollow, C.height + bob + sy, C.distance);
    this.target.set(this.leanFollow * 0.5, C.lookAtHeight, 0);
    this.camera.lookAt(this.target);
  }
}
