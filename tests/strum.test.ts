import { describe, it, expect } from "vitest";
import { StrumDetector, stringLines, velocityFromSpeed } from "../src/strum";

const H = 720;
const LINES = stringLines(H, 0.36, 0.055, 6); // 테스트용 배치(실제 config는 topY 0.34): 259.2, 298.8, 338.4, 378, 417.6, 457.2
const BAND = { x0: 0, x1: 500 };
const det = () => new StrumDetector({ rearmDistRatio: 0.012, minSpeed: 0.05, maxJumpRatio: 0.2, graceMs: 100, refractoryMs: 60 });
const up = (d: StrumDetector, y: number, t: number, x = 100) => d.update({ x, y }, t, LINES, BAND, H);

describe("stringLines", () => {
  it("6줄을 위에서 아래로 균등 배치한다", () => {
    expect(LINES.length).toBe(6);
    expect(LINES[0]).toBeCloseTo(259.2, 6);
    expect(LINES[5]).toBeCloseTo(457.2, 6);
  });
});

describe("StrumDetector", () => {
  it("첫 프레임은 타격이 없고, 한 줄을 아래로 지나면 down 1건", () => {
    const d = det();
    expect(up(d, 250, 0)).toEqual([]);
    const ev = up(d, 270, 33);
    expect(ev.length).toBe(1);
    expect(ev[0]).toMatchObject({ string: 0, dir: "down" });
  });
  it("위로 지나면 up", () => {
    const d = det();
    up(d, 270, 0);
    expect(up(d, 250, 33)[0]).toMatchObject({ string: 0, dir: "up" });
  });
  it("한 프레임에 3줄을 지나면 보간 시각 순으로 돌려준다", () => {
    const d = det();
    up(d, 250, 0);
    const ev = up(d, 350, 40); // 259.2, 298.8, 338.4 통과
    expect(ev.map((e) => e.string)).toEqual([0, 1, 2]);
    expect(ev[0]!.tMs).toBeCloseTo((40 * (259.2 - 250)) / 100, 3);
    expect(ev[1]!.tMs).toBeCloseTo((40 * (298.8 - 250)) / 100, 3);
    expect(ev[2]!.tMs).toBeGreaterThan(ev[1]!.tMs);
  });
  it("교차 지점 x가 대역 밖이면 무시한다", () => {
    const d = det();
    up(d, 250, 0, 600);
    expect(up(d, 270, 33, 600)).toEqual([]);
  });
  it("느린 통과(0.08 영상높이/초)도 센다 — 아르페지오", () => {
    const d = det();
    up(d, 240, 0);
    up(d, 256, 33); // 아직 위
    expect(up(d, 258, 66)).toEqual([]);
    expect(up(d, 260, 99).length).toBe(1); // 2px/33ms = 0.084 H/s
  });
  it("줄 근처 떨림(±3px)은 재장전 거리(8.6px) 미만이라 한 번도 세지 않는다", () => {
    const d = det();
    up(d, 257, 0); // 줄 바로 위에서 등장 → 장전 안 됨
    let n = 0;
    for (let i = 1; i <= 10; i++) n += up(d, i % 2 ? 262 : 257, i * 33).length;
    expect(n).toBe(0);
  });
  it("타격 뒤 줄에서 8.6px 이상 떨어져야 다음 타격을 센다", () => {
    const d = det();
    up(d, 240, 0);
    expect(up(d, 262, 33).length).toBe(1); // 타격, 줄에서 2.8px → 미장전
    expect(up(d, 256, 66)).toEqual([]); // 되돌아 지났지만 미장전
    up(d, 240, 99); // 19px 떨어짐 → 장전
    expect(up(d, 262, 132).length).toBe(1);
  });
  it("같은 줄은 60 ms 안에 다시 치지 않는다(불응기)", () => {
    const d = det();
    up(d, 230, 0);
    expect(up(d, 290, 20).length).toBe(1); // 30px 지나감 → 장전됨
    expect(up(d, 230, 40).length).toBe(0); // 20 ms 뒤 되돌아옴 → 불응기
    expect(up(d, 290, 120).length).toBe(1);
  });
  it("프레임당 변위가 0.2H를 넘으면 순간이동으로 보고 타격 없음", () => {
    const d = det();
    up(d, 250, 0);
    expect(up(d, 650, 33)).toEqual([]); // 0.56H 점프(라벨 뒤바뀜)
    expect(up(d, 640, 66)).toEqual([]); // 이후 정상 추적
  });
  it("순간이동 착지점이 줄 바로 옆이면 그 뒤 떨림은 타격이 아니다(장전 재계산)", () => {
    const d = det();
    up(d, 600, 0);
    expect(up(d, 260, 33)).toEqual([]); // 0.47H 점프, 줄 0(259.2) 바로 옆에 착지
    expect(up(d, 258, 66)).toEqual([]); // 2px 떨림으로 줄을 지나도 미장전
    up(d, 240, 99); // 19px 떨어짐 → 장전
    expect(up(d, 262, 132).length).toBe(1);
  });
  it("최소 속도(0.05 H/s) 미만의 통과는 세지 않는다", () => {
    const d = det();
    up(d, 240, 0);
    up(d, 258.5, 33);
    expect(up(d, 259.5, 1033)).toEqual([]); // 1px/1s = 0.0014 H/s
  });
  it("직전 프레임에 정확히 줄 위에 있었으면 그때 이미 쳤으므로 다시 세지 않는다", () => {
    const d = det();
    up(d, 240, 0);
    expect(up(d, 259.2, 33).length).toBe(1); // 닿는 순간 1회
    expect(up(d, 280, 66)).toEqual([]); // 줄 위에서 출발 → 없음
  });
  it("100 ms 안의 공백은 잇는다(공백 전 위치 → 재등장 위치)", () => {
    const d = det();
    up(d, 250, 0);
    d.update(null, 33, LINES, BAND, H);
    const ev = up(d, 350, 66);
    expect(ev.map((e) => e.string)).toEqual([0, 1, 2]);
  });
  it("100 ms를 넘는 공백 뒤에는 새 손으로 본다", () => {
    const d = det();
    up(d, 250, 0);
    d.update(null, 33, LINES, BAND, H);
    expect(up(d, 350, 200)).toEqual([]);
  });
  it("속도는 영상 높이/초 단위", () => {
    const d = det();
    up(d, 230, 0);
    const ev = up(d, 302, 100); // 72px/0.1s = 1 H/s
    expect(ev[0]!.speed).toBeCloseTo(1, 6);
  });
});

describe("velocityFromSpeed", () => {
  it("soft 이하 최소, hard 이상 1, 중간은 선형", () => {
    expect(velocityFromSpeed(0.1, 0.4, 2.5, 0.35)).toBeCloseTo(0.35, 6);
    expect(velocityFromSpeed(3, 0.4, 2.5, 0.35)).toBeCloseTo(1, 6);
    expect(velocityFromSpeed(1.45, 0.4, 2.5, 0.35)).toBeCloseTo(0.675, 6);
    expect(velocityFromSpeed(Number.NaN, 0.4, 2.5, 0.35)).toBeCloseTo(0.35, 6);
  });
});
