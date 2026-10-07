# Gotchas — 반복 실패 패턴

형식: **증상** / **원인** / **규칙** / **적용 시점**

1. **증상** `npm install` 후 tonal import가 `Cannot find package .../dist/index.js`로 실패
   **원인** tonal 6.5.0(2026-09-28)의 @tonaljs/abc-notation이 main 경로 파일을 포함하지 않음
   **규칙** tonal은 6.4.3 고정. verify-all.sh가 검사한다
   **적용 시점** 의존성 업데이트 때

2. **증상** HUD 글자가 좌우 반전되어 보임
   **원인** 캔버스에 CSS scaleX(-1)을 적용함
   **규칙** 비디오만 반전하고 캔버스는 좌표를 `1 - x`로 변환해 그린다
   **적용 시점** overlay.ts·index.html 수정 때

3. **증상** 코드를 빠르게 바꾸면 일부 음이 빠진 얇은 화음이 남
   **원인** Tone.js PolySynth는 놓은 음도 여음(release 0.4초)이 끝날 때까지 보이스 슬롯을 차지. maxPolyphony가 작으면 "Max polyphony exceeded. Note dropped."
   **규칙** maxPolyphony는 32(Tone 기본값) 이상 유지
   **적용 시점** audio.ts·config.audio 수정 때

4. **증상** 손을 옆으로 눕히면 주먹인데 소리가 새거나 편 손이 100%에 못 미침
   **원인** 펼침 비율을 MediaPipe 정규화 좌표(가로·세로 단위가 다름)로 계산
   **규칙** opennessRatio는 반드시 픽셀 좌표(pts)로 호출
   **적용 시점** main.ts processFrame 수정 때

5. **증상** Linux에서 `npm run setup`이 모델을 받고도 "크기 0 != 7819105"로 실패
   **원인** `stat -f%z`는 macOS 전용
   **규칙** 파일 크기는 `wc -c <`로 잰다
   **적용 시점** 셸 스크립트 작성 때

6. **증상** 합성 손 테스트에서 "주먹" 비율이 예상(0.6 미만)보다 큼(0.68)
   **원인** 픽셀 좌표에서는 손끝 가로 간격이 그대로 거리에 반영됨. 설계 기준은 CLOSED(0.8) 미만이면 충분
   **규칙** 테스트 단언은 설계 임계값(0.8/1.7)에 맞춘다
   **적용 시점** mapping 테스트 수정 때

(이후 버그를 만날 때마다 추가)

7. **증상** 권한 창을 60초 넘게 두었다가 '허용'을 누르면 오류 화면 뒤에서 카메라 LED가 켜짐
   **원인** withTimeout은 거부만 할 뿐 원래 Promise(getUserMedia·createFromOptions)를 취소하지 못함
   **규칙** 시작 시도마다 세대 번호(startAttempt)를 매기고, openCamera/tracker.init은 isStale()이면 받은 자원을 즉시 닫고 CANCELLED로 실패한다. enterError는 세대 번호를 올리고 멱등이다
   **적용 시점** 시작 절차(main.ts Start 핸들러, camera.ts, tracker.ts) 수정 때

8. **증상** 루프 예외가 매 프레임 나도 ERROR 상태로 넘어가지 않음
   **원인** 연속 오류 카운터를 requestAnimationFrame 매 틱에서 0으로 초기화해, 새 영상 프레임이 없는 틱(60Hz 중 절반)마다 리셋됨
   **규칙** 카운터 초기화는 processFrame이 정상 완료된 직후에만
   **적용 시점** main.ts loop() 수정 때

9. **증상** 좌상단 fps가 102처럼 카메라 프레임 수(30)보다 훨씬 크게 나오고 GPU를 불필요하게 많이 씀
   **원인** MediaStream을 재생하는 video의 currentTime은 연속으로 증가해 rAF 틱마다 '새 프레임'으로 보임
   **규칙** 카메라 프레임 처리는 video.requestVideoFrameCallback으로 건다(없을 때만 currentTime 비교로 대체)
   **적용 시점** main.ts 프레임 루프 수정 때

10. **증상** MIDI 전송 실패로 신디 복귀 직후 손이 같은 칸에 있는데 무음
    **원인** fail()→onFatal→switchToTone이 play() 도중 동기로 돌아 processFrame이 '음 없는 PLAYING'을 만듦
    **규칙** 출력 전환 콜백은 queueMicrotask로 미루고, processFrame은 play 뒤 출력 객체가 바뀌었으면 상태를 덮어쓰지 않는다
    **적용 시점** midi.ts fail()/main.ts processFrame 수정 때

11. **증상** 같은 포트를 감싼 MidiOutput이 둘 생기면 끊김 감지가 사라짐
    **원인** port.onstatechange 단일 슬롯을 대입·null로 덮어씀
    **규칙** 포트 이벤트는 addEventListener/removeEventListener로 인스턴스별 등록, 등록은 open() 성공 뒤
    **적용 시점** midi.ts 수정 때

12. **증상** MIDI 권한을 거부하면 출력 상자가 'MIDI 장치 찾기…'에 멈춰 재시도가 안 됨
    **원인** 상자 재구성 생략(내용 같으면 return)이 선택값(DOM value) 복원까지 건너뜀. 같은 option 재선택은 change 이벤트를 내지 않음
    **규칙** 재구성은 생략해도 `outputSelect.value`는 항상 목표값으로 맞춘다
    **적용 시점** main.ts renderOutputOptions 수정 때

13. **증상** 권한 창을 기다리는 동안 사용자가 다른 출력을 골랐는데 허용 뒤 자동 선택이 덮어씀 / 장애 복귀가 진행 중인 전환을 취소함
    **원인** 비동기 대기 전후로 세대 번호(switchSeq)·진행 중 목표(switchingTo)를 비교하지 않음
    **규칙** await 전에 seq를 잡고 뒤에 비교. 장애 복귀는 switchingTo가 있으면 현재 출력만 떼고 세대는 올리지 않는다
    **적용 시점** main.ts requestMidiAndPick/restoreOutputPref/onMidiFailed 수정 때

14. **증상** 손가락 모드에서 편하게 늘어뜨린 손이 "4"로 읽히거나 경계에서 코드가 반복 재타격됨
    **원인** 단일 임계(1.15)에는 여유가 없다(곧게 1.35, 45° 굽힘 1.27, 75° 1.14) + 떨림 ±0.02
    **규칙** 손가락별 히스테리시스(진입 1.20/해제 1.10, 엄지 1.18/1.05) + 120 ms 안정화. 엄지는 넷 다 펴졌을 때만 센다
    **적용 시점** fingers.ts·config.fingers 수정 때

15. **증상** 계획의 StableValue 테스트가 구현과 모순(후보 시작 50 ms인데 120 ms에 바뀐다고 기대)
    **원인** 유지 시간은 '후보가 바뀐 시점'부터 센다
    **규칙** 테스트 시각은 후보 시작 + holdMs로 계산한다
    **적용 시점** 안정화 로직 테스트 작성 때

16. **증상** 손가락 모드에서 손목이 화면 밖인 채로 Reset 직후 소리가 바로 남 / 공백 뒤 스친 값이 즉시 확정됨
    **원인** 확정값 null을 0(주먹)으로 취급해 재무장 · StableValue가 update 공백을 유지 시간에 합산
    **규칙** null과 0을 구분한다. StableValue는 공백이 holdMs를 넘으면 후보 타이머를 재시작한다
    **적용 시점** fingers.ts StableValue·main.ts processFingerFrame 수정 때

17. **증상** MIDI CC11이 손 높이에 비례하지 않음
    **원인** level 곡선 지수(1.5)와 levelToCc의 제곱 복원 전제 불일치
    **규칙** setLevel(level, control)로 선형 제어값을 함께 넘기고 MIDI는 control을 쓴다
    **적용 시점** 음량 곡선·출력 인터페이스 수정 때
