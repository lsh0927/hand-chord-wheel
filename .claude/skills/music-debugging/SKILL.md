---
name: music-debugging
description: Hand Chord Wheel 증상별 진단 런북. 소리 안 남, 손 인식 안 됨, 좌우 반대, 코드 깜빡임, 느림, 모델 로드 실패, 시작 중 멈춤을 다룬다. "안 돼", "소리가", "인식이" 같은 증상 보고에 사용.
---

# music-debugging

## 흐름
1. 증상을 `references/symptom-map.md`에서 찾는다.
2. 먼저 `bash .claude/skills/music-debugging/scripts/check-assets.sh`로 자산·버전을 확인한다.
3. 브라우저는 Chrome인지, 주소가 `http://127.0.0.1:5173` 또는 `localhost`인지 확인한다(파일 직접 열기·LAN 주소는 카메라 불가 — 화면에 안내가 뜬다).
4. `?debug=1`로 열어 좌상단 `ratio`, handedness 라벨, 상태(READY/PLAYING, Reset 대기)를 읽는다.
5. 원인을 코드로 확인한 뒤에만 수정한다. 고치면 verifier 실행 + gotchas 추가.
