import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
  accent?: "emerald" | "amber" | "indigo" | "slate";
};

const accentStyles = {
  emerald: {
    ring: "from-emerald-100 to-teal-50",
    icon: "text-emerald-600",
    dots: "bg-emerald-200/60",
  },
  amber: {
    ring: "from-amber-100 to-orange-50",
    icon: "text-amber-600",
    dots: "bg-amber-200/60",
  },
  indigo: {
    ring: "from-indigo-100 to-violet-50",
    icon: "text-indigo-600",
    dots: "bg-indigo-200/60",
  },
  slate: {
    ring: "from-slate-100 to-slate-50",
    icon: "text-slate-500",
    dots: "bg-slate-200/60",
  },
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  accent = "slate",
}: EmptyStateProps) {
  const styles = accentStyles[accent];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-10 text-center",
        className,
      )}
    >
      <div className="relative mb-5">
        <div
          className={cn(
            "absolute -inset-3 rounded-full bg-gradient-to-br opacity-80 blur-sm",
            styles.ring,
          )}
        />
        <div
          className={cn(
            "relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br shadow-inner",
            styles.ring,
          )}
        >
          <Icon className={cn("h-9 w-9", styles.icon)} strokeWidth={1.5} />
        </div>
        <span
          className={cn("absolute -right-1 top-0 h-2.5 w-2.5 rounded-full", styles.dots)}
        />
        <span
          className={cn("absolute -bottom-1 -left-2 h-2 w-2 rounded-full", styles.dots)}
        />
        <span
          className={cn("absolute bottom-2 -right-3 h-1.5 w-1.5 rounded-full", styles.dots)}
        />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
