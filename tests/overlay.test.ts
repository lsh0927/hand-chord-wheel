import { describe, it, expect } from "vitest";
import { wheelGeometry } from "../src/overlay";

describe("wheelGeometry (1280x720)", () => {
  const g = wheelGeometry(1280, 720);
  it("중심은 영상 중앙", () => {
    expect(g.cx).toBe(640);
    expect(g.cy).toBe(360);
  });
  it("바깥 반지름 270, 쉼 원판 50.4(이탈 65.52), 글자 216", () => {
    expect(g.outerR).toBeCloseTo(270, 6);
    expect(g.restR).toBeCloseTo(50.4, 6);
    expect(g.restExitR).toBeCloseTo(65.52, 6);
    expect(g.labelR).toBeCloseTo(216, 6);
  });
});
