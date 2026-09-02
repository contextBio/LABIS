import { redirect } from "next/navigation";

// 팀원 관리는 관리자 설정 한 곳으로 모았다 — 예전 주소는 그리로 넘긴다.
export default function LabMembersPage() {
  redirect("/admin/settings");
}
