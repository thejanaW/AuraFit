"""
AuraFit — Age-Sensitive Risk Band Definition & Validation (Chunk 3 revision)

Converts each condition model's raw predicted probability into a
Low / Moderate / High risk band, with tercile cutoffs derived from the test
set's own probability distribution — now computed SEPARATELY within four
life-stage age buckets (16 threshold sets: 4 buckets × 4 conditions),
replacing the original 4 global sets.

Why percentile-based cutoffs instead of fixed ones (e.g. <10% / 10-30% / 30%+):
  The four models were trained with class_weight="balanced", which
  deliberately re-weights the rare positive class so the model doesn't
  learn to always predict "no". A side effect is that the predicted
  probabilities are shifted upward relative to true population prevalence
  — e.g. heart attack probabilities average far above the real ~5%
  positive rate. Fixed cutoffs chosen on the raw scale would therefore be
  arbitrary twice over: they'd inherit the balancing distortion AND the
  distortion differs per condition (each model's probability scale is
  shifted differently depending on how rare its target is). Percentile
  cutoffs sidestep both problems: they only use the RANKING of
  probabilities (which class balancing preserves — ROC-AUC is unaffected
  by monotonic scale shifts), and they adapt automatically to each
  condition's own distribution.

Why age-sensitive buckets (dissertation methodology note):
  Age dominates the models' learned risk relationships, so global terciles
  mostly rank people by age: nearly every under-35 lands "Low" regardless
  of lifestyle, which defeats a motivational app. Computing terciles WITHIN
  a life-stage bucket makes the band answer "how do you rank against your
  own age peers?", letting lifestyle factors move the band.

Why 4 life-stage buckets rather than the 13 BRFSS _AGEG5YR bands
(data-sufficiency check, scratchpad/age_sufficiency_check.py, 2026-07-16):
  - The 4 buckets already capture most of the age gradient — heart attack
    prevalence spreads ~19x across them (0.5% → 1.5% → 4.9% → 9.6%).
  - Finer bands would be too thin to VALIDATE reliably: the thinnest
    5-year cell (25-29 / heart disease) has only 45 positives in the whole
    dataset — a tercile split of its test-set share leaves near-zero
    positives per band, making the monotonicity check statistically
    fragile. The 4-bucket minimum cell (18-34 / heart disease, 197
    positives) keeps a workable margin.
  - Folding 80+ into 65+ also absorbs the non-monotonic diabetes
    prevalence dip at 80+ (survivorship in cross-sectional data).

Outputs:
    models/risk_band_thresholds.json — nested by bucket, then condition:
        {"18-34": {"heart_attack": {"low_upper": p33, "moderate_upper": p66},
                   ...},
         "35-49": {...}, "50-64": {...}, "65+": {...}}
    A band is assigned (within the requester's age bucket) as:
        p <= low_upper       → Low
        p <= moderate_upper  → Moderate
        otherwise            → High

Run from ml-service/ with the venv active:
    source venv/bin/activate
    python define_risk_bands.py
"""

import json
import os

import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

RANDOM_STATE = 42

BASE_DIR   = os.path.dirname(__file__)
DATA_CSV   = os.path.join(BASE_DIR, "data", "processed", "brfss_2023_model_ready.csv")
MODELS_DIR = os.path.join(BASE_DIR, "models")
OUT_JSON   = os.path.join(MODELS_DIR, "risk_band_thresholds.json")

ORDINAL_FEATURES = ["age_group", "physical_activity_cat", "general_health", "bmi"]
NOMINAL_FEATURES = ["sex", "smoking_status", "heavy_drinker"]
FEATURES = ORDINAL_FEATURES + NOMINAL_FEATURES

TARGETS = {
    "target_heart_attack":  "heart_attack",
    "target_heart_disease": "heart_disease",
    "target_diabetes":      "diabetes",
    "target_high_bp":       "high_bp",
}

# _AGEG5YR bands → life-stage buckets (must stay in sync with main.py)
AGE_GROUP_TO_BUCKET = {
    1: "18-34", 2: "18-34", 3: "18-34",
    4: "35-49", 5: "35-49", 6: "35-49",
    7: "50-64", 8: "50-64", 9: "50-64",
    10: "65+", 11: "65+", 12: "65+", 13: "65+",
}
BUCKET_ORDER = ["18-34", "35-49", "50-64", "65+"]

# ---------------------------------------------------------------------------
# Recreate the EXACT train/test split used in train_models.py:
# same stratification on the joint 4-target combination, same seed.
# ---------------------------------------------------------------------------
print(f"Loading {DATA_CSV} …")
df = pd.read_csv(DATA_CSV)

X = df[FEATURES]
y = df[list(TARGETS)]
combo = (y["target_heart_attack"].astype(str) + y["target_heart_disease"].astype(str)
         + y["target_diabetes"].astype(str) + y["target_high_bp"].astype(str))
_, X_test, _, y_test = train_test_split(
    X, y, test_size=0.2, stratify=combo, random_state=RANDOM_STATE,
)
print(f"Test set: {len(X_test):,} rows (same split as training run)\n")

preprocessor = joblib.load(os.path.join(MODELS_DIR, "preprocessor.pkl"))
X_test_enc = preprocessor.transform(X_test)

# Bucket assignment for every test row (from the raw, pre-encoding age_group)
buckets = X_test["age_group"].map(AGE_GROUP_TO_BUCKET)
print("Test rows per bucket:",
      ", ".join(f"{b}: {(buckets == b).sum():,}" for b in BUCKET_ORDER), "\n")

# ---------------------------------------------------------------------------
# Per condition × bucket: tercile cutoffs + band validation.
# The monotonicity check (actual diagnosis rate climbing Low → Moderate →
# High) must now hold WITHIN each bucket, not just globally — that's the
# whole point of age-sensitive bands.
# ---------------------------------------------------------------------------
thresholds = {bucket: {} for bucket in BUCKET_ORDER}
monotonicity_failures = []

for target, condition in TARGETS.items():
    model = joblib.load(os.path.join(MODELS_DIR, f"{condition}_model.pkl"))
    proba = model.predict_proba(X_test_enc)[:, 1]
    y_true = y_test[target].to_numpy()

    print("=" * 74)
    print(f"{condition.upper()}  (test-set prevalence, all ages: {y_true.mean():.1%})")
    print("=" * 74)

    for bucket in BUCKET_ORDER:
        mask = (buckets == bucket).to_numpy()
        p_bucket = proba[mask]
        y_bucket = y_true[mask]

        p33, p66 = np.percentile(p_bucket, [33.33, 66.67])
        thresholds[bucket][condition] = {
            "low_upper": round(float(p33), 6),
            "moderate_upper": round(float(p66), 6),
        }

        bands = np.where(p_bucket <= p33, "Low",
                 np.where(p_bucket <= p66, "Moderate", "High"))

        print(f"\n  {bucket}  (n={mask.sum():,}, positives={int(y_bucket.sum()):,}, "
              f"prevalence={y_bucket.mean():.1%})")
        print(f"  Cutoffs: Low <= {p33:.3f} < Moderate <= {p66:.3f} < High")
        print(f"  {'Band':<10} {'% of bucket':>12} {'positives':>10} {'actually diagnosed':>20}")
        print("  " + "-" * 56)
        rates = []
        for band in ["Low", "Moderate", "High"]:
            bmask = bands == band
            actual = y_bucket[bmask].mean() if bmask.any() else float("nan")
            rates.append(actual)
            print(f"  {band:<10} {bmask.mean():>11.1%} {int(y_bucket[bmask].sum()):>10,} "
                  f"{actual:>19.1%}")
        if not (rates[0] < rates[1] < rates[2]):
            monotonicity_failures.append((bucket, condition, rates))
            print("  ⚠ NON-MONOTONIC — diagnosis rate does not climb Low → Moderate → High")
    print()

# ---------------------------------------------------------------------------
# Save thresholds for the FastAPI endpoint
# ---------------------------------------------------------------------------
if monotonicity_failures:
    print("WARNING — non-monotonic bucket/condition combinations:")
    for bucket, condition, rates in monotonicity_failures:
        print(f"  {bucket} / {condition}: "
              + " → ".join(f"{r:.1%}" for r in rates))
    print()
else:
    print("All 16 bucket/condition combinations show a clean monotonic "
          "Low → Moderate → High climb.\n")

with open(OUT_JSON, "w") as f:
    json.dump(thresholds, f, indent=2)
print(f"Saved thresholds → {OUT_JSON}")
