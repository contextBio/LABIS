# LABIS — Lab Intelligence System

학과·여러 연구실을 위한 연구 운영 시스템 (한국어 UI, 멀티랩).
관리 항목: **인사 · 과제 · 프로젝트 · 연구비(수지 분석) · 성과(논문/특허/기술이전) · 구매 · 장비** + LIMS(시료·실험)

## 브랜치·배포 구조 (dev / main 분리, 단일 디렉터리)

저장소: https://github.com/contextBio/LABIS — 작업 디렉터리는 `/mnt/S1/sdata/agents/apps/LABIS` 하나이며,
평소에는 **dev 브랜치를 체크아웃**한 상태로 개발한다.

| | 브랜치 | 포트 | DB | 배포 URL |
|---|---|---|---|---|
| 운영(릴리즈) | `main` | 3100 | `labi` | https://contextbio.ai/LABIS (→ c1.sysmed.kr/labis) |
| 개발 | `dev` | 3101 | `labi_dev` (운영 복제본) | https://dev-contextbio.web.app/LABIS |

- 개발 서버(`npm run dev`, :3101)는 `.env.development`를 로드해 `labi_dev` DB를 쓴다.
- 운영 서버(`npm run build && npm run start`, :3100)는 `.env`의 `labi` DB를 쓴다.
- 스키마 변경 시 dev에서 `npm run db:migrate`로 마이그레이션을 만들고, 릴리즈 후 `npm run db:deploy`.

```bash
# 개발: dev 브랜치에서 작업·커밋 후
npm run dev                # :3101, labi_dev DB
git push origin dev

# 릴리즈: dev → main 머지 + 빌드 + :3100 재시작 (끝나면 dev로 복귀)
./scripts/release.sh
```

## 실행

```bash
export PATH=/opt/node/bin:$PATH   # Node 24 (시스템 전역)
npm install
npm run db:deploy                 # Prisma 마이그레이션 적용
npm run build && npm run start    # 프로덕션 (포트 3100)
```

`.env` 필수 값: `DATABASE_URL`(Postgres), `AUTH_SECRET`, `APP_URL`. 선택: `GOOGLE_SERVICE_ACCOUNT_FILE`(시트 양방향 동기화, 기본 `data/service-account.json`).

## 구조

- **인증·가입**: **로그인은 contextBio 통합 계정 하나다 — 다른 앱과 동일한 방식**
  (2026-08-31, 자체 로그인 전면 삭제: 이메일+비밀번호·Google·MUSE c1 계정 경로 제거).
  초대 기반 (공개 가입 없음) — 관리자가 초대한 이메일의 통합 계정만 통과한다.
  구현: `src/lib/contextbio.ts`(토큰 검증 — 폐기·클레임 포함) + `/api/sso/contextbio`
  가 검증 후 Auth.js JWT 세션을 직접 굽는다. 비밀번호는 어디에도 없다 — 계정 관리
  (비밀번호·프로필)는 contextBio 화면에서 한다. 최초 접속 시 `/setup`은 학과관리자
  **레코드만** 만들고, 로그인은 같은 이메일의 통합 계정으로 한다.
  MUSE(c1 서버 사용자 관리)는 별개 서비스다 — LABIS 의 로그인 수단이 아니다.
- **조직**: 학과(전역) → 연구실 × N → 구성원(Membership). 한 사용자가 여러 랩 소속 가능.
- **권한**: 학과관리자 / PI / 랩매니저 / 연구원. 모든 페이지·액션은 서버 가드(`requireLab`)로
  활성 랩(사이드바 전환기) + 역할을 검증. 관리 행위는 감사 로그 기록.
- **메뉴별 권한**(2026-09-01): 역할 위에 얹는 **좁히기 전용** 층 — 팀관리자(PI)가 구성원별로
  메뉴를 `편집`(기본) / `읽기 전용` / `차단` 으로 조정한다. 설정이 없으면 편집 = 기존 규칙 그대로.
  권한을 넓히지는 못한다(편집이어도 역할이 모자라면 여전히 막힘). PI·학과관리자는 조정 대상 제외.
  구현: `src/lib/menus.ts`(메뉴 목록 단일 원본) + `src/lib/perm.ts` + `requireLab(minRole, menu, need)`
  + REST 쪽 `apiMenuAllowed`. 화면: `/lab/permissions`, 새 화면 `#/settings`.
- **모듈** (모두 랩 스코프):
  - 대시보드 `/` — 과제·연구비·시료·실험·인력·장비 요약
  - 과제관리 `/projects` — 과제·참여연구원·마일스톤·예산 집행
  - 프로젝트 `/research` — 수주 과제와 별개인 랩 내부 연구 단위 (책임자·기간·연계 과제)
  - LIMS `/lims/samples` `/lims/experiments` `/lims/instruments`
  - 인사관리 `/hr` — 명부(프로필)·참여율·휴가 승인
  - 구글시트 연동 `/sync` — **항목별** 시트 주소 연동. 주소를 저장하면 즉시 그 항목 DB로 반영한다.
    워크시트는 URL 의 `#gid=` > 항목 이름과 같은 탭 > 시트가 하나뿐이면 그 시트 순으로 고른다.
    항목별 주소가 없으면 랩 통합 스프레드시트를 쓴다. 입력창은 각 메뉴 상단에도 붙는다.
    (인원 탭은 계정과 결합되어 내보내기 전용)
  - 관리자 설정 `/admin/settings` — 연구실 추가·상태(학과관리자, **삭제 없음 — 폐쇄로**) · 팀원 추가/삭제(랩매니저↑,
    역할변경·삭제는 PI) · 팀원별 메뉴 접근 권한(PI). 새 화면은 `#/settings`.
    `/lab/members`·`/lab/permissions` 는 여기로 넘어간다.
  - 사용자 관리 `/admin/labs`(학과관리자) — 전체 계정 · c1 연결 · 학과관리자 지정

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
- Auth.js v5 (JWT 세션 — 프로바이더 없음, contextBio SSO 가 세션을 발급)

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
