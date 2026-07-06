import { NextResponse } from "next/server";
import { requireAnalyst } from "@/lib/analyst-auth";
import { formApplicationsWhere } from "@/lib/application-filters";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const authError = await requireAnalyst();
  if (authError) return authError;

  const where = formApplicationsWhere();

  try {
    const [total, approved, review, declined, pending, predictions] = await Promise.all([
      prisma.application.count({ where }),
      prisma.application.count({ where: { ...where, status: "APPROVED" } }),
      prisma.application.count({ where: { ...where, status: "REVIEW" } }),
      prisma.application.count({ where: { ...where, status: "DECLINED" } }),
      prisma.application.count({
        where: { ...where, status: { in: ["PENDING", "REVIEW"] } },
      }),
      prisma.prediction.findMany({
        where: { application: where },
        select: { defaultProbability: true, riskTier: true },
      }),
    ]);

    const tierCounts = {
      LOW: predictions.filter((p) => p.riskTier === "LOW").length,
      MEDIUM: predictions.filter((p) => p.riskTier === "MEDIUM").length,
      HIGH: predictions.filter((p) => p.riskTier === "HIGH").length,
    };

    const avgRisk =
      predictions.length > 0
        ? predictions.reduce((s, p) => s + p.defaultProbability, 0) / predictions.length
        : 0;

    const statusCounts = {
      pending,
      approved,
      declined,
    };

    return NextResponse.json({
      total,
      approved,
      review,
      declined,
      statusCounts,
      tierCounts,
      avgRisk,
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
