# Failure Analysis — MIDI 출력(2차) (2026-10-07)

대상: `2026-10-07-midi-output-design.md` + 계획 1판. 방법: 4개 관점 적대 검토 에이전트(오류 지도 / 그림자 경로 / 상호작용 엣지 / Web MIDI 타입 정의 대조). 결과는 계획 2판에 모두 반영.

```
Error Map      │ 실패 경로 16개 검토, CRITICAL 1
Shadow Paths   │ 전환 흐름 8개, 미처리 2
Edge Cases     │ 상호작용 13개, 미처리 3
API 검증       │ 12개 일치, 미확인(런타임) 5 → 실측 항목
Capacity       │ 해당 없음
```

## CRITICAL
**C1. play() 도중 동기 전환 → 음 없는 PLAYING.** 전송 연속 실패(또는 끊김)로 `fail()`이 `onFatal→switchToTone()`을 동기 호출하면, 스택 아래의 processFrame이 돌아와 `currentSector = sector; setState("PLAYING")`을 덮어쓴다. 출력은 이미 Tone인데 Tone.play는 불린 적이 없어 손을 그 칸에 두는 한 무음. 예: Em6→A9 전환 때 11개 메시지 중 5번째 예외 → 전환 → 복귀 후 state=PLAYING, 신디에 음 0개.
→ `fail()`의 onFatal을 `queueMicrotask`로 미루고, processFrame은 `const out = output; out.play(midi); if (output !== out) { silence(); return; }`.

## GAP
| # | 무엇이 | 시나리오 | 반영 |
|---|---|---|---|
| G1 | open() 중 끊김 | start() 대기 중 포트가 disconnected → fail이 먼저 돌고 switchToMidi가 disposed 인스턴스를 현재 출력으로 대입 → 영구 무음 | start() 뒤 `isRunning()` 확인, onFatal 클로저가 `midiOut === next`일 때만 동작 |
| G2 | 권한 요청 중복·단일 슬롯 핸들러 | 부팅 복원과 '찾기…'가 겹쳐 requestMIDIAccess 2회, 같은 포트 MidiOutput 2개 → 먼저 것의 dispose가 `port.onstatechange = null`로 나중 것의 감지를 지움 | request() in-flight Promise 공유, `addEventListener/removeEventListener`(열린 뒤 등록), 같은 포트 재선택 가드, 전환 세대 번호 |
| G3 | sendErrors 누적 | 1시간 공연 중 산발 실패 5회에 돌발 전환 | 성공 시 0 ('연속') |
| G4 | 선호 이름만 저장 | 같은 이름 포트 2개·로케일 변경 시 잘못 복원/실패 | id+이름 JSON(`hcw.output.v2`), id → 유일한 이름 순 |
| G5 | 장애 복귀가 선호 덮어씀 | 끊김 1회로 설정이 tone으로 | `switchToTone(reason, persist=false)` |
| G6 | Start 성공 검사가 다형 output | MIDI 모드에서 포트 상태를 보고 Tone 문구 출력 | `output === toneOutput && !toneOutput.isRunning()`, Tone 콜백 첫 줄 가드 |
| G7 | getOutput이 끊긴 포트도 반환 | 상자 그린 뒤 뽑힌 포트로 open | 연결 포트만 |

## NOTE
- 상자 재구성(innerHTML)이 statechange마다 → 내용 비교로 생략, 전환 중 `switchingTo` 표시.
- 비보안 주소에서 "Chrome 필요" 오안내 → `isSecureContext` 분기.
- 성공 알림에 GarageBand 트랙 선택 힌트. open 실패 문구 `MIDI:` 접두어.
- Playwright 가짜 MIDI는 `addInitScript`로 부팅 전 주입(복원 경로까지 검증), 가짜 포트에 add/removeEventListener 포함.
- 미확인 런타임 동작(끊긴 포트 send 예외, 제스처 없는 복원 요청 프롬프트, 탭 종료 시 패닉 전달, 포트 이름 로케일) → 실측 항목 + gotchas.

## 검증된 사실 (lib.dom.d.ts)
`requestMIDIAccess(options?: MIDIOptions): Promise<MIDIAccess>`, `MIDIOutputMap.forEach((value, key, parent))`, `MIDIPort { id, name: string|null, state: "connected"|"disconnected", connection, open(): Promise<MIDIPort>, addEventListener("statechange") }`, `MIDIAccess.onstatechange: (ev: MIDIConnectionEvent) => any`, `MIDIOutput.send(data: number[], timestamp?)`. `MidiOutput implements ChordOutput` 7개 메서드 일치. levelToCc 0.58² → 74, 0.25 → 64.
