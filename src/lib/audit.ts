/**
 * 감사 로그 한 줄 남기기.
 *
 * guard.ts 에서 떼어낸 이유: guard 는 `server-only`(쿠키·리다이렉트를 쓰므로 당연하다)인데,
 * 감사 로그는 Next 런타임 밖에서도 필요하다 — scripts/ 의 수집 에이전트가 그렇다.
 * guard.ts 는 이 함수를 그대로 재export 하므로 기존 `from "./guard"` 는 계속 통한다.
 */
import { prisma } from "./prisma";

/** userId 가 null 이면 사람이 아닌 주체(에이전트·배치)가 한 일이다. */
export async function audit(
  userId: string | null,
  labId: number | null,
  action: string,
  entity: string,
  entityId: string | number = "",
  detail?: unknown
) {
  await prisma.auditLog.create({
    data: {
      userId,
      labId,
      action,
      entity,
      entityId: String(entityId),
      detail: detail === undefined ? undefined : JSON.parse(JSON.stringify(detail)),
    },
  });
}
