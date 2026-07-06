import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { KAGGLE_EMAIL_SUFFIX } from "../src/lib/application-filters";

const connectionString =
  process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const SEED_EMAILS = [
  "maria.santos@email.com",
  "jose.reyes@email.com",
  "ana.delacruz@email.com",
];

async function main() {
  const removed = await prisma.application.deleteMany({
    where: {
      OR: [
        { email: { in: SEED_EMAILS } },
        { prediction: { is: { modelVersion: "risklens-seed-v1" } } },
        { email: { endsWith: KAGGLE_EMAIL_SUFFIX } },
        { loanPurpose: { contains: "Home Credit Kaggle" } },
      ],
    },
  });

  if (removed.count === 0) {
    console.log("No legacy or Kaggle import data found. Dashboard shows form submissions only.");
  } else {
    console.log(`Removed ${removed.count} legacy/Kaggle application(s).`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
