import { describe, expect, it } from "vite-plus/test";
import { ease, turn, visible, type View } from "./draw";

describe("visible", () => {
  it("sees the centre, not the antipode", () => {
    expect(visible(10, 20, 10, 20)).toBe(true);
    expect(visible(-170, -20, 10, 20)).toBe(false);
  });
  it("cuts at the horizon", () => {
    expect(visible(89, 0, 0, 0)).toBe(true);
    expect(visible(91, 0, 0, 0)).toBe(false);
  });
  it("works across the antimeridian", () => {
    expect(visible(-179, 0, 179, 0)).toBe(true);
    expect(visible(0, 0, 179, 0)).toBe(false);
    expect(visible(-100, 0, 170, 0)).toBe(false);
    expect(visible(-91, 0, 0, 0)).toBe(false);
    expect(visible(-89, 0, 0, 0)).toBe(true);
  });
});

describe("turn", () => {
  it("takes the short way", () => {
    expect(turn(350, 10)).toBe(20);
    expect(turn(10, 350)).toBe(-20);
    expect(turn(0, 180)).toBe(180);
    expect(turn(0, 0)).toBe(0);
  });
  it("stays within -180..180", () => {
    for (let a = -720; a <= 720; a += 37) {
      for (let b = -720; b <= 720; b += 53) {
        const d = turn(a, b);
        expect(d).toBeGreaterThanOrEqual(-180);
        expect(d).toBeLessThanOrEqual(180);
        expect((((a + d - b) % 360) + 360) % 360).toBeCloseTo(0, 6);
      }
    }
  });
});

describe("ease", () => {
  const a: View = { lon: 350, lat: 0, x: 0, y: 0, radius: 10, dim: 0 };
  const b: View = { lon: 10, lat: 40, x: 1, y: 1, radius: 30, dim: 1 };
  it("k = 1 lands on the target", () => {
    const e = ease(a, b, 1);
    expect(((e.lon % 360) + 360) % 360).toBeCloseTo(10, 6);
    expect(e).toMatchObject({ lat: 40, x: 1, y: 1, radius: 30, dim: 1 });
  });
  it("k = 0 stays", () => {
    expect(ease(a, b, 0)).toEqual(a);
  });
  it("lon goes the short way", () => {
    expect(ease(a, b, 0.5).lon).toBeCloseTo(360, 6);
  });
});
