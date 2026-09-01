/** SPA 프론트: 대시보드 요약 — 화면 쪽 대시보드 페이지와 같은 집계를 JSON 으로. */
import { NextRequest, NextResponse } from "next/server";
import { apiUser, apiLab, withCors, corsPreflight } from "@/lib/apiGuard";
import {
  dashboardStats,
  upcomingMilestones,
  recentExperiments,
  listProjects,
} from "@/lib/queries";

export async function GET(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  const labId = apiLab(req, user);
  if (labId instanceof NextResponse) return labId;

  const [stats, milestones, experiments, allProjects] = await Promise.all([
    dashboardStats(labId),
    upcomingMilestones(labId),
    recentExperiments(labId),
    listProjects(labId),
  ]);

  return withCors(
    req,
    NextResponse.json({
      ok: true,
      stats,
      milestones: milestones.map((ms) => ({
        id: ms.id,
        dueDate: ms.dueDate,
        title: ms.title,
        status: ms.status,
        projectCode: ms.project.code,
        projectId: ms.project.id,
      })),
      experiments: experiments.map((e) => ({
        id: e.id,
        code: e.code,
        title: e.title,
        status: e.status,
        assignee: e.assignee?.name ?? null,
      })),
      projects: allProjects
        .filter((p) => p.status === "진행")
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          code: p.code,
          title: p.title,
          piName: p.piName,
          startDate: p.startDate,
          endDate: p.endDate,
          status: p.status,
        })),
    })
  );
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
