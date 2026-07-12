# AuraFit — Full Project Context

> Read this file at the start of every Claude Code session before doing anything else.

---

## Project Overview

**AuraFit** is a cross-platform mobile fitness app built as a BSc Computer Science Final Year Project at the University of Bedfordshire. It is a solo developer project with supervisor approval.

**Full project title:** An Integrated Mobile Platform for Long Term Health Risk Prediction and Sustained Behavioural Change Through Gamified Physical Activity Incentives

The app takes user lifestyle inputs, runs them through a trained ML model to predict 5-10 year, per-condition health risk, visualises overall health through a Digital Twin avatar, and motivates action through a gamified habit checklist and a GPS-based location reward system.

---

## Core System Logic (Critical)

1. User completes a 7-step onboarding form (personal details, sleep, diet, exercise, lifestyle, habits, health background)
2. ML model predicts **per-condition risk** (heart attack, heart disease, diabetes, high blood pressure) from a 7-field lifestyle/demographic feature subset — NOT a single combined score
3. Each condition's risk is shown as a **Low/Moderate/High band** (data-driven tercile cutoffs), NOT a raw percentage — chosen deliberately over percentage display, since AuraFit is a motivational gamified app, not a clinical diagnostic tool, and bands avoid the false precision of an inflated raw probability while matching the avatar's tier-based design. This is a documented, justified decision for the dissertation reflective report.
4. An overall health score (0-100) is derived as a weighted summary of the 4 individual risk levels (heart attack 0.30, heart disease 0.30, diabetes 0.20, high BP 0.20 — cardiac conditions weighted higher as rarer/more severe)
5. The avatar's **starting tier at onboarding is based on this real predicted score** (poor score → Level 0, good score → higher tiers) — NOT a fixed starting tier, and tier boundaries/count still to be decided once real score distributions are visible in Chunk 3.
6. After onboarding, the avatar's ongoing growth is driven by habit streaks and app consistency — NOT by continuous re-scoring
7. The system generates a personalised daily habit checklist using Gemini, based on the per-condition risk breakdown PLUS the personalisation-only lifestyle fields (see below)
8. The per-condition risk breakdown (the "possible diseases in 5-10 years" view) is also meant to be directly visible to the user — this is a Chunk 3 UI task, not yet built. Decision needed: shown directly on the Home/Avatar dashboard, or in a separate detail screen one tap away.
9. Completing habits earns points and grows the avatar's progression level
10. GPS reward map is a separate, complementary earning mechanism — users visit pinned locations to claim rewards from local brands, which also earns points
11. Both earning paths (habits + GPS) feed into avatar progression, but avatar progression is tracked **separately** from the ML-predicted health score

**Two distinct values, stored separately:**
- `predicted_health_score` — ML-derived, mostly static, updated only on rare re-assessment
- `avatar_progression_level` — gamified, dynamic, grows with habit streaks/GPS activity

**Critical development path:** Auth → ML risk prediction (per-condition) → Onboarding form collects real data → Avatar renders starting tier from score → Habits + GPS both earn points → Avatar progression grows independently. Each phase unlocks the next.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native with Expo |
| Maps & GPS | React Native Maps + Expo Location |
| Avatar/Animation | Lottie / React Native Skia (SVG-based) |
| Backend API | Node.js with Express |
| ML Microservice | Python with FastAPI + scikit-learn |
| Habit Generation | Gemini API (Google AI Studio) |
| Database | PostgreSQL with PostGIS (via Supabase) |
| Auth | Supabase (JWT-based) |
| Version Control | Git / GitHub (private repo) |
| Design | Figma ("AuraFit — Mobile UI (Uni Project)") — dark theme, #FF5A36 accent, Poppins font |

---

## Monorepo Structure

```
AuraFit/
├── mobile/
│   ├── src/
│   │   ├── components/onboarding/   # StepScreen, OptionPill, FormField, card selectors, sliders, toggles
│   │   ├── context/OnboardingContext.js
│   │   ├── screens/onboarding/      # OnboardingScreen.js (step registry) + steps/Step1Basics.js ... Step7HealthBackground.js
│   │   ├── utils/onboardingPayloads.js   # BRFSS mapping layer
│   │   └── theme.js                 # design tokens (colors, fonts)
├── backend/
│   ├── src/routes/predictions.js
│   ├── src/routes/health-inputs.js
│   └── migrations/
│       ├── 002_predictions_multilabel.sql
│       └── 003_health_inputs_expanded.sql
├── ml-service/
│   ├── data/
│   │   ├── raw/         # gitignored — BRFSS XPT + codebook, not committed
│   │   ├── processed/   # brfss_2023_trimmed.csv, brfss_2023_model_ready.csv
│   │   ├── extract_brfss.py
│   │   └── build_model_ready.py
│   ├── models/           # 4 .pkl models, preprocessor.pkl, risk_band_thresholds.json
│   ├── train_models.py
│   ├── define_risk_bands.py
│   ├── main.py            # FastAPI app: POST /predict, GET /health
│   └── venv/        # gitignored
└── AuraFit_Full_Context.md
```

---

## Five Chunk Build Plan

### Chunk 1 — Foundation & Auth ✅ COMPLETE
Supabase schema with RLS + PostGIS GIST index, JWT auth API, Expo shell with tab navigation, Login/Register screens. Verified end-to-end on iOS simulator.

### Chunk 2 — ML Microservice ✅ COMPLETE

**Dataset:** 2023 BRFSS (CDC), SAS Transport (XPT) format. 433,323 raw respondents → trimmed to 13 relevant columns → cleaned to 297,703 model-ready rows (68.7% retention; dropped rows had missing BMI, unanswered exercise module, or don't-know/refused diagnosis codes — all documented as a dissertation data-prep note, not a red flag).

**Model-training features (7, lifestyle/demographic only):** age_group, sex, bmi, physical_activity_cat, smoking_status, heavy_drinker, general_health

**Sex is binary only (Male/Female)** — no "Other" option and no separate sex-at-birth question. BRFSS SEXVAR is binary, so this keeps every input mapping direct and accurate rather than needing a workaround. Decided deliberately, not a limitation to flag.

**Target labels (4 separate binary columns, multi-label classification):** target_heart_attack (5.4% positive), target_heart_disease (5.7%), target_diabetes (15.9%, includes pre-diabetes), target_high_bp (40.8%) — built FROM diagnosis columns, NEVER used as input features (avoids the model trivially "reading its own answer").

**Fields with no BRFSS equivalent** (sleep hours, fruit/veg intake) moved to personalisation-only, feeding Chunk 3's Gemini habit generation instead of the model. "Family history" reframed as "existing diagnosed heart condition" (BRFSS only captures the respondent's own diagnosis history).

**Models trained:** 4 separate Logistic Regression classifiers (`class_weight="balanced"` given the class imbalance), one per condition. Test-set results (59,541 held-out rows): ROC-AUC 0.78-0.83 across all 4 conditions — a strong result from just 7 self-reported lifestyle features. Precision is low on the two heart targets (~0.13-0.15) as an expected, documented trade-off of class balancing on a ~5%-positive label; recall (~77-79%) and AUC are the headline metrics for this use case, not raw accuracy or precision at the 0.5 threshold.

**Display decision: Low/Moderate/High risk bands, NOT raw percentages.** Raw probabilities are inflated by class balancing (not real-world probabilities), so rather than calibrating them (considered, and viable via `CalibratedClassifierCV`, but not pursued), the team went with data-driven tercile cutoffs per condition (saved in `risk_band_thresholds.json`). Validated: each condition shows a clean monotonic climb in actual diagnosis rate from Low→Moderate→High (e.g. diabetes: 2.5% → 11.9% → 33.3%). This is deliberately justified in the reflective report as the right choice for a motivational, non-clinical app — avoids false precision, matches the avatar's tier-based design.

**Random Forest comparison: deliberately deferred**, not abandoned. Logistic Regression's results are already strong and defensible as a final model; a Random Forest comparison remains a nice-to-have for the evaluation chapter, to be revisited after the full app is built end-to-end. Because the FastAPI endpoint treats the model as a swappable "black box" (same input/output contract regardless of what's inside), adding this later requires no changes to the app, backend, or avatar/habit logic — only a new `.pkl` file and pointing the endpoint at it.

**FastAPI service (`ml-service/main.py`):** POST `/predict` takes the 7 features, returns `overall_health_score` (0-100, weighted percentile-based combination — documented in-code for the dissertation) plus a `risk_breakdown` (Low/Moderate/High per condition) plus `raw_probabilities` (needed only to fill Supabase's float columns; explicitly flagged in the response as balance-inflated and not for UI display). GET `/health` confirms all 4 models loaded. Tested with healthy/high-risk/mixed/garbage-input profiles — all behaved correctly, including clean 422 validation errors.

**Backend integration:** JWT-authed `POST /api/predictions` (in `backend/src/routes/predictions.js`) calls the FastAPI service, distinguishes "service unreachable" (503) from "service errored" (502), inserts the result into Supabase's `predictions` table for the authenticated user. `ML_SERVICE_URL` env var added. Migration `002_predictions_multilabel.sql` rebuilt the table for the 4-target shape (previously had the old Chunk-1 single-score shape).

**Onboarding form — built as 7 steps, all complete and tested end-to-end:**
1. Basics — age, height, weight, gender (Female/Male only)
2. Sleep — hours (slider), sleep quality (1-5)
3. Diet — diet type (4-option cards), water intake, meals per day
4. Movement — exercise frequency (4-option cards, feeds the model via physical_activity_cat), exercise types (multi-select, personalisation-only)
5. Lifestyle — stress level (1-10 slider), work hours/day, screen time
6. Habits — smoking status (4-option cards, feeds the model), alcohol asked as **frequency + typical amount separately** (not a single "drinks per week" number, to avoid forcing infrequent drinkers into awkward fractional input) — the app calculates an estimated weekly average behind the scenes using documented frequency-to-multiplier assumptions, then feeds that into the existing sex-specific heavy-drinker threshold (>14/week men, >7/week women)
7. Health Background — general self-rated health (1-5 slider, feeds the model), three Yes/No diagnosis toggles (existing heart condition, high BP, diabetes/pre-diabetes) — saved to `health_inputs` for completeness but NOT sent to `/predict` (per the feature/target separation rule)

Shared architecture: `StepScreen` wrapper (progress bar, step counter, back button, Continue/Finish button with loading state), `OnboardingContext` (all answers persist across steps, so back navigation never loses data), reusable card-selectors, sliders, pill-tag multi-selects, and Yes/No toggles. `onboardingPayloads.js` is the BRFSS mapping layer — converts raw form answers into the exact coded values the model expects (age bands, BMI calculation, activity categories, smoking categories, calculated heavy-drinker flag, general health rating).

On Step 7 "Finish": submits personalisation-only fields to `POST /api/health-inputs` (backend route + migration `003_health_inputs_expanded.sql`, since the live table had the old Chunk-1 placeholder shape) and the 7 model fields to `POST /api/predictions`, then navigates into the main app.

**Full pipeline tested and confirmed working end-to-end:** real onboarding answers → FastAPI prediction → Supabase storage, via the actual mobile app (not just curl).

**Known TODO (not blocking):** onboarding currently shows on every login; needs a "has this user already onboarded" check (e.g. a `GET /api/predictions/latest` call) before real use — flagged in `AppNavigator.js`.

### Chunk 3 — Avatar & Habit System — NEXT
**Needs:** Chunk 2 complete (✅), Figma designs for Home/Avatar dashboard and habit screens (not yet supplied — check before starting)

**Build:**
- Digital Twin avatar component (Lottie or React Native Skia) — motivational visualisation only, NOT a physical likeness of the user
- Avatar starting tier set from the real predicted health score at onboarding — score-based, not fixed. Exact tier boundaries/count still to be decided once real score distributions are visible.
- **Per-condition risk breakdown display** — the "possible diseases in 5-10 years" view (matches the pre-onboarding walkthrough copy: "AuraFit predicts your 5-10 year health risks"). This data already exists in Supabase from Chunk 2 but has no UI yet. Decision needed: shown directly on the Home/Avatar dashboard, or in a separate detail screen one tap away.
- Subsequent avatar growth driven by habit streaks/app consistency, tracked as a separate `avatar_progression_level` value distinct from `predicted_health_score`
- Personalised daily habit checklist generated via Gemini API, using: the per-condition risk breakdown + personalisation-only fields (sleep quality, diet type, meals/day, water intake, exercise types, stress level, work hours, screen time)
- Gemini prompt should request structured JSON habits; parsing must include try/catch with fallback default habits
- Habit completion logic (marks done, awards points)
- Points stored in Supabase, feeding avatar progression

**Unlocks:** Core gamification loop is live.

### Chunk 4 — GPS Reward Map
**Needs:** Chunk 3 complete, PostGIS enabled in Supabase (already done, plain postgis extension with GIST spatial index)
**Build:** Map screen (React Native Maps), seed reward pins, proximity check (20-30m radius via PostGIS), claim reward API endpoint, points awarded on claim → feeds avatar progression, brand reward display UI.

### Chunk 5 — Polish, Testing & Dissertation
UAT test cases, bug fixes, UI polish to match Figma designs pixel-perfectly, dissertation Chapters 3 and 4 write-up, five diagrams (System Architecture, Use Case, ER/Database Schema, Sequence for ML prediction loop, Avatar State), final submission prep.

---

## Onboarding Health Input Form — Final Field Roles

| Role | Fields |
|---|---|
| **Model-training features** (sent to `/predict`) | Age (→age_group), Height/Weight (→BMI), Gender (→sex, binary only), Exercise frequency (→physical_activity_cat), Smoking status, Calculated heavy-drinker flag (from alcohol frequency × amount), General self-rated health |
| **Used only to build target labels in training data** (not live model inputs) | N/A at prediction time — this only applied during Chunk 2's historical dataset labelling, not to live onboarding answers |
| **Personalisation-only** (saved to `health_inputs`, feed Gemini in Chunk 3, not the ML model) | Sleep hours, Sleep quality, Diet type, Meals per day, Water intake, Exercise types, Stress level, Work hours/day, Screen time, Existing heart condition (Y/N), High BP diagnosis (Y/N), Diabetes diagnosis (Y/N) |

Note: the three diagnosis Yes/No questions in Step 7 are collected and stored for completeness/future use, but are NOT sent to the live `/predict` call, since only `general_health` from that step feeds the model (per the strict feature/target separation established in Chunk 2).

---

## Database Schema (Supabase / PostgreSQL)

### users
id (uuid, pk), email (text, unique), created_at

### health_inputs (rebuilt via migration 003)
id (uuid, pk), user_id (fk), sleep_hours, sleep_quality, diet_type, meals_per_day, water_intake, exercise_frequency, exercise_types (text[]), stress_level, work_hours, screen_time, alcohol_frequency, drinks_per_occasion, smoking_status, existing_heart_condition (bool), high_bp_diagnosis (bool), diabetes_diagnosis (bool), general_health_rating, created_at

### predictions (rebuilt via migration 002)
id (uuid, pk), user_id (fk), predicted_health_score (float, 0-100), heart_attack_risk (float), heart_disease_risk (float), diabetes_risk (float), high_bp_risk (float), risk_breakdown (jsonb — Low/Moderate/High per condition), created_at

### avatar_progression (new table, not yet built — Chunk 3)
id (uuid, pk), user_id (fk), avatar_progression_level (int), updated_at

### habits
id (uuid, pk), user_id (fk), title, completed (bool), date, points_value (int)

### points
id (uuid, pk), user_id (fk), amount (int), source (text: habit/gps), created_at

### reward_pins
id (uuid, pk), brand_name, description, location (geometry, PostGIS point, GIST index), reward_value (int)

---

## Supabase Setup (Already Done)
Project: AuraFit, Asia-Pacific region. RLS enabled on all tables. PostGIS extension enabled with GIST spatial index on `reward_pins.location`.

---

## Design Direction
Dark theme, #FF5A36 accent, Poppins font exclusively. Card-based layout, circular progress rings, bold stat numbers, raised centre tab bar button. Pre-onboarding walkthrough (3 frames: "See your future self" / "Change it with habits" / "Earn real rewards") establishes the core value prop and should inform Chunk 3's tone. Onboarding is 7 steps (expanded from an initial 5-step Figma design after finding 3 model-required fields — smoking, alcohol, general health — had no screens); Steps 6-7 were built without Figma references, matching the established visual pattern (progress bar, step counter, "STEP 0X · CATEGORY" label, card-selectors, sliders, pill buttons).

**Figma MCP note:** generates standalone FigJam files, not new pages within an existing Figma file — manual consolidation needed.

---

## Avatar — Important Framing
The Digital Twin avatar is a **health visualisation tool only** — not a physical likeness of the user. Starting tier is **score-based at onboarding**, not fixed. `predicted_health_score` (ML-derived) and `avatar_progression_level` (gamified) are tracked as two separate values. Health risk predictions are risk indicators, not clinical diagnoses. Always frame avatar changes as reflecting health trends, not predicting appearance.

---

## Development Principles
- Go one step at a time; explain what each step does in plain language
- Raw datasets and virtual environments are never committed to Git (`.gitignore`)
- Build one onboarding step at a time, confirm against design before moving to the next
- RLS policies written alongside each table, not added later

---

## Key Learnings & Principles
- Gemini API is for habit generation only — never a substitute for the built-and-evaluated scikit-learn model, which is the core dissertation requirement
- BRFSS captures the respondent's own condition history, not family history — form fields worded accordingly
- Fields with no BRFSS equivalent belong in the personalisation/habit-generation pipeline, not forced into model training
- Always separate model input features from columns used only to construct target labels, to avoid the model trivially "reading its own answer" — this applies at both training time (target columns) and live prediction time (diagnosis Yes/No answers collected but not sent to `/predict`)
- Raw probabilities from class-balanced models are inflated relative to true prevalence — don't display them directly; use percentile-based bands or calibration, and justify the choice explicitly for the dissertation
- Keep the ML model "swappable" behind a stable API contract (same input/output shape) — makes future model comparisons (e.g. Random Forest) a drop-in change, not a system rework
- When a UX choice would force awkward user input (e.g. fractional "drinks per week" for infrequent drinkers), split into frequency + amount and calculate the derived value in code, documenting the assumption for the dissertation
- Binary-only fields (like BRFSS's sex variable) are more defensible when the app's own input matches the dataset's actual categories directly, rather than introducing a mapping workaround for an option the source data can't represent
- Use `npx expo` rather than global expo-cli; clear Expo cache (`--clear`) after `.env` changes; `Cmd+R` or `r` in terminal reloads the app without a full restart — only needed for `.env`/native dependency changes
- Git incident precedent: raw datasets accidentally committed can be undone via `git reset --soft HEAD~1` before pushing, followed by proper `.gitignore` entries

---

## Methodology
Agile — five iterative sprints. Dissertation writing runs in parallel from Sprint 3 onward.

---

## Tools in Use
Claude Code (VS Code), Supabase (DB/auth/PostGIS), Expo/npx expo, eas-cli, Homebrew + Node 18.20.8 (Mac, Apple Silicon), Figma (UI + dissertation diagrams), GitHub (private repo), BRFSS 2023 (CDC, ML training data), Gemini API (Chunk 3 habit generation).

---

## Current Status

**Chunk 1:** Complete.
**Chunk 2:** Complete. Dataset, 4 trained models, FastAPI service, backend integration, and full 7-step onboarding form all built and tested end-to-end — real onboarding answers now flow through to a stored prediction via the actual mobile app.

**Next action:** Begin Chunk 3 (Avatar & Habit System). Check for Figma designs of the Home/Avatar dashboard and habit checklist screens before starting. First decision needed: where the per-condition risk breakdown ("5-10 year disease risk" view) is displayed — on the main dashboard or a separate detail screen.