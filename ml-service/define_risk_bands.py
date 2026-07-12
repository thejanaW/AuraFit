"""
AuraFit — Risk Band Definition & Validation (Chunk 2)

Converts each condition model's raw predicted probability into a
Low / Moderate / High risk band, with cutoffs derived from the test set's
own probability distribution (terciles), and validates that the bands
genuinely separate risk before they get wired into the FastAPI endpoint.

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
  condition's own distribution. "You are in the top third of predicted
  risk for this condition" is a defensible, distribution-aware statement;
  "your balanced-model probability crossed 30%" is not.

Outputs:
    models/risk_band_thresholds.json
        {condition: {"low_upper": p33, "moderate_upper": p66}}
    A band is assigned as:
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

# ---------------------------------------------------------------------------
# Per condition: tercile cutoffs + band validation
# ---------------------------------------------------------------------------
thresholds = {}
for target, condition in TARGETS.items():
    model = joblib.load(os.path.join(MODELS_DIR, f"{condition}_model.pkl"))
    proba = model.predict_proba(X_test_enc)[:, 1]
    y_true = y_test[target].to_numpy()

    p33, p66 = np.percentile(proba, [33.33, 66.67])
    thresholds[condition] = {
        "low_upper": round(float(p33), 6),
        "moderate_upper": round(float(p66), 6),
    }

    bands = np.where(proba <= p33, "Low",
             np.where(proba <= p66, "Moderate", "High"))

    print("=" * 62)
    print(f"{condition.upper()}  (test-set prevalence: {y_true.mean():.1%})")
    print("=" * 62)
    print(f"Cutoffs: Low <= {p33:.3f} < Moderate <= {p66:.3f} < High")
    print(f"{'Band':<10} {'% of test set':>14} {'actually diagnosed':>20}")
    print("-" * 48)
    for band in ["Low", "Moderate", "High"]:
        mask = bands == band
        share = mask.mean()
        actual = y_true[mask].mean()
        print(f"{band:<10} {share:>13.1%} {actual:>19.1%}")
    print()

# ---------------------------------------------------------------------------
# Save thresholds for the FastAPI endpoint
# ---------------------------------------------------------------------------
with open(OUT_JSON, "w") as f:
    json.dump(thresholds, f, indent=2)
print(f"Saved thresholds → {OUT_JSON}")
