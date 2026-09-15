import * as THREE from 'three';

/** Face states drawn on one small canvas texture; swapped by the animator. */
export type Face = 'relaxed' | 'sleepy' | 'confused' | 'panic' | 'okay' | 'silly' | 'shocked' | 'dead';

const SKIN = new THREE.MeshLambertMaterial({ color: 0xc9a889 });
const HAIR = new THREE.MeshLambertMaterial({ color: 0x2a2320 });
const SHIRT = new THREE.MeshLambertMaterial({ color: 0x4c6f9a });
const SHIRT_DARK = new THREE.MeshLambertMaterial({ color: 0x3a5578 });
const PANTS = new THREE.MeshLambertMaterial({ color: 0x27334c });
const SHOE = new THREE.MeshLambertMaterial({ color: 0x141a26 });
const BOTTLE = new THREE.MeshLambertMaterial({ color: 0x6a8f5a });
const BOTTLE_CAP = new THREE.MeshLambertMaterial({ color: 0xd8d8c0 });

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CAP = new THREE.CapsuleGeometry(0.5, 1, 3, 8);
const SPH = new THREE.SphereGeometry(0.5, 10, 8);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);

function mesh(g: THREE.BufferGeometry, m: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.scale.set(sx, sy, sz);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

/**
 * Original low-poly drunk: oversized head, skinny long limbs, loose shirt.
 * Hierarchy: root > pelvis > torso > (head, arms); root > legs. Pivots sit at joints
 * so the animator rotates parts instead of translating them.
 */
export class CharacterRig {
  readonly root = new THREE.Group();
  readonly pelvis = new THREE.Group();
  readonly torso = new THREE.Group();
  readonly head = new THREE.Group();
  readonly lArm = new THREE.Group();
  readonly rArm = new THREE.Group();
  readonly lForearm = new THREE.Group();
  readonly rForearm = new THREE.Group();
  readonly lLeg = new THREE.Group();
  readonly rLeg = new THREE.Group();
  readonly lShin = new THREE.Group();
  readonly rShin = new THREE.Group();
  readonly bottle = new THREE.Group();
  readonly torsoMesh: THREE.Mesh;
  private faceCtx: CanvasRenderingContext2D;
  private faceTex: THREE.CanvasTexture;
  private currentFace: Face | null = null;

  // Proportions (meters). Total ~1.85 tall with a big head.
  static readonly HIP_Y = 0.92;
  static readonly LEG_LEN = 0.92;

  constructor() {
    const R = CharacterRig;
    this.pelvis.position.y = R.HIP_Y;
    this.root.add(this.pelvis);

    // Hips
    this.pelvis.add(mesh(BOX, PANTS, 0.42, 0.22, 0.26, 0, 0.02, 0));

    // Torso pivot at hips.
    this.torso.position.y = 0.1;
    this.pelvis.add(this.torso);
    this.torsoMesh = mesh(BOX, SHIRT, 0.46, 0.62, 0.28, 0, 0.33, 0);
    this.torso.add(this.torsoMesh);
    this.torso.add(mesh(BOX, SHIRT_DARK, 0.5, 0.14, 0.31, 0, 0.05, 0)); // untucked shirt hem
    this.torso.add(mesh(BOX, SHIRT_DARK, 0.62, 0.12, 0.3, 0, 0.6, 0)); // big loose shoulders
    this.torso.add(mesh(CYL, SKIN, 0.14, 0.12, 0.14, 0, 0.7, 0)); // neck

    // Head: oversized.
    this.head.position.y = 0.76;
    this.torso.add(this.head);
    const skull = mesh(SPH, SKIN, 0.5, 0.54, 0.48, 0, 0.22, 0);
    this.head.add(skull);
    this.head.add(mesh(BOX, SKIN, 0.14, 0.1, 0.12, 0, 0.17, 0.24)); // nose
    this.head.add(mesh(SPH, SKIN, 0.1, 0.14, 0.08, -0.25, 0.2, 0)); // ears
    this.head.add(mesh(SPH, SKIN, 0.1, 0.14, 0.08, 0.25, 0.2, 0));
    // Messy hair: several offset boxes.
    for (const [x, y, z, s] of [
      [0, 0.44, -0.02, 0.44],
      [-0.16, 0.4, 0.1, 0.22],
      [0.18, 0.42, 0.06, 0.2],
      [0.05, 0.36, -0.2, 0.28],
      [-0.2, 0.32, -0.12, 0.18],
      [0.22, 0.3, -0.14, 0.16],
    ]) {
      const h = mesh(BOX, HAIR, s, s * 0.6, s, x, y, z);
      h.rotation.set((x + y) * 1.3, y * 2, x * 1.7);
      this.head.add(h);
    }
    // Face plane with canvas texture.
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    this.faceCtx = c.getContext('2d')!;
    this.faceTex = new THREE.CanvasTexture(c);
    this.faceTex.magFilter = THREE.NearestFilter;
    this.faceTex.minFilter = THREE.LinearFilter;
    const faceMat = new THREE.MeshBasicMaterial({ map: this.faceTex, transparent: true });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), faceMat);
    face.position.set(0, 0.24, 0.235);
    this.head.add(face);
    this.setFace('relaxed');

    // Arms: shoulder pivots at torso top; skinny and long.
    const armLen = 0.42;
    for (const side of [-1, 1] as const) {
      const arm = side < 0 ? this.lArm : this.rArm;
      const fore = side < 0 ? this.lForearm : this.rForearm;
      arm.position.set(side * 0.3, 0.6, 0);
      this.torso.add(arm);
      arm.add(mesh(CAP, SHIRT, 0.13, armLen * 0.8, 0.13, 0, -armLen / 2, 0));
      fore.position.y = -armLen;
      arm.add(fore);
      fore.add(mesh(CAP, SKIN, 0.11, armLen * 0.78, 0.11, 0, -armLen / 2, 0));
      fore.add(mesh(SPH, SKIN, 0.15, 0.15, 0.15, 0, -armLen, 0)); // hand
    }
    // Bottle lives in the right hand; hidden until drinking.
    this.bottle.position.set(0, -armLen - 0.05, 0.06);
    this.rForearm.add(this.bottle);
    this.bottle.add(mesh(CYL, BOTTLE, 0.09, 0.28, 0.09, 0, 0.1, 0));
    this.bottle.add(mesh(CYL, BOTTLE, 0.045, 0.12, 0.045, 0, 0.3, 0));
    this.bottle.add(mesh(CYL, BOTTLE_CAP, 0.05, 0.03, 0.05, 0, 0.37, 0));
    this.bottle.visible = false;

    // Legs: hip pivots; knee pivots for shins.
    const thigh = R.LEG_LEN * 0.5;
    for (const side of [-1, 1] as const) {
      const leg = side < 0 ? this.lLeg : this.rLeg;
      const shin = side < 0 ? this.lShin : this.rShin;
      leg.position.set(side * 0.13, R.HIP_Y - 0.02, 0);
      this.root.add(leg);
      leg.add(mesh(CAP, PANTS, 0.16, thigh * 0.8, 0.16, 0, -thigh / 2, 0));
      shin.position.y = -thigh;
      leg.add(shin);
      shin.add(mesh(CAP, PANTS, 0.14, thigh * 0.8, 0.14, 0, -thigh / 2, 0));
      shin.add(mesh(BOX, SHOE, 0.18, 0.1, 0.32, 0, -thigh + 0.03, 0.07)); // shoe
    }
  }

  setFace(f: Face): void {
    if (f === this.currentFace) return;
    this.currentFace = f;
    const ctx = this.faceCtx;
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#1a1410';
    ctx.strokeStyle = '#1a1410';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    const eye = (x: number, y: number, open: number, pupil = true) => {
      // open: 0 closed, 1 wide
      const h = 4 + open * 14;
      ctx.fillStyle = '#f2f0e8';
      ctx.beginPath();
      ctx.ellipse(x, y, 13, h, 0, 0, Math.PI * 2);
      ctx.fill();
      if (pupil && open > 0.15) {
        ctx.fillStyle = '#1a1410';
        ctx.beginPath();
        ctx.arc(x + (f === 'confused' ? 4 : 0), y + 2, Math.min(h - 2, 6), 0, Math.PI * 2);
        ctx.fill();
      }
      if (open < 0.6) {
        // lid line
        ctx.fillStyle = '#c9a889';
        ctx.fillRect(x - 14, y - h - 1, 28, h * (1 - open) + 1);
        ctx.strokeStyle = '#1a1410';
        ctx.beginPath();
        ctx.moveTo(x - 12, y - h * open);
        ctx.lineTo(x + 12, y - h * open);
        ctx.stroke();
      }
    };
    const mouth = (kind: 'smile' | 'flat' | 'o' | 'wobble' | 'frown' | 'grin') => {
      ctx.strokeStyle = '#1a1410';
      ctx.fillStyle = '#1a1410';
      ctx.beginPath();
      switch (kind) {
        case 'smile':
          ctx.arc(64, 84, 16, 0.15 * Math.PI, 0.85 * Math.PI);
          ctx.stroke();
          break;
        case 'grin':
          ctx.arc(64, 80, 22, 0.1 * Math.PI, 0.9 * Math.PI);
          ctx.stroke();
          break;
        case 'flat':
          ctx.moveTo(48, 92);
          ctx.lineTo(80, 92);
          ctx.stroke();
          break;
        case 'frown':
          ctx.arc(64, 106, 16, 1.15 * Math.PI, 1.85 * Math.PI);
          ctx.stroke();
          break;
        case 'o':
          ctx.ellipse(64, 94, 10, 14, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'wobble':
          ctx.moveTo(44, 92);
          for (let i = 0; i <= 8; i++) ctx.lineTo(44 + i * 5, 92 + (i % 2 ? 5 : -5));
          ctx.stroke();
          break;
      }
    };
    switch (f) {
      case 'relaxed':
        eye(42, 52, 0.7);
        eye(86, 52, 0.7);
        mouth('smile');
        break;
      case 'sleepy':
        eye(42, 54, 0.3);
        eye(86, 54, 0.35);
        mouth('smile');
        break;
      case 'confused':
        eye(42, 52, 0.55);
        eye(86, 50, 0.9);
        mouth('wobble');
        break;
      case 'panic':
        eye(42, 50, 1);
        eye(86, 50, 1);
        mouth('o');
        break;
      case 'okay':
        eye(42, 52, 0.5);
        eye(86, 52, 0.5);
        mouth('grin');
        break;
      case 'silly':
        eye(42, 52, 0.2);
        eye(86, 52, 0.25);
        mouth('grin');
        break;
      case 'shocked':
        eye(42, 48, 1);
        eye(86, 48, 1);
        mouth('frown');
        break;
      case 'dead':
        eye(42, 52, 0.05, false);
        eye(86, 52, 0.05, false);
        mouth('wobble');
        break;
    }
    // rosy drunk cheeks
    if (f === 'sleepy' || f === 'silly' || f === 'okay') {
      ctx.fillStyle = 'rgba(200,90,90,0.45)';
      ctx.beginPath();
      ctx.ellipse(28, 76, 10, 6, 0, 0, Math.PI * 2);
      ctx.ellipse(100, 76, 10, 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    this.faceTex.needsUpdate = true;
  }
}
