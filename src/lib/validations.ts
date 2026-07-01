import { z } from "zod";
import { LIMITS } from "./config";

export const applicationSchema = z.object({
  applicantName: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  age: z.number().min(18, "Must be 18+").max(100),
  employmentType: z.enum([
    "FULL_TIME",
    "PART_TIME",
    "SELF_EMPLOYED",
    "UNEMPLOYED",
    "RETIRED",
  ]),
  employmentYears: z.number().min(0).max(50),
  annualIncome: z
    .number()
    .min(LIMITS.minAnnualIncome, "Income must be at least ₱120,000 per year"),
  loanAmount: z
    .number()
    .min(LIMITS.minLoanAmount, "Minimum loan is ₱5,000")
    .max(LIMITS.maxLoanAmount, "Maximum loan is ₱3,000,000"),
  loanTermMonths: z.number().min(6).max(360),
  existingDebt: z.number().min(LIMITS.minMonthlyDebt),
  creditHistoryYears: z.number().min(0).max(50),
  numCreditInquiries: z.number().min(0).max(20),
  hasDelinquency: z.boolean(),
  homeOwnership: z.enum(["OWN", "RENT", "MORTGAGE", "OTHER"]),
  loanPurpose: z.string().optional(),
});

export type ApplicationFormValues = z.infer<typeof applicationSchema>;
