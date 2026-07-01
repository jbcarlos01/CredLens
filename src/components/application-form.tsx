"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import {
  applicationSchema,
  type ApplicationFormValues,
} from "@/lib/validations";
import { LOAN_PURPOSE_EXAMPLES } from "@/lib/config";

export function ApplicationForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationSchema),
    defaultValues: {
      employmentType: "FULL_TIME",
      homeOwnership: "RENT",
      hasDelinquency: false,
      loanTermMonths: 36,
      numCreditInquiries: 0,
      existingDebt: 0,
      creditHistoryYears: 3,
      employmentYears: 2,
    },
  });

  async function onSubmit(data: ApplicationFormValues) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Submission failed");
      router.push(`/applications/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      <Card className="border-slate-200/80 bg-white/95 shadow-sm">
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
          <CardDescription>Basic details about the applicant.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="applicantName">Full name</Label>
            <Input id="applicantName" {...register("applicantName")} />
            {errors.applicantName && (
              <p className="text-sm text-red-600">{errors.applicantName.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register("email")} />
            {errors.email && <p className="text-sm text-red-600">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input id="phone" {...register("phone")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="age">Age</Label>
            <Input id="age" type="number" {...register("age", { valueAsNumber: true })} />
            {errors.age && <p className="text-sm text-red-600">{errors.age.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="homeOwnership">Home ownership</Label>
            <Select id="homeOwnership" {...register("homeOwnership")}>
              <option value="OWN">Own outright</option>
              <option value="MORTGAGE">Mortgage</option>
              <option value="RENT">Rent</option>
              <option value="OTHER">Other</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 bg-white/95 shadow-sm">
        <CardHeader>
          <CardTitle>Employment & Income</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="employmentType">Employment type</Label>
            <Select id="employmentType" {...register("employmentType")}>
              <option value="FULL_TIME">Full-time</option>
              <option value="PART_TIME">Part-time</option>
              <option value="SELF_EMPLOYED">Self-employed</option>
              <option value="UNEMPLOYED">Unemployed</option>
              <option value="RETIRED">Retired</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="employmentYears">Years employed</Label>
            <Input id="employmentYears" type="number" step="0.5" {...register("employmentYears", { valueAsNumber: true })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="annualIncome">Annual income (PHP / ₱)</Label>
            <Input
              id="annualIncome"
              type="number"
              placeholder="600000"
              {...register("annualIncome", { valueAsNumber: true })}
            />
            {errors.annualIncome && (
              <p className="text-sm text-red-600">{errors.annualIncome.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 bg-white/95 shadow-sm">
        <CardHeader>
          <CardTitle>Loan & Credit Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="loanAmount">Loan amount (PHP / ₱)</Label>
            <Input
              id="loanAmount"
              type="number"
              placeholder="150000"
              {...register("loanAmount", { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loanTermMonths">Term (months)</Label>
            <Input id="loanTermMonths" type="number" {...register("loanTermMonths", { valueAsNumber: true })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="existingDebt">Monthly debt payments (PHP / ₱)</Label>
            <Input
              id="existingDebt"
              type="number"
              placeholder="8000"
              {...register("existingDebt", { valueAsNumber: true })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="creditHistoryYears">Credit history (years)</Label>
            <Input id="creditHistoryYears" type="number" {...register("creditHistoryYears", { valueAsNumber: true })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="numCreditInquiries">Credit inquiries (last 12 mo)</Label>
            <Input id="numCreditInquiries" type="number" {...register("numCreditInquiries", { valueAsNumber: true })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loanPurpose">Loan purpose (optional)</Label>
            <Input
              id="loanPurpose"
              placeholder={LOAN_PURPOSE_EXAMPLES}
              {...register("loanPurpose")}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <input id="hasDelinquency" type="checkbox" {...register("hasDelinquency")} />
            <Label htmlFor="hasDelinquency">Past delinquency on record</Label>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={loading} className="w-full sm:w-auto">
        {loading ? "Scoring application..." : "Submit & get risk score"}
      </Button>
    </form>
  );
}
