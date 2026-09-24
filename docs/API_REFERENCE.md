# API Reference — Communication Readiness Platform

> **Source of truth:** `docs/BACKEND_IMPLEMENTATION_PLAN.md`
> **Rule:** Do not invent APIs. Anything ambiguous is marked `[NEEDS CONFIRMATION]`.
> **Base URL:** `http://localhost:5000`

---

## Table of Contents

1. [API Conventions](#api-conventions)
2. [Member 1 — Auth, Students, Organization](#member-1--auth-students-organization)
3. [Member 2 — Assessments, Sessions, AI Evaluation](#member-2--assessments-sessions-ai-evaluation)
4. [Member 3 — Performance, Skills, Listening](#member-3--performance-skills-listening)
5. [Member 4 — Credits, Checklist, Placement](#member-4--credits-checklist-placement)
6. [FastAPI AI Service APIs](#fastapi-ai-service-apis)
7. [Internal Service Interfaces](#internal-service-interfaces)
8. [API Dependency Map](#api-dependency-map)
9. [API Development Checklist](#api-development-checklist)

---

## API Conventions

### Response envelope — always wrap in `data`

```json
// Single resource
{ "data": { ...resource } }

// List
{ "data": [...], "pagination": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 } }

// Action with no resource
{ "message": "Human-readable success message" }
```

### Error envelope

```json
{
  "error": {
    "code": "SCREAMING_SNAKE_CASE",
    "message": "Human-readable description",
    "details": {}
  }
}
```

### JWT

All protected routes require: `Authorization: Bearer <token>`

JWT payload: `{ sub: userId, email, role, tokenVersion, iat, exp }`

Expiry: `JWT_EXPIRES_IN=7d` (env var). No refresh tokens in MVP.

### UUIDs

All IDs are UUIDs (strings). Validate with `z.string().uuid()`. Non-UUID IDs → 400.

### Pagination query params

| Param | Default | Notes |
|---|---|---|
| `page` | `1` | Minimum 1 |
| `limit` | `20` | Maximum 100 |
| `sortBy` | `created_at` | |
| `sortOrder` | `desc` | `asc` or `desc` |

### HTTP status codes

| Code | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 400 | Validation error |
| 401 | Not authenticated (missing/invalid/revoked token) |
| 402 | Insufficient credits |
| 403 | Forbidden (authenticated but wrong role or scope) |
| 404 | Not found |
| 409 | Conflict (e.g., attempt already in progress) |
| 422 | Unprocessable entity |
| 503 | AI service unavailable |

---

## Member 1 — Auth, Students, Organization

**Owner:** Member 1
**Modules:** `src/modules/auth/`, `src/modules/students/`, `src/modules/organization/`, `src/modules/mentorAssignments/`, `src/modules/trainerAssignments/`

---

### Authentication

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | Register a new student account | No | Public | MVP |
| POST | `/api/auth/login` | Login and receive JWT | No | Public | MVP |
| GET | `/api/auth/me` | Get current authenticated user | Yes | Any authenticated | MVP |
| POST | `/api/auth/logout` | Revoke current token (increment token_version) | Yes | Any authenticated | MVP |

**POST /api/auth/register**

```json
// Request body
{
  "name": "string",
  "email": "string (email format)",
  "password": "string (min 8 chars)"
}
// Note: any "role" field in the body is IGNORED — server always sets role=STUDENT

// Response 201
{
  "data": {
    "token": "JWT string",
    "user": { "id": "uuid", "name": "string", "email": "string", "role": "STUDENT" }
  }
}
```

**POST /api/auth/login**

```json
// Request body
{ "email": "string", "password": "string" }

// Response 200
{ "data": { "token": "JWT string", "user": { "id": "uuid", "email": "string", "role": "STUDENT" } } }
```

---

### Students

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/students` | List students (paginated) | Yes | PROGRAM_ADMIN, TRAINER, PLACEMENT_COORDINATOR, FACULTY_MENTOR | MVP |
| GET | `/api/students/:id` | Get student profile | Yes | Authenticated (own or authorized) | MVP |
| PUT | `/api/students/:id` | Update student profile | Yes | STUDENT (own) or PROGRAM_ADMIN | MVP |
| PUT | `/api/students/:id/coding-handles` | Update LeetCode, GitHub handles | Yes | STUDENT (own) | MVP |
| POST | `/api/students/:id/resume` | Upload resume PDF | Yes | STUDENT (own) | MVP |

**POST /api/students/:id/resume**
```
Request: multipart/form-data — field: "resume" (PDF, max 5 MB)
Response 200: { "data": { "resumeId": "uuid", "fileUrl": "string", "uploadedAt": "ISO string" } }
```

---

### Mentor Assignments

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/mentor-assignments/my-mentees` | Get list of students assigned to me | Yes | FACULTY_MENTOR | MVP |
| POST | `/api/mentor-assignments` | Assign a mentor to a student | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | MVP |
| DELETE | `/api/mentor-assignments/:id` | Remove mentor assignment | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | MVP |

---

### Trainer Assignments

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/trainer-assignments` | List trainer assignments | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | MVP |
| POST | `/api/trainer-assignments` | Onboard trainer to subdivision (creates user + assignment atomically) | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | MVP |
| PUT | `/api/trainer-assignments/:id/revoke` | Revoke trainer from subdivision | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | MVP |

---

### Organization (read-only, seeded at startup)

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/institutions` | Get institution info | Yes | Any authenticated | MVP |
| GET | `/api/departments` | List departments | Yes | Any authenticated | MVP |
| GET | `/api/programs` | List programs | Yes | Any authenticated | MVP |
| GET | `/api/batches` | List batches | Yes | Any authenticated | MVP |
| GET | `/api/subdivisions` | List subdivisions (domains) | Yes | Any authenticated | MVP |

---

### Admin — Staff Creation

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| POST | `/api/admin/faculty-mentors` | Create a FACULTY_MENTOR account | Yes | PLACEMENT_COORDINATOR | MVP |
| GET | `/api/admin/faculty-mentors` | List faculty mentors | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | MVP |
| POST | `/api/admin/program-admins` | Create a PROGRAM_ADMIN account | Yes | PLACEMENT_COORDINATOR | MVP |
| GET | `/api/admin/program-admins` | List program admins | Yes | PLACEMENT_COORDINATOR | MVP |
| POST | `/api/admin/coordinators` | Create another PLACEMENT_COORDINATOR | Yes | PLACEMENT_COORDINATOR | MVP |

---

## Member 2 — Assessments, Sessions, AI Evaluation

**Owner:** Member 2
**Modules:** `src/modules/assessments/`, `src/modules/attempts/`, `src/modules/sessions/`, `src/modules/questions/`, `src/modules/responses/`, `src/modules/evaluation/`, `src/modules/reports/`

---

### Assessments

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/assessments` | List available assessments | Yes | Any authenticated | MVP |
| POST | `/api/assessments` | Create a new assessment | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | MVP |
| GET | `/api/assessments/:id` | Get assessment detail | Yes | Any authenticated | MVP |
| PUT | `/api/assessments/:id` | Update assessment config | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | MVP |

---

### Question Bank

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/question-bank` | List question bank items | Yes | FACULTY_MENTOR, TRAINER, PROGRAM_ADMIN, PLACEMENT_COORDINATOR | MVP |
| POST | `/api/question-bank` | Add question bank item | Yes | FACULTY_MENTOR, TRAINER, PROGRAM_ADMIN | MVP |
| PUT | `/api/question-bank/:id` | Update question bank item | Yes | FACULTY_MENTOR, TRAINER, PROGRAM_ADMIN | MVP |
| DELETE | `/api/question-bank/:id` | Soft-delete question bank item (`is_active = false`) | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | MVP |

---

### Attempts

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| POST | `/api/attempts/start` | Start a new assessment attempt (deducts credits) | Yes | STUDENT | MVP |
| GET | `/api/attempts/:id` | Get attempt status and info | Yes | STUDENT (own), FACULTY_MENTOR (mentee), PROGRAM_ADMIN | MVP |
| PUT | `/api/attempts/:id/abandon` | Abandon an in-progress attempt | Yes | STUDENT (own) | MVP |

**POST /api/attempts/start**
```json
// Request body
{ "assessmentId": "uuid" }

// On success: credits deducted, returns attempt
// Response 201
{ "data": { "attemptId": "uuid", "status": "IN_PROGRESS", "creditBalance": 40 } }

// On insufficient credits
// Response 402
{ "error": { "code": "INSUFFICIENT_CREDITS", "message": "Not enough credits to start this assessment" } }
```

---

### Sessions

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| POST | `/api/sessions/start` | Start an interview or listening session | Yes | STUDENT | MVP |
| GET | `/api/sessions/:id` | Get current session state + next question | Yes | STUDENT (own) | MVP |
| POST | `/api/sessions/:id/proctor-event` | Record proctoring event (tab switch, etc.) | Yes | STUDENT (own) | MVP |
| POST | `/api/sessions/:id/complete` | Complete the session and generate report | Yes | STUDENT (own) | MVP |

**POST /api/sessions/start**
```json
// Request body
{ "attemptId": "uuid", "sessionType": "MOCK_INTERVIEW | LISTENING" }
```

**POST /api/sessions/:id/proctor-event**
```json
// Request body
{ "eventType": "TAB_SWITCH | FOCUS_LOST", "timestamp": "ISO string" }
// Proctoring rules: 1–2 switches = warn, 3–4 = log, 5+ = flag attempt
```

---

### Listening Sub-flow

> These routes come from the existing `listeningRoutes.ts` stub. The `/api/listening` prefix is kept to avoid breaking existing test files.

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| POST | `/api/listening/start` | Start a listening session | Yes | STUDENT | MVP |
| GET | `/api/listening/:id/replay` | Fetch story for replay | Yes | STUDENT (own) | MVP |
| POST | `/api/listening/:id/submit` | Submit listening answers | Yes | STUDENT (own) | MVP |

---

### Responses

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| POST | `/api/responses/submit` | Submit a response with transcript | Yes | STUDENT | MVP |
| GET | `/api/responses/:id` | Get response and evaluation | Yes | STUDENT (own), FACULTY_MENTOR (mentee) | MVP |

**POST /api/responses/submit**
```json
// Request body
{
  "sessionId": "uuid",
  "questionId": "uuid",
  "transcript": "string — student's spoken/typed answer",
  "durationSec": 120,
  "mode": "VOICE | TEXT | MIXED"
}
// Node.js calls FastAPI /ai/evaluate-response and saves the result before responding
```

---

### Reports

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/reports/:attemptId` | Get full assessment report | Yes | STUDENT (own), FACULTY_MENTOR (mentee), PROGRAM_ADMIN | MVP |
| GET | `/api/reports/student/:studentId` | List all reports for a student | Yes | STUDENT (own), FACULTY_MENTOR (mentee) | Should Have |

---

### Suggestions (Post-MVP)

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| POST | `/api/suggestions/session` | Start a suggestion chat session | Yes | STUDENT | Post-MVP |
| GET | `/api/suggestions/history` | Get suggestion history | Yes | STUDENT | Post-MVP |
| POST | `/api/suggestions/chat` | Send message to suggestion chatbot | Yes | STUDENT | Post-MVP |

---

## Member 3 — Performance, Skills, Listening

**Owner:** Member 3
**Modules:** `src/modules/performance/`, `src/modules/skills/`, `src/modules/listeningStories/`, `src/modules/learning/`, `src/modules/knowledge/`, `src/modules/agents/`

---

### Skills

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/skills` | List all skills in the taxonomy | Yes | Any authenticated | MVP |
| POST | `/api/skills` | Add a new skill | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | MVP |
| DELETE | `/api/skills/:id` | Soft-delete a skill (checks for FK references first) | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | MVP |
| GET | `/api/skills/student/:studentId` | Get skill performance breakdown for a student | Yes | STUDENT (own), FACULTY_MENTOR (mentee), PROGRAM_ADMIN | MVP |

> **Note on DELETE /api/skills/:id:** Must check `session.question_bank_item_skills` for references before soft-deleting. Hard delete is blocked by FK constraint (`ON DELETE RESTRICT`).

---

### Performance

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/performance/:studentId` | Get current performance profile | Yes | STUDENT (own), FACULTY_MENTOR (mentee), PROGRAM_ADMIN | MVP |
| GET | `/api/performance/:studentId/snapshots` | Get performance history (paginated) | Yes | STUDENT (own), FACULTY_MENTOR (mentee) | MVP |

---

### Listening Stories

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/listening-stories` | List all listening stories (admin view) | Yes | PROGRAM_ADMIN, TRAINER, FACULTY_MENTOR | MVP |
| POST | `/api/listening-stories` | Create a listening story | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | MVP |
| GET | `/api/listening-stories/:id` | Get one listening story (for active session) | Yes | STUDENT, FACULTY_MENTOR | MVP |

---

### Learning Plans (Post-MVP)

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/learning-plans/:studentId` | Get student's learning plan | Yes | STUDENT (own), FACULTY_MENTOR (mentee) | Post-MVP |
| PUT | `/api/learning-plans/:studentId` | Update learning plan | Yes | FACULTY_MENTOR, PROGRAM_ADMIN | Post-MVP |
| GET | `/api/recommendations/:studentId` | Get AI-generated recommendations | Yes | STUDENT (own), FACULTY_MENTOR (mentee) | Post-MVP |

---

### Knowledge / RAG (Post-MVP)

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/knowledge/documents` | List knowledge documents | Yes | PROGRAM_ADMIN | Post-MVP |
| POST | `/api/knowledge/documents` | Upload and ingest a knowledge document | Yes | PROGRAM_ADMIN | Post-MVP |
| GET | `/api/knowledge/search` | Semantic search over knowledge base | Yes | `[NEEDS CONFIRMATION]` | Post-MVP |

---

### Agents (Advanced)

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/agents` | List agent definitions | Yes | PROGRAM_ADMIN | Advanced |
| GET | `/api/agents/runs` | List recent agent runs | Yes | PROGRAM_ADMIN | Advanced |
| POST | `/api/agents/run` | Start a new agent run (calls FastAPI LangGraph) | Yes | STUDENT | Advanced |
| POST | `/api/agents/:runId/resume` | Resume a paused agent run with student's answer | Yes | STUDENT | Advanced |

---

## Member 4 — Credits, Checklist, Placement

**Owner:** Member 4
**Modules:** `src/modules/credits/`, `src/modules/checklist/`, `src/modules/verifications/`, `src/modules/placement/`

---

### Credits

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/credits/balance/:studentId` | Get student's current credit balance | Yes | STUDENT (own), FACULTY_MENTOR (mentee), PROGRAM_ADMIN | MVP |
| GET | `/api/credits/transactions/:studentId` | Get credit transaction history | Yes | STUDENT (own), PROGRAM_ADMIN | Post-MVP |
| POST | `/api/credits/adjust` | Admin credit adjustment | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | Post-MVP |
| GET | `/api/credit-policies` | List credit policies | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | Post-MVP |
| POST | `/api/credit-policies` | Create credit policy | Yes | PLACEMENT_COORDINATOR | Post-MVP |
| PUT | `/api/credit-policies/:id` | Update credit policy | Yes | PLACEMENT_COORDINATOR | Post-MVP |

---

### Checklist Items

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/checklist` | List all checklist item definitions | Yes | Any authenticated | MVP |
| POST | `/api/checklist` | Create a checklist item | Yes | PLACEMENT_COORDINATOR, PROGRAM_ADMIN | MVP |
| POST | `/api/checklist/import-csv` | Bulk import checklist items from CSV | Yes | PLACEMENT_COORDINATOR | MVP |
| PUT | `/api/checklist/:id` | Update a checklist item | Yes | PLACEMENT_COORDINATOR, PROGRAM_ADMIN | MVP |
| DELETE | `/api/checklist/:id` | Delete a checklist item | Yes | PLACEMENT_COORDINATOR | MVP |

---

### Student Checklist Progress

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/checklist/my-progress` | Get own checklist progress | Yes | STUDENT | MVP |
| POST | `/api/checklist/:itemId/toggle` | Toggle own checklist item complete/incomplete | Yes | STUDENT | MVP |
| GET | `/api/checklist/mentee/:studentId` | View a mentee's checklist progress | Yes | FACULTY_MENTOR | MVP |

---

### Mentor Verification

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/verifications/pending` | Get all pending verifications for current mentor | Yes | FACULTY_MENTOR | MVP |
| POST | `/api/verifications/:progressId/verify` | Approve a student's checklist item | Yes | FACULTY_MENTOR | MVP |

> **Security rule on POST /api/verifications/:progressId/verify:** The server verifies that the mentor is assigned to the student (checks `org.student_mentor_assignments`). A mentor cannot verify items for students outside their assignment.

---

### Placement Eligibility (Post-MVP)

| Method | Endpoint | Purpose | Auth | Allowed Roles | Scope |
|---|---|---|---|---|---|
| GET | `/api/placement-eligibility/:studentId` | Get student eligibility status | Yes | STUDENT (own), FACULTY_MENTOR (mentee), PROGRAM_ADMIN | Post-MVP |
| POST | `/api/placement-eligibility/:studentId/recalculate` | Trigger eligibility recalculation | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | Post-MVP |
| GET | `/api/placement-eligibility/report` | College-wide eligibility report | Yes | PLACEMENT_COORDINATOR | Post-MVP |

---

## FastAPI AI Service APIs

> **Base URL:** `http://localhost:8000` (env var: `AI_SERVICE_URL`)
> These are internal calls from Node.js (Member 2 and Member 3) to the Python FastAPI service.
> The browser never calls FastAPI directly.

| Method | Endpoint | Called by | Purpose | Scope |
|---|---|---|---|---|
| GET | `/health` | Node.js health check | Confirm AI service is up | MVP |
| GET | `/ai/config` | Node.js startup | Get AI service config/model info | MVP |
| POST | `/ai/evaluate-response` | Member 2 (responses module) | Evaluate one student response | MVP |
| POST | `/ai/generate-question` | Member 2 (sessions module) | Generate an AI question with resume context | MVP |
| POST | `/ai/evaluate-listening` | Member 2 (listening module) | `[NEEDS CONFIRMATION]` — evaluate listening comprehension answers | MVP |
| POST | `/ai/knowledge/ingest` | Member 3 (knowledge module) | Ingest a document — chunk, embed, store | Post-MVP |
| POST | `/ai/knowledge/search` | Member 3 (knowledge module) | Semantic search over knowledge chunks | Post-MVP |
| POST | `/ai/agents/run` | Member 3 (agents module) | Start a LangGraph agent workflow | Advanced |
| POST | `/ai/agents/resume` | Member 3 (agents module) | Resume a paused LangGraph agent with student answer | Advanced |

### POST /ai/evaluate-response

```json
// Node.js sends:
{
  "transcript": "string",
  "question_text": "string",
  "duration_sec": 120,
  "difficulty": "EASY | MEDIUM | ADVANCED",
  "resume_context": "string (optional — parsed resume text)"
}

// FastAPI returns:
{
  "technical_score": 72,
  "fluency_score": 80,
  "clarity_score": 75,
  "pace_wpm": 138,
  "filler_count": 4,
  "is_pace_optimal": true,
  "feedback": "string",
  "strengths": "string",
  "weaknesses": "string",
  "model_used": "llama-3.1-70b-versatile",
  "latency_ms": 1240
}
// Node.js derives fillerScore and paceScore from filler_count and pace_wpm
// Node.js writes all scores to evaluation.response_evaluations
```

### POST /ai/generate-question

```json
// Node.js sends:
{
  "resume_context": "string",
  "difficulty": "EASY | MEDIUM | ADVANCED",
  "previous_questions": ["string", "string"],
  "domain": "string (optional)"
}

// FastAPI returns:
{
  "question_text": "string",
  "skill_tags": ["string"],
  "expected_topics": ["string"]
}
```

---

## Internal Service Interfaces

These are not HTTP APIs — they are direct TypeScript function calls between modules.

---

### CreditService.consume()

```typescript
// Located at: src/modules/credits/credits.service.ts
// Called by: Member 2 — AttemptService.start()
// Purpose: Deduct credits before creating an assessment attempt

consume(
  studentId: string,
  amount: number,
  reason: string,
  referenceId: string
): Promise<{ newBalance: number }>

// Throws: Errors.insufficientCredits() if balance < amount
// Uses: SELECT FOR UPDATE row-level lock to prevent race conditions
// Transactional: UPDATE credit_accounts + INSERT credit_transactions in one BEGIN/COMMIT
```

**Why a direct call, not an event?**
Credit deduction is a prerequisite — if the student has no credits, the attempt must be BLOCKED. An async event cannot return a 402 to a waiting HTTP client. This is the only cross-module direct service call.

**Development stub** (Member 1 provides, Member 4 replaces):
```typescript
// src/modules/credits/credits.service.stub.ts
export const CreditServiceStub = {
  consume: async (_studentId: string, _amount: number) => ({ newBalance: 50 }),
  earn:    async (_studentId: string, _amount: number) => ({ newBalance: 55 }),
};
```

---

### StorageClient interface

```typescript
// Located at: src/shared/storage/storageClient.ts
// Created by: Member 1
// Used by: Member 1 (resume upload), Member 3 (knowledge document upload — post-MVP)

interface StorageClient {
  put(bucket: string, key: string, stream: NodeJS.ReadableStream): Promise<string>;
  getSignedUrl(bucket: string, key: string, expiresIn: number): Promise<string>;
  delete(bucket: string, key: string): Promise<void>;
}
// MVP: LocalStorageClient (writes to uploads/ folder)
// Beta: MinIOStorageClient (writes to MinIO Docker container)
// Switch via: STORAGE_DRIVER=local|minio|s3 env var
```

---

## API Dependency Map

```
Browser
   │
   ▼
Node.js API (port 5000)
   │
   ├── Member 1: /api/auth, /api/students, /api/mentor-assignments,
   │             /api/trainer-assignments, /api/institutions,
   │             /api/departments, /api/programs, /api/batches,
   │             /api/subdivisions, /api/admin
   │
   ├── Member 2: /api/assessments, /api/question-bank, /api/attempts,
   │             /api/sessions, /api/listening, /api/responses, /api/reports
   │               │
   │               │  Before /api/attempts/start:
   │               └──────► M4 CreditService.consume() [direct call]
   │               │
   │               │  During /api/responses/submit:
   │               └──────► FastAPI POST /ai/evaluate-response [HTTP]
   │
   ├── Member 3: /api/skills, /api/performance, /api/listening-stories
   │             [Receives events — does not call other members' APIs]
   │
   └── Member 4: /api/credits, /api/checklist, /api/verifications
                 [Provides CreditService.consume() to Member 2]
                 [Receives USER_REGISTERED and ATTEMPT_COMPLETED events]

FastAPI (port 8000) — called only by Node.js, never by browser
   /ai/evaluate-response ◄── Member 2
   /ai/generate-question ◄── Member 2
   /ai/knowledge/* ◄── Member 3 (post-MVP)
   /ai/agents/* ◄── Member 3 (advanced)
```

---

## API Development Checklist

Use this to track implementation progress.

### MVP APIs

#### Member 1
- [ ] `POST /api/auth/register`
- [ ] `POST /api/auth/login`
- [ ] `GET /api/auth/me`
- [ ] `POST /api/auth/logout`
- [ ] `GET /api/students`
- [ ] `GET /api/students/:id`
- [ ] `PUT /api/students/:id`
- [ ] `PUT /api/students/:id/coding-handles`
- [ ] `POST /api/students/:id/resume`
- [ ] `GET /api/mentor-assignments/my-mentees`
- [ ] `POST /api/mentor-assignments`
- [ ] `DELETE /api/mentor-assignments/:id`
- [ ] `POST /api/trainer-assignments`
- [ ] `PUT /api/trainer-assignments/:id/revoke`
- [ ] `GET /api/trainer-assignments`
- [ ] `GET /api/institutions`
- [ ] `GET /api/departments`
- [ ] `GET /api/programs`
- [ ] `GET /api/batches`
- [ ] `GET /api/subdivisions`
- [ ] `POST /api/admin/faculty-mentors`
- [ ] `GET /api/admin/faculty-mentors`
- [ ] `POST /api/admin/program-admins`
- [ ] `GET /api/admin/program-admins`
- [ ] `POST /api/admin/coordinators`

#### Member 2
- [ ] `GET /api/assessments`
- [ ] `POST /api/assessments`
- [ ] `GET /api/assessments/:id`
- [ ] `PUT /api/assessments/:id`
- [ ] `GET /api/question-bank`
- [ ] `POST /api/question-bank`
- [ ] `PUT /api/question-bank/:id`
- [ ] `DELETE /api/question-bank/:id`
- [ ] `POST /api/attempts/start`
- [ ] `GET /api/attempts/:id`
- [ ] `PUT /api/attempts/:id/abandon`
- [ ] `POST /api/sessions/start`
- [ ] `GET /api/sessions/:id`
- [ ] `POST /api/sessions/:id/proctor-event`
- [ ] `POST /api/sessions/:id/complete`
- [ ] `POST /api/listening/start`
- [ ] `GET /api/listening/:id/replay`
- [ ] `POST /api/listening/:id/submit`
- [ ] `POST /api/responses/submit`
- [ ] `GET /api/responses/:id`
- [ ] `GET /api/reports/:attemptId`
- [ ] FastAPI client: `POST /ai/evaluate-response`
- [ ] FastAPI client: `POST /ai/generate-question`

#### Member 3
- [ ] `GET /api/skills`
- [ ] `POST /api/skills`
- [ ] `DELETE /api/skills/:id`
- [ ] `GET /api/skills/student/:studentId`
- [ ] `GET /api/performance/:studentId`
- [ ] `GET /api/performance/:studentId/snapshots`
- [ ] `GET /api/listening-stories`
- [ ] `POST /api/listening-stories`
- [ ] `GET /api/listening-stories/:id`
- [ ] Event handler: `USER_REGISTERED` → create performance_profiles
- [ ] Event handler: `ATTEMPT_COMPLETED` → update performance profile + snapshots

#### Member 4
- [ ] `GET /api/credits/balance/:studentId`
- [ ] `GET /api/checklist`
- [ ] `POST /api/checklist`
- [ ] `POST /api/checklist/import-csv`
- [ ] `PUT /api/checklist/:id`
- [ ] `DELETE /api/checklist/:id`
- [ ] `GET /api/checklist/my-progress`
- [ ] `POST /api/checklist/:itemId/toggle`
- [ ] `GET /api/checklist/mentee/:studentId`
- [ ] `GET /api/verifications/pending`
- [ ] `POST /api/verifications/:progressId/verify`
- [ ] Service: `CreditService.consume()` ← deliver first
- [ ] Service: `CreditService.earn()`
- [ ] Event handler: `USER_REGISTERED` → create credit_accounts
- [ ] Event handler: `ATTEMPT_COMPLETED` → earn credits

---

### Post-MVP APIs (build after MVP is working)

- [ ] `GET /api/reports/student/:studentId` (M2)
- [ ] `GET /api/credits/transactions/:studentId` (M4)
- [ ] `POST /api/credits/adjust` (M4)
- [ ] `GET/POST/PUT /api/credit-policies` (M4)
- [ ] `GET/PUT /api/learning-plans/:studentId` (M3)
- [ ] `GET /api/recommendations/:studentId` (M3)
- [ ] `GET/POST /api/knowledge/documents` (M3)
- [ ] `GET /api/knowledge/search` (M3)
- [ ] `GET/POST/PUT /api/placement-eligibility/*` (M4)
- [ ] `/api/suggestions/*` — chatbot (M2)
- [ ] FastAPI: `POST /ai/evaluate-listening` — `[NEEDS CONFIRMATION]`
- [ ] FastAPI: `POST /ai/knowledge/ingest` (M3)
- [ ] FastAPI: `POST /ai/knowledge/search` (M3)

---

### Advanced APIs (future sprints only)

- [ ] `GET /api/agents` (M3)
- [ ] `GET /api/agents/runs` (M3)
- [ ] `POST /api/agents/run` (M3)
- [ ] `POST /api/agents/:runId/resume` (M3)
- [ ] FastAPI: `POST /ai/agents/run` (M3)
- [ ] FastAPI: `POST /ai/agents/resume` (M3)

---

*Derived from `docs/BACKEND_IMPLEMENTATION_PLAN.md`. APIs marked `[NEEDS CONFIRMATION]` are not explicitly specified in the implementation plan and must be confirmed by the team before implementation.*
