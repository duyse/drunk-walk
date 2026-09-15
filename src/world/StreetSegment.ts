import * as THREE from 'three';
import { GAME_CONFIG } from '../app/GameConfig';
import { bench, box, building, car, GEO, hydrant, MAT, shopSign, streetLamp, trashCan } from './PropFactory';
import type { Quality } from '../rendering/Renderer';

const W = GAME_CONFIG.world;

/**
 * One slice of street: road, curbs, sidewalks, two facades, and props.
 * Built once; `regenerate()` reshuffles props from a small owned pool so
 * recycling never allocates geometry.
 */
export class StreetSegment {
  readonly group = new THREE.Group();
  private propsGroup = new THREE.Group();
  private facadeGroup = new THREE.Group();
  private pool: { lamps: THREE.Group[]; cars: THREE.Group[]; cans: THREE.Group[]; benches: THREE.Group[]; signs: THREE.Group[]; hydrants: THREE.Group[] };
  private facades: THREE.Group[] = [];

  constructor(private rng: () => number, quality: Quality) {
    const len = W.segmentLength;
    const half = W.roadWidth / 2;
    const sw = W.sidewalkWidth;

    // Road + centre dashes (dashes are 1 instanced mesh).
    const road = box(MAT.road, W.roadWidth, 0.1, len, 0, -0.05, 0);
    road.receiveShadow = true;
    this.group.add(road);
    const dashes = new THREE.InstancedMesh(GEO.box, MAT.roadLine, 4);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 4; i++) {
      m.makeScale(0.16, 0.02, 1.6).setPosition(0, 0.011, -len / 2 + len / 8 + (i * len) / 4);
      dashes.setMatrixAt(i, m);
    }
    this.group.add(dashes);
    // Edge lines
    this.group.add(box(MAT.roadLine, 0.12, 0.02, len, -half + 0.35, 0.011, 0));
    this.group.add(box(MAT.roadLine, 0.12, 0.02, len, half - 0.35, 0.011, 0));

    for (const side of [-1, 1]) {
      this.group.add(box(MAT.curb, 0.3, 0.22, len, side * (half + 0.15), 0.11, 0));
      const walk = box(MAT.sidewalk, sw, 0.2, len, side * (half + 0.3 + sw / 2), 0.1, 0);
      walk.receiveShadow = true;
      this.group.add(walk);
      // Sidewalk slab grooves
      const grooves = new THREE.InstancedMesh(GEO.box, MAT.curb, 6);
      for (let i = 0; i < 6; i++) {
        m.makeScale(sw, 0.01, 0.06).setPosition(side * (half + 0.3 + sw / 2), 0.205, -len / 2 + (i + 0.5) * (len / 6));
        grooves.setMatrixAt(i, m);
      }
      this.group.add(grooves);
    }

    // Distant silhouette blocks behind the facades (cheap depth).
    for (const side of [-1, 1]) {
      const h = 14 + this.rng() * 16;
      this.group.add(box(MAT.far, 10, h, len, side * (half + sw + 12), h / 2, 0));
    }

    this.group.add(this.facadeGroup, this.propsGroup);

    const n = quality === 'low' ? 1 : quality === 'medium' ? 2 : 3;
    this.pool = {
      lamps: [streetLamp(this.rng), streetLamp(this.rng)],
      cars: Array.from({ length: Math.max(1, n - 1) }, () => car(this.rng)),
      cans: Array.from({ length: n }, () => trashCan(this.rng)),
      benches: [bench()],
      signs: [shopSign(this.rng), shopSign(this.rng)],
      hydrants: [hydrant()],
    };
    for (const list of Object.values(this.pool)) for (const p of list) this.propsGroup.add(p);
    // Facades: 2 per side, rebuilt only in regenerate (windows are instanced).
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Group();
      this.facades.push(f);
      this.facadeGroup.add(f);
    }
    this.regenerate();
  }

  /** Reshuffle layout using the seeded rng. Rebuilds facades (cheap: 2 boxes + 2 instanced meshes each). */
  regenerate(): void {
    const len = W.segmentLength;
    const half = W.roadWidth / 2;
    const sw = W.sidewalkWidth;
    const rng = this.rng;

    // Facades
    this.facades.forEach((holder, i) => {
      holder.clear();
      const side = i < 2 ? -1 : 1;
      const slot = i % 2;
      const width = len / 2 - 0.4;
      const depth = 6 + rng() * 3;
      const height = 7 + rng() * 12;
      const b = building(rng, width, depth, height);
      b.position.set(side * (half + sw + 0.3 + depth / 2), 0, -len / 4 + slot * (len / 2));
      b.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      holder.add(b);
    });

    // Props: hide all, then place a random subset.
    for (const list of Object.values(this.pool)) for (const p of list) p.visible = false;
    const place = (p: THREE.Group, x: number, z: number, ry = 0) => {
      p.visible = true;
      p.position.set(x, 0.2, z);
      p.rotation.y = ry;
    };
    const walkX = half + 0.3 + sw / 2;
    // Lamps: one per side, staggered.
    place(this.pool.lamps[0], -(half + 0.7), -len / 2 + 2 + rng() * 3, Math.PI / 2);
    place(this.pool.lamps[1], half + 0.7, len / 2 - 2 - rng() * 3, -Math.PI / 2);
    // Parked car sometimes, on the road edge.
    if (rng() < 0.55) {
      const side = rng() < 0.5 ? -1 : 1;
      const c = this.pool.cars[0];
      place(c, side * (half - 1.15), (rng() - 0.5) * (len - 5));
      c.position.y = 0;
    }
    for (const can of this.pool.cans) if (rng() < 0.6) place(can, (rng() < 0.5 ? -1 : 1) * (walkX + (rng() - 0.5)), (rng() - 0.5) * len);
    if (rng() < 0.35) place(this.pool.benches[0], (rng() < 0.5 ? -1 : 1) * (walkX + 0.4), (rng() - 0.5) * len * 0.8, (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.5);
    if (rng() < 0.4) place(this.pool.hydrants[0], (rng() < 0.5 ? -1 : 1) * (walkX - 0.6), (rng() - 0.5) * len);
    for (const s of this.pool.signs)
      if (rng() < 0.6) {
        const side = rng() < 0.5 ? -1 : 1;
        place(s, side * (half + sw + 0.25), (rng() - 0.5) * len * 0.8, side < 0 ? Math.PI / 2 : -Math.PI / 2);
        s.position.y = 2.6 + rng() * 1.2;
      }
  }
}
