# Module 2 Implementation Checklist
**Owner:** Member 2 | **Migration range:** 031–060 | **Focus:** Assessments, Sessions, AI Evaluation

This checklist is the daily working document for Member 2. Member 2 owns the core assessment pipeline — from starting an attempt to generating a final diagnostic report.

**Read this first:** You cannot start most of this work until Member 1 delivers the `authenticate` middleware, `requireRole` middleware, and the `org.students` table. You also need Member 4 to deliver the `CreditService.consume()` stub so you can wire up `POST /api/attempts/start`.

---

## 1. Module 2 Ownership Summary

| Area | What M2 builds |
|------|---------------|
| Assessment config | `assessments`, `assessment_components` tables + CRUD APIs |
| Question bank | `question_bank_items`, `question_bank_item_skills` tables + CRUD APIs |
| Attempt lifecycle | `assessment_attempts` table — start, get, abandon |
| Session lifecycle | `assessment_sessions` state machine — INITIALIZED → ACTIVE → COMPLETED |
| Questions in session | `questions` table — from bank or AI-generated |
| Proctoring | Tab-switch counter + flagging logic on assessment sessions |
| Response handling | `responses` table — store student transcript |
| AI evaluation | Call FastAPI, write `ai_runs` + `response_evaluations` |
| Report generation | `assessment_reports` immutable write at session complete |
| Listening sessions | `/api/listening` sub-flow (replay limit ≤ 2) |
| Score computation | All score formulas computed in Node.js (M2), NOT in FastAPI |
| Event emission | Fire `ATTEMPT_COMPLETED` event after report generation |

---

## 2. MVP Scope

### In scope — build now
- All database tables in `assessment`, `session`, and `evaluation` schemas
- One table in `performance` schema: `assessment_reports` (M2 writes; M3 reads)
- All API endpoints in Section 7
- FastAPI integration: `POST /ai/evaluate-response` and `POST /ai/generate-question`
- Proctoring rules (tab switch counter + flagging)
- Session state machine transitions
- Listening session replay enforcement (≤ 2 replays)
- Score formulas (all computed in Node.js from FastAPI raw metrics)
- `ATTEMPT_COMPLETED` event emitted after report generation

### Out of scope — do not build yet
- `GET /api/reports/student/:studentId` — post-MVP
- `/api/suggestions/*` — chatbot, post-MVP
- `POST /ai/evaluate-listening` — `[NEEDS CONFIRMATION]`
- Adaptive difficulty algorithm — post-MVP
- Idempotency key enforcement on attempt start and response submit — post-MVP
- AI service retry with exponential backoff — post-MVP

---

## 3. Database Tables

### 3.1 `assessment.assessments`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `title` | VARCHAR(255) NOT NULL | |
| `type` | VARCHAR(50) NOT NULL | `MOCK_INTERVIEW`, `LISTENING_COMPREHENSION` |
| `description` | TEXT | |
| `configuration` | JSONB | credit cost, max attempts, time limit etc. |
| `is_active` | BOOLEAN DEFAULT TRUE | |
| `created_by` | UUID FK → `identity.users` | |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

### 3.2 `assessment.assessment_components`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `assessment_id` | UUID FK → `assessment.assessments` | |
| `name` | VARCHAR(100) NOT NULL | `Technical`, `Communication`, `Listening` |
| `weight` | DECIMAL(5,2) NOT NULL | Must sum to 1.00 per assessment |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

### 3.3 `assessment.assessment_attempts`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `student_id` | UUID FK → `org.students` | |
| `assessment_id` | UUID FK → `assessment.assessments` | |
| `status` | VARCHAR(20) NOT NULL | `IN_PROGRESS`, `COMPLETED`, `ABANDONED` |
| `started_at` | TIMESTAMPTZ NOT NULL | |
| `completed_at` | TIMESTAMPTZ | |
| `credit_cost` | INTEGER NOT NULL | Snapshot of credit cost at time of attempt |

### 3.4 `session.assessment_sessions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `attempt_id` | UUID FK → `assessment.assessment_attempts` | |
| `session_type` | VARCHAR(30) NOT NULL | `MOCK_INTERVIEW`, `LISTENING_COMPREHENSION` |
| `status` | VARCHAR(20) NOT NULL | `INITIALIZED`, `ACTIVE`, `PAUSED`, `COMPLETED`, `TERMINATED` |
| `tab_switch_count` | INTEGER DEFAULT 0 | |
| `fullscreen_exit_count` | INTEGER DEFAULT 0 | |
| `is_proctor_flagged` | BOOLEAN DEFAULT FALSE | |
| `replay_count` | INTEGER DEFAULT 0 | Listening sessions only |
| `started_at` | TIMESTAMPTZ | |
| `completed_at` | TIMESTAMPTZ | |
| `last_activity_at` | TIMESTAMPTZ | |

### 3.5 `session.question_bank_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `question_text` | TEXT NOT NULL | |
| `difficulty` | VARCHAR(10) NOT NULL | `EASY`, `MEDIUM`, `ADVANCED` |
| `expected_answer_hint` | TEXT | |
| `is_active` | BOOLEAN DEFAULT TRUE | Soft-delete flag |
| `created_by` | UUID FK → `identity.users` | |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

### 3.6 `session.question_bank_item_skills`
| Column | Type | Notes |
|--------|------|-------|
| `question_bank_item_id` | UUID FK → `session.question_bank_items` | |
| `skill_id` | UUID FK → `performance.skills` ON DELETE RESTRICT | M3 owns the skills table |
| PRIMARY KEY | `(question_bank_item_id, skill_id)` | |

**Note:** `performance.skills` is owned by M3. M2 reads it for tagging questions. M3 must seed the skills table before M2 can add skill tags.

### 3.7 `session.questions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `session_id` | UUID FK → `session.assessment_sessions` | |
| `bank_item_id` | UUID FK → `session.question_bank_items` | NULL for AI-generated |
| `question_text` | TEXT NOT NULL | |
| `question_number` | INTEGER NOT NULL | Sequence in session |
| `difficulty` | VARCHAR(10) NOT NULL | |
| `source` | VARCHAR(20) NOT NULL | `BANK`, `AI_GENERATED` |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

### 3.8 `evaluation.responses`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `question_id` | UUID FK → `session.questions` | |
| `session_id` | UUID FK → `session.assessment_sessions` | |
| `transcript` | TEXT NOT NULL | |
| `duration_sec` | INTEGER NOT NULL | |
| `mode` | VARCHAR(10) NOT NULL | `VOICE`, `TEXT`, `MIXED` |
| `submitted_at` | TIMESTAMPTZ DEFAULT now() | |

### 3.9 `evaluation.ai_runs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `response_id` | UUID FK → `evaluation.responses` | |
| `model_used` | VARCHAR(100) NOT NULL | |
| `latency_ms` | INTEGER | |
| `input_tokens` | INTEGER | |
| `output_tokens` | INTEGER | |
| `status` | VARCHAR(20) NOT NULL | `COMPLETED`, `PENDING`, `FAILED` |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

**Note:** Write `ai_runs` for EVERY LLM call. If FastAPI is unreachable, write a record with `status = PENDING`.

### 3.10 `evaluation.response_evaluations`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `response_id` | UUID FK → `evaluation.responses` UNIQUE | One evaluation per response |
| `ai_run_id` | UUID FK → `evaluation.ai_runs` | |
| `technical_score` | DECIMAL(5,2) | 0–100 |
| `fluency_score` | DECIMAL(5,2) | 0–100 |
| `clarity_score` | DECIMAL(5,2) | 0–100 |
| `pace_wpm` | INTEGER | Words per minute |
| `filler_count` | INTEGER | Raw filler word count |
| `filler_score` | DECIMAL(5,2) | Computed: `max(0, 100 - filler_count × 5)` |
| `pace_score` | DECIMAL(5,2) | Derived from pace_wpm |
| `is_pace_optimal` | BOOLEAN | 120–150 WPM = true |
| `communication_score` | DECIMAL(5,2) | Computed from component scores |
| `feedback` | TEXT | From FastAPI |
| `strengths` | TEXT | From FastAPI |
| `weaknesses` | TEXT | From FastAPI |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

### 3.11 `performance.assessment_reports` — M2 writes, M3 reads
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `attempt_id` | UUID FK → `assessment.assessment_attempts` UNIQUE | One report per attempt |
| `student_id` | UUID FK → `org.students` | Denormalized for faster queries |
| `overall_score` | DECIMAL(5,2) NOT NULL | `tech_avg × 0.70 + comm_avg × 0.30` |
| `technical_score` | DECIMAL(5,2) NOT NULL | |
| `communication_score` | DECIMAL(5,2) NOT NULL | |
| `session_type` | VARCHAR(30) NOT NULL | |
| `total_questions` | INTEGER NOT NULL | |
| `is_proctor_flagged` | BOOLEAN DEFAULT FALSE | |
| `tab_switch_count` | INTEGER DEFAULT 0 | |
| `generated_at` | TIMESTAMPTZ DEFAULT now() | Immutable — never update this record |

---

## 4. Database Relationships

```
assessment.assessments (1)
    ├── (N) assessment.assessment_components
    └── (N) assessment.assessment_attempts
             └── (N) session.assessment_sessions
                       ├── (N) session.questions
                       │         └── (1) evaluation.responses
                       │                   ├── (1) evaluation.ai_runs
                       │                   └── (1) evaluation.response_evaluations
                       └── (1) performance.assessment_reports [immutable]

session.question_bank_items (N) ──── (N) performance.skills
    [via session.question_bank_item_skills]
    [skills owned by M3; M2 references via FK]
```

Cross-schema FKs (migration 115 — shared, NOT written by M2):
- `org.students.id` ← `assessment.assessment_attempts.student_id`
- `performance.skills.id` ← `session.question_bank_item_skills.skill_id`

---

## 5. Required Migrations (031–060)

| File | Creates |
|------|---------|
| `031_assessment_assessments.sql` | `assessment.assessments` table |
| `032_assessment_components.sql` | `assessment.assessment_components` table |
| `033_assessment_attempts.sql` | `assessment.assessment_attempts` table |
| `034_session_assessment_sessions.sql` | `session.assessment_sessions` table + status enum |
| `035_session_question_bank_items.sql` | `session.question_bank_items` table |
| `036_session_question_bank_item_skills.sql` | `session.question_bank_item_skills` junction table |
| `037_session_questions.sql` | `session.questions` table |
| `038_evaluation_responses.sql` | `evaluation.responses` table |
| `039_evaluation_ai_runs.sql` | `evaluation.ai_runs` table |
| `040_evaluation_response_evaluations.sql` | `evaluation.response_evaluations` table |
| `041_performance_assessment_reports.sql` | `performance.assessment_reports` table |
| `042_m2_indexes.sql` | Indexes on session, attempt, student FKs |
| `043_m2_updated_at_triggers.sql` | `updated_at` triggers for session tables |
| `044_060_placeholder.sql` | Reserved for M2 additions during implementation |

> M2 does NOT write migrations 061+ (those belong to M3, M4, shared FKs, and seeds).

---

## 6. API Endpoints

### Assessments
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/assessments` | Yes | Any | List assessments |
| POST | `/api/assessments` | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | Create assessment |
| GET | `/api/assessments/:id` | Yes | Any | Get assessment detail |
| PUT | `/api/assessments/:id` | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | Update config |

### Question Bank
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/question-bank` | Yes | FACULTY_MENTOR, TRAINER, PROGRAM_ADMIN, PLACEMENT_COORDINATOR | List questions |
| POST | `/api/question-bank` | Yes | FACULTY_MENTOR, TRAINER, PROGRAM_ADMIN | Add question |
| PUT | `/api/question-bank/:id` | Yes | FACULTY_MENTOR, TRAINER, PROGRAM_ADMIN | Update question |
| DELETE | `/api/question-bank/:id` | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | Soft-delete (`is_active = false`) |

### Attempts
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| POST | `/api/attempts/start` | Yes | STUDENT | Start attempt — deducts credits first |
| GET | `/api/attempts/:id` | Yes | STUDENT (own), FACULTY_MENTOR (mentee), PROGRAM_ADMIN | Get attempt |
| PUT | `/api/attempts/:id/abandon` | Yes | STUDENT (own) | Abandon attempt |

### Sessions
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| POST | `/api/sessions/start` | Yes | STUDENT | Start session within attempt |
| GET | `/api/sessions/:id` | Yes | STUDENT (own) | Get session state + current question |
| POST | `/api/sessions/:id/proctor-event` | Yes | STUDENT (own) | Record tab switch / focus loss |
| POST | `/api/sessions/:id/complete` | Yes | STUDENT (own) | Complete session, generate report |

### Listening (separate prefix — keep existing `/api/listening`)
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| POST | `/api/listening/start` | Yes | STUDENT | Start listening session |
| GET | `/api/listening/:id/replay` | Yes | STUDENT (own) | Fetch story for replay (enforces ≤ 2 replays) |
| POST | `/api/listening/:id/submit` | Yes | STUDENT (own) | Submit listening answers |

### Responses
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| POST | `/api/responses/submit` | Yes | STUDENT | Submit transcript — calls FastAPI synchronously |
| GET | `/api/responses/:id` | Yes | STUDENT (own), FACULTY_MENTOR (mentee) | Get response + evaluation |

### Reports
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/reports/:attemptId` | Yes | STUDENT (own), FACULTY_MENTOR (mentee), PROGRAM_ADMIN | Get diagnostic report |

---

## 7. Request / Response Contracts

### POST `/api/attempts/start`
```json
// Request
{ "assessmentId": "uuid" }

// Response 201
{ "data": { "attemptId": "uuid", "status": "IN_PROGRESS", "creditBalance": 40 } }

// Response 402 — insufficient credits
{ "error": { "code": "INSUFFICIENT_CREDITS", "message": "Not enough credits to start this assessment" } }

// Response 409 — already in progress
{ "error": { "code": "ATTEMPT_IN_PROGRESS", "message": "You already have an active attempt for this assessment" } }
```

### POST `/api/sessions/start`
```json
// Request
{ "attemptId": "uuid", "sessionType": "MOCK_INTERVIEW | LISTENING" }

// Response 201
{
  "data": {
    "sessionId": "uuid",
    "status": "ACTIVE",
    "firstQuestion": { "questionId": "uuid", "questionText": "string", "difficulty": "EASY" }
  }
}
```

### POST `/api/sessions/:id/proctor-event`
```json
// Request
{ "eventType": "TAB_SWITCH | FOCUS_LOST", "timestamp": "ISO string" }

// Response 200
{
  "data": {
    "tabSwitchCount": 3,
    "isFlagged": false,
    "warning": "3 tab switches detected — further switching may flag your assessment"
  }
}
```

### POST `/api/responses/submit`
```json
// Request
{
  "sessionId": "uuid",
  "questionId": "uuid",
  "transcript": "In microservices, each service manages its own database...",
  "durationSec": 120,
  "mode": "VOICE | TEXT | MIXED"
}

// Response 200
{
  "data": {
    "evaluationId": "uuid",
    "technicalScore": 72,
    "communicationScore": 78.25,
    "feedback": "Good understanding of service isolation...",
    "strengths": "Clear explanation of database-per-service pattern",
    "weaknesses": "Did not mention API gateway coordination",
    "nextQuestion": {
      "questionId": "uuid",
      "questionText": "How would you handle distributed transactions?",
      "difficulty": "MEDIUM"
    }
  }
}
// If nextQuestion is null — session is complete, call POST /sessions/:id/complete
```

### GET `/api/reports/:attemptId`
```json
{ "data": {
  "attemptId": "uuid",
  "studentId": "uuid",
  "sessionType": "MOCK_INTERVIEW",
  "overallScore": 74.2,
  "technicalScore": 76.0,
  "communicationScore": 70.1,
  "isProctorFlagged": false,
  "tabSwitchCount": 1,
  "totalQuestions": 5,
  "generatedAt": "ISO string",
  "questionBreakdown": [
    {
      "questionText": "...",
      "technicalScore": 80,
      "communicationScore": 72,
      "feedback": "...",
      "strengths": "...",
      "weaknesses": "..."
    }
  ]
}}
```

---

## 8. Internal Services

### 8.1 FastAPI AI Client (`src/modules/evaluation/ai-client.ts`)

```typescript
// M2 builds and owns this HTTP client

interface AIEvaluateRequest {
  transcript: string;
  question_text: string;
  duration_sec: number;
  difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
  resume_context?: string;
}

interface AIEvaluateResponse {
  technical_score: number;   // 0–100 — raw from LLM
  fluency_score: number;     // 0–100
  clarity_score: number;     // 0–100
  pace_wpm: number;          // words per minute
  filler_count: number;      // raw filler count — M2 derives filler_score
  is_pace_optimal: boolean;  // 120–150 WPM = true
  feedback: string;
  strengths: string;
  weaknesses: string;
  model_used: string;
  latency_ms: number;
}

interface AIGenerateQuestionRequest {
  resume_context: string;
  difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
  previous_questions: string[];
  domain?: string;
}

interface AIGenerateQuestionResponse {
  question_text: string;
  skill_tags: string[];
  expected_topics: string[];
}
```

- Base URL: `AI_SERVICE_URL` env var (default `http://localhost:8000`)
- If FastAPI is unreachable → write `ai_runs` with `status = PENDING`, do NOT throw 500 to client
- Always write `ai_runs` record before returning to client (even on failure)

### 8.2 Score Formulas (Node.js computes ALL of these — FastAPI does NOT)

```typescript
// From FastAPI's raw metrics:
const fillerScore = Math.max(0, 100 - response.filler_count * 5);
const paceScore = response.is_pace_optimal ? 100 :
  (response.pace_wpm < 120 ? (response.pace_wpm / 120) * 100 : (150 / response.pace_wpm) * 100);

// Communication composite
const commScore = (
  response.fluency_score * 0.35 +
  paceScore * 0.25 +
  fillerScore * 0.20 +
  response.clarity_score * 0.20
);

// Final overall (per-session aggregate)
const overallScore = technicalAvg * 0.70 + commAvg * 0.30;
```

### 8.3 CreditService — M2 calls, M4 implements

```typescript
// Interface M2 imports (defined in src/modules/credits/credits.service.ts by M4)
consume(studentId: string, amount: number, reason: string, referenceId: string): Promise<{ newBalance: number }>
// Throws AppError(402, 'Insufficient credits', 'INSUFFICIENT_CREDITS')
```

**Temporary stub (create this so you can develop without M4):**
```typescript
// src/modules/credits/credits.service.stub.ts — delete when M4 delivers real implementation
export const CreditServiceStub = {
  consume: async (_studentId: string, _amount: number) => ({ newBalance: 50 }),
};
```

**In your `AttemptService.start()`:**
```typescript
// Step 1 — check and deduct credits (blocks if insufficient)
const { newBalance } = await CreditService.consume(
  studentId,
  assessmentCreditCost,
  'ASSESSMENT_START',
  assessmentId
);
// Step 2 — only if consume() succeeded, create the attempt
const attempt = await db.query('INSERT INTO assessment.assessment_attempts ...');
```

---

## 9. Events

### ATTEMPT_COMPLETED — M2 emits this
```typescript
import { eventBus, Events } from '../../shared/events/eventBus';

// Emit AFTER assessment_reports is written in POST /api/sessions/:id/complete
eventBus.emit(Events.ATTEMPT_COMPLETED, {
  attemptId: string,
  studentId: string,
  sessionType: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION',
  overallScore: number   // from assessment_reports.overall_score
});
```

**Who listens:**
- M3's `PerformanceService` — updates profile + snapshot
- M4's `CreditService` — credits earning + eligibility recalculate

**Important:** The event fires AFTER the report is written and AFTER the HTTP response is sent to the client. It is fire-and-forget from M2's perspective.

---

## 10. Dependencies

### What M2 needs from other members

| Source | What | When needed |
|--------|------|-------------|
| M1 | `authenticate` middleware | Before ANY protected route |
| M1 | `requireRole` middleware | Before ANY role-restricted route |
| M1 | `AppError`, `sendSuccess`, `sendError` from `src/shared/` | Before any controller |
| M1 | `eventBus` from `src/shared/events/` | Before emitting ATTEMPT_COMPLETED |
| M1 | `org.students` table + FK | Before `assessment_attempts` table can be created |
| M3 | `performance.skills` table seeded | Before M2 can add skill tags to question bank items |
| M4 | `CreditService.consume()` stub | Before implementing `POST /api/attempts/start` |
| M4 | `CreditService.consume()` real | Before production testing of attempt flow |

### What M2 provides to others

| Consumer | Provides |
|----------|----------|
| M3 | `ATTEMPT_COMPLETED` event with payload |
| M3 | Read access to `performance.assessment_reports` |
| M3 | Read access to `evaluation.response_evaluations` |
| M3 | Read access to `session.questions` + `session.question_bank_item_skills` |
| M4 | `ATTEMPT_COMPLETED` event with payload |

### What M2 must NOT modify
- `identity.*` and `org.*` — M1 owns these
- `performance.performance_profiles`, `performance.performance_snapshots`, `performance.skill_performances` — M3 owns
- `credit.*` and `placement.*` — M4 owns
- `performance.skills`, `performance.listening_stories` — M3 owns
- `performance.assessment_reports` is M2-written but M3-read — do not change schema without coordinating with M3

---

## 11. Proctoring Rules

```
POST /api/sessions/:id/proctor-event
  eventType = TAB_SWITCH
  ↓
  Increment session.tab_switch_count += 1
  
  Count → Action:
  1–2   → Return warning message only (no DB flag change)
  3–4   → Write to system.audit_logs (action='PROCTORING_WARNING')
  ≥ 5   → Set is_proctor_flagged = true on assessment_sessions
  
  MAX_TAB_SWITCH_LIMIT env var (default 4) = threshold for is_proctor_flagged
```

---

## 12. Session State Machine

```
INITIALIZED
    │
    ▼ (POST /sessions/start)
  ACTIVE
    │
    ├──────────────────► PAUSED (optional)
    │                       │
    │                       ▼ (resume)
    │                     ACTIVE
    │
    ├──────────────────► COMPLETED (POST /sessions/:id/complete)
    │
    └──────────────────► TERMINATED (proctor flag threshold exceeded or timeout)
```

**Rule:** A student may NOT have two concurrent ACTIVE sessions for the same assessment. Enforce at service level with a query check before creating a new session.

---

## 13. Implementation Order

### Phase 1: Setup and stubs (before any implementation)
1. - [ ] Confirm M1 has delivered `authenticate`, `requireRole`, `AppError`, `sendSuccess`, `sendError`
2. - [ ] Create CreditService stub at `src/modules/credits/credits.service.stub.ts`
3. - [ ] Confirm M3 has seeded `performance.skills` (needed for question bank skill tagging)

### Phase 2: Database
4. - [ ] Write migrations 031–043 (all M2 tables)
5. - [ ] Run migrations on dev database
6. - [ ] Verify all FK relationships resolve correctly (especially to M1's `org.students`)

### Phase 3: Assessment and Question Bank (no dependencies on M4)
7. - [ ] Build `assessments` module (CRUD) + tests
8. - [ ] Build `question-bank` module (CRUD, soft-delete, skill tagging) + tests

### Phase 4: Attempt start (requires CreditService stub)
9. - [ ] Build `attempts` module — start, get, abandon
10. - [ ] Wire `CreditService.consume()` stub call in `AttemptService.start()`
11. - [ ] Test: start attempt → stub returns balance → attempt created

### Phase 5: Session lifecycle
12. - [ ] Build `sessions` module — start, get, complete
13. - [ ] Implement session state machine transitions
14. - [ ] Build `proctoring.service.ts` — tab switch counter + flagging rules
15. - [ ] Implement `POST /api/sessions/:id/proctor-event`

### Phase 6: Question serving
16. - [ ] Build `questions` module — serve from bank by difficulty + skill
17. - [ ] Build `ai-client.ts` — FastAPI HTTP client
18. - [ ] Implement `POST /ai/generate-question` call with fallback if FastAPI down

### Phase 7: Response + AI evaluation
19. - [ ] Build `responses` module
20. - [ ] Implement `POST /responses/submit` flow:
    - Store transcript
    - Call FastAPI `POST /ai/evaluate-response`
    - Compute scores (filler, pace, comm, overall) in Node.js
    - Write `ai_runs` + `response_evaluations`
    - Return evaluation to client
21. - [ ] Handle FastAPI unavailable: write `ai_runs` with status=PENDING, return graceful error

### Phase 8: Report generation + event emission
22. - [ ] Build `reports` module
23. - [ ] Implement `POST /sessions/:id/complete`:
    - Aggregate all `response_evaluations` for session
    - Compute overall_score, technical_score, communication_score
    - Write immutable `assessment_reports` record
    - Emit `ATTEMPT_COMPLETED` event via eventBus
24. - [ ] Implement `GET /api/reports/:attemptId`

### Phase 9: Listening sub-flow
25. - [ ] Build listening routes: start, replay, submit
26. - [ ] Enforce replay_count ≤ 2 (`MAX_REPLAY_COUNT` env var)
27. - [ ] Link to `performance.listening_stories` owned by M3

### Phase 10: Replace stub with real CreditService
28. - [ ] Wait for M4 to deliver real `CreditService.consume()`
29. - [ ] Remove stub, wire real implementation
30. - [ ] Integration test: POST /attempts/start with insufficient balance → 402

---

## 14. Testing Checklist

### Unit tests
- [ ] Score formula: `fillerScore = max(0, 100 - filler_count × 5)` verified
- [ ] `filler_count = 0` → `fillerScore = 100`
- [ ] `filler_count = 20` → `fillerScore = 0` (not negative)
- [ ] `comm_avg = fluency×0.35 + pace×0.25 + filler×0.20 + clarity×0.20` verified
- [ ] `overall = tech×0.70 + comm×0.30` verified
- [ ] Session state machine: INITIALIZED → ACTIVE → COMPLETED transitions
- [ ] Session state machine: double-start rejected (student already has active session)
- [ ] Proctoring: 1 switch → no flag; 5 switches → `is_proctor_flagged = true`
- [ ] Listening: 3rd replay → 422 REPLAY_LIMIT_EXCEEDED
- [ ] `AttemptService.start()` calls `CreditService.consume()` BEFORE creating attempt
- [ ] AI service down → `ai_runs` written with `status = PENDING`

### Integration tests (require database)
- [ ] Full interview flow: start attempt → start session → submit 3 responses → complete → get report
- [ ] GET /api/reports/:attemptId returns correct scores
- [ ] POST /api/attempts/start with stub returns 201
- [ ] POST /api/attempts/start with real CreditService and 0 balance → 402
- [ ] Abandon attempt → status = ABANDONED
- [ ] Question bank soft-delete: `DELETE /api/question-bank/:id` sets `is_active = false`
- [ ] Proctoring flag at 5 tab switches

### Score formula verification tests
```typescript
// Test that Node.js score computation matches the spec exactly
it('should compute filler score correctly', () => {
  expect(computeFillerScore(0)).toBe(100);
  expect(computeFillerScore(10)).toBe(50);
  expect(computeFillerScore(20)).toBe(0);
  expect(computeFillerScore(25)).toBe(0); // clamped, not negative
});

it('should weight overall score 70/30', () => {
  expect(computeOverallScore(80, 60)).toBe(74); // 80*0.70 + 60*0.30
});
```

---

## 15. Integration Checklist

Before declaring Module 2 complete:

- [ ] M1's `authenticate` middleware successfully populates `req.user` on M2's routes
- [ ] `POST /api/attempts/start` correctly calls `CreditService.consume()` and returns 402 on low balance
- [ ] `POST /api/responses/submit` calls FastAPI and persists result
- [ ] FastAPI unreachable → 503 returned to client; `ai_runs` written with PENDING status
- [ ] `ATTEMPT_COMPLETED` event fires after report generation (verify via test event handler)
- [ ] M3 can read `assessment_reports` (verify by running M3's performance handler test with M2 data)
- [ ] M4 can receive `ATTEMPT_COMPLETED` event (verify with M4)
- [ ] All response shapes use `{ "data": ... }` envelope (not bare objects)
- [ ] All error shapes use `{ "error": { "code": "...", "message": "..." } }`
- [ ] No SQL injection vectors (parameterized queries only)
- [ ] `GET /api/reports/:attemptId` scoped: student sees only own; mentor sees only assigned mentees

---

## 16. Needs Confirmation

| # | Item | Default assumption |
|---|------|--------------------|
| NC-01 | Credit cost per assessment — how many credits does `POST /api/attempts/start` deduct? | Read from `assessment.assessments.configuration.credit_cost` JSONB field |
| NC-02 | `POST /ai/evaluate-listening` — is there a separate FastAPI endpoint for listening comprehension answers? | `[NEEDS CONFIRMATION]` — not confirmed in architecture docs |
| NC-03 | Does `PUT /api/attempts/:id/abandon` trigger a credit refund? | Refund = M4 decision. M2 emits no event on abandon; M4 decides if refund policy applies |
| NC-04 | Adaptive difficulty — score ≥ 80 → elevate, score < 50 → reduce — is this in MVP? | Deferred to post-MVP |
| NC-05 | Idempotency-Key header on POST /attempts/start — is this required for MVP? | Deferred to post-MVP |
| NC-06 | What is the max number of questions per MOCK_INTERVIEW session? | `[NEEDS CONFIRMATION]` — stored in `assessment.configuration` JSONB |
| NC-07 | Are sessions within an attempt sequential or parallel? (Can a student have a MOCK_INTERVIEW and LISTENING session open at the same time?) | Assumption: one ACTIVE session per attempt at a time |

---

## 17. Post-MVP (Do Not Build Now)

| Feature | Reason deferred |
|---------|----------------|
| `GET /api/reports/student/:studentId` | Needs pagination + auth scoping complexity |
| `/api/suggestions/*` chatbot | Requires LangGraph agent infrastructure (M3 Advanced) |
| `POST /ai/evaluate-listening` | Needs confirmation from AI service team |
| Adaptive difficulty algorithm | Adds complexity to session state machine |
| Idempotency-Key enforcement | Not blocking for MVP |
| AI retry with exponential backoff | Start with single-try + PENDING status |
| Report history by student | Add after base report endpoint is stable |
