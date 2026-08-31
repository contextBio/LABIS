"use client";

/**
 * contextBio 통합 계정으로 로그인하는 단추.
 *
 * 두 가지 일을 한다. 누르면 통합 로그인 화면으로 나가고, 돌아왔을 때 주소 끝에
 * 붙어 온 토큰(#token=)을 집어 서버로 넘긴다. 토큰은 **읽는 즉시 주소에서 지운다** —
 * 프래그먼트는 서버로 가지 않지만 주소창과 방문기록에는 남는다.
 */
import { useEffect, useState } from "react";

export default function ContextBioSignIn({
  loginUrl,
  next,
  postUrl,
  primary = false,
}: {
  loginUrl: string;
  next: string;
  /** 기본 경로가 운영(/labis)과 개발(/labis-dev)에서 다르므로 서버가 정해 준다. */
  postUrl: string;
  /** 통합 계정이 유일한 정규 로그인일 때 주 버튼 모양으로 그린다. */
  primary?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const m = /(?:^|[#&])token=([^&]+)/.exec(window.location.hash || "");
    if (!m) return;
    const idToken = decodeURIComponent(m[1]);
    history.replaceState(null, "", window.location.pathname + window.location.search);
    setBusy(true);
    fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, next }),
    })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (ok && d?.next) {
          window.location.replace(d.next);
          return;
        }
        setBusy(false);
        setError(
          d?.error === "not_invited"
            ? "이 계정은 아직 LABIS 에 초대되지 않았습니다. 관리자에게 초대를 요청하세요."
            : d?.error === "email_unverified"
              ? "메일 주소 확인을 마친 뒤 다시 시도하세요."
              : "통합 계정 로그인에 실패했습니다. 다시 시도하세요."
        );
      })
      .catch(() => {
        setBusy(false);
        setError("통합 계정 로그인에 실패했습니다. 다시 시도하세요.");
      });
  }, [next, postUrl]);

  return (
    <div className="mt-3">
      {error && (
        <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          window.location.href = loginUrl;
        }}
        className={primary ? "btn w-full justify-center" : "btn-ghost w-full justify-center !py-2"}
      >
        {busy ? "확인 중…" : "contextBio 계정으로 로그인"}
      </button>
    </div>
  );
}
