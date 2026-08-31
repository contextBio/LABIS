import { prisma } from "@/lib/prisma";
import { acceptInviteAction } from "@/lib/authActions";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const invite = await prisma.invitation.findUnique({
    where: { token },
    include: { lab: true },
  });

  const invalid = !invite || !!invite.acceptedAt || invite.expiresAt < new Date();
  const existingUser = invite
    ? await prisma.user.findUnique({ where: { email: invite.email.toLowerCase() } })
    : null;

  const ROLE_KO: Record<string, string> = {
    PI: "연구책임자",
    LAB_MANAGER: "랩매니저",
    MEMBER: "연구원",
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="card w-full max-w-sm">
        <div className="mb-4 text-center text-2xl font-black tracking-tight text-sky-700">LABIS</div>
        {invalid ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            초대 링크가 유효하지 않거나 만료되었습니다. 관리자에게 재발급을 요청하세요.
          </p>
        ) : (
          <>
            <p className="mb-5 text-center text-sm text-slate-600">
              <b>{invite.lab.name}</b> 연구실에{" "}
              <b>{ROLE_KO[invite.role] ?? invite.role}</b> 역할로 초대되었습니다.
              <br />
              <span className="text-xs text-slate-400">{invite.email}</span>
            </p>
            {sp.error === "invalid" && (
              <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
                이름을 입력하세요.
              </p>
            )}
            <form action={acceptInviteAction} className="space-y-3">
              <input type="hidden" name="token" value={token} />
              {existingUser ? (
                <p className="rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-700">
                  기존 계정({existingUser.name})에 랩 소속이 추가됩니다.
                </p>
              ) : (
                <input name="name" required placeholder="이름" className="inp" />
              )}
              <button className="btn w-full justify-center">초대 수락</button>
            </form>
            <p className="mt-4 text-center text-xs text-slate-400">
              수락 후 이 이메일의 contextBio 통합 계정으로 로그인합니다.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
