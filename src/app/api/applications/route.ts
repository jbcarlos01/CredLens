import { NextResponse } from "next/server";
import { requireAnalyst } from "@/lib/analyst-auth";
import { prisma } from "@/lib/prisma";
import { scoreWithMlService } from "@/lib/ml-client";
import {
  finalizeApplicationScore,
  scoreApplication,
  tierToStatus,
} from "@/lib/scoring";
import { applicationSchema } from "@/lib/validations";

export async function GET() {
  const authError = await requireAnalyst();
  if (authError) return authError;

  try {
    const applications = await prisma.application.findMany({
      orderBy: { createdAt: "desc" },
      include: { prediction: true },
      take: 100,
    });
    return NextResponse.json(applications);
  } catch {
    return NextResponse.json(
      { error: "Database unavailable. Check your Neon DATABASE_URL in .env and run npm run db:push." },
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
