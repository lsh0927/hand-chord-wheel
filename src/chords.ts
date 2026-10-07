import { Chord, Note } from "tonal";

export type PaletteParse =
  | { ok: true; chords: string[] }
  | { ok: false; invalid: string[]; reason: string };

/** tonal이 읽을 수 있고 근음이 있는 코드 기호인가. "maj7"처럼 근음 없는 기호는 empty=false지만 tonic이 비어 있어 거부. */
export function isValidChord(symbol: string): boolean {
  if (!symbol) return false;
  const c = Chord.get(symbol);
  return !c.empty && !!c.tonic;
}

/** 근음을 2옥타브에, 구성음을 3옥타브부터 쌓은 MIDI 번호 배열. 읽을 수 없으면 []. */
export function chordToMidi(symbol: string): number[] {
  const c = Chord.get(symbol);
  if (c.empty || !c.tonic) return [];
  const notes = Chord.notes(symbol, `${c.tonic}3`);
  const midis = notes.map((n) => Note.midi(n)).filter((m): m is number => m !== null);
  const root = Note.midi(`${c.tonic}2`);
  return root === null ? midis : [root, ...midis];
}

/** 공백/쉼표로 구분된 팔레트 문자열 검사. 통과한 기호는 tonal의 표준 표기(Chord.get().symbol)로 정규화한다. */
export function parsePalette(input: string, min: number, max: number): PaletteParse {
  const tokens = input
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length < min || tokens.length > max) {
    return { ok: false, invalid: [], reason: `코드 수는 ${min}~${max}개여야 합니다 (현재 ${tokens.length}개)` };
  }
  const invalid = tokens.filter((t) => !isValidChord(t));
  if (invalid.length > 0) return { ok: false, invalid, reason: "읽을 수 없는 코드 기호" };
  const chords = tokens.map((t) => Chord.get(t).symbol || t);
  return { ok: true, chords };
}
