"""
Train credit risk model on Home Credit Default Risk (application_train.csv).
Download from: https://www.kaggle.com/competitions/home-credit-default-risk/data
Place application_train.csv in ml/data/
"""
from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.metrics import classification_report, roc_auc_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBClassifier

DATA_PATH = Path(__file__).parent / "data" / "application_train.csv"
MODEL_DIR = Path(__file__).parent / "models"
SAMPLE_SIZE = 50_000

# Map Home Credit columns to RiskLens application fields for inference alignment
FEATURE_COLUMNS = [
    "AGE_YEARS",
    "AMT_INCOME_TOTAL",
    "AMT_CREDIT",
    "AMT_ANNUITY",
    "CNT_CHILDREN",
    "DAYS_EMPLOYED",
    "EXT_SOURCE_1",
    "EXT_SOURCE_2",
    "EXT_SOURCE_3",
    "NAME_INCOME_TYPE",
    "NAME_HOUSING_TYPE",
]


def load_data() -> pd.DataFrame:
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"Missing {DATA_PATH}. Download application_train.csv from Kaggle Home Credit Default Risk."
        )
    df = pd.read_csv(DATA_PATH, nrows=SAMPLE_SIZE)
    df["AGE_YEARS"] = (-df["DAYS_BIRTH"] / 365.25).astype(int)
    df["DAYS_EMPLOYED"] = df["DAYS_EMPLOYED"].replace(365243, np.nan)
    return df


def build_pipeline(X: pd.DataFrame) -> Pipeline:
    numeric = X.select_dtypes(include=[np.number]).columns.tolist()
    categorical = X.select_dtypes(exclude=[np.number]).columns.tolist()

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", SimpleImputer(strategy="median"), numeric),
            (
                "cat",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("encoder", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                categorical,
            ),
        ]
    )

    model = XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.08,
        scale_pos_weight=8,
        eval_metric="auc",
        random_state=42,
    )

    return Pipeline([("prep", preprocessor), ("model", model)])


def main() -> None:
    df = load_data()
    X = df[FEATURE_COLUMNS]
    y = df["TARGET"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    pipeline = build_pipeline(X_train)
    pipeline.fit(X_train, y_train)

    proba = pipeline.predict_proba(X_test)[:, 1]
    auc = roc_auc_score(y_test, proba)
    preds = (proba >= 0.35).astype(int)

    print(f"Test AUC: {auc:.4f}")
    print(classification_report(y_test, preds))

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, MODEL_DIR / "credit_risk_model.joblib")

    metadata = {
        "model_version": "risklens-xgb-homecredit-v1",
        "test_auc": round(float(auc), 4),
        "feature_columns": FEATURE_COLUMNS,
        "thresholds": {"medium": 0.18, "high": 0.35},
    }
    (MODEL_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2))
    print(f"Model saved to {MODEL_DIR}")


if __name__ == "__main__":
    main()
