"""
AuraFit — ML Microservice (Chunk 2)

FastAPI app serving per-condition health risk predictions from the four
trained Logistic Regression models.

Endpoints:
    GET  /health   — liveness check for the Node.js backend
    POST /predict  — lifestyle inputs → per-condition risk bands + overall score

All model artifacts (4 models, preprocessor, risk band thresholds) are
loaded ONCE at startup, not per request.

Run locally from ml-service/ with the venv active:
    source venv/bin/activate
    uvicorn main:app --reload --port 8000
"""

import json
import os
from typing import Dict, Literal

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

# Feature order must match training (train_models.py)
ORDINAL_FEATURES = ["age_group", "physical_activity_cat", "general_health", "bmi"]
NOMINAL_FEATURES = ["sex", "smoking_status", "heavy_drinker"]
FEATURES = ORDINAL_FEATURES + NOMINAL_FEATURES

CONDITIONS = ["heart_attack", "heart_disease", "diabetes", "high_bp"]

# ---------------------------------------------------------------------------
# Age-sensitive risk bands (Chunk 3 revision — dissertation reference)
#
# 4 buckets rather than the 13 BRFSS bands: the data-sufficiency check
# (scratchpad/age_sufficiency_check.py) showed the 4 buckets already carry
# most of the age gradient (~19x heart-attack prevalence spread, 0.5% →
# 9.6%), while finer bands leave per-tercile positive counts too thin to
# validate — e.g. only 45 heart-disease positives in the whole 25-29 band.

# ---------------------------------------------------------------------------
AGE_GROUP_TO_BUCKET = {
    1: "18-34", 2: "18-34", 3: "18-34",
    4: "35-49", 5: "35-49", 6: "35-49",
    7: "50-64", 8: "50-64", 9: "50-64",
    10: "65+", 11: "65+", 12: "65+", 13: "65+",
}

# ---------------------------------------------------------------------------
# Overall health score:
# 1. Convert each condition's raw probability into a 0-1 risk index, scaled
#    using that condition's own tercile thresholds (low_upper→1/3, moderate_upper→2/3)
#    so all four conditions land on the same comparable scale.
# 2. Weighted average: heart_attack 0.30, heart_disease 0.30 (rarer, more severe),
#    diabetes 0.20, high_bp 0.20 (more common, more manageable).
# 3. overall_health_score = round(100 × (1 − weighted_risk)) → 100 = lowest risk.
# ---------------------------------------------------------------------------
CONDITION_WEIGHTS = {
    "heart_attack": 0.30,
    "heart_disease": 0.30,
    "diabetes": 0.20,
    "high_bp": 0.20,
}

# ---------------------------------------------------------------------------
# Load artifacts once at startup
# ---------------------------------------------------------------------------
ARTIFACTS: Dict = {}
LOAD_ERROR: str = ""

def load_artifacts() -> None:
    global LOAD_ERROR
    try:
        ARTIFACTS["preprocessor"] = joblib.load(os.path.join(MODELS_DIR, "preprocessor.pkl"))
        for cond in CONDITIONS:
            ARTIFACTS[cond] = joblib.load(os.path.join(MODELS_DIR, f"{cond}_model.pkl"))
        with open(os.path.join(MODELS_DIR, "risk_band_thresholds.json")) as f:
            ARTIFACTS["thresholds"] = json.load(f)
    except Exception as exc:  # missing/corrupt file → keep app up, fail requests clearly
        ARTIFACTS.clear()
        LOAD_ERROR = f"{type(exc).__name__}: {exc}"

load_artifacts()

app = FastAPI(title="AuraFit ML Service", version="1.0.0")

# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------
class LifestyleInput(BaseModel):
    """The 7 model features, using BRFSS category codes (see extract_brfss.py)."""
    age_group: int = Field(ge=1, le=13, description="5-year age band: 1=18-24 … 13=80+")
    sex: Literal[1, 2] = Field(description="1=Male, 2=Female")
    bmi: float = Field(ge=10, le=100, description="Body Mass Index")
    physical_activity_cat: int = Field(ge=1, le=4, description="1=Highly active … 4=Inactive")
    smoking_status: int = Field(ge=1, le=4, description="1=Daily, 2=Some days, 3=Former, 4=Never")
    heavy_drinker: Literal[1, 2] = Field(description="1=No, 2=Yes")
    general_health: int = Field(ge=1, le=5, description="1=Excellent … 5=Poor")

class PredictionResponse(BaseModel):
    overall_health_score: int = Field(ge=0, le=100)
    risk_breakdown: Dict[str, Literal["Low", "Moderate", "High"]]
    # Raw model probabilities — needed by the backend to fill the
    # per-condition float columns in the Supabase `predictions` table.
    # NOTE: inflated by class balancing; for display use the bands.
    raw_probabilities: Dict[str, float]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def probability_to_band(p: float, cutoffs: Dict[str, float]) -> str:
    if p <= cutoffs["low_upper"]:
        return "Low"
    if p <= cutoffs["moderate_upper"]:
        return "Moderate"
    return "High"

def probability_to_risk_index(p: float, cutoffs: Dict[str, float]) -> float:
    """Piecewise-linear map of a raw probability onto a 0-1 population-
    percentile-style scale, anchored at the saved tercile thresholds
    (see weighting comment above)."""
    low, mod = cutoffs["low_upper"], cutoffs["moderate_upper"]
    if p <= low:
        return (p / low) / 3 if low > 0 else 0.0
    if p <= mod:
        return 1 / 3 + ((p - low) / (mod - low)) / 3
    return min(1.0, 2 / 3 + ((p - mod) / (1 - mod)) / 3)

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    if not ARTIFACTS:
        raise HTTPException(status_code=500, detail=f"Model artifacts failed to load: {LOAD_ERROR}")
    return {"status": "ok", "models_loaded": CONDITIONS}

@app.post("/predict", response_model=PredictionResponse)
def predict(inputs: LifestyleInput):
    if not ARTIFACTS:
        raise HTTPException(status_code=500, detail=f"Model artifacts failed to load: {LOAD_ERROR}")

    try:
        row = pd.DataFrame([inputs.model_dump()])[FEATURES]
        X = ARTIFACTS["preprocessor"].transform(row)

        # Bucket-specific thresholds, keyed by the (projected) age bucket
        bucket = AGE_GROUP_TO_BUCKET[inputs.age_group]
        bucket_thresholds = ARTIFACTS["thresholds"][bucket]

        risk_breakdown, raw_probabilities = {}, {}
        weighted_risk = 0.0
        for cond in CONDITIONS:
            p = float(ARTIFACTS[cond].predict_proba(X)[0, 1])
            cutoffs = bucket_thresholds[cond]
            raw_probabilities[cond] = round(p, 4)
            risk_breakdown[cond] = probability_to_band(p, cutoffs)
            weighted_risk += CONDITION_WEIGHTS[cond] * probability_to_risk_index(p, cutoffs)

# --- how the score xx/100 is calculated 
        return PredictionResponse(
            overall_health_score=round(100 * (1 - weighted_risk)),
            risk_breakdown=risk_breakdown,
            raw_probabilities=raw_probabilities,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {type(exc).__name__}: {exc}")
