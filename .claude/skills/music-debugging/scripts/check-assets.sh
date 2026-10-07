#!/usr/bin/env bash
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$ROOT" || exit 1
size_of() { if [ -f "$1" ]; then wc -c < "$1" | tr -d ' '; else echo 0; fi; }
m=public/models/hand_landmarker.task
if [ "$(size_of "$m")" = "7819105" ]; then echo "PASS: 모델 7819105 bytes"; else echo "FAIL: 모델 없음/크기 불일치 → npm run setup"; fi
n=$(ls public/wasm 2>/dev/null | wc -l | tr -d ' ')
[ "$n" -ge 6 ] && echo "PASS: wasm ${n}개" || echo "FAIL: wasm ${n}개 → npm run setup"
echo "node: $(node -v)"
for p in @mediapipe/tasks-vision tone tonal vite vitest typescript; do
  v=$(node -e "console.log(require('./node_modules/$p/package.json').version)" 2>/dev/null || echo "미설치")
  echo "$p: $v"
done
grep -q '"tonal": "6.4.3"' package.json && echo "PASS: tonal 6.4.3 고정" || echo "WARN: tonal 고정 아님"
