---
name: music-verifier
description: Hand Chord Wheel 커밋 전 확정적 검증. 타입 검사·단위 테스트·자산·시크릿·버전 고정·대용량 파일 미추적을 한 번에 확인한다. "검증해", "verify", 커밋 직전에 사용.
---

# music-verifier

## 언제
- 코드 수정 후 커밋 직전 (필수)
- 의존성 변경 후
- 새 clone에서 환경 점검

## 절차
1. `bash .claude/skills/music-verifier/scripts/verify-all.sh` 실행 (프로젝트 `scripts/verify-all.sh`를 호출)
2. 출력의 FAIL 0개 확인. WARN(자산 없음)은 `npm run setup`으로 해소.
3. 바뀐 파일을 `references/impact-matrix.md`에서 찾아 수동 확인 항목을 수행.
4. 새 실패 패턴을 만났으면 `gotchas.md`에 증상/원인/규칙/적용 시점 형식으로 추가.

## 수동 합격 기준 (main.ts·config.ts·mapping.ts 변경 시)
- Chrome 내장 카메라에서 25 fps 이상
- 칸 경계에 손을 5초 두어도 코드 불변
- 주먹 쥐면 100 ms 안에 무음, 다시 펴면(20% 이상) 소리
- Reset → 즉시 무음, 손을 내렸다 올리기 전까지 무음 유지
- 손을 화면 밖으로 빼면 0.5초 뒤 무음
- 연주 중 카메라를 다른 앱이 가져가면 0.5초 안에 무음 + '다시 시도' 안내
- 12칸을 2초 안에 한 바퀴 훑어도 콘솔에 "Max polyphony exceeded" 없음
