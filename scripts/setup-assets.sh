#!/usr/bin/env bash
# 모델(.task)과 MediaPipe wasm 파일을 public/ 아래에 준비한다. git에는 커밋하지 않는다.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL_URL="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
MODEL_BYTES=7819105
MODEL="$ROOT/public/models/hand_landmarker.task"
WASM_SRC="$ROOT/node_modules/@mediapipe/tasks-vision/wasm"
WASM_DST="$ROOT/public/wasm"

mkdir -p "$ROOT/public/models" "$WASM_DST"

# macOS/Linux 공용 (stat -f/-c 차이를 피한다)
size_of() { if [ -f "$1" ]; then wc -c < "$1" | tr -d ' '; else echo 0; fi; }

if [ "$(size_of "$MODEL")" != "$MODEL_BYTES" ]; then
  echo "모델 내려받는 중: $MODEL_URL"
  curl -fL --retry 3 -o "$MODEL" "$MODEL_URL" || { echo "FAIL: 모델 다운로드 실패"; exit 1; }
fi
if [ "$(size_of "$MODEL")" = "$MODEL_BYTES" ]; then
  echo "PASS: 모델 ($MODEL_BYTES bytes)"
else
  echo "FAIL: 모델 크기 $(size_of "$MODEL") != $MODEL_BYTES"; exit 1
fi

if [ ! -d "$WASM_SRC" ]; then
  echo "FAIL: $WASM_SRC 없음 — 먼저 npm install"; exit 1
fi
cp "$WASM_SRC"/* "$WASM_DST"/ || { echo "FAIL: wasm 복사 실패"; exit 1; }
src_count=$(ls "$WASM_SRC" | wc -l | tr -d ' ')
count=$(ls "$WASM_DST" | wc -l | tr -d ' ')
if [ "$count" -ge "$src_count" ] && [ "$count" -ge 6 ]; then
  echo "PASS: wasm ${count}개 복사 (원본 ${src_count}개)"
else
  echo "FAIL: wasm ${count}개 (원본 ${src_count}개, 최소 6개)"; exit 1
fi

# 얼굴 모델(선택 기능: 아바타 표정). 실패해도 손 추적은 동작하므로 WARN으로 끝낸다
FACE_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
FACE_BYTES=3758596
FACE="$ROOT/public/models/face_landmarker.task"
if [ "$(size_of "$FACE")" != "$FACE_BYTES" ]; then
  echo "얼굴 모델 내려받는 중: $FACE_URL"
  curl -fL --retry 3 -o "$FACE" "$FACE_URL" || echo "WARN: 얼굴 모델 다운로드 실패 — 아바타 표정 없이 동작합니다 (npm run setup 재실행으로 재시도)"
fi
if [ "$(size_of "$FACE")" = "$FACE_BYTES" ]; then
  echo "PASS: 얼굴 모델 ($FACE_BYTES bytes)"
else
  rm -f "$FACE"
  echo "WARN: 얼굴 모델 없음 — 손 추적·소리는 정상, 아바타 표정만 꺼집니다"
fi
