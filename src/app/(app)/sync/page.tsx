import { redirect } from "next/navigation";

// 구글시트 연동은 관리자 설정 안의 한 구획으로 옮겼다 — 예전 주소는 그리로 넘긴다.
export default function SyncPage() {
  redirect("/admin/settings");
}
