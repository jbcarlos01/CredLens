"""
Download Home Credit Default Risk application_train.csv from HuggingFace
(mirror of the Kaggle competition dataset).
"""
from __future__ import annotations

from pathlib import Path

from datasets import load_dataset

OUT = Path(__file__).parent.parent / "data" / "application_train.csv"


def main() -> None:
    if OUT.exists():
        print(f"Already exists: {OUT}")
        return

    OUT.parent.mkdir(parents=True, exist_ok=True)
    print("Downloading Home Credit application_train from HuggingFace...")
    ds = load_dataset(
        "mohameddhameem/home-credit-default-risk",
        "application_train_dated",
        split="train",
    )
    ds.to_csv(str(OUT))
    print(f"Saved {len(ds):,} rows to {OUT}")


if __name__ == "__main__":
    main()
