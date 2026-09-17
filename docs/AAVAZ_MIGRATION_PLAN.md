# AAVAZ_MIGRATION_PLAN.md

Plan for reconciling the existing `targaryens` implementation (now on
`feat/aavaz-integration`) with the Aavaz v0.2 target architecture, based on the findings
in `AAVAZ_IMPLEMENTATION_AUDIT.md`. This is a plan, not an implementation — no
application code has been changed as part of producing this document.

**Decision record note**: this repository (on `feat/aavaz-integration`) has no
`DECISIONS.md`. A `DECISIONS.md` exists on the separate, unrelated `feat/bootstrap`
branch, but it records decisions for a different (superseded, from-scratch) planning
pass and must not be treated as authoritative for this branch. **§0 below is the single
authoritative decision record for the six migration decisions on this branch.** To avoid
duplicate or contradictory decision logs, do not create a second `DECISIONS.md` here
without first reconciling it against `feat/bootstrap`'s copy and superseding this
section explicitly.

---

## 0. Resolved migration decisions

The six decisions flagged as open in the original §10 of this document (and mirrored in
`AAVAZ_IMPLEMENTATION_AUDIT.md` §15) have been made by the project owner. They are
recorded here in full; the rest of this document has been updated to build on them
rather than to re-pose them as open questions. **None of these decisions have been
implemented in code as part of recording them** — see each item's "Deferred work."

### Decision 1 — Rewrite vs. incremental migration

- **Decision**: Use an **incremental migration** strategy. Preserve useful existing
  implementation and product surfaces where practical. Do not rewrite the application
  from scratch. However, the existing implementation is **not architecturally
  authoritative** — Aavaz v0.2 is the target architecture, and existing functionality is
  to be progressively moved/refactored behind the v0.2 service boundaries.
- **Rationale**: The audit (§1, §4, §5) found genuinely working, non-trivial pieces (the
  eCourts integration, staff auth, assignment logic, PDF generation, the mobile UI/UX)
  that would be wasteful to discard, while the overall architecture (single Python
  monolith, audit §2) is fundamentally incompatible with v0.2's Node/Python boundary and
  must still change.
- **Consequences**: The dependency-ordered gap list in §2 below and the migration
  sequence in §4 remain the working plan, now adopted rather than proposed. Every
  extraction step must treat the v0.2 spec, not the current FastAPI monolith's
  behavior, as the definition of "correct" when the two disagree.
- **Deferred work**: All actual extraction/refactoring (§2–§4) is implementation work,
  not performed in this documentation pass.

### Decision 2 — Supabase vs. self-hosted PostgreSQL

- **Decision**: **Keep Supabase initially.** Do not migrate database/infrastructure
  merely to satisfy architectural purity. Continue using the existing Supabase/Postgres
  infrastructure where it is compatible with the v0.2 design. A future migration to
  managed/self-hosted PostgreSQL remains possible but is explicitly **not** part of the
  immediate migration.
- **Rationale**: There is no functional requirement forcing an infrastructure change
  right now, and the existing Supabase project is the only working persistence layer in
  the codebase — replacing it before any v0.2 domain logic exists would add risk and
  delay with no immediate benefit.
- **Consequences**: See §7 (updated below) for the specific v0.2 requirements Supabase
  cannot satisfy natively and how they must be addressed at the application layer
  instead. The Node `core-api` (once it exists) and the Python AI services can both
  target the same Supabase Postgres instance (Prisma and SQLAlchemy/Alembic can both
  connect to one physical Postgres database — this is not Supabase-specific), provided
  the schema-ownership split from v0.2 §12 (Node-owned vs. Python-owned tables) is
  respected regardless of which physical database hosts them.
- **Deferred work**: Any future evaluation of self-hosted Postgres+pgvector is out of
  scope until a concrete limitation of Supabase actually blocks a v0.2 requirement in
  practice (as opposed to the theoretical gaps documented in §7).

### Decision 3 — Existing database/data

- **Decision**: Treat existing development/hackathon data as **disposable** unless its
  provenance and legitimacy are explicitly established. Do not migrate existing
  development records into production-like Aavaz data. Do not use existing fabricated or
  synthetic-looking records as real victim/case records. Development and staging must
  use synthetic fixtures only. Any existing test/demo records must be clearly classified
  and isolated.
- **Rationale**: The audit (§6, §9) could not establish with certainty from source code
  alone whether any existing Supabase rows are real or synthetic; `scripts/seed_data.py`
  contains realistic-looking Indian names and phone numbers that are almost certainly
  synthetic demo fixtures, but "almost certainly" is not the same as "confirmed," and
  `CLAUDE.md`'s synthetic-fixtures rule (carried over from the original bootstrap)
  requires the safer default when provenance is unverified.
- **Consequences**: No migration script will be written to carry existing
  `users`/`cases`/`interactions`/`case_updates`/`sos_events` rows into any new schema.
  Existing rows in the current Supabase project should be explicitly labeled (e.g. by
  inspecting and tagging known-seed rows such as those inserted by
  `scripts/seed_data.py` and `scripts/create_staff.py`) so nobody later mistakes them for
  real records. New development/staging work proceeds with freshly authored synthetic
  fixtures only.
- **Deferred work**: The actual classification/labeling/isolation of existing rows, and
  any decision about deleting them outright versus archiving them, is implementation
  work — not performed here. If the project owner can positively confirm specific rows
  are real (unlikely, but not addressed by this decision), that would need its own,
  separate, explicit decision before those rows are treated any differently.

### Decision 4 — SIH/hackathon product surface

- **Decision**: **Preserve** useful existing product surfaces. Existing mobile
  onboarding, OTP UI, home/chatbot/SOS/profile screens, dashboard shells, report
  generation, and other useful UX should be retained where they provide product value.
  They may be refactored as the backend architecture changes. The existing UI must
  **not** force the backend to retain the current monolithic architecture.
- **Rationale**: Consistent with Decision 1 — the UI/UX work (audit §5) is real product
  value independent of the backend's architectural problems, and there is no reason to
  discard it. The explicit constraint (UI must not dictate backend architecture) exists
  because several UI shells currently expect hand-shaped JSON responses tailored to the
  old backend (audit §9, `AAVAZ_MIGRATION_PLAN.md` §9 "Mobile UI/backend contract
  drift") — that convenience must not become a reason to compromise the v0.2 service
  boundary.
- **Consequences**: The mobile/frontend rewiring steps in §4 (steps 9–10) stand as
  written: screens are reconnected to new, correctly-architected endpoints one at a
  time, with the API contract driven by v0.2, not by what's easiest for the existing
  screen code. Where a screen's current data shape and the new API disagree, the screen
  adapts, not the API.
- **Deferred work**: Per-screen rewiring is implementation work, sequenced in §4.

### Decision 5 — Fabricated CNR/legal data

- **Decision**: **Remove it.** The hardcoded real-looking CNR `DLCT110011162019` and any
  fabricated legal/case facts associated with it must not remain in application
  behavior. It must not be replaced with another realistic-looking fake legal record;
  explicitly synthetic fixture data must be used wherever a demo/test case is required.
  Every code path and UI path depending on it must be identified before removal.
- **Rationale**: Per audit §12 item 5 — blending fabricated legal facts (judge names,
  statute sections, transfer history) into what is otherwise presented as verified,
  API-sourced case data is exactly the fabrication pattern `CLAUDE.md` rules 2 and 11
  prohibit, independent of whatever hackathon-demo purpose it originally served.
- **Consequences — full dependency inventory** (established by direct source search,
  not inferred):
  - **Origin**: `backend/services/ecourts_parser.py`, `parse_unstructured_case_data()` —
    an `if cnr == "DLCT110011162019":` block that mutates `raw_data` in place with
    fabricated `courtNo`, `judges`, corrected `caseType`, per-hearing judge
    reassignments, an invented `earlierCourtDetails` transfer record, and a fabricated
    `actsAndSections` list, before the (real) LLM cleanup step ever runs.
  - **Write path**: `backend/api/cases/ecourts_routes.py` (`POST
    /api/v1/ecourts/search`) — persists whatever `parse_unstructured_case_data()`
    returns into `cases.ecourts_data` with no distinction between real and fabricated
    fields.
  - **Read/consume paths**, all of which would surface the fabricated fields as if they
    were genuine API data if that CNR is ever queried again:
    - `backend/api/intake/app_routes.py` (`get_user_cases`) — reads
      `ecourts_data["title"]` for the mobile case list.
    - `backend/api/cases/report_routes.py` — reads `ecourts_data` wholesale to render
      the "official" case-report PDF (judges, acts/sections, hearing/order history,
      `detailed_case_update` narrative) — the single most serious exposure, since a
      generated PDF reads as an authoritative document.
    - `mobile/src/screens/CaseLifecycleScreen.jsx` — renders `ecourts_data.caseType`,
      `.judges`, `.actsAndSections`, `.petitioners`, `.respondents` directly to the
      victim/user in the case timeline UI.
    - `frontend/src/pages/Counsellor/CaseDetail.jsx` — renders
      `ecourts_data.detailed_case_update`, `.nextHearingDate`,
      `.currentStatus`/`.caseStatus` to the counsellor.
  - Removing the special-case block in `ecourts_parser.py` is therefore necessary but
    not sufficient on its own to fully retire the fabricated data — any already-persisted
    `cases.ecourts_data` row for that CNR in the live Supabase project also needs
    checking (tie this to Decision 3's data classification pass, since it's the same
    kind of "is this row real or disposable" question).
- **Deferred work**: Deleting the special-case block, checking the live database for any
  already-persisted instance, and (if a demo case is still needed for the eCourts
  integration) authoring an explicitly synthetic fixture CNR/case record are all
  implementation work, not performed in this documentation pass.

### Decision 6 — AAVAZ v0.2 specification

- **Decision**: Add the authoritative specification to this repository. Ensure
  `docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf` exists on this branch. Do not modify the
  PDF. Treat it as the authoritative engineering specification.
- **Rationale**: Audit §14 item 1 found the spec absent from `targaryens` entirely — it
  only existed on the unrelated `feat/bootstrap` branch and in this assistant's
  in-conversation reading of the file the user supplied directly. Leaving it absent from
  the working branch would mean every future session has to be re-told the spec's
  contents rather than being able to read it directly from the repository.
- **Consequences**: Unlike decisions 1–5, this decision is procedural/documentation
  infrastructure rather than an application-behavior change, so it **is** carried out as
  part of this documentation pass: the PDF was copied byte-for-byte from
  `feat/bootstrap`'s committed copy onto `feat/aavaz-integration` at
  `docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf`, using `git checkout feat/bootstrap --
  docs/spec/AAVAZ_TECHNICAL_WORKFLOW_V0.2.pdf` (a working-tree/index checkout of one path
  from another branch — it does not touch any other file, does not merge or rebase
  anything, and does not modify the PDF's bytes). It has not been committed, per this
  task's instruction not to commit.
- **Deferred work**: None beyond committing it in a future, explicit commit (this
  session stops short of committing per instruction).

---

## 1. Existing feature preservation strategy

Not everything in `targaryens` needs to be discarded. Genuinely working, non-trivial
pieces worth preserving deliberately (ported forward, not deleted-then-rewritten):

- **eCourts integration** (`services/ecourts_scraper.py`, `services/ecourts_parser.py`,
  `api/cases/ecourts_routes.py`): a real, working call to an official-looking eCourts
  JSON API with bearer-token auth — this is *further along* than v0.2 assumed ("no open
  public API... prototype-only adapter"). Worth carrying into the v0.2 `workers`
  court-sync job (Workflow B) as a starting point, **after** removing the hardcoded
  per-CNR fabrication (audit §12 item 5) and confirming with the user whether the API
  itself is officially sanctioned or a reverse-engineered endpoint (this affects the
  "official data-access arrangement preferred" language in v0.2 and the corresponding
  `DECISIONS.md` item on `feat/bootstrap`).
- **PDF report generation** (`api/cases/report_routes.py`, `reportlab`-based): usable as
  a starting point for referral-packet PDF generation (v0.2 Workflow G), whether or not
  the final implementation keeps `reportlab` versus the v0.2-assumed Puppeteer.
- **Mobile design system and screen shells** (`mobile/src/theme/*`,
  `mobile/src/components/*`, and the screen layouts themselves): substantial, polished
  UI work exists for onboarding, home, chatbot, profile, breathing exercise, and SOS
  screens. These are worth keeping as a visual/UX starting point even though their data
  wiring needs to be rebuilt almost entirely (audit §5).
- **Counsellor auto-assignment logic** (`api/assignment/auto_assign.py`): the
  district+language+lowest-caseload matching logic is directionally correct per v0.2
  Workflow A7; it needs a caseload cap and an unassigned-task fallback added, not a
  rewrite from scratch.
- **Staff login against a real identity provider** (`api/auth/auth_routes.py`'s `/login`):
  the only genuinely real authentication path in the codebase. Per Decision 2 (§0),
  Supabase is being kept initially, so this Supabase Auth-backed path can remain in use
  during the transition; the pattern of "real IdP, role claim read from a domain table"
  is sound regardless of which IdP ends up authoritative long-term.

Everything else identified as mocked, stubbed, or architecturally incompatible (audit
§3, §10, §11) should be treated as **reference material for expected behavior**, not as
code to incrementally patch — see §3.

## 2. Architecture reconciliation

**Resolved by Decision 1 (§0): incremental migration.** The Node.js/Python split is
introduced by peeling business logic and domain writes out of the existing FastAPI
monolith into a new Node service, not by building Aavaz v0.2 as a clean-slate rebuild.
This was chosen because it keeps the existing eCourts integration, dashboards, and
mobile UI continuously working during the transition, and lets each extracted piece be
validated against real behavior before moving to the next — at the cost of needing a
carefully sequenced un-tangling of the FastAPI monolith's current
scoring/LLM-calls/domain-writes tangle, so it's never ambiguous which service owns a
given table at any point in the migration.

The reconciliation must address these architectural gaps identified in the audit, in
this dependency order:

1. Introduce a Postgres schema Node can own via Prisma. Per Decision 2 (§0), this is a
   new schema on the existing Supabase project, not a separate self-hosted instance.
2. Stand up a minimal Node `core-api` that becomes the **sole writer** of victim-facing
   domain data — this is the load-bearing architectural change everything else depends
   on, per `CLAUDE.md`'s rule 3 carried over from the original bootstrap.
3. Cut the FastAPI app down to AI-only responsibilities (or split it into the four
   named services), removing its Supabase service-role writes to domain tables.
4. Only after 1–3 are real can the rest of the missing v0.2 features (referrals, audit
   log, lifecycle state machine, scheduling engine) be built against a foundation that
   won't need to be re-architected again.

## 3. Required refactors

(Restating and sequencing audit §13, with urgency markers.)

**Urgent, independent of any broader migration decision:**
- Add server-side authorization to every dashboard/admin/superadmin endpoint. This is a
  standalone security fix that should happen regardless of which architecture path is
  chosen, because the current state (audit §12 item 4) is exploitable if this backend is
  ever reachable outside a local/ngrok demo.
- Remove the hardcoded per-CNR fabricated data in `ecourts_parser.py` and every
  downstream consumer of it (audit §12 item 5; full dependency inventory and disposition
  in Decision 5, §0) — **remove only, do not replace with another realistic-looking fake
  record**; use an explicitly synthetic fixture if a demo case is still needed.

**Sequenced with the architecture decision (§2):**
- Real OTP issuance/delivery/verification (currently: none exists anywhere).
- Real per-scope consent capture wired to the existing (currently unused)
  `ConsentScreen.jsx`, replacing the hardcoded `consent_given: true` paths.
- Lifecycle state machine migration from the 6-stage `case_stage` enum to the v0.2
  11-state machine, including a data migration for any existing rows.
- Replace the mocked scoring pipeline (acoustic/sentiment/engagement/fusion) with either
  real signal sources or an explicitly-labeled interim heuristic that a case manager
  never mistakes for a real model output.
- Build the missing subsystems with no existing code to build from: referrals, audit
  log, scheduling/check-in engine, duress PIN/disguise/safe word, legal issue taxonomy.
- Wire mobile SOS to a real, authenticated backend call and implement the v0.2 SLA
  timers (15-min ack / 30-min contact) in place of the current 30-minute-only poller.
- Consolidate the two PII redaction implementations into one, backed by something more
  than hardcoded string replacement before any tier-based data exposure is trusted.

## 4. Migration sequence

This is the sequence for the incremental-migration path adopted in Decision 1 (§0).

1. **Security patch pass**: auth on all dashboard/admin routes; remove the fabricated
   eCourts CNR data per Decision 5's full dependency inventory (§0); confirm no other
   hardcoded demo data reads as real anywhere in the report/dashboard paths; classify and
   isolate existing seed/demo rows per Decision 3 (§0).
2. **Schema foundation**: stand up the Prisma-owned schema for the core v0.2 domain
   tables (starting with `victims`/`consents`/`safety_settings` — the identity/consent
   slice), independent of the existing `users`/`cases` tables so both can run in
   parallel during transition.
3. **Node `core-api` identity-consent module**: real OTP + per-scope consent, replacing
   the mobile app's fake verification calls one screen at a time (OTP screen first, then
   consent screen, then registration).
4. **Case/profile module**: migrate `cases`/`interactions` semantics into the new schema
   incrementally, keeping the eCourts integration pointed at whichever table is
   currently authoritative during the transition (a data-sync or dual-write period is
   likely necessary — flagged as a risk in §9, not solved here).
5. **Assignment + lifecycle**: port `auto_assign.py` logic into `core-api`, add the
   caseload cap and unassigned-task fallback, migrate the lifecycle enum.
6. **Scheduling/check-in engine**: build the BullMQ-based `workers` scheduler net-new;
   nothing in `targaryens` is salvageable here beyond the concept of the mood-checkin
   endpoint.
7. **AI service split**: carve `agent-svc`/`memory-svc`/`analysis-svc` out of the
   existing FastAPI app's chatbot/scoring code, adding the crisis guard and output guard
   as new logic (not present today in any form) before this path is allowed to reach a
   real victim.
8. **Triage/referral/audit**: build net-new per v0.2, since none of these exist today
   beyond the single-function `rules_engine.py`.
9. **Mobile rewiring**: connect the preserved UI shells (§1) to the new, real backend
   endpoints one screen at a time, starting with auth/consent (since those are both
   currently fake) and SOS (since it's currently disconnected).
10. **Dashboards/console**: migrate `frontend/` from unauthenticated Supabase-role-key
    reads to the new authenticated `core-api` console endpoints.

## 5. Testing requirements

Since **no tests exist anywhere in the current codebase** (audit §8), testing is not a
"keep existing tests green" problem — it's a from-zero build, which is actually an
opportunity to get it right from the start:

- Every new `core-api` module ships with tests before it's considered done, per
  `CLAUDE.md`'s security-sensitive-path rule (carried over from the bootstrap session) —
  OTP, consent, and the lifecycle state machine are the first candidates and are also
  the areas with the most severe current gaps (audit §3, §12).
- The authorization patch (§3, urgent item) needs a regression test proving each
  previously-open dashboard/admin route now rejects unauthorized requests — write the
  failing test first, confirm it fails against current `main`/`feat/aavaz-integration`,
  then fix.
- Any code ported from `targaryens` (eCourts integration, assignment logic, PDF
  generation) gets characterization tests capturing its *current* real behavior before
  being refactored, so behavior changes are deliberate, not accidental.
- Golden-set model evaluation (v0.2 §17) only becomes applicable once a real
  crisis-guard/assessment pipeline exists — not before. Don't build evaluation
  infrastructure for the current keyword-matching stand-ins; it would validate the wrong
  thing.

## 6. Data migration requirements

**Resolved by Decision 3 (§0): no migration of existing rows.** Existing
development/hackathon data (`users`/`cases`/`interactions`/`case_updates`/`sos_events` in
the current Supabase project) is treated as disposable unless its provenance and
legitimacy are explicitly established — which nothing found in this audit does; the
realistic-looking Indian names/phone numbers in `scripts/seed_data.py` are almost
certainly synthetic demo fixtures, not confirmed real data, and the decision's default
applies precisely because "almost certainly" isn't "confirmed."

Concretely:

- The new v0.2 schema starts **empty**. No script maps old rows into it.
- Existing rows are not deleted as part of this decision either — they are to be
  **classified and isolated** (e.g., tagged or moved to a clearly-named
  legacy/demo schema or table set) so nobody mistakes them for real Aavaz v0.2 data
  later, and so the live-schema-vs-`schema.sql` drift noted in audit §9 doesn't get
  carried forward silently into the new system.
- Development and staging environments from this point forward use **synthetic
  fixtures only**, authored fresh for the v0.2 schema — not derived from or seeded by
  any existing `targaryens` row.
- If the project owner later positively confirms specific existing rows are real
  (this would be a surprising finding, but is not ruled out by this decision), that
  requires its own separate, explicit decision before those rows are treated any
  differently — this plan does not pre-authorize migrating anything found to be real.

## 7. Deployment implications

- The existing system has **no deployment/IaC/CI configuration at all** (audit §7) — this
  is a from-zero build, not a migration of existing infra.
- **Resolved by Decision 2 (§0): Supabase is kept initially.** Per that decision's
  requirement to document what v0.2 needs that Supabase cannot satisfy natively:

  | v0.2 requirement | Supabase capability | Gap / what must be built at the application layer |
  |---|---|---|
  | Postgres 16 with pgvector | **Satisfied** — Supabase supports enabling the `pgvector` extension on its managed Postgres. | None — this is not a blocker, and should not be treated as a reason to move off Supabase. |
  | Row-level security as the primary enforcement layer | **Partially satisfied** — Supabase's Postgres RLS is fully capable and already has policies defined (`scripts/apply_rls.sql`). | Not a Supabase limitation but a current *usage* problem: the backend connects with the Supabase service-role key everywhere (audit §2, §9), which bypasses RLS entirely. Any Node `core-api` work must use RLS-respecting, user/service-scoped connections for domain-table access, reserving the service-role key for genuinely privileged operations only. |
  | Redis (sessions, rate limiting, BullMQ queues, Redis Streams) | **Not provided.** Supabase is Postgres + Auth + Storage + Realtime; it has no managed Redis offering. | An external Redis (managed service or self-hosted) must be added regardless of the Postgres decision — this was already true before Decision 2 and remains true after it. |
  | KMS-based envelope encryption with per-victim data keys | **Not provided.** Supabase does not offer an integrated KMS or per-row customer-managed-key encryption service. | Must be built at the application layer against an external KMS (e.g. a cloud provider's KMS), independent of which Postgres hosts the data. |
  | Service-to-service mTLS / short-lived audience-scoped service JWTs | **Out of scope for Supabase** — this is an application/cluster-networking concern, not a database platform feature. | Must be implemented in the Node/Python services themselves, unaffected by the Supabase-vs-self-hosted decision. |
  | Alembic-owned Python tables alongside Prisma-owned Node tables in one physical database | **Satisfied** — Supabase's Postgres is standard Postgres; both Prisma and SQLAlchemy/Alembic can connect to it and own separate tables/schemas within it. | None, provided schema/table ownership is disciplined per v0.2 §12 regardless of physical host. |

  None of these gaps are unique to Supabase — a self-hosted Postgres would need the same
  external Redis and KMS integration. The only genuine Supabase-specific item is the RLS
  usage-pattern fix, which is an application change, not an infrastructure migration.
- The mobile app's hardcoded local/ngrok API URL (audit §5) means there is currently no
  real staging/production environment distinction to preserve — this, too, is being
  built new, not migrated.

## 8. Security/compliance implications

- The two most urgent items from the audit — no server-side authorization anywhere, and
  no real OTP/consent — mean **this system, as it exists on `main`/`feat/aavaz-integration`
  right now, should not be treated as handling real survivor data under any
  circumstances** until at least the authorization patch (§3) lands. This isn't a
  migration-plan nicety; it's a precondition for the repository being safe to keep
  developing against with any data that isn't purely synthetic.
- `COMPLIANCE_AND_PRIVACY.md`'s DPDP-alignment claims (consent, minimization, retention,
  tiered redaction) are **not currently true of the running code** (audit §3, §5, §12) —
  this document should either be corrected to describe actual current state, or clearly
  marked as aspirational/target-state, so nobody mistakes it for an accurate compliance
  record. (Not rewritten in this pass, per the instruction not to rewrite existing
  documentation to match v0.2 — flagged for the user's decision instead.)
- The hardcoded fabricated legal-case data (audit §12 item 5) is a compliance risk in its
  own right if `DLCT110011162019` corresponds to any real matter. **Resolved by Decision
  5 (§0): remove it entirely, with no replacement fake record.** The dependency
  inventory in §0 identifies every path that needs to change; removal itself is
  deferred implementation work.

## 9. Risks

- **Dual-write/data-drift risk during incremental migration** (§4 step 4): running the
  old `users`/`cases` tables and the new Prisma schema side by side, even temporarily,
  risks the eCourts sync job or the mobile app writing to the wrong source of truth.
  Needs an explicit cutover plan per table, not an open-ended parallel-run.
- **Losing working eCourts integration knowledge during extraction** — the hardcoded
  CNR-specific corrections (once stripped of fabrication) likely encode real, hard-won
  knowledge about that API's quirks; removing them carelessly could silently break case
  data quality for that court/case type. Extract the *general pattern* (LLM cleanup of
  inconsistent API responses) rather than deleting the whole file.
- **Mobile UI/backend contract drift** — since the mobile app currently talks to
  hand-rolled JSON responses shaped exactly to its screens (e.g. `get_user_cases`'s
  custom `timeline` array), rewiring it to a v0.2-shaped `core-api` will require either
  adapting the new API to match existing UI expectations or updating every screen's data
  handling — likely both, in pieces, and should not be treated as a drop-in replacement.
- **Scope creep risk**: the SIH hackathon system (distress prediction across a broad
  PoA-Act population, four-tier dashboards, GPS-based SOS) and the v0.2 Aavaz system
  (individual survivor case journeys with legal-issue detection and referral tracking)
  overlap but aren't identical products. Decision 4 (§0) resolves the UI/product-surface
  question — preserve and refactor the existing UI, don't let it constrain the backend —
  but does not by itself resolve every deeper product-scope question (e.g. whether the
  four-tier district/state/national dashboard concept is retained in its current form
  under v0.2's oversight model). Decision 1 (§0) provides the governing principle for
  those remaining questions as they come up during migration: v0.2 is architecturally
  and behaviorally authoritative, so any surviving hackathon-era product concept must be
  reconciled to fit v0.2's model, not the reverse.
- **No rollback path for any live Supabase changes** — since there's no existing backup/
  migration tooling, any schema change against the live project needs its own safety
  plan before it's attempted, independent of this document.

## 10. Recommended next implementation milestone

All six decisions this section previously listed as open have been made by the project
owner and are recorded in full in §0. Nothing in §0 has been implemented in code — this
document only formalizes the decisions themselves (plus the one-time PDF copy under
Decision 6, which is a documentation/asset action, not an application-behavior change).

**Recommended first concrete implementation milestone, now that the decisions are
locked in**: the **security patch pass** from §4 step 1 — adding authorization to every
dashboard/admin/superadmin endpoint, removing the fabricated eCourts CNR data per
Decision 5's dependency inventory (§0), and classifying/isolating existing seed/demo
rows per Decision 3 (§0). This remains the right first step because it is valuable and
low-risk under every one of the six decisions, and because leaving it unaddressed makes
every subsequent incremental-migration step (§4) riskier to build and demo against. This
should be done as its own reviewed change, with the regression tests described in §5,
before any v0.2 feature work begins.
