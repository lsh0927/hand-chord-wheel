import { describe, it, expect, vi } from "vitest";
import { MidiOutput } from "../src/midi";
import { CONFIG } from "../src/config";

/** MIDIOutput 인터페이스 중 MidiOutput이 쓰는 부분만 흉내 낸 가짜 포트. 보낸 메시지를 log에 쌓는다 */
function fakePort(failSend: () => boolean = () => false) {
  const log: number[][] = [];
  const listeners = new Set<() => void>();
  const port = {
    id: "fake-1",
    name: "IAC 드라이버 버스 1",
    state: "connected" as MIDIPortDeviceState,
    connection: "closed" as MIDIPortConnectionState,
    type: "output" as MIDIPortType,
    onstatechange: null,
    open: async () => port,
    close: async () => port,
    addEventListener: (_t: string, fn: () => void) => {
      listeners.add(fn);
    },
    removeEventListener: (_t: string, fn: () => void) => {
      listeners.delete(fn);
    },
    send: (m: number[]) => {
      if (failSend()) throw new Error("InvalidStateError");
      log.push([...m]);
    },
  };
  return { port: port as unknown as MIDIOutput, log, listeners, fire: () => listeners.forEach((fn) => fn()) };
}
const CH = 0; // 채널 1 → 하위 4비트 0
const flush = () => Promise.resolve();

describe("MidiOutput.start", () => {
  it("연결된 포트를 열고 끊김 리스너를 1개 건다", async () => {
    const f = fakePort();
    const out = new MidiOutput(f.port, vi.fn());
    await out.start();
    expect(f.listeners.size).toBe(1);
    expect(out.isRunning()).toBe(true);
  });
  it("연결 상태가 아니면 MIDI: 접두어 오류, 리스너 없음", async () => {
    const f = fakePort();
    (f.port as unknown as { state: string }).state = "disconnected";
    const out = new MidiOutput(f.port, vi.fn());
    await expect(out.start()).rejects.toThrow(/^MIDI: /);
    expect(f.listeners.size).toBe(0);
  });
});

describe("MidiOutput.play / stop", () => {
  it("코드 전환은 이전 음 Off 뒤 새 음 On, 벨로시티는 CONFIG 값", async () => {
    const f = fakePort();
    const out = new MidiOutput(f.port, vi.fn());
    await out.start();
    out.play([40, 52]);
    out.play([45]);
    expect(f.log).toEqual([
      [0x90 | CH, 40, CONFIG.midi.velocity],
      [0x90 | CH, 52, CONFIG.midi.velocity],
      [0x80 | CH, 40, 0],
      [0x80 | CH, 52, 0],
      [0x90 | CH, 45, CONFIG.midi.velocity],
    ]);
  });
  it("stop은 들고 있던 음만 놓고, 비어 있으면 아무것도 보내지 않는다", async () => {
    const f = fakePort();
    const out = new MidiOutput(f.port, vi.fn());
    await out.start();
    out.stop();
    expect(f.log).toHaveLength(0);
    out.play([40]);
    out.stop();
    expect(f.log.at(-1)).toEqual([0x80 | CH, 40, 0]);
    out.stop();
    expect(f.log).toHaveLength(2);
  });
});

describe("MidiOutput.setLevel: CC11 중복 억제", () => {
  it("같은 값은 다시 보내지 않고, start()가 직전값을 초기화한다", async () => {
    const f = fakePort();
    const out = new MidiOutput(f.port, vi.fn());
    await out.start();
    out.setLevel(0.58 * 0.58); // 펼침 58% → 74
    out.setLevel(0.58 * 0.58);
    expect(f.log).toEqual([[0xb0 | CH, CONFIG.midi.ccExpression, 74]]);
    out.setLevel(1);
    expect(f.log).toHaveLength(2);
    expect(f.log[1]).toEqual([0xb0 | CH, 11, 127]);
    await out.start(); // 재시작 → 같은 값도 한 번은 다시 나간다
    out.setLevel(1);
    expect(f.log).toHaveLength(3);
  });
});

describe("MidiOutput 패닉·dispose", () => {
  it("panic은 들고 있던 음 Off + CC123 + CC120, 그 뒤 held는 비어 있다", async () => {
    const f = fakePort();
    const out = new MidiOutput(f.port, vi.fn());
    await out.start();
    out.play([40, 52]);
    out.panic();
    expect(f.log.slice(2)).toEqual([
      [0x80 | CH, 40, 0],
      [0x80 | CH, 52, 0],
      [0xb0 | CH, 123, 0],
      [0xb0 | CH, 120, 0],
    ]);
    out.stop(); // held 비어 있음
    expect(f.log).toHaveLength(6);
  });
  it("dispose는 멱등: 패닉 1회, 리스너 해제, 이후 play 무시, isRunning false", async () => {
    const f = fakePort();
    const out = new MidiOutput(f.port, vi.fn());
    await out.start();
    out.play([40]);
    out.dispose();
    out.dispose();
    expect(f.log.slice(1)).toEqual([
      [0x80 | CH, 40, 0],
      [0xb0 | CH, 123, 0],
      [0xb0 | CH, 120, 0],
    ]);
    expect(f.listeners.size).toBe(0);
    out.play([45]);
    expect(f.log).toHaveLength(4);
    expect(out.isRunning()).toBe(false);
  });
});

describe("MidiOutput 장애 처리", () => {
  it("연속 실패 5회에서만 onFatal — 중간에 성공하면 카운터가 0으로", async () => {
    let fail = false;
    const f = fakePort(() => fail);
    const onFatal = vi.fn();
    const out = new MidiOutput(f.port, onFatal);
    await out.start();
    fail = true;
    out.play([40, 52, 55, 59]); // 실패 4회
    fail = false;
    out.setLevel(0.5); // 성공 → 0
    fail = true;
    out.play([45, 57, 61, 64]); // Off 4 + On 4 = 8회 중 5회째에서 fail
    expect(onFatal).not.toHaveBeenCalled(); // 마이크로태스크로 미뤄짐
    await flush();
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0]?.[0]).toContain("반복 실패");
    expect(out.isRunning()).toBe(false);
  });
  it("포트 statechange로 끊기면 패닉 시도 후 onFatal(마이크로태스크), 리스너 해제", async () => {
    const f = fakePort();
    const onFatal = vi.fn();
    const out = new MidiOutput(f.port, onFatal);
    await out.start();
    out.play([40]);
    (f.port as unknown as { state: string }).state = "disconnected";
    f.fire();
    expect(onFatal).not.toHaveBeenCalled();
    await flush();
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0]?.[0]).toContain("끊어졌습니다");
    expect(f.listeners.size).toBe(0);
    expect(f.log.slice(1)).toEqual([
      [0x80 | CH, 40, 0],
      [0xb0 | CH, 123, 0],
      [0xb0 | CH, 120, 0],
    ]);
    expect(out.isRunning()).toBe(false);
  });
});
