/** SPA 프론트: 과제 상세 — GET /api/v1/project?lab=N&id=X */
import { NextRequest, NextResponse } from "next/server";
import { apiUser, apiLab, withCors, corsPreflight } from "@/lib/apiGuard";
import { getProject } from "@/lib/queries";

export async function GET(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  const labId = apiLab(req, user);
  if (labId instanceof NextResponse) return labId;

  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return withCors(req, NextResponse.json({ ok: false, error: "id_required" }, { status: 400 }));
  }
  const p = await getProject(labId, id);
  if (!p) {
    return withCors(req, NextResponse.json({ ok: false, error: "not_found" }, { status: 404 }));
  }
  return withCors(
    req,
    NextResponse.json({
      ok: true,
      project: {
        id: p.id, code: p.code, title: p.title, sponsor: p.sponsor,
        program: p.program, piName: p.piName, startDate: p.startDate,
        endDate: p.endDate, totalBudget: p.totalBudget, spent: p.spent,
        status: p.status, memo: p.memo,
        budgetItems: p.budgetItems.map((b) => ({
          id: b.id, spentDate: b.spentDate, category: b.category,
          item: b.item, amount: b.amount,
        })),
        milestones: p.milestones.map((m) => ({
          id: m.id, dueDate: m.dueDate, title: m.title, status: m.status,
        })),
        members: p.members.map((m) => ({
          id: m.id, name: m.user.name, position: m.user.position,
          role: m.role, effortPct: m.effortPct,
        })),
      },
    })
  );
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
