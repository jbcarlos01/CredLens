"""Create a stratified sample from Home Credit for dashboard import."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

DATA_PATH = Path(__file__).parent.parent / "data" / "application_train.csv"
OUT_PATH = Path(__file__).parent.parent / "data" / "import_sample.csv"
SAMPLE_DEFAULT = 15
SAMPLE_REPAID = 35


def main() -> None:
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Missing {DATA_PATH}. Run: npm run ml:download")

    df = pd.read_csv(DATA_PATH)
    repaid = df[df["TARGET"] == 0].sample(SAMPLE_REPAID, random_state=42)
    defaulted = df[df["TARGET"] == 1].sample(SAMPLE_DEFAULT, random_state=42)
    sample = pd.concat([repaid, defaulted]).sample(frac=1, random_state=42)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    sample.to_csv(OUT_PATH, index=False)
    print(f"Wrote {len(sample)} rows to {OUT_PATH}")


if __name__ == "__main__":
    main()
