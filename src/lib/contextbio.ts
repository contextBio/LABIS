/**
 * contextBio 통합 계정 — Firebase ID 토큰 검증.
 *
 * 세 분석 서비스가 이미 한 계정을 쓴다(contextbio.ai/login). LABIS 도 같은 계정으로
 * 들어오게 하되, **세션은 여기서 우리 것으로 만든다** — 남의 토큰을 그대로 세션으로
 * 쓰면 그 토큰이 만료되거나 폐기될 때 이쪽이 알 방법이 없다.
 *
 * 검증은 Identity Toolkit 의 accounts:lookup 으로 한다. 서명·만료·프로젝트 일치를
 * 구글이 확인해 주고, 계정 정지(disabled)까지 응답에 실려 온다. 서비스 계정 키가
 * 필요 없어 이 서버에 비밀을 하나 덜 둔다 — 웹 apiKey 는 비밀이 아니라 식별자다.
 *
 * 폐기 확인(validSince)과 커스텀 클레임(admin·apps)도 여기서 본다 — 다른 백엔드들의
 * 공용 모듈(contextbio_auth.py)과 같은 의미론이다. 폐기된 토큰으로 로그인 시점에
 * 새 세션을 따는 것을 막고, apps 클레임이 있는 계정은 "labis" 가 든 경우만 통과시킨다
 * (클레임이 아예 없으면 서비스를 구분하지 않는 계정이므로 전부 허용 — 함대 규칙).
 */
const LOOKUP = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";
const SERVICE_NAME = "labis";

export type ContextBioIdentity = {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
  admin: boolean;
  /** apps 클레임 — undefined 면 클레임 없음(모든 서비스 허용) */
  apps?: string[];
};

/** ID 토큰(JWT)의 payload 를 서명 검증 없이 읽는다 — auth_time 비교 전용.
 *  신뢰의 근거는 lookup 응답이고, 이 값은 폐기 시점과 대조하는 데만 쓴다. */
function tokenPayload(idToken: string): { auth_time?: number } {
  try {
    const seg = idToken.split(".")[1] ?? "";
    const json = Buffer.from(seg.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/** 이 계정이 LABIS 를 쓸 수 있는가 — admin 이거나, apps 클레임이 없거나, labis 포함. */
export function mayUseLabis(ident: ContextBioIdentity): boolean {
  if (ident.admin) return true;
  if (!ident.apps) return true;
  return ident.apps.includes(SERVICE_NAME);
}

/** ID 토큰 → 신원. 위조·만료·정지된 토큰이면 null. */
export async function verifyContextBioToken(
  idToken: string
): Promise<ContextBioIdentity | null> {
  const key = process.env.CONTEXTBIO_FIREBASE_API_KEY;
  if (!key || !idToken) return null;
  let data: {
    users?: Array<{
      localId?: string;
      email?: string;
      emailVerified?: boolean;
      displayName?: string;
      disabled?: boolean;
      validSince?: string;
      customAttributes?: string;
    }>;
  };
  try {
    const res = await fetch(`${LOOKUP}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    return null;                       // 네트워크가 끊겼을 뿐일 수도 있다 — 통과시키지는 않는다
  }
  const u = data.users?.[0];
  if (!u?.localId || !u.email || u.disabled) return null;

  // 폐기 확인 — 토큰이 폐기 시점(validSince) 이전에 발급됐다면 이미 무효다.
  // 만료 전 토큰이라도 revoke 뒤에는 여기서 걸러져야 새 세션을 따지 못한다.
  if (u.validSince) {
    const authTime = tokenPayload(idToken).auth_time ?? 0;
    if (authTime < Number(u.validSince)) return null;
  }

  // 커스텀 클레임 — 권한의 정본. lookup 은 JSON 문자열로 실어 준다.
  let claims: { admin?: unknown; apps?: unknown } = {};
  try {
    claims = JSON.parse(u.customAttributes || "{}");
  } catch {
    /* 클레임 훼손은 "클레임 없음" 으로 취급 */
  }
  const apps = Array.isArray(claims.apps) ? claims.apps.map(String) : undefined;

  return {
    uid: u.localId,
    email: u.email.toLowerCase(),
    emailVerified: !!u.emailVerified,
    name: u.displayName || "",
    admin: claims.admin === true,
    apps,
  };
}


/** 검증 캐시 — API 는 요청마다 토큰을 다시 받으므로, 같은 토큰의 lookup 왕복을
 *  줄인다 (contextbio_auth.py 의 5분 캐시와 같은 의미론 — 성공만 캐시한다). */
const _cache = new Map<string, { exp: number; ident: ContextBioIdentity }>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 300;

export async function verifyContextBioTokenCached(
  idToken: string
): Promise<ContextBioIdentity | null> {
  const hit = _cache.get(idToken);
  if (hit && hit.exp > Date.now()) return hit.ident;
  const ident = await verifyContextBioToken(idToken);
  if (ident) {
    if (_cache.size >= CACHE_MAX) {
      const first = _cache.keys().next().value;
      if (first) _cache.delete(first);
    }
    _cache.set(idToken, { exp: Date.now() + CACHE_TTL_MS, ident });
  }
  return ident;
}

/** 통합 계정으로 로그인할 때 여는 주소. 돌아올 곳을 함께 넘긴다. */
export function contextBioLoginUrl(returnTo: string): string {
  const site = process.env.CONTEXTBIO_SITE_URL || "https://contextbio.ai";
  return `${site.replace(/\/+$/, "")}/login?next=${encodeURIComponent(returnTo)}`;
}
