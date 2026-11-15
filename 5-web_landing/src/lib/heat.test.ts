import { describe, expect, it } from "vite-plus/test";
import { heat } from "./heat";

describe("heat", () => {
  it("starts and ends on the ramp stops", () => {
    expect(heat(0)).toBe("rgb(59, 15, 112)");
    expect(heat(1)).toBe("rgb(252, 253, 191)");
  });
  it("clamps and survives bad input", () => {
    for (const v of [-5, 7, NaN, Infinity, -Infinity]) {
      expect(heat(v)).toMatch(/^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/);
    }
    expect(heat(-1)).toBe(heat(0));
    expect(heat(9)).toBe(heat(1));
    expect(heat(NaN)).toBe(heat(0));
  });
  it("differs in the middle", () => {
    expect(heat(0.25)).not.toBe(heat(0));
    expect(heat(0.25)).not.toBe(heat(1));
  });
});
