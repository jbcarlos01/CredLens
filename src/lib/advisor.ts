import type { RiskFactorResult, ScoringResult } from "./scoring";
import { tierLabel } from "./scoring";
import { formatCurrency, formatPercent } from "./utils";
import { isKaggleRecord, modelVersionLabel } from "./model-info";

export type AdvisorContext = {
  viewerRole?: "APPLICANT" | "ANALYST";
  applicantName: string;
  email: string;
  status: string;
  age: number;
  employmentType: string;
  employmentYears: number;
  annualIncome: number;
  loanAmount: number;
  loanTermMonths: number;
  existingDebt: number;
  creditHistoryYears: number;
  numCreditInquiries: number;
  hasDelinquency: boolean;
  homeOwnership: string;
  loanPurpose?: string | null;
  scoring: ScoringResult;
};

function firstName(fullName: string) {
  return fullName.split("(")[0].trim().split(" ")[0] || fullName;
}

function isAnalystViewer(ctx: AdvisorContext) {
  return ctx.viewerRole === "ANALYST";
}

function monthlyIncome(ctx: AdvisorContext) {
  return ctx.annualIncome / 12;
}

function estimatedNewPayment(ctx: AdvisorContext) {
  return ctx.loanAmount / ctx.loanTermMonths + ctx.loanAmount * 0.005;
}

function debtToIncome(ctx: AdvisorContext) {
  return (ctx.existingDebt + estimatedNewPayment(ctx)) / Math.max(monthlyIncome(ctx), 1);
}

function loanToIncome(ctx: AdvisorContext) {
  return ctx.loanAmount / Math.max(ctx.annualIncome, 1);
}

function kaggleOutcomeFactor(ctx: AdvisorContext) {
  return ctx.scoring.factors.find((f) => f.feature === "kaggle_target");
}

function explainFactor(f: RiskFactorResult): string {
  const val = f.value ? ` (${f.value})` : "";
  if (f.direction === "increases") {
    return `Your ${f.label.toLowerCase()}${val} is pushing your risk up — it's one of the stronger signals in your file.`;
  }
  return `Your ${f.label.toLowerCase()}${val} is actually helping your profile — it reduced your overall risk score.`;
}

function buildImprovementTips(factors: RiskFactorResult[]) {
  return factors
    .filter((f) => f.direction === "increases" && f.feature !== "kaggle_target")
    .slice(0, 4)
    .map((f) => {
      switch (f.feature) {
        case "debt_to_income":
          return "Pay down existing monthly obligations, or request a smaller loan so your debt-to-income ratio falls below 40%.";
        case "loan_to_income":
          return "Relative to your income, requesting less than 50% of your annual earnings would strengthen your case.";
        case "credit_history":
          return "Keep older credit accounts open and maintain on-time payments — length of history matters to lenders.";
        case "employment_stability":
          return "Stable full-time employment for 12+ months is viewed favorably. If you're between jobs, waiting to apply can help.";
        case "credit_inquiries":
          return "Avoid applying for new credit cards or loans in the next 3–6 months — each inquiry can signal distress.";
        case "delinquency":
          return "Clear any past-due balances and set up auto-pay so your record shows 6+ months of clean payments.";
        default:
          return `Work on improving your ${f.label.toLowerCase()} — our model flagged it as a risk driver.`;
      }
    });
}

function statusExplanation(ctx: AdvisorContext): string {
  switch (ctx.status) {
    case "APPROVED":
      return "Your application has been auto-approved based on your low-risk profile. Funds are typically released within 2–3 business days after final verification.";
    case "REVIEW":
      return "Your application is in the manual review queue. A loan officer will look at your full profile — not just the score — within 1–2 business days. Medium-risk cases often get approved with minor adjustments.";
    case "DECLINED":
      return "Based on the current risk assessment, this application wasn't approved automatically. That doesn't mean you can't apply again after improving the factors we discussed.";
    default:
      return "Your application is being processed.";
  }
}

function greeting(ctx: AdvisorContext, history: { role: string; content: string }[]) {
  if (isAnalystViewer(ctx)) {
    if (history.length > 0) {
      return "Of course. What else would you like to review in this applicant's risk profile?";
    }
    return `Hello Analyst. I'm Marco, your loan risk advisor. I can help you assess this applicant's score, key drivers, and decision rationale (${tierLabel(ctx.scoring.riskTier)}).`;
  }

  if (history.length > 0) {
    return `Of course, ${firstName(ctx.applicantName)} — what else would you like to know about your application?`;
  }

  const dti = debtToIncome(ctx);
  const intro = isKaggleRecord(ctx.email, ctx.loanPurpose)
    ? `I'm Marco, your loan advisor here at RiskLens. I've reviewed your file — including data from our Home Credit risk model trained on over 300,000 real loan records from Kaggle.`
    : `I'm Marco, your loan advisor at RiskLens. I've gone through your application and the output from our credit risk model.`;

  return `${intro}\n\nYou're currently rated ${tierLabel(ctx.scoring.riskTier)} with a ${formatPercent(ctx.scoring.defaultProbability)} estimated default probability. Your debt-to-income ratio sits around ${(dti * 100).toFixed(0)}%.\n\nAsk me anything — why you got this score, what to improve, or how the model works.`;
}

function explainScore(ctx: AdvisorContext): string {
  const name = isAnalystViewer(ctx) ? "Analyst" : firstName(ctx.applicantName);
  const subject = isAnalystViewer(ctx) ? "the applicant" : "you";
  const top = ctx.scoring.factors.filter((f) => f.feature !== "kaggle_target").slice(0, 3);
  const factorText = top.map((f, i) => `${i + 1}. ${explainFactor(f)}`).join("\n");

  let body = `Here's the score interpretation, ${name}.\n\nOur model placed ${subject} in the ${tierLabel(ctx.scoring.riskTier)} band — meaning a ${formatPercent(ctx.scoring.defaultProbability)} chance of default based on similar profiles in training data.\n\nTop drivers:\n${factorText}`;

  const kaggle = kaggleOutcomeFactor(ctx);
  if (kaggle) {
    body += `\n\nFor context, this profile is linked to a historical record from the Home Credit dataset, where the actual outcome was: ${kaggle.value?.toLowerCase()}. Your live risk tier is still based on the model's prediction at application time.`;
  }

  body += `\n\n${statusExplanation(ctx)}`;
  return body;
}

function explainModel(ctx: AdvisorContext): string {
  return `Great question. RiskLens uses an XGBoost machine learning model trained on the Home Credit Default Risk dataset from Kaggle — roughly 307,000 real loan applications with known outcomes (repaid vs defaulted).

Your application was scored using ${modelVersionLabel(ctx.scoring.modelVersion).toLowerCase()}. The model weighs things like income, loan size, employment stability, credit history, and debt burden — the same signals Philippine lenders care about.

I don't make the final decision — I help you understand what the model saw in your file and what you can do about it.`;
}

function explainDti(ctx: AdvisorContext): string {
  const dti = debtToIncome(ctx);
  const monthly = monthlyIncome(ctx);
  const payment = estimatedNewPayment(ctx);

  const assessment =
    dti <= 0.35
      ? "That's within a comfortable range for most Philippine lenders."
      : dti <= 0.5
        ? "That's on the higher side — many lenders start getting cautious above 40%."
        : "That's quite high, which is likely a major reason your risk score was elevated.";

  const label = isAnalystViewer(ctx) ? "Applicant" : "Your";
  return `${label} debt-to-income (DTI) ratio is about ${(dti * 100).toFixed(0)}%.

Here's the breakdown:
• Monthly income: ${formatCurrency(monthly)}
• Other monthly debt payments: ${formatCurrency(ctx.existingDebt)}
• Estimated payment on this loan: ${formatCurrency(payment)}
• Total monthly obligations: ${formatCurrency(ctx.existingDebt + payment)}

${assessment} Paying down existing debt or reducing your requested loan amount are the fastest ways to improve this.`;
}

function approvalOutlook(ctx: AdvisorContext): string {
  const p = ctx.scoring.defaultProbability;
  if (isAnalystViewer(ctx)) {
    if (ctx.scoring.riskTier === "LOW") {
      return `Analyst view: this file is currently low risk at ${formatPercent(p)} expected default probability. ${ctx.status === "APPROVED" ? "The auto-approval is aligned with policy." : "Approval is typically appropriate unless external verification raises issues."}\n\n${statusExplanation(ctx)}`;
    }
    if (ctx.scoring.riskTier === "MEDIUM") {
      return `Analyst view: this is a borderline file at ${formatPercent(p)} expected default probability. Recommend manual review of income stability and supporting documents before a final decision.\n\n${statusExplanation(ctx)}`;
    }
    return `Analyst view: this file is high risk at ${formatPercent(p)} expected default probability. Decline is policy-aligned unless strong compensating factors (collateral/co-borrower/verified additional income) are present.`;
  }

  const name = firstName(ctx.applicantName);

  if (ctx.scoring.riskTier === "LOW") {
    return `Honestly, ${name} — your profile looks solid. At ${formatPercent(p)} default risk, you're in our low-risk tier and ${ctx.status === "APPROVED" ? "you've already been approved" : "approval is very likely"}.\n\n${statusExplanation(ctx)}`;
  }
  if (ctx.scoring.riskTier === "MEDIUM") {
    return `${name}, you're in a gray area — ${formatPercent(p)} default risk puts you in medium tier. About 1 in 4 similar profiles in our training data defaulted, but many still got approved after review.\n\nA loan officer will weigh your employment history and purpose of loan, not just the number. ${statusExplanation(ctx)}`;
  }
  return `${name}, I'll be straight with you — at ${formatPercent(p)} default risk, this is a challenging profile right now. That doesn't mean it's impossible.\n\nI've seen applicants improve their odds by reducing the loan amount by 20–30%, adding a co-signer, or waiting until employment stabilizes. Want me to walk through specific steps?`;
}

function matchIntent(message: string) {
  const lower = message.toLowerCase();
  return {
    greeting: /^(hi|hello|hey|good\s*(morning|afternoon|evening)|kumusta|magandang)/.test(lower),
    thanks: /thank|salamat|appreciate/.test(lower),
    why: /why|reason|explain|mean|declin|denied|flagged|score/.test(lower),
    improve: /improve|better|tip|fix|help me|what (can|should) i|suggest/.test(lower),
    approve: /approv|chance|odds|likely|qualify|accept/.test(lower),
    dti: /dti|debt.to.income|debt ratio|monthly debt/.test(lower),
    loan: /loan amount|how much|borrow/.test(lower),
    model: /model|kaggle|dataset|machine learning|ml|how (does|do) (this|you)|trained|calculate|algorithm|xgboost/.test(lower),
    factor: /factor|driver|employment|credit history|inquir|delinquen/.test(lower),
    next: /what (happens|now)|next step|how long|timeline|wait|review/.test(lower),
    historical: /historical|kaggle|actual|outcome|defaulted|repaid/.test(lower),
  };
}

export function generateAdvisorReply(
  message: string,
  context: AdvisorContext,
  history: { role: string; content: string }[] = [],
): string {
  const intents = matchIntent(message);

  if (intents.greeting) return greeting(context, history);
  if (intents.thanks) {
    return isAnalystViewer(context)
      ? "Anytime. If you want, I can also generate a short analyst decision note."
      : `You're welcome, ${firstName(context.applicantName)}! If anything else comes up about your application, I'm here.`;
  }
  if (intents.model) return explainModel(context);
  if (intents.dti) return explainDti(context);
  if (intents.historical && kaggleOutcomeFactor(context)) {
    const k = kaggleOutcomeFactor(context)!;
    return `This application is tied to a real record from the Home Credit Kaggle dataset. Historically, this borrower ${k.value?.toLowerCase() === "defaulted" ? "did default on the loan" : "repaid the loan successfully"}.\n\nYour ${tierLabel(context.scoring.riskTier)} tier reflects what our model predicts at application time — ${formatPercent(context.scoring.defaultProbability)} default probability — which isn't always the same as the historical outcome. Both are useful for understanding risk.`;
  }
  if (intents.next) {
    return `${statusExplanation(context)}\n\nIf you have documents ready — payslips, valid ID, proof of billing — having those on hand can speed things up if an officer requests them.`;
  }
  if (intents.approve) return approvalOutlook(context);
  if (intents.improve) {
    const tips = buildImprovementTips(context.scoring.factors);
    if (tips.length === 0) {
      return `Your profile is already in good shape, ${firstName(context.applicantName)}. Keeping stable income and avoiding new debt inquiries will help maintain your low-risk standing.`;
    }
    return `Here's what I'd personally focus on if I were in your shoes, ${firstName(context.applicantName)}:\n\n${tips.map((t, i) => `${i + 1}. ${t}`).join("\n\n")}\n\nEven one or two of these can move you into a better tier on a reapplication.`;
  }
  if (intents.loan) {
    const lti = loanToIncome(context);
    return `You applied for ${formatCurrency(context.loanAmount)} over ${context.loanTermMonths} months, with an annual income of ${formatCurrency(context.annualIncome)}.\n\nThat's ${(lti * 100).toFixed(0)}% of your yearly income — lenders in the Philippines typically like to see unsecured loans stay under 50%. ${lti > 0.5 ? "Yours is above that threshold, which is worth addressing." : "You're within a reasonable range on that measure."}`;
  }
  if (intents.factor || intents.why) return explainScore(context);

  // Follow-up on prior topic
  if (/more|elaborate|detail|that|those/.test(message.toLowerCase()) && history.length > 0) {
    return explainScore(context);
  }

  if (isAnalystViewer(context)) {
    return `I can help with that. Try asking:\n• "Why is this applicant high risk?"\n• "What should I verify before approving?"\n• "Summarize this case for audit notes."\n• "How was this score calculated?"`;
  }
  return `I can help with that, ${firstName(context.applicantName)}. Try asking:\n• "Why did I get this risk score?"\n• "How can I improve my chances?"\n• "What is my debt-to-income ratio?"\n• "How was this calculated?"`;
}

export async function generateAdvisorReplyWithLlm(
  message: string,
  context: AdvisorContext,
  history: { role: string; content: string }[],
): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const dti = debtToIncome(context);
  const kaggle = kaggleOutcomeFactor(context);
  const factorsDetail = context.scoring.factors
    .map((f) => `- ${f.label}: ${f.value ?? "n/a"} (${f.direction} risk)`)
    .join("\n");

  const systemPrompt = `You are Marco, a senior loan advisor at RiskLens, a Philippine fintech lender. You speak warmly and clearly, like a knowledgeable human colleague — not a robot.

RULES:
- Use Philippine Peso (PHP). Be empathetic, honest, and never guarantee approval.
- Reference the applicant's SPECIFIC numbers from their file.
- You can explain the ML model was trained on the Home Credit Default Risk Kaggle dataset (~307k loans).
- Keep responses 2-4 short paragraphs. Use plain text, no markdown bold.
- If viewer role is ANALYST, address the analyst and discuss the applicant in third person.
- If viewer role is APPLICANT, address the applicant directly.

APPLICANT FILE:
Viewer role: ${context.viewerRole ?? "APPLICANT"}
Name: ${context.applicantName}
Age: ${context.age}
Status: ${context.status}
Employment: ${context.employmentType.replace("_", " ")}, ${context.employmentYears} years
Annual income: ${formatCurrency(context.annualIncome)} (monthly ~${formatCurrency(monthlyIncome(context))})
Loan requested: ${formatCurrency(context.loanAmount)} over ${context.loanTermMonths} months
Other monthly debt: ${formatCurrency(context.existingDebt)}
Credit history: ${context.creditHistoryYears} years | Inquiries (12mo): ${context.numCreditInquiries}
Past delinquency: ${context.hasDelinquency ? "Yes" : "No"}
Housing: ${context.homeOwnership}
Purpose: ${context.loanPurpose ?? "Not specified"}
DTI ratio: ~${(dti * 100).toFixed(0)}%

MODEL OUTPUT:
Tier: ${tierLabel(context.scoring.riskTier)}
Default probability: ${formatPercent(context.scoring.defaultProbability)}
Model: ${modelVersionLabel(context.scoring.modelVersion)}
Risk factors:
${factorsDetail}
${kaggle ? `Kaggle historical outcome: ${kaggle.value}` : ""}
${isKaggleRecord(context.email, context.loanPurpose) ? "Note: This is a demo record linked to the Home Credit Kaggle dataset." : ""}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          ...history.slice(-8),
          { role: "user", content: message },
        ],
        temperature: 0.65,
        max_tokens: 600,
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}
