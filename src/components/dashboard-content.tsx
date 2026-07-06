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
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Download,
  Inbox,
  Loader2,
  LogOut,
  PieChart as PieChartIcon,
  RotateCcw,
  SearchX,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Navbar } from "@/components/navbar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { needsVerification } from "@/lib/application-query";
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
  statusCounts: { pending: number; approved: number; declined: number };
  tierCounts: { LOW: number; MEDIUM: number; HIGH: number };
  avgRisk: number;
};

type ChartSlice = {
  name: string;
  count: number;
  sharePercent: number;
  fill: string;
  gradientId: string;
};

const TIER_COLORS = {
  Low: "#10b981",
  Medium: "#f59e0b",
  High: "#ef4444",
} as const;

const STATUS_COLORS = {
  Pending: "#6366f1",
  Approved: "#10b981",
  Declined: "#ef4444",
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

function buildChartSlices(
  items: { name: string; count: number }[],
  colors: Record<string, string>,
  idPrefix: string,
): ChartSlice[] {
  const filtered = items.filter((d) => d.count > 0);
  const total = filtered.reduce((sum, d) => sum + d.count, 0);
  return filtered.map((d) => ({
    name: d.name,
    count: d.count,
    sharePercent: total > 0 ? (d.count / total) * 100 : 0,
    fill: colors[d.name as keyof typeof colors] ?? "#94a3b8",
    gradientId: `${idPrefix}-${d.name.replace(/\s+/g, "-").toLowerCase()}`,
  }));
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
  labelSuffix = "risk",
}: {
  active?: boolean;
  payload?: { payload: ChartSlice }[];
  labelSuffix?: string;
}) {
  if (!active || !payload?.length) return null;
  const slice = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm">
      <p className="font-semibold text-slate-900">
        {slice.name} {labelSuffix}
      </p>
      <p className="mt-1 text-sm text-slate-600">
        {slice.count} application{slice.count !== 1 ? "s" : ""}
      </p>
      <p className="text-sm font-medium text-emerald-700">
        {slice.sharePercent.toFixed(1)}% of portfolio
      </p>
    </div>
  );
}

function DistributionPieCard({
  title,
  description,
  headerGradient,
  data,
  centerLabel,
  tooltipSuffix = "risk",
  emptyTitle,
  emptyDescription,
  emptyAccent,
}: {
  title: string;
  description: string;
  headerGradient: string;
  data: ChartSlice[];
  centerLabel: string;
  tooltipSuffix?: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyAccent: "emerald" | "indigo";
}) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card className="overflow-hidden border-slate-200/60 bg-white/90 shadow-md backdrop-blur-sm">
      <CardHeader className={cn("border-b border-slate-100/80 pb-4", headerGradient)}>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-4">
        <div className="relative mx-auto aspect-square max-h-[380px] w-full min-h-[320px]">
          {data.length === 0 ? (
            <EmptyState
              icon={PieChartIcon}
              title={emptyTitle}
              description={emptyDescription}
              accent={emptyAccent}
              className="h-full"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  {data.map((entry) => (
                    <linearGradient
                      key={entry.gradientId}
                      id={entry.gradientId}
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
                  data={data}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="52%"
                  outerRadius="78%"
                  paddingAngle={3}
                  stroke="white"
                  strokeWidth={2}
                >
                  {data.map((entry) => (
                    <Cell key={entry.name} fill={`url(#${entry.gradientId})`} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip labelSuffix={tooltipSuffix} />} />
                <Legend
                  verticalAlign="bottom"
                  formatter={(value, entry) => {
                    const slice = entry.payload as ChartSlice | undefined;
                    if (!slice) return value;
                    return (
                      <span className="text-sm text-slate-700">
                        {value}{" "}
                        <span className="font-medium text-slate-900">
                          ({slice.count} · {slice.sharePercent.toFixed(1)}%)
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
                  {total}
                </text>
                <text
                  x="50%"
                  y="54%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-slate-500 text-xs"
                >
                  {centerLabel}
                </text>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardInner() {
  const router = useRouter();
  const { toast } = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [reviewData, setReviewData] = useState<ApplicationsResponse | null>(null);
  const [appsData, setAppsData] = useState<ApplicationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [appsLoading, setAppsLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    setSelectedReviewIds(new Set());
  }, [reviewPage]);

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

  const refreshDataSilent = useCallback(async () => {
    try {
      const [statsRes, review, apps] = await Promise.all([
        fetch("/api/stats"),
        loadReview(reviewPage),
        loadApps(appsPage, {
          search: debouncedSearch,
          status: statusFilter,
          tier: tierFilter,
        }),
      ]);
      if (statsRes.status === 401) {
        router.refresh();
        return;
      }
      if (statsRes.ok) setStats(await statsRes.json());
      if (review) setReviewData(review);
      if (apps) setAppsData(apps);
    } catch {
      /* keep current data visible */
    }
  }, [
    router,
    reviewPage,
    appsPage,
    debouncedSearch,
    statusFilter,
    tierFilter,
    loadReview,
    loadApps,
  ]);

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

  async function refreshAll() {
    setDashboardLoading(true);
    setAppsLoading(true);
    try {
      await refreshDataSilent();
    } finally {
      setDashboardLoading(false);
      setAppsLoading(false);
    }
  }

  async function updateStatus(id: string, status: "APPROVED" | "DECLINED", name?: string) {
    const response = await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (response.status === 401) {
      router.refresh();
      return false;
    }
    if (!response.ok) {
      toast("Failed to update application", "error");
      return false;
    }
    setSelectedReviewIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    toast(
      name
        ? `${name} ${status === "APPROVED" ? "approved" : "declined"}`
        : `Application ${status === "APPROVED" ? "approved" : "declined"}`,
    );
    await refreshDataSilent();
    return true;
  }

  async function bulkUpdateStatus(status: "APPROVED" | "DECLINED") {
    const ids = Array.from(selectedReviewIds);
    if (ids.length === 0) return;

    setBulkLoading(true);
    try {
      const response = await fetch("/api/applications/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status }),
      });
      if (response.status === 401) {
        router.refresh();
        return;
      }
      if (!response.ok) {
        toast("Bulk update failed", "error");
        return;
      }
      const result = (await response.json()) as { updated: number };
      if (result.updated === 0) {
        toast("No applications were updated", "error");
        return;
      }
      setSelectedReviewIds(new Set());
      toast(
        `${result.updated} application${result.updated !== 1 ? "s" : ""} ${status === "APPROVED" ? "approved" : "declined"}`,
      );
      await refreshDataSilent();
    } catch {
      toast("Bulk update failed", "error");
    } finally {
      setBulkLoading(false);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter) params.set("status", statusFilter);
      if (tierFilter) params.set("riskTier", tierFilter);

      const response = await fetch(`/api/applications/export?${params}`);
      if (response.status === 401) {
        router.refresh();
        return;
      }
      if (!response.ok) {
        toast("Export failed", "error");
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        "credlens-applications.csv";
      anchor.click();
      URL.revokeObjectURL(url);
      toast("Applications exported to CSV");
    } catch {
      toast("Export failed", "error");
    } finally {
      setExporting(false);
    }
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

  function toggleReviewSelection(id: string) {
    setSelectedReviewIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const hasActiveFilters = Boolean(searchInput || statusFilter || tierFilter);

  const tierChartData = useMemo((): ChartSlice[] => {
    if (!stats) return [];
    return buildChartSlices(
      [
        { name: "Low", count: stats.tierCounts.LOW },
        { name: "Medium", count: stats.tierCounts.MEDIUM },
        { name: "High", count: stats.tierCounts.HIGH },
      ],
      TIER_COLORS,
      "tier",
    );
  }, [stats]);

  const statusChartData = useMemo((): ChartSlice[] => {
    if (!stats) return [];
    return buildChartSlices(
      [
        { name: "Pending", count: stats.statusCounts.pending },
        { name: "Approved", count: stats.statusCounts.approved },
        { name: "Declined", count: stats.statusCounts.declined },
      ],
      STATUS_COLORS,
      "status",
    );
  }, [stats]);

  const reviewQueue = reviewData?.applications ?? [];
  const allPageSelected =
    reviewQueue.length > 0 && reviewQueue.every((app) => selectedReviewIds.has(app.id));
  const hasPortfolio = (stats?.total ?? 0) > 0;

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

        {!dashboardLoading && !hasPortfolio && (
          <Card className="mb-8 overflow-hidden border-slate-200/60 bg-white/90 shadow-md">
            <EmptyState
              icon={Inbox}
              title="No applications yet"
              description="Applications submitted through the form will appear here. Share the apply link to start receiving loan requests."
              accent="emerald"
              action={
                <Link href="/apply" className={cn(buttonVariants({ variant: "default" }))}>
                  View apply page
                </Link>
              }
            />
          </Card>
        )}

        {stats && hasPortfolio && (
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

        {hasPortfolio && (
          <div className="grid gap-6 lg:grid-cols-2">
            <DistributionPieCard
              title="Risk tier distribution"
              description="Share of applications by predicted risk tier"
              headerGradient="bg-gradient-to-r from-white to-emerald-50/40"
              data={tierChartData}
              centerLabel="applications"
              tooltipSuffix="risk tier"
              emptyTitle="No risk data yet"
              emptyDescription="Charts will populate once applications are scored."
              emptyAccent="emerald"
            />
            <DistributionPieCard
              title="Application status"
              description="Pending (incl. manual review), approved, and declined"
              headerGradient="bg-gradient-to-r from-white to-indigo-50/40"
              data={statusChartData}
              centerLabel="applications"
              tooltipSuffix="status"
              emptyTitle="No status data yet"
              emptyDescription="Status breakdown appears after the first submission."
              emptyAccent="indigo"
            />
          </div>
        )}

        <Card className="mt-6 flex flex-col overflow-hidden border-slate-200/60 bg-white/90 shadow-md backdrop-blur-sm">
          <CardHeader className="border-b border-slate-100/80 bg-gradient-to-r from-white to-amber-50/40 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>Review queue</CardTitle>
                <CardDescription>Medium-risk applications needing manual decision</CardDescription>
              </div>
              {reviewQueue.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={() => {
                        if (allPageSelected) setSelectedReviewIds(new Set());
                        else setSelectedReviewIds(new Set(reviewQueue.map((a) => a.id)));
                      }}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Select all on page
                  </label>
                  {selectedReviewIds.size > 0 && (
                    <>
                      <span className="text-xs text-slate-500">
                        {selectedReviewIds.size} selected
                      </span>
                      <Button
                        size="sm"
                        disabled={bulkLoading}
                        onClick={() => bulkUpdateStatus("APPROVED")}
                      >
                        {bulkLoading && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                        Approve selected
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={bulkLoading}
                        onClick={() => bulkUpdateStatus("DECLINED")}
                      >
                        Decline selected
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent
            className="flex flex-col p-4"
            style={{ minHeight: REVIEW_QUEUE_HEIGHT }}
          >
            <div className="relative flex-1 space-y-3">
              {dashboardLoading && reviewQueue.length === 0 ? (
                <LoadingOverlay label="Loading review queue…" />
              ) : reviewQueue.length === 0 ? (
                <EmptyState
                  icon={ClipboardCheck}
                  title="Review queue is clear"
                  description="No medium-risk applications need a manual decision right now."
                  accent="amber"
                  className="h-full"
                />
              ) : (
                reviewQueue.map((app) => (
                  <div
                    key={app.id}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 shadow-sm transition-shadow hover:shadow-md",
                      selectedReviewIds.has(app.id)
                        ? "border-emerald-300 bg-emerald-50/50"
                        : "border-slate-200/80 bg-gradient-to-r from-white to-slate-50/80",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedReviewIds.has(app.id)}
                        onChange={() => toggleReviewSelection(app.id)}
                        className="mt-1 h-4 w-4 cursor-pointer rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        aria-label={`Select ${app.applicantName}`}
                      />
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
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => updateStatus(app.id, "APPROVED", app.applicantName)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => updateStatus(app.id, "DECLINED", app.applicantName)}
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

        <Card className="mt-6 overflow-hidden border-slate-200/60 bg-white/90 shadow-md backdrop-blur-sm">
          <CardHeader className="border-b border-slate-100/80 bg-gradient-to-r from-white to-violet-50/30 pb-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>All applications</CardTitle>
                <CardDescription>Form submissions only, newest first</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={exportCsv}
                disabled={exporting || !hasPortfolio}
                className="border-slate-200/80 bg-white/80"
              >
                {exporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export CSV
              </Button>
            </div>
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
                  className="h-9 cursor-pointer rounded-md border border-slate-200/80 bg-white/90 px-3 text-sm shadow-sm"
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
                  className="h-9 cursor-pointer rounded-md border border-slate-200/80 bg-white/90 px-3 text-sm shadow-sm"
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
                {!appsLoading && (appsData?.applications ?? []).length === 0 ? (
                  <EmptyState
                    icon={hasActiveFilters ? SearchX : ClipboardList}
                    title={hasActiveFilters ? "No matching applications" : "No applications yet"}
                    description={
                      hasActiveFilters
                        ? "Try adjusting your search or filters to find what you need."
                        : "Submitted applications will show up in this table."
                    }
                    accent={hasActiveFilters ? "slate" : "indigo"}
                    action={
                      hasActiveFilters ? (
                        <Button variant="outline" size="sm" onClick={resetFilters}>
                          Reset filters
                        </Button>
                      ) : undefined
                    }
                    className="h-full"
                  />
                ) : (
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
                      {(appsData?.applications ?? []).map((app) => (
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
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant={statusBadgeVariant(app.status)}>
                                {statusLabel(app.status)}
                              </Badge>
                              {needsVerification(app) && (
                                <Badge
                                  variant="warning"
                                  className="border border-amber-300/60"
                                >
                                  Needs verification
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/applications/${app.id}`}
                              className="cursor-pointer font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
                            >
                              Details
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="shrink-0 border-t border-slate-200/60 bg-white/80 px-4 py-3">
                {appsData && appsData.total > 0 ? (
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

export function DashboardContent() {
  return (
    <ToastProvider>
      <DashboardInner />
    </ToastProvider>
  );
}
