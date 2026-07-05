"""
BRFSS 2023 Column Extraction
Loads LLCP2023.XPT, selects health-relevant columns, and saves a trimmed CSV.

Run from ml-service/ with the venv active:
    source venv/bin/activate
    python data/extract_brfss.py
"""

import os
import pandas as pd

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
RAW_DIR = os.path.join(os.path.dirname(__file__), "raw")
OUT_DIR = os.path.join(os.path.dirname(__file__), "processed")
os.makedirs(OUT_DIR, exist_ok=True)

# The XPT file has a trailing space in its filename (as downloaded from CDC).
XPT_FILE = os.path.join(RAW_DIR, "LLCP2023.XPT ")
OUT_CSV  = os.path.join(OUT_DIR, "brfss_2023_trimmed.csv")

# ---------------------------------------------------------------------------
# Column map: BRFSS 2023 variable name → readable column name
#
# NOTES ON WHAT IS MISSING FROM THE 2023 LLCP FILE:
#   - Sleep hours (SLEPTIM1): not present in this distributed file.
#   - Fruit intake (_FRTLT1): not present in this distributed file.
#   - Vegetable intake (_VEGLT1): not present in this distributed file.
#   - "Family history" of heart disease: BRFSS does not collect family history.
#     We use the respondent's own cardiac history (CVDINFR4, CVDCRHD4) instead.
# ---------------------------------------------------------------------------
COLUMN_MAP = {
    # Demographic
    "_AGEG5YR": "age_group",       # 14-level age group (1=18-24 … 13=80+, 14=don't know/refused)
    "SEXVAR":   "sex",             # 1=Male, 2=Female

    # Body metrics
    "_BMI5":    "bmi_x100",        # BMI × 100 (e.g. 2650 = BMI 26.50)

    # Physical activity
    "_PACAT3":  "physical_activity_cat",  # 1=Highly active, 2=Active, 3=Insufficiently active, 4=Inactive
    "_TOTINDA": "any_physical_activity",  # 1=Yes (any activity in past 30 days), 2=No

    # Substance use
    "_SMOKER3":  "smoking_status", # 1=Current every day, 2=Current some days, 3=Former, 4=Never
    "_RFDRHV8":  "heavy_drinker",  # Heavy drinking indicator: 1=No, 2=Yes

    # Chronic conditions
    "BPHIGH6":  "high_bp",         # Ever told had high BP: 1=Yes, 2=Yes during pregnancy, 3=No, 4=Borderline
    "_RFHYPE6": "high_bp_binary",  # Calculated clean binary: 1=No, 2=Yes (excludes pregnancy-only)
    "DIABETE4": "diabetes",        # Told had diabetes: 1=Yes, 2=Yes during pregnancy, 3=No, 4=Pre-diabetic
    "CVDINFR4": "heart_attack_hx", # Ever told had heart attack: 1=Yes, 2=No
    "CVDCRHD4": "heart_disease_hx",# Ever told had coronary heart disease/angina: 1=Yes, 2=No

    # Self-rated health
    "GENHLTH":  "general_health",  # 1=Excellent, 2=Very Good, 3=Good, 4=Fair, 5=Poor
}

BRFSS_COLS = list(COLUMN_MAP.keys())

# ---------------------------------------------------------------------------
# Load
# ---------------------------------------------------------------------------
print(f"Loading {XPT_FILE} …")
print("(This may take a minute — the raw file is ~1.1 GB)\n")

df = pd.read_sas(XPT_FILE, format="xport", encoding="latin-1")

# ---------------------------------------------------------------------------
# Select & rename
# ---------------------------------------------------------------------------
missing_cols = [c for c in BRFSS_COLS if c not in df.columns]
if missing_cols:
    print(f"WARNING: These expected columns were NOT found in the file and will be skipped:\n  {missing_cols}\n")
    BRFSS_COLS = [c for c in BRFSS_COLS if c in df.columns]

df_trim = df[BRFSS_COLS].rename(columns=COLUMN_MAP)

# ---------------------------------------------------------------------------
# Save
# ---------------------------------------------------------------------------
df_trim.to_csv(OUT_CSV, index=False)
print(f"Saved → {OUT_CSV}\n")

# ---------------------------------------------------------------------------
# Summary report
# ---------------------------------------------------------------------------
print("=" * 55)
print("DATASET SUMMARY")
print("=" * 55)
print(f"Rows    : {len(df_trim):,}")
print(f"Columns : {len(df_trim.columns)}")
print()

print("Missing / null values per column:")
print("-" * 55)
null_counts = df_trim.isnull().sum()
for col, count in null_counts.items():
    pct = 100 * count / len(df_trim)
    print(f"  {col:<28} {count:>7,}  ({pct:5.1f}%)")

print()
print("NOTES:")
print("  • bmi_x100 is BMI × 100 (divide by 100 for real BMI)")
print("  • age_group uses BRFSS 5-year bands (1=18-24 … 13=80+)")
print("  • SLEPTIM1 (sleep hours) is absent from this LLCP file")
print("  • _FRTLT1 / _VEGLT1 (fruit/veg) are absent from this LLCP file")
print("  • heart_attack_hx / heart_disease_hx = respondent's OWN history")
print("    (BRFSS does not collect family history of heart disease)")
