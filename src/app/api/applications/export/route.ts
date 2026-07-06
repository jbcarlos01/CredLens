import { NextResponse } from "next/server";
import { format } from "date-fns";
import { requireAnalyst } from "@/lib/analyst-auth";
import { buildApplicationWhere } from "@/lib/application-query";
import { prisma } from "@/lib/prisma";
import { statusLabel, tierLabel } from "@/lib/scoring";
import type { ApplicationStatus, RiskTier } from "@/generated/prisma/client";

function escapeCsv(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET(request: Request) {
  const authError = await requireAnalyst();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as ApplicationStatus | null;
  const riskTier = searchParams.get("riskTier") as RiskTier | null;
  const search = searchParams.get("search")?.trim();

  const where = buildApplicationWhere({ status, riskTier, search });

  try {
    const applications = await prisma.application.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { prediction: true },
      take: 10_000,
    });

    const headers = [
      "Applicant Name",
      "Email",
      "Date Applied",
      "Loan Amount",
      "Annual Income",
      "Risk Tier",
      "Default Probability",
      "Status",
      "Needs Verification",
    ];

    const rows = applications.map((app) => [
      escapeCsv(app.applicantName),
      escapeCsv(app.email),
      escapeCsv(format(app.createdAt, "yyyy-MM-dd HH:mm")),
      escapeCsv(app.loanAmount),
      escapeCsv(app.annualIncome),
      escapeCsv(app.prediction ? tierLabel(app.prediction.riskTier) : ""),
      escapeCsv(
        app.prediction ? `${(app.prediction.defaultProbability * 100).toFixed(1)}%` : "",
      ),
      escapeCsv(statusLabel(app.status)),
      escapeCsv(
        app.status === "APPROVED" && app.prediction?.riskTier === "LOW" ? "Yes" : "No",
      ),
    ]);

    const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const filename = `credlens-applications-${format(new Date(), "yyyy-MM-dd")}.csv`;

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
