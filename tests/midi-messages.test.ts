import { describe, it, expect } from "vitest";
import {
  clamp7,
  statusByte,
  noteOn,
  noteOff,
  controlChange,
  levelToCc,
  chordChange,
  panicMessages,
  CC_ALL_NOTES_OFF,
  CC_ALL_SOUND_OFF,
} from "../src/midi-messages";

describe("clamp7: 0~127 정수", () => {
  it.each([
    [60, 60],
    [127.4, 127],
    [200, 127],
    [-5, 0],
    [73.66, 74],
    [Number.NaN, 0],
  ])("%s → %s", (v, out) => expect(clamp7(v)).toBe(out));
});

describe("statusByte: 상태 바이트 + 채널(1~16)", () => {
  it("채널 1은 하위 4비트 0, 채널 16은 15", () => {
    expect(statusByte(0x90, 1)).toBe(0x90);
    expect(statusByte(0x90, 16)).toBe(0x9f);
    expect(statusByte(0xb0, 2)).toBe(0xb1);
  });
  it("채널 0·17·소수는 예외", () => {
    expect(() => statusByte(0x90, 0)).toThrow();
    expect(() => statusByte(0x90, 17)).toThrow();
    expect(() => statusByte(0x90, 1.5)).toThrow();
  });
});

describe("Note On / Note Off / CC", () => {
  it("noteOn(1, 60, 100) = [0x90, 60, 100]", () => expect(noteOn(1, 60, 100)).toEqual([0x90, 60, 100]));
  it("벨로시티는 1~127로 클램프 (0은 Note Off로 해석되므로 1)", () => {
    expect(noteOn(1, 60, 200)[2]).toBe(127);
    expect(noteOn(1, 60, 0)[2]).toBe(1);
  });
  it("noteOff(1, 60) = [0x80, 60, 0]", () => expect(noteOff(1, 60)).toEqual([0x80, 60, 0]));
  it("controlChange(1, 11, 74) = [0xB0, 11, 74]", () => expect(controlChange(1, 11, 74)).toEqual([0xb0, 11, 74]));
});

describe("levelToCc: level(=펼침²) → 펼침에 비례하는 0~127", () => {
  it("0 → 0, 1 → 127, 1.5 → 127(클램프), 음수 → 0", () => {
    expect(levelToCc(0)).toBe(0);
    expect(levelToCc(1)).toBe(127);
    expect(levelToCc(1.5)).toBe(127);
    expect(levelToCc(-0.2)).toBe(0);
  });
  it("펼침 58%(level 0.3364) → 74", () => expect(levelToCc(0.58 * 0.58)).toBe(74));
  it("펼침 50%(level 0.25) → 64", () => expect(levelToCc(0.25)).toBe(64));
});

describe("chordChange: 이전 음 Off 전부 → 새 음 On 전부", () => {
  it("Em6 → A 전환", () => {
    expect(chordChange([40, 52], [45, 57], 1, 100)).toEqual([
      [0x80, 40, 0],
      [0x80, 52, 0],
      [0x90, 45, 100],
      [0x90, 57, 100],
    ]);
  });
  it("이전 음 없음 → On만, 새 음 없음 → Off만", () => {
    expect(chordChange([], [45], 1, 100)).toEqual([[0x90, 45, 100]]);
    expect(chordChange([40], [], 1, 100)).toEqual([[0x80, 40, 0]]);
  });
  it("공통 음도 다시 친다(Off 뒤 On)", () => {
    expect(chordChange([40, 52], [52, 59], 1, 100)).toEqual([
      [0x80, 40, 0],
      [0x80, 52, 0],
      [0x90, 52, 100],
      [0x90, 59, 100],
    ]);
  });
});

describe("panicMessages: 들고 있던 음 Off + CC123 + CC120", () => {
  it("순서와 값", () => {
    expect(panicMessages([40, 52], 1)).toEqual([
      [0x80, 40, 0],
      [0x80, 52, 0],
      [0xb0, CC_ALL_NOTES_OFF, 0],
      [0xb0, CC_ALL_SOUND_OFF, 0],
    ]);
    expect(CC_ALL_NOTES_OFF).toBe(123);
    expect(CC_ALL_SOUND_OFF).toBe(120);
  });
  it("들고 있던 음이 없어도 CC 두 개는 나간다", () => expect(panicMessages([], 1)).toHaveLength(2));
});
