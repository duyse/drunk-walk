import * as THREE from 'three';
import { GAME_CONFIG } from '../app/GameConfig';
import { makeRng } from '../player/DrunkMotion';
import type { Quality } from '../rendering/Renderer';
import { StreetSegment } from './StreetSegment';

const W = GAME_CONFIG.world;

/**
 * Fixed ring of segments sliding toward the camera (+Z). When one passes
 * behind the camera it is moved to the back and reshuffled. Memory is bounded.
 */
export class RoadManager {
  readonly group = new THREE.Group();
  private segments: StreetSegment[] = [];
  private rng: () => number;

  constructor(seed: number, quality: Quality) {
    this.rng = makeRng(seed);
    for (let i = 0; i < W.segmentCount; i++) {
      const s = new StreetSegment(this.rng, quality);
      this.segments.push(s);
      this.group.add(s.group);
    }
    this.layout();
  }

  private layout(): void {
    // Segment 0 sits under the character (z=0); others extend into -Z.
    this.segments.forEach((s, i) => (s.group.position.z = W.segmentLength * (1 - i)));
  }

  reset(): void {
    this.layout();
    for (const s of this.segments) s.regenerate();
  }

  update(dt: number, speed: number): void {
    const dz = speed * dt;
    const recycleZ = W.segmentLength * 1.5 + GAME_CONFIG.camera.distance;
    for (const s of this.segments) {
      s.group.position.z += dz;
      if (s.group.position.z > recycleZ) {
        // Find farthest segment and place this one behind it.
        let minZ = Infinity;
        for (const o of this.segments) if (o !== s) minZ = Math.min(minZ, o.group.position.z);
        s.group.position.z = minZ - W.segmentLength;
        s.regenerate();
      }
    }
  }

  get segmentCount(): number {
    return this.segments.length;
  }
}
