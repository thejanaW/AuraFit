# AuraFit — Full Project Context

> Read this file at the start of every Claude Code session before doing anything else.

---

## Project Overview

**AuraFit** is a cross-platform mobile fitness app built as a BSc Computer Science Final Year Project at the University of Bedfordshire. It is a solo developer project with supervisor approval.

**Full project title:** An Integrated Mobile Platform for Long Term Health Risk Prediction and Sustained Behavioural Change Through Gamified Physical Activity Incentives

The app takes user lifestyle inputs, runs them through a trained ML model to predict long-term health risk, visualises that risk through a Digital Twin avatar, and motivates action through a gamified habit checklist and a GPS-based location reward system.

---

## Core System Logic (Critical)

This is the most important thing to understand about how AuraFit works:

1. User fills in lifestyle inputs (sleep, diet, exercise, stress levels)
2. ML model predicts a long-term health risk score
3. That score determines the avatar's appearance (health tier)
4. The avatar generates a personalised daily habit checklist based on the risk score
5. Completing habits earns points and improves the avatar's health score
6. GPS reward map is a separate earning mechanism — users visit pinned locations to claim rewards from local brands, which also earns points
7. Both earning paths (habits + GPS) feed into the avatar score

**Critical development path:** Auth → ML risk score → Avatar renders score → Habits earn points → GPS also earns points. Each phase unlocks the next.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native with Expo |
| Maps & GPS | React Native Maps + Expo Location |
| Avatar/Animation | Lottie / React Native Skia (SVG-based) |
| Backend API | Node.js with Express |
| ML Microservice | Python with FastAPI + scikit-learn |
| Database | PostgreSQL with PostGIS (via Supabase) |
| Auth | Supabase (JWT-based) |
| Version Control | Git / GitHub (private repo) |

---

## Monorepo Structure

```
AuraFit/
├── mobile/          # React Native / Expo app
├── backend/         # Node.js / Express API
├── ml-service/      # Python / FastAPI ML microservice
└── AuraFit_Full_Context.md
```

---

## Five Chunk Build Plan

Each chunk's output unlocks the next. Do not skip ahead.

### Chunk 1 — Foundation & Auth
**Needs:** Supabase project, Node.js, Expo, Git repo (all already set up)
**Build:**
- Monorepo folder structure
- Supabase DB schema (users, health_inputs, predictions, habits, points, reward_pins tables)
- JWT auth API in Express (register, login, refresh)
- Expo mobile shell with bottom tab navigation
- Login and Register screens
- Basic Home, Habits, and Map tab screens (shells only)

**Unlocks:** Everything. Nothing else can start without this.

### Chunk 2 — ML Microservice
**Needs:** Chunk 1 complete, Python 3.10+
**Build:**
- FastAPI microservice in /ml-service
- Train scikit-learn model on BRFSS or UCI Heart Disease dataset
- Health risk prediction endpoint (takes lifestyle inputs, returns risk score 0-100)
- Connect backend to ML service
- Store predictions in Supabase

**Unlocks:** Avatar can now render a real risk score. Habits can be personalised.

### Chunk 3 — Avatar & Habit System
**Needs:** Chunk 2 complete (real risk scores flowing)
**Build:**
- Digital Twin avatar component (Lottie or React Native Skia)
- Avatar appearance changes based on health score tier
- Personalised daily habit checklist generated from risk score
- Habit completion logic (marks done, awards points)
- Points stored in Supabase

**Unlocks:** Core gamification loop is live.

### Chunk 4 — GPS Reward Map
**Needs:** Chunk 3 complete, PostGIS enabled in Supabase (already done)
**Build:**
- Map screen with React Native Maps
- Seed reward pins (lat/lng) in Supabase
- Proximity check (20-30m radius) using PostGIS
- Claim reward API endpoint
- Points awarded on claim → feeds avatar score
- Brand reward display UI

**Unlocks:** Full gamification loop — both earning paths (habits + GPS) now live.

### Chunk 5 — Polish, Testing & Dissertation
**Needs:** All prior chunks working end to end
**Build:**
- UAT test cases
- Bug fixes
- UI polish to match Lovable designs pixel-perfectly
- Onboarding flow
- Dissertation Chapters 3 and 4 write-up
- Five diagrams for dissertation (System Architecture, Use Case, ER/Database Schema, Sequence for ML prediction loop, Avatar State)
- Final submission prep

---

## Database Schema (Supabase / PostgreSQL)

### users
- id (uuid, primary key)
- email (text, unique)
- created_at (timestamp)

### health_inputs
- id (uuid, primary key)
- user_id (uuid, foreign key → users)
- sleep_hours (float)
- diet_quality (int, 1-5)
- exercise_frequency (int, days per week)
- stress_level (int, 1-5)
- created_at (timestamp)

### predictions
- id (uuid, primary key)
- user_id (uuid, foreign key → users)
- risk_score (float, 0-100)
- risk_tier (text: low / moderate / high)
- created_at (timestamp)

### habits
- id (uuid, primary key)
- user_id (uuid, foreign key → users)
- title (text)
- completed (boolean)
- date (date)
- points_value (int)

### points
- id (uuid, primary key)
- user_id (uuid, foreign key → users)
- amount (int)
- source (text: habit / gps)
- created_at (timestamp)

### reward_pins
- id (uuid, primary key)
- brand_name (text)
- description (text)
- location (geometry, PostGIS point)
- reward_value (int)

---

## Supabase Setup (Already Done)

- Project name: AuraFit
- Region: Asia-Pacific
- Automatic RLS enabled (Row Level Security on all tables)
- PostGIS extension enabled (plain postgis, under extensions schema)

**Why RLS was enabled early:** AuraFit handles personal health data. RLS ensures users can only access their own rows at the database level. Turning it on from the start avoids having to retrofit it later.

**Why PostGIS:** The GPS reward map needs proximity queries (find pins within 30m of user). PostGIS handles this in the database efficiently.

---

## Design Direction

- **Theme:** Dark
- **Accent colour:** #FF5A36 (reddish-orange)
- **Font:** Poppins exclusively (all weights)
- **Layout:** Card-based, circular progress rings, bold stat numbers
- **Tab bar:** Raised centre button
- **Screens (approx 18-20 total):**
  - Auth flow: Splash, Login, Register
  - Onboarding: Health input form (multi-step)
  - Main tabs: Home/Avatar Dashboard, Habits/Checklist, Map/Rewards
  - Supporting: Profile, Settings, Reward detail, Habit history

**Reference designs exist in Lovable** — use these as pixel-perfect targets when building screens.

---

## Avatar — Important Framing

The Digital Twin avatar is a **health visualisation tool only**. It is not a physical likeness of the user. Its appearance reflects the user's current health score tier, not their physical appearance.

- This distinction is academically and ethically important for the dissertation
- Health risk predictions are risk indicators, not clinical diagnoses
- Always frame avatar changes as reflecting health trends, not predicting appearance

---

## Development Principles

- Go one step at a time
- Explain what each step does in plain language before or alongside doing it
- Avoid complexity mid-build — sequence things to prevent having to redo work
- RLS policies must be written alongside each table, not added later
- Each Claude Code session must start by reading this file

---

## Methodology

Agile — five iterative sprints. Dissertation writing runs in parallel from Sprint 3 onward (mid-development). The five-chunk build plan maps to the sprint structure.

---

## Tools in Use

| Tool | Purpose |
|---|---|
| Claude Code (VS Code) | Primary coding tool |
| Supabase | Database, auth, PostGIS |
| Expo / npx expo | Mobile development |
| eas-cli | Building and submitting the app |
| Homebrew + Node 18.20.8 | Local dev environment (Mac, Apple Silicon M-series) |
| Lovable | Existing UI designs (pixel-perfect reference) |
| Figma | Dissertation diagrams |
| GitHub | Version control (private repo) |
| BRFSS / UCI Heart Disease | ML training datasets |

---

## Current Status

Environment setup is complete:
- Supabase project created and configured
- GitHub repo created (private, empty)
- Homebrew installed
- Node 18.20.8 installed and on PATH
- eas-cli installed (v16.32.0)
- expo-cli (legacy) uninstalled — use npx expo instead

**Next action:** Chunk 1 — set up monorepo structure and Supabase schema. Save this as AuraFit_Full_Context.md in the project root.
