"""
BRFSS 2023 — Model-Ready Dataset Builder

Takes the trimmed CSV (brfss_2023_trimmed.csv) and produces the final
feature + target dataset for model training (brfss_2023_model_ready.csv).

What it does, in order:
  1. Drops redundant columns: high_bp (keep high_bp_binary),
     any_physical_activity (keep physical_activity_cat)
  2. Drops rows with missing bmi_x100, creates clean bmi = bmi_x100 / 100
  3. Builds 4 separate binary TARGET columns from the diagnosis columns
     (these are labels only — never model input features)
  4. Cleans don't-know/refused codes out of the 7 FEATURE columns
  5. Saves 7 features + 4 targets, prints a summary with class balance

Target recoding logic (BRFSS 2023 codebook):
  target_heart_attack  (CVDINFR4): 1=Yes → 1, 2=No → 0, 7/9 (DK/refused) → dropped
  target_heart_disease (CVDCRHD4): 1=Yes → 1, 2=No → 0, 7/9 → dropped
  target_high_bp       (_RFHYPE6): 2=Yes → 1, 1=No → 0, 9 → dropped
  target_diabetes      (DIABETE4): 4 categories, grouped as:
      1 (Yes)                → 1   diagnosed diabetes
      4 (Pre-diabetic)       → 1   included as positive because the AuraFit
                                   onboarding form asks "diabetes/pre-diabetes
                                   diagnosis (Y/N)" as a single question, and
                                   pre-diabetes is a clinically meaningful
                                   elevated-risk state the app should flag
      3 (No)                 → 0
      2 (Gestational only)   → 0   pregnancy-only diabetes is conventionally
                                   not treated as a current diagnosis
      7/9 (DK/refused)       → dropped

Run from ml-service/ with the venv active:
    source venv/bin/activate
    python data/build_model_ready.py
"""

import os
import numpy as np
import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
PROCESSED_DIR = os.path.join(os.path.dirname(__file__), "processed")
IN_CSV  = os.path.join(PROCESSED_DIR, "brfss_2023_trimmed.csv")
OUT_CSV = os.path.join(PROCESSED_DIR, "brfss_2023_model_ready.csv")

FEATURE_COLS = [
    "age_group", "sex", "bmi", "physical_activity_cat",
    "smoking_status", "heavy_drinker", "general_health",
]
TARGET_COLS = [
    "target_heart_attack", "target_heart_disease",
    "target_diabetes", "target_high_bp",
]

print(f"Loading {IN_CSV} …")
df = pd.read_csv(IN_CSV)
n_start = len(df)
print(f"Loaded {n_start:,} rows\n")

# ---------------------------------------------------------------------------
# 1. Drop redundant columns
# ---------------------------------------------------------------------------
df = df.drop(columns=["high_bp", "any_physical_activity"])
print("Dropped redundant columns: high_bp, any_physical_activity")

# ---------------------------------------------------------------------------
# 2. Drop missing BMI, create clean bmi column
# ---------------------------------------------------------------------------
n_before = len(df)
df = df.dropna(subset=["bmi_x100"])
print(f"Dropped {n_before - len(df):,} rows with missing BMI "
      f"({100 * (n_before - len(df)) / n_before:.1f}%)")
df["bmi"] = df["bmi_x100"] / 100

# ---------------------------------------------------------------------------
# 3. Build the 4 binary target columns (labels, NOT input features)
#    Any code not in the map (7/9 DK/refused, or missing) becomes NaN
#    and the row is dropped below.
# ---------------------------------------------------------------------------
df["target_heart_attack"]  = df["heart_attack_hx"].map({1: 1, 2: 0})
df["target_heart_disease"] = df["heart_disease_hx"].map({1: 1, 2: 0})
df["target_high_bp"]       = df["high_bp_binary"].map({2: 1, 1: 0})
# DIABETE4 grouping — see module docstring for the rationale
df["target_diabetes"]      = df["diabetes"].map({1: 1, 4: 1, 3: 0, 2: 0})

n_before = len(df)
df = df.dropna(subset=TARGET_COLS)
print(f"Dropped {n_before - len(df):,} rows with don't-know/refused/missing "
      f"in any diagnosis column ({100 * (n_before - len(df)) / n_before:.1f}%)")

# ---------------------------------------------------------------------------
# 4. Clean don't-know/refused codes out of the feature columns
#    (BRFSS uses sentinel codes for missing answers — a "model-ready"
#    file must not contain them as if they were real categories)
# ---------------------------------------------------------------------------
FEATURE_INVALID_CODES = {
    "age_group":             [14],      # _AGEG5YR: 14 = DK/refused/missing
    "physical_activity_cat": [9],       # _PACAT3:  9  = DK/refused/missing
    "smoking_status":        [9],       # _SMOKER3: 9  = DK/refused
    "heavy_drinker":         [9],       # _RFDRHV8: 9  = DK/refused/missing
    "general_health":        [7, 9],    # GENHLTH:  7 = DK, 9 = refused
}
for col, codes in FEATURE_INVALID_CODES.items():
    df[col] = df[col].replace(codes, np.nan)

n_before = len(df)
df = df.dropna(subset=FEATURE_COLS)
print(f"Dropped {n_before - len(df):,} rows with don't-know/refused/missing "
      f"in any feature column ({100 * (n_before - len(df)) / n_before:.1f}%)")

# ---------------------------------------------------------------------------
# 5. Save final dataset: 7 features + 4 targets
# ---------------------------------------------------------------------------
final = df[FEATURE_COLS + TARGET_COLS].copy()
for col in TARGET_COLS:
    final[col] = final[col].astype(int)
final.to_csv(OUT_CSV, index=False)

# ---------------------------------------------------------------------------
# 6. Summary
# ---------------------------------------------------------------------------
print()
print("=" * 55)
print("MODEL-READY DATASET SUMMARY")
print("=" * 55)
print(f"Saved → {OUT_CSV}")
print(f"Final rows : {len(final):,}  "
      f"(of {n_start:,} in trimmed file — {100 * len(final) / n_start:.1f}% retained)")
print(f"Features   : {', '.join(FEATURE_COLS)}")
print()
print("Target class balance (% positive):")
print("-" * 55)
for col in TARGET_COLS:
    pos = final[col].sum()
    print(f"  {col:<22} {100 * pos / len(final):5.1f}% positive  ({pos:,} of {len(final):,})")
