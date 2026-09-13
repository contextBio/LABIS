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
    · 관리자 설정에 **구글 드라이브 폴더**를 지정하면 그 폴더의 스프레드시트 목록(이름·수정일·주소)이 여기 뜬다.
    폴더를 서비스 계정에 뷰어로 공유해야 하고, 클라우드 프로젝트에서 **Drive API** 가 켜져 있어야 한다.
  - 과제관리 `/projects` — 과제·참여연구원·마일스톤·예산 집행
  - 프로젝트 `/research` — 수주 과제와 별개인 랩 내부 연구 단위 (책임자·기간·연계 과제)
  - LIMS `/lims/samples` `/lims/experiments` `/lims/instruments`
  - 인사관리 `/hr` — 명부(프로필)·참여율·휴가 승인
  - 구글시트 연동 — 관리자 설정 안의 구획(`/admin/settings`, 새 화면 `#/settings`). `/sync` 는 그리로 넘어간다.
    **항목별** 시트 주소 연동으로, 주소를 저장하면 즉시 그 항목 DB로 반영한다.
    워크시트는 URL 의 `#gid=` > 항목 이름과 같은 탭 > 시트가 하나뿐이면 그 시트 순으로 고른다.
    항목별 주소가 없으면 랩 통합 스프레드시트를 쓴다. 입력창은 각 메뉴 상단에도 붙는다.
    (인원 탭은 계정과 결합되어 내보내기 전용)
  - 관리자 설정 `/admin/settings` — 연구실 추가·상태(학과관리자, **삭제 없음 — 폐쇄로**) · 팀원 추가/삭제(랩매니저↑,
    역할변경·삭제는 PI) · 팀원별 메뉴 접근 권한(PI) · 구글시트 연동(랩매니저↑). 새 화면은 `#/settings`.
    팀원 추가는 여러 명을 한 번에 받는다(한 줄에 하나, `이름 <메일>` 형태 가능) — 계정이 있으면
    바로 배정, 없으면 초대 링크. 시트 가져오기는 **명부의 이름**으로 사람을 찾으므로 시트의
    이름과 같아야 반영된다.
    `/lab/members`·`/lab/permissions`·`/sync` 는 여기로 넘어간다.
    폐쇄된 연구실은 입장 목록·랩 전환기에서 감추고, 이 화면에서만 보인다(다시 운영으로 돌리는 길).
  - 사용자 관리 `/admin/labs`(학과관리자) — 전체 계정 · c1 연결 · 학과관리자 지정

## 폴더 수집 에이전트 (파일 시트 → DB 구축)

지정 폴더의 엑셀(.xlsx)/CSV 파일로 랩 DB를 구축/갱신한다. 매핑 규칙은 구글시트 동기화와 동일 —
`.xlsx`는 **워크시트 이름**, `.csv`는 **파일 이름**이 탭명(과제/참여연구원/마일스톤/예산집행/시료/실험/장비/휴가)과
일치하면 반영된다. 반영 규칙은 아래 **동기화 규칙**과 같다(같은 `SPECS` 를 쓴다). 인원 탭은 계정과 결합되어 건너뜀.
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

## 구글시트 수집 에이전트 (시트 → DB, 주기 실행)

화면(관리자 설정 → 구글시트 연동)에서 등록한 시트 주소를 그대로 읽어 주기적으로 반영한다.
소스를 따로 등록하지 않고, 결과도 같은 화면의 항목별 로그에 남는다.

```bash
npm run sheet                          # 연결된 모든 랩·항목 1회 (변경분만)
npm run sheet -- --list                # 연결 현황만 본다
npm run sheet -- --lab 2 --tabs 휴가,구매
npm run sheet -- --force               # 시트가 그대로여도 다시 반영
npm run sheet:watch -- --interval 300  # 주기 실행 (초, 기본 300)
```

시트 내용의 지문을 랩 설정에 남겨 **내용이 그대로면 DB를 건드리지 않는다** — 짧은 주기로 돌려도
헛일하지 않고, 화면의 마지막 반영 기록도 덮이지 않는다. 사람이 화면에서 누른 '다시 가져오기'는
언제나 그대로 실행한다. 폐쇄한 연구실은 건너뛴다.

상시 서비스로 돌리려면 `labis-ingest.service` 와 같은 방식으로 systemd 유닛을 하나 더 두면 된다
(`ExecStart` 를 `npm run sheet:watch` 로).

### 동기화 규칙 (시트·폴더 공통)

| 항목 | 맞추는 기준 |
|---|---|
| 과제·프로젝트·시료·실험 | 코드(과제번호 등) |
| 장비 | 장비명 |
| 참여연구원 | (과제, 사용자) |
| 마일스톤·예산집행·논문·특허·기술이전·구매·연구비수입·휴가 | `sourceKey` — 행 내용에서 만든 자연키 |

**전체 교체를 하지 않는다.** 시트 줄은 위 기준으로 갱신하거나 추가하고, 시트에서 사라진
**시트 기원** 행만 지운다. 화면에서 직접 넣은 행(`sourceKey` 가 빈 행)은 시트에 없어도 남는다.
행 id 가 유지되므로 감사 로그와 화면의 조작 대상도 어긋나지 않는다.

`sourceKey` 가 없던 기존 행은 내용이 시트 줄과 완전히 같으면 그 행을 **물려받는다**(중복도
유실도 만들지 않는다). 같은 자연키가 여러 줄이면 등장 순서로 갈라(`키#2`) 둘 다 살린다.

> 한 항목을 시트와 폴더 파일로 **동시에** 관리하지는 말 것 — 서로를 '사라진 행' 으로 보고 지운다.

## 기술 스택

- Next.js 15 (App Router, Server Actions) + TypeScript + Tailwind CSS 4
- PostgreSQL 17 (S1 네이티브) + Prisma 6.19.3 — 스키마 `prisma/schema.prisma`
- Auth.js v5 (JWT 세션 — 프로바이더 없음, contextBio SSO 가 세션을 발급)

## 연구비 현황 대시보드

정적 프론트 대시보드는 연결된 연구비 시트의 `집행_2026` 탭(A–J열)을 읽어
예산·이월·집행액·집행예정액·잔액 카드, 과제 선택, 과제별 집행률 및 상세표,
비목별 현황과 장부 불일치·음수 잔액 알림을 표시한다. 원본 표는 펼쳐서 확인할 수 있다.

- 합계와 잔액은 시트 I열 계산값을 사용한다. 미지급인건비를 포함해 임의로 재합산하지 않는다.
- 집행률은 `집행액 / (예산 + 이월)`이며 집행예정액은 별도로 표시한다.
- 전체 잔액과 `당해종료` 소계는 구분하며, 빈 값·계산 오류는 0으로 바꾸지 않는다.
- 조회 시각은 대시보드에서 읽은 시각이다. 새로고침하면 시트를 다시 조회한다.
- 기존 `/api/v1/finance-sheet`의 랩 연결 확인 및 연구비·대시보드 메뉴 권한을 따른다.
- 파싱·표시 회귀 검증: `node tests/finance-dashboard.test.cjs`.

## 연구실 운영관리 대시보드

`업무관리(2026)` 탭의 팀·업무·팀장·담당자·관리자료·내용·검토 메모를 표시한다.
팀별 필터, 업무·담당자 검색, 업무 수·담당자 수·담당자 미기재 수, 새로고침을 제공한다.
담당자만 이어지는 행은 바로 앞 업무에 합치며 빈 담당자는 임의로 채우지 않는다.

- API: `/api/v1/operations-sheet`. 기존 연구비 통합 시트가 연결된 랩에서만 조회하며
  대시보드와 인사 메뉴 조회 권한을 함께 확인한다.
- 계정정보가 들어 있는 H열은 조회하지 않는다. A:G와 I열만 읽고 정제된 업무 객체만 응답한다.
- 검토 메모는 과거 원문이며 현재 완료 상태로 집계하지 않는다.
- 검증: `node --import tsx tests/operations-sheet.test.ts`.

## 대시보드 ↔ 원본 시트 수정·자동 연동

연구비와 운영관리 대시보드는 원본 시트를 직접 읽고 쓴다. 복제 DB에 덮어쓰는 방식이 아니다.

- 화면이 보이는 동안 30초 간격으로 조회하고, 다른 탭에서 돌아올 때 즉시 다시 조회한다.
  수정 창이 열려 있거나 검색창·선택창을 조작 중이면 자동 갱신을 잠시 멈춘다.
- 운영관리 표의 `수정`, 연구비의 `원본 A–J열 보기 · 수정`에서 행별 수정 창을 연다.
  `시트에 저장`하면 변경한 셀만 원본에 저장하고 대시보드를 다시 조회한다.
- 편집은 랩매니저 이상이면서 해당 메뉴 편집 권한이 있는 구성원에게 제공한다.
  원본 시트에도 LABIS 서비스 계정의 편집 권한이 필요하다.
- 일반 수식·배열/연동 수식의 계산 결과·병합 셀·입력 규칙·보호 셀은 유지한다.
  이런 셀은 원본 시트의 입력 위치에서 수정한다. 운영관리 H열은 읽거나 쓰지 않는다.
- 저장 직전 행의 원본 값·계산 결과·보호 정보를 재조회해 변경이 있으면 409로 중단한다.
  서버 내 대시보드 저장은 직렬 처리한다. Google Sheets API는 외부 사용자 편집과의
  원자적 비교·저장을 제공하지 않으므로, 재조회와 저장 사이 극히 짧은 동시 편집까지
  완전히 배제하지는 못한다.
- API: `/api/v1/dashboard-sheet-edit?lab=…&kind=finance|operations&row=…` (GET/POST).
- 검증: `node --import tsx tests/dashboard-sheet-edit.test.ts`.

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
