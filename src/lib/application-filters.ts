import type { Prisma } from "@/generated/prisma/client";

export const KAGGLE_EMAIL_SUFFIX = "@homecredit.kaggle.import";

/** Prisma filter that excludes Kaggle import rows — dashboard shows form submissions only. */
export function formApplicationsWhere(
  extra?: Prisma.ApplicationWhereInput,
): Prisma.ApplicationWhereInput {
  return {
    NOT: {
      OR: [
        { email: { endsWith: KAGGLE_EMAIL_SUFFIX } },
        { loanPurpose: { contains: "Home Credit Kaggle" } },
      ],
    },
    ...extra,
  };
}
