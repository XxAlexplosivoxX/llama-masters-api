import { describe, expect, it } from "vite-plus/test";
import { against } from "./Calendar";

describe("against", () => {
  it("words the ratio", () => {
    expect(against(2.4)).toBe("2.4 times its usual level");
    expect(against(1.31)).toBe("31% above its usual level");
    expect(against(0.62)).toBe("38% below its usual level");
    expect(against(1.01)).toBe("right at its usual level");
  });
  it("never uses dashes", () => {
    for (const r of [0, 0.1, 0.62, 0.98, 1, 1.01, 1.31, 1.94, 1.95, 2.4, 10]) {
      expect(against(r)).not.toMatch(/[\u2014\u2013]/);
    }
  });
});
