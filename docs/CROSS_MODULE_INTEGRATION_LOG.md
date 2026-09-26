# Cross-Module Integration Log
> Communication Readiness Platform
> This file tracks cross-module API contracts, event contracts, database dependencies, and integration readiness between M1, M2, M3, and M4.

---

## Entry — 2026-09-26 (Pre-Supabase Readiness Pass)

### ATTEMPT_COMPLETED Event Contract

**Owner:** M2 emits. M3 and M4 must consume.

**Current payload (M2 `src/shared/events/events.ts`):**
```typescript
interface AttemptCompletedPayload {
  attemptId: string;
  studentId: string;
  assessmentType: string;   // 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION'
  overallScore: number;     // 0–100
}
```

**Required payload (cross-module design):**
```typescript
interface AttemptCompletedPayload {
  attemptId: string;             // ✓ present
  assessmentId: string;          // ✗ MISSING — M3/M4 need this UUID
  studentId: string;             // ✓ present
  assessmentType: string;        // ✓ present — keep
  technicalScore: number;        // ✗ MISSING
  communicationScore: number;    // ✗ MISSING
  overallScore: number;          // ✓ present
  reportId: string | null;       // ✗ MISSING — M3 needs this to locate the report
}
```

**Status:** Bug B10 — NOT FIXED. All missing values are computed in `sessions.routes.ts` before the emit. Fix requires changes to 2 files only.

**GATE: M3 and M4 must NOT implement event listeners until B10 is fixed.**

---

### M1 → M2 Database Dependency

| Dependency | Table/Object | Status |
|------------|-------------|--------|
| Auth middleware | identity.users | ✓ M2 uses M1's authenticate middleware correctly |
| Student resolution | org.students JOIN org.batches | ✓ M2 correctly JOINs via batch_id (no direct program_id on students) |
| Audit log writes | system.audit_logs | ✓ M2 writes proctoring warnings correctly |
| Mentor scope check | org.student_mentor_assignments | ✓ M2 uses is_active = true pattern correctly |
| Session FK (deferred) | session.interview_transcripts → session.assessment_sessions | ✗ PENDING migration 116 |

---

### M2 → M4 Credit Service Contract

**Current M2 stub interface** (`src/modules/credits/credits.service.stub.ts`):
```typescript
CreditService.consume(
  studentId: string,
  cost: number,
  reason: string,
  referenceId: string
) → Promise<{ newBalance: number }>
// Throws AppError(402, 'Insufficient credits', 'INSUFFICIENT_CREDITS') on low balance
```

**Current behavior:** Always returns `{ newBalance: 50 }`. Never throws.

**What M4 must implement:**
- Accept `(studentId, cost, reason, referenceId)` 
- Check `credit.credit_account.balance >= cost`
- If insufficient: throw `AppError(402, 'Insufficient credits', 'INSUFFICIENT_CREDITS')`
- If sufficient: deduct from balance, insert into `credit.credit_transaction`, return `{ newBalance }`
- This must participate in the same DB transaction as the attempt INSERT (B4 coordination needed)

**Gate: M2's B4 (atomicity) cannot be fully fixed until M4 delivers and the CreditService interface is agreed upon.**

---

### M2 → M3 Table Dependencies

| M2 needs from M3 | Table | Status |
|-----------------|-------|--------|
| Listening sub-flow | `performance.listening_stories` | ✗ NOT CREATED — M3 must deliver |
| Question skill tags FK | `performance.skills` | ✗ NOT CREATED — FK intentionally deferred in migration 036 |

**Gates:**
- M2 cannot implement `POST /api/listening/start`, `GET /api/listening/:id/replay`, `POST /api/listening/:id/submit` until M3 creates `performance.listening_stories`
- M2 cannot enforce skill FK integrity until M3 creates `performance.skills` and migration 116+ is written

---

### M1 Question Bank Table Name Conflict

| Module | Table referenced | Status |
|--------|-----------------|--------|
| M1 `bank-fallback` route | `session.question_bank` | ✗ TABLE DOES NOT EXIST |
| M2 migration 035 | `session.question_bank_items` | ✓ Canonical table |
| M2 sessions routes, question-bank routes | `session.question_bank_items` | ✓ Correct |

**Action required by M1 team:** Update `GET /api/sessions/bank-fallback` to query `session.question_bank_items`. Until fixed, that M1 endpoint throws a PostgreSQL relation-does-not-exist error at runtime.

---

### Migration Sequencing (for shared Supabase DB)

```
Step 1 — Base (M1 owned):
  001_extensions.sql         pgvector NOT here — correct
  002_schemas.sql            all 11 schemas
  003–015                    identity, org, system, triggers

Step 2 — M1 domain (M1 must contribute to shared folder):
  016_session_transcripts.sql   MISSING from this repo — M1 to add

Step 3 — M2 domain:
  031–043                    assessment, session sessions, question bank,
                             questions, evaluation, performance reports

Step 4 — Deferred FK (after 016 and 034 both exist):
  116_interview_transcripts_fk.sql   NOT WRITTEN YET
  -- ALTER TABLE session.interview_transcripts
  --   ADD CONSTRAINT fk_transcripts_session_id
  --     FOREIGN KEY (session_id) REFERENCES session.assessment_sessions(id);

Step 5 — M3 domain (NOT STARTED):
  061–090 range    performance.skills, performance.listening_stories, etc.

Step 6 — skills FK (after M3 creates performance.skills):
  115_question_bank_skills_fk.sql   NOT WRITTEN YET
  -- ALTER TABLE session.question_bank_item_skills
  --   ADD CONSTRAINT fk_skills FOREIGN KEY (skill_id)
  --     REFERENCES performance.skills(id);

Step 7 — M4 domain (NOT STARTED):
  091–114 range    credit.credit_policy, credit.credit_account, credit.credit_transaction
```

**Current clean range for Supabase first run:** Steps 1 + 3 (001–015, 031–043). Steps 2 and 4 depend on M1. Steps 5–7 depend on M3/M4.

---

### B5 / B6 State Machine Contract

The `assessment.assessment_attempts.status` column has a CHECK constraint: `IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED')`. There is NO `TERMINATED` status on attempts.

When a session is TERMINATED (proctoring):
- Session state → `TERMINATED` ✓ (already done)
- Attempt status → `ABANDONED` ✗ **NOT DONE (B5)**

When an attempt is ABANDONED (explicit student action):
- Attempt status → `ABANDONED` ✓ (already done)
- Session state → `TERMINATED` ✗ **NOT DONE (B6)** (if session is ACTIVE/PAUSED)

---

### B-CLAMP Score Overflow Risk

FastAPI scores: 0–10 scale. M2 multiplies by 10 → 0–100. No upper clamp.

`NUMERIC(5,2)` columns in `evaluation.response_evaluations` and `performance.assessment_reports` have no CHECK constraint preventing values > 100. A FastAPI score of 10.1 would produce 101.0 and silently persist.

Fix: Apply `Math.min(100, Math.max(0, score))` after normalization in `ai-client.ts:78–79`.

---

---

## Update — 2026-09-26 (B5, B6, B10, B-CLAMP Applied)

### Changes Applied

**B5 FIXED:** Session TERMINATED by proctoring now also sets `assessment.assessment_attempts.status = 'ABANDONED'`. Concurrency guard `AND status = 'IN_PROGRESS'` prevents double-update. The student can now retry after a proctoring termination.

**B6 FIXED:** Attempt ABANDONED now terminates the associated session if it is ACTIVE or PAUSED (`AND state IN ('ACTIVE', 'PAUSED')`). Already COMPLETED/TERMINATED sessions are unaffected.

**B10 FIXED:** `AttemptCompletedPayload` now includes all required fields: `attemptId`, `assessmentId`, `studentId`, `assessmentType`, `technicalScore`, `communicationScore`, `overallScore`, `reportId`. M3 and M4 may now implement event listeners against this payload once their code is delivered.

**B-CLAMP FIXED:** `ai-client.ts` scores are now clamped: `Math.min(100, Math.max(0, score * 10))`. Corrupt > 100 scores can no longer propagate to the database.

### TypeScript Status
`tsc --noEmit` — **PASS, 0 errors**

### Integration Readiness Matrix (as of 2026-09-26, post-fix)

| Integration | Ready? | Blocker |
|-------------|--------|---------|
| M2 → Supabase (migrations) | ✓ READY | Only needs .env file |
| M2 → FastAPI (evaluate-turn) | ✓ READY | Needs AI_SERVICE_URL + LLM config |
| M2 → M1 auth/middleware | ✓ READY | Shared codebase |
| M2 → M4 CreditService | ✗ NOT READY | M4 not started |
| M2 ATTEMPT_COMPLETED emit | ✓ COMPLETE | B10 fixed — full payload emitted |
| M3 consuming ATTEMPT_COMPLETED | ✗ BLOCKED | M3 PR not yet merged |
| M4 consuming ATTEMPT_COMPLETED | ✗ BLOCKED | M4 not started |
| M2 listening sub-flow | ✗ BLOCKED | M3 must deliver performance.listening_stories |
| M1 bank-fallback | ✗ BROKEN | Table name wrong (session.question_bank vs question_bank_items) |
| Migration 116 (deferred FK) | ✗ NOT WRITTEN | Needs M1 to add 016 first |

---

## Entry — 2026-09-26 (Integration Audit — M2 Full Route + Schema Verification)

### A. M2 → FastAPI Contract (Verified)

**evaluateResponse()** → `POST /ai/evaluate-turn` (JSON)
- Request: `{ question_text, student_answer, difficulty, turn_number?, domain? }`
- Response fields consumed: `technical_score`, `communication_score`, `wpm`, `filler_words` (mapped to `filler_count`), `feedback`, `strengths`, `weaknesses`, `next_recommended_difficulty`
- B-CLAMP: FIXED — scores are `Math.min(100, Math.max(0, raw * 10))` before DB write
- Timeout: 30 000 ms; unreachable path returns `{ unreachable: true }` → handler returns 503

**generateQuestion()** → `POST /ai/generate-question` (JSON)
- Request: `{ student_name, difficulty, previous_turns?, domain? }`
- Response fields consumed: `question_text`, `difficulty`, `category?`
- Unreachable path returns empty `question_text` — callers must handle

---

### B. M2 → M1 Auth Contract (Verified)

`authenticate` middleware (shared codebase):
- Reads `Bearer` token → `jwt.verify(token, JWT_SECRET)`
- **Live DB read on every request**: `SELECT token_version, status FROM identity.users WHERE id = $1`
- Checks `rows[0].token_version === decoded.tokenVersion` — catches revoked tokens post-logout
- Suspended accounts (`status = 'SUSPENDED'`) → 403

`requireRole(...roles)` — checks `req.user!.role` against allowed roles (flat check, no hierarchy).

No Redis dependency in M2 auth path. Redis is M1's concern (sessionContextService).

---

### C. M2 Route Inventory (Verified Complete)

| Method | Path | Role Guard | Notes |
|--------|------|------------|-------|
| GET | /api/assessments | any auth | Returns only is_active=true |
| POST | /api/assessments | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | Creates assessment |
| GET | /api/assessments/:id | any auth | Includes components array |
| PUT | /api/assessments/:id | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | Partial update |
| POST | /api/attempts/start | STUDENT | Consumes credit stub; creates attempt |
| GET | /api/attempts/:id | any auth | STUDENT restricted to own; other roles unrestricted (B11 open) |
| PUT | /api/attempts/:id/abandon | STUDENT | Sets ABANDONED + terminates session (B6 FIXED) |
| POST | /api/sessions/start | STUDENT | Creates/resumes session; B3 FIXED (guards COMPLETED/TERMINATED) |
| GET | /api/sessions/:id | any auth | STUDENT/MENTOR scoped |
| POST | /api/sessions/:id/pause | STUDENT | ACTIVE → PAUSED |
| POST | /api/sessions/:id/resume | STUDENT | PAUSED → ACTIVE |
| POST | /api/sessions/:id/complete | STUDENT | Computes scores, writes report, emits ATTEMPT_COMPLETED |
| POST | /api/sessions/:id/proctor-event | any auth | Writes audit_log, updates state_data; B5 FIXED |
| POST | /api/responses/submit | STUDENT | Calls FastAPI evaluate-turn, adaptive difficulty |
| GET | /api/responses/:id | any auth | STUDENT own; MENTOR must be assigned |
| GET | /api/reports/:attemptId | any auth | STUDENT own; MENTOR must be assigned |
| GET | /api/question-bank | FACULTY_MENTOR, TRAINER, PROGRAM_ADMIN, PLACEMENT_COORDINATOR | Lists active items |
| POST | /api/question-bank | FACULTY_MENTOR, TRAINER, PROGRAM_ADMIN | Transactional insert + skill tags |
| PUT | /api/question-bank/:id | FACULTY_MENTOR, TRAINER, PROGRAM_ADMIN | Partial update |
| DELETE | /api/question-bank/:id | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | Soft delete |

---

### D. M2 → M1 Schema Dependencies (Verified All ✓)

All M2 queries against M1-owned tables verified correct:
- `identity.users` — via authenticate middleware; columns `token_version`, `status` ✓
- `org.students` — columns `id`, `user_id`, `batch_id`, `subdivision_id` ✓
- `org.batches` — columns `id`, `program_id` ✓ (program_id is on batch, not student)
- `org.programs` — FK target for attempt.program_id snapshot ✓
- `org.student_mentor_assignments` — columns `student_id`, `mentor_id`, `is_active` ✓
- `system.audit_logs` — written by proctor-event handler ✓

---

### E. M2 Schema Verification (Key Tables)

**assessment.assessment_attempts** (migration 033)
- `status` CHECK: `IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED')` — NO TERMINATED status
- B5/B6 both correctly use 'ABANDONED' (not 'TERMINATED') when updating attempts ✓

**session.assessment_sessions** (migration 034)
- `state` CHECK: `IN ('INITIALIZED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'TERMINATED')`
- `attempt_id UNIQUE` — one session per attempt ✓
- Proctoring state in `state_data JSONB` (not individual columns) — differs from original checklist

**performance.assessment_reports** (migration 041)
- `attempt_id UNIQUE` — one report per attempt ✓
- `NUMERIC(5,2)` scores — no DB-level CHECK ≤ 100 (app-layer B-CLAMP is the only guard)
- `listening_score NUMERIC(5,2)` column exists — M3 sub-flow can populate it later ✓
- M3 reads from this table; M2 writes it — schema is stable

**session.question_bank_item_skills** (migration 036)
- `skill_id UUID NOT NULL` but NO FK to performance.skills — intentional deferral
- Will need migration 115 once M3 creates performance.skills

---

### F. ATTEMPT_COMPLETED Payload Contract (Full Verification)

**M2 emits** (events.ts, sessions.routes.ts):
```typescript
{
  attemptId: string;       // from session.attempt_id
  assessmentId: string;    // from session.assessment_id (JOIN assessment.assessments)
  studentId: string;       // from session.student_id
  assessmentType: string;  // from asmt.assessment_type
  technicalScore: number;  // Math.round(techAvg * 100) / 100
  communicationScore: number; // Math.round(commAvg * 100) / 100
  overallScore: number;    // tech*0.70 + comm*0.30
  reportId: string | null; // reportRows[0]?.id ?? null
}
```
Score formula: `overallScore = technicalScore * 0.70 + communicationScore * 0.30` (rounded 2dp)
Emit timing: `setImmediate(() => eventBus.emit(...))` — fire-and-forget after HTTP response

**What M3/M4 must use** (once they implement listeners):
- Use `attemptId` (not `sessionId` — old shape is gone)
- Use `assessmentId` for filtering by assessment type
- Use `reportId` to locate the pre-written performance.assessment_reports row (M3 reads from it)
- Use `technicalScore`/`communicationScore` directly (already 0–100, no re-normalization needed)

---

### G. CreditService Interface for M4 (Verified)

M2 stub exports: `CreditService.consume(studentId, amount, reason, referenceId) → Promise<{ newBalance }>`

File to replace: `backend/src/modules/credits/credits.service.stub.ts`
Export name M4 must match: `CreditService` (or the stub re-export name)

M4 contract requirements:
1. Accept `(studentId: string, amount: number, reason: string, referenceId: string)`
2. Check `credit.credit_account.balance >= amount`
3. If insufficient: throw `new AppError(402, 'Insufficient credits', 'INSUFFICIENT_CREDITS')`
4. If sufficient: deduct, insert credit_transaction, return `{ newBalance: number }`
5. B4 (atomicity): CreditService + attempt INSERT must be in same transaction — requires M4 to expose a transaction-aware interface or M2 to move credit deduction inside the INSERT transaction

---

### H. Open Bugs Summary (M2-Scope, As of 2026-09-26)

| Bug | Status | Blocker |
|-----|--------|---------|
| B1 — wrong FastAPI endpoint | FIXED | — |
| B2 — FACULTY_MENTOR unscoped response read | FIXED | — |
| B3 — resume reactivates completed sessions | FIXED | — |
| B4 — CreditService not transactional with attempt INSERT | NOT FIXED | Needs M4 delivery + interface agreement |
| B5 — proctoring TERMINATED didn't set attempt ABANDONED | FIXED | — |
| B6 — attempt ABANDONED didn't terminate session | FIXED | — |
| B10 — AttemptCompletedPayload incomplete | FIXED | — |
| B-CLAMP — FastAPI scores could exceed 100 | FIXED | — |
| B11 — GET /attempts/:id allows any role (no FACULTY_MENTOR scope check) | NOT FIXED | Low risk — mentors can read any attempt |

---

### I. Integration Blockers (Ranked by Severity)

**CRITICAL — M3:**
- No M3-specific migrations exist in any repo (only 001-015 base clone)
- Code references tables that don't exist: `candidates`, `jobs`, `interview_sessions`
- Direct OpenAI call in source; `openai` package NOT in package.json — code will not run
- ATTEMPT_COMPLETED listener uses old payload shape (`sessionId` field)
- Must resolve before M3 code can be merged into shared backend

**CRITICAL — M4:**
- No M4-specific migrations exist (only 001-015 base clone)
- No credit endpoints, no event listeners implemented
- CreditService not implemented — M2 stub always returns `{ newBalance: 50 }`
- ATTEMPT_COMPLETED reference uses old payload shape (`sessionId` field)
- B4 atomicity gap persists until M4 delivers

**HIGH — M1:**
- `GET /api/sessions/bank-fallback` queries `session.question_bank` — table does not exist
- Correct table: `session.question_bank_items` (M2 migration 035)
- This endpoint throws PostgreSQL `relation does not exist` at runtime

**MEDIUM — Deferred FKs:**
- Migration 116 (`session.interview_transcripts.session_id → session.assessment_sessions.id`) not written; requires M1 to contribute migration 016 first
- Migration 115 (`session.question_bank_item_skills.skill_id → performance.skills.id`) not written; requires M3 to create performance.skills

**LOW:**
- B11: GET /api/attempts/:id — FACULTY_MENTOR can read any attempt without scope check
- B4: CreditService atomicity gap

---

### J. Supabase Migration Readiness

Safe to run now (Steps 1 + 3 only): migrations 001–015, 031–043
- 001: pgvector extension (M2 migration 031 adds `CREATE EXTENSION IF NOT EXISTS vector` as safe duplicate)
- 002: all 11 schemas created
- 003–015: identity, org, system base tables
- 031–043: M2 assessment, session, evaluation, performance tables

NOT safe to run without additional coordination:
- Migration 016 (M1 interview_transcripts) — M1 must contribute to shared folder
- Migrations 061–090 (M3 range) — M3 must write them
- Migrations 091–114 (M4 range) — M4 must write them
- Migration 115 (skills FK) — after M3's 061–090
- Migration 116 (session FK) — after both M1's 016 and M2's 034

---

---

## Entry — 2026-09-26 (Full Module Integration + Testing Audit — All Modules)

Parallel agents audited M1 (commit `74c927a0`, 2026-09-25), M3 (commit `214eb0ef`, 2026-09-24), M4 (commit `f7a62a72`, 2026-09-24). Full 18-section consolidated report produced.

---

### K. M1 New Commit Analysis (`74c927a0` — "Module 2 partially completed", 2026-09-25)

**New additions (+2,847 lines across 15 files):**

- `backend/src/database/migrations/016_session_transcripts.sql` — creates `session.interview_transcripts`; `session_id` has NO FK (intentionally deferred per comment). References only `org.students(id)` — safe to run before migration 034.
- `backend/src/routes/interview.routes.ts` — `POST /api/sessions/:id/turns` (audio) + `GET /api/sessions/bank-fallback`
- `backend/src/services/sessionContextService.ts` — `ioredis` client; caches last 10 turns per session (2-hr TTL); flushes to `session.interview_transcripts` via `INSERT … ON CONFLICT DO NOTHING`
- `ai-service/app/routers/interview.py` — adds `POST /ai/evaluate-response` (Groq Whisper STT + librosa + webrtcvad, parallel via `asyncio.gather`)
- `ai-service/app/services/audio_analyzer.py` + `stt_service.py` (new files)
- New `ai-service` dependencies: `python-multipart`, `librosa`, `webrtcvad`
- Frontend: Web Speech API replaced with `@ricky0123/vad-web` VAD

**M2 stubs in M1 route file:** `POST /api/sessions/start`, `GET /api/sessions/:id`, `POST /api/sessions/:id/conclude`, `POST /api/sessions/:id/proctor-event` — all commented "will be implemented when M2 migrations (031+) run." Confirms M1 is aware M2 owns these.

---

### L. CRITICAL — B-TURNS-NO-AUTH (M1 Security Vulnerability)

`POST /api/sessions/:id/turns` in M1's `interview.routes.ts`:

```typescript
interviewRouter.post(
  '/:id/turns',
  audioUpload.single('audio'),   // ← no authenticate middleware
  async (req: AuthRequest, res: Response) => {
    // ...
    const meta = TurnMetadataSchema.parse(JSON.parse(metadataRaw));
    // meta.studentId comes from request body — NOT from JWT
    sessionContextService.flushToDb(meta.sessionId, meta.studentId)
```

**Impact:** Any unauthenticated HTTP request can submit turns. Attacker controls `meta.studentId` — can write transcripts attributed to any student. No session ownership check. No ACTIVE state check.

**Fix required (M1 team):**
1. Add `authenticate` middleware before `audioUpload.single('audio')`
2. Use `req.user!.id` (from JWT) instead of `meta.studentId` from body
3. Add DB query: verify session exists, belongs to `req.user!.id`'s student record, and is in ACTIVE state

---

### M. CRITICAL — B-RESPONSE-SPLIT (Audio Scores Excluded from Final Report)

Two response submission paths exist in the merged backend:

| Path | Endpoint | Storage | Score columns written |
|------|----------|---------|----------------------|
| M1 audio path | `POST /api/sessions/:id/turns` | `session.interview_transcripts` | None — only text/transcript |
| M2 text path | `POST /api/sessions/:id/responses` | `evaluation.response_evaluations` | `technical_score`, `communication_score` |

M2's session complete handler (`POST /api/sessions/:id/complete`) computes final report:
```sql
SELECT AVG(technical_score), AVG(communication_score)
FROM evaluation.response_evaluations
WHERE session_id = $1
```

If a student submitted via M1's audio `/turns` endpoint → zero rows in `evaluation.response_evaluations` → `AVG()` returns `NULL` → report is written with `null` scores and `overall_score = NULL`.

**The entire audio interview path produces broken final reports.**

**Resolution options (decision required):**

| Option | Description | Complexity |
|--------|-------------|------------|
| A (recommended) | M1's turns endpoint also INSERTs into `evaluation.response_evaluations` after score normalization | Low — add ~8 lines to M1 handler |
| B | M2's complete handler reads from BOTH tables and unions scores | Medium — changes M2 complete handler |
| C | Treat endpoints as separate assessment types; dispatch in complete handler based on `assessment_type` | Medium — requires M2 type-aware branching |

---

### N. B-QBANK-NAME Confirmed in M1 Code

M1's `GET /api/sessions/bank-fallback` (confirmed verbatim in `interview.routes.ts`):

```typescript
const { rows } = await db.query(
  `SELECT id, question_text, difficulty, category, domain
   FROM session.question_bank
   WHERE difficulty = $1
     AND ($2::text IS NULL OR domain = $2)
   ORDER BY random()
   LIMIT 1`,
  [query.difficulty, query.domain ?? null],
).catch(() => ({ rows: [] as any[] })); // table may not exist yet (pre-M2)
```

`session.question_bank` does not exist. M2 created `session.question_bank_items` (migration 035). The `.catch()` silently swallows the PostgreSQL error and returns the hardcoded static fallback every time.

**Impact:** Students never receive questions from the question bank. Static fallbacks are returned for every bank-fallback request.

**Fix (M1 team):** Change `session.question_bank` → `session.question_bank_items`. Verify column names: `question_bank_items` has `question_text`, `difficulty`, `category`, `domain` (confirmed in migration 035).

---

### O. B-REDIS-NEW — New Runtime Dependency

M1's `sessionContextService.ts` instantiates `ioredis` at module load time:

```typescript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL!);
```

When M1 is merged to shared backend:
- `ioredis` must be in `backend/package.json` (already added in M1 fork per commit diff)
- `REDIS_URL` must be added to `backend/src/config/env.ts` Zod schema
- `REDIS_URL` must be present in `backend/.env`

**Supabase does NOT provide Redis.** A separate Redis provider is required:
- Local development: Docker (`redis:alpine`) or `redis-server`
- Cloud: Upstash Redis (free tier, compatible with `ioredis`)

Without Redis, `POST /api/sessions/:id/turns` throws on every call. The turns endpoint is hard-blocked on Redis availability.

---

### P. M3 Full Audit Results (commit `214eb0ef`, 2026-09-24)

**Latest M3 commit is a merge FROM M1, not new M3 work.** The commit message "Merge pull request #4 from tamil-selvan-k/main — Bigfix" confirms it pulled from M1's main branch.

**M3 implementation status:**

| Component | Status |
|-----------|--------|
| Migrations 061–090 range | NOT WRITTEN — only 001–015 (M1 base) |
| `performance.skills` table | DOES NOT EXIST |
| `performance.listening_stories` table | DOES NOT EXIST |
| Performance analytics tables | DOES NOT EXIST |
| M3-specific routes | NONE — only M1-inherited stubs |
| ATTEMPT_COMPLETED listener | NONE |
| `events.ts` payload | OLD — `{ sessionId, studentId, overallScore }` (incompatible with B10 fix) |
| `001_extensions.sql` | No `CREATE EXTENSION vector` |
| M3-specific modules/ directory | DOES NOT EXIST |

**Downstream impact on M2:**
- `POST /api/listening/start`, `GET /api/listening/:id/replay`, `POST /api/listening/:id/submit` — all blocked until `performance.listening_stories` exists
- `session.question_bank_item_skills.skill_id` FK (migration 115) — cannot be written until `performance.skills` exists

---

### Q. M4 Full Audit Results (commit `f7a62a72`, 2026-09-24)

M4 is unchanged from the prior audit. Zero M4-specific implementation.

| Component | Status |
|-----------|--------|
| Migrations 091–114 range | NOT WRITTEN — only 001–015 (M1 base) |
| `credit.credit_policy` table | DOES NOT EXIST |
| `credit.credit_account` table | DOES NOT EXIST |
| `credit.credit_transaction` table | DOES NOT EXIST |
| Real CreditService implementation | NOT DELIVERED |
| ATTEMPT_COMPLETED listener | NONE |
| Credit-related routes | NONE |

**Impact:** M2's `credits.service.stub.ts` still active. Every student attempt deducts zero credits. `newBalance` always returns 50. B4 (atomicity) persists indefinitely.

---

### R. Updated Integration Readiness Matrix (2026-09-26, Post Full Audit)

| Integration | Status | Blocker |
|-------------|--------|---------|
| M2 → Supabase (migrations 001–043) | ✓ READY (once .env created) | Only needs DATABASE_URL in .env |
| M2 → FastAPI text eval (evaluate-turn) | ✓ READY | Needs AI_SERVICE_URL |
| M2 → FastAPI question gen (generate-question) | ✓ READY | Needs AI_SERVICE_URL |
| M2 → M1 auth/middleware | ✓ READY (shared codebase) | — |
| M2 ATTEMPT_COMPLETED emit | ✓ COMPLETE (B10 fixed) | — |
| M1 audio turns → M2 final report | ✗ BROKEN | B-RESPONSE-SPLIT — audio scores excluded |
| M1 bank-fallback | ✗ BROKEN | B-QBANK-NAME — queries wrong table |
| M1 turns endpoint security | ✗ BROKEN | B-TURNS-NO-AUTH — no authenticate middleware |
| M1 → shared backend (Redis) | ✗ BLOCKED | REDIS_URL env var + Redis provider needed |
| M1 migration 016 → shared repo | ✗ NOT CONTRIBUTED | M1 must add to shared migrations/ folder |
| M3 event listener (ATTEMPT_COMPLETED) | ✗ BLOCKED | M3 not implemented; old payload shape |
| M4 event listener (ATTEMPT_COMPLETED) | ✗ BLOCKED | M4 not implemented |
| M2 listening sub-flow | ✗ BLOCKED | M3 must deliver performance.listening_stories |
| M2 skills FK (migration 115) | ✗ BLOCKED | M3 must deliver performance.skills |
| M2 → M4 CreditService real impl | ✗ BLOCKED | M4 not implemented |
| Migration 116 (transcripts FK) | ✗ NOT WRITTEN | Safe to write once M1 contributes 016 |
| Migration 115 (skills FK) | ✗ NOT WRITTEN | Blocked on M3 migration 06x |

---

### S. Priority Action List (Ranked by Severity)

**CRITICAL — Must fix before any merge:**
1. M1: Add `authenticate` middleware to `POST /api/sessions/:id/turns` (B-TURNS-NO-AUTH)
2. Architectural decision: How to bridge B-RESPONSE-SPLIT (recommend Option A — M1 writes to `evaluation.response_evaluations` too)
3. M1: Fix `session.question_bank` → `session.question_bank_items` in bank-fallback (B-QBANK-NAME)

**HIGH — Before first Supabase run:**
4. Add `REDIS_URL` to `backend/src/config/env.ts` Zod schema and `backend/.env.example`
5. M1: Contribute `016_session_transcripts.sql` to shared `backend/src/database/migrations/`
6. Write `116_interview_transcripts_fk.sql` (safe once 016 and 034 are in shared folder)

**M3/M4 — Platform unshippable without:**
7. M3 team: Write migrations 061–090; update `events.ts` to B10 payload; implement ATTEMPT_COMPLETED listener
8. M4 team: Write migrations 091–114; implement real CreditService.consume(); coordinate B4 atomicity


---

## Entry — 2026-09-26 (M1 Audio Interview Integration Fixes Applied)

### Changes Applied to Shared Backend

All four M1 integration blockers from the consolidated audit are now resolved in the shared backend codebase.

---

### T. B-TURNS-NO-AUTH — Fixed

**File:** `backend/src/routes/interview.routes.ts` (new)

`authenticate` middleware is now the **first** handler in the `POST /api/sessions/:id/turns` chain, before `audioUpload.single('audio')`. `studentId` is derived exclusively from `req.user!.id` (JWT). A DB ownership check confirms `session.student_user_id === req.user.id` before any audio processing occurs.

---

### U. B-RESPONSE-SPLIT — Fixed

**Files:** `backend/src/routes/interview.routes.ts` (new)

**Root cause traced:** `evaluation.responses.question_id` has a `NOT NULL` FK constraint to `session.questions`. M1's audio path had no corresponding `session.questions` row, making it impossible to write `evaluation.response_evaluations` entries, which M2's complete handler requires.

**Resolution — two-part:**

1. `GET /api/sessions/bank-fallback` now inserts the served question into `session.questions` (`question_type = 'INTERVIEW'`, `question_bank_item_id` linked). This gives audio sessions a valid question_id per turn.

2. `POST /api/sessions/:id/turns` now writes in sequence:
   - `evaluation.responses` (attempt_id + question_id + input_type='VOICE' + transcript)
   - `evaluation.ai_runs` (capability='EVALUATE_AUDIO_RESPONSE', FastAPI latency)
   - `evaluation.response_evaluations` (technical_score, communication_score — clamped 0–100)

   M2's `POST /sessions/:id/complete` handler now finds these rows in its `AVG(technical_score)` query and produces non-null final reports for audio sessions.

3. Also writes to `session.interview_transcripts` (migration 016) with a `.catch()` — non-fatal until migration 016 is applied.

**Cross-module contract confirmed:** M2's complete handler reads from `evaluation.response_evaluations` via `evaluation.responses WHERE attempt_id = $1`. No changes to M2 required.

---

### V. B-QBANK-NAME — Fixed

**File:** `backend/src/routes/interview.routes.ts` (new)

`GET /api/sessions/bank-fallback` now queries `session.question_bank_items` (correct). Domain/category filters use `metadata->>'domain'` and `metadata->>'category'` (JSONB) since `question_bank_items` has no dedicated columns for these. The `.catch()` guard from M1's original code is preserved.

---

### W. B-REDIS-NEW — Resolved (graceful degradation)

**Files:** `backend/src/config/env.ts`, `backend/src/services/sessionContextService.ts` (new), `backend/.env.example`

`REDIS_URL` is now in the Zod schema as `z.string().url().optional()` — server starts without it. `sessionContextService` uses dynamic `require('ioredis')` with all errors caught; degrades to a no-op cache when REDIS_URL is absent or ioredis is unavailable. Audio turns continue to function via direct DB writes.

**Local dev requirement:** `docker run -p 6379:6379 redis:alpine` or `brew install redis && redis-server`. Set `REDIS_URL=redis://localhost:6379` in `backend/.env`.

---

### X. Migration 016 Added to Shared Repo

**File:** `backend/src/database/migrations/016_session_transcripts.sql` (new)

Contributes M1's migration to the shared migrations folder. Creates `session.interview_transcripts` with:
- `session_id UUID NOT NULL` — no FK yet (deferred; FK added in migration 116 after migration 034 exists)
- `student_id UUID REFERENCES org.students(id)`
- `response_id UUID REFERENCES evaluation.responses(id)` — links M1 raw record to M2 evaluation record
- `UNIQUE (session_id, turn_number)` constraint

**Must be run before audio transcripts are persisted.** Audio turns degrade gracefully (scores still saved) if migration 016 is not yet applied.

**Updated migration run order for Supabase first run:**

```
001–015  M1 base (identity, org, system)
016      M1 interview_transcripts (NEW — must run before audio turns)
031–043  M2 domain (assessment, session, evaluation, performance)
```

Deferred migrations (require additional team deliveries):
```
061–090  M3 performance/listening (M3 team)
091–114  M4 credits (M4 team)
115      skills FK (after M3's 061+)
116      transcripts FK (after 016 + 034 both applied)
```

---

### Y. Updated Integration Readiness Matrix (2026-09-26, Post M1 Integration Fixes)

| Integration | Status | Notes |
|-------------|--------|-------|
| M2 → Supabase (migrations 001–016, 031–043) | ✓ READY (once .env created) | All SQL files written and statically verified |
| M2 text evaluation path | ✓ READY | Unchanged; verified working |
| M1 audio turns → M2 final report | ✓ FIXED | B-RESPONSE-SPLIT resolved — audio scores in response_evaluations |
| M1 bank-fallback | ✓ FIXED | B-QBANK-NAME resolved — queries question_bank_items |
| M1 turns endpoint security | ✓ FIXED | B-TURNS-NO-AUTH resolved — authenticate middleware + ownership check |
| Redis session caching | ✓ OPTIONAL/GRACEFUL | REDIS_URL optional; degrades cleanly when absent |
| M1 → shared backend (ioredis) | ✓ IN package.json | `ioredis: ^5.4.0` added |
| M3 event listener | ✗ BLOCKED | M3 not implemented |
| M4 event listener | ✗ BLOCKED | M4 not implemented |
| M2 listening sub-flow | ✗ BLOCKED | M3 must deliver performance.listening_stories |
| M2 → M4 real CreditService | ✗ BLOCKED | M4 not implemented |
| Migration 116 (transcripts FK) | ✗ NOT WRITTEN | Write after 016 + 034 on Supabase |
