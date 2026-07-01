"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { LogOut } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import { isKaggleRecord } from "@/lib/model-info";
import { statusLabel, tierLabel } from "@/lib/scoring";

type Application = {
  id: string;
  applicantName: string;
  email: string;
  loanAmount: number;
  annualIncome: number;
  status: string;
  createdAt: string;
  prediction: {
    defaultProbability: number;
    riskTier: "LOW" | "MEDIUM" | "HIGH";
  } | null;
};

type Stats = {
  total: number;
  approved: number;
  review: number;
  declined: number;
  tierCounts: { LOW: number; MEDIUM: number; HIGH: number };
  avgRisk: number;
};

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

export function DashboardContent() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mlStatus, setMlStatus] = useState<{
    online: boolean;
    modelLoaded: boolean;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [appsRes, statsRes] = await Promise.all([
        fetch("/api/applications"),
        fetch("/api/stats"),
      ]);
      if (appsRes.status === 401 || statsRes.status === 401) {
        router.refresh();
        return;
      }
      if (!appsRes.ok || !statsRes.ok) {
        throw new Error("Database not connected. See README for setup.");
      }
      setApplications(await appsRes.json());
      setStats(await statsRes.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const initialize = async () => {
      await load();
      try {
        const response = await fetch("/api/ml/status");
        const status = await response.json();
        setMlStatus(status);
      } catch {
        setMlStatus({ online: false, modelLoaded: false });
      }
    };
    void initialize();
  }, [load]);

  async function updateStatus(id: string, status: "APPROVED" | "DECLINED") {
    const response = await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (response.status === 401) {
      router.refresh();
      return;
    }
    load();
  }

  async function logout() {
    await fetch("/api/analyst/logout", { method: "POST" });
    router.refresh();
  }

  const chartData = stats
    ? [
        { name: "Low", count: stats.tierCounts.LOW },
        { name: "Medium", count: stats.tierCounts.MEDIUM },
        { name: "High", count: stats.tierCounts.HIGH },
      ]
    : [];

  const reviewQueue = applications.filter((a) => a.status === "REVIEW");
  const kaggleCount = applications.filter((a) => isKaggleRecord(a.email)).length;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Analyst dashboard</h1>
            <p className="mt-1 text-slate-600">Portfolio overview and manual review queue.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load} disabled={loading}>
              Refresh
            </Button>
            <Button variant="outline" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {error}
          </div>
        )}

        {mlStatus && (
          <div
            className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
              mlStatus.online && mlStatus.modelLoaded
                ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {mlStatus.online && mlStatus.modelLoaded ? (
              <>
                <strong>ML service online.</strong> New applications are scored with the
                Kaggle-trained XGBoost model (AUC 0.73).
              </>
            ) : (
              <>
                <strong>ML service offline.</strong> Run{" "}
                <code className="rounded bg-slate-100 px-1">npm run ml:serve</code> in a second
                terminal to score new applications with the trained model.
              </>
            )}
            {kaggleCount > 0 && (
              <span className="mt-1 block">
                {kaggleCount} records imported from Kaggle Home Credit dataset.
              </span>
            )}
          </div>
        )}

        {stats && (
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Total applications", value: stats.total },
              { label: "Approved", value: stats.approved },
              { label: "In review", value: stats.review },
              { label: "Avg default risk", value: formatPercent(stats.avgRisk) },
            ].map((item) => (
              <Card key={item.label} className="border-slate-200/80 bg-white/95 shadow-sm">
                <CardHeader className="pb-2">
                  <CardDescription>{item.label}</CardDescription>
                  <CardTitle className="text-2xl">{item.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-200/80 bg-white/95 shadow-sm">
            <CardHeader>
              <CardTitle>Risk tier distribution</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-white/95 shadow-sm">
            <CardHeader>
              <CardTitle>Review queue</CardTitle>
              <CardDescription>Medium-risk applications needing manual decision</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {reviewQueue.length === 0 ? (
                <p className="text-sm text-slate-500">No applications pending review.</p>
              ) : (
                reviewQueue.map((app) => (
                  <div
                    key={app.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3"
                  >
                    <div>
                      <p className="font-medium">{app.applicantName}</p>
                      <p className="text-sm text-slate-500">
                        {formatCurrency(app.loanAmount)} ·{" "}
                        {app.prediction
                          ? formatPercent(app.prediction.defaultProbability)
                          : "—"}{" "}
                        risk
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => updateStatus(app.id, "APPROVED")}>
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => updateStatus(app.id, "DECLINED")}
                      >
                        Decline
                      </Button>
                      <Link
                        href={`/applications/${app.id}`}
                        className={cn(buttonVariants({ size: "sm", variant: "outline" }))}
                      >
                        View
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6 border-slate-200/80 bg-white/95 shadow-sm">
          <CardHeader>
            <CardTitle>All applications</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="pb-2 pr-4 font-medium">Applicant</th>
                  <th className="pb-2 pr-4 font-medium">Loan</th>
                  <th className="pb-2 pr-4 font-medium">Risk</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4">
                      <p className="font-medium">{app.applicantName}</p>
                      <p className="text-xs text-slate-500">{app.email}</p>
                      {isKaggleRecord(app.email) && (
                        <Badge className="mt-1" variant="default">
                          Kaggle
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 pr-4">{formatCurrency(app.loanAmount)}</td>
                    <td className="py-3 pr-4">
                      {app.prediction ? (
                        <Badge variant={tierBadgeVariant(app.prediction.riskTier)}>
                          {tierLabel(app.prediction.riskTier)}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={statusBadgeVariant(app.status)}>
                        {statusLabel(app.status)}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <Link
                        href={`/applications/${app.id}`}
                        className="text-emerald-700 hover:underline"
                      >
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
