import * as THREE from 'three';

export type Quality = 'high' | 'medium' | 'low';

export function detectQuality(): Quality {
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  const px = screen.width * screen.height * Math.min(devicePixelRatio, 2);
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  if (cores <= 2 || mem <= 2) return 'low';
  if (mobile || cores <= 4 || px > 2_600_000) return 'medium';
  return 'high';
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  quality: Quality;
  private onResize = () => this.resize();
  onQualityChange: ((q: Quality) => void) | null = null;
  // Rolling FPS probe: step quality down if we can't hold ~50 fps.
  private probeFrames = 0;
  private probeTime = 0;
  private probeDone = false;

  constructor(canvas: HTMLCanvasElement, quality = detectQuality()) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality !== 'low',
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.applyQuality();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  static webglAvailable(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  private applyQuality(): void {
    const cap = this.quality === 'high' ? 1.5 : this.quality === 'medium' ? 1.25 : 1;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, cap));
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
  }

  resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  get aspect(): number {
    return window.innerWidth / Math.max(1, window.innerHeight);
  }

  /** Call every rendered frame during gameplay. Steps quality down once if needed. */
  probe(dt: number): void {
    if (this.probeDone || this.quality === 'low') return;
    this.probeFrames++;
    this.probeTime += dt;
    if (this.probeTime < 4) return;
    const fps = this.probeFrames / this.probeTime;
    this.probeDone = true;
    if (fps < 48) {
      this.quality = this.quality === 'high' ? 'medium' : 'low';
      this.applyQuality();
      this.onQualityChange?.(this.quality);
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
