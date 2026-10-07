# 변경 영역 → 영향 기능

| 변경 파일 | 영향 | 자동 검증 | 수동 확인 |
|---|---|---|---|
| src/mapping.ts | 코드 선택, 펼침%, 히스테리시스, 유지 규칙 | tests/mapping.test.ts | 경계 깜빡임, 주먹 무음/재개 |
| src/chords.ts | 팔레트, 표기 정규화, MIDI 번호 | tests/chords.test.ts | 12개 코드 소리 |
| src/hands.ts | 오른손 선택 | tests/hands.test.ts | 두 손 동시 노출, 왼손만 노출 안내 |
| src/audio.ts, src/output.ts | 소리, 컨텍스트 상태 | tsc | 코드 전환 시 끊김/겹침, 절전 복귀 |
| src/camera.ts | 카메라 열기/닫기/종료 감지 | tsc | 재시도 누수(LED), 카메라 뺏김 |
| src/tracker.ts | 손 검출, GPU 폴백 | tsc | ?debug=1 라벨 확인 |
| src/overlay.ts, index.html | 화면 | tests/overlay.test.ts | 글자 반전, 손 점 위치, 프레임 비율 |
| src/main.ts | 상태 전이, 시작 절차, 루프 | tsc | 수동 합격 기준 7개 |
| src/config.ts | 모든 임계값·타임아웃 | 전체 테스트 | 수동 합격 기준 7개 |
| scripts/*.sh, .gitignore | 자산/저장소 | verify-all.sh 미추적 검사 | 새 clone 재현 |
| src/midi.ts, src/midi-messages.ts | MIDI 출력, 패닉, 전환 | tests/midi-messages.test.ts | 가짜 MIDI 브라우저 확인, GarageBand 실측 |
