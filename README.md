# LABi — Lab intelligence

학과·여러 연구실을 위한 연구 운영 시스템: **LIMS + 과제관리 + 인사관리** (한국어 UI, 멀티랩)

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
