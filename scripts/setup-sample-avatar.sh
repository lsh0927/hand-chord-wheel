#!/usr/bin/env bash
# 검증용 샘플 VRM(pixiv/three-vrm 예제 모델, VRM 1.0 공개 라이선스)을 public/avatar.vrm 에 내려받는다.
# 내 모델이 이미 그 자리에 있으면 덮어쓰지 않는다(--force 로 강제).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="https://raw.githubusercontent.com/pixiv/three-vrm/dev/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm"
BYTES=10776032
DST="$ROOT/public/avatar.vrm"
size_of() { if [ -f "$1" ]; then wc -c < "$1" | tr -d ' '; else echo 0; fi; }
magic_of() { if [ -f "$1" ]; then head -c 4 "$1"; else echo ""; fi; }

if [ "$(size_of "$DST")" = "$BYTES" ]; then
  echo "PASS: 샘플 아바타가 이미 있음 ($DST, $BYTES bytes)"
  exit 0
fi
if [ -f "$DST" ] && [ "${1:-}" != "--force" ]; then
  echo "WARN: $DST 에 다른 VRM($(size_of "$DST") bytes)이 이미 있습니다 — 내 모델로 보고 그대로 둡니다. 샘플로 바꾸려면: npm run setup:avatar -- --force"
  exit 0
fi
echo "샘플 VRM 내려받는 중: $URL"
mkdir -p "$ROOT/public"
curl -fL --retry 3 -o "$DST" "$URL" || { echo "FAIL: 다운로드 실패"; rm -f "$DST"; exit 1; }
if [ "$(size_of "$DST")" = "$BYTES" ] && [ "$(magic_of "$DST")" = "glTF" ]; then
  echo "PASS: 샘플 아바타 ($BYTES bytes, glTF)"
else
  echo "FAIL: 크기 $(size_of "$DST") != $BYTES 또는 glTF 아님 — 받은 파일을 지웁니다"; rm -f "$DST"; exit 1
fi
