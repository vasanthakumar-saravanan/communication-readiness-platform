# Backend Team Module Allocation
# AI-Powered Communication Readiness Platform (College Edition)

> **Document Type:** Engineering Team Planning Reference  
> **Deployment Scope:** Single-College Institutional Deployment (2,000–3,000 Engineering Students)  
> **Backend Stack:** Node.js + Express (TypeScript) — Modular Monolith  
> **AI Service Stack:** Python + FastAPI  
> **Database:** PostgreSQL (logical schemas: `identity`, `org`, `assessment`, `session`, `evaluation`, `performance`, `credit`, `knowledge`) + `pgvector`  
> **Source of Truth for Tables:** Database schema provided in project specification  
> **Status:** Planning document — no implementation yet  

---

## Table of Contents

1. [Project Context](#1-project-context)
2. [Member 1 — Authentication, Authorization & Organization](#2-member-1--authentication-authorization--organization)
3. [Member 2 — Assessment, Interview & AI Evaluation](#3-member-2--assessment-interview--ai-evaluation)
4. [Member 3 — Performance, Learning, Knowledge & Agents](#4-member-3--performance-learning-knowledge--agents)
5. [Member 4 — Credits, Readiness Checklist & Placement](#5-member-4--credits-readiness-checklist--placement)
6. [Cross-Cutting Backend Responsibilities](#6-cross-cutting-backend-responsibilities)
7. [Team Dependency Map](#7-team-dependency-map)
8. [API Ownership Table](#8-api-ownership-table)
9. [Database Ownership Matrix](#9-database-ownership-matrix)
10. [Development Order / Phase Plan](#10-development-order--phase-plan)
11. [Definition of Done](#11-definition-of-done)
12. [Summary Tables](#12-summary-tables)
13. [Open Questions & Decisions](#13-open-questions--decisions)

---

## 1. Project Context

### 1.1 System Overview

The platform is a **Modular Node.js Monolith** (Express + TypeScript) backed by PostgreSQL and a separate **Python FastAPI AI service**. The five user roles are: `STUDENT`, `FACULTY_MENTOR`, `PROGRAM_ADMIN`, `TRAINER`, and `PLACEMENT_COORDINATOR`.

The existing backend skeleton in `backend/src/index.ts` already defines seven route groups:

```
/api/auth
/api/students
/api/tasks
/api/interviews
/api/listening
/api/suggestions
/api/admin
```

All new module work should extend this structure following the existing layered pattern: **Routes → Middleware → Service → Repository → Database**.

### 1.2 Layered Architecture per Module

Every domain module owned by any team member must follow this internal structure:

```
src/
  modules/<module-name>/
    <module>.routes.ts       ← Express router + input validation
    <module>.controller.ts   ← Delegates to service, formats HTTP response
    <module>.service.ts      ← Business logic, orchestration
    <module>.repository.ts   ← Raw SQL / ORM queries only
    <module>.types.ts        ← TypeScript interfaces, Zod/Joi schemas
    <module>.errors.ts       ← Domain-specific error classes
```

### 1.3 Terminology Mapping

| Term in Document | Term in Project Blueprint | Database Schema |
|---|---|---|
| Institution | College (single-institution deployment) | `identity` / `org` |
| Department | Department | `org.departments` |
| Program | HOPE Track, PEP Track, Department Stream | `org.programs` |
| Batch | Cohort year within a program | `org.batches` |
| Subdivision | Domain (21 PEP domains, HOPE Elite, HOPE Non-Elite) | `org.subdivisions` |
| Trainer assignment | Trainer tenure / trainer contract | `org.trainer_subdivision_assignments` |
| Assessment Session | Interview session or Listening session | `session.assessment_sessions` |
| AI Run | LLM call record for a response evaluation | `evaluation.ai_runs` |
| Checklist Item | Criteria task from placement syllabus | `placement.checklist_items` |

---

## 2. Member 1 — Authentication, Authorization & Organization

### 2.1 Summary of Responsibility

Member 1 owns the **identity foundation** of the entire platform. All other members depend on Member 1's authentication middleware, JWT token structure, user entity, role resolution, and scope-based authorization guards. Member 1 must deliver these foundations in Phase 1 before any other feature module can be built.

### 2.2 Owned Database Tables

| Table | Schema | Purpose |
|---|---|---|
| `institutions` | `org` | Top-level college/institution entity (single row for single-college deployment) |
| `departments` | `org` | Academic departments (CSE, ECE, Mechanical, etc.) |
| `programs` | `org` | HOPE Track, PEP Track, Department Stream |
| `batches` | `org` | Cohort years within a program |
| `subdivisions` | `org` | Domains within programs (21 PEP domains, HOPE Elite, HOPE Non-Elite) |
| `users` | `identity` | All platform users — students, mentors, trainers, admins, coordinators |
| `roles` | `identity` | Named role definitions (`STUDENT`, `FACULTY_MENTOR`, `PROGRAM_ADMIN`, `TRAINER`, `PLACEMENT_COORDINATOR`) |
| `permissions` | `identity` | Granular resource + action pairs |
| `role_permissions` | `identity` | M:N join between roles and permissions |
| `role_assignments` | `identity` | Assigns a role to a user within a specific access scope |
| `students` | `org` | Student profile extension linked to `users` |
| `student_mentor_assignments` | `org` | Faculty mentor → student assignments (1 mentor ≈ 25 students) |
| `trainer_subdivision_assignments` | `org` | Visiting trainer → subdivision assignment with active tenure dates |

### 2.3 Module Structure

```
src/modules/
  auth/
    auth.routes.ts
    auth.controller.ts
    auth.service.ts           ← Registration, login, token issuance, password hashing
    auth.repository.ts        ← User lookup by email, credential validation
    auth.types.ts
  users/
    users.routes.ts
    users.controller.ts
    users.service.ts          ← CRUD for users, status management
    users.repository.ts
    users.types.ts
  organization/
    organization.routes.ts
    organization.controller.ts
    organization.service.ts   ← Institution, department, program, batch, subdivision CRUD
    organization.repository.ts
    organization.types.ts
  roles/
    roles.routes.ts
    roles.controller.ts
    roles.service.ts          ← Role & permission CRUD, role assignment
    roles.repository.ts
    roles.types.ts
  students/
    students.routes.ts
    students.controller.ts
    students.service.ts       ← Student profile, coding handles, resume link, mentor assignment
    students.repository.ts
    students.types.ts
  assignments/
    assignments.routes.ts     ← Mentor ↔ student, trainer ↔ subdivision
    assignments.controller.ts
    assignments.service.ts    ← Tenure validation, mentor capacity checks
    assignments.repository.ts
    assignments.types.ts
  middleware/
    authenticate.ts           ← JWT Bearer token parsing and req.user population
    authorize.ts              ← Role + permission + scope guard factory
    trainerTenureGuard.ts     ← Validates trainer access is within active tenure dates
```

### 2.4 Services

| Service | Responsibility |
|---|---|
| `AuthService` | Register user (bcrypt hash), login (credential verify), issue JWT, refresh token |
| `UserService` | Create/read/update user, deactivate user, validate status (`ACTIVE`/`INACTIVE`/`SUSPENDED`) |
| `OrganizationService` | Manage institution record, departments, programs, batches, subdivisions |
| `RoleService` | Create/assign roles, manage permissions, resolve effective permission set for a user |
| `StudentService` | Create/read/update student profile, manage coding handles (LeetCode, GitHub, etc.), link resume |
| `MentorAssignmentService` | Assign mentor to student, enforce ~25-student cap, end assignment |
| `TrainerAssignmentService` | Onboard trainer to subdivision with dates, revoke access, check active tenure |

### 2.5 Controllers / Routes

| Method | Route | Auth | Roles | Description |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public | — | Register new user |
| `POST` | `/api/auth/login` | Public | — | Login, receive JWT |
| `GET` | `/api/auth/me` | JWT | All | Current user identity |
| `POST` | `/api/auth/logout` | JWT | All | Invalidate session |
| `GET` | `/api/users` | JWT | `PLACEMENT_COORDINATOR` | List all users |
| `GET` | `/api/users/:id` | JWT | Admin scoped | Get user by ID |
| `PUT` | `/api/users/:id` | JWT | Self / Coordinator | Update user profile |
| `PUT` | `/api/users/:id/status` | JWT | `PLACEMENT_COORDINATOR` | Activate/deactivate user |
| `GET` | `/api/institutions` | JWT | All | Get institution info |
| `GET` | `/api/departments` | JWT | Admin scoped | List departments |
| `POST` | `/api/departments` | JWT | `PLACEMENT_COORDINATOR` | Create department |
| `GET` | `/api/programs` | JWT | All | List programs |
| `POST` | `/api/programs` | JWT | `PLACEMENT_COORDINATOR` | Create program |
| `GET` | `/api/batches` | JWT | Admin scoped | List batches |
| `POST` | `/api/batches` | JWT | `PLACEMENT_COORDINATOR` / `PROGRAM_ADMIN` | Create batch |
| `GET` | `/api/subdivisions` | JWT | Admin scoped | List subdivisions |
| `POST` | `/api/subdivisions` | JWT | `PLACEMENT_COORDINATOR` | Create subdivision |
| `GET` | `/api/roles` | JWT | `PLACEMENT_COORDINATOR` | List roles |
| `POST` | `/api/roles/:userId/assign` | JWT | `PLACEMENT_COORDINATOR` | Assign role to user |
| `GET` | `/api/students` | JWT | Scoped (role-filtered) | List students |
| `GET` | `/api/students/:id` | JWT | Scoped | Get student profile |
| `PUT` | `/api/students/:id/coding-handles` | JWT | `STUDENT` (self) | Update coding profiles |
| `GET` | `/api/students/:id/mentor` | JWT | Scoped | Get assigned mentor |
| `POST` | `/api/mentor-assignments` | JWT | `PLACEMENT_COORDINATOR` | Assign mentor to student |
| `DELETE` | `/api/mentor-assignments/:id` | JWT | `PLACEMENT_COORDINATOR` | End mentor assignment |
| `GET` | `/api/mentor-assignments/my-mentees` | JWT | `FACULTY_MENTOR` | Get assigned mentees |
| `POST` | `/api/trainer-assignments` | JWT | `PROGRAM_ADMIN` / `PLACEMENT_COORDINATOR` | Onboard trainer |
| `PUT` | `/api/trainer-assignments/:id/revoke` | JWT | `PROGRAM_ADMIN` / `PLACEMENT_COORDINATOR` | Revoke trainer access |
| `GET` | `/api/trainer-assignments` | JWT | `PROGRAM_ADMIN` / `PLACEMENT_COORDINATOR` | List active tenures |

### 2.6 Request / Response Schemas (Key Examples)

**POST /api/auth/register**
```typescript
// Request
{
  name: string;
  email: string;
  password: string;        // min 8 chars
  role: RoleEnum;
  rollNumber?: string;     // required if role === 'STUDENT'
  departmentId?: string;
  programId?: string;
  batchId?: string;
}

// Response 201
{
  token: string;           // JWT Bearer token
  user: {
    id: string;
    name: string;
    email: string;
    role: RoleEnum;
    status: UserStatusEnum;
  }
}
```

**POST /api/auth/login**
```typescript
// Request
{ email: string; password: string; }

// Response 200
{
  token: string;
  user: { id, name, email, role, status }
}
```

### 2.7 Authentication Responsibilities

- **Password hashing:** `bcryptjs`, salt rounds = 10
- **Token issuance:** Signed JWT containing `{ sub: userId, role, email, iat, exp }`
- **Token expiry:** Configurable via `JWT_EXPIRES_IN` env variable
- **Middleware `authenticate.ts`:** Parses `Authorization: Bearer <token>`, populates `req.user`, returns 401 if missing or invalid
- **Token refresh:** To be decided — see Open Questions

### 2.8 Authorization Responsibilities

Member 1 owns and maintains the authorization middleware that all other modules import:

```typescript
// Usage in any other module's route file:
import { authorize } from '../middleware/authorize';

router.get('/some-resource', authenticate, authorize('PLACEMENT_COORDINATOR'), handler);
router.get('/scoped-resource', authenticate, authorize(['PROGRAM_ADMIN', 'TRAINER'], { scopeCheck: true }), handler);
```

- **`authorize(roles, options)`** — checks `req.user.role` against allowed roles
- **`scopeCheck`** — for `PROGRAM_ADMIN` and `TRAINER`, verifies the requested student/subdivision is within their assigned scope
- **`trainerTenureGuard`** — checks `trainer_subdivision_assignments.is_active` and current date is within `start_date`–`end_date`

### 2.9 Table Relationships

```
institutions (1) ──── (N) departments
institutions (1) ──── (N) programs
programs (1) ──── (N) batches
programs (1) ──── (N) subdivisions
users (1) ──── (1) students [student profile]
users (N) ──── (N) roles [via role_assignments]
roles (N) ──── (N) permissions [via role_permissions]
role_assignments ──── access_scope [scoped by program/subdivision/batch]
students (N) ──── (1) users [mentor via student_mentor_assignments]
students (1) ──── (N) student_mentor_assignments
trainer_subdivision_assignments (N) ──── (1) users [trainer]
trainer_subdivision_assignments (N) ──── (1) subdivisions
```

### 2.10 Dependencies on Other Members

| Dependency | Direction | Description |
|---|---|---|
| Member 2 (Assessment) | Member 1 → 2 | Assessment module imports `authenticate` and `authorize` middleware from Member 1 |
| Member 3 (Performance) | Member 1 → 3 | Performance module needs `student_id` resolved by Member 1's student service |
| Member 4 (Credits/Readiness) | Member 1 → 4 | Credit accounts are created per student; Member 4 needs student creation events from Member 1 |
| All members | Member 1 → All | JWT middleware, `req.user` structure, and scope authorization guards must be stable before any other module builds protected routes |

---

## 3. Member 2 — Assessment, Interview & AI Evaluation

### 3.1 Summary of Responsibility

Member 2 owns the **core assessment pipeline** — from assessment configuration to final report generation. This includes interview session orchestration, listening comprehension sessions, question bank management, student response handling, AI evaluation integration, and proctoring telemetry. Member 2 coordinates with the Python FastAPI AI service for all LLM-based operations.

### 3.2 Owned Database Tables

| Table | Schema | Purpose |
|---|---|---|
| `assessments` | `assessment` | Assessment definition (type, description, configuration) |
| `assessment_components` | `assessment` | Sub-components of an assessment (Technical, Communication, Listening) with weights |
| `assessment_attempts` | `assessment` | One attempt record per student per assessment instance |
| `assessment_sessions` | `session` | A running interview or listening session within an attempt |
| `question_bank_items` | `session` | Pre-seeded or admin-curated questions with difficulty and skill tags |
| `question_bank_item_skills` | `session` | M:N mapping of question bank items to skills |
| `questions` | `session` | Questions posed in a specific session (sourced from bank or AI-generated) |
| `responses` | `evaluation` | Student's spoken/typed answer to a question |
| `ai_runs` | `evaluation` | Record of each LLM call — model, prompt reference, latency, tokens, outcome |
| `response_evaluations` | `evaluation` | Evaluated scores, feedback, strengths, weaknesses per response |
| `assessment_reports` | `performance` | Immutable final diagnostic report generated at attempt completion |

### 3.3 Module Structure

```
src/modules/
  assessments/
    assessments.routes.ts
    assessments.controller.ts
    assessments.service.ts          ← Assessment CRUD, component configuration
    assessments.repository.ts
    assessments.types.ts
  attempts/
    attempts.routes.ts
    attempts.controller.ts
    attempts.service.ts             ← Attempt lifecycle: start, resume, abandon, complete
    attempts.repository.ts          ← Idempotency key enforcement
    attempts.types.ts
  sessions/
    sessions.routes.ts
    sessions.controller.ts
    sessions.service.ts             ← Session state machine: INITIALIZED → ACTIVE → COMPLETED
    sessions.repository.ts
    proctoring.service.ts           ← Tab-switch counter, fullscreen-exit, flagging logic
    sessions.types.ts
  questions/
    questions.routes.ts
    questions.controller.ts
    questions.service.ts            ← Question bank CRUD, AI-generated question management
    questions.repository.ts
    questions.types.ts
  responses/
    responses.routes.ts
    responses.controller.ts
    responses.service.ts            ← Response submission, transcript handling
    responses.repository.ts
    responses.types.ts
  evaluation/
    evaluation.routes.ts
    evaluation.controller.ts
    evaluation.service.ts           ← Orchestrates AI service call, persists evaluation result
    ai-client.ts                    ← HTTP client to FastAPI AI service
    evaluation.repository.ts
    evaluation.types.ts
  reports/
    reports.routes.ts
    reports.controller.ts
    reports.service.ts              ← Report aggregation, score calculation, immutable write
    reports.repository.ts
    reports.types.ts
```

### 3.4 Complete Assessment Flow

```
STUDENT
  │
  ▼
POST /api/attempts/start
  │   AttemptService creates assessment_attempt (status: IN_PROGRESS)
  │   CreditService (Member 4) deducted via internal event
  │
  ▼
POST /api/sessions/start  (within attempt)
  │   SessionService creates assessment_session (status: INITIALIZED → ACTIVE)
  │   QuestionService generates/fetches first question
  │     ├─ If bank question: query question_bank_items by skill + difficulty
  │     └─ If AI-generated: call FastAPI /ai/generate-question with resume context
  │
  ▼
POST /api/sessions/:sessionId/proctor-event
  │   ProctoringService increments tab_switch_count / fullscreen_exit_count
  │   Applies flagging rules:
  │     1–2 switches → warning only
  │     3–4 switches → warning + audit log entry
  │     ≥5 switches  → is_proctor_flagged = true
  │
  ▼
POST /api/responses/submit
  │   ResponseService stores transcript in responses table
  │   EvaluationService triggers single-pass AI evaluation:
  │     POST http://ai-service/ai/evaluate-response
  │       { transcript, question, duration_sec, resume_context }
  │     AI returns: { technical_score, fluency_score, clarity_score, pace_wpm,
  │                   filler_count, feedback, strengths, weaknesses }
  │   EvaluationService writes response_evaluations record
  │   EvaluationService writes ai_runs record (latency, tokens, model)
  │   SessionService applies adaptive difficulty:
  │     score ≥ 80 → elevate difficulty (EASY → MEDIUM → ADVANCED)
  │     score < 50 → maintain/reduce difficulty
  │   SessionService generates next question
  │
  ▼
POST /api/sessions/:sessionId/complete
  │   SessionService marks session COMPLETED
  │   ReportService aggregates all response_evaluations for the session:
  │     overall_score = (tech_avg × 0.70) + (comm_avg × 0.30)
  │     comm_avg     = (fluency × 0.35) + (pace × 0.25) + (filler_penalty × 0.20) + (clarity × 0.20)
  │   ReportService writes immutable assessment_reports record
  │   Fires outbox event → Member 3 (PerformanceService triggers snapshot)
  │
  ▼
GET /api/reports/:attemptId
    Returns full diagnostic report to Student / Mentor / Admin
```

### 3.5 API Endpoints

| Method | Route | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/assessments` | JWT | Admin | List configured assessments |
| `POST` | `/api/assessments` | JWT | `PLACEMENT_COORDINATOR` / `PROGRAM_ADMIN` | Create assessment |
| `GET` | `/api/assessments/:id` | JWT | All | Get assessment details |
| `PUT` | `/api/assessments/:id` | JWT | Admin | Update assessment config |
| `GET` | `/api/question-bank` | JWT | Admin | List question bank items |
| `POST` | `/api/question-bank` | JWT | `PROGRAM_ADMIN` / `PLACEMENT_COORDINATOR` | Add question |
| `PUT` | `/api/question-bank/:id` | JWT | Admin | Update question |
| `DELETE` | `/api/question-bank/:id` | JWT | `PLACEMENT_COORDINATOR` | Soft-delete question |
| `POST` | `/api/attempts/start` | JWT | `STUDENT` | Start new assessment attempt |
| `GET` | `/api/attempts/:id` | JWT | Scoped | Get attempt status |
| `PUT` | `/api/attempts/:id/abandon` | JWT | `STUDENT` (self) | Abandon in-progress attempt |
| `POST` | `/api/sessions/start` | JWT | `STUDENT` | Start session within attempt |
| `GET` | `/api/sessions/:id` | JWT | Scoped | Get session state |
| `POST` | `/api/sessions/:id/proctor-event` | JWT | `STUDENT` | Record proctoring event |
| `POST` | `/api/sessions/:id/complete` | JWT | `STUDENT` | Finalize session |
| `POST` | `/api/responses/submit` | JWT | `STUDENT` | Submit answer, trigger evaluation |
| `GET` | `/api/responses/:id` | JWT | Scoped | Get response + evaluation |
| `GET` | `/api/reports/:attemptId` | JWT | Scoped | Get diagnostic report |
| `GET` | `/api/reports/student/:studentId` | JWT | Scoped | All reports for student |

### 3.6 AI Integration Boundaries

Member 2 owns the **Node.js side** of the AI integration. The Python FastAPI service (`ai-service/`) is a separate process.

**Member 2 responsibilities:**
- HTTP client (`ai-client.ts`) that calls the FastAPI service
- Request/response type contracts between Node.js and FastAPI
- Retry logic with exponential backoff on AI service calls
- Fallback behavior if AI service is unavailable (store response, mark evaluation as PENDING)
- Persisting `ai_runs` records (model, prompt_hash, latency_ms, input_tokens, output_tokens, status)
- All deterministic business logic: difficulty adjustment, score formula, credit deduction trigger

**AI service (`ai-service/`) responsibilities (Python team or Member 2's Python code):**
- Speech-to-text (STT) processing
- Communication metrics: WPM, filler word count, fluency, clarity, pitch
- LLM prompt construction and single-pass structured evaluation
- Question generation from resume context + knowledge RAG
- Provider abstraction (Groq, OpenAI, Gemini, Mock)

```typescript
// ai-client.ts interface
interface AIEvaluateRequest {
  transcript: string;
  question_text: string;
  duration_sec: number;
  resume_context?: string;
  difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
}

interface AIEvaluateResponse {
  technical_score: number;    // 0–100
  fluency_score: number;      // 0–100
  clarity_score: number;      // 0–100
  pace_wpm: number;
  filler_count: number;
  is_pace_optimal: boolean;   // 120–150 WPM = optimal
  feedback: string;
  strengths: string;
  weaknesses: string;
  model_used: string;
  latency_ms: number;
}
```

### 3.7 Session Management

- Each `assessment_session` has a status state machine: `INITIALIZED → ACTIVE → PAUSED → COMPLETED | TERMINATED`
- Sessions should store `started_at`, `completed_at`, and `last_activity_at`
- A student may not have two concurrent active sessions for the same assessment — enforce at service level
- Listening sessions have an additional replay counter capped at 2 (`replay_count <= 2`)

### 3.8 Error Handling

| Scenario | HTTP Status | Error Code |
|---|---|---|
| Attempt already in progress for this assessment | 409 | `ATTEMPT_IN_PROGRESS` |
| Max attempts exceeded | 422 | `MAX_ATTEMPTS_EXCEEDED` |
| Insufficient credits | 402 | `INSUFFICIENT_CREDITS` |
| Session not found | 404 | `SESSION_NOT_FOUND` |
| Session already completed | 409 | `SESSION_ALREADY_COMPLETED` |
| Replay limit exceeded (listening) | 422 | `REPLAY_LIMIT_EXCEEDED` |
| AI service unavailable | 503 | `AI_SERVICE_UNAVAILABLE` |
| Response submitted to completed session | 422 | `SESSION_CLOSED` |

### 3.9 Idempotency Considerations

- `POST /api/attempts/start` — enforce idempotency key in request header; if a concurrent attempt is already `IN_PROGRESS`, return the existing attempt (409 with body)
- `POST /api/responses/submit` — include client-generated `idempotency_key` field; if duplicate detected, return previously stored evaluation
- AI evaluation calls should be idempotent with respect to `response_id` — if `ai_runs` already has a completed entry for this `response_id`, return cached result

### 3.10 Dependencies

| Dependency | From | Description |
|---|---|---|
| Member 1 | Auth middleware, `req.user`, student profile lookup | Required before any protected route |
| Member 1 | Scope authorization (mentor can only view their 25 mentees' reports) | Required for GET /reports |
| Member 3 | Fires outbox event after report generated | Member 3 consumes event to update PerformanceProfile |
| Member 4 | Credit deduction before attempt starts | Member 2 calls Member 4's CreditService internally or via event |

---

## 4. Member 3 — Performance, Learning, Knowledge & Agents

### 4.1 Summary of Responsibility

Member 3 owns the **intelligence and analytics layer** of the platform. This includes consuming completed assessment reports to update student performance profiles, generating learning plans and recommendations, managing the RAG knowledge base (documents and embeddings), and the autonomous agent system that orchestrates multi-step AI workflows (interview agent, evaluation agent, suggestion agents).

### 4.2 Owned Database Tables

| Table | Schema | Purpose |
|---|---|---|
| `performance_profiles` | `performance` | Current aggregated performance state per student (mutable) |
| `performance_snapshots` | `performance` | Append-only historical snapshots taken after each attempt |
| `skill_performances` | `performance` | Per-skill score breakdown linked to profile or report |
| `learning_plans` | `performance` | Student's active learning plan |
| `learning_recommendations` | `performance` | Individual recommended actions / resources within a plan |
| `listening_stories` | `performance` | Audio scenario content for listening comprehension assessments |
| `knowledge_documents` | `knowledge` | Curated knowledge base documents (domain syllabi, tech references) |
| `knowledge_chunks` | `knowledge` | Chunked segments of knowledge documents with embeddings (pgvector) |
| `agent_definitions` | `agent` | Registered autonomous agent specs (name, type, prompt template, tools) |
| `agent_runs` | `agent` | One execution record per agent invocation |
| `agent_steps` | `agent` | Individual steps within an agent run (tool calls, LLM turns, results) |

### 4.3 Module Structure

```
src/modules/
  performance/
    performance.routes.ts
    performance.controller.ts
    performance.service.ts          ← Aggregates report data into profile + snapshot
    performance.repository.ts
    performance.types.ts
  skills/
    skills.routes.ts
    skills.controller.ts
    skills.service.ts               ← Skill master list, student skill mappings
    skills.repository.ts
    skills.types.ts
  learning/
    learning.routes.ts
    learning.controller.ts
    learning.service.ts             ← Generate / update learning plan based on skill gaps
    learning.repository.ts
    learning.types.ts
  recommendations/
    recommendations.routes.ts
    recommendations.controller.ts
    recommendations.service.ts      ← Derive prioritized recommendations from weak skill_performances
    recommendations.repository.ts
    recommendations.types.ts
  knowledge/
    knowledge.routes.ts
    knowledge.controller.ts
    knowledge.service.ts            ← Document ingestion, chunking, embedding, retrieval
    knowledge.repository.ts
    embedding.client.ts             ← HTTP client to FastAPI for embedding generation
    knowledge.types.ts
  agents/
    agents.routes.ts
    agents.controller.ts
    agents.service.ts               ← Agent lifecycle: register, run, step, complete/fail
    agents.repository.ts
    agents.types.ts
  listening/
    listening-stories.routes.ts
    listening-stories.controller.ts
    listening-stories.service.ts    ← CRUD for audio scenario content
    listening-stories.repository.ts
    listening-stories.types.ts
```

### 4.4 Performance Calculation Flow

```
Assessment Attempt COMPLETED (Member 2 fires outbox event)
  │
  ▼
PerformanceService.onAttemptCompleted(attemptId)
  │   Fetches assessment_reports record from Member 2's tables
  │   Reads all response_evaluations for this attempt
  │
  ▼
PerformanceSnapshotService
  │   Inserts new performance_snapshots record (append-only, never updated)
  │   Captures: technical_score, communication_score, listening_score, overall_score, timestamp
  │
  ▼
SkillPerformanceService
  │   Reads question skills from questions table (via question_bank_item_skills)
  │   Aggregates per-skill averages from response_evaluations
  │   Upserts skill_performances records linked to performance_profiles
  │
  ▼
PerformanceProfileService
  │   Updates performance_profiles (mutable) with new aggregated scores
  │   Calculates trend: IMPROVING / STABLE / DECLINING (compare last 3 snapshots)
  │   Updates previous_overall_score before writing new overall_score
  │
  ▼
LearningService.refreshLearningPlan(studentId)
    Identifies weak skill_performances (score < threshold)
    Generates / updates learning_plans record
    Upserts learning_recommendations (recommended resources per weak skill)
```

### 4.5 Knowledge / RAG Flow

```
Admin uploads knowledge document (domain syllabus, tech reference)
  │
  ▼
POST /api/knowledge/documents
  │   KnowledgeService stores metadata in knowledge_documents
  │   Triggers async chunking job
  │
  ▼
KnowledgeService.chunkAndEmbed(documentId)
  │   Splits document text into overlapping chunks (configurable chunk_size, overlap)
  │   Calls FastAPI /ai/embed for each chunk → returns float[] vector
  │   Stores chunk text + vector in knowledge_chunks (pgvector column)
  │
  ▼
GET /api/knowledge/search?q=...&topK=5
    KnowledgeService.semanticSearch(query, topK)
    Calls pgvector cosine similarity query:
      SELECT * FROM knowledge_chunks ORDER BY embedding <=> query_embedding LIMIT topK
    Returns ranked chunks to caller (AI service or interview agent)
```

### 4.6 Agent System Flow

```
AgentDefinition registered in agent_definitions
  │   name, type, prompt_template, tool_list, model_config
  │
  ▼
AgentService.runAgent(definitionId, inputPayload)
  │   Creates agent_runs record (status: RUNNING)
  │   Calls FastAPI AI service with agent definition + input
  │
  ▼
AgentService.recordStep(runId, stepData)
  │   Each LLM turn / tool call creates agent_steps record
  │   step_type: TOOL_CALL | LLM_TURN | RETRIEVAL | DECISION
  │   Stores: input_payload, output_payload, latency_ms, status
  │
  ▼
AgentService.completeRun(runId, result)   OR   AgentService.failRun(runId, error)
    Updates agent_runs: status = COMPLETED | FAILED
    Stores final output or error context
    Fires outbox event if agent result triggers downstream action
```

**Registered Agents (defined in `agent_definitions`):**

| Agent Name | Type | Trigger | Description |
|---|---|---|---|
| `InterviewAgent` | `INTERVIEW` | Session start | Resume-grounded question generation + adaptive difficulty |
| `EvaluationAgent` | `EVALUATION` | Response submitted | Single-pass technical + communication evaluation |
| `SuggestionConversationAgent` | `SUGGESTION` | Chat message | Conversational coaching response |
| `SuggestionEvaluationAgent` | `SUGGESTION` | Chat message | Deep terminology and structural communication analysis |

### 4.7 Responsibility Separation

| Responsibility | Owner | Location |
|---|---|---|
| Performance aggregation logic | Member 3 (Node.js) | `performance.service.ts` |
| Learning plan generation rules | Member 3 (Node.js) | `learning.service.ts` |
| RAG retrieval (pgvector query) | Member 3 (Node.js) | `knowledge.repository.ts` |
| Document embedding (vector generation) | Python AI Service | `ai-service/` |
| Agent prompt templates | Member 3 (DB) | `agent_definitions` table |
| Agent execution / LLM calls | Python AI Service | `ai-service/` |
| Agent lifecycle state tracking | Member 3 (Node.js) | `agents.service.ts` |
| Listening story content CRUD | Member 3 (Node.js) | `listening-stories.service.ts` |
| Audio narration / TTS | Python AI Service | `ai-service/` |

### 4.8 API Endpoints

| Method | Route | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/performance/:studentId` | JWT | Scoped | Current performance profile |
| `GET` | `/api/performance/:studentId/snapshots` | JWT | Scoped | Historical snapshots |
| `GET` | `/api/skills` | JWT | All | List all skills |
| `GET` | `/api/skills/student/:studentId` | JWT | Scoped | Student skill performance breakdown |
| `GET` | `/api/learning-plans/:studentId` | JWT | Scoped | Active learning plan |
| `PUT` | `/api/learning-plans/:studentId/refresh` | JWT | `STUDENT` (self) | Trigger plan refresh |
| `GET` | `/api/recommendations/:studentId` | JWT | Scoped | Learning recommendations |
| `PUT` | `/api/recommendations/:id/status` | JWT | `STUDENT` | Mark recommendation done |
| `GET` | `/api/knowledge/documents` | JWT | Admin | List knowledge documents |
| `POST` | `/api/knowledge/documents` | JWT | `PLACEMENT_COORDINATOR` / `PROGRAM_ADMIN` | Upload document |
| `DELETE` | `/api/knowledge/documents/:id` | JWT | `PLACEMENT_COORDINATOR` | Soft-delete document |
| `GET` | `/api/knowledge/search` | JWT | Internal / AI service | Semantic search |
| `GET` | `/api/agents` | JWT | Admin | List agent definitions |
| `POST` | `/api/agents` | JWT | `PLACEMENT_COORDINATOR` | Register agent definition |
| `GET` | `/api/agents/runs` | JWT | Admin | List agent runs |
| `GET` | `/api/agents/runs/:id` | JWT | Admin | Get agent run detail + steps |
| `GET` | `/api/listening-stories` | JWT | Admin | List listening stories |
| `POST` | `/api/listening-stories` | JWT | `PROGRAM_ADMIN` / `PLACEMENT_COORDINATOR` | Create listening story |
| `GET` | `/api/listening-stories/:id` | JWT | `STUDENT` | Get story for assessment |

### 4.9 Skills Table Note

The `skills` and `student_skills` tables (referenced in the database schema as a separate module) are also owned by Member 3 and managed within the `skills/` module. These provide the master skill taxonomy used by both Member 2 (question tagging) and Member 3 (performance analysis).

### 4.10 Dependencies

| Dependency | From | Description |
|---|---|---|
| Member 1 | Auth + student profile | `studentId` must exist in `students` table before performance profile is created |
| Member 2 | Outbox event after attempt completion | Triggers performance update and snapshot |
| Member 2 | `assessment_reports`, `response_evaluations`, `questions` tables | Read-access for aggregation (no writes to Member 2's tables) |
| Member 4 | No hard dependency | Learning plan status may optionally influence placement eligibility score (to be decided) |

---

## 5. Member 4 — Credits, Readiness Checklist & Placement

### 5.1 Summary of Responsibility

Member 4 owns the **credit economy**, the **placement readiness checklist**, and the **placement eligibility determination** system. The credit system governs how students consume and earn credits to participate in assessments. The checklist system tracks student completion of placement criteria tasks with mentor sign-off. Placement eligibility aggregates all platform signals into a single eligibility determination.

### 5.2 Owned Database Tables

| Table | Schema | Purpose |
|---|---|---|
| `credit_accounts` | `credit` | One ledger account per student |
| `credit_transactions` | `credit` | Immutable credit ledger entries (consumption, earning, adjustment, refund) |
| `credit_policies` | `credit` | Configurable rules for credit earning and consumption by scope |
| `checklist_items` | `placement` | Placement criteria tasks (from CSV or admin input) |
| `checklist_progress` | `placement` | Student completion status per checklist item |
| `mentor_verifications` | `placement` | Mentor sign-off records for completed checklist items |
| `placement_eligibility` | `placement` | Computed placement eligibility record per student |

### 5.3 Module Structure

```
src/modules/
  credits/
    credits.routes.ts
    credits.controller.ts
    credits.service.ts              ← Account creation, deduction, earning, balance query
    credits.repository.ts           ← Append-only transactions, balance computed from ledger
    credit-policies.service.ts      ← Manage credit policies per scope
    credit-policies.repository.ts
    credits.types.ts
  checklist/
    checklist.routes.ts
    checklist.controller.ts
    checklist.service.ts            ← CRUD for items, toggle student progress
    checklist.repository.ts
    checklist.types.ts
  verifications/
    verifications.routes.ts
    verifications.controller.ts
    verifications.service.ts        ← Mentor sign-off, evidence review
    verifications.repository.ts
    verifications.types.ts
  placement/
    placement.routes.ts
    placement.controller.ts
    placement.service.ts            ← Eligibility calculation engine
    placement.repository.ts
    placement.types.ts
```

### 5.4 Credit System Flow

```
CreditPolicyService defines policies (scope: GLOBAL | PROGRAM | DOMAIN | BATCH)
  │   Rules: assessment_credit_cost = 10, completion_reward = 5, etc.
  │
  ▼
Student attempts assessment (Member 2 calls CreditService before creating attempt)
  │
  ▼
CreditService.consume(studentId, amount, reason, referenceId)
  │   Validates: account.balance >= amount
  │   Appends credit_transactions record: type = CONSUMPTION, amount = -amount
  │   Updates credit_accounts.balance = balance - amount
  │   Returns updated balance
  │   Throws INSUFFICIENT_CREDITS (402) if balance < cost
  │
  ▼
Student completes assessment (Member 2 fires outbox event on report generation)
  │
  ▼
CreditService.earn(studentId, amount, reason, referenceId)
    Appends credit_transactions record: type = EARNING, amount = +amount
    Updates credit_accounts.balance = balance + amount
    Enforces maximum_balance cap from credit_policies
```

**Credit Balance Rule:** Balance is always authoritative from `credit_accounts.balance`. `credit_transactions` is the audit trail. Never compute balance from transactions in real time — update the denormalized balance on each transaction write within a database transaction.

### 5.5 Readiness Checklist Flow

```
PlacementCoordinator uploads CSV → POST /api/checklist/import-csv
  │   ChecklistService parses CSV
  │   Inserts checklist_items records (title, description, target_track, is_mandatory)
  │
  ▼
Student views checklist → GET /api/checklist/my-progress
  │   Returns checklist_items + checklist_progress for the requesting student
  │   Items filtered by student's program track (target_track matches)
  │
  ▼
Student marks item complete → POST /api/checklist/:itemId/toggle
  │   ChecklistService upserts checklist_progress record
  │   Sets is_completed = true, completion_evidence (optional URL or text)
  │   Triggers notification to assigned mentor (via outbox event)
  │
  ▼
Mentor reviews and verifies → POST /api/verifications/:progressId/verify
  │   VerificationService checks: mentor is assigned to this student
  │   Inserts mentor_verifications record: verified_by, verified_at, notes
  │   Updates checklist_progress.is_mentor_verified = true
  │
  ▼
PlacementEligibilityService.recalculate(studentId)
    Runs after each verification event
    Checks eligibility criteria:
      1. All mandatory checklist items verified by mentor
      2. performance_profiles.overall_score >= minimum threshold (from credit_policies / config)
      3. credit_accounts.balance >= 0 (not suspended)
      4. assessment_attempts: minimum required attempts completed
    Upserts placement_eligibility record with:
      is_eligible, eligibility_score, blocking_reasons[], calculated_at
```

### 5.6 API Endpoints

| Method | Route | Auth | Roles | Description |
|---|---|---|---|---|
| `GET` | `/api/credits/balance/:studentId` | JWT | Scoped | Get credit balance |
| `GET` | `/api/credits/transactions/:studentId` | JWT | Scoped | Credit transaction history |
| `POST` | `/api/credits/adjust` | JWT | `PLACEMENT_COORDINATOR` | Admin credit adjustment |
| `GET` | `/api/credit-policies` | JWT | Admin | List credit policies |
| `POST` | `/api/credit-policies` | JWT | `PLACEMENT_COORDINATOR` | Create credit policy |
| `PUT` | `/api/credit-policies/:id` | JWT | `PLACEMENT_COORDINATOR` | Update credit policy |
| `GET` | `/api/checklist` | JWT | Admin | List all checklist items |
| `POST` | `/api/checklist` | JWT | `PLACEMENT_COORDINATOR` | Create checklist item |
| `POST` | `/api/checklist/import-csv` | JWT | `PLACEMENT_COORDINATOR` | Bulk import from CSV |
| `PUT` | `/api/checklist/:id` | JWT | `PLACEMENT_COORDINATOR` | Update checklist item |
| `DELETE` | `/api/checklist/:id` | JWT | `PLACEMENT_COORDINATOR` | Soft-delete checklist item |
| `GET` | `/api/checklist/my-progress` | JWT | `STUDENT` | Own checklist + progress |
| `POST` | `/api/checklist/:itemId/toggle` | JWT | `STUDENT` | Toggle item complete |
| `GET` | `/api/checklist/mentee/:studentId` | JWT | `FACULTY_MENTOR` | View mentee's checklist |
| `GET` | `/api/verifications/pending` | JWT | `FACULTY_MENTOR` | Items awaiting verification |
| `POST` | `/api/verifications/:progressId/verify` | JWT | `FACULTY_MENTOR` | Sign off item |
| `GET` | `/api/placement-eligibility/:studentId` | JWT | Scoped | Eligibility status |
| `POST` | `/api/placement-eligibility/:studentId/recalculate` | JWT | Admin | Force recalculation |
| `GET` | `/api/placement-eligibility/report` | JWT | `PLACEMENT_COORDINATOR` | College-wide eligibility report |

### 5.7 Business Rules

| Rule | Description |
|---|---|
| Credit floor | Student credit balance cannot go below 0 |
| Credit ceiling | Determined by `credit_policies.maximum_balance` for the student's scope |
| Mentor verification scope | A mentor can only verify checklist items for students in their `student_mentor_assignments` |
| CSV import format | `title,description,target_track,is_mandatory` — header row required |
| Eligibility recalculation | Triggered automatically: after mentor verification, after assessment completion event |
| Mandatory items | All `is_mandatory = true` items must be mentor-verified for eligibility = true |
| Optional items | Counted toward eligibility_score but not blocking |
| Credit refund | If attempt is abandoned within a grace period, a REFUND transaction is created |

### 5.8 Authorization Requirements

| Operation | Allowed Roles |
|---|---|
| View own credit balance | `STUDENT` (self) |
| View student credit balance | `FACULTY_MENTOR` (mentees), `PROGRAM_ADMIN`, `PLACEMENT_COORDINATOR` |
| Admin credit adjustment | `PLACEMENT_COORDINATOR` only |
| Create / edit checklist items | `PLACEMENT_COORDINATOR` only |
| Import CSV | `PLACEMENT_COORDINATOR` only |
| Toggle checklist item | `STUDENT` (self only) |
| Verify checklist item | `FACULTY_MENTOR` (own mentees only) |
| View placement eligibility | `STUDENT` (self), `FACULTY_MENTOR` (mentees), Admin roles |
| Force eligibility recalculation | `PLACEMENT_COORDINATOR` / `PROGRAM_ADMIN` |

### 5.9 Dependencies

| Dependency | From | Description |
|---|---|---|
| Member 1 | Student creation event | `credit_accounts` row must be created when a new student is registered. Member 4 listens for `USER_REGISTERED` outbox event |
| Member 1 | Mentor assignment | Verification endpoint requires `student_mentor_assignments` to validate mentor scope |
| Member 2 | Assessment attempt start | Member 2 calls `CreditService.consume()` before creating an attempt |
| Member 2 | Attempt completion event | Member 4 listens for `ATTEMPT_COMPLETED` outbox event to trigger credit earning and eligibility recalculation |
| Member 3 | Performance profile | Eligibility calculation reads `performance_profiles.overall_score` |

---

## 6. Cross-Cutting Backend Responsibilities

These concerns apply to **all four members equally**. A shared architecture decision must be made at project kickoff so every module follows the same conventions.

### 6.1 Project Architecture

- **Backend framework:** Node.js + Express + TypeScript (existing in `backend/`)
- **Module pattern:** Domain modules under `src/modules/<module-name>/` (see Section 1.2)
- **No business logic in controllers** — controllers only validate input, call service, return response
- **ORM / Query layer:** To be decided — see Open Questions (raw `pg` vs. Drizzle ORM vs. Prisma)

### 6.2 API Naming Conventions

- **Base path:** `/api/`
- **Resource naming:** plural, kebab-case nouns (`/assessment-attempts`, `/credit-accounts`)
- **Action endpoints:** `POST /<resource>/:id/<verb>` for state transitions (e.g., `/attempts/:id/abandon`)
- **Filtering:** via query string (`?status=ACTIVE&programId=<uuid>`)
- **Pagination:** `?page=1&limit=20` — response includes `{ data: [], total, page, limit, totalPages }`
- **Sorting:** `?sortBy=created_at&sortOrder=desc`

### 6.3 HTTP Status Codes

| Code | When to use |
|---|---|
| `200` | Successful GET / PUT |
| `201` | Successful POST (resource created) |
| `204` | Successful DELETE (no body) |
| `400` | Validation error (malformed request) |
| `401` | Missing or invalid JWT |
| `402` | Insufficient credits |
| `403` | Authenticated but unauthorized (scope/role mismatch) |
| `404` | Resource not found |
| `409` | Conflict (duplicate, already in progress) |
| `422` | Business rule violation |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error |
| `503` | Dependent service unavailable (AI service down) |

### 6.4 Error Response Format

All error responses must conform to:

```json
{
  "error": {
    "code": "ATTEMPT_IN_PROGRESS",
    "message": "A human-readable error description",
    "details": {}
  }
}
```

Never expose stack traces, SQL error text, or internal service URLs in error responses.

### 6.5 Authentication Middleware

Defined by Member 1 in `src/middleware/authenticate.ts`. All other members import and use this middleware — they do not implement their own token parsing.

### 6.6 Authorization Middleware

Defined by Member 1 in `src/middleware/authorize.ts`. Usage pattern for all modules:

```typescript
router.get('/resource', authenticate, authorize(['PROGRAM_ADMIN', 'PLACEMENT_COORDINATOR']), handler);
```

### 6.7 Database Transaction Handling

- Use database-level transactions for all multi-table writes
- If using raw `pg`: wrap in `BEGIN / COMMIT / ROLLBACK` blocks
- No partial writes — either all inserts succeed or all roll back
- Credit balance updates MUST be wrapped in transactions

### 6.8 Validation

- All request bodies validated before reaching service layer
- Recommended library: `zod` (already TypeScript-native)
- Validation schemas live in `<module>.types.ts`
- Unknown properties should be stripped (not cause errors)
- Required fields missing → 400 with field-level error details

### 6.9 Logging

- Use a structured logger (e.g., `pino` or `winston`) — not `console.log`
- Log format: `{ timestamp, level, requestId, userId, module, message, meta }`
- Log levels: `debug` (dev only), `info` (request in/out), `warn` (business rule violations), `error` (unexpected failures)
- Never log PII (passwords, full JWT tokens, student personal data beyond IDs) in production

### 6.10 Audit Logging

The `audit_logs` table is **shared infrastructure** maintained by Member 1's architecture decisions but written to by all modules.

| Column | Description |
|---|---|
| `id` | UUID |
| `actor_user_id` | The user who performed the action |
| `action` | e.g., `MENTOR_VERIFIED_TASK`, `TRAINER_REVOKED`, `ATTEMPT_STARTED` |
| `resource_type` | e.g., `checklist_progress`, `trainer_assignment` |
| `resource_id` | UUID of the affected record |
| `metadata` | JSONB — before/after values, request context |
| `created_at` | Timestamp |

**Responsibility:** Each module writes audit log entries for significant state changes within its domain. A shared `AuditService` utility (built by Member 1) provides a single `audit(event)` method all modules call.

### 6.11 Outbox / Event Handling

The `outbox_events` table enables reliable async communication between modules without direct service coupling.

| Column | Description |
|---|---|
| `id` | UUID |
| `event_type` | e.g., `ATTEMPT_COMPLETED`, `USER_REGISTERED`, `MENTOR_VERIFIED` |
| `payload` | JSONB — event-specific data |
| `status` | `PENDING` / `PROCESSED` / `FAILED` |
| `created_at` | Timestamp |
| `processed_at` | Timestamp |

**Pattern:**
- Events are inserted into `outbox_events` within the same database transaction as the state change
- A background worker polls for `PENDING` events and dispatches to handlers
- **Responsibility:** Member 1 builds the outbox worker infrastructure; each module registers its event handlers

**Key events and consumers:**

| Event | Producer | Consumer |
|---|---|---|
| `USER_REGISTERED` | Member 1 | Member 4 (create credit account) |
| `ATTEMPT_COMPLETED` | Member 2 | Member 3 (update performance), Member 4 (earn credits, recalculate eligibility) |
| `CHECKLIST_ITEM_TOGGLED` | Member 4 | Notification service (To be decided) |
| `MENTOR_VERIFIED` | Member 4 | Member 4 internal (recalculate eligibility) |

### 6.12 Idempotency

- All `POST` endpoints that create or trigger operations should support an `Idempotency-Key` header
- Server stores processed idempotency keys and returns cached response for duplicates
- TTL for idempotency keys: 24 hours
- Member 2 especially must enforce idempotency for `submit-response` and `start-attempt`

### 6.13 Pagination

All list endpoints must return paginated responses:

```json
{
  "data": [...],
  "pagination": {
    "total": 2500,
    "page": 1,
    "limit": 20,
    "totalPages": 125
  }
}
```

Default limit: 20. Maximum limit: 100.

### 6.14 API Documentation

- Use **OpenAPI 3.0** (`swagger-jsdoc` or equivalent)
- Every endpoint must have: summary, description, request schema, response schemas, error schemas, auth requirements
- Auto-generated docs exposed at `/api/docs` (Swagger UI)
- Each member documents their own routes; shared Swagger config owned by Member 1

### 6.15 Environment Variables

All environment variables centralized in `backend/src/config/env.ts`. Members must not hardcode values. Variables to add as needed:

```env
PORT=5000
DATABASE_URL=postgresql://...
JWT_SECRET=...
JWT_EXPIRES_IN=7d
AI_SERVICE_URL=http://localhost:8000
MAX_TAB_SWITCH_LIMIT=4
MAX_REPLAY_COUNT=2
DEFAULT_CREDIT_BALANCE=50
BCRYPT_SALT_ROUNDS=10
LOG_LEVEL=info
NODE_ENV=development
```

### 6.16 Testing

- **Unit tests:** Each service method must have unit tests with mocked repositories
- **Integration tests:** Each route must have an integration test hitting a test database
- **Test database:** Separate PostgreSQL instance; schema migrations run fresh before each test suite
- **Framework:** Jest + Supertest (existing in `backend/tests/`)
- **Coverage target:** Minimum 80% line coverage per module
- **Test file location:** `backend/tests/<module>.test.ts`

### 6.17 Security

- Parameterized queries or ORM — no string concatenation in SQL
- `helmet` middleware for security headers
- Rate limiting: `express-rate-limit` on all public auth endpoints (max 10 req/min per IP)
- CORS: restrict to known origins (configured in `index.ts`)
- Input size limits: `express.json({ limit: '1mb' })`
- File uploads (resume): validate MIME type (`application/pdf`, `application/msword`), max 5MB

### 6.18 Git Branch / PR Conventions

| Convention | Rule |
|---|---|
| Branch naming | `feature/M1-auth-jwt`, `fix/M2-session-state`, `chore/M3-rag-refactor` |
| PR size | Aim for < 400 lines changed per PR |
| PR reviews | Minimum 1 approval from another member |
| Commit style | Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:` |
| PR description | Must include: what changed, how to test, dependencies on other members' work |

---

## 7. Team Dependency Map

### 7.1 Dependency Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                    MEMBER 1: Auth & Organization                        │
│  (JWT middleware · RBAC · Users · Students · Org Hierarchy)            │
│                                                                          │
│  Provides to ALL members:                                               │
│    ✓ authenticate middleware (req.user)                                 │
│    ✓ authorize middleware (role + scope guard)                          │
│    ✓ trainerTenureGuard middleware                                      │
│    ✓ student entity and studentId resolution                            │
│    ✓ AuditService utility                                               │
│    ✓ Outbox worker infrastructure                                       │
└───────────────────────┬──────────────────────────────────────────────┘
                        │ Must be complete before others can build
                        │ protected routes or reference studentId
          ┌─────────────┼────────────────┐
          │             │                │
          ▼             ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐
│  MEMBER 2    │  │  MEMBER 3    │  │  MEMBER 4                │
│  Assessment  │  │  Performance │  │  Credits & Checklist     │
│  & AI Eval   │  │  & Knowledge │  │  & Placement             │
└──────┬───────┘  └──────┬───────┘  └──────────┬───────────────┘
       │                  │                      │
       │  ATTEMPT_COMPLETED (outbox event)       │
       │──────────────────►  PerformanceService  │
       │                  │  updates profile     │
       │                  │  and snapshots       │
       │                  │                      │
       │  ATTEMPT_COMPLETED (outbox event)       │
       │──────────────────────────────────────►  │
       │                  │    CreditService.earn │
       │                  │    EligibilityService │
       │                  │    recalculate        │
       │                  │                      │
       │                  │  performance_profiles │
       │                  │──────────────────────►
       │                  │  (read-only for       │
       │                  │   eligibility calc)   │
       │                  │                      │
       ◄──────────────────│  knowledge/RAG        │
       AI service uses    │  (Member 2's AI service│
       knowledge chunks   │  calls /knowledge/search)
```

### 7.2 Data Dependencies Table

| Consuming Module | Produced By | Data Needed | When |
|---|---|---|---|
| Member 2 (Assessment) | Member 1 | `students.id`, `req.user`, `role_assignments` | Before attempt start |
| Member 2 (Assessment) | Member 1 | `student_mentor_assignments` (for report access scope) | On GET /reports |
| Member 2 (Assessment) | Member 3 | `knowledge_chunks` (for AI question generation) | During question generation in AI service |
| Member 2 (Assessment) | Member 4 | `credit_accounts.balance` | Before attempt creation |
| Member 3 (Performance) | Member 1 | `students.id` (for profile creation) | On student registration |
| Member 3 (Performance) | Member 2 | `assessment_reports`, `response_evaluations`, `questions` | On `ATTEMPT_COMPLETED` event |
| Member 4 (Credits) | Member 1 | `students.id` (for account creation) | On student registration |
| Member 4 (Credits) | Member 1 | `student_mentor_assignments` (for mentor verification scope) | On POST /verifications |
| Member 4 (Eligibility) | Member 2 | `ATTEMPT_COMPLETED` outbox event | After each assessment |
| Member 4 (Eligibility) | Member 3 | `performance_profiles.overall_score` | On eligibility recalculation |

---

## 8. API Ownership Table

| API Group | Responsible Member | Main Tables | Depends On |
|---|---|---|---|
| `/api/auth` | **Member 1** | `users` | — |
| `/api/users` | **Member 1** | `users` | — |
| `/api/institutions` | **Member 1** | `institutions` | — |
| `/api/departments` | **Member 1** | `departments` | — |
| `/api/programs` | **Member 1** | `programs` | — |
| `/api/batches` | **Member 1** | `batches` | — |
| `/api/subdivisions` | **Member 1** | `subdivisions` | — |
| `/api/roles` | **Member 1** | `roles`, `permissions`, `role_permissions`, `role_assignments` | — |
| `/api/students` | **Member 1** | `students` | Member 1 auth |
| `/api/mentor-assignments` | **Member 1** | `student_mentor_assignments` | Member 1 students |
| `/api/trainer-assignments` | **Member 1** | `trainer_subdivision_assignments` | Member 1 users, subdivisions |
| `/api/assessments` | **Member 2** | `assessments`, `assessment_components` | Member 1 auth |
| `/api/question-bank` | **Member 2** | `question_bank_items`, `question_bank_item_skills` | Member 1 auth |
| `/api/attempts` | **Member 2** | `assessment_attempts` | Member 1, Member 4 (credits) |
| `/api/sessions` | **Member 2** | `assessment_sessions` | Member 2 attempts |
| `/api/questions` | **Member 2** | `questions` | Member 2 sessions |
| `/api/responses` | **Member 2** | `responses`, `ai_runs`, `response_evaluations` | Member 2 questions |
| `/api/reports` | **Member 2** | `assessment_reports` | Member 2 responses |
| `/api/performance` | **Member 3** | `performance_profiles`, `performance_snapshots` | Member 1, Member 2 |
| `/api/skills` | **Member 3** | `skills`, `student_skills`, `skill_performances` | Member 1 |
| `/api/learning-plans` | **Member 3** | `learning_plans` | Member 3 performance |
| `/api/recommendations` | **Member 3** | `learning_recommendations` | Member 3 learning-plans |
| `/api/knowledge` | **Member 3** | `knowledge_documents`, `knowledge_chunks` | Member 1 auth |
| `/api/agents` | **Member 3** | `agent_definitions`, `agent_runs`, `agent_steps` | Member 1 auth |
| `/api/listening-stories` | **Member 3** | `listening_stories` | Member 1 auth |
| `/api/credits` | **Member 4** | `credit_accounts`, `credit_transactions` | Member 1 students |
| `/api/credit-policies` | **Member 4** | `credit_policies` | Member 1 auth |
| `/api/checklist` | **Member 4** | `checklist_items`, `checklist_progress` | Member 1 auth |
| `/api/verifications` | **Member 4** | `mentor_verifications` | Member 1 assignments |
| `/api/placement-eligibility` | **Member 4** | `placement_eligibility` | Member 3 performance, Member 2 attempts |

---

## 9. Database Ownership Matrix

Every table has exactly one primary owner. Cross-cutting infrastructure tables (`audit_logs`, `outbox_events`) are marked as Shared Infrastructure.

| Table | Primary Owner | Schema | Notes |
|---|---|---|---|
| `institutions` | **Member 1** | `org` | |
| `departments` | **Member 1** | `org` | |
| `programs` | **Member 1** | `org` | |
| `batches` | **Member 1** | `org` | |
| `subdivisions` | **Member 1** | `org` | |
| `users` | **Member 1** | `identity` | |
| `roles` | **Member 1** | `identity` | |
| `permissions` | **Member 1** | `identity` | |
| `role_permissions` | **Member 1** | `identity` | |
| `role_assignments` | **Member 1** | `identity` | |
| `students` | **Member 1** | `org` | |
| `student_mentor_assignments` | **Member 1** | `org` | |
| `trainer_subdivision_assignments` | **Member 1** | `org` | |
| `skills` | **Member 3** | `performance` | Skill taxonomy shared; Member 2 reads skills for question tagging |
| `student_skills` | **Member 3** | `performance` | |
| `resumes` | **Member 1** | `org` | Resume metadata; Member 2/3 read for AI grounding |
| `assessments` | **Member 2** | `assessment` | |
| `assessment_components` | **Member 2** | `assessment` | |
| `assessment_attempts` | **Member 2** | `assessment` | |
| `assessment_sessions` | **Member 2** | `session` | |
| `question_bank_items` | **Member 2** | `session` | |
| `question_bank_item_skills` | **Member 2** | `session` | |
| `questions` | **Member 2** | `session` | |
| `responses` | **Member 2** | `evaluation` | |
| `ai_runs` | **Member 2** | `evaluation` | |
| `response_evaluations` | **Member 2** | `evaluation` | |
| `assessment_reports` | **Member 2** | `performance` | Member 3 reads; Member 2 writes |
| `performance_profiles` | **Member 3** | `performance` | |
| `performance_snapshots` | **Member 3** | `performance` | |
| `skill_performances` | **Member 3** | `performance` | |
| `learning_plans` | **Member 3** | `performance` | |
| `learning_recommendations` | **Member 3** | `performance` | |
| `listening_stories` | **Member 3** | `performance` | |
| `knowledge_documents` | **Member 3** | `knowledge` | |
| `knowledge_chunks` | **Member 3** | `knowledge` | |
| `agent_definitions` | **Member 3** | `agent` | |
| `agent_runs` | **Member 3** | `agent` | |
| `agent_steps` | **Member 3** | `agent` | |
| `credit_accounts` | **Member 4** | `credit` | |
| `credit_transactions` | **Member 4** | `credit` | |
| `credit_policies` | **Member 4** | `credit` | |
| `checklist_items` | **Member 4** | `placement` | |
| `checklist_progress` | **Member 4** | `placement` | |
| `mentor_verifications` | **Member 4** | `placement` | |
| `placement_eligibility` | **Member 4** | `placement` | |
| `audit_logs` | **Shared Infrastructure** | `system` | All members write; Member 1 builds AuditService utility |
| `outbox_events` | **Shared Infrastructure** | `system` | All members write events; Member 1 builds outbox worker |

---

## 10. Development Order / Phase Plan

### Phase 1 — Foundation (All Parallel after kickoff)

**Goal:** Shared infrastructure is ready; all members can begin their own module work.

| Member | Work |
|---|---|
| **Member 1** | DB migration scripts for all schemas. `users`, `roles`, `permissions`, `role_assignments`, `institutions`, `departments`, `programs`, `batches`, `subdivisions`, `students`, `student_mentor_assignments`, `trainer_subdivision_assignments`. Implement `authenticate` and `authorize` middleware. Implement `AuditService` and outbox worker skeleton. |
| **Member 2** | Design and document assessment session state machine. Define AI service request/response contracts (`ai-client.ts` interface). Align with AI service owner on FastAPI endpoint specs. |
| **Member 3** | Set up pgvector extension. Create `knowledge`, `agent` schema migration scripts. Define `agent_definitions` seed data for the four platform agents. |
| **Member 4** | Create `credit`, `placement` schema migration scripts. Define default `credit_policies` seed data. |

**Dependencies:** None between members at this phase.  
**Integration point:** All DB schemas must be finalized before Phase 2.

---

### Phase 2 — Core Modules (Mostly Parallel)

**Goal:** Auth works end-to-end. Students can be registered. Credits initialized.

| Member | Work |
|---|---|
| **Member 1** | Auth endpoints: register, login, `/auth/me`. User management CRUD. Student profile endpoints. Mentor assignment endpoints. Trainer assignment + tenure guard. Organization hierarchy endpoints. |
| **Member 2** | Assessment + assessment_component CRUD. Question bank CRUD. Attempt creation service (credit validation hook — use stub until Member 4 is ready). |
| **Member 3** | `skills` master CRUD. Knowledge document upload + chunking + embedding pipeline. RAG semantic search endpoint. Listening story CRUD. |
| **Member 4** | Credit account creation (triggered on `USER_REGISTERED` event from Member 1). Credit policy CRUD. Checklist item CRUD. CSV import endpoint. |

**Dependencies:**  
- Member 2, 3, 4 depend on Member 1's auth middleware being testable.  
- Member 4 depends on Member 1's `USER_REGISTERED` outbox event firing on registration.

**Integration point:** Member 1 must deliver working auth by end of Phase 2.

---

### Phase 3 — Assessment & AI Integration

**Goal:** A student can start and complete a mock interview with real AI evaluation.

| Member | Work |
|---|---|
| **Member 1** | Resume upload endpoint. Trainer tenure access guard. |
| **Member 2** | Session lifecycle (start, proctor-event, submit-response, complete). AI client integration. Single-pass evaluation pipeline. Proctoring telemetry logic. Report generation. |
| **Member 3** | Agent run / step recording infrastructure. Listening session integration (listening story playback state). |
| **Member 4** | Credit consumption on attempt start (integrated with Member 2). Credit earning on attempt completion (via `ATTEMPT_COMPLETED` event). |

**Dependencies:**  
- Member 2 depends on Member 4's `CreditService.consume()` being callable.  
- Member 3 `agent_runs` recording depends on Member 2 providing agent execution hooks.

**Integration point:** Full mock interview flow test (student registers → consumes credit → completes interview → report generated → performance event fired).

---

### Phase 4 — Performance & Learning

**Goal:** Assessment results propagate into student performance profiles and learning plans.

| Member | Work |
|---|---|
| **Member 2** | Finalize `ATTEMPT_COMPLETED` outbox event with full payload. |
| **Member 3** | `PerformanceService.onAttemptCompleted()` handler. Snapshot creation. Skill performance aggregation. Performance profile update. Learning plan generation. Learning recommendations. |
| **Member 4** | Integrate `performance_profiles.overall_score` into `PlacementEligibilityService`. |

**Dependencies:**  
- Member 3 depends on `ATTEMPT_COMPLETED` event being reliable from Member 2.  
- Member 4 eligibility calculation depends on Member 3's performance profile being updated.

**Integration point:** After completing an assessment, student's performance dashboard reflects updated scores.

---

### Phase 5 — Readiness Checklist & Placement Eligibility

**Goal:** Mentors can verify checklist items. Eligibility is automatically determined.

| Member | Work |
|---|---|
| **Member 1** | Verify mentor-to-mentee scoping is enforced at middleware level. |
| **Member 4** | Checklist progress toggle. Mentor verification endpoint. `MENTOR_VERIFIED` outbox event. Placement eligibility calculation engine. College-wide eligibility report endpoint. |

**Dependencies:**  
- Member 4 depends on Member 1's mentor assignment scope guard being correct.  
- Eligibility calculation depends on Member 3's performance profile (Phase 4 complete).

---

### Phase 6 — Integration & Admin Dashboards

**Goal:** All admin portals functional. Placement Coordinator can view college-wide data.

| Member | Work |
|---|---|
| **Member 1** | College-wide user roster with filtering. Bulk operations. |
| **Member 2** | Admin assignment of mock interviews to students/cohorts. Report visibility for admins/mentors. |
| **Member 3** | Aggregate performance dashboards per program/subdivision. |
| **Member 4** | Placement eligibility dashboard per cohort/department. CSV export. |

**Integration point:** All five role portals are functional end-to-end.

---

### Phase 7 — Testing, Security & Hardening

**Goal:** Platform is production-ready for college pilot.

| Member | Work |
|---|---|
| **All** | Unit tests for all service methods. Integration tests for all routes. OpenAPI documentation complete. |
| **Member 1** | Security audit: auth flows, scope enforcement, rate limiting, CORS config. |
| **Member 2** | Load test assessment pipeline. Idempotency verification. AI service failure fallback. |
| **Member 3** | RAG retrieval quality check. Agent failure recovery testing. |
| **Member 4** | Credit ledger reconciliation tests. Eligibility edge case coverage. |

---

## 11. Definition of Done

### 11.1 Member 1 (Auth & Organization)

- [ ] All database migration scripts for `identity` and `org` schemas are version-controlled and repeatable
- [ ] `authenticate` middleware tested with valid token, expired token, missing token
- [ ] `authorize` middleware tested with correct role, wrong role, scoped access
- [ ] `trainerTenureGuard` tested with active tenure, expired tenure, revoked access
- [ ] Registration and login endpoints return correct JWT structure
- [ ] Password hashing verified (bcrypt salt rounds = 10)
- [ ] Student profile CRUD endpoints complete with validation
- [ ] Mentor assignment enforces ~25-student cap
- [ ] Trainer onboard and revoke endpoints functional
- [ ] `AuditService` utility available and documented for other members
- [ ] Outbox worker processes events reliably with retry
- [ ] `USER_REGISTERED` event fires on successful student registration
- [ ] Unit tests for all services
- [ ] Integration tests for all routes
- [ ] OpenAPI documentation for all owned routes
- [ ] PR reviewed by at least one other team member
- [ ] No SQL injection vulnerabilities (parameterized queries only)

### 11.2 Member 2 (Assessment & AI Evaluation)

- [ ] All database migration scripts for `assessment`, `session`, `evaluation` schemas complete
- [ ] Assessment and assessment_component CRUD complete
- [ ] Question bank CRUD with skill tagging complete
- [ ] Attempt creation enforces credit check before creation
- [ ] Attempt idempotency key enforced
- [ ] Session state machine transitions validated in tests
- [ ] Proctoring telemetry counters increment correctly
- [ ] Proctoring flagging rules (1–2 / 3–4 / ≥5 switches) work correctly
- [ ] AI client sends correct request to FastAPI service and handles response
- [ ] `ai_runs` record created for every LLM call
- [ ] `response_evaluations` record written after each AI evaluation
- [ ] Adaptive difficulty engine adjusts correctly based on score
- [ ] Report generated correctly (weighted formula verified with unit tests)
- [ ] `ATTEMPT_COMPLETED` outbox event fires with correct payload
- [ ] Listening session replay counter enforced at ≤ 2
- [ ] AI service unavailable → graceful fallback (PENDING evaluation)
- [ ] Unit tests for all services including scoring formula
- [ ] Integration tests for full interview flow
- [ ] OpenAPI documentation for all owned routes
- [ ] PR reviewed by at least one other team member

### 11.3 Member 3 (Performance, Learning, Knowledge & Agents)

- [ ] All database migration scripts for `performance`, `knowledge`, `agent` schemas complete
- [ ] Skills master CRUD with pagination complete
- [ ] pgvector extension enabled and `knowledge_chunks.embedding` column functional
- [ ] Document ingestion → chunking → embedding pipeline works end-to-end
- [ ] Semantic search returns ranked chunks via pgvector cosine similarity
- [ ] Performance profile created on student registration
- [ ] `onAttemptCompleted` handler correctly aggregates scores from `response_evaluations`
- [ ] `PerformanceSnapshot` is appended (never mutated)
- [ ] `PerformanceProfile` reflects latest scores after each snapshot
- [ ] Trend calculation (IMPROVING / STABLE / DECLINING) verified in unit tests
- [ ] Learning plan generated from weak skill_performances
- [ ] Learning recommendations scoped to weak skills
- [ ] Agent run / step recording works for all four defined agents
- [ ] Agent failure state recorded correctly
- [ ] Listening story CRUD complete
- [ ] Unit tests for all services
- [ ] Integration tests for performance aggregation flow
- [ ] OpenAPI documentation for all owned routes
- [ ] PR reviewed by at least one other team member

### 11.4 Member 4 (Credits, Checklist & Placement)

- [ ] All database migration scripts for `credit` and `placement` schemas complete
- [ ] Default `credit_policies` seed data present
- [ ] `credit_accounts` auto-created on `USER_REGISTERED` outbox event
- [ ] `CreditService.consume()` enforces balance floor (no negative balance)
- [ ] Credit balance updated atomically within database transaction
- [ ] `credit_transactions` is append-only (no updates, no deletes)
- [ ] Credit earning fires after `ATTEMPT_COMPLETED` event
- [ ] Credit balance enforces maximum_balance from policy
- [ ] Checklist item CRUD with CSV import complete
- [ ] Student checklist progress toggle works correctly
- [ ] Mentor verification scoped to `student_mentor_assignments` (no cross-mentee verification)
- [ ] `MENTOR_VERIFIED` outbox event fires correctly
- [ ] Eligibility recalculation triggered by verification and attempt completion events
- [ ] Eligibility correctly identifies blocking mandatory items
- [ ] College-wide eligibility report endpoint functional
- [ ] Unit tests for credit formula and eligibility rules
- [ ] Integration tests for checklist → verification → eligibility flow
- [ ] OpenAPI documentation for all owned routes
- [ ] PR reviewed by at least one other team member

---

## 12. Summary Tables

### 12.1 Four-Member Responsibility Summary

| Member | Domain | Primary Tables | Core Deliverables |
|---|---|---|---|
| **1** | Auth, Authorization, Organization | `users`, `roles`, `permissions`, `role_permissions`, `role_assignments`, `institutions`, `departments`, `programs`, `batches`, `subdivisions`, `students`, `student_mentor_assignments`, `trainer_subdivision_assignments` | JWT auth, RBAC middleware, org hierarchy, student/mentor/trainer management |
| **2** | Assessment, Interview, AI Evaluation | `assessments`, `assessment_components`, `assessment_attempts`, `assessment_sessions`, `question_bank_items`, `question_bank_item_skills`, `questions`, `responses`, `ai_runs`, `response_evaluations`, `assessment_reports` | Full assessment pipeline, session orchestration, AI evaluation integration, proctoring, reports |
| **3** | Performance, Learning, Knowledge, Agents | `performance_profiles`, `performance_snapshots`, `skill_performances`, `learning_plans`, `learning_recommendations`, `listening_stories`, `knowledge_documents`, `knowledge_chunks`, `agent_definitions`, `agent_runs`, `agent_steps` | Performance tracking, learning plans, RAG pipeline, agent system |
| **4** | Credits, Readiness Checklist, Placement | `credit_accounts`, `credit_transactions`, `credit_policies`, `checklist_items`, `checklist_progress`, `mentor_verifications`, `placement_eligibility` | Credit economy, checklist verification, placement eligibility |
| **All** | Cross-Cutting | `audit_logs`, `outbox_events` | Shared infra: audit trail, event bus, error format, pagination, auth middleware |

### 12.2 Complete Database Ownership Matrix

See Section 9 for the full per-table ownership matrix.

### 12.3 API Ownership Matrix

See Section 8 for the full per-route-group ownership matrix.

### 12.4 Dependency Matrix

| Module | Depends On | Type of Dependency |
|---|---|---|
| Member 2 → Member 1 | Auth middleware, student lookup | Hard (cannot function without) |
| Member 2 → Member 4 | Credit check before attempt | Hard (blocks attempt creation) |
| Member 3 → Member 1 | Student ID on registration | Hard (profile creation) |
| Member 3 → Member 2 | `ATTEMPT_COMPLETED` event + report data | Soft (event-driven, async) |
| Member 4 → Member 1 | `USER_REGISTERED` event, mentor scope guard | Hard (account creation) |
| Member 4 → Member 2 | `ATTEMPT_COMPLETED` event | Soft (event-driven, async) |
| Member 4 → Member 3 | `performance_profiles.overall_score` (read-only) | Soft (eligibility calculation) |

### 12.5 Recommended Development Sequence

| Phase | Primary Goal | Key Milestone |
|---|---|---|
| Phase 1 | DB schemas + shared infra | All migrations committed, outbox worker skeleton ready |
| Phase 2 | Auth + core module scaffolds | Student can register and login; credit account auto-created |
| Phase 3 | Assessment + AI | Student completes a full mock interview with AI evaluation |
| Phase 4 | Performance + Learning | Performance profile updated after assessment; learning plan visible |
| Phase 5 | Checklist + Eligibility | Mentor verifies task; eligibility auto-recalculates |
| Phase 6 | Admin dashboards + Integration | All five role portals functional end-to-end |
| Phase 7 | Testing + Hardening | Full test coverage; security review; API docs complete |

### 12.6 Integration Checklist

- [ ] Auth token structure agreed upon by all four members before Phase 2
- [ ] `req.user` TypeScript interface defined and shared before protected routes are built
- [ ] `ai-client.ts` request/response contracts agreed with AI service before Phase 3
- [ ] `ATTEMPT_COMPLETED` outbox event payload schema agreed between Member 2 and Members 3, 4
- [ ] `USER_REGISTERED` outbox event payload schema agreed between Member 1 and Member 4
- [ ] `CreditService.consume()` callable interface agreed between Members 2 and 4 before Phase 3
- [ ] Error response format agreed and documented before Phase 2
- [ ] Pagination response format agreed and documented before Phase 2
- [ ] Database transaction strategy agreed (raw pg vs ORM) before Phase 1
- [ ] OpenAPI base document structure set up by Member 1 before Phase 2

---

## 13. Open Questions & Decisions

The following items need team discussion and decision before or during Phase 1. Each is marked with a suggested decision-maker.

| # | Question | Suggested Owner | Notes |
|---|---|---|---|
| OQ-01 | **ORM vs raw pg:** Use raw `pg` queries, Drizzle ORM, or Prisma? Current `backend/package.json` has no ORM installed. | All (Phase 1 kickoff) | Drizzle is TypeScript-native and lightweight; Prisma has better migrations tooling. Raw `pg` gives full control. |
| OQ-02 | **JWT refresh token:** Should the platform issue refresh tokens or rely on a single access token with a longer expiry? | Member 1 | Refresh tokens add security but complexity. Single-token with 7d expiry may be sufficient for a campus app. |
| OQ-03 | **Token blacklist/revocation:** How are JWTs invalidated on logout or trainer revocation? | Member 1 | Options: Redis blacklist, short expiry + rotation, or store token version in DB. |
| OQ-04 | **Outbox worker implementation:** Polling interval vs. LISTEN/NOTIFY (PostgreSQL pub/sub)? | Member 1 | `LISTEN/NOTIFY` is more efficient; polling is simpler. Either is acceptable for initial implementation. |
| OQ-05 | **Credit balance computation:** Is balance always denormalized in `credit_accounts.balance` (write-through), or always computed from `credit_transactions`? | Member 4 | Document recommends denormalized balance with append-only transaction log. Needs team agreement to avoid inconsistency. |
| OQ-06 | **Performance eligibility threshold:** What is the minimum `overall_score` required for placement eligibility? | Member 4 + Product Owner | Suggested: configurable via `credit_policies` or a separate config table. Not hardcoded. |
| OQ-07 | **Skills taxonomy source:** Is the skills master list predefined (seeded at startup) or fully admin-managed at runtime? | Member 3 | Seeding a predefined list matching the 21 PEP domains + HOPE track is recommended; admin can extend. |
| OQ-08 | **Resume storage:** Where are uploaded resume files stored — local disk, S3-compatible bucket? Current `.env.example` has no storage config. | Member 1 | `resume_url` column exists in `students`; storage provider is To be decided. S3 (or MinIO for local dev) is recommended. |
| OQ-09 | **Listening story audio:** Is the listening comprehension audio pre-recorded (stored files) or AI-generated TTS on the fly? | Member 3 + AI Service | Pre-recorded simplifies backend; TTS adds dynamic content. Both need storage strategy. |
| OQ-10 | **Scope authorization granularity:** Does `authorize()` middleware handle subdivision-level scoping (trainer can only see their subdivision), or is this enforced at the service layer? | Member 1 | Recommend middleware handles role gate; service layer handles entity-level scoping (e.g., `WHERE subdivision_id = req.user.subdivisionId`). |
| OQ-11 | **Agent execution location:** Are the four platform agents executed purely in Python FastAPI, or does the Node.js backend orchestrate agent steps and call FastAPI for each LLM turn? | Members 2 + 3 | Current architecture implies FastAPI handles LLM calls; Node.js handles state. Needs explicit boundary agreement. |
| OQ-12 | **Database schema naming:** The `subdivisions` table in this document corresponds to `domains` in `DATA_MODEL.md` and `college.domains` in `PROJECT_BLUEPRINT.md`. Agree on final table name before migrations are written. | Member 1 (migration owner) | Recommendation: use `subdivisions` as specified in the database schema for this document, and note the alias in code comments. |
| OQ-13 | **Notification system:** Are there any real-time notifications (e.g., mentor notified when student marks a checklist item)? If so, WebSocket or polling? | Member 4 + Member 1 | Not in current scope. Mark as future roadmap item unless explicitly required for Phase 1. |
| OQ-14 | **`institutions` table:** The platform is described as single-institution. Should `institutions` be a single read-only row or a full CRUD entity? | Member 1 | Single-row seeded at startup is sufficient. Full CRUD adds unnecessary complexity for single-college deployment. |
| OQ-15 | **Student `resumes` table ownership:** The `resumes` table is in `DATA_MODEL.md` under `org` schema but is used heavily by Member 2 (AI grounding) and Member 3 (RAG). Who owns the table? | All | Recommendation: **Member 1** owns the table and resume upload endpoint; Member 2 and Member 3 have read-only access via service APIs. |

---

*End of Backend Team Module Allocation Document*

*This document is a planning reference. It does not constitute implementation. All API contracts, table schemas, and service interfaces are subject to change during development. Update this document when significant decisions are made so it remains the team's authoritative planning reference.*
