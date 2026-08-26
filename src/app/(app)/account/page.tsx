import { requireUser } from "@/lib/guard";
import { changePasswordAction } from "@/lib/accountActions";
import { PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  return (
    <div className="max-w-md">
      <PageHeader title="내 계정" desc={`${user.name} · ${user.email}`} />
      <Section title="비밀번호 변경">
        {sp.error === "wrong" && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            현재 비밀번호가 올바르지 않습니다.
          </p>
        )}
        {sp.error === "invalid" && (
          <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            새 비밀번호는 8자 이상이어야 합니다.
          </p>
        )}
        {sp.ok === "1" && (
          <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            비밀번호가 변경되었습니다.
          </p>
        )}
        <form action={changePasswordAction} className="space-y-3">
          <input
            name="current"
            type="password"
            required
            placeholder="현재 비밀번호"
            className="inp"
          />
          <input
            name="next"
            type="password"
            required
            minLength={8}
            placeholder="새 비밀번호 (8자 이상)"
            className="inp"
          />
          <button className="btn justify-center">변경</button>
        </form>
      </Section>
    </div>
  );
}
