/**
 * 메뉴 목록의 단일 원본.
 *
 * 사이드바(기존 화면·새 화면), 메뉴별 권한 조정 화면, 서버 가드가 모두 이 표를 본다.
 * fixed 메뉴는 권한 조정 대상이 아니다 — 대시보드는 누구에게나 열려 있고,
 * 구성원·권한 관리는 팀관리자(연구책임자) 전용이라 따로 잠글 것이 없다.
 */
export type MenuKey =
  | "dashboard" | "hr" | "projects" | "research" | "finance" | "outcomes"
  | "purchases" | "instruments" | "samples" | "experiments" | "sheets";

export type MenuDef = {
  key: MenuKey;
  label: string;
  /** 기존 화면(SSR) 경로 */
  href: string;
  /** 새 화면(SPA) 해시 */
  hash: string;
  icon: string;
  /** 권한 조정 대상에서 제외 */
  fixed?: boolean;
};

export const MENUS: MenuDef[] = [
  { key: "dashboard",   label: "대시보드",      href: "/",                 hash: "#/",                 icon: "◧", fixed: true },
  { key: "hr",          label: "인사",          href: "/hr",               hash: "#/hr",               icon: "◉" },
  { key: "projects",    label: "과제",          href: "/projects",         hash: "#/projects",         icon: "▤" },
  { key: "research",    label: "프로젝트",      href: "/research",         hash: "#/research",         icon: "◇" },
  { key: "finance",     label: "연구비",        href: "/finance",          hash: "#/finance",          icon: "₩" },
  { key: "outcomes",    label: "성과",          href: "/outcomes",         hash: "#/outcomes",         icon: "◆" },
  { key: "purchases",   label: "구매",          href: "/purchases",        hash: "#/purchases",        icon: "▦" },
  { key: "instruments", label: "장비",          href: "/lims/instruments", hash: "#/lims/instruments", icon: "⚙" },
  { key: "samples",     label: "시료 (LIMS)",   href: "/lims/samples",     hash: "#/lims/samples",     icon: "⬡" },
  { key: "experiments", label: "실험 (LIMS)",   href: "/lims/experiments", hash: "#/lims/experiments", icon: "⚗" },
  { key: "sheets",      label: "구글시트 연동", href: "/sync",             hash: "#/sheets",           icon: "⇄" },
];

/** 팀관리자가 조정할 수 있는 메뉴 */
export const ADJUSTABLE_MENUS: MenuDef[] = MENUS.filter((m) => !m.fixed);

const KEYS = new Set<string>(MENUS.map((m) => m.key));

export function isMenuKey(v: string): v is MenuKey {
  return KEYS.has(v);
}

export function isFixedMenu(key: MenuKey): boolean {
  return MENUS.some((m) => m.key === key && m.fixed);
}
