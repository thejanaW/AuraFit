"""
AuraFit — Held-out evaluation of the ALREADY-TRAINED models.

Read-only: loads the saved .pkl artifacts in models/ and scores them
against the held-out test rows. Does NOT retrain or overwrite anything.

Reproduces the exact split train_models.py produced (same CSV, same
features, test_size=0.2, same stratify column, same random_state=42),
so the held-out rows here are byte-for-byte the same rows the saved
models never trained on.

Run from ml-service/ with the venv active:
    source venv/bin/activate
    python evaluate_held_out.py
"""

import os
import joblib
import pandas as pd
from sklearn.metrics import (
    accuracy_score, confusion_matrix, f1_score,
    precision_score, recall_score, roc_auc_score,
)
from sklearn.model_selection import train_test_split

RANDOM_STATE = 42
BASE = os.path.dirname(__file__)
DATA_CSV = os.path.join(BASE, "data", "processed", "brfss_2023_model_ready.csv")
MODELS_DIR = os.path.join(BASE, "models")

ORDINAL_FEATURES = ["age_group", "physical_activity_cat", "general_health", "bmi"]
NOMINAL_FEATURES = ["sex", "smoking_status", "heavy_drinker"]
FEATURES = ORDINAL_FEATURES + NOMINAL_FEATURES

TARGETS = {
    "target_heart_attack":  "heart_attack_model.pkl",
    "target_heart_disease": "heart_disease_model.pkl",
    "target_diabetes":      "diabetes_model.pkl",
    "target_high_bp":       "high_bp_model.pkl",
}

df = pd.read_csv(DATA_CSV)
print(f"Loaded {len(df):,} rows from {DATA_CSV}")

X = df[FEATURES]
y = df[list(TARGETS)]

combo = (y["target_heart_attack"].astype(str) + y["target_heart_disease"].astype(str)
         + y["target_diabetes"].astype(str) + y["target_high_bp"].astype(str))
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=combo, random_state=RANDOM_STATE,
)
print(f"Reproduced split -> Train: {len(X_train):,}  Held-out test: {len(X_test):,}\n")

preprocessor = joblib.load(os.path.join(MODELS_DIR, "preprocessor.pkl"))
X_test_enc = preprocessor.transform(X_test)

results = []
for target, model_file in TARGETS.items():
    model = joblib.load(os.path.join(MODELS_DIR, model_file))
    y_true = y_test[target]
    y_pred = model.predict(X_test_enc)
    y_proba = model.predict_proba(X_test_enc)[:, 1]

    acc = accuracy_score(y_true, y_pred)
    prec = precision_score(y_true, y_pred, zero_division=0)
    rec = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    auc = roc_auc_score(y_true, y_proba)
    cm = confusion_matrix(y_true, y_pred)
    positive_rate = y_true.mean()

    print("=" * 62)
    print(f"{target}  (model file: {model_file})")
    print(f"  Positive rate in test set: {positive_rate:.4f} ({int(y_true.sum())}/{len(y_true)})")
    print(f"  Accuracy : {acc:.4f}")
    print(f"  Precision: {prec:.4f}")
    print(f"  Recall   : {rec:.4f}")
    print(f"  F1       : {f1:.4f}")
    print(f"  ROC-AUC  : {auc:.4f}")
    print(f"  Confusion matrix [rows=actual, cols=predicted]: TN={cm[0,0]:,} FP={cm[0,1]:,} FN={cm[1,0]:,} TP={cm[1,1]:,}")
    results.append({"target": target.replace("target_", ""), "n_test": len(y_true),
                     "positive_rate": positive_rate, "accuracy": acc, "precision": prec,
                     "recall": rec, "f1": f1, "roc_auc": auc})

print("\n" + "=" * 62)
print("SUMMARY (held-out test set, N=%d)" % len(X_test))
print("=" * 62)
summary = pd.DataFrame(results).set_index("target")
print(summary.round(4).to_string())
print("\nNote: with class_weight='balanced' (see train_models.py), accuracy is")
print("dragged down on the rare targets by design — judge those on recall/ROC-AUC.")
