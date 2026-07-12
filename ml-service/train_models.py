"""
AuraFit — Baseline Model Training (Chunk 2)

Trains FOUR separate binary Logistic Regression classifiers, one per
condition, on the 7 lifestyle/demographic features:

    target_heart_attack, target_heart_disease, target_diabetes, target_high_bp

Design decisions (for the dissertation write-up):
  - Logistic Regression baseline: fast, interpretable (coefficients map
    directly to risk factors), and a standard first model to justify any
    later move to something more complex (e.g. Random Forest).
  - class_weight="balanced": the heart targets are ~5% positive, so an
    unweighted model would learn to always predict "no". Balancing makes
    the model pay proportionally more attention to positive cases.
  - Encoding:
      * ordinal (natural order, kept numeric, standardised):
          age_group (1=18-24 … 13=80+), physical_activity_cat
          (1=highly active … 4=inactive), general_health
          (1=Excellent … 5=Poor), bmi (continuous)
      * one-hot (no reliable ordering w.r.t. risk):
          sex, smoking_status, heavy_drinker
  - One 80/20 split stratified on the COMBINATION of all four targets,
    so every target keeps its class balance in both sets and all four
    models are evaluated on the same held-out respondents.

Outputs:
    models/preprocessor.pkl        fitted encoder (reused by FastAPI later)
    models/heart_attack_model.pkl
    models/heart_disease_model.pkl
    models/diabetes_model.pkl
    models/high_bp_model.pkl

Run from ml-service/ with the venv active:
    source venv/bin/activate
    python train_models.py
"""

import os
import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score, confusion_matrix, f1_score,
    precision_score, recall_score, roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import OneHotEncoder, StandardScaler

RANDOM_STATE = 42

DATA_CSV   = os.path.join(os.path.dirname(__file__), "data", "processed",
                          "brfss_2023_model_ready.csv")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
os.makedirs(MODELS_DIR, exist_ok=True)

ORDINAL_FEATURES = ["age_group", "physical_activity_cat", "general_health", "bmi"]
NOMINAL_FEATURES = ["sex", "smoking_status", "heavy_drinker"]
FEATURES = ORDINAL_FEATURES + NOMINAL_FEATURES

TARGETS = {
    "target_heart_attack":  "heart_attack_model.pkl",
    "target_heart_disease": "heart_disease_model.pkl",
    "target_diabetes":      "diabetes_model.pkl",
    "target_high_bp":       "high_bp_model.pkl",
}

# ---------------------------------------------------------------------------
# Load + split
# ---------------------------------------------------------------------------
print(f"Loading {DATA_CSV} …")
df = pd.read_csv(DATA_CSV)
print(f"{len(df):,} rows\n")

X = df[FEATURES]
y = df[list(TARGETS)]

# Stratify on the joint combination of the 4 binary targets (16 possible
# patterns) so each individual target stays balanced in train AND test.
combo = (y["target_heart_attack"].astype(str) + y["target_heart_disease"].astype(str)
         + y["target_diabetes"].astype(str) + y["target_high_bp"].astype(str))
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=combo, random_state=RANDOM_STATE,
)
print(f"Train: {len(X_train):,} rows   Test: {len(X_test):,} rows\n")

# ---------------------------------------------------------------------------
# Preprocessor: fit ONCE on training data, shared by all 4 models,
# saved for the FastAPI endpoint to reuse on new user input.
# ---------------------------------------------------------------------------
preprocessor = ColumnTransformer([
    ("ordinal", StandardScaler(), ORDINAL_FEATURES),
    ("nominal", OneHotEncoder(drop="first", handle_unknown="ignore"), NOMINAL_FEATURES),
])
X_train_enc = preprocessor.fit_transform(X_train)
X_test_enc  = preprocessor.transform(X_test)

preprocessor_path = os.path.join(MODELS_DIR, "preprocessor.pkl")
joblib.dump(preprocessor, preprocessor_path)
print(f"Saved preprocessor → {preprocessor_path}\n")

# ---------------------------------------------------------------------------
# Train + evaluate one Logistic Regression per target
# ---------------------------------------------------------------------------
results = []
for target, model_file in TARGETS.items():
    print("=" * 60)
    print(f"TRAINING: {target}")
    print("=" * 60)

    model = LogisticRegression(
        class_weight="balanced", max_iter=1000, random_state=RANDOM_STATE,
    )
    model.fit(X_train_enc, y_train[target])

    y_pred  = model.predict(X_test_enc)
    y_proba = model.predict_proba(X_test_enc)[:, 1]
    y_true  = y_test[target]

    acc  = accuracy_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred)
    rec  = recall_score(y_true, y_pred)
    f1   = f1_score(y_true, y_pred)
    auc  = roc_auc_score(y_true, y_proba)
    cm   = confusion_matrix(y_true, y_pred)

    print(f"Accuracy : {acc:.3f}")
    print(f"Precision: {prec:.3f}")
    print(f"Recall   : {rec:.3f}")
    print(f"F1       : {f1:.3f}")
    print(f"ROC-AUC  : {auc:.3f}")
    print("Confusion matrix [rows=actual 0/1, cols=predicted 0/1]:")
    print(f"   TN={cm[0,0]:>7,}  FP={cm[0,1]:>7,}")
    print(f"   FN={cm[1,0]:>7,}  TP={cm[1,1]:>7,}")

    model_path = os.path.join(MODELS_DIR, model_file)
    joblib.dump(model, model_path)
    print(f"Saved → {model_path}\n")

    results.append({
        "target": target.replace("target_", ""),
        "accuracy": acc, "precision": prec,
        "recall": rec, "f1": f1, "roc_auc": auc,
    })

# ---------------------------------------------------------------------------
# Side-by-side summary
# ---------------------------------------------------------------------------
print("=" * 60)
print("BASELINE SUMMARY — Logistic Regression, class_weight='balanced'")
print("=" * 60)
summary = pd.DataFrame(results).set_index("target")
print(summary.round(3).to_string())
print("\nNote: with balanced class weights, accuracy drops on rare targets")
print("because the model no longer defaults to 'no' — judge the heart")
print("models on recall/ROC-AUC, not accuracy.")
