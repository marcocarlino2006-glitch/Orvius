import { prisma } from "@/lib/prisma";

/**
 * A review is one finished visit, told by the customer who had it.
 * Every rating from 1 to 5 is kept. There is no path that hides a low one.
 */

export const REVIEW_BODY_MAX = 400;

export type ReviewScore = { count: number; average: number };

export function reviewScore(ratings: number[]): ReviewScore | null {
  if (!ratings.length) return null;
  const sum = ratings.reduce((n, rating) => n + rating, 0);
  return { count: ratings.length, average: Math.round((sum / ratings.length) * 10) / 10 };
}

export function reviewLine(score: ReviewScore | null): string | null {
  if (!score) return null;
  const visits = score.count === 1 ? "1 finished visit" : `${score.count} finished visits`;
  return `${score.average} from ${visits}`;
}

export async function reviewScores(businessIds: string[]): Promise<Map<string, ReviewScore>> {
  const out = new Map<string, ReviewScore>();
  if (!businessIds.length) return out;
  const rows = await prisma.visitReview.groupBy({
    by: ["businessId"],
    where: { businessId: { in: businessIds } },
    _count: { _all: true },
    _avg: { rating: true },
  });
  for (const row of rows) {
    if (!row._count._all || row._avg.rating == null) continue;
    out.set(row.businessId, {
      count: row._count._all,
      average: Math.round(row._avg.rating * 10) / 10,
    });
  }
  return out;
}

export type VisitReviewView =
  | { ok: true; businessName: string; title: string; already: boolean }
  | { ok: false; error: string; status: number };

export async function visitReviewView(token: string): Promise<VisitReviewView> {
  const job = await prisma.job.findUnique({
    where: { customerConfirmToken: token },
    select: {
      id: true,
      title: true,
      status: true,
      business: { select: { name: true } },
      visitReview: { select: { id: true } },
    },
  });
  if (!job) return { ok: false, error: "This link isn't valid.", status: 404 };
  if (job.status !== "completed") return { ok: false, error: "This visit isn't finished yet.", status: 409 };
  return { ok: true, businessName: job.business.name, title: job.title, already: Boolean(job.visitReview) };
}

export async function leaveVisitReview(params: {
  token: string;
  rating: number;
  body?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const rating = params.rating;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { ok: false, error: "Choose a rating from 1 to 5.", status: 400 };
  }
  const body = params.body?.trim().slice(0, REVIEW_BODY_MAX) || null;
  const job = await prisma.job.findUnique({
    where: { customerConfirmToken: params.token },
    select: { id: true, businessId: true, status: true, visitReview: { select: { id: true } } },
  });
  if (!job) return { ok: false, error: "This link isn't valid.", status: 404 };
  if (job.status !== "completed") return { ok: false, error: "This visit isn't finished yet.", status: 409 };
  if (job.visitReview) return { ok: false, error: "You already told the next customer how it went.", status: 409 };
  try {
    await prisma.visitReview.create({ data: { businessId: job.businessId, jobId: job.id, rating, body } });
  } catch {
    const again = await prisma.visitReview.findUnique({ where: { jobId: job.id }, select: { id: true } });
    if (again) return { ok: false, error: "You already told the next customer how it went.", status: 409 };
    throw new Error("The review didn't save.");
  }
  return { ok: true };
}
