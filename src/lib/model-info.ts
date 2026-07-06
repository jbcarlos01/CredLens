export function modelVersionLabel(version: string) {
  const base = version.replace("+rules", "");
  if (base.includes("xgb") || base.includes("homecredit")) {
    const suffix = version.includes("+rules")
      ? " · with lending policy rules"
      : "";
    return `XGBoost · trained on Kaggle Home Credit data${suffix}`;
  }
  if (version.includes("kaggle-import")) {
    return "Imported from Kaggle Home Credit dataset";
  }
  if (version.includes("heuristic")) {
    return "Built-in risk formula";
  }
  if (version.includes("seed")) {
    return "Legacy demo record";
  }
  return version;
}

export function isKaggleRecord(email: string, loanPurpose?: string | null) {
  return (
    email.endsWith("@homecredit.kaggle.import") ||
    Boolean(loanPurpose?.includes("Home Credit Kaggle"))
  );
}
