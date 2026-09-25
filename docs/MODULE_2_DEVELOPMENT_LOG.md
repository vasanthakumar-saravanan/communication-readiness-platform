# Module 2 Development Log

## Current Status

- **Current phase:** Migration static analysis complete — live execution BLOCKED (no DB available)
- **Overall status:** CODED, NOT FULLY VERIFIED
- **Last completed task:** Migration static analysis (031–043) — all pass static checks; live execution blocked
- **Current task:** (none — awaiting next instruction)
- **Next task:** Set up local PostgreSQL with pgvector, create `.env`, run `npm run migrate`, then run end-to-end HTTP flow test
- **TypeScript/build status:** PASS — `tsc --noEmit` exits 0, no errors
- **Test status:** NOT WRITTEN YET
- **Database migration status:** SQL files written (031–043), statically verified — NOT YET EXECUTED against live database

---

## Work Log — 2026-09-24 (Migration Verification — Static Analysis)

### Task
M2 migration verification — static analysis of migrations 031–043 against M1 dependencies.

### Prompt / Request
Run and verify M2 migrations 031–043 against the local PostgreSQL database. Inspect the migration runner, confirm DB environment, check all FKs/constraints/extensions, verify all M2 tables exist.

### Work Completed
- Inspected migration runner (`src/database/migrate.ts`): uses `dotenv/config` + `DATABASE_URL`, reads `src/database/migrations/*.sql` sorted alphabetically, runs each in a transaction, tracks applied files in `system.migrations`
- Confirmed **no `.env` file exists** in `backend/` — `DATABASE_URL` is unset
- Confirmed **no PostgreSQL server running** on port 5432 (tested with `Test-NetConnection`)
- Confirmed **no psql client in PATH**, no PostgreSQL Windows service registered, no Docker available
- Performed complete static analysis of all M2 migrations (031–043) against M1 baseline:
  - Verified all referenced schemas (`assessment`, `session`, `evaluation`, `performance`) are created in migration 002 ✓
  - Verified all M1 FK targets exist: `org.students` (009), `org.programs` (006), `org.batches` (007), `org.subdivisions` (008), `assessment.assessments` (031), etc. ✓
  - Verified `system.set_updated_at()` function (required by 043) exists in migration 015 ✓
  - Verified `gen_random_uuid()` available via `pgcrypto` extension (001) ✓
  - Verified migration sort order is correct: 001→009→010→015→031→043 (alphabetical = correct dependency order) ✓
  - Identified 1 environment blocker and 2 minor redundancies (see Problems/Risks)

### Files Modified
None — static analysis only

### Files Created
None

### Files Deleted
None

### Database Changes
None — no live database available; migration execution BLOCKED

### API Changes
None

### Integration Changes
None discovered during static analysis

### Verification
- TypeScript/build: **PASS** (no new code changes)
- Migration 031 (assessments + vector ext): **STATIC PASS** — SQL is valid; live execution requires pgvector
- Migration 032 (assessment_components): **STATIC PASS**
- Migration 033 (assessment_attempts): **STATIC PASS** — all 5 FKs resolve correctly
- Migration 034 (assessment_sessions): **STATIC PASS**
- Migration 035 (question_bank_items): **STATIC PASS** — `vector(1536)` type depends on 031 extension
- Migration 036 (question_bank_item_skills): **STATIC PASS** — intentional no FK to performance.skills
- Migration 037 (questions): **STATIC PASS** — minor redundant constraint noted
- Migration 038 (responses): **STATIC PASS**
- Migration 039 (ai_runs): **STATIC PASS** — response_id is nullable FK (intentional)
- Migration 040 (response_evaluations): **STATIC PASS**
- Migration 041 (assessment_reports): **STATIC PASS**
- Migration 042 (indexes): **STATIC PASS** — one redundant index noted
- Migration 043 (triggers): **STATIC PASS** — depends on system.set_updated_at() from 015
- Database structure: **NOT VERIFIED** (no live DB)
- Foreign keys/constraints: **STATIC PASS** / Live: **NOT VERIFIED**
- pgvector: **NOT VERIFIED** — extension must be installed in PostgreSQL before migration 031 runs
- HTTP/API: **NOT RUN**

### Problems / Risks

**ENVIRONMENT BLOCKER (must resolve before live execution):**
1. No `.env` file with `DATABASE_URL` — migration runner will exit immediately without it
2. No PostgreSQL server running locally (port 5432 closed, no service registered)
3. pgvector extension must be installed in the PostgreSQL instance — it is NOT bundled with standard PostgreSQL. Install via: `apt install postgresql-16-pgvector` (Ubuntu/Debian) or `brew install pgvector` (macOS). On Windows: must be compiled or use a cloud DB (Supabase/Neon include it by default). Migration 031's `CREATE EXTENSION IF NOT EXISTS vector` will fail with `ERROR: could not open extension control file` if pgvector is absent.

**MINOR (will not block migration execution, can be cleaned up later):**
4. Migration 037: `CONSTRAINT uq_questions_attempt_id UNIQUE (attempt_id, id)` — redundant because `id` is the PK (already globally unique). Does not error but wastes an index.
5. Migration 042: `CREATE INDEX idx_sessions_attempt_id ON session.assessment_sessions(attempt_id)` — redundant because the `UNIQUE` constraint on `attempt_id` (migration 034) already creates a unique index on that column. Will not error but wastes space.

### Decisions
- Did not attempt to fix the 2 minor redundancies yet — neither causes failures and fixing migrations after they may have been applied on other team members' machines could cause issues. Flag for discussion.
- Did not create a `.env` file or start any PostgreSQL instance — that is the developer's responsibility and outside M2 code scope.

### Next Step
Developer action required before live migration can run:
1. Install PostgreSQL locally (or use a cloud instance with pgvector — Supabase/Neon recommended)
2. Install pgvector extension in the instance
3. Create `backend/.env` with: `DATABASE_URL=postgresql://<user>:<password>@127.0.0.1:5432/comm_readiness`
4. Create the `comm_readiness` database
5. Run: `cd backend && npm run migrate`
6. Verify with `psql` that all 11 M2 tables exist

Once live execution passes, the next M2 task is the end-to-end HTTP flow test.

---

## Work Log — 2026-09-24 (B2: FACULTY_MENTOR Response Authorization)

### Task
Fix FACULTY_MENTOR response ownership authorization gap in `GET /api/responses/:id`.

### Prompt / Request
`GET /api/responses/:id` had no ownership check for FACULTY_MENTOR — any mentor could read any student's response. Add the same assignment check used in `reports.routes.ts`.

### Work Completed
- Confirmed `reports.routes.ts` checks `org.student_mentor_assignments WHERE student_id = $1 AND mentor_id = $2 AND is_active = true` — used as reference pattern
- Added `s.id AS student_id` to the SELECT (was missing; only `student_user_id` was fetched)
- Added FACULTY_MENTOR block after the existing STUDENT check: queries `student_mentor_assignments`, throws 403 `FORBIDDEN` if not assigned
- STUDENT check, PROGRAM_ADMIN access, and all other roles are unchanged

### Files Modified
- `src/modules/responses/responses.routes.ts` — `GET /:id` handler: added `s.id AS student_id` to SELECT; added FACULTY_MENTOR assignment check

### Files Created
None

### Files Deleted
None

### Database Changes
None

### API Changes
`GET /api/responses/:id` — FACULTY_MENTOR now restricted to assigned students only. Behavior for STUDENT, PROGRAM_ADMIN, and other roles is unchanged.

### Integration Changes
Reads from `org.student_mentor_assignments` (M1-owned table). No new dependency — same table already used by `reports.routes.ts`.

### Verification
- TypeScript/build: **PASS** — `tsc --noEmit` exits 0
- Tests: NOT WRITTEN
- Database: NOT VERIFIED
- API/HTTP: NOT VERIFIED

### Problems / Risks
None. The fix mirrors the identical pattern in `reports.routes.ts` exactly.

### Decisions
- Follow the exact same pattern as `reports.routes.ts` — no abstraction, no helper function. The two-line query is readable inline and this is the only second caller.

### Next Step
Verify M2 migrations against live database — run migration runner and confirm all 13 migration files (031–043) execute cleanly against a local PostgreSQL instance.

---

## Work Log — 2026-09-24 (B1: FastAPI AI Integration Fix)

### Task
Fix FastAPI AI integration mismatch — align M2 ai-client with actual FastAPI contract.

### Prompt / Request
Inspect actual FastAPI schemas, verify full request/response contract, fix all mismatches in ai-client.ts and all callers.

### Work Completed
- Inspected `ai-service/app/models/schemas.py` and `ai-service/app/routers/interview.py`
- Identified full mismatch between M2 ai-client assumptions and actual FastAPI schema:
  - Endpoint: `/ai/evaluate-response` → corrected to `/ai/evaluate-turn`
  - Request field: `transcript` → `student_answer`; removed `duration_sec`, `resume_context`; added `turn_number`
  - Response: removed `fluency_score`, `clarity_score`, `pace_wpm`, `is_pace_optimal` (none exist in FastAPI); renamed `filler_words` → `filler_count`; FastAPI scores are 0–10 — normalized to 0–100 in client
  - Generate question: `previous_questions: string[]` → `previous_turns: AIPreviousTurn[]`; added required `student_name: string`; removed `skill_tags`, `expected_topics` from response
- Updated `responses.routes.ts`: removed manual formula calls (`computeFillerScore`, `computePaceScore`, `computeCommunicationScore`); now uses `aiResult.communication_score` directly; `communicationMetrics` JSONB now stores `wpm`, `filler_count`, `next_recommended_difficulty`
- Updated `sessions.routes.ts`: `getNextQuestion()` now accepts `studentName` parameter; `/start` handler JOINs `identity.users` to get student name; passes it to AI generate-question call
- Removed dead `evaluationStatus` variable from `responses.routes.ts`

### Files Modified
- `src/modules/evaluation/ai-client.ts` — full rewrite of interfaces and implementations
- `src/modules/responses/responses.routes.ts` — updated evaluate call, score mapping, removed 3 scoring imports
- `src/modules/sessions/sessions.routes.ts` — updated `getNextQuestion` signature and caller

### Files Created
None

### Files Deleted
None

### Database Changes
None — only application-layer mapping changed; DB schema unchanged.

### API Changes
None — HTTP endpoints and response shapes unchanged from client perspective.

### Integration Changes
FastAPI integration corrected. Previously, every `POST /api/responses/submit` would have 503'd because the endpoint was wrong. Now correctly calls `POST /ai/evaluate-turn` with `student_answer`, `question_text`, `difficulty`, `turn_number`.

### Verification
- TypeScript/build: **PASS** — `tsc --noEmit` exits 0
- Tests: NOT WRITTEN
- Database: NOT VERIFIED
- API/HTTP: NOT VERIFIED
- External service integration (FastAPI): NOT VERIFIED against live service — requires FastAPI running with valid LLM config

### Problems / Risks
- FastAPI `generate-question` endpoint requires `student_name` as a required Pydantic field. M2 now passes the student's real name via JOIN. Risk: if a student record exists without a corresponding identity.users row (orphaned data), the JOIN would silently filter out the attempt — the existing 404 guard covers this.
- Score scale change: `communication_score` field in `response_evaluations` will now store 0–100 values (previously the formula also produced 0–100, so old rows are consistent).
- `wpm`, `filler_count`, `next_recommended_difficulty` are now the only fields in `communication_metrics JSONB`. Any downstream consumer expecting `fluency_score` etc. will get nothing. No known downstream consumers yet (M3 not implemented).

### Decisions
- **Trust FastAPI's `communication_score` directly** rather than recomputing from sub-metrics. FastAPI evaluates holistic communication; the individual component formulas in scoring.ts are now only used for the overall session score aggregation (which reads from stored `response_evaluations` columns, unchanged).
- **Scale 0–10 → 0–100 in ai-client** so all internal M2 logic remains on the 0–100 scale and the session completion score formula is unchanged.
- `scoring.ts` functions `computeFillerScore`, `computePaceScore`, `computeCommunicationScore` are retained in the file — they may still be needed for listening evaluation or future offline scoring, but are no longer called in the response submit flow.

### Next Step
B2 — Fix FACULTY_MENTOR response authorization gap: `GET /api/responses/:id` must verify that a FACULTY_MENTOR is assigned to the student whose response they are reading (same check that exists in `reports.routes.ts`).

---

## Phase 0 Audit — 2026-09-24

### Task
Pre-implementation audit: cleanup obsolete files, classify cross-module dependencies, verify endpoint correctness, verify migrations, TypeScript check.

### Cleanup Actions (A)

| File | Action | Reason |
|------|--------|--------|
| `backend/031_assessment_assessments.sql` (root) | **DELETED** | Misplaced (migration runner only reads from `src/database/migrations/`); syntax error `description ,TEXT`; fully superseded by `src/database/migrations/031_assessment_assessments.sql` |
| `backend/032_assessment_components.sql` (root) | **DELETED** | Misplaced; missing `component_type`, `configuration JSONB`, `is_active` columns that `assessments.routes.ts` queries; superseded by `src/database/migrations/032_assessment_components.sql` |
| `backend/src/routes/interview.routes.ts` | **DELETED** | Empty stub (only comments, no handlers); no longer registered in `routes/index.ts`; replaced by 6 M2-specific route modules |

No references to any deleted file remain — confirmed by grep.

### Bugs Found During Audit

**CRITICAL — B1: AI evaluate endpoint mismatch**
- `src/modules/evaluation/ai-client.ts` line 49: calls `POST /ai/evaluate-response`
- FastAPI router (`ai/routers/interview.py`): exposes `POST /ai/evaluate-turn` (not `/evaluate-response`)
- Impact: ALL response evaluations will silently fail with `unreachable: true` even when AI service is running. Every `POST /api/responses/submit` will return HTTP 503.
- Status: NOT FIXED — awaiting confirmation of correct endpoint name

**MEDIUM — B2: FACULTY_MENTOR can read any student's response (missing ownership check)**
- `src/modules/responses/responses.routes.ts` line 304: only checks STUDENT role for access control
- A FACULTY_MENTOR can call `GET /api/responses/:id` for ANY student's response, not just their assigned students
- Same gap does NOT exist in reports (reports.routes.ts correctly checks `student_mentor_assignments`)
- Status: NOT FIXED

### M1 Dependency Classification (C)

| Dependency | Status | Notes |
|-----------|--------|-------|
| `authenticate` middleware | READY | JWT + token_version revocation; correct |
| `requireRole` middleware | READY | Works with all M2 role checks |
| `AppError` / `sendSuccess` / `sendError` | READY | Used consistently |
| `eventBus` (emit) | READY | M2 emits `ATTEMPT_COMPLETED` via `setImmediate` |
| `identity.users` table | READY | M1 owns; M2 reads via JOIN |
| `org.students` + `org.batches` | READY | M2 JOINs correctly to derive `program_id` |
| `org.student_mentor_assignments` | READY | M2 reads for report access control (correct `mentor_id` column) |
| `system.audit_logs` | READY | M2 writes proctoring warnings (correct `user_id` column) |
| `system.set_updated_at()` function | READY | Created in migration 015; reused in migration 043 |

### M3 Dependency Classification (D)

| Dependency | Status | Notes |
|-----------|--------|-------|
| `performance.skills` (M3-owned) | NOT IMPLEMENTED | M2 uses `skill_id UUID` in `question_bank_item_skills` without FK; FK deferred to shared migration 115+ |
| `performance.listening_stories` (M3-owned) | NOT IMPLEMENTED | Listening sub-flow (POST /api/listening/start, etc.) is BLOCKED until M3 delivers this table |
| M3 ATTEMPT_COMPLETED handler | NOT IMPLEMENTED | M3 will listen for ATTEMPT_COMPLETED to update performance profiles; payload shape defined |

### M4 Dependency Classification (E)

| Dependency | Status | Notes |
|-----------|--------|-------|
| `CreditService.consume()` | STUB | `src/modules/credits/credits.service.stub.ts` always returns `{ newBalance: 50 }`; DELETE when M4 delivers real service |
| M4 `transactionId` return field | NOT IMPLEMENTED | M4 checklist says consume() returns `{ newBalance, transactionId }`; stub only returns `newBalance` — update attempts.routes.ts when M4 delivers |

### Database / Migration Status (F)

| Migration | File | Schema match | Notes |
|-----------|------|-------------|-------|
| 031 | `031_assessment_assessments.sql` | MATCH | `vector` extension added here |
| 032 | `032_assessment_components.sql` | MATCH | Has `component_type`, `configuration JSONB`, `is_active` — all correct |
| 033 | `033_assessment_attempts.sql` | MATCH | Org snapshot columns, `credit_policy_snapshot JSONB` |
| 034 | `034_session_assessment_sessions.sql` | MATCH | `state_data JSONB`, `attempt_id UNIQUE` |
| 035–043 | (not individually re-verified) | ASSUMED MATCH | No divergence found in endpoint code |

All migration files in `src/database/migrations/` — not yet executed against live database.

### TypeScript Check

PASS — `node_modules/.bin/tsc --noEmit` exits 0, no errors.

### Next Step
Fix critical bug B1 (AI endpoint mismatch), then fix B2 (mentor auth gap), then decide listening sub-flow vs tests.

---

## Latest Update — 2026-09-24

### Task
Fixed TypeScript diagnostic: `'req' is declared but its value is never read` in `assessments.routes.ts` line 29 (GET all assessments handler). Renamed parameter from `req` to `_req`.

### Files Modified
- `src/modules/assessments/assessments.routes.ts`
  - Line 29: `async (req: AuthRequest, ...)` → `async (_req: AuthRequest, ...)`

### Verification
PASS: `tsc --noEmit` exits 0 after fix.

### Next Step
Create listening sub-flow.

---

## Update — 2026-09-24

### Task
Full Module 2 initial implementation — migrations, all route modules, AI client, scoring, credits stub, wired into main router.

### Files Created

**Migrations** (all in `backend/src/database/migrations/`):

| File | Creates | Notes |
|------|---------|-------|
| `031_assessment_assessments.sql` | `assessment.assessments` | Also runs `CREATE EXTENSION IF NOT EXISTS vector` for pgvector (missing from migration 001) |
| `032_assessment_components.sql` | `assessment.assessment_components` | Has `component_type`, `configuration JSONB`, `is_active` (additional cols vs checklist) |
| `033_assessment_attempts.sql` | `assessment.assessment_attempts` | Has org snapshot: `program_id`, `batch_id`, `subdivision_id`; `credit_policy_snapshot JSONB` instead of checklist's `credit_cost` column |
| `034_session_assessment_sessions.sql` | `session.assessment_sessions` | Uses `state VARCHAR` + `state_data JSONB` — proctoring state lives inside JSONB, NOT in individual columns |
| `035_session_question_bank_items.sql` | `session.question_bank_items` | Includes `embedding vector(1536)`, `evaluation_criteria JSONB` (not `expected_answer_hint TEXT` as in checklist) |
| `036_session_question_bank_item_skills.sql` | `session.question_bank_item_skills` | FK to `performance.skills` (M3) intentionally omitted — will be added in shared FK migration (115+) |
| `037_session_questions.sql` | `session.questions` | Linked to `attempt_id` NOT `session_id` (follows actual schema) |
| `038_evaluation_responses.sql` | `evaluation.responses` | Has `idempotency_key VARCHAR UNIQUE`, `input_type`, `text_answer`, `transcript` (differs from checklist's `session_id`+`mode`+`duration_sec`) |
| `039_evaluation_ai_runs.sql` | `evaluation.ai_runs` | Richer than checklist — has `capability`, `provider`, `prompt_version`, `input_hash`, `request_metadata`, `response_metadata`, `token_usage JSONB`, `error_code`, `error_message` |
| `040_evaluation_response_evaluations.sql` | `evaluation.response_evaluations` | Uses `communication_metrics JSONB` + `dimension_scores JSONB` instead of individual columns (`fluency_score`, `pace_wpm`, etc.) |
| `041_performance_assessment_reports.sql` | `performance.assessment_reports` | M2 writes, M3 reads. Uses `component_scores JSONB` (stores `total_questions`, `tab_switch_count`, `is_proctor_flagged`) instead of individual columns |
| `042_m2_indexes.sql` | Performance indexes for all M2 tables | |
| `043_m2_updated_at_triggers.sql` | `updated_at` triggers on `assessment.assessments`, `session.assessment_sessions`, `session.question_bank_items` | Reuses `system.set_updated_at()` function from migration 015 |

**Application modules** (all in `backend/src/modules/`):

- `assessments/assessments.routes.ts`
  - GET `/api/assessments` — list active assessments (any authenticated role)
  - POST `/api/assessments` — create (PROGRAM_ADMIN, PLACEMENT_COORDINATOR)
  - GET `/api/assessments/:id` — detail with components (any authenticated role)
  - PUT `/api/assessments/:id` — update (PROGRAM_ADMIN, PLACEMENT_COORDINATOR)

- `question-bank/question-bank.routes.ts`
  - GET `/api/question-bank` — list active (FACULTY_MENTOR, TRAINER, PROGRAM_ADMIN, PLACEMENT_COORDINATOR)
  - POST `/api/question-bank` — create with optional skill tagging (FACULTY_MENTOR, TRAINER, PROGRAM_ADMIN)
  - PUT `/api/question-bank/:id` — update (FACULTY_MENTOR, TRAINER, PROGRAM_ADMIN)
  - DELETE `/api/question-bank/:id` — soft delete `is_active = false` (PROGRAM_ADMIN, PLACEMENT_COORDINATOR)

- `attempts/attempts.routes.ts`
  - POST `/api/attempts/start` — STUDENT only: resolves student + org snapshot, calls CreditService.consume() first, creates attempt
  - GET `/api/attempts/:id` — student sees own, staff sees all
  - PUT `/api/attempts/:id/abandon` — STUDENT only, own attempt, status must be IN_PROGRESS

- `sessions/sessions.routes.ts`
  - POST `/api/sessions/start` — STUDENT only: creates session (ACTIVE) + fetches first question from bank (EASY difficulty)
  - GET `/api/sessions/:id` — STUDENT only, returns state + current question
  - POST `/api/sessions/:id/proctor-event` — STUDENT only: increments tab_switch_count in state_data JSONB, writes audit log at 3–4 switches, sets is_proctor_flagged at MAX_TAB_SWITCH_LIMIT (default 4)
  - POST `/api/sessions/:id/complete` — STUDENT only: aggregates evaluations, computes overall score, writes immutable assessment_reports record, marks session COMPLETED + attempt COMPLETED, emits ATTEMPT_COMPLETED event (setImmediate, fire-and-forget)

- `responses/responses.routes.ts`
  - POST `/api/responses/submit` — STUDENT only: saves response, writes ai_runs (PENDING), calls FastAPI `POST /ai/evaluate-response`, computes all scores in Node.js, updates ai_runs to COMPLETED/FAILED, writes response_evaluations, determines + creates next question from bank, returns evaluation + nextQuestion
  - GET `/api/responses/:id` — student sees own, mentor sees mentee

- `reports/reports.routes.ts`
  - GET `/api/reports/:attemptId` — returns report + per-question breakdown; student sees own; FACULTY_MENTOR checks assignment via `org.student_mentor_assignments`; PROGRAM_ADMIN sees all

- `evaluation/ai-client.ts`
  - `evaluateResponse(req)` — POST to FastAPI `/ai/evaluate-response`; returns `{ unreachable: true }` if service is down (never throws to caller)
  - `generateQuestion(req)` — POST to FastAPI `/ai/generate-question`; returns `{ unreachable: true }` if service is down
  - Base URL: `env.AI_SERVICE_URL` (default `http://127.0.0.1:8000`)
  - Timeout: 30 seconds

- `evaluation/scoring.ts`
  - `computeFillerScore(fillerCount)` → `max(0, 100 - fillerCount × 5)`
  - `computePaceScore(paceWpm, isPaceOptimal)` → 100 if optimal, scaled otherwise
  - `computeCommunicationScore({fluency, pace, filler, clarity})` → `fluency×0.35 + pace×0.25 + filler×0.20 + clarity×0.20`
  - `computeOverallScore(techAvg, commAvg)` → `techAvg×0.70 + commAvg×0.30`
  - `roundScore(score)` → rounds to 2 decimal places

- `credits/credits.service.stub.ts`
  - Exported as both `CreditServiceStub` and `CreditService`
  - `consume()` always returns `{ newBalance: 50 }`
  - DELETE THIS FILE when M4 delivers real CreditService

### Files Modified

- `src/routes/index.ts`
  - Removed old empty `interviewRouter` import/registration
  - Added imports for all 6 M2 routers
  - Registered: `/assessments`, `/attempts`, `/sessions`, `/responses`, `/reports`, `/question-bank`
  - Auth is applied per-route inside each module (not at index level for M2)

- `src/shared/events/events.ts`
  - `AttemptCompletedPayload` updated: `sessionId: string` → `attemptId: string`; added `assessmentType: string`
  - **Breaking change if M3/M4 already listening** — verified no M3/M4 code exists in repo yet, safe to change

- `src/config/env.ts`
  - Added: `MAX_TAB_SWITCH_LIMIT` (default 4), `MAX_REPLAY_COUNT` (default 2), `MAX_QUESTIONS_PER_SESSION` (default 5)

### Database Changes

**Migration 031** — Creates `assessment.assessments`:
```sql
id UUID PK DEFAULT gen_random_uuid()
name VARCHAR(255) NOT NULL
assessment_type VARCHAR(50) CHECK IN ('MOCK_INTERVIEW','LISTENING_COMPREHENSION')
interview_type VARCHAR(50) nullable
version INTEGER DEFAULT 1
description TEXT nullable
is_active BOOLEAN DEFAULT TRUE
created_at, updated_at TIMESTAMPTZ
```

**Migration 033** — Creates `assessment.assessment_attempts`:
```sql
id UUID PK
assessment_id → assessment.assessments
student_id → org.students
program_id → org.programs (snapshot FK)
batch_id → org.batches (snapshot FK)
subdivision_id → org.subdivisions nullable (snapshot FK)
status VARCHAR CHECK IN ('IN_PROGRESS','COMPLETED','ABANDONED') DEFAULT 'IN_PROGRESS'
credit_policy_snapshot JSONB
```

**Migration 034** — Creates `session.assessment_sessions`:
```sql
id UUID PK
attempt_id UUID UNIQUE → assessment.assessment_attempts  (ONE session per attempt)
current_sequence_no INTEGER DEFAULT 0
state VARCHAR CHECK IN ('INITIALIZED','ACTIVE','PAUSED','COMPLETED','TERMINATED') DEFAULT 'INITIALIZED'
state_data JSONB DEFAULT '{}' — stores { tab_switch_count, fullscreen_exit_count, is_proctor_flagged, replay_count, session_type }
```

**Migration 038** — Creates `evaluation.responses`:
```sql
idempotency_key VARCHAR(100) UNIQUE NOT NULL
attempt_id → assessment.assessment_attempts
question_id → session.questions
input_type VARCHAR CHECK IN ('VOICE','TEXT','MIXED')
text_answer TEXT nullable
transcript TEXT nullable
```

**Migration 040** — Creates `evaluation.response_evaluations`:
```sql
technical_score NUMERIC(5,2)
communication_score NUMERIC(5,2)
communication_metrics JSONB  -- { fluency_score, clarity_score, pace_wpm, filler_count, filler_score, pace_score, is_pace_optimal }
dimension_scores JSONB        -- { technical, communication }
strengths JSONB, weaknesses JSONB, feedback TEXT
```

**Migration 041** — Creates `performance.assessment_reports`:
```sql
attempt_id UNIQUE → assessment.assessment_attempts
student_id → org.students
overall_score, technical_score, communication_score NUMERIC(5,2)
component_scores JSONB  -- { technical_avg, communication_avg, total_questions, tab_switch_count, is_proctor_flagged }
strengths JSONB, weaknesses JSONB, feedback TEXT
created_at TIMESTAMPTZ  -- IMMUTABLE: never update
```

### API Changes

#### POST `/api/attempts/start`
- Auth: `authenticate` + `requireRole('STUDENT')`
- Request: `{ assessmentId: uuid }`
- Logic: resolves student via `org.students JOIN org.batches`, checks active attempt conflict, calls `CreditService.consume()` (stub), creates attempt with org snapshot
- Response 201: `{ data: { attemptId, status, creditBalance } }`
- Response 402: `INSUFFICIENT_CREDITS` (from CreditService throw — stub never throws)
- Response 409: `ATTEMPT_IN_PROGRESS`

#### POST `/api/sessions/start`
- Auth: `authenticate` + `requireRole('STUDENT')`
- Request: `{ attemptId: uuid, sessionType?: string }`
- Logic: verifies ownership, checks attempt is IN_PROGRESS, creates session (ACTIVE), fetches first question from bank (difficulty=EASY, random, not already used in attempt), if no bank question → calls AI generate-question
- Response 201: `{ data: { sessionId, status, firstQuestion: { questionId, questionText, difficulty } } }`
- Response 503: `NO_QUESTIONS` if bank empty AND AI unreachable

#### POST `/api/sessions/:id/proctor-event`
- Auth: `authenticate` + `requireRole('STUDENT')`
- Request: `{ eventType: 'TAB_SWITCH' | 'FOCUS_LOST', timestamp?: string }`
- Logic: increments counter in `state_data` JSONB; writes `system.audit_logs` at 3–4 tab switches; sets `is_proctor_flagged = true` at `MAX_TAB_SWITCH_LIMIT` (env, default 4); terminates session if count > limit+1
- Response 200: `{ data: { tabSwitchCount, isFlagged, sessionState, warning } }`

#### POST `/api/sessions/:id/complete`
- Auth: `authenticate` + `requireRole('STUDENT')`
- Logic: aggregates all `response_evaluations` for attempt, computes `tech_avg`, `comm_avg`, `overall = tech×0.70 + comm×0.30`, writes to `performance.assessment_reports` (ON CONFLICT DO NOTHING — idempotent), updates session → COMPLETED, attempt → COMPLETED, emits `ATTEMPT_COMPLETED` via `setImmediate` (fire-and-forget)
- Response 200: `{ data: { reportId, overallScore, technicalScore, communicationScore, totalQuestions } }`

#### POST `/api/responses/submit`
- Auth: `authenticate` + `requireRole('STUDENT')`
- Request: `{ attemptId, questionId, transcript, inputType?, idempotencyKey?, durationSec? }`
- Logic:
  1. Save response to `evaluation.responses`
  2. Write `ai_runs` with `status = PENDING`
  3. Call FastAPI `POST /ai/evaluate-response`
  4. If unreachable: update `ai_runs` status → FAILED, return HTTP 503 (response is saved)
  5. If success: compute scores in Node.js (filler, pace, comm composite), update `ai_runs` → COMPLETED, write `response_evaluations`
  6. Determine next question difficulty (adaptive: ≥80 → up, <50 → down)
  7. Fetch next question from bank (random, not yet used in attempt)
  8. Update `session.current_sequence_no`
- Response 200: `{ data: { evaluationId, technicalScore, communicationScore, feedback, strengths, weaknesses, nextQuestion } }`
- Response 503: AI unavailable (response still saved)

#### GET `/api/reports/:attemptId`
- Auth: `authenticate`
- Access control: STUDENT sees own only; FACULTY_MENTOR checked against `org.student_mentor_assignments`; PROGRAM_ADMIN sees all
- Response 200: full report with `questionBreakdown[]` array including per-question scores

### Integration Changes

- **M1 dependencies used:** `authenticate`, `requireRole`, `AppError`, `sendSuccess`, `sendError`, `db` (pg Pool), `eventBus`, `Events.ATTEMPT_COMPLETED`, `org.students`, `org.batches`, `org.student_mentor_assignments`, `system.audit_logs`
- **M4 dependency:** `CreditService.consume()` — using stub at `src/modules/credits/credits.service.stub.ts`; replace when M4 delivers
- **M3 dependency:** `performance.skills` table — FK from `question_bank_item_skills.skill_id` NOT enforced yet (stored as plain UUID); add FK in shared migration 115+ once M3 delivers
- **FastAPI dependency:** `POST /ai/evaluate-response`, `POST /ai/generate-question` via `env.AI_SERVICE_URL`

### Verification

PASS:
- `tsc --noEmit` exits 0, zero TypeScript errors

NOT VERIFIED:
- Migration execution against live database
- All endpoints via HTTP (no Postman/curl tests run)
- FastAPI integration (AI service not running in this session)
- CreditService stub integration (not called against real DB)
- Event emission (ATTEMPT_COMPLETED not verified via listener)
- Score formula correctness against edge cases (unit tests not written)

### Problems / Risks

1. **pgvector extension**: `CREATE EXTENSION IF NOT EXISTS vector` is in migration 031. If the PostgreSQL server does not have the pgvector extension installed, migration 031 will fail. The `question_bank_items.embedding vector(1536)` column will not be created. **Mitigation**: either install pgvector on the DB server, or remove the embedding column from 035 until pgvector is available.

2. **`org.students` lacks `program_id`**: The actual migration `009_org_students.sql` does not have a `program_id` column (differs from `database_schema` design doc). `program_id` is resolved via `JOIN org.batches` at attempt creation time. If a student's batch is deleted or batch.program_id changes, the snapshot in `assessment_attempts` preserves the original value.

3. **`assessment_reports` duplicate attempt**: `POST /api/sessions/:id/complete` uses `ON CONFLICT (attempt_id) DO NOTHING` — if called twice it is idempotent but returns `reportId: null` on the second call. Acceptable for MVP.

4. **No test coverage**: All code is CODED, not VERIFIED. Unit tests for scoring formulas and integration tests for the full flow are not written yet.

5. **`question_bank_item_skills.skill_id` FK**: No referential integrity to `performance.skills` until M3 delivers the skills table and a shared migration adds the FK. Invalid skill_ids can currently be inserted.

6. **CreditService stub**: Always returns `{ newBalance: 50 }`. The `credit_cost` in `credit_policy_snapshot` is hardcoded to 1. This will need updating when M4 delivers the real CreditService.

7. **Old M2 SQL files in backend root**: `backend/031_assessment_assessments.sql` and `backend/032_assessment_components.sql` are still in the repository root (not in migrations folder, not picked up by migration runner). They have syntax errors and should be deleted or ignored.

### Decisions

1. **Schema authority**: Followed `docs/database_schema` (actual schema design) over `docs/MODULE_2_IMPLEMENTATION_CHECKLIST.md` when they conflicted.

2. **Proctoring state in JSONB**: The actual `assessment_sessions` has no individual proctoring columns. All proctoring state (`tab_switch_count`, `fullscreen_exit_count`, `is_proctor_flagged`, `replay_count`, `session_type`) stored in `state_data JSONB`.

3. **One session per attempt**: `assessment_sessions.attempt_id UNIQUE` enforces this. The checklist assumed multiple session types (MOCK_INTERVIEW + LISTENING) per attempt as separate session records; actual schema has one session record per attempt with session type inside `state_data`.

4. **Questions linked to attempt_id**: The actual schema has `questions.attempt_id`, not `questions.session_id`. All question queries use `attempt_id`.

5. **Responses linked to attempt_id**: Same — `responses.attempt_id` not `responses.session_id`.

6. **Score storage format**: Individual raw metrics (fluency, pace, filler, clarity) stored in `communication_metrics JSONB`. Computed scores (technical, communication) stored in top-level numeric columns and `dimension_scores JSONB`.

7. **Event payload change**: `AttemptCompletedPayload.sessionId` renamed to `attemptId`; `assessmentType` added. Safe because no M3/M4 event listeners exist in the repo yet.

8. **Idempotency**: `POST /api/responses/submit` accepts `idempotencyKey` (auto-generated UUID if not provided). Duplicate submissions return the existing evaluation.

### Next Step

**Listening sub-flow** — create `src/modules/listening/listening.routes.ts`:
- `POST /api/listening/start` — creates LISTENING session, fetches story from `performance.listening_stories` (M3 table — use plain query, no FK in code yet)
- `GET /api/listening/:id/replay` — returns story content, increments `replay_count` in `state_data`, enforces ≤ `MAX_REPLAY_COUNT` (env, default 2)
- `POST /api/listening/:id/submit` — saves responses (input_type = TEXT), evaluates (if FastAPI endpoint confirmed), generates report

---

## Previous Updates

*(none — this is the initial entry)*
