import * as THREE from 'three';

/** Single pooled Points buffer for dust puffs. Capped, zero per-frame allocation. */
export class Effects {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private geo: THREE.BufferGeometry;
  private next = 0;
  private cap: number;

  constructor(cap = 64) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setDrawRange(0, cap);
    const mat = new THREE.PointsMaterial({
      color: 0x8fb8d8,
      size: 0.09,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < cap; i++) this.pos[i * 3 + 1] = -100; // park offscreen
  }

  setBudget(cap: number): void {
    this.cap = Math.min(cap, this.life.length);
  }

  burst(x: number, y: number, z: number, n: number, spread = 0.6): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.cap;
      this.pos[i * 3] = x + (Math.random() - 0.5) * 0.2;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.2;
      this.vel[i * 3] = (Math.random() - 0.5) * spread;
      this.vel[i * 3 + 1] = Math.random() * 0.8 + 0.3;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * spread + 0.6;
      this.life[i] = 0.5 + Math.random() * 0.3;
    }
  }

  update(dt: number, worldSpeed: number): void {
    let any = false;
    for (let i = 0; i < this.life.length; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 1.6 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + worldSpeed) * dt;
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -100;
    }
    if (any) (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    for (let i = 0; i < this.life.length; i++) this.pos[i * 3 + 1] = -100;
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
