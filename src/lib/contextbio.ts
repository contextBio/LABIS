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
 */
const LOOKUP = "https://identitytoolkit.googleapis.com/v1/accounts:lookup";

export type ContextBioIdentity = {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

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
  return {
    uid: u.localId,
    email: u.email.toLowerCase(),
    emailVerified: !!u.emailVerified,
    name: u.displayName || "",
  };
}

/** 통합 계정으로 로그인할 때 여는 주소. 돌아올 곳을 함께 넘긴다. */
export function contextBioLoginUrl(returnTo: string): string {
  const site = process.env.CONTEXTBIO_SITE_URL || "https://contextbio.ai";
  return `${site.replace(/\/+$/, "")}/login?next=${encodeURIComponent(returnTo)}`;
}
