import { describe, it, expect } from "vitest";
import { wheelGeometry } from "../src/overlay";

describe("wheelGeometry (1280x720)", () => {
  it("center: 중심은 영상 중앙, 바깥 반지름 270, 쉼 원판 50.4(이탈 65.52), 글자 216", () => {
    const g = wheelGeometry(1280, 720, "center");
    expect(g.cx).toBe(640);
    expect(g.cy).toBe(360);
    expect(g.outerR).toBeCloseTo(270, 6);
    expect(g.restR).toBeCloseTo(50.4, 6);
    expect(g.restExitR).toBeCloseTo(65.52, 6);
    expect(g.labelR).toBeCloseTo(216, 6);
  });
  it("bottom-right: 반지름 216(높이 30%), 오른쪽 여백 4%, 바닥은 높이 85% 선", () => {
    const g = wheelGeometry(1280, 720, "bottom-right");
    expect(g.outerR).toBeCloseTo(216, 6);
    expect(g.cx).toBeCloseTo(1280 - 51.2 - 216, 6);
    expect(g.cy).toBeCloseTo(612 - 216, 6);
    expect(g.cx + g.outerR).toBeLessThan(1280 - 36); // 오른쪽 음량 막대(폭 8, 오른쪽 여백 28)와 겹치지 않는다
    expect(g.restR).toBeCloseTo(50.4, 6); // 쉼 원판은 위치와 무관
  });
  it("bottom-left: 왼쪽 여백 4%", () => {
    const g = wheelGeometry(1280, 720, "bottom-left");
    expect(g.cx).toBeCloseTo(51.2 + 216, 6);
    expect(g.cy).toBeCloseTo(396, 6);
  });
  it("인자를 생략하면 center", () => {
    expect(wheelGeometry(1280, 720)).toEqual(wheelGeometry(1280, 720, "center"));
  });
});
