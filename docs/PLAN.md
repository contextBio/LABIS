# LABi 공통 뼈대 (Core Skeleton) 플랜

> 2026-08-27 확정: 사용자 = **학과 + 여러 연구실** · 스택 = **Next.js + Postgres** · 진행 = 공통 뼈대부터

## 0. 현재 상태와 전환 방향

v0.1은 단일 연구실용 SQLite MVP (LIMS·과제·인사 + 구글시트 연동, 인증 없음).
멀티랩 환경으로 가려면 **인증·조직·권한·DB**가 공통 뼈대로 먼저 서야 하고,
기존 도메인 모듈(LIMS/과제/인사)은 그 위에 "랩 스코프"를 입혀 이식한다.
UI 코드(페이지·컴포넌트)는 대부분 재사용 가능.

## 1. 아키텍처 결정

| 항목 | 결정 | 근거 |
|---|---|---|
| 프레임워크 | Next.js 15 App Router + TS + Tailwind (유지) | v0.1 코드 재사용 |
| DB | **PostgreSQL 17 (S1 네이티브) + Prisma 6.19.3(핀 고정)** | 서버에 PG17 상시 구동 중이라 Docker 불필요. Prisma 8은 RC라 제외 |
| 배포 | S1 서버 네이티브 프로세스, 포트 3100 | 온프레미스, 단일 서버로 충분. Docker 데몬 미가동 |
| 접속 | **학과 도메인 + HTTPS** (2026-08-27 확정) — 80/443을 이미 점유 중인 **기존 Apache에 vhost + certbot** 추가 | OAuth 콜백·보안 쿠키에 HTTPS 필수 |
| 인증 | **Auth.js v5** — Google OAuth(학교 계정) + 이메일/비밀번호 보조 | 학과 구성원 대부분 구글 계정 보유 |
| 가입 | **초대 기반** (공개 가입 없음) | 학과 내부 시스템 |
| 테넌시 | **단일 DB + lab_id 행 스코핑** | 랩 수십 개 규모에 스키마 분리는 과함 |

## 2. 조직·권한 모델

```
학과 (Department, 시스템 전역 1개)
 └─ 연구실 (Lab) × N
     └─ 구성원 (Membership: user ↔ lab, 역할 보유)
```

- 한 사용자가 **여러 랩에 소속 가능** (공동지도, 겸직) → membership 테이블로 N:M
- 역할 4단계:
  - `DEPT_ADMIN` 학과관리자 — 전체 랩·사용자·설정 관리
  - `PI` 교수/연구책임 — 자기 랩 전체 관리 + 구성원 초대
  - `LAB_MANAGER` 랩매니저 — PI 위임 관리 (초대·데이터 관리)
  - `MEMBER` 연구원/학생 — 자기 랩 데이터 읽기/쓰기
- **데이터 스코프**: 모든 도메인 테이블에 `lab_id`. 헤더의 **랩 전환기(switcher)**로 활성 랩을 정하고, 모든 쿼리는 서버에서 활성 랩 + 권한으로 필터. 클라이언트가 lab_id를 보내는 구조 금지.
- 학과 공용 리소스(예: 공용 장비)는 `lab_id NULL + shared 플래그`로 표현 (뼈대에 자리만 마련, 기능은 후순위).

## 3. 뼈대 스키마 (Prisma)

```
User        id, email(uniq), name, image, password_hash?, is_dept_admin, created_at
Lab         id, name, pi_name, room, status, created_at
Membership  id, user_id, lab_id, role(PI|LAB_MANAGER|MEMBER), joined_at  @@unique(user,lab)
Invitation  id, email, lab_id, role, token(uniq), invited_by, expires_at, accepted_at?
AuditLog    id, user_id, lab_id?, action, entity, entity_id, detail(json), at
Setting     scope(dept|lab), lab_id?, key, value                          @@unique(scope,lab,key)
```

도메인 테이블(projects, samples, experiments, instruments, leaves…)은 Phase 3에서
현 SQLite 스키마 + `lab_id` 컬럼으로 Prisma에 이식.

## 4. 공통 UI/서버 뼈대

- `src/lib/auth.ts` — Auth.js 설정 (Google + Credentials), 세션에 memberships 포함
- `src/lib/guard.ts` — `requireLab(role?)`: 활성 랩·권한 검사 후 lab_id 반환. **모든 서버 액션·페이지의 진입점**
- `src/lib/audit.ts` — 쓰기 액션 공통 감사 로깅
- 레이아웃: 로그인 화면 / 앱 셸(사이드바 + 랩 전환기 + 사용자 메뉴)
- 관리 화면: `/admin/labs` (학과관리자), `/lab/members` (PI·매니저: 구성원·초대)

## 5. 단계별 계획

| Phase | 내용 | 산출물 |
|---|---|---|
| **P0 인프라** ✅ | ~~Docker~~ → 네이티브 PG17에 `labi` 롤/DB 생성, Prisma 6 초기화, 뼈대 6테이블 마이그레이션(`init_core_skeleton`), db:migrate/deploy/studio 스크립트. HTTPS는 도메인 확정 시 Apache vhost+certbot | `prisma/schema.prisma`, `.env`, `src/lib/prisma.ts` |
| **P1 인증** ✅ | Auth.js v5(비번, Google은 env 설정 시 자동 활성), 로그인/로그아웃, 초대 수락 가입, `/setup` 부트스트랩, `/account` 비밀번호 변경 | `/login`, `/invite/[token]`, `src/lib/auth.ts` |
| **P2 조직·권한** ✅ | 랩 CRUD·학과관리자 지정, 구성원 역할 관리, 초대 링크(7일 유효, 복사 전달), 랩 전환기, `requireUser/requireDeptAdmin/requireLab` 가드 + 감사 로깅 | `/admin/labs`, `/lab/members`, `src/lib/guard.ts` |
| **P3 도메인 이식** | LIMS·과제·인사 모듈을 Prisma+lab_id로 이식, 기존 SQLite 데이터 마이그레이션 스크립트 | 기존 화면 전부 랩 스코프로 동작 |
| **P4 시트 연동 이식** | 구글시트 동기화를 랩별 설정(시트 ID·서비스계정)으로 전환 | `/sync` 랩별 동작 |

P0–P2가 "공통 뼈대". P0+P1 → P2 순서로 각각 검증 후 진행.

## 6. 결정 필요 (확인 요청)

1. **Google OAuth 클라이언트** — 학과 GCP에서 OAuth 클라이언트 ID 발급 가능? (안 되면 이메일/비번만으로 시작)
2. **서버 Docker 사용 가능 여부** — S1에 docker/podman 있는지. 없으면 네이티브 Postgres 설치로 대체
3. **학과 공용 장비 예약**이 초기 요구인지 (뼈대에 자리만 둘지, P3에 포함할지)
4. ~~접속 도메인/HTTPS~~ → **도메인 + HTTPS 확정** (Caddy). 남은 것: 사용할 도메인명,
   DNS A 레코드 → 203.230.6.178, 방화벽 80/443 오픈
```
