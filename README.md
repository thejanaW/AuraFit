# AuraFit

**Final-year BSc Computer Science dissertation project** — Majith Thejana Wahalathanthrie (2542227), University of Bedfordshire.

> *An Integrated Mobile Platform for Long Term Health Risk Prediction and Sustained Behavioural Change Through Gamified Physical Activity Incentives.*

AuraFit takes a user's lifestyle inputs, runs them through a trained ML model to project their **~10-year health risk** across four conditions (heart attack, heart disease, diabetes, high blood pressure), visualises overall health through a **Digital Twin avatar**, and motivates action through an **AI-personalised daily habit checklist** and a **GPS-based location reward system** — both of which earn points that grow the avatar over time.

---

## Project Structure

```
AuraFit/
├── mobile/        React Native (Expo) app
├── backend/       Node.js / Express API
└── ml-service/    Python / FastAPI ML microservice
```

## Tech Stack

| Layer | Technology |
|---|---|
| Mobile | React Native + Expo |
| Backend API | Node.js + Express |
| ML Microservice | Python + FastAPI + scikit-learn |
| Database | PostgreSQL + PostGIS (via Supabase), Row Level Security enabled |
| Auth | JWT, managed by the backend |
| Habit generation & score reasoning | Gemini API (Google AI Studio) |
| Maps & GPS | React Native Maps + Expo Location |

---

## Requirements

- [Node.js](https://nodejs.org) (LTS)
- [Git](https://git-scm.com)
- Python 3.10+ — only needed if running `ml-service` locally
- [Expo Go](https://expo.dev/go) on your phone, **or** Android Studio / Xcode for an emulator/simulator

---

## Setup & Run

### Mobile App

```bash
git clone https://github.com/thejanaW/AuraFit.git
cd AuraFit/mobile
npm install
npx expo start
```

Then either scan the QR code with the **Expo Go** app, or press **`a`** (Android emulator) / **`i`** (iOS simulator, Mac only) in the terminal.

### Backend (optional — only if not using the hosted version)

```bash
cd AuraFit/backend
npm install
npm start
```

Update `EXPO_PUBLIC_API_URL` in `mobile/.env` to point at this backend, then restart the mobile app.

### ML Service (optional)

```bash
cd AuraFit/ml-service
pip install -r requirements.txt
uvicorn main:app --reload
```

---

## Notes

- The raw CDC BRFSS 2023 dataset is excluded from this repository due to size — see the dissertation's methodology section for details on how it was sourced and processed.
- Database: **Supabase** (PostgreSQL + PostGIS), with Row Level Security enabled on every table.
- Full usage instructions for reviewers are in the separate **User Manual** document.
