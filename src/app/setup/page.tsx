import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { setupAction } from "@/lib/authActions";

export const dynamic = "force-dynamic";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const userCount = await prisma.user.count();
  if (userCount > 0) redirect("/login");

  return (
    <div className="flex min-h-[calc(100vh-2.25rem)] items-center justify-center bg-slate-50 px-4">
      <div className="card w-full max-w-sm">
        <div className="mb-2 text-center text-2xl font-black tracking-tight text-sky-700">LABIS</div>
        <h1 className="mb-1 text-center text-sm font-semibold text-slate-700">최초 설정</h1>
        <p className="mb-5 text-center text-xs text-slate-400">
          첫 번째 계정은 <b>학과관리자</b>로 생성됩니다.
          <br />
          로그인은 같은 이메일의 <b>contextBio 통합 계정</b>으로 합니다.
        </p>
        {sp.error === "invalid" && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            입력을 확인하세요.
          </p>
        )}
        <form action={setupAction} className="space-y-3">
          <input name="name" required placeholder="이름" className="inp" />
          <input name="email" type="email" required placeholder="이메일 (contextBio 계정)" className="inp" />
          <button className="btn w-full justify-center">관리자 계정 생성</button>
        </form>
      </div>
    </div>
  );
}
