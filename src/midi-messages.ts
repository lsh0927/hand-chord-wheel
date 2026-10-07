// MIDI 메시지 바이트 생성. 브라우저 API를 쓰지 않는 순수 함수만.

export type MidiMessage = number[];

export const NOTE_ON = 0x90;
export const NOTE_OFF = 0x80;
export const CONTROL_CHANGE = 0xb0;
export const CC_ALL_SOUND_OFF = 120;
export const CC_ALL_NOTES_OFF = 123;

/** 0~127 정수로 클램프(반올림). 숫자가 아니면 0 */
export function clamp7(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(127, Math.max(0, Math.round(v)));
}

/** 상태 바이트(0x80·0x90·0xB0…)에 채널 1~16을 결합 */
export function statusByte(status: number, channel: number): number {
  if (!Number.isInteger(channel) || channel < 1 || channel > 16) {
    throw new Error(`MIDI 채널은 1~16이어야 합니다: ${channel}`);
  }
  return (status & 0xf0) | (channel - 1);
}

export function noteOn(channel: number, note: number, velocity: number): MidiMessage {
  // 벨로시티 0은 Note Off로 해석되므로 최소 1
  return [statusByte(NOTE_ON, channel), clamp7(note), Math.max(1, clamp7(velocity))];
}

export function noteOff(channel: number, note: number): MidiMessage {
  return [statusByte(NOTE_OFF, channel), clamp7(note), 0];
}

export function controlChange(channel: number, controller: number, value: number): MidiMessage {
  return [statusByte(CONTROL_CHANGE, channel), clamp7(controller), clamp7(value)];
}

/**
 * ChordOutput.setLevel의 level은 1차 정의상 (펼침%/100)². MIDI 컨트롤은 손 펼침에 비례하는 편이
 * 자연스러우므로 제곱을 되돌려 0~127로 만든다. 58% → 74, 100% → 127.
 */
export function levelToCc(level: number): number {
  const l = Number.isFinite(level) ? Math.min(1, Math.max(0, level)) : 0;
  return clamp7(Math.sqrt(l) * 127);
}

/** 코드 전환: 이전 음 전부 Off → 새 음 전부 On (공통 음도 다시 친다) */
export function chordChange(prev: readonly number[], next: readonly number[], channel: number, velocity: number): MidiMessage[] {
  return [...prev.map((n) => noteOff(channel, n)), ...next.map((n) => noteOn(channel, n, velocity))];
}

/** 걸린 음 방지: 들고 있던 음 Off + 모든 음 끄기(CC123) + 모든 소리 끄기(CC120) */
export function panicMessages(held: readonly number[], channel: number): MidiMessage[] {
  return [
    ...held.map((n) => noteOff(channel, n)),
    controlChange(channel, CC_ALL_NOTES_OFF, 0),
    controlChange(channel, CC_ALL_SOUND_OFF, 0),
  ];
}
