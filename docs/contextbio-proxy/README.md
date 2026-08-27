# contextbio.ai/labi 경로 유지형 프록시 (Cloud Run)

현재 `contextbio.ai/labi`는 **302 리다이렉트**로 `https://c1.sysmed.kr/labi`에 연결되어 있다
(ContextBio 저장소 firebase.json). 주소창까지 `contextbio.ai/labi`로 유지하려면 Firebase Hosting
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

ContextBio 저장소 firebase.json의 main 타깃에서 **/labi 리다이렉트 두 개를 삭제**하고,
`rewrites` 배열 맨 앞에 추가:

```json
{
  "source": "/labi{,/**}",
  "run": { "serviceId": "labi-proxy", "region": "asia-northeast3" }
}
```

푸시하면 GitHub Actions가 배포한다.

## LABi 쪽 전환 (프록시 활성화 후)

`.env`에서 정식 도메인을 contextbio.ai로 교체 후 재시작:

```
APP_URL=https://contextbio.ai/labi
AUTH_URL=https://contextbio.ai/api/auth
```

비고: 프록시는 X-Forwarded-Host를 contextbio.ai로 설정하고, 오리진(c1.sysmed.kr)으로 나가는
Location 헤더를 공개 도메인으로 교정한다. 비용은 트래픽 규모상 Cloud Run 무료 한도 내 예상.
