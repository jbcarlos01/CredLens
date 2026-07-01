import { NextResponse } from "next/server";
import { requireAnalyst } from "@/lib/analyst-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const authError = await requireAnalyst();
  if (authError) return authError;

  try {
    const [total, approved, review, declined, predictions] = await Promise.all([
      prisma.application.count(),
      prisma.application.count({ where: { status: "APPROVED" } }),
      prisma.application.count({ where: { status: "REVIEW" } }),
      prisma.application.count({ where: { status: "DECLINED" } }),
      prisma.prediction.findMany({
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

    return NextResponse.json({
      total,
      approved,
      review,
      declined,
      tierCounts,
      avgRisk,
    });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}
