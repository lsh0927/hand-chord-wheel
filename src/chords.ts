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

/**
 * 기타 모양 보이싱. tonal의 음정으로 역할(근음·3도/sus·5도·7도·추가음)을 나누고 코드 종류별 틀에 맞춰
 * "직전 음보다 높은 가장 가까운 그 음"을 쌓는다. 근음은 lowest(E2=40) 이상에서 가장 가까운 음.
 *   3화음 R-5-R-3-5-R (E자 바레) · 7화음 R-5-7-3-5-R (E7 모양) · 6/add R-5-R-3-X-R · 9화음 R-3-7-X-5-R · 파워 R-5-R-5-R-5
 * 틀이 둘이면 윗음이 근음+27반음을 넘지 않는 첫 틀을 고른다(Cadd9처럼 치솟는 배치 방지).
 */
export function voicing(symbol: string, count = 6, lowest = 40): number[] {
  const parsed = Chord.get(symbol);
  if (parsed.empty || !parsed.tonic) return [];
  // 슬래시 코드(C/G)는 tonal이 음정을 베이스 기준으로 회전해(5P·8P·10M) 역할 분류가 깨진다. 6줄 틀은 베이스를 따로 둘 수 없으므로 베이스를 떼고 본다
  const c = parsed.root ? Chord.get([parsed.tonic, parsed.aliases[0] ?? ""]) : parsed;
  if (c.empty || !c.tonic) return [];
  const rootPc = Note.get(c.tonic).chroma;
  if (typeof rootPc !== "number") return [];
  let fifth: number | undefined;
  let third: number | undefined;
  let seventh: number | undefined;
  const extras: number[] = [];
  c.intervals.forEach((iv, i) => {
    const pc = Note.get(c.notes[i] ?? "").chroma;
    if (typeof pc !== "number") return;
    const deg = parseInt(iv, 10);
    if (deg === 1) return;
    if (deg === 5 && fifth === undefined) fifth = pc;
    else if ((deg === 3 || deg === 2 || deg === 4) && third === undefined) third = pc;
    else if (deg === 7 && seventh === undefined) seventh = pc;
    else extras.push(pc);
  });
  const R = rootPc;
  const F = fifth ?? third ?? R;
  const T = third ?? fifth ?? R;
  const S = seventh;
  const X = extras[0];
  let templates: number[][];
  if (S !== undefined && X !== undefined) templates = [[R, T, S, X, F, R], [R, F, S, T, X, R]];
  else if (S !== undefined) templates = [[R, F, S, T, F, R]];
  else if (X !== undefined) templates = [[R, F, R, T, X, R], [R, F, X, T, F, R]];
  else if (third === undefined && fifth !== undefined) templates = [[R, F, R, F, R, F]];
  else templates = [[R, F, R, T, F, R]];
  const root = lowest + ((R - (lowest % 12) + 12) % 12);
  const build = (order: number[]): number[] => {
    const out = [root];
    for (let i = 1; out.length < count; i++) {
      const pc = order[i % order.length] ?? R;
      const prev = out[out.length - 1] ?? root;
      let n = prev + ((pc - (prev % 12) + 12) % 12);
      if (n === prev) n += 12;
      out.push(n);
    }
    return out;
  };
  const results = templates.map(build);
  return results.find((v) => (v[v.length - 1] ?? root) <= root + 27) ?? results.reduce((a, b) => ((a[a.length - 1] ?? 0) <= (b[b.length - 1] ?? 0) ? a : b));
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
