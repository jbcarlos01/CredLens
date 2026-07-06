"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ChevronLeft, ChevronRight, Loader2, LogOut, RotateCcw } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
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

type ApplicationsResponse = {
  applications: Application[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type Stats = {
  total: number;
  approved: number;
  review: number;
  declined: number;
  tierCounts: { LOW: number; MEDIUM: number; HIGH: number };
  avgRisk: number;
};

type ChartSlice = {
  name: string;
  count: number;
  percent: number;
  fill: string;
};

const TIER_STYLES = {
  Low: { fill: "#10b981", gradient: "from-emerald-400 to-emerald-600" },
  Medium: { fill: "#f59e0b", gradient: "from-amber-400 to-amber-600" },
  High: { fill: "#ef4444", gradient: "from-red-400 to-red-600" },
} as const;

const REVIEW_PAGE_SIZE = 3;
const APPS_PAGE_SIZE = 10;
const APPS_TABLE_HEIGHT = 480;
const REVIEW_QUEUE_HEIGHT = 380;

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

function PaginationBar({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;

  return (
    <div className="flex shrink-0 items-center justify-between border-t border-slate-100/80 pt-3">
      <p className="text-xs text-slate-500">
        Page {page} of {totalPages} · {total} total
      </p>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="border-slate-200 bg-white/80"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="border-slate-200 bg-white/80"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function LoadingOverlay({ label }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/70 backdrop-blur-[2px]">
      <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
      {label && <p className="text-xs font-medium text-slate-500">{label}</p>}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: ChartSlice }[];
}) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm">
      <p className="font-semibold text-slate-900">{slice.name} risk</p>
      <p className="mt-1 text-sm text-slate-600">
        {slice.count} application{slice.count !== 1 ? "s" : ""}
      </p>
      <p className="text-sm font-medium text-emerald-700">{slice.percent.toFixed(1)}% of portfolio</p>
    </div>
  );
}

function renderPieLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
  name?: string;
}) {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0, name = "" } =
    props;
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      className="pointer-events-none text-[11px] font-semibold drop-shadow-sm"
    >
      {`${name} ${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export function DashboardContent() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [reviewData, setReviewData] = useState<ApplicationsResponse | null>(null);
  const [appsData, setAppsData] = useState<ApplicationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [appsLoading, setAppsLoading] = useState(false);
  const [mlStatus, setMlStatus] = useState<{
    online: boolean;
    modelLoaded: boolean;
  } | null>(null);

  const [reviewPage, setReviewPage] = useState(1);
  const [appsPage, setAppsPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tierFilter, setTierFilter] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadReview = useCallback(async (page: number) => {
    const params = new URLSearchParams({
      status: "REVIEW",
      page: String(page),
      limit: String(REVIEW_PAGE_SIZE),
    });
    const res = await fetch(`/api/applications?${params}`);
    if (res.status === 401) {
      router.refresh();
      return null;
    }
    if (!res.ok) throw new Error("Failed to load review queue");
    return (await res.json()) as ApplicationsResponse;
  }, [router]);

  const loadApps = useCallback(
    async (page: number, filters: { search: string; status: string; tier: string }) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(APPS_PAGE_SIZE),
      });
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (filters.tier) params.set("riskTier", filters.tier);

      const res = await fetch(`/api/applications?${params}`);
      if (res.status === 401) {
        router.refresh();
        return null;
      }
      if (!res.ok) throw new Error("Failed to load applications");
      return (await res.json()) as ApplicationsResponse;
    },
    [router],
  );

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const [statsRes, review] = await Promise.all([
        fetch("/api/stats"),
        loadReview(reviewPage),
      ]);
      if (statsRes.status === 401) {
        router.refresh();
        return;
      }
      if (!statsRes.ok) {
        throw new Error("Database not connected. See README for setup.");
      }
      setStats(await statsRes.json());
      if (review) setReviewData(review);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setDashboardLoading(false);
    }
  }, [router, reviewPage, loadReview]);

  const loadAppsSection = useCallback(async () => {
    setAppsLoading(true);
    try {
      const apps = await loadApps(appsPage, {
        search: debouncedSearch,
        status: statusFilter,
        tier: tierFilter,
      });
      if (apps) {
        setAppsData(apps);
        setError(null);
      }
    } catch {
      setError("Failed to load applications");
    } finally {
      setAppsLoading(false);
    }
  }, [appsPage, debouncedSearch, statusFilter, tierFilter, loadApps]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadAppsSection();
  }, [loadAppsSection]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/ml/status");
        setMlStatus(await response.json());
      } catch {
        setMlStatus({ online: false, modelLoaded: false });
      }
    })();
  }, []);

  async function refreshAll() {
    await Promise.all([loadDashboard(), loadAppsSection()]);
  }

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
    setReviewPage(1);
    setAppsPage(1);
    await refreshAll();
  }

  async function logout() {
    await fetch("/api/analyst/logout", { method: "POST" });
    router.refresh();
  }

  function resetFilters() {
    setSearchInput("");
    setDebouncedSearch("");
    setStatusFilter("");
    setTierFilter("");
    setAppsPage(1);
  }

  const hasActiveFilters = Boolean(searchInput || statusFilter || tierFilter);

  const chartData = useMemo((): ChartSlice[] => {
    if (!stats) return [];
    const raw = [
      { name: "Low", count: stats.tierCounts.LOW },
      { name: "Medium", count: stats.tierCounts.MEDIUM },
      { name: "High", count: stats.tierCounts.HIGH },
    ].filter((d) => d.count > 0);
    const total = raw.reduce((sum, d) => sum + d.count, 0);
    return raw.map((d) => ({
      ...d,
      percent: total > 0 ? (d.count / total) * 100 : 0,
      fill: TIER_STYLES[d.name as keyof typeof TIER_STYLES].fill,
    }));
  }, [stats]);

  const chartTotal = chartData.reduce((sum, d) => sum + d.count, 0);
  const reviewQueue = reviewData?.applications ?? [];

  const statCards = stats
    ? [
        {
          label: "Total applications",
          value: stats.total,
          gradient: "from-slate-50 to-white",
          accent: "text-slate-900",
        },
        {
          label: "Approved",
          value: stats.approved,
          gradient: "from-emerald-50/80 to-white",
          accent: "text-emerald-700",
        },
        {
          label: "In review",
          value: stats.review,
          gradient: "from-amber-50/80 to-white",
          accent: "text-amber-700",
        },
        {
          label: "Avg default risk",
          value: formatPercent(stats.avgRisk),
          gradient: "from-violet-50/80 to-white",
          accent: "text-violet-700",
        },
      ]
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/30 to-slate-100">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="bg-gradient-to-r from-slate-900 via-emerald-800 to-slate-700 bg-clip-text text-3xl font-bold text-transparent">
              Analyst dashboard
            </h1>
            <p className="mt-1 text-slate-600">Portfolio overview and manual review queue.</p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={refreshAll}
              disabled={dashboardLoading || appsLoading}
              className="border-slate-200/80 bg-white/80 backdrop-blur-sm"
            >
              {(dashboardLoading || appsLoading) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={logout}
              className="border-slate-200/80 bg-white/80 backdrop-blur-sm"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-sm text-amber-900 shadow-sm">
            {error}
          </div>
        )}

        {mlStatus && (
          <div
            className={cn(
              "mb-6 rounded-xl border px-4 py-3 text-sm shadow-sm backdrop-blur-sm",
              mlStatus.online && mlStatus.modelLoaded
                ? "border-emerald-200/80 bg-gradient-to-r from-emerald-50/90 to-teal-50/60 text-emerald-900"
                : "border-slate-200/80 bg-white/80 text-slate-600",
            )}
          >
            {mlStatus.online && mlStatus.modelLoaded ? (
              <>
                <strong>ML service online.</strong> New applications are scored with the
                trained XGBoost model.
              </>
            ) : (
              <>
                <strong>ML service offline.</strong> Run{" "}
                <code className="rounded bg-white/80 px-1">npm run ml:serve</code> in a second
                terminal to score new applications with the trained model.
              </>
            )}
          </div>
        )}

        {stats && (
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {statCards.map((item) => (
              <Card
                key={item.label}
                className={cn(
                  "overflow-hidden border-slate-200/60 bg-gradient-to-br shadow-sm backdrop-blur-sm",
                  item.gradient,
                )}
              >
                <CardHeader className="pb-2">
                  <CardDescription>{item.label}</CardDescription>
                  <CardTitle className={cn("text-2xl", item.accent)}>{item.value}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="overflow-hidden border-slate-200/60 bg-white/90 shadow-md backdrop-blur-sm">
            <CardHeader className="border-b border-slate-100/80 bg-gradient-to-r from-white to-emerald-50/40 pb-4">
              <CardTitle>Risk tier distribution</CardTitle>
              <CardDescription>Share of applications by risk tier</CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <div className="relative mx-auto aspect-square max-h-[380px] w-full min-h-[320px]">
                {chartData.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-slate-500">
                    No applications yet.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <defs>
                        {chartData.map((entry) => (
                          <linearGradient
                            key={entry.name}
                            id={`tier-gradient-${entry.name}`}
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="1"
                          >
                            <stop offset="0%" stopColor={entry.fill} stopOpacity={1} />
                            <stop offset="100%" stopColor={entry.fill} stopOpacity={0.75} />
                          </linearGradient>
                        ))}
                      </defs>
                      <Pie
                        data={chartData}
                        dataKey="count"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius="52%"
                        outerRadius="78%"
                        paddingAngle={3}
                        stroke="white"
                        strokeWidth={2}
                        label={renderPieLabel}
                        labelLine={false}
                      >
                        {chartData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={`url(#tier-gradient-${entry.name})`}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        verticalAlign="bottom"
                        formatter={(value, entry) => {
                          const slice = entry.payload as ChartSlice | undefined;
                          if (!slice) return value;
                          return (
                            <span className="text-sm text-slate-700">
                              {value}{" "}
                              <span className="font-medium text-slate-900">
                                ({slice.count} · {slice.percent.toFixed(1)}%)
                              </span>
                            </span>
                          );
                        }}
                      />
                      <text
                        x="50%"
                        y="46%"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-slate-900 text-2xl font-bold"
                      >
                        {chartTotal}
                      </text>
                      <text
                        x="50%"
                        y="54%"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-slate-500 text-xs"
                      >
                        applications
                      </text>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col overflow-hidden border-slate-200/60 bg-white/90 shadow-md backdrop-blur-sm">
            <CardHeader className="border-b border-slate-100/80 bg-gradient-to-r from-white to-amber-50/40 pb-4">
              <CardTitle>Review queue</CardTitle>
              <CardDescription>Medium-risk applications needing manual decision</CardDescription>
            </CardHeader>
            <CardContent
              className="flex flex-col p-4"
              style={{ minHeight: REVIEW_QUEUE_HEIGHT }}
            >
              <div className="relative flex-1 space-y-3">
                {dashboardLoading && reviewQueue.length === 0 ? (
                  <LoadingOverlay label="Loading review queue…" />
                ) : reviewQueue.length === 0 ? (
                  <p className="flex h-full items-center justify-center text-sm text-slate-500">
                    No applications pending review.
                  </p>
                ) : (
                  reviewQueue.map((app) => (
                    <div
                      key={app.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-gradient-to-r from-white to-slate-50/80 p-3 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{app.applicantName}</p>
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
              </div>
              {reviewData && (
                <PaginationBar
                  page={reviewData.page}
                  totalPages={reviewData.totalPages}
                  total={reviewData.total}
                  onPageChange={setReviewPage}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-6 overflow-hidden border-slate-200/60 bg-white/90 shadow-md backdrop-blur-sm">
          <CardHeader className="border-b border-slate-100/80 bg-gradient-to-r from-white to-violet-50/30 pb-4">
            <CardTitle>All applications</CardTitle>
            <CardDescription>Form submissions only, newest first</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <div className="relative min-w-[200px] flex-1">
                <label htmlFor="search" className="mb-1 block text-xs font-medium text-slate-500">
                  Search
                </label>
                <Input
                  id="search"
                  placeholder="Name or email…"
                  value={searchInput}
                  onChange={(e) => {
                    setSearchInput(e.target.value);
                    setAppsPage(1);
                  }}
                  className="border-slate-200/80 bg-white/90 pr-9"
                />
                {appsLoading && (
                  <Loader2 className="absolute right-3 top-[calc(50%+0.625rem)] h-4 w-4 -translate-y-1/2 animate-spin text-emerald-600" />
                )}
              </div>
              <div>
                <label htmlFor="statusFilter" className="mb-1 block text-xs font-medium text-slate-500">
                  Status
                </label>
                <select
                  id="statusFilter"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setAppsPage(1);
                  }}
                  className="h-9 rounded-md border border-slate-200/80 bg-white/90 px-3 text-sm shadow-sm"
                >
                  <option value="">All statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REVIEW">In review</option>
                  <option value="DECLINED">Declined</option>
                </select>
              </div>
              <div>
                <label htmlFor="tierFilter" className="mb-1 block text-xs font-medium text-slate-500">
                  Risk tier
                </label>
                <select
                  id="tierFilter"
                  value={tierFilter}
                  onChange={(e) => {
                    setTierFilter(e.target.value);
                    setAppsPage(1);
                  }}
                  className="h-9 rounded-md border border-slate-200/80 bg-white/90 px-3 text-sm shadow-sm"
                >
                  <option value="">All tiers</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>
              <Button
                variant="outline"
                onClick={resetFilters}
                disabled={!hasActiveFilters || appsLoading}
                className="border-slate-200/80 bg-white/80"
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset filters
              </Button>
            </div>

            <div
              className="relative flex flex-col overflow-hidden rounded-xl border border-slate-200/60 bg-gradient-to-b from-white to-slate-50/50"
              style={{ height: APPS_TABLE_HEIGHT }}
            >
              {appsLoading && <LoadingOverlay label="Searching applications…" />}

              <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 z-[1] bg-slate-50/95 backdrop-blur-sm">
                    <tr className="border-b border-slate-200/80 text-slate-500">
                      <th className="px-4 py-3 font-medium">Applicant</th>
                      <th className="px-4 py-3 font-medium">Date applied</th>
                      <th className="px-4 py-3 font-medium">Loan</th>
                      <th className="px-4 py-3 font-medium">Risk</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!appsLoading && (appsData?.applications ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-16 text-center text-slate-500">
                          No applications found.
                        </td>
                      </tr>
                    ) : (
                      (appsData?.applications ?? []).map((app) => (
                        <tr
                          key={app.id}
                          className="border-b border-slate-100/80 transition-colors hover:bg-emerald-50/30"
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900">{app.applicantName}</p>
                            <p className="text-xs text-slate-500">{app.email}</p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                            {format(new Date(app.createdAt), "MMM d, yyyy")}
                          </td>
                          <td className="px-4 py-3">{formatCurrency(app.loanAmount)}</td>
                          <td className="px-4 py-3">
                            {app.prediction ? (
                              <Badge variant={tierBadgeVariant(app.prediction.riskTier)}>
                                {tierLabel(app.prediction.riskTier)}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={statusBadgeVariant(app.status)}>
                              {statusLabel(app.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/applications/${app.id}`}
                              className="font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                            >
                              Details
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="shrink-0 border-t border-slate-200/60 bg-white/80 px-4 py-3">
                {appsData ? (
                  <PaginationBar
                    page={appsData.page}
                    totalPages={appsData.totalPages}
                    total={appsData.total}
                    onPageChange={setAppsPage}
                  />
                ) : (
                  <div className="h-8" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
