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
| 아바타가 안 보이고 "VRM 파일이 없습니다" | public/avatar.vrm 없음 / 개발 서버가 HTML 폴백 | 상단 중앙 안내, `curl -r 0-3 http://127.0.0.1:5173/avatar.vrm`이 glTF인지 | 파일을 public/avatar.vrm에 두거나 "VRM 불러오기" |
| "아바타 로드 실패 — VRM(glb) 형식이 아닙니다" | glb가 아닌 파일(.vrm 확장자만 바꾼 파일, HTML) | 파일 첫 4바이트 `glTF` | VRoid Studio에서 다시 내보내기 |
| 아바타 표정이 안 움직임 | 얼굴 모델 없음(`npm run setup` 미실행) / 얼굴 추적이 예외 10회로 꺼짐 / 영상 표시가 "카메라 영상" | 상단 안내 문구, 콘솔 "얼굴 추적을 껐습니다" | `npm run setup`; Reset 후 다시 시작; 상자를 아바타로 |
| 고개가 반대로 움직임 | MediaPipe 축 규약 가정(headAxisSign) 틀림 / VRM 0.x 부호 | config.avatar.headAxisSign, 콘솔 metaVersion | 해당 축 부호를 −1로; 0.x 모델이면 avatar.ts flip 확인 |
| 탭을 숨겼다 돌아오면 머리카락이 튐 | dt 상한이 풀림 | config.avatar.maxDeltaSec | 0.1 유지 |
| 처리 fps가 아바타 켠 뒤 크게 떨어짐 | 얼굴 추적 매 프레임 + 렌더 | 좌상단 fps, 3초 뒤 "2프레임마다" 알림 | 자동 전환 대기, 또는 "아바타만"으로 미리보기 끄기, DPR 상한 낮추기 |
| 쉼 원판/주먹 경계에서 따다닥 재어택 | 히스테리시스 간격 부족 | config.wheel.restExitFactor, openness.unmuteAbovePercent | 1.3→1.5, 20→25 |
| 주먹 쥐어도 소리 안 멈춤 | closed/open 보정값이 사용자 손과 안 맞음 | `?debug=1` ratio 읽기 | Task 11 절차로 재실측 |
| Reset 뒤 소리가 안 남 | Reset 대기(armed=false) 상태 — 의도된 동작 | `?debug=1`에 "(Reset 대기)" | 손을 내렸다 올리기; 휠 모드는 쉼 원판 지나기, 손가락 모드는 주먹 쥐었다 펴기 |
| 손가락 모드: 편하게 늘어뜨린 손이 4로 읽힘 / 3↔4 흔들림 | 펴짐 비율 경계(약 72도 굽힘) 근처 | `?debug=1`의 `t I M r p`·raw/stable | config.fingers.enterRatio 1.2→1.25, exitRatio 1.1→1.15 |
| 손가락 모드: 활짝 폈는데 4 | 엄지가 검지 옆에 붙었거나 카메라 쪽으로 기울어짐 | 디버그 `t` 소문자 | 엄지를 옆으로 벌리기; thumbEnterRatio 1.18→1.12 |
| 손가락 모드: 손을 들어 올리면 소리가 끊김 | 손목이 화면 밖 → 판정 보류/주먹을 트래커가 놓침 | 디버그 "판정 보류"/"no hand" | 손목이 보이는 높이까지만; 카메라를 조금 뒤로 |
| 손가락 모드: 배지는 파란데 소리가 거의 없음 | 손이 바닥 선 근처(높이 10% 하한) | HUD R HEIGHT | 손을 올리기; levelExponent 1.5→1 |
| fps 15 미만 | CPU 모드 폴백 / 다른 탭·앱 GPU 점유 | 좌상단 `CPU` 표시 | 콘솔 GPU 실패 원인 확인; 해상도 1280→960 |
| 코드 전환 시 음이 빠짐 | maxPolyphony가 32 미만으로 바뀜 | 콘솔 "Max polyphony exceeded" | config.audio.maxPolyphony 32 |
| 영상이 멈추고 "영상이 멈춰 소리를 껐습니다" | 카메라 프레임 정지(절전·다른 앱) | 카메라 LED, 다른 앱 | 다른 앱 종료 후 '다시 시도' 또는 새로고침 |
| MIDI 포트가 상자에 안 보임 | 권한 거부 / IAC 오프라인 / Safari / LAN 주소 | 상단 알림 문구, Audio MIDI 설정 | 주소창 MIDI 권한 허용; IAC '장치가 온라인 상태'; Chrome + localhost |
| GarageBand에 소리 안 남(상자는 MIDI) | 트랙 미선택 / 다른 입력 장치 설정 / 채널 | GarageBand 트랙 헤더 MIDI 표시등 | 악기 트랙 선택; 환경설정 → 오디오/MIDI 입력 확인 |
| 음이 걸려 계속 울림 | 패닉 미전송(강제 종료 등) | — | Reset 클릭(CC123·120 전송); GarageBand 트랙 음소거 후 해제 |
| MIDI 전환 뒤 브라우저 소리도 같이 남 | 출력 교체 전 stop 누락 | main.ts switchToMidi의 silence() | silence() 호출 순서 확인 |
| 포트가 멀쩡한데 갑자기 신디로 전환됨 | 전송 연속 실패 5회 | 콘솔 "MIDI 전송 실패" | IAC 상태 확인; sendErrors가 성공 시 0으로 초기화되는지 |
