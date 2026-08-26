# AuraFit — Full Project Context

> Read this file at the start of every Claude Code session before doing anything else.

---

## Project Overview

**AuraFit** is a cross-platform mobile fitness app built as a BSc Computer Science Final Year Project at the University of Bedfordshire. It is a solo developer project with supervisor approval.

**Full project title:** An Integrated Mobile Platform for Long Term Health Risk Prediction and Sustained Behavioural Change Through Gamified Physical Activity Incentives

The app takes user lifestyle inputs, runs them through a trained ML model to predict a ~10-year, per-condition health risk projection, visualises overall health through a Digital Twin avatar, and motivates action through a gamified, AI-personalised habit checklist and a GPS-based location reward system.

### Project Naming History
Originally proposed and submitted under the working name **"RunReward"** during the Contextual Report / proposal stage (April submission). Later renamed to **"AuraFit"** at some point during development — no specific documented reason for the change, just a rebrand. Worth a brief mention if the dissertation's introduction/background discusses the project's evolution from proposal to final product.

---

## Core System Logic (Critical)

1. User completes a 7-step onboarding form (personal details, sleep, diet, exercise, lifestyle, habits, health background)
2. Before scoring, the user's real age is **projected forward by +10 years** (`RISK_PROJECTION_YEARS = 10` in `onboardingPayloads.js`) when computing `age_group` — every other feature (BMI, exercise, smoking, etc.) uses the person's real current values. This reframes the score as "where you'd land in ~10 years if these habits continued."
3. ML model predicts **per-condition risk** (heart attack, heart disease, diabetes, high blood pressure) from a 7-field lifestyle/demographic feature subset — NOT a single combined score
4. Each condition's risk is shown as a **Low/Moderate/High band**, NOT a raw percentage. Bands are **age-sensitive (peer-relative)**: tercile cutoffs are calculated separately within each of 4 life-stage buckets (18-34, 35-49, 50-64, 65+ — mapped from BRFSS `_AGEG5YR` bands 1-3, 4-6, 7-9, 10-13), not globally. See "Key Findings" below for the full investigation that led here.
5. The overall health score (0-100) uses the **same age-bucket-relative thresholds** as the bands (kept consistent deliberately — a global score next to peer-relative bands would look contradictory). Scores compress toward the middle within a bucket — e.g. a maximally healthy young profile scores ~71, a maximally unhealthy young profile ~31, both within the 18-34 bucket. Scores are not comparable across the methodology change (old test rows were cleared for this reason).
6. **Score reasoning:** alongside habit generation (see point 9), Gemini also generates a short (2-3 sentence) plain-language explanation of why the user's risk breakdown looks the way it does — motivational and factual, explicitly not clinical/alarming, framed as a risk indicator not a diagnosis. Displayed on Home as a "WHY YOUR SCORE LOOKS THIS WAY" card under the risk breakdown.
7. **Risk Breakdown display** is live on the Home dashboard — four cards (Heart Attack, Heart Disease, Diabetes, High Blood Pressure — deliberately relabeled from the Figma design's mismatched categories like "Cardiovascular"/"Mental Wellbeing" to match the model's actual outputs), each showing the band label and a 3-segment colored bar (green/amber/red for Low/Moderate/High).
8. The avatar's **starting tier at onboarding is based on this real predicted score** — NOT a fixed starting tier. Tier boundaries still undecided; must be calibrated against the peer-relative score range once the avatar is built.
9. **Habit generation is fully built and Gemini-powered, with monthly progressive difficulty:**
   - **The first month's set is now generated automatically, right at the end of onboarding** (see point 16 below) — the manual "Generate this month's habits" button on the Habits tab only becomes relevant from the second calendar month onward, when a new month has started and no set exists for it yet
   - Backend gathers: latest prediction (risk_breakdown), health_inputs (personalisation-only fields), and — if a previous month's set exists — that set's habits plus their actual completion rates
   - Sends this to Gemini, which returns exactly 5 habits (title, subtext, points 15-30) plus the score reasoning, as strict JSON (no markdown/preamble)
   - **Progressive difficulty logic, applied per-habit based on the PREVIOUS month's completion rate for that specific habit:** >80% completion → slightly harder version of the same habit (e.g. step count or duration increased modestly); <40% completion → same or easier; moderate (40-80%) → roughly unchanged. Verified working in testing (e.g. a 90%-completed "walk 5,000 steps" became "walk 6,000 steps"; a 27%-completed "drink 2L water" became "drink 1.5 liters")
   - **Fallback system:** if the Gemini call fails for ANY reason (API error/timeout, invalid JSON, missing fields), the backend silently substitutes the original hardcoded 5-habit list from `mobile/src/constants/habits.js` plus a generic reasoning string. This still gets saved as that month's official set, tagged `source: 'fallback'` internally (vs `source: 'gemini'`) so it's distinguishable in the database. A real Gemini capacity outage triggered this fallback path during testing, confirming it works under real conditions.
   - **Known limitation:** because a month "locks in" whatever was generated, a fallback-sourced set persists for the whole month with no automatic retry — the only current fix is manually deleting that month's `habit_sets` row in Supabase to allow regeneration. Worth considering an explicit "regenerate" option for fallback-sourced sets as a future enhancement.
   - A second generate call within the same month correctly returns the existing set (`alreadyExisted: true`) rather than creating duplicates
10. Both Home and the Habits tab read from a shared `HabitsContext` so completion state stays in sync between screens instantly while both are mounted
11. Completing a habit awards its exact points value; un-completing removes the matching points row; duplicate completes don't double-award; unknown habit IDs 404. All verified end-to-end (17/17 checks) against the live backend, Supabase, and real Gemini API.
12. **Streak — built and verified (2026-07-18):** `GET /api/streak` counts consecutive days with at least one habit completed (forgiving definition — not all 5 required), breaking only once a full day has passed with zero completions; today's in-progress state doesn't break the streak prematurely. 90-day lookback bound, UTC date-string arithmetic server-side. Home STREAK card wired to it. E2E verified 9/9 against live backend+Supabase.
13. **Planned enhancement, deliberately deferred (not yet built):** step-count auto-tracking via the phone's built-in pedometer (`expo-sensors` Pedometer API — no ejecting from Expo managed workflow required). Would only auto-verify step-based habits specifically; all other habit types (water, sleep, diet, smoking, etc.) have no phone-sensor equivalent and still need manual completion. Requires physical device testing (iOS Simulator has no real accelerometer). Deferred to Chunk 3 wrap-up or Chunk 5 polish, not built now.
14. After onboarding, avatar progression is meant to be driven by habit streaks and app consistency — NOT by continuous re-scoring. **Avatar progression tracking (points/level system) is deliberately deferred alongside the avatar itself** — will be built together, not separately, since tier boundaries need calibrating against the avatar once it exists.
15. GPS reward map (Chunk 4) is a separate, complementary earning mechanism — not yet started.
16. **Habit generation + score reasoning now fire automatically at the end of onboarding, not only via the manual monthly button (built 2026-08-16):** previously, Home could show an alarming risk breakdown (e.g. "Heart Attack: High") with zero explanation for a first-time user, because the Gemini reasoning was only created whenever the user happened to tap "Generate this month's habits" on the Habits tab. Now, `OnboardingScreen.js`'s Step 7 Finish flow calls the exact same `POST /api/habits/generate` endpoint (no logic duplication — same idempotent-per-month, Gemini-with-fallback code path the manual button uses) immediately after `POST /api/predictions` succeeds, before navigating into the app. The Finish button's loading spinner stays active through health-inputs save → prediction → habit/reasoning generation as one continuous state — no false "done" moment. Because generation is idempotent per calendar month, this first call *is* that month's official set, so the Habits tab's manual button correctly stays hidden until the next month. A failure of the generation call itself (as opposed to a Gemini failure, which the endpoint already absorbs into its fallback) is swallowed client-side rather than blocking onboarding — worst case, Home/Habits just fall back to showing the manual generate prompt, exactly as before this change.

**Two distinct values, stored separately:**
- `predicted_health_score` — ML-derived, mostly static, updated only on rare re-assessment
- `avatar_progression_level` — gamified, dynamic, grows with habit streaks/GPS activity (not yet implemented)

**Critical development path:** Auth → ML risk prediction (per-condition, age-projected, peer-relative) → Onboarding → Home dashboard (score, risk breakdown, reasoning) → Habits (Gemini-generated, monthly progressive) → Streak (done) → GPS rewards (Chunk 4, in progress) → Avatar + avatar progression (deferred).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native with Expo |
| Maps & GPS | React Native Maps + Expo Location (Chunk 4, not started) |
| Avatar/Animation | Deferred — likely short looping video per tier (same solid background color as dashboard to fake transparency), not Lottie/Skia. Not yet built. |
| Step tracking | Planned, deferred — `expo-sensors` Pedometer API |
| Backend API | Node.js with Express |
| ML Microservice | Python with FastAPI + scikit-learn |
| Habit Generation + Score Reasoning | Gemini API (Google Generative AI, Google AI Studio) — fully built, single combined call, with fallback |
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
│   │   ├── components/onboarding/   # StepScreen, OptionPill, FormField, SliderField, card selectors, toggles
│   │   ├── constants/habits.js      # fallback 5-habit list — kept permanently as the Gemini fallback source
│   │   ├── context/
│   │   │   ├── OnboardingContext.js
│   │   │   └── HabitsContext.js     # shared live habit/completion state across Home + Habits tab
│   │   ├── screens/
│   │   │   ├── HomeScreen.js         # score, points, streak (stubbed), trend, risk breakdown, reasoning card, habits
│   │   │   ├── HabitsScreen.js       # full habit checklist + "Generate this month's habits" button
│   │   │   └── onboarding/           # OnboardingScreen.js (step registry) + steps/Step1Basics.js ... Step7Health.js
│   │   ├── utils/onboardingPayloads.js   # BRFSS mapping layer + age projection logic
│   │   └── theme.js                 # design tokens (lightened cards, warning amber token added)
├── backend/
│   ├── src/
│   │   ├── constants/                # backend-side habit fallback reference (mirrors mobile's)
│   │   ├── services/                 # Gemini API integration logic
│   │   └── routes/
│   │       ├── predictions.js        # POST /api/predictions, GET /api/predictions/latest
│   │       ├── health-inputs.js
│   │       ├── points.js             # GET /api/points/total
│   │       └── habits.js             # GET /api/habits/today, POST /api/habits/complete, POST /api/habits/generate
│   └── migrations/
│       ├── 002_predictions_multilabel.sql
│       ├── 003_health_inputs_expanded.sql
│       └── 004_habit_sets.sql        # habit_sets table + habit_item_id reference on habits table
├── ml-service/
│   ├── data/
│   │   ├── raw/         # gitignored
│   │   ├── processed/
│   │   ├── extract_brfss.py
│   │   └── build_model_ready.py
│   ├── scratchpad/age_sufficiency_check.py
│   ├── models/           # 4 .pkl models, preprocessor.pkl, risk_band_thresholds.json (nested by age bucket)
│   ├── train_models.py
│   ├── define_risk_bands.py
│   ├── main.py            # FastAPI app: POST /predict (age-bucket-aware banding), GET /health
│   └── venv/        # gitignored
└── AuraFit_Full_Context.md
```

---

## Five Chunk Build Plan

### Original Work Breakdown Structure vs. Actual Execution
The original planned WBS (from the Contextual Report / proposal) laid out 5 sprints:
1. Infrastructure & Auth
2. ML + Habit Generation (combined into one sprint)
3. Avatar System (its own dedicated sprint)
4. GPS Reward Map
5. Security Layer (JWT hardening, rate limiting, input validation)

**What actually happened diverges in three ways, each worth documenting honestly in the dissertation's methodology/reflection sections:**
- **ML and Habit Generation were split apart in practice.** ML became its own dedicated chunk (Chunk 2), and Habit Generation ended up bundled with the Avatar work instead (Chunk 3) — because habit generation needed the completed risk breakdown as an input, so it couldn't proceed until the ML prediction pipeline existed and was stable. A dependency-driven reordering, not a planning failure.
- **The Avatar**, originally scoped as its own dedicated sprint mid-project, was **deliberately deferred to the very end of development** instead (see "Avatar — Important Framing & Current Plan" below) — tier boundaries needed calibrating against the real peer-relative score range, which wasn't available until the ML + risk-banding work was finished and validated.
- **The planned "Security Layer" sprint (JWT hardening, rate limiting, input validation) was NOT executed as its own dedicated effort.** See "Security Posture" section below for the full audited state as of 2026-08-23.

This is legitimate material for a dissertation's Agile/methodology reflection — plans adapting to real dependency discoveries during iterative development is a normal, defensible outcome, not something to hide.

### Chunk 1 — Foundation & Auth ✅ COMPLETE

### Chunk 2 — ML Microservice ✅ COMPLETE
Dataset (BRFSS 2023, 297,703 model-ready rows), 4 trained Logistic Regression models (ROC-AUC 0.78-0.83), FastAPI service, backend integration, full 7-step onboarding form.

### Chunk 3 — Avatar & Habit System — CORE COMPLETE (avatar itself deliberately deferred)

**Completed:**
- Home dashboard (score + "~10 years" projection subtext, points, trend card, risk breakdown with 4 correctly-labeled condition cards, score reasoning card, habits section)
- Habits tab — fully functional checklist with real persistence, points award/removal, "Generate this month's habits" flow
- Step 7 slider default-value bug fixed (was silently submitting an unanswered "Good" rating)
- +10 year age projection implemented
- Risk bands rebuilt as age-sensitive (4 life-stage buckets) after data-sufficiency analysis — see Key Findings
- General health slider UX improved with descriptive per-value anchors
- **Gemini habit generation, fully built and verified end-to-end (17/17 checks):** monthly progressive difficulty based on real per-habit completion history, combined score reasoning generation, fallback system for Gemini failures (verified against a real capacity outage during testing), `habit_sets` table (migration 004) with `habit_item_id` properly referenced by the `habits` completion table
- Streak tracking — `GET /api/streak`, consecutive-days-with-≥1-completion logic, Home dashboard wiring, e2e verified 9/9
- **Onboarding→habit-generation UX gap closed (2026-08-16):** first month's habits + score reasoning now generate automatically right after onboarding's prediction is created, instead of waiting for a manual Habits-tab tap — see Core System Logic point 16. E2E-verified against live backend+Supabase+ML service: health-inputs → prediction (High-band profile) → auto-generate all completed in ~10-20s; idempotency confirmed (a second `/generate` call for the same month returns `alreadyExisted: true`, matching what the Habits tab's manual button would now see); `GET /current-set` confirmed risk breakdown and reasoning are both available together, never one without the other. The fallback path was exercised for real (a genuine Gemini free-tier 503 capacity error occurred during testing, same class of transient outage documented earlier in this file) — fallback habits + generic reasoning saved correctly with `source: 'fallback'`, no error surfaced to the client. Test data cleaned up after.
- All Chunk 3 buildable work through this point committed to Git

**Deliberately deferred (not blocking, no urgent timeline):**
- Avatar — likely short looping video per tier, matching dashboard background color; needs tier boundaries calibrated against the peer-relative score range once built
- Avatar progression tracking (points/level system, `avatar_progression` table) — to be built alongside the avatar, not separately
- Step-count auto-tracking via phone pedometer — noted as a planned enhancement, deferred to Chunk 3 wrap-up or Chunk 5

**Known TODOs (not blocking, tracked for later, likely Chunk 5):**
- Onboarding shows on every login; needs a "has this user already onboarded" check
- Fallback-sourced monthly habit sets have no in-app "regenerate" option; requires manual Supabase intervention

**Name storage + Profile screen — BUILT + backend-verified (2026-08-16):** migration `006_add_user_name.sql` (nullable `users.name`, applied to Supabase). `POST /auth/register` now accepts/stores `name` (optional server-side, required client-side); `POST /auth/login` and new `GET /auth/me` both return it. Mobile: `RegisterScreen.js` gained a required Name field; `HomeScreen.js` greeting prefers `user.name`, falling back to the email-prefix derivation only for pre-migration accounts with `name: null`. New `ProfileScreen.js` (name, email, Aura Score summary, Log Out button; dark theme matching the rest of the app) added as a `Stack.Screen` sibling to `MainTabs` in `AppNavigator.js`; Home's profile icon now navigates there instead of calling `logout()` directly. E2E verified live against Supabase: register-with-name round-trips through register/login/`/auth/me`, register-without-name stays backward-compatible (`name: null`, doesn't error), pre-existing users (e.g. `mltest@aurafit.dev`) correctly show `name: null`. Test accounts cleaned up after. **NOT yet verified on-device:** ProfileScreen rendering, the Home→Profile navigation, and Log Out now happening from Profile rather than Home's icon — no simulator/device attached in this session, needs a manual pass.

### Chunk 4 — GPS Reward Map
**IN PROGRESS.** Migration `005_reward_claims.sql` (backend/migrations/) — `reward_claims` table (unique per user+pin, RLS) + two PostGIS RPC functions (`reward_pin_distance_meters` for the claim proximity check, `list_reward_pins_with_distance` for the map's pin list) — written, not yet pasted into Supabase by the user. Backend `GET /api/rewards/pins` + `POST /api/rewards/claim` (backend/src/routes/rewards.js, 30m claim radius, idempotent, rollback-on-points-failure, wired into index.js) built, boots clean, not yet e2e-verified against live Supabase (blocked on the migration being applied). Mobile: `react-native-maps` + `expo-location` installed, location permission strings added to app.json, `MapScreen.js` rebuilt from stub to a real dark-themed map (markers colored by claimed state, tap-to-select claim card, permission-denied fallback, refresh button), `api.getRewardPins`/`api.claimReward` added — not yet tested on-device.

**Seed data (curated 2026-08-04, do not replace with generic landmarks again):** 8 real health/fitness-themed businesses in the Colombo/Moratuwa area, Sri Lanka. Coordinates pulled from mapping data (not personally surveyed by the user, but real named businesses at real locations — meaningfully more accurate than the original generic-landmark placeholder set that preceded this one). Reward descriptions are PLACEHOLDER terms only — no real partnership/discount agreements exist with these businesses.

| Brand | Type | Lat | Lng | Points | Reward (placeholder) |
|---|---|---|---|---|---|
| Oxygen Fitness Center | Gym | 6.786804 | 79.884835 | 30 | 10% off a day pass |
| The Core Fitness | Gym | 6.767523 | 79.883523 | 30 | 10% off a day pass |
| Iron Bull Fitness Arena | Gym | 6.784661 | 79.885478 | 30 | 10% off a day pass |
| Healers Juice Bar | Juice bar | 6.794910 | 79.887954 | 20 | Free small juice |
| RAW Organic Handcrafted Juices | Juice bar | 6.858496 | 79.891788 | 20 | Free small juice |
| Thinethsa Pharmacy Moratuwa | Pharmacy | 6.771052 | 79.883304 | 15 | 5% off health products |
| Happy Health Pharmacy | Pharmacy | 6.794990 | 79.903043 | 15 | 5% off health products |
| Pro Player's Sports | Sports store | 6.797569 | 79.888734 | 25 | 10% off sportswear |

Remaining Chunk 4 scope: user pastes migration 005 into Supabase, then live e2e verification (claim-in-range, claim-out-of-range with distance feedback, duplicate-claim idempotency, unknown pin 404, unauthenticated 401), then on-device testing of the map screen.

### Chunk 5 — Polish, Testing & Dissertation
UAT test cases, bug fixes, UI polish to match Figma designs pixel-perfectly, onboarding-every-login fix, dissertation Chapters 3 and 4 write-up, five diagrams (System Architecture, Use Case, ER/Database Schema, Sequence for ML prediction loop, Avatar State), final submission prep. Candidate home for step-count auto-tracking and Profile screen if not done earlier.

---

## Key Findings — Age-Sensitivity Investigation (important dissertation material)

**The problem:** BRFSS is cross-sectional, so the trained model learned "probability this lifestyle profile currently has a diagnosed condition," not future risk. Young respondents rarely have diagnoses yet regardless of habits, so age alone dominated the score — a test profile (22yo, BMI 31.6, daily smoker, inactive) scored 84-90 (clearly wrong), while identical habits at 58 correctly scored 11.

**First fix — age projection alone (+10 years):** legitimate "synthetic cohort" technique, moved score in the right direction (84→74) but didn't flip any condition out of "Low," since global risk bands were still calculated across the whole adult population.

**Second fix — age-sensitive (peer-relative) risk bands:** tercile cutoffs now calculated separately within 4 life-stage buckets (18-34, 35-49, 50-64, 65+), justified by a data-sufficiency check (heart attack prevalence spreads ~19x across buckets; finer 13-band granularity would have had cells too thin to validate reliably, e.g. 25-29/heart disease at only 45 total positives).

**Combined result:** same 22yo unhealthy male now scores ~31 with High bands on all four conditions; a genuinely healthy young profile still correctly scores ~71, all Low.

**Honestly-reported wrinkle:** 18-34/heart attack showed a minor non-monotonic blip (0.3%→0.2%→1.0%) between Low/Moderate terciles due to small sample sizes (10 vs 8 positive cases) — the High band still separated cleanly. Confirms 4 buckets was the minimum safe granularity, not over-cautious.

**Known consequence:** scores now compress toward the middle within each bucket (peer-relative), so pre/post-change scores aren't comparable — old test rows were cleared from Supabase for this reason.

**Real-world confirmation during later testing:** an occasional ("some days") smoker with an otherwise good profile scored Heart Attack "High" — initially surprising, but traced to two compounding factors: (1) even occasional smoking carries real documented cardiovascular risk, and (2) this profile fell in the 18-34/heart attack bucket, the specific combination already flagged above as having the most fragile Low/Moderate boundary. This is treated as a validated instance of an already-documented limitation, not a new bug — smoking mapping itself was independently verified correct (some_days → BRFSS code 2, distinct from every_day → 1).

---

## Onboarding Health Input Form — Final Field Roles

| Role | Fields |
|---|---|
| **Model-training features** (sent to `/predict`) | Age (→ +10yr projected age_group), Height/Weight (→BMI), Gender (→sex, binary only), Exercise frequency (→physical_activity_cat), Smoking status, Calculated heavy-drinker flag, General self-rated health (with descriptive anchors) |
| **Personalisation-only** (saved to `health_inputs`, feed Gemini, not the ML model) | Sleep hours, Sleep quality, Diet type, Meals per day, Water intake, Exercise types, Stress level, Work hours/day, Screen time, Existing heart condition (Y/N), High BP diagnosis (Y/N), Diabetes diagnosis (Y/N) |

---

## Database Schema (Supabase / PostgreSQL)

### users (migration 006 added `name`)
id (uuid, pk), email (text, unique), name (text, nullable — null for accounts created before migration 006), created_at

### health_inputs (migration 003)
id (uuid, pk), user_id (fk), sleep_hours, sleep_quality, diet_type, meals_per_day, water_intake, exercise_frequency, exercise_types (text[]), stress_level, work_hours, screen_time, alcohol_frequency, drinks_per_occasion, smoking_status, existing_heart_condition (bool), high_bp_diagnosis (bool), diabetes_diagnosis (bool), general_health_rating, created_at

### predictions (migration 002)
id (uuid, pk), user_id (fk), predicted_health_score (float, age-bucket-relative), heart_attack_risk/heart_disease_risk/diabetes_risk/high_bp_risk (float, raw/inflated — not for UI), risk_breakdown (jsonb — Low/Moderate/High per condition, age-bucket-relative), created_at

### habit_sets (NEW — migration 004)
id (uuid, pk), user_id (fk), month (identifies which calendar month this set belongs to), source (text: 'gemini' | 'fallback'), reasoning (text — the score explanation), created_at. Contains the 5 generated habits (title, subtext, points_value) for that month — exact column/JSON structure per migration 004.

### habits (updated — migration 004 added habit_item_id)
id (uuid, pk), user_id (fk), habit_item_id (NEW — references the specific habit within a habit_sets row, replaces the old title-matching approach), title, completed (bool), date, points_value (int)

### avatar_progression (not yet created — deferred with the avatar)
id (uuid, pk), user_id (fk), avatar_progression_level (int), updated_at

### points
id (uuid, pk), user_id (fk), amount (int), source (text: habit/gps), created_at

### reward_pins
id (uuid, pk), brand_name, description, location (geometry, PostGIS point, GIST index), reward_value (int)

---

## Supabase Setup (Already Done)
Project: AuraFit, Asia-Pacific region. RLS enabled on all tables. PostGIS extension enabled with GIST spatial index on `reward_pins.location`. `predictions`/`health_inputs` test rows were cleared once during the age-sensitivity methodology change (pre-change scores weren't comparable to post-change ones).

---

## Design Direction
Dark theme, #FF5A36 accent, Poppins font exclusively. Cards `#1C1C1E` background, `#2C2C2E` borders, soft shadows (lightened per user feedback from the original all-black theme). New `warning: '#FFB340'` amber token added for Moderate risk bands; Low reuses existing green, High reuses existing red.

Figma screens exist for: pre-onboarding walkthrough, account creation, onboarding Steps 1-5, Habits tab (original), Home dashboard (original darker version), Risk Breakdown/Profile screen. The Figma Risk Breakdown screen's categories (Cardiovascular, Type 2 Diabetes, Mental Wellbeing, Musculoskeletal) don't match the model's actual 4 conditions — deliberately relabeled to Heart Attack / Heart Disease / Diabetes / High Blood Pressure instead.

**Figma MCP note:** generates standalone FigJam files, not new pages within an existing Figma file.

---

## Avatar — Important Framing & Current Plan
Health visualisation tool only — not a physical likeness of the user. Deliberately deferred. When built: likely short looping video clips per tier (handles subtle movement naturally), rendered on the same solid background color as the dashboard to avoid needing true video transparency. Starting tier will be score-based, calibrated against the peer-relative score range (~31-71ish within a bucket). Avatar progression tracking will be built at the same time, not before.

---

## Development Principles
- Go one step at a time; explain what each step does in plain language
- Raw datasets and virtual environments are never committed to Git
- Build one screen/feature at a time, confirm against design or spec before moving to the next
- RLS policies written alongside each table, not added later
- Before committing, always run `git status` (and `git add --dry-run .` if unsure)

---

## Key Learnings & Principles
- Gemini API handles habit generation AND score reasoning in one combined call — never a substitute for the scikit-learn model itself
- Cross-sectional survey data (BRFSS) captures current diagnosis prevalence, not future risk — age dominates predictions unless deliberately corrected for
- Age-shifting the input alone is not sufficient without also making the surrounding risk-band thresholds peer-relative — the two techniques need to work together
- Before choosing statistical cohort/bucket granularity, run an explicit data-sufficiency check (including per-bin sizes after any further split like terciles), don't assume finer is always better
- A silently pre-filled form default can be worse than an empty field, especially for heavily-weighted model inputs — require explicit interaction before allowing progression
- Ambiguous self-report scales need concrete behavioural anchors per value to get consistent, accurate answers across equally-healthy respondents
- AI-generated content (habits, reasoning) always needs a deterministic fallback path for API failures/malformed responses — verified valuable in practice, not just theoretical, when a real Gemini outage occurred during testing
- When a feature "locks in" a result for a period (e.g. monthly habit generation), consider whether users need a manual override/retry path for when the fallback triggered undesirably
- When a scoring methodology changes meaningfully, clear out old data rows using the previous methodology (in dev/test environments) rather than letting incomparable values coexist
- Use `npx expo` rather than global expo-cli; clear Expo cache (`--clear`) after `.env` changes
- Git incident precedent: raw datasets accidentally committed can be undone via `git reset --soft HEAD~1` before pushing

---

## Methodology
Agile — five iterative sprints. Dissertation writing runs in parallel from Sprint 3 onward.

---

## Primary Research — Market Research Survey (April Contextual Report)
**NOT a placeholder.** Real primary research was already conducted during the April Contextual Report / proposal stage: a market research survey with **167 respondents**, covering:
- Age / occupation / platform demographics
- Physical activity barriers
- Motivation for personalized health prediction
- GPS reward likelihood (willingness to engage with location-based rewards)
- Comfort with data entry (onboarding/health-input burden tolerance)

This data already exists from the Contextual Report and should be **referenced and cited properly** in the dissertation (e.g. background/justification chapter, or wherever the proposal's primary research is discussed) — it should NOT be treated as missing or left as a placeholder to redo. Locate the original April Contextual Report document/survey results and cite them directly rather than re-running or re-describing generic market research.

---

## Security Posture (Audited 2026-08-23) — IMPORTANT FOR CHAPTERS 6 & 7

A direct code audit was performed on the backend (confirmed via inspection, not assumed) covering JWT handling, rate limiting, input validation consistency, and general hardening (CORS, security headers, SQL injection protection).

**What exists (from Chunk 1 onward):**
- JWT-based authentication (`requireAuth` middleware) — verified on every protected route, consistently applied.
- RLS enabled on all Supabase tables (though the backend connects via the service-role key, which bypasses RLS for its own queries — authorization in practice relies on the backend consistently filtering by `user_id`, confirmed applied correctly across every route).
- SQL injection protection via Supabase's parameterized query builder — no raw string-concatenated SQL anywhere in the backend.
- Per-route input validation exists in places — strong/declarative on `predictions.js` and `health-inputs.js` (typed rules, range-checked), but ad-hoc and inconsistent elsewhere (`habits.js`, `rewards.js`, `streak.js`), and weakest on `auth.js` itself (no email format check, no password minimum length).

**What is confirmed ABSENT:**
- **Rate limiting: entirely absent.** No `express-rate-limit` or equivalent anywhere in the codebase, on ANY route — including `/auth/login` and `/auth/register`, which are unlimited/brute-forceable.
- **Security headers: absent.** No `helmet.js` or equivalent — no CSP, HSTS, X-Frame-Options, etc.
- **CORS: unhardened.** `cors()` used with no origin restriction (default = any origin allowed).
- JWT secret has no rotation mechanism; `/auth/refresh` accepts expired-but-validly-signed tokens indefinitely, undermining the practical effect of the configured expiry.

**DECISION (recorded 2026-08-23): security hardening (rate limiting, consistent input validation, security headers/CORS) is DELIBERATELY DEFERRED until after dissertation submission.** A scope/time decision, not an oversight discovered too late to act on.

**⚠️ Dissertation-writing flag — write this honestly, do not gloss over it:**
- **Chapter 6 (Evaluation → Limitations Identified):** the current absence of rate limiting, inconsistent validation, and missing security headers/CORS hardening must be listed as a genuine, currently-existing limitation of the system as submitted — not implied to be "done" or "in progress."
- **Chapter 7 (Conclusion → Future Scope and Recommendations):** the deferred Security Layer sprint (rate limiting, consistent validation via a shared library, helmet.js, CORS allowlisting, JWT rotation/refresh-token redesign) belongs here as explicit, named future work — exactly the kind of concrete, scoped recommendation a FYP conclusion should contain.

Do NOT describe security hardening as already completed in any dissertation chapter — the honest framing is "identified and audited, deliberately deferred by scope/time decision, documented as future work."

---

## Tools in Use
Claude Code (VS Code), Supabase (DB/auth/PostGIS), Expo/npx expo, eas-cli, Homebrew + Node 18.20.8 (Mac, Apple Silicon), Figma, GitHub (private repo), BRFSS 2023 (CDC), Gemini API (Google Generative AI, Google AI Studio).

---

## Current Status

**Chunk 1:** Complete.
**Chunk 2:** Complete.
**Chunk 3:** Buildable scope complete — Home dashboard, risk breakdown, Habits tab, Gemini-powered monthly-progressive habit generation with score reasoning and a verified fallback system, and streak tracking are all built, tested, and committed to Git. Avatar and avatar progression tracking remain deliberately deferred until built together. Step-count auto-tracking noted as a future enhancement.

**Next action:** Chunk 4 — GPS Reward Map (in progress, see the Chunk 4 section above for full detail). Backend routes and mobile map screen are built; migration `005_reward_claims.sql` (reward_claims table + PostGIS RPCs + curated 8-business seed) is written but not yet pasted into Supabase by the user — once applied, live e2e verification and on-device map testing are the remaining steps.