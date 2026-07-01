import Link from "next/link";
import { Shield } from "lucide-react";
import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Home" },
  { href: "/apply", label: "Apply" },
  { href: "/dashboard", label: "Analyst Portal" },
];

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
            <Shield className="h-4 w-4" />
          </span>
          <span className="tracking-tight">{APP_NAME}</span>
        </Link>
        <nav className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-2 py-1 text-sm font-medium text-slate-600">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-full px-3 py-1.5 transition-colors hover:bg-emerald-50 hover:text-emerald-700",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
