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
