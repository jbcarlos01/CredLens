/** Philippines locale & lending defaults */
export const APP_LOCALE = "en-PH";
export const CURRENCY = "PHP";

/** Validation bounds (amounts in Philippine Peso) */
export const LIMITS = {
  minAnnualIncome: 120_000, // ~₱10,000/month
  maxAnnualIncome: 50_000_000,
  minLoanAmount: 5_000,
  maxLoanAmount: 3_000_000, // typical personal loan ceiling
  minMonthlyDebt: 0,
} as const;

export const LOAN_PURPOSE_EXAMPLES =
  "e.g. tuition, medical, home renovation, small business";
