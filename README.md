# AI-Powered Dynamic Mental Health Monitoring System

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)
![React](https://img.shields.io/badge/frontend-React%20%7C%20Vite-61DAFB.svg)
![React Native](https://img.shields.io/badge/mobile-Expo%20%7C%20React%20Native-02569B.svg)
![FastAPI](https://img.shields.io/badge/backend-FastAPI%20%7C%20Python-009688.svg)
![Supabase](https://img.shields.io/badge/database-Supabase-3ECF8E.svg)

An AI-driven platform built to dynamically monitor, predict, and mitigate psychological distress among victims of atrocities during the justice pipeline. The system utilizes real-time NLP, Sentiment Analysis, and Emotion AI to track victim well-being across Web, Mobile App, IVRS, and SMS channels.

## 🌟 Key Features

1. **Omnichannel Intake**: Continuously tracks distress via Chatbot, SMS webhook, IVRS webhook, and Mobile App entries.
2. **Dynamic Distress Engine (XAI)**: Calculates real-time distress scores using a transparent, multi-modal fusion engine combining:
   - *Acoustic Analysis*: Speech rate, pitch, and voice jitter.
   - *Sentiment & Emotion AI*: LLM-driven fear, anxiety, and depression classification.
   - *Engagement Metrics*: Interaction frequency and withdrawal tracking.
3. **Escalation & Intervention**: Automatically flags high-risk cases based on critical thresholds, immediately notifying assigned counselors.
4. **Role-Based Portals**: Secure, dedicated dashboards for Victims, Counselors, District Officials, State Officials, and National Authorities.
5. **eCourts Integration (Mocked)**: Simulates case stage progressions (FIR, Trial, Verdict) to proactively anticipate distress spikes.

## 🏗 Architecture

- **Backend (`/backend`)**: High-performance, async-first Python FastAPI server. Houses the rules engine, distress computation logic, and external webhook endpoints.
- **Frontend (`/frontend`)**: Responsive React application built with Vite, Tailwind CSS, and Lucide React. Provides the main interfaces for staff and victims.
- **Mobile (`/mobile`)**: React Native application powered by Expo. Offers victims a native experience with Haptics and Reanimated fluid motions for breathing exercises.
- **Database**: Supabase (PostgreSQL) handles all data persistence, utilizing Row-Level Security (RLS) to enforce strict data privacy and jurisdiction-based access.

## 🚀 Quick Start

### 1. Database Setup
1. Create a [Supabase](https://supabase.com/) project.
2. Run the SQL schema from `backend/schema.sql` to initialize tables.
3. Run the RLS policies from `scripts/apply_rls.sql` to secure the database.

### 2. Backend Initialization
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
cp .env.example .env      # Add your Supabase and API keys here
python run_server.py
```

### 3. Frontend Initialization
```bash
cd frontend
npm install
npm run dev
```

### 4. Mobile App Initialization
```bash
cd mobile
npm install
npm start
```

## 🔒 Security & Privacy
- **No PII Logging**: The system explicitly scrubs Personally Identifiable Information (PII) before calculating distress metrics.
- **Row-Level Security (RLS)**: Database policies ensure that a district official can only view cases assigned to their district, preventing unauthorized lateral access.
- **Secure Authentication**: Built entirely on Supabase Auth (JWT).

## 📄 License
This project is licensed under the MIT License.
