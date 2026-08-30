# LABIS — Lab Intelligence System

학과·여러 연구실을 위한 연구 운영 시스템 (한국어 UI, 멀티랩).
관리 항목: **인사 · 과제 · 연구비(수지 분석) · 성과(논문/특허/기술이전) · 구매 · 장비** + LIMS(시료·실험)

## 브랜치·배포 구조 (dev / main 분리)

| | 브랜치 | 위치 | 포트 | DB |
|---|---|---|---|---|
| 운영 | `main` | `/mnt/S1/sdata/agents/apps/LABIS` | 3100 (→ https://c1.sysmed.kr/labis) | `labi` |
| 개발 | `dev` | `/mnt/S1/sdata/agents/apps/LABIS-dev` (git worktree) | 3101 | `labi_dev` (운영 복제본) |

개발 흐름: **LABIS-dev에서 작업·커밋(dev)** → 검증 후 운영 폴더에서
`git merge dev && npm run build && 재시작`. 스키마 변경 시 dev에서 `npm run db:migrate`로
마이그레이션을 만들고, 운영 머지 후 `npm run db:deploy`.

```bash
# 개발 서버
cd /mnt/S1/sdata/agents/apps/LABIS-dev && PORT=3101 npm run dev
# 운영 배포
cd /mnt/S1/sdata/agents/apps/LABIS && git merge dev && npm run db:deploy && npm run build && (재시작)
```

## 실행

```bash
export PATH=/opt/node/bin:$PATH   # Node 24 (시스템 전역)
npm install
npm run db:deploy                 # Prisma 마이그레이션 적용
npm run build && npm run start    # 프로덕션 (포트 3100)
```

`.env` 필수 값: `DATABASE_URL`(Postgres), `AUTH_SECRET`, `APP_URL`. 선택: `AUTH_GOOGLE_ID/SECRET`(구글 로그인),
`GOOGLE_SERVICE_ACCOUNT_FILE`(시트 양방향 동기화, 기본 `data/service-account.json`).

## 구조

- **인증·가입**: 초대 기반 (공개 가입 없음). 최초 접속 시 `/setup`에서 학과관리자 생성.
- **MUSE 공동 로그인**: ① 로그인 폼에 c1 리눅스 계정명+암호 입력 시 MUSE와 같은 PAM
  헬퍼(muse-pam-verify)로 검증 후 자동 계정 생성·로그인. ② MUSE(c1.sysmed.kr:8443)에
  로그인된 브라우저가 LABIS에 오면 muse_session 쿠키를 검증해 **자동 SSO**(로그아웃
  직후는 제외). c1 계정 ↔ 기존 사용자 연결은 학과 관리 페이지에서. 구현: `src/lib/muse.ts`
  (itsdangerous 서명 호환 검증 — 시크릿 파일 공유, 서버 세션 저장소 없음).
- **조직**: 학과(전역) → 연구실 × N → 구성원(Membership). 한 사용자가 여러 랩 소속 가능.
- **권한**: 학과관리자 / PI / 랩매니저 / 연구원. 모든 페이지·액션은 서버 가드(`requireLab`)로
  활성 랩(사이드바 전환기) + 역할을 검증. 관리 행위는 감사 로그 기록.
- **모듈** (모두 랩 스코프):
  - 대시보드 `/` — 과제·연구비·시료·실험·인력·장비 요약
  - 과제관리 `/projects` — 과제·참여연구원·마일스톤·예산 집행
  - LIMS `/lims/samples` `/lims/experiments` `/lims/instruments`
  - 인사관리 `/hr` — 명부(프로필)·참여율·휴가 승인
  - 구글시트 연동 `/sync` — 랩별 시트 양방향 동기화 (인원 탭은 내보내기 전용)
  - 관리: `/admin/labs`(학과관리자), `/lab/members`(PI·랩매니저: 초대 링크)

## 폴더 수집 에이전트 (파일 시트 → DB 구축)

지정 폴더의 엑셀(.xlsx)/CSV 파일로 랩 DB를 구축/갱신한다. 매핑 규칙은 구글시트 동기화와 동일 —
`.xlsx`는 **워크시트 이름**, `.csv`는 **파일 이름**이 탭명(과제/참여연구원/마일스톤/예산집행/시료/실험/장비/휴가)과
일치하면 반영된다. 키 있는 엔티티는 갱신+추가, 관계형은 전체 교체. 인원 탭은 계정과 결합되어 건너뜀.
변경된 파일만 재처리(mtime 추적, `--force`로 전체 재처리), 결과는 감사 로그에 남는다.

```bash
# 1회 반영
npm run ingest -- --dir /path/to/폴더 --lab 2

# 폴더↔랩 매핑 등록 후 등록분 전체 실행 (다른 폴더·다른 랩도 등록만 하면 됨)
npm run ingest -- --add-source /path/to/A랩폴더 2 "A랩"
npm run ingest -- --add-source /path/to/B랩폴더 5 "B랩"
npm run ingest            # 등록된 소스 전부 1회
npm run ingest:watch      # 감시 모드 (기본 30초, --interval N)
```

상시 서비스로 돌리려면 (systemd 예시):

```ini
# /etc/systemd/system/labis-ingest.service
[Unit]
Description=LABIS folder ingest agent
[Service]
User=hg
WorkingDirectory=/mnt/S1/sdata/agents/apps/LABIS
Environment=PATH=/opt/node/bin:/usr/bin:/bin
ExecStart=/opt/node/bin/npx tsx scripts/ingest-agent.ts --watch --interval 60
Restart=on-failure
[Install]
WantedBy=multi-user.target
```

## 기술 스택

- Next.js 15 (App Router, Server Actions) + TypeScript + Tailwind CSS 4
- PostgreSQL 17 (S1 네이티브) + Prisma 6.19.3 — 스키마 `prisma/schema.prisma`
- Auth.js v5 (JWT 세션, Credentials + Google 옵션)

## 코드 맵

```
src/
  lib/auth.ts         # Auth.js 설정
  lib/guard.ts        # requireUser/requireDeptAdmin/requireLab + 감사 로그
  lib/queries.ts      # 조회 (랩 스코프)
  lib/actions.ts      # 도메인 CRUD 액션 (가드 적용)
  lib/orgActions.ts   # 랩·구성원·초대 관리
  lib/google.ts       # Sheets API (JWT), 공개 CSV, 랩별 설정
  lib/sheetSync.ts    # 시트 탭 ↔ DB 매핑
  app/login|setup|invite  # 공개 페이지
  app/(app)/...           # 앱 (인증 필요)
scripts/migrate-sqlite.ts # v0.1 SQLite → Postgres 1회성 이관
```

## 운영 메모

- 날짜는 'YYYY-MM-DD' 문자열로 저장 (date input·시트 연동과 일치).
- HTTPS: 80/443은 기존 Apache가 점유 — 도메인 확정 시 vhost + certbot로 연결 (docs/PLAN.md 참고).
