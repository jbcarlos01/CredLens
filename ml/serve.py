"""
FastAPI inference service for RiskLens AI.
Falls back to heuristic scoring when no trained model is present.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

import joblib
import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

MODEL_PATH = Path(__file__).parent / "models" / "credit_risk_model.joblib"
META_PATH = Path(__file__).parent / "models" / "metadata.json"

app = FastAPI(title="RiskLens ML Service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

pipeline = None
metadata: dict = {"model_version": "risklens-heuristic-fallback", "thresholds": {"medium": 0.18, "high": 0.35}}


class ApplicationInput(BaseModel):
    applicantName: str
    email: str
    age: int
    employmentType: str
    employmentYears: float
    annualIncome: float
    loanAmount: float
    loanTermMonths: int
    existingDebt: float
    creditHistoryYears: float
    numCreditInquiries: int
    hasDelinquency: bool
    homeOwnership: str
    loanPurpose: str | None = None


class HomeCreditRowInput(BaseModel):
    """Raw Home Credit CSV columns for accurate Kaggle import scoring."""
    DAYS_BIRTH: float
    DAYS_EMPLOYED: float
    AMT_INCOME_TOTAL: float
    AMT_CREDIT: float
    AMT_ANNUITY: float
    CNT_CHILDREN: float = 0
    EXT_SOURCE_1: float | None = None
    EXT_SOURCE_2: float | None = None
    EXT_SOURCE_3: float | None = None
    NAME_INCOME_TYPE: str = "Working"
    NAME_HOUSING_TYPE: str = "Rented apartment"


class RiskFactor(BaseModel):
    feature: str
    label: str
    impact: float
    direction: Literal["increases", "decreases"]
    value: str | None = None


class ScoringResult(BaseModel):
    defaultProbability: float
    riskTier: Literal["LOW", "MEDIUM", "HIGH"]
    modelVersion: str
    factors: list[RiskFactor]


def tier_from_probability(prob: float) -> str:
    thresholds = metadata.get("thresholds", {"medium": 0.18, "high": 0.35})
    if prob >= thresholds["high"]:
        return "HIGH"
    if prob >= thresholds["medium"]:
        return "MEDIUM"
    return "LOW"


def compute_metrics(data: ApplicationInput) -> tuple[float, float]:
    monthly_income = max(data.annualIncome / 12, 1)
    monthly_payment = data.loanAmount / max(data.loanTermMonths, 1) + data.loanAmount * 0.005
    dti = (data.existingDebt + monthly_payment) / monthly_income
    loan_to_income = data.loanAmount / max(data.annualIncome, 1)
    return dti, loan_to_income


def apply_business_rule_floor(data: ApplicationInput, probability: float) -> float:
    dti, loan_to_income = compute_metrics(data)
    floor = probability

    if data.employmentType == "UNEMPLOYED":
        floor = max(floor, 0.38)
    if data.employmentType == "PART_TIME" and data.employmentYears < 1:
        floor = max(floor, 0.28)
    if loan_to_income > 1:
        floor = max(floor, 0.48)
    elif loan_to_income > 0.75:
        floor = max(floor, 0.32)
    if dti > 0.7:
        floor = max(floor, 0.45)
    elif dti > 0.5:
        floor = max(floor, 0.28)
    if data.creditHistoryYears < 2:
        floor = max(floor, 0.22)
    if data.hasDelinquency:
        floor = max(floor, 0.4)
    if data.numCreditInquiries > 4:
        floor = max(floor, 0.3)
    if data.employmentType == "UNEMPLOYED" and loan_to_income > 0.8:
        floor = max(floor, 0.55)
    if data.employmentType == "UNEMPLOYED" and dti > 0.6 and loan_to_income > 0.9:
        floor = max(floor, 0.62)

    return round(min(floor, 0.99), 4)


def finalize_application_score(data: ApplicationInput, model_score: ScoringResult, used_ml: bool) -> ScoringResult:
    heuristic = heuristic_score(data)
    probability = (
        max(model_score.defaultProbability, heuristic.defaultProbability)
        if used_ml
        else model_score.defaultProbability
    )
    probability = apply_business_rule_floor(data, probability)
    tier = tier_from_probability(probability)
    version = (
        f"{model_score.modelVersion}+rules"
        if used_ml
        else model_score.modelVersion
    )
    return ScoringResult(
        defaultProbability=probability,
        riskTier=tier,
        modelVersion=version,
        factors=heuristic.factors,
    )


def income_type_label(employment_type: str) -> str:
    mapping = {
        "FULL_TIME": "Working",
        "PART_TIME": "Working",
        "SELF_EMPLOYED": "Self-employed",
        "UNEMPLOYED": "Unemployed",
        "RETIRED": "Pensioner",
    }
    return mapping.get(employment_type, "Working")


def estimate_ext_sources(data: ApplicationInput) -> tuple[float, float, float]:
    dti, loan_to_income = compute_metrics(data)
    ext2 = 0.25 + min(data.creditHistoryYears, 10) * 0.04
    if data.hasDelinquency:
        ext2 -= 0.2
    if data.employmentType == "UNEMPLOYED":
        ext2 -= 0.15
    ext2 = max(0.05, min(0.85, ext2))

    ext3 = 0.75 - data.numCreditInquiries * 0.04 - dti * 0.25
    if data.hasDelinquency:
        ext3 -= 0.15
    ext3 = max(0.05, min(0.85, ext3))

    ext1 = np.nan
    return ext1, ext2, ext3


def employment_days(data: ApplicationInput) -> float:
    if data.employmentType == "UNEMPLOYED":
        return np.nan
    return -min(data.employmentYears, 40) * 365


def home_credit_row_to_features(data: HomeCreditRowInput) -> dict:
    days_employed = data.DAYS_EMPLOYED
    if days_employed == 365243:
        days_employed = np.nan
    return {
        "AGE_YEARS": int(abs(data.DAYS_BIRTH) / 365.25),
        "AMT_INCOME_TOTAL": data.AMT_INCOME_TOTAL,
        "AMT_CREDIT": data.AMT_CREDIT,
        "AMT_ANNUITY": data.AMT_ANNUITY,
        "CNT_CHILDREN": data.CNT_CHILDREN,
        "DAYS_EMPLOYED": days_employed,
        "EXT_SOURCE_1": data.EXT_SOURCE_1 if data.EXT_SOURCE_1 is not None else np.nan,
        "EXT_SOURCE_2": data.EXT_SOURCE_2 if data.EXT_SOURCE_2 is not None else np.nan,
        "EXT_SOURCE_3": data.EXT_SOURCE_3 if data.EXT_SOURCE_3 is not None else np.nan,
        "NAME_INCOME_TYPE": data.NAME_INCOME_TYPE,
        "NAME_HOUSING_TYPE": data.NAME_HOUSING_TYPE,
    }


def predict_probability_from_row(row: dict) -> float:
    import pandas as pd

    return float(pipeline.predict_proba(pd.DataFrame([row]))[0, 1])


def sigmoid(x: float) -> float:
    return float(1 / (1 + np.exp(-x)))


def heuristic_score(data: ApplicationInput) -> ScoringResult:
    dti, loan_to_income = compute_metrics(data)

    inquiry_pressure = min(data.numCreditInquiries / 6, 1)
    employment_score = (
        1.0
        if data.employmentType == "UNEMPLOYED"
        else 0.55
        if data.employmentType == "PART_TIME"
        else 0.35
        if data.employmentType == "SELF_EMPLOYED"
        else 0.1
    )
    credit_history_gap = max(0, 5 - data.creditHistoryYears) / 5

    logit = -2.4
    logit += dti * 2.8
    logit += loan_to_income * 1.6
    logit += inquiry_pressure * 0.9
    logit += employment_score * 1.1
    logit += credit_history_gap * 0.8
    logit += 1.4 if data.hasDelinquency else 0
    logit += 0.35 if data.age < 21 or data.age > 70 else -0.15
    logit += 0.2 if data.homeOwnership == "RENT" else -0.1
    logit -= min(data.employmentYears, 10) * 0.08

    prob = round(sigmoid(logit), 4)
    tier = tier_from_probability(prob)

    factors = [
        RiskFactor(
            feature="debt_to_income",
            label="Debt-to-income ratio",
            impact=round(dti * 0.35, 3),
            direction="increases" if dti > 0.4 else "decreases",
            value=f"{dti * 100:.1f}%",
        ),
        RiskFactor(
            feature="loan_to_income",
            label="Loan amount vs annual income",
            impact=round(loan_to_income * 0.25, 3),
            direction="increases" if loan_to_income > 0.5 else "decreases",
            value=f"{loan_to_income * 100:.0f}% of income",
        ),
        RiskFactor(
            feature="credit_history",
            label="Credit history length",
            impact=round(credit_history_gap * 0.2, 3),
            direction="increases" if data.creditHistoryYears < 3 else "decreases",
            value=f"{data.creditHistoryYears} years",
        ),
        RiskFactor(
            feature="employment_stability",
            label="Employment stability",
            impact=round(employment_score * 0.2, 3),
            direction="increases" if employment_score > 0.3 else "decreases",
            value=f"{data.employmentYears} yrs, {data.employmentType.replace('_', ' ').lower()}",
        ),
        RiskFactor(
            feature="credit_inquiries",
            label="Recent credit inquiries",
            impact=round(inquiry_pressure * 0.15, 3),
            direction="increases" if data.numCreditInquiries > 2 else "decreases",
            value=str(data.numCreditInquiries),
        ),
    ]
    if data.hasDelinquency:
        factors.append(
            RiskFactor(
                feature="delinquency",
                label="Past delinquency",
                impact=0.28,
                direction="increases",
                value="Yes",
            )
        )
    factors.sort(key=lambda f: f.impact, reverse=True)

    return ScoringResult(
        defaultProbability=prob,
        riskTier=tier,
        modelVersion=metadata.get("model_version", "risklens-heuristic-fallback"),
        factors=factors[:5],
    )


@app.on_event("startup")
def load_model() -> None:
    global pipeline, metadata
    if META_PATH.exists():
        metadata = json.loads(META_PATH.read_text())
    if MODEL_PATH.exists():
        pipeline = joblib.load(MODEL_PATH)


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": pipeline is not None}


@app.post("/predict", response_model=ScoringResult)
def predict(data: ApplicationInput) -> ScoringResult:
    if pipeline is None:
        return heuristic_score(data)

    monthly_annuity = data.loanAmount / max(data.loanTermMonths, 1)
    ext1, ext2, ext3 = estimate_ext_sources(data)
    row = {
        "AGE_YEARS": data.age,
        "AMT_INCOME_TOTAL": data.annualIncome,
        "AMT_CREDIT": data.loanAmount,
        "AMT_ANNUITY": monthly_annuity,
        "CNT_CHILDREN": 0,
        "DAYS_EMPLOYED": employment_days(data),
        "EXT_SOURCE_1": ext1,
        "EXT_SOURCE_2": ext2,
        "EXT_SOURCE_3": ext3,
        "NAME_INCOME_TYPE": income_type_label(data.employmentType),
        "NAME_HOUSING_TYPE": "House / apartment"
        if data.homeOwnership in {"OWN", "MORTGAGE"}
        else "Rented apartment",
    }

    prob = predict_probability_from_row(row)
    model_score = ScoringResult(
        defaultProbability=round(prob, 4),
        riskTier=tier_from_probability(prob),
        modelVersion=metadata.get("model_version", "risklens-xgb"),
        factors=[],
    )
    return finalize_application_score(data, model_score, used_ml=True)


@app.post("/predict/home-credit", response_model=ScoringResult)
def predict_home_credit(data: HomeCreditRowInput) -> ScoringResult:
    """Score using raw Home Credit CSV fields (for Kaggle import)."""
    if pipeline is None:
        prob = 0.25
        tier = tier_from_probability(prob)
        return ScoringResult(
            defaultProbability=prob,
            riskTier=tier,
            modelVersion="risklens-heuristic-fallback",
            factors=[],
        )

    row = home_credit_row_to_features(data)
    prob = predict_probability_from_row(row)
    tier = tier_from_probability(prob)

    return ScoringResult(
        defaultProbability=round(prob, 4),
        riskTier=tier,
        modelVersion=metadata.get("model_version", "risklens-xgb"),
        factors=[
            RiskFactor(
                feature="amt_credit",
                label="Loan amount (AMT_CREDIT)",
                impact=round(min(data.AMT_CREDIT / max(data.AMT_INCOME_TOTAL, 1), 1) * 0.3, 3),
                direction="increases",
                value=f"{data.AMT_CREDIT:,.0f}",
            ),
            RiskFactor(
                feature="ext_source",
                label="External credit score (EXT_SOURCE)",
                impact=0.2,
                direction="decreases" if (data.EXT_SOURCE_2 or 0.5) > 0.4 else "increases",
                value=f"{(data.EXT_SOURCE_2 or 0):.2f}",
            ),
        ],
    )
