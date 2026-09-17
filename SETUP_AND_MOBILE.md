# SETUP_AND_MOBILE.md
### Supplement to SYSTEM_SPEC.md — Manual Integration Work & Mobile App Stack

Antigravity (or any AI coding agent) can scaffold and wire code, but a number of steps require a human to hold an account, click through a console, or physically test on a device. This file separates those out so nothing gets silently skipped during implementation.

---

## 1. Mobile App Stack Clarification

The original spec said "Mobile App — Real" without pinning a stack. Correcting that:

| Layer | Choice | Notes |
|---|---|---|
| Framework | **React Native (via Expo)** | Lets the same team writing the React dashboards reuse skills; Expo simplifies build/test loop significantly for a hackathon timeline |
| Testing/dev loop | **Expo Go** | Scan a QR code from `expo start`, app loads live on a physical phone (iOS/Android) without a native build — this is your primary demo-prep and day-to-day testing method |
| Push notifications (SOS/alerts) | Expo Notifications API | Works within Expo Go for testing; needs an EAS build for full production-grade push in the future, not required for MVP demo |
| Maps (if shown in-app, not just district dashboard) | `react-native-maps` | Note: `react-native-maps` has limited/no support in Expo Go on some configurations — if the end-user app itself needs to show a map (not just the district dashboard, which is web/Leaflet), confirm this early; may require an Expo Dev Client build instead of plain Expo Go |
| Location capture | `expo-location` | Standard Expo module, works fine in Expo Go |
| Build for actual demo day | `expo build` / EAS Build (if a standalone APK/IPA is wanted for judges) | Optional — Expo Go live-QR demo is usually sufficient for SIH evaluation, a built APK is a nice-to-have fallback |

### Directory addition (extends Section 3.2 of SYSTEM_SPEC.md)

```
mobile/
├── App.js
├── app.json                 # Expo config
├── src/
│   ├── screens/
│   │   ├── RegisterScreen.jsx
│   │   ├── ConsentScreen.jsx
│   │   ├── SOSScreen.jsx
│   │   └── ChatbotScreen.jsx
│   ├── components/
│   └── services/
│       ├── api.js           # calls to FastAPI backend
│       └── location.js      # expo-location wrapper
└── package.json
```

### `.antigravityrules` addition

```
## Mobile (Expo)
- Test all features in Expo Go before assuming they need a custom dev client
- Do not add native modules without first checking Expo Go compatibility
- expo-location and expo-notifications are Expo Go-safe; verify any new native dependency against Expo's compatibility docs before adding
```

---

## 2. Human/Manual Setup Work — Cannot Be Automated by the Coding Agent

These require you (a person) to create accounts, generate keys, or physically test — no amount of code generation replaces this. Organized in the order you'll actually hit them.

### 2.1 Accounts & Credentials to Create

| Service | What you need to do | Used for |
|---|---|---|
| **Supabase** | Create project, note project URL + anon/service keys, enable RLS | DB, Auth, Storage |
| **Bolna** | Sign up, create an agent/assistant config, get API key, configure Sarvam model selection for Hindi/Tamil/Malayalam | IVR calls |
| **Pushbullet** | Create account, generate API key, verify sending number/channel works for two-way SMS in your region | SMS |
| **LLM wrapper (Gemini or equivalent)** | Create API key, set usage/billing limits so a runaway loop doesn't rack up cost during testing | Chatbot generation, emotion classification prompts |
| **Expo** | Create Expo account (free tier fine for Expo Go testing) | Mobile app dev/testing, later EAS build if needed |
| **Domain/hosting (optional)** | If dashboards need a public URL for judges rather than localhost demo | Web dashboard hosting (Vercel/Netlify are fastest for React) |

### 2.2 Manual Configuration Steps

- **Webhook URLs**: Bolna and Pushbullet both need your backend's public webhook URL registered in their dashboards. During development this means running something like `ngrok` (or Antigravity's equivalent tunnel) and re-registering the URL each time it changes — this is manual, repetitive, and easy to forget after a restart.
- **Supabase RLS policies**: the spec defines *what* the policies should enforce (Section 6.2 of SYSTEM_SPEC.md), but someone has to actually write and apply the SQL policies in the Supabase dashboard/SQL editor, then manually test with different role logins to confirm they behave as expected. This is a correctness-critical step worth doing by hand, not just trusting generated code blindly.
- **Test phone numbers**: you'll want 2–3 real phone numbers you control to actually test IVR calls and SMS round-trips end to end — Bolna/Pushbullet sandbox modes don't always fully replicate real delivery behavior.
- **Language/voice tuning in Bolna**: Sarvam's voice models will need manual listening/tuning per language — script phrasing that sounds natural in Hindi may not translate directly to Tamil/Malayalam prompts; this needs a native/fluent speaker's ear, not just translation.
- **Expo Go live testing**: someone needs to physically run `expo start`, scan the QR on a real phone, and click through registration/consent/SOS flows — simulators can miss real GPS/notification behavior.
- **Leaflet/OSM tile loading**: confirm map tiles actually load on your demo network (some campus/venue networks block third-party tile servers) — worth testing on the actual venue Wi-Fi beforehand if possible, with an offline/cached-tile fallback as backup.

### 2.3 Judgment Calls a Human Must Make (not code)

- Final wording of the consent message (app first-login prompt + non-app channel opt-out line) — legal/ethical tone matters, should be reviewed by a person, not left as placeholder LLM output
- Actual 4-language script content for IVR prompts and SMS templates — needs human translation review, not just automated translation
- Threshold values beyond the SOS 30-minute timer (e.g., what numeric score counts as "Critical" vs "High" in the intervention table) — these are policy decisions, worth a sanity pass by someone familiar with the domain before demo day
- Demo narrative/case script — deciding which simulated case journey to walk judges through (which case type, which escalation path) is a presentation decision, not something to auto-generate

### 2.4 Suggested Order of Operations

1. Create all accounts (Section 2.1) — do this first, some approvals (Bolna especially) can take time
2. Supabase schema + RLS setup, test with dummy role logins
3. Backend skeleton + webhook tunnel (ngrok) + register webhook URLs
4. Expo Go app skeleton, test registration flow on a real phone
5. Wire scoring pipeline, test with a handful of real recorded sample calls (not just synthetic text)
6. Dashboards last, once real data is flowing into `interactions`
7. Full run-through on venue Wi-Fi if possible, before demo day

---

## 3. What Was Missing (summary)

| Gap | Now covered in |
|---|---|
| Mobile app tech stack unspecified | Section 1 of this file |
| Expo Go testing workflow unmentioned | Section 1 of this file |
| Manual account/credential setup unaddressed | Section 2.1 |
| Webhook tunnel/registration is a recurring manual step | Section 2.2 |
| RLS policies need human verification, not just generated SQL | Section 2.2 |
| Language/voice script tuning needs a human ear | Section 2.2 |
| Threshold and consent wording are judgment calls, not auto-generatable | Section 2.3 |
