# 증상 → 원인 → 조치

| 증상 | 가능한 원인 | 확인 | 조치 |
|---|---|---|---|
| Start 눌러도 카메라 안 켜짐 | 권한 거부 / 다른 앱 점유 / 비보안 주소 | 중앙 메시지(오류 종류별 한국어 안내) | 권한 허용 후 '다시 시도'; 다른 앱 종료; 127.0.0.1 사용 |
| "…를 찾지 못했습니다 (HTTP 404)" | `npm run setup` 미실행, public/ 경로 변경 | check-assets.sh | `npm run setup` 후 새로고침 |
| "…ms 안에 끝나지 않았습니다" | 오디오 장치 전환 중 / 모델 로드 지연 / 권한 팝업 방치 | 어느 단계 메시지에서 멈췄는지 | 장치 연결 확인 후 '다시 시도' |
| 소리가 전혀 안 남 (HUD는 움직임) | AudioContext 일시중지(절전·장치 전환) / 출력 장치 | 상단 노란 알림, 콘솔 `Tone.getContext().state` | 화면 클릭(자동 재개); 시스템 출력 장치 확인 |
| 손이 있는데 인식 안 됨 | 왼손만 보임 / 라벨 반대 / 점수 0.7 미만(가장자리) / 조명 | `?debug=1` 라벨, 회색 점 여부 | 오른손 사용; '좌우 바꾸기' 체크; 손을 화면 안쪽으로 |
| 손 점이 실제 손과 좌우 반대 | 좌표 변환(1-x) 누락/중복 | main.ts processFrame | 변환 한 번만 적용 |
| 코드가 경계에서 깜빡임 | 데드존 작음 / 필터 꺼짐 | config.sector.deadZoneDeg, smoothing.alpha | 데드존 3→5도, alpha 0.5→0.35 |
| 쉼 원판/주먹 경계에서 따다닥 재어택 | 히스테리시스 간격 부족 | config.wheel.restExitFactor, openness.unmuteAbovePercent | 1.3→1.5, 20→25 |
| 주먹 쥐어도 소리 안 멈춤 | closed/open 보정값이 사용자 손과 안 맞음 | `?debug=1` ratio 읽기 | Task 11 절차로 재실측 |
| Reset 뒤 소리가 안 남 | Reset 대기(armed=false) 상태 — 의도된 동작 | `?debug=1`에 "(Reset 대기)" | 손을 내렸다 올리거나 쉼 원판을 지나기 |
| fps 15 미만 | CPU 모드 폴백 / 다른 탭·앱 GPU 점유 | 좌상단 `CPU` 표시 | 콘솔 GPU 실패 원인 확인; 해상도 1280→960 |
| 코드 전환 시 음이 빠짐 | maxPolyphony가 32 미만으로 바뀜 | 콘솔 "Max polyphony exceeded" | config.audio.maxPolyphony 32 |
| 영상이 멈추고 "영상이 멈춰 소리를 껐습니다" | 카메라 프레임 정지(절전·다른 앱) | 카메라 LED, 다른 앱 | 다른 앱 종료 후 '다시 시도' 또는 새로고침 |
