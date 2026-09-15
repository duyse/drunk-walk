import * as THREE from 'three';

/** Shared geometries/materials for the whole city. Everything Lambert, everything blue. */
export const MAT = {
  road: new THREE.MeshLambertMaterial({ color: 0x0b1626 }),
  roadLine: new THREE.MeshBasicMaterial({ color: 0x1f3d60 }), // unlit: constant retro paint
  sidewalk: new THREE.MeshLambertMaterial({ color: 0x13233a }),
  curb: new THREE.MeshLambertMaterial({ color: 0x1b3050 }),
  building: [
    new THREE.MeshLambertMaterial({ color: 0x0e1c30 }),
    new THREE.MeshLambertMaterial({ color: 0x10203a }),
    new THREE.MeshLambertMaterial({ color: 0x0c1a2c }),
    new THREE.MeshLambertMaterial({ color: 0x142642 }),
  ],
  windowLit: new THREE.MeshBasicMaterial({ color: 0x4fa8d8 }),
  windowDim: new THREE.MeshBasicMaterial({ color: 0x1e3a58 }),
  windowDark: new THREE.MeshLambertMaterial({ color: 0x081120 }),
  metal: new THREE.MeshLambertMaterial({ color: 0x223a58 }),
  lampGlow: new THREE.MeshBasicMaterial({ color: 0x9fdcff }),
  car: [
    new THREE.MeshLambertMaterial({ color: 0x1d3a5c }),
    new THREE.MeshLambertMaterial({ color: 0x2b4466 }),
    new THREE.MeshLambertMaterial({ color: 0x182c48 }),
  ],
  tire: new THREE.MeshLambertMaterial({ color: 0x060a12 }),
  sign: new THREE.MeshBasicMaterial({ color: 0x66c6f2 }),
  signBack: new THREE.MeshLambertMaterial({ color: 0x1a2f4a }),
  trash: new THREE.MeshLambertMaterial({ color: 0x1a2c44 }),
  far: new THREE.MeshBasicMaterial({ color: 0x08111f }),
};

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cylLow: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  sphere: new THREE.SphereGeometry(0.5, 8, 6),
  plane: new THREE.PlaneGeometry(1, 1),
};

export function box(mat: THREE.Material, w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(GEO.box, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  return m;
}

/** Window grid as a single InstancedMesh — one draw call per facade. */
export function windowGrid(
  cols: number,
  rows: number,
  w: number,
  h: number,
  gapX: number,
  gapY: number,
  rng: () => number,
  litChance = 0.35,
): THREE.Group {
  const g = new THREE.Group();
  const lit = new THREE.InstancedMesh(GEO.plane, MAT.windowLit, cols * rows);
  const dim = new THREE.InstancedMesh(GEO.plane, MAT.windowDim, cols * rows);
  const m = new THREE.Matrix4();
  let nl = 0;
  let nd = 0;
  const x0 = -((cols - 1) * gapX) / 2;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      m.makeScale(w, h, 1).setPosition(x0 + c * gapX, r * gapY, 0);
      const roll = rng();
      if (roll < litChance) lit.setMatrixAt(nl++, m);
      else if (roll < 0.8) dim.setMatrixAt(nd++, m);
    }
  lit.count = nl;
  dim.count = nd;
  lit.instanceMatrix.needsUpdate = true;
  dim.instanceMatrix.needsUpdate = true;
  g.add(lit, dim);
  return g;
}

export function building(rng: () => number, width: number, depth: number, height: number): THREE.Group {
  const g = new THREE.Group();
  const mat = MAT.building[Math.floor(rng() * MAT.building.length)];
  g.add(box(mat, width, height, depth, 0, height / 2, 0));
  const cols = Math.max(1, Math.floor(width / 1.3));
  const rows = Math.max(1, Math.floor((height - 1.5) / 1.6));
  const win = windowGrid(cols, rows, 0.6, 0.9, width / cols, 1.6, rng);
  win.position.set(0, 1.6, depth / 2 + 0.01);
  g.add(win);
  // Roof detail / water tank for silhouette variety.
  if (rng() < 0.4) {
    const t = new THREE.Mesh(GEO.cylLow, MAT.metal);
    t.scale.set(1, 1.3, 1);
    t.position.set((rng() - 0.5) * width * 0.5, height + 0.65, 0);
    g.add(t);
  }
  return g;
}

export function streetLamp(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(GEO.cylLow, MAT.metal);
  pole.scale.set(0.12, 4.2, 0.12);
  pole.position.y = 2.1;
  g.add(pole);
  g.add(box(MAT.metal, 0.9, 0.1, 0.1, 0.4, 4.2, 0));
  const head = box(MAT.lampGlow, 0.5, 0.18, 0.28, 0.8, 4.15, 0);
  g.add(head);
  g.rotation.z = (rng() - 0.5) * 0.06; // slightly crooked, on purpose
  return g;
}

export function car(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const mat = MAT.car[Math.floor(rng() * MAT.car.length)];
  g.add(box(mat, 1.8, 0.55, 4, 0, 0.55, 0));
  g.add(box(mat, 1.6, 0.5, 2.2, 0, 1.05, -0.2));
  g.add(box(MAT.windowDark, 1.62, 0.32, 2.0, 0, 1.1, -0.2));
  for (const [x, z] of [
    [-0.85, 1.3],
    [0.85, 1.3],
    [-0.85, -1.3],
    [0.85, -1.3],
  ]) {
    const t = new THREE.Mesh(GEO.cylLow, MAT.tire);
    t.rotation.z = Math.PI / 2;
    t.scale.set(0.6, 0.25, 0.6);
    t.position.set(x, 0.3, z);
    g.add(t);
  }
  g.rotation.y = (rng() - 0.5) * 0.25; // badly parked
  return g;
}

export function trashCan(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.Mesh(GEO.cylLow, MAT.trash);
  c.scale.set(0.55, 0.9, 0.55);
  c.position.y = 0.45;
  g.add(c);
  g.add(box(MAT.metal, 0.62, 0.08, 0.62, 0, 0.92, 0));
  g.rotation.z = (rng() - 0.5) * 0.35;
  return g;
}

export function bench(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(MAT.metal, 1.6, 0.08, 0.45, 0, 0.45, 0));
  g.add(box(MAT.metal, 1.6, 0.4, 0.08, 0, 0.7, -0.2));
  g.add(box(MAT.metal, 0.08, 0.45, 0.4, -0.7, 0.22, 0));
  g.add(box(MAT.metal, 0.08, 0.45, 0.4, 0.7, 0.22, 0));
  return g;
}

/** Generic glowing shop sign: a bar of light on a dark plate. Original, no text. */
export function shopSign(rng: () => number): THREE.Group {
  const g = new THREE.Group();
  const w = 1.6 + rng() * 1.4;
  g.add(box(MAT.signBack, w, 0.6, 0.12, 0, 0, 0));
  const bars = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < bars; i++) {
    const bw = (w - 0.3) / bars - 0.12;
    g.add(box(MAT.sign, bw, 0.22, 0.02, -w / 2 + 0.15 + bw / 2 + i * (bw + 0.12), 0, 0.07));
  }
  g.rotation.z = (rng() - 0.5) * 0.12;
  return g;
}

export function hydrant(): THREE.Group {
  const g = new THREE.Group();
  const c = new THREE.Mesh(GEO.cylLow, MAT.curb);
  c.scale.set(0.3, 0.7, 0.3);
  c.position.y = 0.35;
  g.add(c);
  const top = new THREE.Mesh(GEO.sphere, MAT.curb);
  top.scale.set(0.34, 0.25, 0.34);
  top.position.y = 0.72;
  g.add(top);
  return g;
}
