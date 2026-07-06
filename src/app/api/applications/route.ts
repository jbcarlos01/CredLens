import { NextResponse } from "next/server";
import { requireAnalyst } from "@/lib/analyst-auth";
import { buildApplicationWhere } from "@/lib/application-query";
import { prisma } from "@/lib/prisma";
import { scoreWithMlService } from "@/lib/ml-client";
import {
  finalizeApplicationScore,
  scoreApplication,
  tierToStatus,
} from "@/lib/scoring";
import { applicationSchema } from "@/lib/validations";
import type { ApplicationStatus, RiskTier } from "@/generated/prisma/client";

export async function GET(request: Request) {
  const authError = await requireAnalyst();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(searchParams.get("limit") ?? "10", 10) || 10),
  );
  const skip = (page - 1) * limit;

  const status = searchParams.get("status") as ApplicationStatus | null;
  const riskTier = searchParams.get("riskTier") as RiskTier | null;
  const search = searchParams.get("search")?.trim();

  const where = buildApplicationWhere({ status, riskTier, search });

  try {
    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: { prediction: true },
        skip,
        take: limit,
      }),
      prisma.application.count({ where }),
    ]);

    return NextResponse.json({
      applications,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Database unavailable. Check your Neon DATABASE_URL in .env and run npm run db:push.",
      },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = applicationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const rawScore =
      (await scoreWithMlService(data)) ?? scoreApplication(data);
    const scoring = finalizeApplicationScore(data, rawScore);
    const status = tierToStatus(scoring.riskTier);

    const application = await prisma.application.create({
      data: {
        ...data,
        status,
        prediction: {
          create: {
            defaultProbability: scoring.defaultProbability,
            riskTier: scoring.riskTier,
            modelVersion: scoring.modelVersion,
            factors: {
              create: scoring.factors.map((f) => ({
                feature: f.feature,
                label: f.label,
                impact: f.impact,
                direction: f.direction,
                value: f.value,
              })),
            },
          },
        },
      },
      include: { prediction: { include: { factors: true } } },
    });

    await prisma.auditLog.create({
      data: {
        action: "APPLICATION_SCORED",
        entity: "Application",
        entityId: application.id,
        details: `Tier: ${scoring.riskTier}, P(default)=${scoring.defaultProbability}`,
      },
    });

    return NextResponse.json(application, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to create application. Is the database running?" },
      { status: 500 },
    );
  }
}
