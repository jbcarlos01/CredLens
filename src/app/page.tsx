import Link from "next/link";
import { ArrowRight, BarChart3, Bot, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: ShieldCheck,
    title: "Explainable risk scoring",
    description:
      "ML-powered default probability with transparent factor breakdowns for every application.",
  },
  {
    icon: Bot,
    title: "Risk advisor chat",
    description:
      "Applicants and analysts can ask questions about scores, factors, and next steps.",
  },
  {
    icon: BarChart3,
    title: "Analyst dashboard",
    description:
      "Loan officers review medium-risk cases and monitor portfolio health in real time.",
  },
];

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-16">
        <section className="grid items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">
              Banking · Finance · Insurance
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
              Credit risk scoring with explainability.
            </h1>
            <p className="text-lg text-slate-600">
              RiskLens AI scores loan applications in Philippine Peso, routes them to the right
              decision tier, and helps applicants understand their risk profile — built for modern
              lenders in the Philippines.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/apply"
                className={cn(buttonVariants({ size: "lg" }))}
              >
                Apply for a loan <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                Analyst Portal
              </Link>
            </div>
          </div>
          <Card className="border-emerald-100/80 bg-white/90 shadow-lg shadow-emerald-100/60">
            <CardHeader>
              <CardTitle>How it works</CardTitle>
              <CardDescription>End-to-end credit risk workflow</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-slate-700">
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="font-medium text-slate-900">1. Submit application</p>
                <p className="mt-1">Income, employment, loan details, and credit profile.</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="font-medium text-slate-900">2. ML risk scoring</p>
                <p className="mt-1">Default probability + Low / Medium / High tier assignment.</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="font-medium text-slate-900">3. Decision & guidance</p>
                <p className="mt-1">Auto-approve, manual review, or decline — with AI advisor support.</p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="mt-20 grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="border-slate-200/80 bg-white/90 shadow-sm">
              <CardHeader>
                <feature.icon className="mb-2 h-8 w-8 text-emerald-600" />
                <CardTitle className="text-lg">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>
      </main>
    </div>
  );
}
