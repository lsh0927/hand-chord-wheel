# 변경 영역 → 영향 기능

| 변경 파일 | 영향 | 자동 검증 | 수동 확인 |
|---|---|---|---|
| src/mapping.ts | 코드 선택, 펼침%, 히스테리시스, 유지 규칙 | tests/mapping.test.ts | 경계 깜빡임, 주먹 무음/재개 |
| src/fingers.ts | 손가락 판정·개수·안정화·높이 | tests/fingers.test.ts | 1~5 전환, 엄지 오판, 손 재진입 첫 코드 |
| src/chords.ts | 팔레트, 표기 정규화, MIDI 번호 | tests/chords.test.ts | 12개 코드 소리 |
| src/hands.ts | 오른손 선택 | tests/hands.test.ts | 두 손 동시 노출, 왼손만 노출 안내 |
| src/avatar-map.ts | 표정 계수→VRM 가중치, 행렬→머리 각 | tests/avatar-map.test.ts | 입·눈·웃음 반응, 고개 방향 부호 |
| src/face.ts | 얼굴 추적(선택 기능) | tsc | 모델 없이 Start 가능, 얼굴 예외가 연주를 끊지 않음 |
| src/avatar.ts | VRM 로드·표정·머리·렌더 | tsc, 샘플 VRM 로드(Playwright) | VRM 1.0/0.x 둘 다, 팔 내림, 30 fps 상한, 탭 복귀 시 머리카락 튐 없음 |
| index.html(camview·avatar·topbar) | 영상 표시 상자, 미리보기 위치, z-order | Playwright(상자 전환·저장·안내 문구) | 미리보기가 HUD·패널을 가리지 않음 |
| src/audio.ts, src/output.ts | 소리, 컨텍스트 상태 | tsc | 코드 전환 시 끊김/겹침, 절전 복귀 |
| src/camera.ts | 카메라 열기/닫기/종료 감지 | tsc | 재시도 누수(LED), 카메라 뺏김 |
| src/tracker.ts | 손 검출, GPU 폴백 | tsc | ?debug=1 라벨 확인 |
| src/overlay.ts, index.html | 화면 | tests/overlay.test.ts | 글자 반전, 손 점 위치, 프레임 비율 |
| src/main.ts | 상태 전이, 시작 절차, 루프 | tsc | 수동 합격 기준 7개 |
| src/config.ts | 모든 임계값·타임아웃 | 전체 테스트 | 수동 합격 기준 7개 |
| scripts/*.sh, .gitignore | 자산/저장소 | verify-all.sh 미추적 검사 | 새 clone 재현 |
| src/midi.ts, src/midi-messages.ts | MIDI 출력, 패닉, 전환 | tests/midi-messages.test.ts | 가짜 MIDI 브라우저 확인, GarageBand 실측 |
