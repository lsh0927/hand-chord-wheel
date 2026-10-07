#!/usr/bin/env bash
# 커밋 전 전체 검증. 결과는 PASS/FAIL/WARN.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1
LOG="$(mktemp)"
fail=0

size_of() { if [ -f "$1" ]; then wc -c < "$1" | tr -d ' '; else echo 0; fi; }

run() {
  local name="$1"; shift
  if "$@" >"$LOG" 2>&1; then echo "PASS: $name"; else echo "FAIL: $name"; tail -30 "$LOG"; fail=1; fi
}

run "타입 검사 (tsc --noEmit)" npx tsc --noEmit
run "단위 테스트 (vitest run)" npx vitest run

if [ "$(size_of public/models/hand_landmarker.task)" = "7819105" ]; then
  echo "PASS: 모델 자산"
else
  echo "WARN: 모델 자산 없음/크기 불일치 — npm run setup"
fi
if [ -f public/wasm/vision_wasm_internal.wasm ]; then echo "PASS: wasm 자산"; else echo "WARN: wasm 자산 없음 — npm run setup"; fi

if grep -rnE "(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY)" src scripts index.html 2>/dev/null; then
  echo "FAIL: 시크릿으로 보이는 문자열"; fail=1
else
  echo "PASS: 시크릿 없음"
fi

if grep -q '"tonal": "6.4.3"' package.json; then echo "PASS: tonal 6.4.3 고정"; else echo "FAIL: tonal은 6.4.3 고정이어야 함(6.5.0은 import 깨짐)"; fail=1; fi

if git ls-files --error-unmatch public/models public/wasm >/dev/null 2>&1; then echo "FAIL: 대용량 자산이 git에 추적됨"; fail=1; else echo "PASS: 대용량 자산 미추적"; fi

rm -f "$LOG"
exit $fail
