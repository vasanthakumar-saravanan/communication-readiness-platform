# Module 2 Development Log

## Current Status

- **Current phase:** M1 Integration Fixes COMPLETE (2026-09-26) — B-TURNS-NO-AUTH, B-RESPONSE-SPLIT, B-QBANK-NAME, B-REDIS-NEW all fixed
- **Overall status:** M2 COMPLETE. M1 integration fixes implemented in shared backend. TypeScript PASS. M3 and M4 still blocked.
- **Last completed task:** M1 audio interview integration (2026-09-26) — interview.routes.ts + sessionContextService.ts + migration 016
- **Current task:** Awaiting Supabase project confirmation + user approval to run migrations
- **Next task:** Create backend/.env → run migrations 001–015 + 016 + 031–043 on Supabase → smoke test
- **TypeScript/build status:** PASS — `tsc --noEmit` exits 0, no errors
- **Test status:** NOT WRITTEN YET
- **Database migration status:** SQL files written (001–015, 016, 031–043), statically verified — NOT YET EXECUTED against live database. 016 is NEW and required before audio turns work.
- **Live database:** SUPABASE PROJECT BEING CREATED — do not connect or run migrations until explicitly instructed
- **M3 integration:** ON HOLD — M3 has zero implementation as of latest audit (commit 214eb0ef)
- **Redis:** OPTIONAL — graceful degradation implemented; provide REDIS_URL in .env for turn caching

---

## Work Log — 2026-09-26 (M1 Audio Interview Integration — B-TURNS-NO-AUTH, B-RESPONSE-SPLIT, B-QBANK-NAME, B-REDIS-NEW)

### Task
Implement four M1 integration fixes identified in the consolidated audit. All fixes applied to the shared backend without modifying any existing M2 code. TypeScript compilation verified to pass.

### Fixes Implemented

**B-TURNS-NO-AUTH — Authentication added to audio turns endpoint** (`src/routes/interview.routes.ts`)

The `POST /api/sessions/:id/turns` endpoint now requires:
1. `authenticate` middleware placed **before** `audioUpload.single('audio')` — student identity comes from verified JWT, never from request body
2. Session ownership check: DB query confirms `session.student_user_id === req.user.id`
3. Session state check: rejects turns when session state ≠ `ACTIVE`

**B-RESPONSE-SPLIT — Audio turns now write to M2 evaluation tables** (`src/routes/interview.routes.ts`)

Root cause: `evaluation.responses.question_id` is `NOT NULL`. Audio turns had no corresponding `session.questions` row, so they could never write to `evaluation.response_evaluations`, and M2's complete handler computed null scores.

Fix flow:
1. `GET /api/sessions/bank-fallback` now inserts the served question into `session.questions` (with `question_type = 'INTERVIEW'`, `is_generated = false`). Audio sessions now have a valid `question_id` for each turn.
2. `POST /api/sessions/:id/turns` looks up the question from `session.questions` (by `attempt_id + sequence_no`) and creates:
   - `evaluation.responses` — linked to the attempt and question, `input_type = 'VOICE'`
   - `evaluation.ai_runs` — records FastAPI latency, status
   - `evaluation.response_evaluations` — `technical_score`, `communication_score` (0–100, B-CLAMP applied), communication metrics
3. Also writes to `session.interview_transcripts` (migration 016) with a `.catch()` guard — non-fatal if migration 016 hasn't been run yet.
4. M2's `POST /sessions/:id/complete` handler aggregates from `evaluation.response_evaluations` as normal — no changes to M2 code needed.

**B-QBANK-NAME — Bank-fallback uses correct table** (`src/routes/interview.routes.ts`)

Changed `FROM session.question_bank` → `FROM session.question_bank_items`. Domain/category filters now use `metadata->>'domain'` and `metadata->>'category'` since `question_bank_items` stores these in the `metadata JSONB` column (no dedicated columns).

**B-REDIS-NEW — REDIS_URL added to environment schema** (`src/config/env.ts`, `backend/.env.example`)

`REDIS_URL` added as `z.string().url().optional()` — server starts without it. `sessionContextService.ts` uses dynamic `require('ioredis')` with `lazyConnect: true` and all errors caught — graceful noop when Redis is unavailable. `.env.example` now documents the requirement with setup instructions.

### Files Created

| File | Purpose |
|------|---------|
| `backend/src/database/migrations/016_session_transcripts.sql` | M1 migration — `session.interview_transcripts` table + indexes. Must be run before audio turns write transcripts. |
| `backend/src/routes/interview.routes.ts` | M1 audio interview routes — `GET /sessions/bank-fallback` + `POST /sessions/:id/turns` with all four fixes |
| `backend/src/services/sessionContextService.ts` | Redis turn cache — graceful noop if REDIS_URL unset or ioredis unavailable |

### Files Modified

| File | Change |
|------|--------|
| `backend/src/config/env.ts` | Added `REDIS_URL: z.string().url().optional()` |
| `backend/src/routes/index.ts` | Imported `interviewRouter`; mounted at `/sessions` after M2's `sessionsRouter` |
| `backend/.env.example` | Documented `REDIS_URL` with local dev and cloud setup instructions |
| `backend/package.json` | Added `ioredis: ^5.4.0`, `form-data: ^4.0.1` to dependencies |

### Files NOT Modified
- All existing M2 modules (`sessions.routes.ts`, `responses.routes.ts`, `attempts.routes.ts`, `ai-client.ts`, `events.ts`) — unchanged
- No migration files modified — only 016 added (new)

### Verification
- `tsc --noEmit`: **PASS — 0 errors**
- `npm install`: 9 packages added (ioredis, form-data, transitive deps)
- `git diff --name-only`: exactly the files listed above changed
- Static review: auth middleware order correct, question linkage verified against schema constraints

### Migration Status
- **Migration 016** (`session.interview_transcripts`) is written and required — NOT YET RUN. The turns endpoint has a `.catch()` so it degrades gracefully until 016 is applied.
- All other migrations (001–015, 031–043) still pending Supabase first run.

### Remaining Blockers

| ID | Blocker | Owner | Severity |
|----|---------|-------|----------|
| Migration 016 | `session.interview_transcripts` not yet run — transcripts not persisted | User (Supabase) | HIGH |
| B-RESPONSE-SPLIT (partial) | If student completes via audio path but migration 016 missing, transcripts silently dropped. Scores ARE persisted. | — | LOW (catch guard) |
| M3 | Zero implementation; performance analytics unavailable | M3 team | CRITICAL |
| M4 | Zero implementation; credit enforcement unavailable | M4 team | CRITICAL |

---

## Integration Audit — 2026-09-26 (Full Module Integration + Testing Phase — COMPLETE)

### Task
Full Module Integration + Testing phase. Parallel agents audited M1 (tamil-selvan-k), M3 (bavanbalaji007), and M4 (Ricardo-67) latest states. Consolidated 18-section report produced. See `CROSS_MODULE_INTEGRATION_LOG.md` Entry 2026-09-26 (Full Audit) for complete findings.

### M2 Integration Verification (Completed)

All M2 routes, schemas, event contracts, and cross-module dependencies verified against actual code:
- 20 routes across 7 routers — all verified correct
- Auth contract (authenticate + requireRole) — correct usage confirmed
- ATTEMPT_COMPLETED payload — 8 fields, B10 FIXED, score formula documented
- CreditService stub interface documented for M4 delivery
- B5/B6/B-CLAMP/B10 fixes confirmed in code
- performance.assessment_reports.listening_score column exists — ready for M3 population
- question_bank_item_skills.skill_id FK deferred — no FK constraint written yet (safe)

### M1 Audit Results (Commit `74c927a0`, 2026-09-25)

M1 pushed a significant new commit ("Module 2 partially completed"). Key findings:
- Migration 016 (`session.interview_transcripts`) added — deferred FK correctly documented ✓
- `POST /api/sessions/:id/turns` implemented — audio upload via multer + FastAPI audio pipeline
- `GET /api/sessions/bank-fallback` implemented — but queries wrong table (see below)
- New `SessionContextService` uses `ioredis` — new runtime dependency (REDIS_URL env var required)
- New ai-service audio pipeline: `POST /ai/evaluate-response` (Groq Whisper + librosa + webrtcvad)

**NEW CRITICAL BUGS in M1:**

| ID | Issue |
|----|-------|
| B-TURNS-NO-AUTH | `POST /sessions/:id/turns` has NO authenticate middleware; student identity taken from request body |
| B-RESPONSE-SPLIT | Audio turns write to `interview_transcripts` only — scores excluded from `response_evaluations`; M2 complete handler computes null final score for audio sessions |
| B-QBANK-NAME | `bank-fallback` still queries `session.question_bank` (CONFIRMED in code); always falls back to static questions |

**New HIGH issues in M1:**

| ID | Issue |
|----|-------|
| B-REDIS-NEW | `ioredis` new dependency; `REDIS_URL` not in env.ts; turns endpoint fails without Redis at runtime |
| B-NO-SESSION-OWNERSHIP | Turns endpoint does not verify session belongs to requesting student |

### M3 Audit Results (Commit `214eb0ef`, 2026-09-24)

Latest M3 commit is a merge FROM M1, not new M3 work. M3 has zero module-specific implementation:
- Only migrations 001–015 (M1 base) — no 061–090 range
- `performance.skills` and `performance.listening_stories` do NOT exist
- No M3 routes, no event listeners, no performance analytics
- `events.ts` still has OLD 3-field payload `{sessionId, studentId, overallScore}` — incompatible with B10-fixed payload
- No `CREATE EXTENSION vector` in M3's migration 001

### M4 Audit Results (Commit `f7a62a72`, 2026-09-24)

M4 is unchanged from prior audit. Zero M4-specific implementation:
- Only migrations 001–015 (M1 base) — no 091–114 range
- Credit tables do NOT exist
- CreditService real implementation NOT delivered
- M2 stub still active; students can start unlimited attempts

### Files Modified
- `docs/CROSS_MODULE_INTEGRATION_LOG.md` — sections A–J integration audit (prior entry) + full M1/M3/M4 audit section appended
- `docs/MODULE_2_DEVELOPMENT_LOG.md` — this entry; current status updated to reflect audit complete

---

## Work Log — 2026-09-26 (B5, B6, B10, B-CLAMP Fixes)

### Task
Implement four approved isolated M2 fixes from the pre-Supabase readiness pass. No schema changes, no migration changes, no external integrations.

### Fixes Implemented

**B5 — Session TERMINATED now abandons attempt** (`sessions.routes.ts:296–304`)

After the session UPDATE sets `state = 'TERMINATED'`, a conditional UPDATE now runs:
```sql
UPDATE assessment.assessment_attempts
SET status = 'ABANDONED', completed_at = now()
WHERE id = $1 AND status = 'IN_PROGRESS'
```
Guard `AND status = 'IN_PROGRESS'` prevents double-updating already-completed attempts.

**B6 — Attempt ABANDONED now terminates session** (`attempts.routes.ts:161–167`)

After the attempt UPDATE sets `status = 'ABANDONED'`, a second UPDATE now runs:
```sql
UPDATE session.assessment_sessions
SET state = 'TERMINATED', updated_at = now()
WHERE attempt_id = $1 AND state IN ('ACTIVE', 'PAUSED')
```
Guard `AND state IN ('ACTIVE', 'PAUSED')` preserves already COMPLETED or TERMINATED sessions.

**B10 — AttemptCompletedPayload complete** (`events.ts:17–25`, `sessions.routes.ts:441–450`)

Added 4 fields to the type and emit call: `assessmentId`, `technicalScore`, `communicationScore`, `reportId`. All values were already computed in the handler — no new queries added.

New payload emitted:
```typescript
{
  attemptId, assessmentId, studentId, assessmentType,
  technicalScore, communicationScore, overallScore, reportId
}
```

**B-CLAMP — Score overflow prevention** (`ai-client.ts:78–79`)

Wrapped both score normalizations in `Math.min(100, Math.max(0, ...))`:
```typescript
technical_score:    Math.min(100, Math.max(0, Math.round(data.technical_score    * 10 * 100) / 100))
communication_score: Math.min(100, Math.max(0, Math.round(data.communication_score * 10 * 100) / 100))
```

### Files Modified

| File | Change |
|------|--------|
| `src/modules/sessions/sessions.routes.ts` | B5: attempt ABANDONED on proctor TERMINATE; B10: complete emit payload |
| `src/modules/attempts/attempts.routes.ts` | B6: session TERMINATED on attempt ABANDON |
| `src/shared/events/events.ts` | B10: 4 new fields on AttemptCompletedPayload |
| `src/modules/evaluation/ai-client.ts` | B-CLAMP: scores clamped to 0–100 |

### Files NOT Modified
- No migrations touched
- No schema changes
- No docs/API_REFERENCE.md changes (pre-existing modification)
- M3, M4 not touched

### Verification
- `tsc --noEmit`: **PASS — 0 errors**
- `git diff --name-only`: exactly 4 source files changed + pre-existing docs
- Static review of all changed regions: correct

### Bug Status Update

| ID | Status |
|----|--------|
| B1 | FIXED (prior) |
| B2 | FIXED (prior) |
| B3 | FIXED (prior, confirmed by audit) |
| B4 | NOT FIXED — requires M4 CreditService coordination |
| **B5** | **FIXED** ✓ |
| **B6** | **FIXED** ✓ |
| B7 | NOT FIXED — session expires_at policy unimplemented |
| B8 | DOC ONLY |
| B9 | DOC ONLY |
| **B10** | **FIXED** ✓ |
| B11 | NOT FIXED — GET /attempts/:id no FACULTY_MENTOR scope |
| B12 | NOT FIXED — duplicate response → unhandled 500 |
| **B-CLAMP** | **FIXED** ✓ |

---

## Investigation — 2026-09-26 (Pre-Supabase Readiness Pass)

### Task
Focused code-level investigation of B10, M1 question-bank conflict, migration 110 feasibility, B5, B6, B-CLAMP, and Supabase readiness. No code changes applied.

### A. B10 — ATTEMPT_COMPLETED CONTRACT

**Current type definition** (`src/shared/events/events.ts:17–22`):
```typescript
export interface AttemptCompletedPayload {
  attemptId: string;
  studentId: string;
  assessmentType: string;   // ← present but wrong semantics (type string, not ID)
  overallScore: number;
}
```

**Current emit call** (`src/modules/sessions/sessions.routes.ts:430–436`):
```typescript
eventBus.emit(Events.ATTEMPT_COMPLETED, {
  attemptId: session.attempt_id,        // ✓ correct
  studentId: session.student_id,        // ✓ correct
  assessmentType: session.assessment_type, // string, not assessmentId UUID
  overallScore: overall,                // ✓ correct
});
```

**Required fields (per cross-module design):**

| Field | Present? | Value available in handler? |
|-------|----------|-----------------------------|
| `attemptId` | ✓ | `session.attempt_id` |
| `studentId` | ✓ | `session.student_id` |
| `assessmentId` | ✗ MISSING | `session.assessment_id` (already fetched in JOIN at line 333–342) |
| `assessmentType` | ✓ (as string) | `session.assessment_type` — useful, keep it |
| `technicalScore` | ✗ MISSING | `Math.round(techAvg * 100) / 100` (computed at line 402–403) |
| `communicationScore` | ✗ MISSING | `Math.round(commAvg * 100) / 100` (computed at line 403) |
| `overallScore` | ✓ | `overall` |
| `reportId` | ✗ MISSING | `reportRows[0]?.id` (available at line 411 before the emit) |

All missing values are already computed before the setImmediate call. No new queries needed.

**Files requiring modification when B10 is fixed:**
1. `src/shared/events/events.ts` — add 3 fields to `AttemptCompletedPayload`
2. `src/modules/sessions/sessions.routes.ts` lines 431–436 — pass the 3 new fields in the emit call

**B10 is NOT a blocker for first live DB test** (the event has no listeners yet) but **IS a blocker for M3/M4 integration** — they must not build listeners against the incomplete payload.

---

### B. M1 QUESTION BANK CONFLICT

**M2 migration 035** creates: `session.question_bank_items` (confirmed in file `035_session_question_bank_items.sql`)

**M2 code** (`sessions.routes.ts:32`):
```sql
SELECT id, question_text, difficulty FROM session.question_bank_items
  WHERE is_active = true AND difficulty = $1
```
M2 consistently uses `session.question_bank_items` in all its queries.

**M1 bank-fallback route** (per 2026-09-26 cross-module audit of M1 source):
```typescript
// Queries session.question_bank — table does NOT exist
```

**Conclusion:**
- Canonical table name: `session.question_bank_items` (M2's migration 035 is the authoritative definition)
- M1's `GET /api/sessions/bank-fallback` will throw a PostgreSQL relation-does-not-exist error at runtime
- This is an M1 bug, not an M2 bug — M1 team must update their query
- M2 does not need to rename or alias any table

**This does NOT block M2's first live test** — M2 never calls M1's bank-fallback route.

---

### C. MIGRATION 110

**M1 migration 016** (`016_session_transcripts.sql` — exists in M1 repo, NOT in this repo) creates:
```sql
CREATE TABLE session.interview_transcripts (
  session_id UUID NOT NULL  -- intentionally no FK — deferred until M2 migration 034 runs
)
```

**M2 migration 034** creates `session.assessment_sessions(id UUID PRIMARY KEY)` — this is the FK target.

**The required migration:**
```sql
ALTER TABLE session.interview_transcripts
  ADD CONSTRAINT fk_transcripts_session_id
    FOREIGN KEY (session_id)
    REFERENCES session.assessment_sessions(id);
```

**Safe migration number:** The team's shared FK range is 115+. The correct number is **116** (leaving 115 for the `performance.skills` FK once M3 delivers). Alternatively 044 would also work (runs right after 043, before M3's 061 range) — but the team convention places cross-module FKs at 115+.

**Critical prerequisite:** Migration 016 (`session.interview_transcripts`) must exist in the shared migrations folder and must have already run before migration 116 can execute. Currently, 016 is absent from this repo. This means:
- M1 team must contribute 016 to the shared migrations folder, OR
- It must be added here before 116 can be written

**This does NOT block M2's first live test** — M2 does not query `session.interview_transcripts`.

---

### D. B5 — SESSION TERMINATED LEAVES ATTEMPT IN_PROGRESS

**Location:** `src/modules/sessions/sessions.routes.ts:284–293`

**Current code:**
```typescript
let newState = session.state;
if (stateData.is_proctor_flagged && stateData.tab_switch_count > maxLimit + 1) {
  newState = 'TERMINATED';
}
await db.query(
  `UPDATE session.assessment_sessions
   SET state_data = $1, state = $2, last_activity_at = now(), updated_at = now()
   WHERE id = $3`,
  [JSON.stringify(stateData), newState, id]
);
```

**Problem:** When `newState = 'TERMINATED'`, only `session.assessment_sessions.state` is updated. There is no UPDATE to `assessment.assessment_attempts.status`.

**Expected behavior:** `assessment.assessment_attempts.status` should be set to `'ABANDONED'` (confirmed: the only valid terminal statuses are `IN_PROGRESS`, `COMPLETED`, `ABANDONED` per migration 033 CHECK constraint — there is no `TERMINATED` status on attempts).

**Consequence if unfixed:** The attempt stays `IN_PROGRESS` forever. The student cannot start a new attempt for the same assessment because `attempts.routes.ts:49–56` guards against concurrent `IN_PROGRESS` attempts:
```sql
SELECT id FROM assessment.assessment_attempts
WHERE student_id = $1 AND assessment_id = $2 AND status = 'IN_PROGRESS'
```
A terminated-but-not-abandoned attempt would permanently block the student from re-attempting.

**BLOCKER STATUS: YES** — blocks re-attempt after proctoring termination in live testing.

---

### E. B6 — ATTEMPT ABANDONED LEAVES SESSION ACTIVE

**Location:** `src/modules/attempts/attempts.routes.ts:155–160`

**Current code:**
```typescript
await db.query(
  `UPDATE assessment.assessment_attempts SET status = 'ABANDONED', completed_at = now()
   WHERE id = $1`,
  [id]
);
sendSuccess(res, { message: 'Attempt abandoned' });
```

**Problem:** No query to `session.assessment_sessions`. The associated session (if it exists and is ACTIVE or PAUSED) remains in that state indefinitely.

**Expected behavior:** If a session exists for this attempt and its state is `ACTIVE` or `PAUSED`, it should be updated to `TERMINATED`.

**Consequence if unfixed:** Orphaned active session records. If the student later calls `GET /api/sessions/:id`, they will see a session still ACTIVE for an ABANDONED attempt. If M3/M4 join against sessions looking for non-terminal states, they may pick up ghost sessions.

**BLOCKER STATUS: MEDIUM** — does not block the primary assessment happy path. Only triggered if student explicitly abandons.

---

### F. B-CLAMP — SCORE OVERFLOW

**Location:** `src/modules/evaluation/ai-client.ts:78–79`

**Current code:**
```typescript
technical_score: Math.round(data.technical_score * 10 * 100) / 100,
communication_score: Math.round(data.communication_score * 10 * 100) / 100,
```

**Problem:** FastAPI contracts return scores on a 0–10 scale. Multiplying by 10 converts to 0–100. There is no clamp. A FastAPI score of 10.5 produces 105.0.

**Database impact:** `evaluation.response_evaluations.technical_score NUMERIC(5,2)` — no CHECK constraint, accepts 105.00 without error. `performance.assessment_reports.technical_score NUMERIC(5,2)` — same, no constraint. The corrupt value propagates silently through the aggregation in `sessions.routes.ts:362–364`.

**Fix (1 line per score field):**
```typescript
technical_score: Math.min(100, Math.max(0, Math.round(data.technical_score * 10 * 100) / 100)),
communication_score: Math.min(100, Math.max(0, Math.round(data.communication_score * 10 * 100) / 100)),
```

**BLOCKER STATUS: LOW** — only triggered if LLM returns a score > 10 (unlikely under normal operation, possible under adversarial or misconfigured prompts).

---

### G. SUPABASE READINESS

| Check | Status | Evidence |
|-------|--------|---------|
| DATABASE_URL env var | READY | `env.ts:12` — Zod string, default is localhost but overridden by `.env` |
| `.env` gitignored | ✓ SAFE | `.gitignore` lines 23–30 cover `.env`, `.env.*`, `backend/.env`, `backend/.env.*` |
| `.env.example` tracked | ✓ CORRECT | `!backend/.env.example` is excluded from ignore |
| Migration runner reads DATABASE_URL | READY | `migrate.ts:9` — `new Client({ connectionString: process.env.DATABASE_URL })` |
| Migration runner is transactional | ✓ SAFE | `migrate.ts:42–52` — each file in BEGIN/COMMIT/ROLLBACK |
| Migration tracking table | ✓ CORRECT | `system.migrations` tracks by filename — safe to run incrementally |
| Alphabetical sort order | ✓ CORRECT | 001→015→031→043 sorts correctly; gap 016–030 is fine (no files) |
| pgvector in Supabase | ✓ SUPPORTED | Supabase pre-installs pgvector. `CREATE EXTENSION IF NOT EXISTS vector` in migration 031 succeeds. |
| pgvector NOT in migration 001 | ✓ CORRECT | Migration 001 only installs uuid-ossp, pgcrypto, pg_trgm. pgvector is added in 031 with IF NOT EXISTS — safe. |
| All FKs resolvable in 001–043 range | ✓ CLEAN | All FKs reference tables created within 001–043. Deferred FK (`question_bank_item_skills.skill_id` → performance.skills) has NO FK in the migration — safe. |
| session.interview_transcripts not needed | ✓ | Migration 016 is absent from this repo; M2 never queries that table. The Supabase DB will not have that table until M1 contributes 016. |
| Score column constraints | ⚠ RISK | `NUMERIC(5,2)` on score columns has no CHECK ≤ 100. B-CLAMP fix should precede first data load. |
| No Supabase-specific config needed | ✓ | No SSL/pgbouncer settings required for direct connection. Supabase connection strings work with standard pg driver. |

**Verdict: The current 001–043 migrations can run cleanly on a fresh Supabase database.**

No changes to migrations are required before connecting. The only preparatory step is creating `backend/.env` with the Supabase `DATABASE_URL` (do not commit).

---

### Summary

| Item | Blocker for first live test? | Blocker for M3 integration? | Action needed by |
|------|------------------------------|----------------------------|-----------------|
| B10 (event payload) | NO | YES | M2 before M3 builds listeners |
| M1 question_bank name | NO (M2 unaffected) | YES (M1 bank-fallback fails) | M1 team |
| Migration 116 (deferred FK) | NO | NO | After M1 provides 016 |
| B5 (session terminate) | YES (blocks re-attempt) | YES | M2 |
| B6 (attempt abandon) | MEDIUM | MEDIUM | M2 |
| B-CLAMP (score overflow) | LOW | LOW | M2 (before data load) |
| Supabase DB readiness | — (no blockers) | — | Just needs .env |

### Files Modified
- `docs/MODULE_2_DEVELOPMENT_LOG.md` — this entry added
- `docs/CROSS_MODULE_INTEGRATION_LOG.md` — created with cross-module contract findings

### Decisions
No code changes. Awaiting approval.

---

## Update — 2026-09-26 (Cross-Module Architecture Audit + Integration Dependency Update)

### Task
Full cross-module architecture audit across all four team repositories. Update M3 integration dependency and database target.

### Audit Scope
All four repositories audited read-only:
- M1: github.com/tamil-selvan-k/communication-readiness-platform
- M2: this local repository (feature/module-2-live-integration)
- M3: github.com/bavanbalaji007/communication-readiness-platform
- M4: github.com/Ricardo-67/communication-readiness-platform

### Key Findings

**B3 STATUS CORRECTION:**
The cross-module audit confirmed that B3 is **FIXED** in the current code. `sessions.routes.ts:113–119` already contains the COMPLETED and TERMINATED guards:
```typescript
if (existing[0].state === 'COMPLETED') {
  throw new AppError(409, 'Session already completed', 'SESSION_ALREADY_COMPLETED');
}
if (existing[0].state === 'TERMINATED') {
  throw new AppError(409, 'Session was terminated', 'SESSION_TERMINATED');
}
```
The 2026-09-25 dev log entry incorrectly listed B3 as NOT FIXED. It is fixed. Updated all references.

**M3 INTEGRATION — ON HOLD:**
The M3 repository (`bavanbalaji007/communication-readiness-platform`) currently contains only the M1 base fork (migrations 001–015, no M3-specific code). Additionally, the interview routes reference non-existent tables (`candidates`, `jobs`, `interview_sessions`) from an unrelated project, and import `openai` directly without it being in `package.json`. This code cannot run as-is.

**Action:** Do NOT integrate the current M3 repository state. The M3 team is completing their implementation and will submit a PR. Integration will happen only after:
1. M3 PR is merged
2. Latest merged commit is confirmed
3. Full inspection of M3's migrations, API contracts, and `performance.skills`/`performance.listening_stories` tables
4. Comparison against M2 dependencies

**M4 STATUS:**
M4 is an identical stub fork. Zero credit tables, zero credit endpoints, zero event listeners. `CreditService` stub remains in place — do not remove until M4 delivers.

**SUPABASE DATABASE:**
Target database is now Supabase PostgreSQL (cloud, with pgvector support). This replaces the previously planned local PostgreSQL setup. Do NOT connect or run migrations until the Supabase project is confirmed ready and connection details are provided.

**Database driver layer:** Stay on raw `pg` driver with custom migration runner. No Drizzle, no Prisma. pgvector column (`embedding vector(1536)` in `session.question_bank_items`) is retained.

**ATTEMPT_COMPLETED event payload (B10):**
All four modules have divergent `AttemptCompletedPayload` shapes. M2 must fix B10 (add `assessmentId`, `technicalScore`, `communicationScore`, `reportId`) before M3/M4 register their listeners.

**M1 table name conflict:**
M1's `bank-fallback` route queries `session.question_bank` but M2 created `session.question_bank_items`. M1 team must update their query.

**Migration 110 needed:**
A migration must be written to add the deferred FK: `session.interview_transcripts.session_id → session.assessment_sessions(id)`. This runs after migrations 031–043.

### Files Modified
- `docs/MODULE_2_DEVELOPMENT_LOG.md` — this entry; corrected B3 status; updated current status header
- `docs/PROJECT_CONTEXT.md` — corrected B3 status; added M3 hold and Supabase notes

### Files Created
None

### Database Changes
None — Supabase project being created externally; no migrations executed

### Next Tasks (priority order — awaiting approval before implementing)
1. Fix B5: session TERMINATED → also set attempt ABANDONED
2. Fix B6: attempt ABANDONED → also terminate session if ACTIVE/PAUSED
3. Fix B10: complete `AttemptCompletedPayload` fields
4. Fix B-CLAMP: clamp scores to 0–100 in ai-client.ts
5. Fix B12: catch PG 23505 on duplicate response → 409
6. Write migration 110 (deferred FK)
7. Fix B-NEW-1: verify `filler_count` vs `filler_words` mapping
8. Correct API_REFERENCE.md POST /responses/submit body
9. (After Supabase ready) create `backend/.env`, run migrations, test HTTP flow
10. (After M3 PR merged) inspect M3 migrations and integrate

---

## Audit — 2026-09-25 (Full Repository Audit)

### Task
Cross-module repository audit: verify all M2 code against actual migrations, FastAPI contracts, design documents, and cross-module event/data contracts. Identify bugs, API mismatches, atomicity gaps, state machine problems, missing features, and edge cases.

### Scope
- All M2 source files (`assessments`, `attempts`, `sessions`, `responses`, `reports`, `evaluation`)
- Migrations 031–043
- FastAPI service (`ai-service/app/`)
- M1 baseline migrations (004, 012) for FK verification
- All documentation in `docs/`

### Work Completed
- Verified FastAPI contract alignment post-B1 fix: ai-client.ts correctly calls `/ai/evaluate-turn`; request/response shapes confirmed
- Verified actual migration column names against M2 code: `mentor_id` in migration 012 (not `mentor_user_id` as in design doc) — M2 code correct; `user_id` in migration 004 (not `actor_user_id` as in design doc) — M2 code correct
- Confirmed `performance.assessment_reports` schema location: M2 code and migration 041 are internally consistent; `BACKEND_IMPLEMENTATION_PLAN.md` ISSUE-01 resolution says `assessment` schema — documentation conflict, not a code bug
- Verified idempotency handling in `POST /api/responses/submit` — correct for matching idempotency key; gap identified for different key / same attempt+question
- Verified ATTEMPT_COMPLETED event payload vs plan spec — payload is missing fields
- Identified PAUSED session state is unreachable — no endpoint transitions to PAUSED
- Identified that `expires_at` column exists in `session.assessment_sessions` but is never populated or checked
- Identified that listening sub-flow (3 M2 endpoints) is completely blocked on M3 delivering `performance.listening_stories`
- Created `docs/EDGE_CASES.md` with 40 structured edge cases across EC-M1, EC-M2, EC-M3, EC-M4, EC-CROSS categories
- Confirmed FastAPI has `/ai/evaluate-listening` fully implemented — M2 has no listening routes yet

### Files Modified
- `docs/MODULE_2_DEVELOPMENT_LOG.md` — this audit section added

### Files Created
- `docs/EDGE_CASES.md` — 40 edge cases across all modules and cross-module interactions

### Bugs Found

| ID | Severity | File | Description | Status |
|----|----------|------|-------------|--------|
| B3 | CRITICAL | `sessions/sessions.routes.ts:113–119` | `POST /api/sessions/start` resume path re-activates COMPLETED and TERMINATED sessions — only ACTIVE state is guarded | **FIXED** (guards confirmed in code 2026-09-26 audit; dev log was incorrect) |
| B4 | HIGH | `attempts/attempts.routes.ts` | `CreditService.consume()` and attempt INSERT are not in one transaction; crash between them loses a credit | NOT FIXED |
| B5 | HIGH | `sessions/sessions.routes.ts:279` | Proctoring TERMINATED transition updates session but leaves attempt IN_PROGRESS | NOT FIXED |
| B6 | HIGH | `attempts/attempts.routes.ts` | `PUT /api/attempts/:id/abandon` marks attempt ABANDONED but leaves session ACTIVE | NOT FIXED |
| B7 | MEDIUM | `sessions.routes.ts` | `expires_at` column created in migration 034 but never set or evaluated; session timeout policy unimplemented | NOT FIXED |
| B8 | INFO | `docs/BACKEND_IMPLEMENTATION_PLAN.md` | ISSUE-01 says `assessment.assessment_reports`; code and migration use `performance.assessment_reports`. Docs must be corrected and M3 informed | NOT FIXED (doc update) |
| B9 | INFO | `docs/API_REFERENCE.md` | `POST /api/responses/submit` docs show `{ sessionId, transcript, durationSec, mode }`. Actual implementation requires `{ attemptId, questionId, transcript, inputType?, idempotencyKey? }` | NOT FIXED (doc update) |
| B10 | MEDIUM | `shared/events/events.ts` | `AttemptCompletedPayload` missing `assessmentId`, `technicalScore`, `communicationScore`, `reportId` vs plan spec | NOT FIXED |
| B11 | LOW | `attempts/attempts.routes.ts` | `GET /api/attempts/:id` has no FACULTY_MENTOR scope check — any mentor can read any student's attempt | NOT FIXED |
| B12 | LOW | `responses/responses.routes.ts` | Duplicate `(attempt_id, question_id)` submission with a different idempotency key hits DB UNIQUE constraint → unhandled 500 instead of 409 | NOT FIXED |

### AI Score Clamping Gap
`evaluateResponse()` in `ai-client.ts` multiplies FastAPI scores by 10 but does not clamp to 0–100. A malformed FastAPI score of 12 would produce 120 and corrupt the report. Fix: `Math.min(100, Math.max(0, score))` after normalization.

### Decisions
- No fixes applied during this audit pass; all bugs documented and classified by severity
- B1 and B2 were fixed in prior sessions; this audit confirms they are correctly resolved
- B8, B9, B10 should be addressed as a documentation pass before M3/M4 implement their event handlers to avoid downstream integration failures
- B3, B4, B5, B6 are correctness bugs — fix order should be B3 first (session state integrity), then B5+B6 together (termination completeness), then B4 (atomicity)

### Next Step
Choose one of:
1. **Fix B3** (30 min): Add COMPLETED/TERMINATED guard in `sessions.routes.ts` resume path
2. **Fix B4** (1–2 hr): Wrap credit-consume + attempt-insert in a DB transaction; requires M4 coordination or a compensating refund
3. **Fix B5 + B6** (45 min): Terminate session on attempt abandon; update attempt on session terminate
4. **Fix B10** (20 min): Add missing fields to `AttemptCompletedPayload` in `events.ts` and the `sessions/complete` emit call
5. **Doc pass B8 + B9** (30 min): Correct `BACKEND_IMPLEMENTATION_PLAN.md` and `API_REFERENCE.md`

Recommended order: B3 → B5+B6 → B10 → doc pass → B4 (needs M4 coordination).

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
