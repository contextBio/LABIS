#!/usr/bin/env bash
# 릴리즈 배포: dev → main 머지 → 빌드 → 운영 서버(:3100) 재시작
# dev 브랜치에서 개발을 마친 뒤 실행한다. 실행 후 브랜치는 dev로 복귀한다.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH=/opt/node/bin:$PATH

if [ -n "$(git status --porcelain)" ]; then
  echo "오류: 커밋되지 않은 변경이 있습니다. 커밋 또는 스태시 후 다시 실행하세요." >&2
  exit 1
fi

CUR=$(git rev-parse --abbrev-ref HEAD)
if [ "$CUR" != "dev" ]; then
  echo "오류: dev 브랜치에서 실행하세요. (현재: $CUR)" >&2
  exit 1
fi

echo "==> dev 푸시"
git push origin dev

echo "==> main 머지"
git checkout main
git pull --ff-only origin main
git merge --no-ff dev -m "release: dev 머지 ($(git log -1 --format=%h dev))"
git push origin main

echo "==> 빌드"
npm run build

echo "==> 운영 서버 재시작 (:3100)"
fuser -k 3100/tcp 2>/dev/null || true
sleep 2
nohup npm run start >> "$HOME/labis-server.log" 2>&1 &
sleep 3
if curl -sf -o /dev/null http://localhost:3100/labis || curl -sf -o /dev/null http://localhost:3100; then
  echo "==> 운영 서버 기동 확인"
else
  echo "경고: :3100 응답 없음 — $HOME/labis-server.log 확인 필요" >&2
fi

git checkout dev
echo "==> 릴리즈 완료. 브랜치 dev로 복귀."
