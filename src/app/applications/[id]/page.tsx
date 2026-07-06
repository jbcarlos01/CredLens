import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { AlertTriangle, CalendarDays } from "lucide-react";
import { AdvisorChat } from "@/components/advisor-chat";
import { Navbar } from "@/components/navbar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAnalystAuthenticated } from "@/lib/analyst-auth";
import { prisma } from "@/lib/prisma";
import { modelVersionLabel } from "@/lib/model-info";
import { statusLabel, tierLabel } from "@/lib/scoring";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";

type Params = { params: Promise<{ id: string }> };

function tierBadgeVariant(tier: string) {
  if (tier === "LOW") return "success" as const;
  if (tier === "MEDIUM") return "warning" as const;
  return "danger" as const;
}

function statusBadgeVariant(status: string) {
  if (status === "APPROVED") return "success" as const;
  if (status === "REVIEW") return "warning" as const;
  if (status === "DECLINED") return "danger" as const;
  return "default" as const;
}

export default async function ApplicationDetailPage({ params }: Params) {
  const { id } = await params;
  const analystViewer = await isAnalystAuthenticated();

  let application;
  try {
    application = await prisma.application.findUnique({
      where: { id },
      include: {
        prediction: { include: { factors: { orderBy: { impact: "desc" } } } },
      },
    });
  } catch {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-xl font-semibold">Database not connected</h1>
          <p className="mt-2 text-slate-600">
            Check your Neon <code className="rounded bg-slate-200 px-1">DATABASE_URL</code> in{" "}
            <code className="rounded bg-slate-200 px-1">.env</code> and run{" "}
            <code className="rounded bg-slate-200 px-1">npm run db:push</code>
          </p>
        </main>
      </div>
    );
  }

  if (!application || !application.prediction) notFound();

  const { prediction } = application;
  const appliedAt = format(new Date(application.createdAt), "MMMM d, yyyy 'at' h:mm a");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/20 to-slate-100">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{application.applicantName}</h1>
            <p className="text-slate-600">{application.email}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-500">
              <CalendarDays className="h-4 w-4 text-emerald-600" />
              Applied {appliedAt}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={tierBadgeVariant(prediction.riskTier)}>
              {tierLabel(prediction.riskTier)}
            </Badge>
            <Badge variant={statusBadgeVariant(application.status)}>
              {statusLabel(application.status)}
            </Badge>
          </div>
        </div>

        {application.status === "APPROVED" && (
          <div className="mb-6 flex gap-3 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/80 px-4 py-3 text-sm text-amber-950 shadow-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">Verification required</p>
              <p className="mt-1 text-amber-900/90">
                This application was automatically approved based on its risk score. An analyst
                must verify that all submitted information is accurate and supported by documents.
                Incorrect or falsified data may result in rejection or cancellation of the loan.
              </p>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <Card className="border-slate-200/80 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle>Risk assessment</CardTitle>
                <CardDescription>
                  {modelVersionLabel(prediction.modelVersion)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-slate-500">Default probability</p>
                  <p className="text-4xl font-bold text-slate-900">
                    {formatPercent(prediction.defaultProbability)}
                  </p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all"
                    style={{ width: `${prediction.defaultProbability * 100}%` }}
                  />
                </div>
                <p className="text-sm text-slate-600">
                  {prediction.riskTier === "LOW" &&
                    "Eligible for automatic approval based on risk profile — subject to information verification."}
                  {prediction.riskTier === "MEDIUM" &&
                    "Flagged for manual review by a loan officer."}
                  {prediction.riskTier === "HIGH" &&
                    "High default risk — typically declined or requires additional collateral."}
                </p>
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle>Top risk factors</CardTitle>
                <CardDescription>Explainable factors driving this score</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {prediction.factors.map((factor) => (
                  <div
                    key={factor.id}
                    className="flex items-start justify-between gap-4 rounded-lg border border-slate-100 p-3"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{factor.label}</p>
                      <p className="text-sm text-slate-500">
                        {factor.value} · {factor.direction} risk
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-700">
                      {(factor.impact * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-slate-200/80 bg-white/95 shadow-sm">
              <CardHeader>
                <CardTitle>Application summary</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-slate-500">Date applied:</span>{" "}
                  {format(new Date(application.createdAt), "MMM d, yyyy")}
                </p>
                <p>
                  <span className="text-slate-500">Loan amount:</span>{" "}
                  {formatCurrency(application.loanAmount)}
                </p>
                <p>
                  <span className="text-slate-500">Annual income:</span>{" "}
                  {formatCurrency(application.annualIncome)}
                </p>
                <p>
                  <span className="text-slate-500">Term:</span> {application.loanTermMonths} months
                </p>
                <p>
                  <span className="text-slate-500">Employment:</span>{" "}
                  {application.employmentType.replace("_", " ")}
                </p>
                <p>
                  <span className="text-slate-500">Credit history:</span>{" "}
                  {application.creditHistoryYears} years
                </p>
                <p>
                  <span className="text-slate-500">Credit inquiries (12 mo):</span>{" "}
                  {application.numCreditInquiries}
                </p>
                <p>
                  <span className="text-slate-500">Delinquency:</span>{" "}
                  {application.hasDelinquency ? "Yes" : "No"}
                </p>
                {application.loanPurpose && (
                  <p className="sm:col-span-2">
                    <span className="text-slate-500">Loan purpose:</span>{" "}
                    {application.loanPurpose}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <AdvisorChat
            applicationId={application.id}
            applicantName={application.applicantName}
            riskTier={prediction.riskTier}
            viewerRole={analystViewer ? "ANALYST" : "APPLICANT"}
          />
        </div>

        <div className="mt-8">
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Back to dashboard
          </Link>
        </div>
      </main>
    </div>
  );
}
