# Hand Chord Wheel — 2차 설계: GarageBand로 MIDI 출력

작성일 2026-10-07. 상태: 사용자 승인(대화에서 구두 승인). 1차 설계(`2026-10-06-hand-chord-wheel-design.md`) 위에 얹는 추가 기능.

## 1. 무엇을 만드나

하단 바에 **출력 선택 상자**를 추가한다. "브라우저 신디(기본)"와 Mac의 MIDI(Musical Instrument Digital Interface) 출력 포트들이 보이고, MIDI 포트를 고르면 손으로 고른 코드가 브라우저 소리 대신 MIDI 음표로 그 포트로 나간다. GarageBand에서 소프트웨어 악기 트랙을 선택해 두면 그 악기로 울린다. 손 펼침은 CC(Control Change) 11번 익스프레션으로 함께 보낸다.

### 대표 시나리오
1. GarageBand에서 스트링 패드 트랙을 만들고 선택해 둔다. Audio MIDI 설정에서 IAC 드라이버가 온라인이다.
2. 웹앱 하단 상자에서 "MIDI 장치 찾기…"를 고른다 → Chrome이 MIDI 권한을 묻는다 → 허용 → 상자에 "IAC 드라이버 버스 1"이 나타나고(포트가 하나뿐이면 자동 선택) 상단에 "MIDI 출력: IAC 드라이버 버스 1".
3. 오른손을 1시에 펴면 Em6의 다섯 음(40·52·55·59·61) Note On이 나가 스트링이 울린다. 손을 더 펴면 CC11이 74 → 127로 올라가 소리가 부푼다.
4. 손을 3시로 옮기면 다섯 음 Note Off 뒤 A9 여섯 음 Note On. 주먹을 쥐면 Note Off.
5. 탭을 닫거나 다른 탭으로 가거나 Reset을 누르면 들고 있던 음 Note Off + CC123(모든 음 끄기) + CC120(모든 소리 끄기)이 나가 걸린 음이 남지 않는다.

### 범위 밖
- 왼손, 스트럼 벨로시티(손 펴는 속도), 곡별 프리셋, Logic Pro 전용 채널별 다중 트랙 라우팅, MIDI 입력(수신), SysEx.

## 2. 구조

| 파일 | 책임 |
|---|---|
| `src/midi-messages.ts` (신규) | 순수 함수: 상태 바이트·채널 결합, 0~127 클램프, Note On/Off, CC, 펼침→CC 변환, 코드 전환 메시지 열, 패닉 묶음. 테스트 대상 |
| `src/midi.ts` (신규) | `MidiManager`(권한 요청, 포트 목록, 변화 감시), `MidiOutput implements ChordOutput`(포트 하나로 전송, 패닉, 연결 끊김 알림) |
| `src/main.ts` (수정) | 출력 선택 상자 처리, 출력 객체 교체, 패닉 호출 지점(Reset·오류·pagehide·visibilitychange), 저장된 선택 복원 |
| `src/overlay.ts` (수정) | 정보 줄에 현재 출력 이름 표시 |
| `src/config.ts` (수정) | `midi` 상수 |
| `index.html` (수정) | `<select id="output">` |
| `tests/midi-messages.test.ts` (신규) | 메시지 생성 단위 테스트 |
| `README.md` (수정) | GarageBand 준비 절차, 문제 해결 |

`ChordOutput` 인터페이스(1차 3-9)는 바꾸지 않는다. Tone.js 경로(`audio.ts`)도 손대지 않는다.

## 3. 동작 규칙

### 3-1. MIDI 메시지
- 채널 1(상태 바이트 하위 4비트 0). 벨로시티 100 고정.
- Note On `[0x90, 음, 100]`, Note Off `[0x80, 음, 0]`, CC `[0xB0, 번호, 값]`. 모든 데이터 바이트는 0~127 정수로 클램프.
- 코드 전환: 들고 있던 음 전부 Note Off → 새 음 전부 Note On (Tone.js 경로와 같은 순서). 공통 음도 다시 친다(피아노·기타 음색에서 "코드를 다시 짚는" 자연스러운 소리).
- 패닉 = 들고 있던 음 Note Off + CC123 값 0 + CC120 값 0.

### 3-2. 펼침 → CC11
- `ChordOutput.setLevel(level)`의 level은 1차에서 `(펼침% / 100)²`로 정의되어 있다. MIDI에서는 제곱을 되돌려 **펼침 퍼센트에 비례**하는 값을 보낸다: `cc = round(sqrt(level) × 127)`. 58% → 74, 100% → 127, 0% → 0.
- 값이 직전과 같으면 보내지 않는다(초당 최대 30번). 포트를 열 때 직전 값을 초기화해 첫 프레임에 반드시 한 번 보낸다.
- 무음 진입(펼침 15% 미만)에서는 1차 규칙대로 음을 놓는다. CC는 그 뒤에도 계속 보내지 않는다(놓은 뒤 setLevel이 불리지 않음).

### 3-3. 출력 선택과 전환
- 상자 항목: `tone`(브라우저 신디) / `midi-request`("MIDI 장치 찾기…", 아직 권한 전) / `midi:<포트 id>`(권한 후 연결된 포트마다). Web MIDI 미지원 브라우저면 비활성 항목 "MIDI 미지원(Chrome 필요)" 하나만.
- `midi-request` 선택 → `navigator.requestMIDIAccess({ sysex: false })` → 성공 시 포트 목록으로 상자를 채운다. 연결된 포트가 정확히 하나면 자동 선택, 여럿이면 상자를 열어 두고 안내, 없으면 안내(IAC 드라이버 켜는 법)와 함께 `tone` 유지.
- 포트 선택 → 포트 `open()` → 현재 출력 `stop()`(MIDI였으면 패닉 포함 `dispose()`) → 출력 객체 교체 → 상단 알림 "MIDI 출력: <이름>" → localStorage `hcw.output.v1`에 `midi:<포트 이름>` 저장. 연주 중이었다면 다음 프레임에 새 출력으로 자동 재생된다(현재 칸이 비워지므로).
- `tone` 선택 → MIDI 출력이면 `dispose()`(패닉) → Tone 출력으로 교체 → 저장 `tone`.
- 부팅 시 저장값이 `midi:<이름>`이면 권한을 요청해(이전에 허용했으면 창 없이 통과) 같은 이름의 연결된 포트를 찾아 자동 선택. 못 찾으면 `tone` + 안내.
- MIDIAccess `statechange`(포트 추가·제거) → 상자 목록을 다시 채운다(현재 선택이 남아 있으면 유지).

### 3-4. 안전장치 (걸린 음 방지)
패닉을 보내는 시점: 출력 전환, Reset, 오류 진입(`enterError`), `pagehide`, `visibilitychange` hidden, 포트 연결 끊김 감지 직전(가능하면), 전송 반복 실패로 신디 복귀 직전.

### 3-5. 연결 끊김·전송 실패
- 선택한 포트의 `onstatechange`에서 `state === "disconnected"`면 즉시 Tone 출력으로 복귀하고 "MIDI 장치 연결이 끊어졌습니다 → 브라우저 신디로 전환" 알림. 상자는 `tone`으로 되돌린다. 재진입 가드(복귀 처리 중 다시 호출되지 않게).
- `send()` 예외는 1회면 경고 로그만, 연속 5회면 위와 같이 신디로 복귀.

## 4. 화면
- 하단 바: `[팔레트 입력] [출력 ▾] [좌우 바꾸기] [Start]`. 출력 상자는 버튼과 같은 어두운 스타일.
- 정보 줄(좌상단 fps 줄)에 `· 출력 브라우저 신디` 또는 `· 출력 MIDI: IAC 드라이버 버스 1`.

## 5. 오류 처리

| 상황 | 감지 | 처리 |
|---|---|---|
| Web MIDI 미지원(Safari 등) | `typeof navigator.requestMIDIAccess !== "function"` | 상자에 비활성 안내 항목, 신디 유지 |
| 권한 거부 | requestMIDIAccess reject(SecurityError 등) | 알림 "MIDI 권한이 거부되었습니다. 주소창 아이콘에서 허용 후 다시 선택", 상자 `tone` |
| 포트 없음 | outputs 비어 있음 | 알림 "MIDI 출력 포트가 없습니다. Audio MIDI 설정 → MIDI 스튜디오 → IAC 드라이버 → '장치가 온라인 상태' 체크", README 링크 |
| 포트 open 실패 | open() reject | 알림 + `tone` 유지 |
| 포트 끊김 | port.onstatechange disconnected | 패닉 시도 → 신디 복귀 + 알림 |
| 전송 예외 | send throw | 1회 로그, 연속 5회 신디 복귀 |
| 저장된 포트 이름 없음 | 부팅 시 findByName null | `tone` + 알림 "저장된 MIDI 포트 '<이름>'을 찾지 못해 브라우저 신디로 시작" |
| GarageBand에 소리 안 남 | (앱 밖) | README 문제 해결: 트랙 선택 여부, IAC 온라인, GarageBand 입력 장치 설정, 채널 1 |
| 걸린 음 | 탭 닫힘/숨김/전환/오류 | 3-4 패닉 |

## 6. 테스트
- Vitest(`tests/midi-messages.test.ts`): 채널 결합(1→0x90, 16→0x9F, 0·17은 예외), Note On/Off 바이트, 벨로시티·값 클램프(200→127, −5→0, 소수→반올림), levelToCc(0→0, 0.3364→74, 1→127, 1.5→127), 코드 전환 메시지 순서(Off들 → On들, 빈 배열 처리), 패닉 묶음(123·120 순서).
- Playwright(헤드리스, 가짜 `navigator.requestMIDIAccess` 주입): 상자 항목 구성, "찾기" → 포트 자동 선택 → 알림, Reset이 패닉 메시지를 보내는지(가짜 포트의 send 로그), `tone`으로 되돌리면 dispose 패닉이 나가는지, 저장값 복원.
- 사용자 실측: GarageBand 스트링 패드에서 코드 전환·펼침 CC11 반응, 탭 닫을 때 음이 안 걸리는지, 아르페지에이터 켠 신스.

## 7. GarageBand 준비 (README)
1. Audio MIDI 설정 앱(응용 프로그램 → 유틸리티) → 메뉴 윈도우 → MIDI 스튜디오 표시 → "IAC 드라이버" 더블클릭 → "장치가 온라인 상태" 체크 → 포트 목록에 "버스 1"이 있는지 확인.
2. GarageBand → 새 프로젝트 → 소프트웨어 악기 트랙 → 악기 선택(권장: 스트링/패드, 또는 신스 + Smart Controls의 아르페지에이터). GarageBand는 연결된 모든 MIDI 입력을 **선택된 트랙** 하나로 받는다.
3. 웹앱 출력 상자에서 "MIDI 장치 찾기…" → 허용 → IAC 버스 선택.
4. 소리가 안 나면: GarageBand 트랙이 선택되어 있는지, 트랙 헤더의 MIDI 입력 표시등이 깜빡이는지, IAC가 온라인인지, Chrome 주소창 MIDI 권한 상태.
