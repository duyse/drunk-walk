import { describe, expect, it } from 'vitest';
import { InputManager } from '../src/input/InputManager';
import { MouseInput } from '../src/input/MouseInput';
import { TouchInput } from '../src/input/TouchInput';
import { DeviceOrientationInput } from '../src/input/DeviceOrientationInput';
import { GAME_CONFIG } from '../src/app/GameConfig';

describe('InputManager.normalize', () => {
  it('applies deadzone and clamps', () => {
    expect(InputManager.normalize(0.02)).toBe(0);
    expect(InputManager.normalize(-0.02)).toBe(0);
    expect(InputManager.normalize(1)).toBe(1);
    expect(InputManager.normalize(-1)).toBe(-1);
    expect(InputManager.normalize(0.5, 3)).toBe(1);
    expect(InputManager.normalize(0.5)).toBeGreaterThan(0.4);
  });
});

describe('MouseInput.map', () => {
  it('maps center to 0, edges to ±1 with correct sign', () => {
    expect(MouseInput.map(500, 1000)).toBe(0);
    expect(MouseInput.map(1000, 1000)).toBe(1);
    expect(MouseInput.map(0, 1000)).toBe(-1);
    const range = 1000 * GAME_CONFIG.input.mouseRange;
    expect(MouseInput.map(500 + range / 2, 1000)).toBeCloseTo(0.5);
  });
});

describe('TouchInput.map', () => {
  it('drag right is positive, clamped', () => {
    expect(TouchInput.map(60, 120)).toBe(0.5);
    expect(TouchInput.map(-500, 120)).toBe(-1);
  });
});

describe('DeviceOrientationInput', () => {
  it('neutral calibration gives zero and tilt is relative', () => {
    expect(DeviceOrientationInput.map(12, 12, 20)).toBe(0);
    expect(DeviceOrientationInput.map(22, 12, 20)).toBeCloseTo(0.5);
    expect(DeviceOrientationInput.map(-30, 12, 20)).toBe(-1);
  });
  it('handles gamma wraparound', () => {
    expect(DeviceOrientationInput.map(-85, 85, 20)).toBeCloseTo(0.5);
  });
  it('picks the axis for the screen orientation', () => {
    expect(DeviceOrientationInput.tiltFrom(10, 5, 0)).toBe(5);
    expect(DeviceOrientationInput.tiltFrom(10, 5, 90)).toBe(10);
    expect(DeviceOrientationInput.tiltFrom(10, 5, -90)).toBe(-10);
    expect(DeviceOrientationInput.tiltFrom(null, 5, 0)).toBeNull();
  });
});
