# contextbio.ai/labis 경로 유지형 프록시 (Cloud Run)

현재 `contextbio.ai/labis`는 **302 리다이렉트**로 `https://c1.sysmed.kr/labis`에 연결되어 있다
(ContextBio 저장소 firebase.json). 주소창까지 `contextbio.ai/labis`로 유지하려면 Firebase Hosting
rewrite → Cloud Run 프록시가 필요하다. Firebase Hosting은 임의 서버로의 rewrite를 지원하지 않고
Cloud Run/Functions만 가능하기 때문.

## 1회 설정 (GCP 콘솔 권한 보유자가 실행, 약 5분)

Firebase 프로젝트 `contextbio`에 결제(Blaze)가 활성화되어 있어야 한다.

```bash
# 이 디렉터리(docs/contextbio-proxy)에서
gcloud auth login
gcloud config set project contextbio
gcloud run deploy labi-proxy \
  --source . \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 3
```

## 배포 후 firebase.json 수정

ContextBio 저장소 firebase.json의 main 타깃에서 **/labis 리다이렉트 두 개를 삭제**하고,
`rewrites` 배열 맨 앞에 추가:

```json
{
  "source": "/labis{,/**}",
  "run": { "serviceId": "labi-proxy", "region": "asia-northeast3" }
}
```

푸시하면 GitHub Actions가 배포한다.

## LABIS 쪽 전환 (프록시 활성화 후)

`.env`에서 정식 도메인을 contextbio.ai로 교체 후 재시작:

```
APP_URL=https://contextbio.ai/labis
AUTH_URL=https://contextbio.ai/api/auth
```

비고: 프록시는 X-Forwarded-Host를 contextbio.ai로 설정하고, 오리진(c1.sysmed.kr)으로 나가는
Location 헤더를 공개 도메인으로 교정한다. 비용은 트래픽 규모상 Cloud Run 무료 한도 내 예상.

## 개발 사이트 변형 (dev-contextbio.web.app)

현재 개발 배선은 **302 리다이렉트**다: dev-contextbio.web.app/LABIS → c1.sysmed.kr/labis-dev
(주소창이 c1으로 넘어간다). 주소창까지 dev-contextbio.web.app 에 유지하려면 같은 이미지로
서비스 하나를 더 올린다 — server.js 가 ORIGIN_HOST/PUBLIC_HOST 를 env 로 받으므로 코드 수정 없음:

```bash
gcloud run deploy labi-proxy-dev \
  --source . \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --min-instances 0 --max-instances 2 \
  --set-env-vars PUBLIC_HOST=dev-contextbio.web.app
```

배포 후 ContextBio 저장소 build_dev.py 의 dev 타깃 생성부에서 LABIS 리다이렉트 치환 대신
rewrites 맨 앞에 `{"source": "/labis-dev{,/**}", "run": {"serviceId": "labi-proxy-dev",
"region": "asia-northeast3"}}` 를 넣고, /LABIS·/labis 리다이렉트는 같은 사이트의
/labis-dev 로(상대 경로) 바꾼다. LABIS 쪽 .env.development 는
`APP_URL=https://dev-contextbio.web.app/labis-dev`, `AUTH_URL=https://dev-contextbio.web.app/api/auth` 로.
