export type RiskTier = "LOW" | "MEDIUM" | "HIGH";

export type ApplicationInput = {
  applicantName: string;
  email: string;
  phone?: string;
  age: number;
  employmentType:
    | "FULL_TIME"
    | "PART_TIME"
    | "SELF_EMPLOYED"
    | "UNEMPLOYED"
    | "RETIRED";
  employmentYears: number;
  annualIncome: number;
  loanAmount: number;
  loanTermMonths: number;
  existingDebt: number;
  creditHistoryYears: number;
  numCreditInquiries: number;
  hasDelinquency: boolean;
  homeOwnership: string;
  loanPurpose?: string;
};

export type RiskFactorResult = {
  feature: string;
  label: string;
  impact: number;
  direction: "increases" | "decreases";
  value?: string;
};

export type ScoringResult = {
  defaultProbability: number;
  riskTier: RiskTier;
  modelVersion: string;
  factors: RiskFactorResult[];
};

export function computeApplicationMetrics(input: ApplicationInput) {
  const monthlyIncome = input.annualIncome / 12;
  const monthlyPayment =
    input.loanAmount / input.loanTermMonths + input.loanAmount * 0.005;
  const debtToIncome =
    (input.existingDebt + monthlyPayment) / Math.max(monthlyIncome, 1);
  const loanToIncome = input.loanAmount / Math.max(input.annualIncome, 1);
  return { monthlyIncome, monthlyPayment, debtToIncome, loanToIncome };
}

export function probabilityToTier(probability: number): RiskTier {
  if (probability >= 0.35) return "HIGH";
  if (probability >= 0.18) return "MEDIUM";
  return "LOW";
}

/** Hard lending rules the ML model cannot override (unemployment, DTI, etc.). */
export function applyBusinessRuleFloor(
  input: ApplicationInput,
  probability: number,
): number {
  const { debtToIncome, loanToIncome } = computeApplicationMetrics(input);
  let floor = probability;

  if (input.employmentType === "UNEMPLOYED") floor = Math.max(floor, 0.38);
  if (input.employmentType === "PART_TIME" && input.employmentYears < 1) {
    floor = Math.max(floor, 0.28);
  }
  if (loanToIncome > 1) floor = Math.max(floor, 0.48);
  else if (loanToIncome > 0.75) floor = Math.max(floor, 0.32);
  if (debtToIncome > 0.7) floor = Math.max(floor, 0.45);
  else if (debtToIncome > 0.5) floor = Math.max(floor, 0.28);
  if (input.creditHistoryYears < 2) floor = Math.max(floor, 0.22);
  if (input.hasDelinquency) floor = Math.max(floor, 0.4);
  if (input.numCreditInquiries > 4) floor = Math.max(floor, 0.3);

  // Compound red flags — unemployed borrower over-leveraged
  if (input.employmentType === "UNEMPLOYED" && loanToIncome > 0.8) {
    floor = Math.max(floor, 0.55);
  }
  if (
    input.employmentType === "UNEMPLOYED" &&
    debtToIncome > 0.6 &&
    loanToIncome > 0.9
  ) {
    floor = Math.max(floor, 0.62);
  }

  return Number(Math.min(floor, 0.99).toFixed(4));
}

/**
 * Blend ML output with heuristic scoring and business rules so form submissions
 * cannot be auto-approved when DTI, unemployment, or loan sizing are extreme.
 */
export function finalizeApplicationScore(
  input: ApplicationInput,
  modelScore: ScoringResult,
): ScoringResult {
  const heuristic = scoreApplication(input);
  const usedMl = !modelScore.modelVersion.includes("heuristic");

  let probability = usedMl
    ? Math.max(modelScore.defaultProbability, heuristic.defaultProbability)
    : modelScore.defaultProbability;

  probability = applyBusinessRuleFloor(input, probability);

  const riskTier = probabilityToTier(probability);
  const modelVersion = usedMl
    ? `${modelScore.modelVersion}+rules`
    : modelScore.modelVersion;

  return {
    defaultProbability: probability,
    riskTier,
    modelVersion,
    factors: heuristic.factors,
  };
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x));
}

export function scoreApplication(input: ApplicationInput): ScoringResult {
  const { debtToIncome: dti, loanToIncome } = computeApplicationMetrics(input);
  const inquiryPressure = Math.min(input.numCreditInquiries / 6, 1);
  const employmentScore =
    input.employmentType === "UNEMPLOYED"
      ? 1
      : input.employmentType === "PART_TIME"
        ? 0.55
        : input.employmentType === "SELF_EMPLOYED"
          ? 0.35
          : 0.1;
  const creditHistoryGap = Math.max(0, 5 - input.creditHistoryYears) / 5;

  let logit = -2.4;
  logit += dti * 2.8;
  logit += loanToIncome * 1.6;
  logit += inquiryPressure * 0.9;
  logit += employmentScore * 1.1;
  logit += creditHistoryGap * 0.8;
  logit += input.hasDelinquency ? 1.4 : 0;
  logit += input.age < 21 || input.age > 70 ? 0.35 : -0.15;
  logit += input.homeOwnership === "RENT" ? 0.2 : -0.1;
  logit -= Math.min(input.employmentYears, 10) * 0.08;

  const defaultProbability = Number(sigmoid(logit).toFixed(4));

  const factors: RiskFactorResult[] = [
    {
      feature: "debt_to_income",
      label: "Debt-to-income ratio",
      impact: Number((dti * 0.35).toFixed(3)),
      direction: dti > 0.4 ? "increases" : "decreases",
      value: `${(dti * 100).toFixed(1)}%`,
    },
    {
      feature: "loan_to_income",
      label: "Loan amount vs annual income",
      impact: Number((loanToIncome * 0.25).toFixed(3)),
      direction: loanToIncome > 0.5 ? "increases" : "decreases",
      value: `${(loanToIncome * 100).toFixed(0)}% of income`,
    },
    {
      feature: "credit_history",
      label: "Credit history length",
      impact: Number((creditHistoryGap * 0.2).toFixed(3)),
      direction: input.creditHistoryYears < 3 ? "increases" : "decreases",
      value: `${input.creditHistoryYears} years`,
    },
    {
      feature: "employment_stability",
      label: "Employment stability",
      impact: Number((employmentScore * 0.2).toFixed(3)),
      direction: employmentScore > 0.3 ? "increases" : "decreases",
      value: `${input.employmentYears} yrs, ${input.employmentType.replace("_", " ").toLowerCase()}`,
    },
    {
      feature: "credit_inquiries",
      label: "Recent credit inquiries",
      impact: Number((inquiryPressure * 0.15).toFixed(3)),
      direction: input.numCreditInquiries > 2 ? "increases" : "decreases",
      value: String(input.numCreditInquiries),
    },
  ];

  if (input.hasDelinquency) {
    factors.push({
      feature: "delinquency",
      label: "Past delinquency",
      impact: 0.28,
      direction: "increases",
      value: "Yes",
    });
  }

  factors.sort((a, b) => b.impact - a.impact);

  const riskTier = probabilityToTier(defaultProbability);

  return {
    defaultProbability,
    riskTier,
    modelVersion: "risklens-v1-heuristic",
    factors: factors.slice(0, 5),
  };
}

export function tierToStatus(tier: RiskTier) {
  if (tier === "LOW") return "APPROVED" as const;
  if (tier === "MEDIUM") return "REVIEW" as const;
  return "DECLINED" as const;
}

export function tierLabel(tier: RiskTier) {
  switch (tier) {
    case "LOW":
      return "Low Risk";
    case "MEDIUM":
      return "Medium Risk";
    case "HIGH":
      return "High Risk";
  }
}

export function statusLabel(status: string) {
  switch (status) {
    case "APPROVED":
      return "Approved";
    case "REVIEW":
      return "Pending";
    case "DECLINED":
      return "Declined";
    default:
      return "Pending";
  }
}
