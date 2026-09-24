# AAVAZ FRONTEND FORENSIC REPORT

## 1. Executive Summary
This report analyzes the current state of the AAVAZ frontend (React Web) and mobile (React Native/Expo) applications. The current implementation is a functional prototype that successfully integrates with the backend API, but suffers from inconsistent design systems, isolated component architectures, and a few instances of hardcoded metrics. The UX prioritizes functionality over emotional safety, particularly in the victim-facing mobile app. A full redesign is recommended to unify the design language and improve the operational ergonomics for administrators and the emotional safety for victims.

## 2. Frontend Architecture
- **Web App**: React (Vite) + Tailwind CSS + React Router + Context API (`AuthContext.jsx`). Uses `recharts` for charts.
- **Mobile App**: React Native (Expo) + raw StyleSheet styling + React Navigation (custom `MainAppShell` via state) + Context API (`WarningModalContext.jsx`).
- **Data Fetching**: Custom `authFetch` wrapper in web, custom `api.js` Axios instance in mobile.
- **Design System**: A nascent design system exists in `mobile/src/theme/designSystem.js` and `frontend/src/index.css`, but usage is inconsistent.

## 3. Complete Page Inventory (Web)
1. `Login.jsx` (`/login`)
2. **Admin Dashboards**:
   - `DistrictDashboard.jsx` (`/admin/district`)
   - `StateDashboard.jsx` (`/admin/state`)
   - `NationalDashboard.jsx` (`/admin/national`)
   - `SuperAdminDashboard.jsx` (`/admin/superadmin`, `/rit`)
3. **Counsellor**:
   - `Queue.jsx` (`/counsellor/queue`)
   - `CaseDetail.jsx` (`/counsellor/case/:caseId`)
4. **Victim**:
   - `Layout.jsx` (wrapper)
   - `Dashboard.jsx` (`/victim/dashboard`)
   - `CaseLifecycle.jsx` (`/victim/case`)
   - `Chatbot.jsx` (`/victim/chat`)
   - `GrievanceRegistration.jsx` (`/victim/register-grievance`)

## 4. Complete Component Inventory
**Web Components**:
- `ProtectedRoute.jsx`
- `ui/AdminLayout.jsx`
- `ui/Card.jsx`
- `ui/KPICard.jsx`
- `ui/PageHeader.jsx`
- `ui/RiskBadge.jsx`

**Mobile Components**:
- `Button.js`, `SystemButton.jsx`, `HapticButton.jsx`, `ScalePressable.jsx` (Button fragmentation)
- `DistressArchGauge.jsx`, `DistressGauge.jsx`
- `ErrorBoundary.jsx`, `WarningModal.jsx`, `SOSModal.jsx`
- `FloatingTabBar.jsx`
- `GlassCard.jsx`
- `SegmentedControl.jsx`
- `SystemInput.jsx`

## 5. Navigation Architecture
### Web Navigation
```
Login
 ├── Victim (Layout wrapper)
 │    ├── Dashboard
 │    ├── Case
 │    ├── Chat
 │    └── Register Grievance
 ├── Counsellor
 │    ├── Queue
 │    └── Case Detail
 └── Admin
      ├── District
      ├── State
      ├── National
      └── SuperAdmin
```
*Issue*: Admin users cannot easily navigate between different hierarchy levels if they possess multiple roles.

### Mobile Navigation
```
Loading -> Login -> OTPVerification -> (Register if new) -> MainAppShell
MainAppShell
 ├── Home (SOS trigger, Mood check-in)
 ├── Cases (Grievance Registration)
 ├── Assistant (Chatbot)
 └── Profile (Settings, Logout)
 Modals: SOSModal, WarningModal, ConsentScreen
```
*Issue*: The mobile app uses a custom state-based router (`currentScreen` / `activeTab`) instead of a robust library like Expo Router or React Navigation, making deep-linking and hardware back-button support fragile.

## 6. Role-Based UI Analysis
- **Victim (Mobile/Web)**: Can register grievances, view case lifecycle, chat with AI, check-in mood, and trigger SOS. Missing: clear visibility into what the Counsellor is actively doing for them.
- **Counsellor (Web)**: Sees assigned queue, case details, interaction history, and distress score metrics. Has manual intervention buttons.
- **District Admin**: Views aggregate cases, SOS alerts, and roster for a specific district.
- **State Admin**: Views aggregate district metrics across the state.
- **National Admin**: Views state-by-state comparisons.
- **SuperAdmin**: Direct table manipulation (development/RIT tool).

## 7. Dashboard Analysis
### District / State / National Dashboards
- **Existing**: Total cases, high risk, active SOS, case types, geographic breakdowns.
- **Useful**: Real-time aggregation of critical metrics.
- **Misleading**: The National dashboard previously used `critical` scores as a proxy for `activeSOS` (fixed in recent audit). State dashboard may still have similar proxies.
- **Missing**: Historical trend lines (currently only showing point-in-time metrics). 
- **Broken**: None identified functionally, but visual layout can break on small screens.

### Counsellor Dashboard (Case Detail)
- **Existing**: Victim info, timeline, AI summary, engagement score.
- **Useful**: AI summary and signal breakdown.
- **Missing**: Ability to write persistent case notes back to the database. Currently read-heavy.

### Mobile Home / SOS
- **Existing**: Giant SOS button, mood check-in.
- **Useful**: Immediate access to emergency dispatch.
- **UX Problems**: The SOS button is highly alarming (bright red, large). Distressed users might fear pressing it or trigger it accidentally. Needs a slide-to-confirm or press-and-hold (which is implemented in code but visually intimidating).

## 8. Backend ↔ Frontend Contract Matrix

| Feature | Frontend | Backend API | Connected? | Correct? | Notes |
|---|---|---|---|---|---|
| Mobile SOS | `SOSScreen.jsx` | `/api/v1/cases/sos/sos` | Yes | Yes | Fixed in Audit. |
| Chatbot History | `Chatbot.jsx` | `/api/v1/intake/chatbot/history/{id}` | Yes | Yes | |
| Chatbot Message | `Chatbot.jsx` | `/api/v1/intake/chatbot/message` | Yes | Yes | |
| E-Courts Search | `CaseLifecycle.jsx` | `/api/v1/ecourts/search` | Yes | Yes | Requires real CNR to yield data. |
| Register Grievance| `GrievanceReg...` | `/api/v1/intake/app/grievance` | Yes | Yes | |
| Counsellor Queue| `Queue.jsx` | `/api/v1/dashboards/counsellor/queue/{id}`| Yes | Yes | |
| Admin Stats | `*Dashboard.jsx`| `/api/v1/dashboards/*/stats` | Yes | Yes | |
| App Login / OTP | `Login.jsx` | `/api/v1/auth/otp/request` & `verify` | Yes | Yes | |

## 9. Data Visualization Audit
- **Charts**: Uses Recharts.
- **Data Source**: Almost all charts now map to actual backend aggregation endpoints (e.g., `payload.case_types`, `payload.state_breakdown`).
- **Misleading Metrics**: `response_rate` was hardcoded to 65/95% (fixed in backend during audit). The dashboards are now mostly serving real data, but the visualization components themselves (like `RiskBadge`) are hardcoded to specific color mappings that conflict with the global theme.

## 10. Design System Audit
- **Web**: TailwindCSS is used, but there is no strict `tailwind.config.js` adherence. Colors like `text-red-600` and `bg-blue-500` are used randomly alongside semantic classes.
- **Mobile**: A `designSystem.js` exists (with semantic tokens like `DS.canvas.base`, `DS.accent.crimson`), but components frequently mix DS tokens with hardcoded hex values. 
- **Component Duplication**: Mobile has `Button.js`, `SystemButton.jsx`, `HapticButton.jsx`, and `ScalePressable.jsx`. This fragmentation causes massive UI inconsistency.

## 11. UX / Information Hierarchy
- **Web**: Heavy, data-dense. The District and State dashboards look like traditional SaaS tools, which is fine for admins but lacks focus on *urgency*. Critical SOS alerts blend in with standard metrics.
- **Mobile**: The mobile app feels disjointed. The transition from a sleek Glassmorphism login to a sterile dashboard breaks trust. The "Emergency SOS Fallback" tag in the Profile screen is confusing.

## 12. Accessibility Audit
- **Keyboard Nav**: Web dashboards lack proper `aria-labels` and `tabIndex` management for modals.
- **Contrast**: Low contrast in some "muted" text fields on the mobile app against the `DS.canvas.base` background.
- **Touch Targets**: Mobile `SegmentedControl` touch targets are slightly too small (<44px).
- **Reduced Motion**: Mobile animations (`react-native-reanimated`) do not respect OS-level `prefers-reduced-motion` settings.

## 13. Responsive Design Audit
- **Web**: Uses Tailwind `md:` and `lg:` classes, but data tables in `SuperAdminDashboard` and `DistrictDashboard` overflow horizontally on mobile web.
- **Mobile**: Layouts use `Dimensions.get('window')` directly in some places instead of flexbox, causing UI clipping on smaller/older devices (e.g., iPhone SE).

## 14. Unwanted/Redundant UI
- **Mobile**: `Button.js` and `SystemButton.jsx` should be merged into one highly polished `Button` component.
- **Web**: `SuperAdminDashboard` exposes raw table manipulation (RIT tool). This should be strictly isolated or removed for production, as it bypasses all application logic.

## 15. Missing UI
- **Counsellor Action Log**: Counsellors can view cases but lack a UI to input physical case notes or mark an escalation as "handled".
- **Global Search**: Admins cannot search for a specific `case_id` globally; they can only find it if it appears in their local dashboard queue.
- **Voice Context UI**: The backend exposes `/api/v1/intake/chatbot/voice-context` for voice agent handoffs, but the frontend lacks a visual indicator showing that the AI is "listening" or "speaking" via Bolna.

## 16. Proposed Information Architecture
### Web (Admins & Counsellors)
```
Global Layout (Sidebar + Header)
 ├── Inbox / Alerts (Unified cross-role SOS & Escalations)
 ├── Dashboard (Role-specific KPIs)
 ├── Cases Directory (Searchable, filterable)
 └── Settings
```
### Mobile (Victims)
```
Main App (Bottom Tabs via Expo Router)
 ├── Home (Safe status, discreet check-in, hidden-until-needed SOS)
 ├── Timeline (Case lifecycle & E-Courts updates)
 ├── Support (Chatbot & Voice Agent)
 └── Profile (Safe exit, preferences)
```

## 17. Proposed Design System Direction
- **Admins**: High-density, high-contrast. Use a robust component library (like shadcn/ui or Radix) to standardize tables, modals, and charts. Focus on *alert fatigue reduction* (only SOS/Critical should be red).
- **Victims (Mobile)**: Trauma-informed design. Soft colors (blues, greens, warm grays). Avoid aggressive reds unless actively in an SOS state. High emphasis on privacy (discreet UI that doesn't look like a police app from a distance).

## 18. Redesign Requirements
1. **Unify Components**: Create a single `Button`, `Card`, and `Input` standard across both platforms.
2. **Trauma-Informed Mobile UX**: Redesign the SOS screen to be a discreet "slide to activate" or "press and hold" without glowing red rings that cause anxiety.
3. **Actionable Dashboards**: Admins need to click a metric (e.g., "5 Active SOS") and see the list of those 5 cases, not just the number.
4. **Migrate Mobile Router**: Replace the custom state-based router in `App.js` with Expo Router for stability.

## 19. Prioritized Redesign Backlog

| Priority | Problem | Affected | Resolution |
|---|---|---|---|
| **P0** | No action UI for Counsellors | `CaseDetail.jsx` | Add "Update Case" / "Resolve Alert" action modal linked to backend case lifecycle APIs. |
| **P0** | SuperAdmin raw table access | `SuperAdminDashboard.jsx` | Remove from standard bundle; keep only as a separate dev tool. |
| **P1** | Mobile routing is fragile | `App.js` (Mobile) | Migrate to Expo Router (`app/` directory). |
| **P1** | Aggressive SOS UI causes anxiety | `SOSScreen.jsx` | Implement discreet trauma-informed SOS interaction (slide to activate). |
| **P2** | Fragmented mobile buttons | `components/` (Mobile) | Consolidate into a single polymorphic `Button` component. |
| **P2** | Missing global case search | `AdminLayout.jsx` | Add top-nav search bar to query cases by ID/Phone. |
| **P3** | Inconsistent Tailwind usage | All Web Pages | Enforce strict Tailwind config and create `ui/` standard components. |

## 20. Final Frontend Status
**Status**: The frontend successfully implements the core feature requirements but requires a comprehensive UX/UI redesign to achieve production-grade usability, maintainability, and trauma-informed emotional safety. The component architecture must be unified before scaling further.
