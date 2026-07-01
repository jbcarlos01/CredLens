import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

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
      ],
    },
  });

  if (removed.count === 0) {
    console.log("No seed data found. Dashboard uses Kaggle imports + form submissions only.");
  } else {
    console.log(`Removed ${removed.count} seed application(s).`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
