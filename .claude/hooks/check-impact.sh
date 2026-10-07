#!/usr/bin/env bash
# PostToolUse(Edit|Write) 훅: 바뀐 파일이 어떤 기능에 영향을 주는지 알려준다.
set -uo pipefail
INPUT="$(cat)"
FILE="$(printf '%s' "$INPUT" | python3 -c 'import json,sys
try:
    d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))
except Exception:
    print("")' 2>/dev/null)"
[ -z "$FILE" ] && exit 0
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
REL="${FILE#"$ROOT"/}"
case "$REL" in
  src/fingers.ts) echo "[impact] fingers.ts → 손가락 판정·개수·안정화·높이. tests/fingers.test.ts 실행, ?debug=1로 1~5 전환·엄지 오판 실측" ;;
  src/mapping.ts) echo "[impact] mapping.ts → 코드 선택(각도·데드존)·펼침%·히스테리시스·유지 규칙 전부. tests/mapping.test.ts 실행, 칸 경계·쉼 원판·15/20% 경계 깜빡임 수동 확인" ;;
  src/chords.ts) echo "[impact] chords.ts → 팔레트 파싱·표기 정규화·MIDI 번호. tests/chords.test.ts 실행, 12개 기본 코드 소리 확인" ;;
  src/hands.ts) echo "[impact] hands.ts → 오른손 선택(점수·화면 안·연속성). tests/hands.test.ts 실행, 두 손 동시 노출 수동 확인" ;;
  src/audio.ts|src/output.ts) echo "[impact] 소리 출력 → ChordOutput 인터페이스 변경 시 2차 midiOut.ts 호환 확인, 코드 전환 시 release→attack, maxPolyphony 32 유지, 절전 복귀 재개" ;;
  src/tracker.ts) echo "[impact] 손 추적 → GPU→CPU 폴백 확인, 타임스탬프 단조 증가" ;;
  src/camera.ts) echo "[impact] 카메라 → 재시도 시 이전 스트림 정리, 트랙 ended 콜백, 비보안 컨텍스트 메시지" ;;
  src/midi.ts|src/midi-messages.ts) echo "[impact] MIDI 출력 → tests/midi-messages.test.ts 실행, 가짜 MIDI 브라우저 확인(전환·Reset 패닉·복원·끊김 복귀), GarageBand 실측(걸린 음 없는지)" ;;
  src/config.ts) echo "[impact] 상수 → 보정값(closed/open)·데드존·유예·타임아웃 변경 시 수동 합격 기준 재수행" ;;
  src/main.ts) echo "[impact] 상태 전이 → 수동 합격 기준 전부 재수행(fps≥25, 경계 5초 불변, 주먹 100ms 무음, Reset, 손 이탈 0.5초, 카메라 뺏김 0.5초, 12칸 훑기 Note dropped 없음)" ;;
  src/overlay.ts|index.html) echo "[impact] 화면 → 거울 좌표(x→1-x) 일치, HUD 글자 반전 여부, 프레임 비율, tests/overlay.test.ts" ;;
  scripts/setup-assets.sh|scripts/verify-all.sh|.gitignore) echo "[impact] 자산/검증 → 새 clone에서 npm run setup 재검증, macOS/Linux 공용(wc -c), public/models·public/wasm 미추적 확인" ;;
  package.json) echo "[impact] 의존성 → tonal 6.4.3 고정 유지 확인, npm run verify" ;;
esac
exit 0
