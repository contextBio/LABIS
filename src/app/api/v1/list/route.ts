/** SPA 프론트: 모듈별 목록 — 화면 쪽 페이지들과 같은 질의(queries.ts)를 JSON 으로.
 *
 *   GET /api/v1/list?lab=N&kind=projects|members|leaves|samples|experiments|
 *                    instruments|publications|patents|techtransfers|purchases|
 *                    fundincomes|finance
 *
 * 응답은 화면 표가 쓰는 필드만 추려 내보낸다 — prisma include 원형을 그대로
 * 흘리면 스키마가 곧 API 계약이 되어 버린다.
 */
import { NextRequest, NextResponse } from "next/server";
import { apiUser, apiLab, withCors, corsPreflight } from "@/lib/apiGuard";
import {
  listLabUsers, listLeaves, listProjects, listSamples, listExperiments,
  listInstruments, listPublications, listPatents, listTechTransfers,
  listPurchases, listFundIncomes, financeSummary,
} from "@/lib/queries";

const KINDS: Record<string, (labId: number) => Promise<unknown>> = {
  members: (labId) => listLabUsers(labId),
  leaves: async (labId) =>
    (await listLeaves(labId)).map((l) => ({
      id: l.id, user: l.user.name, type: l.type, startDate: l.startDate,
      endDate: l.endDate, days: l.days, status: l.status,
    })),
  projects: async (labId) =>
    (await listProjects(labId)).map((p) => ({
      id: p.id, code: p.code, title: p.title, sponsor: p.sponsor,
      piName: p.piName, startDate: p.startDate, endDate: p.endDate,
      totalBudget: p.totalBudget, spent: p.spent, memberCount: p.memberCount,
      status: p.status,
    })),
  samples: async (labId) =>
    (await listSamples(labId)).map((s) => ({
      id: s.id, code: s.code, name: s.name, type: s.type, source: s.source,
      projectCode: s.project?.code ?? null, owner: s.owner?.name ?? null,
      storageLocation: s.storageLocation, receivedDate: s.receivedDate,
      status: s.status,
    })),
  experiments: async (labId) =>
    (await listExperiments(labId)).map((e) => ({
      id: e.id, code: e.code, title: e.title,
      projectCode: e.project?.code ?? null, sampleCode: e.sample?.code ?? null,
      assignee: e.assignee?.name ?? null, protocol: e.protocol,
      startDate: e.startDate, status: e.status, resultSummary: e.resultSummary,
    })),
  instruments: async (labId) =>
    (await listInstruments(labId)).map((i) => ({
      id: i.id, name: i.name, model: i.model, manager: i.manager?.name ?? null,
      location: i.location, lastCheckDate: i.lastCheckDate,
      nextCheckDate: i.nextCheckDate, status: i.status,
    })),
  publications: async (labId) =>
    (await listPublications(labId)).map((x) => ({
      id: x.id, year: x.year, title: x.title, journal: x.journal,
      authors: x.authors, doi: x.doi, projectCode: x.project?.code ?? null,
    })),
  patents: async (labId) =>
    (await listPatents(labId)).map((x) => ({
      id: x.id, date: x.date, title: x.title, applicationNo: x.applicationNo,
      registrationNo: x.registrationNo, inventors: x.inventors, status: x.status,
      projectCode: x.project?.code ?? null,
    })),
  techtransfers: async (labId) =>
    (await listTechTransfers(labId)).map((x) => ({
      id: x.id, contractDate: x.contractDate, title: x.title,
      licensee: x.licensee, amount: x.amount, projectCode: x.project?.code ?? null,
    })),
  purchases: async (labId) =>
    (await listPurchases(labId)).map((x) => ({
      id: x.id, orderDate: x.orderDate, item: x.item, vendor: x.vendor,
      category: x.category, amount: x.amount,
      requester: x.requester?.name ?? null,
      projectCode: x.project?.code ?? null, status: x.status,
    })),
  fundincomes: async (labId) =>
    (await listFundIncomes(labId)).map((x) => ({
      id: x.id, date: x.date, projectCode: x.project?.code ?? null,
      projectTitle: x.project?.title ?? null, note: x.note, amount: x.amount,
    })),
  finance: (labId) => financeSummary(labId),
};

export async function GET(req: NextRequest) {
  const user = await apiUser(req);
  if (user instanceof NextResponse) return user;
  const labId = apiLab(req, user);
  if (labId instanceof NextResponse) return labId;

  const kind = req.nextUrl.searchParams.get("kind") || "";
  const fn = KINDS[kind];
  if (!fn) {
    return withCors(req, NextResponse.json({ ok: false, error: "unknown_kind" }, { status: 400 }));
  }
  return withCors(req, NextResponse.json({ ok: true, kind, rows: await fn(labId) }));
}

export function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
