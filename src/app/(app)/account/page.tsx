import { requireUser } from "@/lib/guard";
import { PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();
  // 계정(비밀번호·프로필·보안)은 contextBio 통합 계정이 관리한다 —
  // LABIS 에는 자체 로그인이 없으므로 여기서 바꿀 비밀번호도 없다.
  const site = (process.env.CONTEXTBIO_SITE_URL || "https://contextbio.ai").replace(/\/+$/, "");

  return (
    <div className="max-w-md">
      <PageHeader title="내 계정" desc={`${user.name} · ${user.email}`} />
      <Section title="계정 관리">
        <p className="text-sm text-slate-600">
          LABIS 는 contextBio 통합 계정으로 로그인합니다. 비밀번호 변경·프로필 등
          계정 관리는 통합 계정 화면에서 합니다.
        </p>
        <a className="btn mt-3 inline-flex" href={`${site}/login`} target="_blank" rel="noreferrer">
          contextBio 계정 관리로 이동
        </a>
      </Section>
    </div>
  );
}
