import type { ApplicationInput, ScoringResult } from "./scoring";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";

export async function scoreWithMlService(
  input: ApplicationInput,
): Promise<ScoringResult | null> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(3000),
    });

    if (!response.ok) return null;
    return (await response.json()) as ScoringResult;
  } catch {
    return null;
  }
}

export async function scoreHomeCreditRow(
  row: Record<string, unknown>,
): Promise<ScoringResult | null> {
  try {
    const response = await fetch(`${ML_SERVICE_URL}/predict/home-credit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        DAYS_BIRTH: Number(row.DAYS_BIRTH),
        DAYS_EMPLOYED: Number(row.DAYS_EMPLOYED),
        AMT_INCOME_TOTAL: Number(row.AMT_INCOME_TOTAL),
        AMT_CREDIT: Number(row.AMT_CREDIT),
        AMT_ANNUITY: Number(row.AMT_ANNUITY),
        CNT_CHILDREN: Number(row.CNT_CHILDREN ?? 0),
        EXT_SOURCE_1: row.EXT_SOURCE_1 ? Number(row.EXT_SOURCE_1) : null,
        EXT_SOURCE_2: row.EXT_SOURCE_2 ? Number(row.EXT_SOURCE_2) : null,
        EXT_SOURCE_3: row.EXT_SOURCE_3 ? Number(row.EXT_SOURCE_3) : null,
        NAME_INCOME_TYPE: row.NAME_INCOME_TYPE ?? "Working",
        NAME_HOUSING_TYPE: row.NAME_HOUSING_TYPE ?? "Rented apartment",
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    return (await response.json()) as ScoringResult;
  } catch {
    return null;
  }
}
