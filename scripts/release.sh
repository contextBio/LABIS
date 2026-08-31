#!/usr/bin/env bash
# 릴리즈 배포 — 두-워크트리 구조 (브랜치 전환 없음).
#
#   bare 저장소   /mnt/S1/sdata/agents/ContextBio/LABIS.git
#   dev  워크트리 /mnt/S1/sdata/agents/dev/LABIS        (dev 고정,  :3101, DB labi_dev)
#   운영 워크트리 /mnt/S1/sdata/agents/ContextBio/LABIS (main 고정, :3100, DB labi)
#
# 흐름: dev 워크트리에서 검증을 마친 뒤 실행 —
#   dev 푸시 → 운영 워크트리에서 main 에 dev 머지 → 버전 태그 → 의존성·빌드 → :3100 재시작.
# 어느 워크트리도 브랜치를 갈아타지 않으므로 개발과 운영이 서로를 막지 않는다.
set -euo pipefail
export PATH=/opt/node-v24.19.0-linux-x64/bin:/opt/node/bin:$PATH

DEV_WT=${LABIS_DEV_WT:-/mnt/S1/sdata/agents/dev/LABIS}
PROD_WT=${LABIS_PROD_WT:-/mnt/S1/sdata/agents/ContextBio/LABIS}
DRY=${1:-}

[ "$(git -C "$DEV_WT" rev-parse --abbrev-ref HEAD)" = "dev" ] \
  || { echo "오류: dev 워크트리가 dev 브랜치가 아닙니다." >&2; exit 1; }
[ -z "$(git -C "$DEV_WT" status --porcelain)" ] \
  || { echo "오류: dev 워크트리에 커밋되지 않은 변경이 있습니다." >&2; exit 1; }
[ "$(git -C "$PROD_WT" rev-parse --abbrev-ref HEAD)" = "main" ] \
  || { echo "오류: 운영 워크트리가 main 브랜치가 아닙니다." >&2; exit 1; }
[ -z "$(git -C "$PROD_WT" status --porcelain --untracked-files=no)" ] \
  || { echo "오류: 운영 워크트리에 커밋되지 않은 변경이 있습니다." >&2; exit 1; }

echo "==> 나갈 커밋:"
git -C "$PROD_WT" --no-pager log --oneline main..dev | sed 's/^/    /'
[ -z "$(git -C "$PROD_WT" log --oneline main..dev)" ] && echo "    (없음 — 이미 최신)"
if [ "$DRY" = "--dry-run" ]; then echo "==> --dry-run 이라 여기까지."; exit 0; fi

echo "==> dev 푸시"
git -C "$DEV_WT" push origin dev 2>/dev/null || echo "  (푸시 실패 — 나중에 수동 푸시)"

if [ -n "$(git -C "$PROD_WT" log --oneline main..dev)" ]; then
  echo "==> main 에 dev 머지 + 태그"
  git -C "$PROD_WT" merge --no-ff dev -m "release: dev 머지 ($(git -C "$DEV_WT" log -1 --format=%h))"
  TAG="release-$(date +%Y%m%d-%H%M)"
  git -C "$PROD_WT" tag "$TAG"
  git -C "$PROD_WT" push origin main "$TAG" 2>/dev/null \
    || echo "  (푸시 실패 — 네트워크 확인 후 main·$TAG 수동 푸시)" >&2
fi

echo "==> 의존성·빌드 (운영 워크트리)"
cd "$PROD_WT"
npm ci --no-audit --no-fund
npm run build
# next build/dev 가 next-env.d.ts·tsconfig.json 을 고쳐 쓴다 — 릴리즈 후 원복
git checkout -- next-env.d.ts tsconfig.json 2>/dev/null || true

echo "==> 운영 서버 재시작 (:3100)"
fuser -k 3100/tcp 2>/dev/null || true
sleep 2
nohup npm run start >> "$HOME/labis-server.log" 2>&1 &
sleep 3
if curl -sf -o /dev/null http://localhost:3100/labis || curl -sf -o /dev/null http://localhost:3100; then
  echo "==> 운영 서버 기동 확인 (${TAG:-변경 없음})"
else
  echo "경고: :3100 응답 없음 — $HOME/labis-server.log 확인 필요" >&2
fi
