import { formApplicationsWhere } from "@/lib/application-filters";
import type { ApplicationStatus, RiskTier } from "@/generated/prisma/client";

export type ApplicationListFilters = {
  status?: ApplicationStatus | null;
  riskTier?: RiskTier | null;
  search?: string;
};

export function buildApplicationWhere(filters: ApplicationListFilters = {}) {
  const prismaFilters: Parameters<typeof formApplicationsWhere>[0] = {};

  if (filters.status) prismaFilters.status = filters.status;
  if (filters.riskTier) prismaFilters.prediction = { is: { riskTier: filters.riskTier } };

  const search = filters.search?.trim();
  if (search) {
    prismaFilters.OR = [
      { applicantName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  return formApplicationsWhere(prismaFilters);
}

export function needsVerification(app: {
  status: string;
  prediction?: { riskTier: string } | null;
}) {
  return app.status === "APPROVED" && app.prediction?.riskTier === "LOW";
}
