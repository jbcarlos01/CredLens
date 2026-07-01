import "dotenv/config";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type EmploymentType } from "../src/generated/prisma/client";
import { scoreHomeCreditRow } from "../src/lib/ml-client";
import { scoreApplication, tierToStatus, type ApplicationInput } from "../src/lib/scoring";

const SAMPLE_PATH = path.join(process.cwd(), "ml/data/import_sample.csv");
const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";

const FILIPINO_NAMES = [
  "Maria Santos",
  "Jose Reyes",
  "Ana dela Cruz",
  "Carlo Mendoza",
  "Liza Villanueva",
  "Mark Bautista",
  "Grace Fernandez",
  "Paolo Ramos",
  "Jenny Tolentino",
  "Rico Aquino",
  "Ella Castillo",
  "Nico Herrera",
  "Pamela Cruz",
  "Dennis Garcia",
  "Hannah Lim",
];

type CsvRow = Record<string, string>;

function mapEmploymentType(incomeType: string, daysEmployed: number): EmploymentType {
  if (daysEmployed === 365243 || daysEmployed >= 0) {
    if (incomeType === "Pensioner") return "RETIRED";
    return "UNEMPLOYED";
  }
  if (incomeType === "Businessman") return "SELF_EMPLOYED";
  if (incomeType === "Student" || incomeType === "Maternity leave") return "PART_TIME";
  return "FULL_TIME";
}

function mapHousing(housing: string) {
  if (housing === "House / apartment" || housing === "With parents") return "MORTGAGE" as const;
  if (housing === "Rented apartment") return "RENT" as const;
  return "OTHER" as const;
}

function buildApplication(row: CsvRow, index: number): {
  application: ApplicationInput;
  target: number;
} {
  const skId = row.SK_ID_CURR;
  const daysBirth = Number(row.DAYS_BIRTH);
  const daysEmployed = Number(row.DAYS_EMPLOYED);
  const income = Number(row.AMT_INCOME_TOTAL);
  const credit = Number(row.AMT_CREDIT);
  // Home Credit: AMT_ANNUITY is the monthly payment on this loan (not annual)
  const monthlyAnnuity = Number(row.AMT_ANNUITY) || credit / 36;
  const target = Number(row.TARGET);
  const ext2 = row.EXT_SOURCE_2 ? Number(row.EXT_SOURCE_2) : NaN;
  const ext3 = row.EXT_SOURCE_3 ? Number(row.EXT_SOURCE_3) : NaN;

  const age = Math.min(100, Math.max(18, Math.floor(Math.abs(daysBirth) / 365.25)));
  const employmentYears =
    daysEmployed >= 0 || daysEmployed === 365243
      ? 0
      : Math.min(40, Math.abs(daysEmployed) / 365.25);

  const creditHistoryYears = Math.min(
    25,
    Math.max(1, Math.round((!Number.isNaN(ext2) ? ext2 : 0.5) * 15)),
  );
  const numCreditInquiries = Math.min(
    15,
    Math.round(
      (Number(row.AMT_REQ_CREDIT_BUREAU_MON) || 0) +
        (Number(row.AMT_REQ_CREDIT_BUREAU_WEEK) || 0),
    ),
  );

  const name = FILIPINO_NAMES[index % FILIPINO_NAMES.length];

  const application: ApplicationInput = {
    applicantName: `${name} (HC-${skId})`,
    email: `hc-${skId}@homecredit.kaggle.import`,
    phone: `+63 9${String(skId).slice(-9).padStart(9, "0").slice(0, 9)}`,
    age,
    employmentType: mapEmploymentType(row.NAME_INCOME_TYPE ?? "Working", daysEmployed),
    employmentYears: Math.round(employmentYears * 10) / 10,
    annualIncome: Math.round(income),
    loanAmount: Math.round(credit),
    loanTermMonths: Math.min(360, Math.max(6, Math.round(credit / monthlyAnnuity))),
    existingDebt: 0,
    creditHistoryYears,
    numCreditInquiries,
    // TARGET is the future outcome — not known at application time; never use it here
    hasDelinquency: !Number.isNaN(ext3) && ext3 < 0.15,
    homeOwnership: mapHousing(row.NAME_HOUSING_TYPE ?? "Rented apartment"),
    loanPurpose: `Home Credit Kaggle #${skId} · ${target === 1 ? "historical default" : "historical repaid"}`,
  };

  return { application, target };
}

async function main() {
  if (!fs.existsSync(SAMPLE_PATH)) {
    console.error(`Missing ${SAMPLE_PATH}. Run: npm run ml:sample`);
    process.exit(1);
  }

  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL not set in .env");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const csv = fs.readFileSync(SAMPLE_PATH, "utf-8");
  const rows = parse(csv, { columns: true, skip_empty_lines: true }) as CsvRow[];

  console.log(`Importing ${rows.length} Home Credit records into Neon...`);

  let mlOnline = false;
  try {
    const health = await fetch(`${ML_SERVICE_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (health.ok) {
      const data = await health.json();
      mlOnline = Boolean(data.model_loaded);
    }
  } catch {
    mlOnline = false;
  }
  console.log(
    mlOnline
      ? "Scoring with Kaggle-trained XGBoost on raw Home Credit fields."
      : "ML service offline — using improved heuristic (run: npm run ml:serve)",
  );

  const removed = await prisma.application.deleteMany({
    where: { email: { endsWith: "@homecredit.kaggle.import" } },
  });
  if (removed.count > 0) {
    console.log(`Removed ${removed.count} previous Kaggle import rows.`);
  }

  const tierCounts = { LOW: 0, MEDIUM: 0, HIGH: 0 };

  for (let i = 0; i < rows.length; i++) {
    const { application, target } = buildApplication(rows[i], i);
    const scoring =
      (mlOnline ? await scoreHomeCreditRow(rows[i]) : null) ??
      scoreApplication(application);
    const status = tierToStatus(scoring.riskTier);
    tierCounts[scoring.riskTier]++;

    await prisma.application.create({
      data: {
        ...application,
        employmentType: application.employmentType as EmploymentType,
        status,
        prediction: {
          create: {
            defaultProbability: scoring.defaultProbability,
            riskTier: scoring.riskTier,
            modelVersion: scoring.modelVersion,
            factors: {
              create: [
                ...scoring.factors.map((f) => ({
                  feature: f.feature,
                  label: f.label,
                  impact: f.impact,
                  direction: f.direction,
                  value: f.value,
                })),
                {
                  feature: "kaggle_target",
                  label: "Kaggle historical outcome",
                  impact: target === 1 ? 0.25 : 0.05,
                  direction: target === 1 ? "increases" : "decreases",
                  value: target === 1 ? "Defaulted" : "Repaid",
                },
              ],
            },
          },
        },
      },
    });

    if ((i + 1) % 10 === 0 || i === rows.length - 1) {
      console.log(`  ${i + 1}/${rows.length}...`);
    }
  }

  await prisma.auditLog.create({
    data: {
      action: "KAGGLE_IMPORT",
      entity: "Application",
      details: `Imported ${rows.length} Home Credit records. Tiers: LOW=${tierCounts.LOW}, MEDIUM=${tierCounts.MEDIUM}, HIGH=${tierCounts.HIGH}`,
    },
  });

  console.log(`Done. Risk tiers — Low: ${tierCounts.LOW}, Medium: ${tierCounts.MEDIUM}, High: ${tierCounts.HIGH}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
