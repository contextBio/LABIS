/**
 * 연구실 개수 상한.
 *
 * 개설 경로가 셋이라(관리자 설정 · REST /api/v1/labs · 입장 화면의 셀프 개설)
 * 상한을 한 곳에 두고 셋 다 이걸 본다 — 화면에서 감추는 것과 별개로 서버에서 막는다.
 * 폐쇄된 연구실은 세지 않는다: 자리를 비우는 유일한 길이 폐쇄이기 때문이다(삭제는 없다).
 */
import { prisma } from "./prisma";

export const MAX_LABS = 5;

/** 상한에 쓰이는 개수 — 운영·휴면만 센다 */
export function activeLabCount() {
  return prisma.lab.count({ where: { status: { not: "폐쇄" } } });
}

export async function labSlots() {
  const used = await activeLabCount();
  return { used, max: MAX_LABS, full: used >= MAX_LABS };
}

export const LAB_LIMIT_MESSAGE =
  `연구실은 ${MAX_LABS}개까지만 만들 수 있습니다. 쓰지 않는 연구실을 '폐쇄'로 바꾸면 자리가 납니다.`;
