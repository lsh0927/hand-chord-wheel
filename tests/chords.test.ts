import { describe, it, expect } from "vitest";
import { chordToMidi, isValidChord, parsePalette } from "../src/chords";

// tonal 6.4.3 실행값 (2026-10-06 검증). 근음(2옥타브) + 구성음(3옥타브부터).
const EXPECTED: Array<[string, number[]]> = [
  ["B", [47, 59, 63, 66]],
  ["Em6", [40, 52, 55, 59, 61]],
  ["A9", [45, 57, 61, 64, 67, 71]],
  ["D#7", [39, 51, 55, 58, 61]],
  ["G#m", [44, 56, 59, 63]],
  ["A", [45, 57, 61, 64]],
  ["B7", [47, 59, 63, 66, 69]],
  ["Emaj7", [40, 52, 56, 59, 63]],
  ["E6", [40, 52, 56, 59, 61]],
  ["G", [43, 55, 59, 62]],
  ["F#7sus4", [42, 54, 59, 61, 64]],
  ["C#m7", [37, 49, 52, 56, 59]],
];

describe("chordToMidi", () => {
  it.each(EXPECTED)("%s → %j", (symbol, midi) => expect(chordToMidi(symbol)).toEqual(midi));
  it("읽을 수 없는 기호는 빈 배열", () => expect(chordToMidi("Hxx")).toEqual([]));
  it("근음 없는 기호(maj7)는 빈 배열", () => expect(chordToMidi("maj7")).toEqual([]));
  it("D#7의 겹올림표(F##3)도 MIDI 55로 변환된다", () => expect(chordToMidi("D#7")).toContain(55));
  it("유효한 코드는 항상 1음 이상", () => {
    for (const [s] of EXPECTED) expect(chordToMidi(s).length).toBeGreaterThan(0);
  });
});

describe("isValidChord", () => {
  it("B, F#7sus4는 유효", () => {
    expect(isValidChord("B")).toBe(true);
    expect(isValidChord("F#7sus4")).toBe(true);
  });
  it("Hxx, maj7, 빈 문자열은 무효", () => {
    expect(isValidChord("Hxx")).toBe(false);
    expect(isValidChord("maj7")).toBe(false);
    expect(isValidChord("")).toBe(false);
  });
});

describe("parsePalette", () => {
  const DEFAULT = "B Em6 A9 D#7 G#m A B7 Emaj7 E6 G F#7sus4 C#m7";
  it("공백 구분 12개 통과, 표기 그대로 유지", () => {
    const r = parsePalette(DEFAULT, 6, 16);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chords).toEqual(DEFAULT.split(" "));
  });
  it("쉼표·연속 공백·앞뒤 공백 허용", () => {
    const r = parsePalette("  B, Em6,  A9 D#7 ,G#m A ", 6, 16);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chords).toEqual(["B", "Em6", "A9", "D#7", "G#m", "A"]);
  });
  it("소문자 근음은 표준 표기로 정규화 (em6 → Em6, bb → Bb)", () => {
    const r = parsePalette("em6 a9 bb Bbmaj7 f#7sus4 G", 6, 16);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.chords).toEqual(["Em6", "A9", "Bb", "Bbmaj7", "F#7sus4", "G"]);
  });
  it("6개 미만 거부", () => {
    const r = parsePalette("B Em6 A9", 6, 16);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("6~16");
  });
  it("16개 초과 거부", () => {
    const r = parsePalette(Array(17).fill("C").join(" "), 6, 16);
    expect(r.ok).toBe(false);
  });
  it("잘못된 기호 목록 반환, 나머지는 통과시키지 않음", () => {
    const r = parsePalette("B Em6 Hxx A9 D#7 Zq", 6, 16);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.invalid).toEqual(["Hxx", "Zq"]);
  });
});
