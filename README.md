# LABi — Lab intelligence

연구소/연구기업 운영 시스템: **LIMS + 과제관리 + 인사관리** (한국어 UI)

## 실행

```bash
npm install
npm run seed    # 최초 1회, 예시 데이터 입력 (데이터가 있으면 건너뜀)
npm run dev     # 개발 서버 (포트 3100)
npm run build && npm run start   # 프로덕션 (포트 3100)
```

## 구성

- **대시보드** `/` — 과제·연구비·시료·실험·인력·장비 현황 요약
- **과제관리** `/projects` — 과제 등록, 상세(`/projects/:id`)에서 참여연구원·마일스톤·예산 집행 관리
- **LIMS**
  - `/lims/samples` — 시료 등록·보관 위치·상태(보관/사용중/소진/폐기) 추적
  - `/lims/experiments` — 실험 기록, 과제·시료 연계, 결과 요약
  - `/lims/instruments` — 장비 현황, 점검 주기(점검 완료 시 +6개월 자동 설정)
- **인사관리** `/hr` — 연구원 명부, 진행 과제 참여율 합계(100% 초과 시 빨간색), 휴가 신청/승인

## 구글시트 연동 (`/sync`)

시트 탭 9개(인원·과제·참여연구원·마일스톤·예산집행·시료·실험·장비·휴가)와 양방향 동기화.

- **가져오기 (시트 → LABi)**: 인원·과제·시료·실험·장비는 키(이메일/번호/시리얼) 기준 **갱신+추가**,
  참여연구원·마일스톤·예산집행·휴가는 탭 내용으로 **전체 교체**. 이름/과제번호는 자동 매칭하며 실패 건은 경고로 표시.
- **내보내기 (LABi → 시트)**: 9개 탭을 자동 생성/덮어쓰기. 처음엔 내보내기 한 번으로 양식을 만든 뒤 시트에서 수정 → 가져오기 방식 권장.

### 인증 설정

1. **서비스 계정 (양방향, 권장)** — GCP 콘솔 → 서비스 계정 생성 → Sheets API 활성화 → JSON 키를
   `data/service-account.json`으로 저장(또는 `GOOGLE_SERVICE_ACCOUNT_FILE`/`GOOGLE_SERVICE_ACCOUNT_JSON` 환경변수).
   대상 스프레드시트를 서비스 계정 이메일에 **편집자**로 공유.
2. **공개 시트 (가져오기 전용)** — 시트를 "링크가 있는 모든 사용자(뷰어)"로 공유하면 키 없이 가져오기만 동작.

`/sync` 페이지에 스프레드시트 URL을 붙여넣고 저장하면 연결됩니다.

## 기술 스택

- Next.js 15 (App Router, Server Actions) + TypeScript + Tailwind CSS 4
- SQLite (better-sqlite3) — DB 파일: `data/labi.db` (스키마는 첫 접속 시 자동 생성)

## 구조

```
src/
  db/index.ts      # DB 연결 + 스키마 (members, projects, project_members,
                   #   milestones, budget_items, samples, experiments, instruments, leaves)
  db/seed.ts       # 예시 데이터
  lib/queries.ts   # 읽기 쿼리 (타입 포함)
  lib/actions.ts   # Server Actions (CRUD)
  components/ui.tsx
  app/             # 페이지 (모두 서버 컴포넌트 + form action)
```
