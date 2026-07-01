import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { scoreWithMlService } from "../src/lib/ml-client";
import {
  finalizeApplicationScore,
  scoreApplication,
  tierToStatus,
  type ApplicationInput,
} from "../src/lib/scoring";

const email = process.argv[2]?.toLowerCase();

if (!email) {
  console.error("Usage: npx tsx scripts/rescore-application.ts <email>");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const applications = await prisma.application.findMany({
    where: { email: { equals: email, mode: "insensitive" } },
    include: { prediction: true },
  });

  if (applications.length === 0) {
    console.log(`No applications found for ${email}`);
    return;
  }

  for (const app of applications) {
    const input: ApplicationInput = {
      applicantName: app.applicantName,
      email: app.email,
      phone: app.phone ?? undefined,
      age: app.age,
      employmentType: app.employmentType,
      employmentYears: app.employmentYears,
      annualIncome: app.annualIncome,
      loanAmount: app.loanAmount,
      loanTermMonths: app.loanTermMonths,
      existingDebt: app.existingDebt,
      creditHistoryYears: app.creditHistoryYears,
      numCreditInquiries: app.numCreditInquiries,
      hasDelinquency: app.hasDelinquency,
      homeOwnership: app.homeOwnership,
      loanPurpose: app.loanPurpose ?? undefined,
    };

    const rawScore =
      (await scoreWithMlService(input)) ?? scoreApplication(input);
    const scoring = finalizeApplicationScore(input, rawScore);
    const status = tierToStatus(scoring.riskTier);

    if (app.prediction) {
      await prisma.riskFactor.deleteMany({
        where: { predictionId: app.prediction.id },
      });
      await prisma.prediction.update({
        where: { id: app.prediction.id },
        data: {
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
      });
    } else {
      await prisma.prediction.create({
        data: {
          applicationId: app.id,
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
      });
    }

    await prisma.application.update({
      where: { id: app.id },
      data: { status },
    });

    await prisma.auditLog.create({
      data: {
        action: "APPLICATION_RESCORED",
        entity: "Application",
        entityId: app.id,
        details: `Rescored ${app.applicantName}: ${scoring.riskTier} P(default)=${scoring.defaultProbability}`,
      },
    });

    console.log(
      JSON.stringify(
        {
          id: app.id,
          applicantName: app.applicantName,
          email: app.email,
          status,
          riskTier: scoring.riskTier,
          defaultProbability: scoring.defaultProbability,
          modelVersion: scoring.modelVersion,
        },
        null,
        2,
      ),
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
