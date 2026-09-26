# Project Context — Communication Readiness Platform
> Generated: 2026-09-26 | Last updated: 2026-09-26 (cross-module audit)
> Source of truth: repository code, migrations, dev log
> All facts verified against actual source files. Uncertain facts marked UNCERTAIN.

---

## 1. Project Overview

An AI-powered mock interview and communication readiness platform for a single college
(~2,000–3,000 students). Students take proctored mock interviews and listening comprehension
assessments; the system evaluates their responses via a FastAPI AI service backed by an LLM,
computes communication and technical scores, and generates diagnostic reports.

**Five user roles:** STUDENT, FACULTY_MENTOR, PROGRAM_ADMIN, TRAINER, PLACEMENT_COORDINATOR

**Tech stack:**
- Backend: Node.js + Express (TypeScript) — modular monolith
- Database: PostgreSQL with schemas: `identity`, `org`, `system`, `assessment`, `session`,
  `evaluation`, `performance`, `credit`, `knowledge`; pgvector extension for embeddings
- AI service: Python FastAPI — calls LLM provider (Groq / OpenAI / Gemini)
- Frontend: React SPA (TypeScript + Tailwind)

---

## 2. Current Architecture

```
React SPA (frontend/)
    ↓ HTTP REST JSON
Node.js Express (backend/src/)
    ↓ pg pool (DATABASE_URL)
PostgreSQL (multi-schema)
    ↓ HTTP POST (AI_SERVICE_URL, default http://127.0.0.1:8000)
FastAPI AI service (ai-service/)
    ↓ HTTP
LLM provider (Groq/OpenAI/Gemini — configurable via POST /ai/config)
```

**Score computation rule (non-negotiable):** ALL score computations happen in Node.js / Module 2.
FastAPI provides raw scores (0–10 scale); M2 normalises to 0–100 and computes composites.

---

## 3. Module Ownership

| Module | Owner | Migration Range | Focus |
|--------|-------|-----------------|-------|
| M1 | tamil-selvan-k (Team repo) | 001–030 | Auth, Identity, Org |
| **M2** | **Vasanthakumar (this repo)** | 031–060 | Assessments, Attempts, Sessions, AI Eval |
| M3 | TBD | 061–090 | Performance, Skills, Listening Stories, Agents |
| M4 | TBD | 091–114 | Credits, Checklist, Placement |
| Shared | All | 115+ | Cross-module FKs (e.g. skills FK) |

---

## 4. Repository Structure (key paths)

```
backend/
  src/
    modules/
      assessments/      assessments.routes.ts   (M2)
      attempts/         attempts.routes.ts       (M2)
      sessions/         sessions.routes.ts       (M2)
      responses/        responses.routes.ts      (M2)
      reports/          reports.routes.ts        (M2)
      question-bank/    question-bank.routes.ts  (M2)
      evaluation/       ai-client.ts, scoring.ts (M2)
      credits/          credits.service.stub.ts  (M4 stub)
    database/migrations/
      001–015  ← M1 migrations (shared infrastructure)
      031–043  ← M2 migrations
    routes/index.ts     ← all routes registered here
    shared/
      events/events.ts, eventBus.ts
      errors/AppError.ts
      helpers/response.ts
      db/pool.ts
    config/env.ts
  package.json
ai-service/
  app/
    models/schemas.py   ← Pydantic models
    routers/interview.py ← POST /ai/evaluate-turn, /ai/generate-question, /ai/evaluate-listening
    services/llm_client.py, providers.py
docs/
  MODULE_2_DEVELOPMENT_LOG.md  ← CHRONOLOGICAL TRUTH of M2 work
  MODULE_2_IMPLEMENTATION_CHECKLIST.md
  EDGE_CASES.md  (40 edge cases, created 2026-09-25)
  BACKEND_TEAM_MODULE_ALLOCATION.md
  BACKEND_BLUEPRINT.md
  BACKEND_IMPLEMENTATION_PLAN.md
  API_REFERENCE.md
frontend/  (React SPA — not M2's concern for MVP)
```

---

## 5. Module 1 Integration (Reference: tamil-selvan-k/communication-readiness-platform)

M1 provides all of the following to M2 (verified present in this repo's shared code):

| What | Where in this repo | Status |
|------|-------------------|--------|
| `authenticate` middleware | `src/middleware/authenticate.ts` | READY |
| `requireRole` middleware | `src/middleware/authorize.ts` | READY |
| `AppError` | `src/shared/errors/AppError.ts` | READY |
| `sendSuccess` / `sendError` | `src/shared/helpers/response.ts` | READY |
| `db` pg pool | `src/shared/db/pool.ts` | READY |
| `eventBus` + Events | `src/shared/events/eventBus.ts` + `events.ts` | READY |
| `identity.users` table | migration 003 | READY |
| `org.students` table | migration 009 | READY |
| `org.batches` table | migration 007 | READY |
| `org.programs` table | migration 006 | READY |
| `org.subdivisions` table | migration 008 | READY |
| `org.student_mentor_assignments` | migration 012 | READY |
| `system.audit_logs` | migration 004 | READY |
| `system.set_updated_at()` function | migration 015 | READY |

**Key column facts (verified against actual migrations, not docs):**
- `org.students`: has `user_id`, `batch_id`, `mentor_user_id` — NO `program_id` (resolved via JOIN on batches)
- `org.student_mentor_assignments`: FK column is `mentor_id` (not `mentor_user_id`)
- `identity.users`: FK column is `user_id` (not `actor_user_id`)
- `system.audit_logs`: FK column is `user_id` (not `actor_user_id`)

**M1 ↔ M2 integration point:** ATTEMPT_COMPLETED event.
- M2 emits via `eventBus.emit(Events.ATTEMPT_COMPLETED, payload)` inside `setImmediate` (fire-and-forget)
- M3 will listen to update performance profiles; M4 will listen for credit-earning recalc
- Current payload: `{ attemptId, studentId, assessmentType, overallScore }` — missing `assessmentId`, `technicalScore`, `communicationScore`, `reportId` per plan spec (Bug B10)

---

## 6. Module 2 Architecture — What Was Built

### Database tables (all in migrations 031–043)

| Migration | Table | Schema | Notes |
|-----------|-------|--------|-------|
| 031 | assessment.assessments | assessment | + pgvector extension |
| 032 | assessment.assessment_components | assessment | has component_type, configuration JSONB, is_active |
| 033 | assessment.assessment_attempts | assessment | org snapshot: program_id, batch_id, subdivision_id; credit_policy_snapshot JSONB |
| 034 | session.assessment_sessions | session | state_data JSONB (proctoring in JSONB, NOT individual columns); attempt_id UNIQUE (1 session per attempt) |
| 035 | session.question_bank_items | session | embedding vector(1536), evaluation_criteria JSONB (NOT expected_answer_hint TEXT) |
| 036 | session.question_bank_item_skills | session | no FK to performance.skills yet (M3 not delivered) |
| 037 | session.questions | session | linked to attempt_id (NOT session_id) |
| 038 | evaluation.responses | evaluation | has idempotency_key, input_type, text_answer (NOT session_id/mode/duration_sec from checklist) |
| 039 | evaluation.ai_runs | evaluation | capability, provider, prompt_version, token_usage JSONB, error_code |
| 040 | evaluation.response_evaluations | evaluation | communication_metrics JSONB + dimension_scores JSONB (NOT individual fluency_score etc.) |
| 041 | performance.assessment_reports | performance | component_scores JSONB; M2 writes, M3 reads |
| 042 | (indexes) | — | |
| 043 | (triggers) | — | updated_at triggers on assessments, sessions, question_bank_items |

**SCHEMA DEVIATIONS FROM CHECKLIST** (actual schema wins):
- `assessment_sessions`: proctoring state in `state_data JSONB`, not individual columns
- `questions`: `attempt_id` NOT `session_id`
- `responses`: `idempotency_key`, `input_type`, `text_answer` instead of `session_id`/`mode`/`duration_sec`
- `response_evaluations`: JSONB fields instead of individual metric columns
- `assessment_reports`: in `performance` schema (NOT `assessment` schema as BACKEND_IMPLEMENTATION_PLAN.md ISSUE-01 says)
- `assessment_attempts`: no `credit_cost` column; uses `credit_policy_snapshot JSONB`
- `assessments`: no `configuration JSONB` or `created_by` column (checklist says they exist — NOT present in actual migration 031)

### Application routes

| File | Routes |
|------|--------|
| assessments.routes.ts | GET /api/assessments, POST /api/assessments, GET /api/assessments/:id, PUT /api/assessments/:id |
| question-bank.routes.ts | GET /api/question-bank, POST /api/question-bank, PUT /api/question-bank/:id, DELETE /api/question-bank/:id |
| attempts.routes.ts | POST /api/attempts/start, GET /api/attempts/:id, PUT /api/attempts/:id/abandon |
| sessions.routes.ts | POST /api/sessions/start, GET /api/sessions/:id, POST /api/sessions/:id/proctor-event, POST /api/sessions/:id/complete |
| responses.routes.ts | POST /api/responses/submit, GET /api/responses/:id |
| reports.routes.ts | GET /api/reports/:attemptId |

All routes registered in `src/routes/index.ts`.

### Supporting modules

| File | Purpose |
|------|---------|
| evaluation/ai-client.ts | HTTP client to FastAPI; evaluateResponse() → /ai/evaluate-turn; generateQuestion() → /ai/generate-question; 0–10 → 0–100 normalisation |
| evaluation/scoring.ts | computeFillerScore, computePaceScore, computeCommunicationScore, computeOverallScore, roundScore |
| credits/credits.service.stub.ts | M4 stub — always returns { newBalance: 50 }; DELETE when M4 delivers |

---

## 7. FastAPI AI Service

**Three endpoints (all in `/ai` prefix):**

| Endpoint | Request | Response |
|----------|---------|----------|
| POST /ai/evaluate-turn | { question_text, student_answer, difficulty, turn_number, domain? } | { technical_score 0–10, communication_score 0–10, wpm, filler_words, feedback, strengths, weaknesses, next_recommended_difficulty } |
| POST /ai/generate-question | { student_name, skills[], projects[], previous_turns[], difficulty, domain? } | { question_text, difficulty, category? } |
| POST /ai/evaluate-listening | { story_text, question, student_answer, expected_answer } | { score 0–10, accuracy_level, feedback, missed_key_points[] } |

M2 ai-client.ts correctly calls `/ai/evaluate-turn` (Bug B1 was fixed).
Score normalisation: FastAPI returns 0–10; ai-client multiplies × 10 to get 0–100.
**Score clamping gap:** Multiplication does NOT clamp to 0–100. A FastAPI score > 10 would produce > 100. Fix: `Math.min(100, Math.max(0, score * 10))`.

---

## 8. Assessment Lifecycle (Implemented Flow)

```
POST /api/attempts/start  (STUDENT)
  → CreditService.consume() [stub]
  → INSERT assessment.assessment_attempts (status=IN_PROGRESS)
  → return { attemptId }
        ↓
POST /api/sessions/start  (STUDENT)
  → verify attempt ownership + IN_PROGRESS
  → INSERT session.assessment_sessions (state=ACTIVE)
  → getNextQuestion() → bank (EASY, random, not used) or AI generate
  → return { sessionId, firstQuestion }
        ↓
POST /api/responses/submit  (STUDENT)
  → INSERT evaluation.responses
  → INSERT evaluation.ai_runs (PENDING)
  → POST /ai/evaluate-turn  (FastAPI)
  → UPDATE ai_runs (COMPLETED/FAILED)
  → INSERT evaluation.response_evaluations
  → adaptive difficulty: ≥80→up, <50→down
  → getNextQuestion() for next turn
  → UPDATE session.current_sequence_no
  → return { evaluationId, scores, feedback, nextQuestion }
        ↓ (repeat per question; when nextQuestion=null → complete)
POST /api/sessions/:id/complete  (STUDENT)
  → aggregate response_evaluations for attempt
  → compute tech_avg, comm_avg, overall = tech*0.70 + comm*0.30
  → INSERT performance.assessment_reports (ON CONFLICT DO NOTHING — idempotent)
  → UPDATE session state=COMPLETED, attempt status=COMPLETED
  → setImmediate → eventBus.emit(ATTEMPT_COMPLETED)
  → return { reportId, overallScore, technicalScore, communicationScore }
        ↓
GET /api/reports/:attemptId
  → returns full report + questionBreakdown[]
```

**Proctoring (parallel to session):**
```
POST /api/sessions/:id/proctor-event  (STUDENT)
  → TAB_SWITCH: increment tab_switch_count in state_data JSONB
  → 3–4 switches: write system.audit_logs PROCTORING_WARNING
  → ≥ MAX_TAB_SWITCH_LIMIT (4): set is_proctor_flagged=true
  → > MAX_TAB_SWITCH_LIMIT+1 (5): set state=TERMINATED
```

---

## 9. Known Bugs (from 2026-09-25 audit)

| ID | Sev | Location | Description | Status |
|----|-----|----------|-------------|--------|
| B3 | CRITICAL | sessions.routes.ts:113–119 | Resume path re-activates COMPLETED/TERMINATED sessions (only ACTIVE is guarded) | **FIXED** — confirmed by 2026-09-26 audit; guards present at lines 113–119 |
| B4 | HIGH | attempts.routes.ts | CreditService.consume() + attempt INSERT not in one DB transaction | NOT FIXED |
| B5 | HIGH | sessions.routes.ts:279 | Proctor TERMINATED transition updates session but leaves attempt IN_PROGRESS | NOT FIXED |
| B6 | HIGH | attempts.routes.ts | abandon sets attempt ABANDONED but leaves session ACTIVE | NOT FIXED |
| B7 | MEDIUM | sessions.routes.ts | expires_at column (migration 034) never populated or evaluated | NOT FIXED |
| B8 | INFO | BACKEND_IMPLEMENTATION_PLAN.md | Doc says assessment.assessment_reports; code uses performance.assessment_reports | NOT FIXED (doc) |
| B9 | INFO | API_REFERENCE.md | POST /api/responses/submit docs show wrong request body fields | NOT FIXED (doc) |
| B10 | MEDIUM | shared/events/events.ts | AttemptCompletedPayload missing assessmentId, technicalScore, communicationScore, reportId | NOT FIXED |
| B11 | LOW | attempts.routes.ts | GET /api/attempts/:id has no FACULTY_MENTOR mentor scope check | NOT FIXED |
| B12 | LOW | responses.routes.ts | Duplicate attempt+question with different idempotency_key → unhandled 500 (should be 409) | NOT FIXED |
| — | MEDIUM | evaluation/ai-client.ts | Score clamping: technical_score/communication_score not clamped to 0–100 after × 10 | NOT FIXED |

**Fixed bugs (verified):**
- B1: AI endpoint `/ai/evaluate-response` → `/ai/evaluate-turn` ✓
- B2: FACULTY_MENTOR response ownership check in GET /api/responses/:id ✓

---

## 10. Missing Features

| Feature | Status | Blocker |
|---------|--------|---------|
| Listening sub-flow (POST /api/listening/start, GET /api/listening/:id/replay, POST /api/listening/:id/submit) | MISSING — no file exists | M3 must deliver `performance.listening_stories` table |
| Unit tests | NONE WRITTEN | — |
| Integration tests | NONE WRITTEN | Requires live database |
| Score clamping in ai-client.ts | NOT DONE | — |
| Real CreditService | STUB only | M4 must deliver |
| performance.skills FK | Deferred | M3 must deliver skills table |
| expires_at session timeout policy | Not implemented | — |

---

## 11. Development Chronology

| Date | Event |
|------|-------|
| 2026-09-24 (early) | Phase 0 audit: deleted misplaced SQL files, found B1 and B2 |
| 2026-09-24 | Full M2 initial implementation: migrations 031–043, all 6 route modules, ai-client, scoring, credits stub, wired into index.ts |
| 2026-09-24 | TypeScript diagnostic fix: `_req` rename in assessments.routes.ts |
| 2026-09-24 | B1 fix: ai-client rewritten to match actual FastAPI contract |
| 2026-09-24 | B2 fix: FACULTY_MENTOR ownership check added to GET /api/responses/:id |
| 2026-09-24 | Migration static analysis: all 031–043 pass static checks; live execution blocked (no DB) |
| 2026-09-25 | Full cross-module audit: 10 bugs found (B3–B12), 40 edge cases documented in EDGE_CASES.md; no fixes applied during audit |
| 2026-09-26 | Cross-module architecture audit across all 4 repos; B3 confirmed FIXED (dev log corrected); M3 integration placed on hold (pending PR); Supabase set as target DB; 11 open cross-module conflicts documented |

---

## 12. Current State Summary Matrix

| Area | Status | Evidence |
|------|--------|----------|
| M1 (auth, org, infra) | IMPLEMENTED (by team) | Migrations 001–015 present; middleware files present |
| M2 migrations 031–043 | WRITTEN, NOT EXECUTED | .sql files exist; no live DB confirmed |
| M2 assessments CRUD | IMPLEMENTED | assessments.routes.ts |
| M2 question-bank CRUD | IMPLEMENTED | question-bank.routes.ts |
| M2 attempts lifecycle | IMPLEMENTED (w/ bugs B4, B6, B11) | attempts.routes.ts |
| M2 sessions lifecycle | IMPLEMENTED (w/ bugs B5, B7; B3 FIXED) | sessions.routes.ts |
| M2 responses + AI eval | IMPLEMENTED (w/ bug B12, clamping) | responses.routes.ts, ai-client.ts |
| M2 reports | IMPLEMENTED | reports.routes.ts |
| M2 proctoring | IMPLEMENTED | sessions.routes.ts |
| M2 listening sub-flow | MISSING | No listening.routes.ts file |
| M2 events (ATTEMPT_COMPLETED) | PARTIALLY IMPLEMENTED (B10) | events.ts payload missing fields |
| M3 (performance, skills) | NOT IMPLEMENTED | No M3 code in repo |
| M4 (credits) | STUB ONLY | credits.service.stub.ts |
| FastAPI /ai/evaluate-turn | IMPLEMENTED | interview.py |
| FastAPI /ai/generate-question | IMPLEMENTED | interview.py |
| FastAPI /ai/evaluate-listening | IMPLEMENTED | interview.py — M2 has no callers yet |
| TypeScript build | PASS | tsc --noEmit = 0 |
| Unit tests | NONE | No test files |
| Integration tests | NONE | No test files |
| Live database | NOT SET UP | No .env file, no PostgreSQL running |

---

## 13. Exact Stopping Point (2026-09-26)

The 2026-09-26 cross-module architecture audit across all 4 repositories identified:
- B3 is **FIXED** in the current code (dev log was wrong; corrected)
- 11 open cross-module API/schema/event conflicts (see full audit report)
- M3 integration on hold pending PR merge
- Supabase PostgreSQL is the target database

No code fixes were applied during either audit pass. The recommended fix order is:
> **B5+B6** (session/attempt cross-state completeness) → **B10** (event payload) →
> **B-CLAMP** (score clamping) → **B12** (duplicate response 409) →
> **B4** (needs M4 coordination) → **doc pass B8+B9**

**Immediate next tasks (awaiting approval):**
1. Fix B5: TERMINATED session → set attempt ABANDONED (`sessions.routes.ts`)
2. Fix B6: ABANDONED attempt → terminate session if ACTIVE/PAUSED (`attempts.routes.ts`)
3. Fix B10: complete `AttemptCompletedPayload` (`events.ts` + `sessions.routes.ts`)
4. Fix B-CLAMP: clamp `score * 10` to 0–100 (`ai-client.ts`)

**Blocked on external events:**
- Supabase DB not yet ready (user creating it)
- M3 PR not yet merged

---

## 15. Open Questions / UNCERTAIN Items

- **M3 INTEGRATION ON HOLD:** M3 team is actively completing their implementation. Their lead will submit a PR for review. Do NOT integrate M3 code until that PR is reviewed, approved, and merged. Once merged: fetch latest, inspect all M3 migrations (061–090 range), verify `performance.skills` + `performance.listening_stories` tables, verify ATTEMPT_COMPLETED event contract, then integrate.
- **M4 INTEGRATION:** Not yet started. Zero M4-specific code exists. M4 must deliver credit tables (migrations 091–114) and a real `CreditService.consume()` before M2's credit gate can be activated. `credits/credits.service.stub.ts` remains in place.
- UNCERTAIN: Whether the M1 team repository (tamil-selvan-k) has been updated to fix the `session.question_bank` vs `session.question_bank_items` table name conflict in their `bank-fallback` route
- UNCERTAIN: `assessment.assessments` — the actual migration 031 does NOT have `configuration JSONB` or `created_by` columns that the checklist specifies; confirm with team if needed
- UNCERTAIN: Credit cost per assessment — currently hardcoded to 1 in stub; actual policy TBD

---

## 16. Environment Requirements (before live testing)

**Target database: Supabase PostgreSQL (cloud, pgvector pre-installed)**

A Supabase project is being created. Do NOT connect or run migrations until explicitly instructed that the Supabase project is ready and connection details are provided.

**Database driver layer:** Raw `pg` driver + custom migration runner. No Drizzle, no Prisma. pgvector is retained (`embedding vector(1536)` on `session.question_bank_items`).

Once Supabase is ready:
1. Create `backend/.env` with `DATABASE_URL=<supabase-connection-string>` (do not commit this file)
2. `cd backend && npm run migrate` — runs all migrations in alphabetical order (001–043 for M1+M2)
3. FastAPI service running: `cd ai-service && uvicorn app.main:app`
4. Configure LLM provider: `POST /ai/config` with `{ groq_api_key, llm_provider }`
5. Test full HTTP flow against the live database

**Note:** Redis is required by M1's `sessionContextService` but not by any M2 route. M2 can be tested independently without Redis; M1's `/api/sessions/:id/turns` endpoint will fail without it.
