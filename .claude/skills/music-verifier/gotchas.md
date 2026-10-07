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
