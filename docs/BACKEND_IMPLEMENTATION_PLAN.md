# Backend Implementation Plan
# AI-Powered Communication Readiness Platform (College Edition)

> **Document Type:** Architecture Review + Actionable Implementation Guide  
> **Audience:** 4-person student development team  
> **Status:** Pre-implementation — no code written yet  
> **Prerequisite Reading:** `docs/BACKEND_TEAM_MODULE_ALLOCATION.md`  
> **Decision Status:** All open questions from the allocation document are resolved in Section 3 of this document

---

## Table of Contents

1. [Architecture Review Findings](#1-architecture-review-findings)
2. [Resolved Design Decisions](#2-resolved-design-decisions)
3. [Shared Contracts — Agree Before Writing Any Code](#3-shared-contracts--agree-before-writing-any-code)
4. [MVP Scope Split](#4-mvp-scope-split)
5. [Per-Member Implementation Cards](#5-per-member-implementation-cards)
6. [Exact Project Structure Creation Order](#6-exact-project-structure-creation-order)
7. [Database Migration Rules](#7-database-migration-rules)
8. [Git Branch Strategy](#8-git-branch-strategy)
9. [Dependency-Aware Parallel Implementation Order](#9-dependency-aware-parallel-implementation-order)
10. [Integration Checkpoints](#10-integration-checkpoints)
11. [Risk Register](#11-risk-register)

---

## 1. Architecture Review Findings

This section documents issues found in `BACKEND_TEAM_MODULE_ALLOCATION.md`. Every issue is categorized and the resolution is stated. These resolutions override the allocation document where they conflict.

---

### 1.1 Boundary / Overlap Problems

**ISSUE-01 — `assessment_reports` in the wrong schema**

The allocation document places `assessment_reports` in the `performance` schema but assigns ownership to Member 2. This is contradictory. A table must live in the schema matching its owning module.

> **Resolution:** `assessment_reports` lives in the `assessment` schema. Member 2 owns and writes it. Member 3 reads it via a cross-schema SELECT. Schema = `assessment.assessment_reports`.

---

**ISSUE-02 — `resumes` table has no clear owner**

The allocation document lists `resumes` as a note under Member 1 but does not assign it in Member 1's table list. `resumes` appears in the database specification under "Skills & Student Profile" alongside `skills` and `student_skills`. This creates ambiguity.

> **Resolution:** `resumes` is owned by **Member 1** (it is part of the student profile and is uploaded/stored by the student). It lives in the `org` schema. Member 2 and Member 3 may read `resumes.parsed_text` via SELECT. Neither may write to it.

---

**ISSUE-03 — `student_skills` is never populated**

The allocation document assigns `student_skills` to Member 3 but never describes when or how it is populated. There is no API endpoint that writes to it, and no event handler that creates rows.

> **Resolution:** `student_skills` is populated in two ways: (a) Member 1 populates it from resume parsing on `POST /api/students/:id/resume` by extracting skill names from `resumes.parsed_text`, and (b) Member 3 updates it when `skill_performances` change significantly. For MVP, skip `student_skills` table entirely — it is a denormalized view of data that can be derived from `skill_performances`. Mark as ADVANCED scope.

---

**ISSUE-04 — `question_bank_item_skills` FK crosses ownership boundary**

Member 2 owns `question_bank_item_skills`, which has a foreign key to `skills` (owned by Member 3). If Member 3 deletes or renames a skill, it can cascade into Member 2's data.

> **Resolution:** Add `ON DELETE RESTRICT` to the FK from `question_bank_item_skills.skill_id → skills.id`. Member 3 must never hard-delete a skill that is referenced by question bank items. Member 3's `SkillService` must check for references before soft-deletion.

---

**ISSUE-05 — Credit deduction method is ambiguous**

The allocation document says both "CreditService deducted via internal event" (in the flow diagram) and "Member 2 calls CreditService internally or via event" (in dependencies). These are two different patterns. The event-based path requires the outbox worker to be running; the direct call requires Member 4's service to be importable by Member 2.

> **Resolution:** Use a **direct synchronous internal service call** for MVP. Member 2's `AttemptService` imports and calls `CreditService.consume(studentId, amount, reason, referenceId)` directly. This is simpler than async events for a blocking pre-condition. The event-based approach is ADVANCED scope. The `CreditService` must be implemented by Member 4 before Member 2 wires it up, so use a stub during development (see Section 5.2).

---

**ISSUE-06 — `USER_REGISTERED` event has missing consumers**

The allocation document lists Member 4 as the only consumer of `USER_REGISTERED` (credit account creation). However, Member 3 also needs to create a `performance_profiles` row when a student registers. This consumer is missing.

> **Resolution:** Add Member 3 as a second consumer of `USER_REGISTERED`. When a new `STUDENT` registers: (a) Member 4 creates `credit_accounts`, (b) Member 3 creates `performance_profiles`. Both handlers must be idempotent in case of duplicate event delivery.

---

**ISSUE-07 — Member 3 has too much scope**

Member 3 owns 11 tables across 7 sub-modules (performance, skills, learning, recommendations, knowledge/RAG, agents, listening stories). This is significantly more than other members (Member 1: 13 tables, Member 2: 11 tables, Member 4: 7 tables) but Member 3's modules are higher complexity individually (pgvector, agent system, event consumption).

> **Resolution:** For MVP, reduce Member 3's scope by deferring the agent system tables and the full learning plan module (see Section 4 — MVP Scope Split). MVP for Member 3 is: performance profile aggregation + skill performances + basic skills CRUD + listening stories. Knowledge/RAG and agents are SHOULD HAVE / ADVANCED.

---

**ISSUE-08 — `listening_stories` in Member 3 but listening sessions in Member 2**

A listening session (Member 2) references a `listening_story_id` (Member 3). This read dependency is undocumented. Member 2 needs to fetch the story text/audio URL to serve the assessment.

> **Resolution:** Member 2 may SELECT from `listening_stories` (owned by Member 3) when starting a listening session. Member 2 should expose an internal helper: `listeningStoryRepo.findById(id)` which reads Member 3's table. This is a documented read-only cross-module dependency. Member 3 must create at least one seeded listening story before Member 2's listening session tests can pass.

---

**ISSUE-09 — Outbox pattern is over-engineered for MVP**

The allocation document describes a full database-backed outbox with a polling worker. For a student team's MVP, this adds infrastructure overhead (worker process, `PENDING/PROCESSED/FAILED` state machine, retry logic) before the core features work.

> **Resolution:** For MVP, use Node.js `EventEmitter` for in-process event dispatch. Replace the outbox table with an in-memory event bus (`src/shared/events/eventBus.ts`). The `outbox_events` table stays in the schema (for future use) but is not used in MVP. The event bus is fire-and-forget with error logging. See Section 3.8 for the exact event contract.

---

**ISSUE-10 — `permissions` and `role_permissions` tables add MVP complexity**

The allocation specifies a full RBAC permission system with `permissions` and `role_permissions` tables. For a platform with exactly 5 hardcoded roles, a permission table is unnecessary complexity for MVP. Each role's allowed actions are known at design time.

> **Resolution:** For MVP, roles are hardcoded string enums. The `authorize()` middleware checks `req.user.role` against an allowed roles array. The `permissions`, `role_permissions` tables are created in migration but not used in MVP code. Full RBAC is SHOULD HAVE scope.

---

**ISSUE-11 — `institutions` table is a single row with no MVP use**

For a single-college deployment, the `institutions` table will always have exactly one row. No feature depends on multi-institution logic.

> **Resolution:** Seed the single `institutions` row at startup. Expose `GET /api/institutions` as a read-only endpoint. No CREATE/UPDATE/DELETE. Skip institution management from MVP work.

---

### 1.2 Missing Relationships / FK Gaps

The following foreign key relationships were either missing or unclear in the allocation document. All must be defined in migrations before any application code is written.

| Relationship | FK Column | References | On Delete |
|---|---|---|---|
| `students.user_id` → `users.id` | `org.students` | `identity.users` | CASCADE |
| `students.program_id` → `programs.id` | `org.students` | `org.programs` | RESTRICT |
| `students.batch_id` → `batches.id` | `org.students` | `org.batches` | RESTRICT |
| `students.subdivision_id` → `subdivisions.id` | `org.students` | `org.subdivisions` | SET NULL |
| `student_mentor_assignments.mentor_user_id` → `users.id` | `org` | `identity.users` | RESTRICT |
| `trainer_subdivision_assignments.trainer_user_id` → `users.id` | `org` | `identity.users` | CASCADE |
| `trainer_subdivision_assignments.subdivision_id` → `subdivisions.id` | `org` | `org.subdivisions` | CASCADE |
| `resumes.student_id` → `students.id` | `org` | `org.students` | CASCADE |
| `assessment_attempts.student_id` → `students.id` | `assessment` | `org.students` | RESTRICT |
| `assessment_attempts.assessment_id` → `assessments.id` | `assessment` | `assessment.assessments` | RESTRICT |
| `assessment_sessions.attempt_id` → `assessment_attempts.id` | `session` | `assessment.assessment_attempts` | CASCADE |
| `questions.session_id` → `assessment_sessions.id` | `session` | `session.assessment_sessions` | CASCADE |
| `questions.bank_item_id` → `question_bank_items.id` | `session` | `session.question_bank_items` | SET NULL |
| `question_bank_item_skills.skill_id` → `skills.id` | `session` | `performance.skills` | **RESTRICT** |
| `responses.question_id` → `questions.id` | `evaluation` | `session.questions` | CASCADE |
| `response_evaluations.response_id` → `responses.id` | `evaluation` | `evaluation.responses` | CASCADE |
| `ai_runs.response_id` → `responses.id` | `evaluation` | `evaluation.responses` | SET NULL |
| `assessment_reports.attempt_id` → `assessment_attempts.id` | `assessment` | `assessment.assessment_attempts` | RESTRICT |
| `performance_profiles.student_id` → `students.id` | `performance` | `org.students` | CASCADE |
| `performance_snapshots.student_id` → `students.id` | `performance` | `org.students` | CASCADE |
| `skill_performances.profile_id` → `performance_profiles.id` | `performance` | `performance.performance_profiles` | CASCADE |
| `learning_plans.student_id` → `students.id` | `performance` | `org.students` | CASCADE |
| `credit_accounts.student_id` → `students.id` | `credit` | `org.students` | RESTRICT |
| `credit_transactions.account_id` → `credit_accounts.id` | `credit` | `credit.credit_accounts` | RESTRICT |
| `checklist_progress.student_id` → `students.id` | `placement` | `org.students` | CASCADE |
| `checklist_progress.item_id` → `checklist_items.id` | `placement` | `placement.checklist_items` | CASCADE |
| `mentor_verifications.progress_id` → `checklist_progress.id` | `placement` | `placement.checklist_progress` | CASCADE |
| `mentor_verifications.mentor_user_id` → `users.id` | `placement` | `identity.users` | RESTRICT |
| `placement_eligibility.student_id` → `students.id` | `placement` | `org.students` | CASCADE |

---

### 1.3 Missing Indexes

These indexes must be created in migrations. Missing these will cause slow queries at 2,000+ students.

| Table | Column(s) | Index Type | Reason |
|---|---|---|---|
| `users` | `email` | UNIQUE | Login lookup |
| `students` | `user_id` | UNIQUE | Profile lookup by auth user |
| `students` | `roll_number` | UNIQUE | Duplicate prevention |
| `students` | `program_id, batch_id` | BTREE | Cohort filtering |
| `student_mentor_assignments` | `mentor_user_id` | BTREE | "My mentees" query |
| `student_mentor_assignments` | `student_id` | BTREE | "My mentor" query |
| `trainer_subdivision_assignments` | `trainer_user_id, is_active` | BTREE | Trainer tenure check |
| `assessment_attempts` | `student_id, assessment_id` | BTREE | "My attempts" query |
| `assessment_attempts` | `status` | BTREE | In-progress detection |
| `assessment_sessions` | `attempt_id` | BTREE | Session lookup |
| `questions` | `session_id` | BTREE | Session questions |
| `responses` | `question_id` | BTREE | Response lookup |
| `response_evaluations` | `response_id` | UNIQUE | One evaluation per response |
| `performance_profiles` | `student_id` | UNIQUE | One profile per student |
| `performance_snapshots` | `student_id, captured_at` | BTREE | Historical trend queries |
| `credit_accounts` | `student_id` | UNIQUE | One account per student |
| `credit_transactions` | `account_id, created_at` | BTREE | Transaction history |
| `checklist_progress` | `student_id, item_id` | UNIQUE | One progress row per student+item |
| `mentor_verifications` | `progress_id` | UNIQUE | One verification per progress |
| `placement_eligibility` | `student_id` | UNIQUE | One eligibility per student |
| `knowledge_chunks` | `embedding` | ivfflat (pgvector) | Semantic search |
| `audit_logs` | `actor_user_id, created_at` | BTREE | Audit trail queries |

---

## 2. Resolved Design Decisions

The following decisions are **final** and must be followed by all team members. They resolve all open questions from the allocation document.

| # | Decision | Answer | Rationale |
|---|---|---|---|
| D-01 | **Query layer** | Raw `pg` driver with parameterized queries | No ORM installed. Adding Drizzle/Prisma adds learning overhead. Raw `pg` is in `package.json` already and team already has test files using it. Use `pg.Pool` from `src/shared/db/pool.ts`. |
| D-02 | **JWT refresh tokens** | No refresh tokens for MVP | 7-day access token is sufficient for a campus tool. Add refresh tokens post-launch if needed. |
| D-03 | **Token revocation** | Store `token_version` (integer) in `users` table | On logout or trainer revocation: `UPDATE users SET token_version = token_version + 1`. On each request, `authenticate` middleware fetches the current `token_version` from DB and compares it as an integer to `jwt.tokenVersion`. If they do not match exactly, the token is rejected with 401. The `iat` timestamp plays no role in this check. No Redis needed. |
| D-04 | **Event bus** | In-process `EventEmitter` (not outbox table) for MVP | Simpler, no background worker needed. `outbox_events` table exists but is not used until post-MVP. See Section 3.8. |
| D-05 | **Credit deduction** | Synchronous direct call from `AttemptService` to `CreditService.consume()` | Synchronous is correct here because insufficient credits must BLOCK attempt creation. Async events cannot block a synchronous HTTP response. |
| D-06 | **Eligibility threshold** | Configurable via `PLACEMENT_MIN_SCORE` env var, default = 60.0 | Not hardcoded. Not stored in a policy table for MVP. |
| D-07 | **Skills source** | Pre-seeded list + admin can add more | Seed 50 skills covering 21 PEP domains and HOPE track at startup. |
| D-08 | **File storage** | Local disk (`uploads/` folder) for MVP | No S3/MinIO setup required for MVP. Resume URL = `/uploads/resumes/<uuid>.pdf`. Post-MVP: swap to S3 by changing one config value. |
| D-09 | **Listening audio** | Pre-recorded/seeded text content for MVP | Seed 3-5 listening stories with text. TTS playback handled client-side or by AI service. No audio file storage needed for MVP text content. |
| D-10 | **Authorization granularity** | Role gate in middleware; entity scoping in service layer | `authorize(['FACULTY_MENTOR'])` in route. Inside service: `WHERE mentor_user_id = req.user.id`. |
| D-11 | **Agent execution** | FastAPI handles all LLM calls; Node.js tracks agent state in DB | Node.js creates `agent_runs` record before calling FastAPI. FastAPI returns result. Node.js writes `agent_steps` and closes the run. |
| D-12 | **Table name for domains** | `subdivisions` | Matches provided database schema. Add a code comment: `-- also called 'domains' in legacy docs`. |
| D-13 | **Real-time notifications** | Not in scope | No WebSocket. Mentor refreshes page to see new pending verifications. |
| D-14 | **`institutions` table** | Single seeded row, read-only API | One row seeded in `001_seed_data.sql`. No admin management UI needed for MVP. |
| D-15 | **`resumes` ownership** | **Member 1** owns, upload endpoint in Member 1's module | `POST /api/students/:id/resume` is Member 1's route. Member 2 and Member 3 SELECT only. |
| D-16 | **RBAC for MVP** | Role-only authorization (no permissions table) | 5 hardcoded roles. `permissions` and `role_permissions` tables are created in migration (for future use) but MVP code never reads them. |
| D-17 | **Self-registration security** | Public `POST /api/auth/register` creates `STUDENT` accounts only | Non-student roles (`FACULTY_MENTOR`, `PROGRAM_ADMIN`, `TRAINER`, `PLACEMENT_COORDINATOR`) must be created via admin-only endpoints. The `role` field in the register request body is ignored — it is always set to `STUDENT` server-side. |
| D-18 | **Entry point: TypeScript only** | Delete `server.js`; `src/index.ts` is the sole entry point | `server.js` is a legacy JavaScript stub with different routes and the wrong role name (`SUPER_ADMIN`). All team members build against `src/index.ts`. Update `package.json` scripts to compile TypeScript and run `dist/index.js`. |
| D-19 | **Legacy route naming** | Adopt new names from the plan; do not preserve legacy route paths | Existing stubs use `/api/tasks` (plan: `/api/checklist`), `/api/interview` (plan: `/api/sessions`). These routes are not implemented — rename them now before any code is written. |
| D-20 | **`SUPER_ADMIN` role name** | Use `PLACEMENT_COORDINATOR` everywhere | `adminRoutes.ts` uses `SUPER_ADMIN` in `requireRole()` calls. This is incorrect — the correct role name per specification is `PLACEMENT_COORDINATOR`. Fix during the TypeScript rewrite. |
| D-21 | **`/api/suggestions` module ownership** | Assigned to **Member 2** as post-MVP | The suggestion/chatbot system (`SuggestionController`, `/api/suggestions`) exists in stubs and is in the BACKEND_BLUEPRINT. It requires the same AI integration skills as Member 2's evaluation work. Post-MVP scope; Member 2 implements after the core assessment pipeline is complete. |
| D-22 | **`register-external` and `verify-email`** | Remove from MVP scope | These endpoints exist in `authRoutes.ts` but are not specified in any requirements document. Drop them. If email verification is needed post-launch, it is a separate feature. |

---

## 3. Shared Contracts — Agree Before Writing Any Code

Every team member must read and agree to this section before writing a single route. These contracts eliminate integration bugs.

---

### 3.1 Standard API Response Envelope

Every successful response must use this format:

```typescript
// Success — single resource
{
  "data": { ...resource }
}

// Success — list
{
  "data": [...resources],
  "pagination": {
    "total": 2500,
    "page": 1,
    "limit": 20,
    "totalPages": 125
  }
}

// Success — action (no resource returned)
{
  "message": "Human-readable success message"
}
```

**Never** return a bare object. Always wrap in `{ "data": ... }`.

---

### 3.2 Standard Error Envelope

Every error response must use this format:

```typescript
{
  "error": {
    "code": "SCREAMING_SNAKE_CASE_ERROR_CODE",
    "message": "Human-readable description safe to show a user",
    "details": {}   // optional: field-level validation errors
  }
}
```

**Examples:**
```json
// 400 Validation error
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "email": "Must be a valid email address",
      "password": "Must be at least 8 characters"
    }
  }
}

// 401
{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }

// 403
{ "error": { "code": "FORBIDDEN", "message": "You do not have access to this resource" } }

// 404
{ "error": { "code": "NOT_FOUND", "message": "Student not found" } }

// 409
{ "error": { "code": "ATTEMPT_IN_PROGRESS", "message": "An attempt for this assessment is already in progress" } }

// 422
{ "error": { "code": "INSUFFICIENT_CREDITS", "message": "Not enough credits to start this assessment" } }
```

The centralized error handler (`src/shared/middleware/errorHandler.ts`) maps domain error classes to HTTP status codes. No raw try/catch in controllers.

---

### 3.3 JWT Token Structure

The JWT payload must always contain exactly these fields:

```typescript
interface JWTPayload {
  sub: string;           // user UUID
  email: string;
  role: UserRole;        // 'STUDENT' | 'FACULTY_MENTOR' | 'PROGRAM_ADMIN' | 'TRAINER' | 'PLACEMENT_COORDINATOR'
  tokenVersion: number;  // for revocation check (Decision D-03)
  iat: number;
  exp: number;
}
```

The `req.user` object (populated by `authenticate` middleware) must match this TypeScript interface exactly:

```typescript
// src/shared/types/auth.ts  — Member 1 creates this file, all members import it
export interface AuthUser {
  id: string;          // = JWT sub
  email: string;
  role: UserRole;
  tokenVersion: number;
}

// Express augmentation — also in src/shared/types/auth.ts
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
```

**Token revocation check — implement exactly in `authenticate.ts`:**

```typescript
// After verifying JWT signature and expiry:
const payload = jwt.verify(token, config.jwtSecret) as JWTPayload;

// Fetch current token_version from DB
const { rows } = await pool.query(
  'SELECT token_version FROM identity.users WHERE id = $1',
  [payload.sub]
);
if (!rows[0] || rows[0].token_version !== payload.tokenVersion) {
  throw Errors.unauthorized(); // Token was revoked (logout or trainer revoked)
}
```

This comparison is **integer equality between the JWT payload field and the database column**. The `iat` (issued-at timestamp) is not used in revocation logic — do not compare it to anything.

**Rule:** Every route file imports `AuthUser` from `src/shared/types/auth.ts`. No member defines their own user type.

---

### 3.4 UUID Conventions

- All primary keys are `UUID` generated by PostgreSQL: `DEFAULT gen_random_uuid()`
- All IDs in JSON responses are strings (PostgreSQL UUIDs are already strings)
- All ID route parameters are validated as UUID format before reaching the service layer
- Validation: `z.string().uuid()` — reject non-UUID IDs with 400

---

### 3.5 Pagination Contract

**Request:**
```
GET /api/resource?page=1&limit=20&sortBy=created_at&sortOrder=desc
```

- `page` default: `1`, minimum: `1`
- `limit` default: `20`, maximum: `100`
- `sortBy` default: `created_at`
- `sortOrder` default: `desc`, options: `asc | desc`

**Response:**
```typescript
{
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }
}
```

The shared pagination helper lives in `src/shared/utils/pagination.ts`:

```typescript
// Member 1 creates this. All members import it.
export function parsePagination(query: { page?: string; limit?: string }) {
  const page = Math.max(1, parseInt(query.page ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function buildPaginatedResponse<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
  };
}
```

---

### 3.6 Validation Contract

- Use `zod` for all input validation
- Validation schemas live in `<module>.types.ts` alongside TypeScript types
- Validation runs in the controller, before calling the service
- Unknown fields are stripped (`.strip()` in zod)
- Validation errors return 400 with `details` showing per-field messages
- Shared validation utility: `src/shared/middleware/validate.ts` — wraps zod parsing into Express middleware

```typescript
// Example usage in any route file:
import { validate } from '../../shared/middleware/validate';
import { CreateStudentSchema } from './students.types';

router.post('/', authenticate, validate(CreateStudentSchema), studentsController.create);
```

---

### 3.7 Database Connection Contract

- Single connection pool shared across all modules
- Pool created once in `src/shared/db/pool.ts`
- All repositories import `pool` from this path — never create their own pool
- Pool config: `max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 2000`
- All queries use parameterized form: `pool.query('SELECT * FROM users WHERE id = $1', [userId])`
- Never concatenate user input into SQL strings

```typescript
// src/shared/db/pool.ts  — Member 1 creates this
import { Pool } from 'pg';
import { config } from '../config/env';

export const pool = new Pool({ connectionString: config.databaseUrl });
```

---

### 3.8 Event Bus Contract

**MVP justification:** The in-process `EventEmitter` replaces the database-backed outbox pattern **for MVP only**. This is valid because the MVP is a single Node.js process deployed on a single server.

**Known limitations — the team must understand these before using the event bus:**

| Limitation | Impact | Post-MVP mitigation |
|---|---|---|
| Events are lost if the process crashes between the DB write and the event emit | A student registration could succeed but the credit account and performance profile would not be created | Use DB outbox: emit + DB write in same transaction |
| Events do not reach other Node.js processes (horizontal scaling) | Only acceptable for single-instance deployment | Use DB outbox + polling, or a message broker (Redis pub/sub, RabbitMQ) |
| Failed handlers are silently dropped (logged, not retried) | A handler error (e.g., DB down during `initializeAccount`) leaves data in inconsistent state | DB outbox stores `status=FAILED` and retries |
| No delivery guarantee — fire-and-forget | Acceptable for MVP analytics (performance profile) — not acceptable for billing | Switch credit earning to synchronous call post-MVP |

**Migration path to outbox (post-MVP):** Replace `emit()` with an `insertOutboxEvent()` function that writes to `outbox_events` table inside the same DB transaction as the triggering write. Add a background polling worker that processes `PENDING` events. All event payload types (`UserRegisteredPayload`, `AttemptCompletedPayload`, etc.) remain identical — only the transport layer changes.

The in-process event bus replaces the outbox pattern for MVP:

```typescript
// src/shared/events/eventBus.ts  — Member 1 creates this
import { EventEmitter } from 'events';
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(20);

// Type-safe event publishing
export function emit<T>(event: AppEvent, payload: T): void {
  eventBus.emit(event, payload);
}

// Handler registration
export function on<T>(event: AppEvent, handler: (payload: T) => Promise<void>): void {
  eventBus.on(event, async (payload: T) => {
    try {
      await handler(payload);
    } catch (err) {
      console.error(`[EventBus] Handler failed for ${event}:`, err);
    }
  });
}
```

**Defined events** — all members must use these exact event names:

```typescript
// src/shared/events/events.ts  — Member 1 creates this
export type AppEvent =
  | 'USER_REGISTERED'
  | 'ATTEMPT_COMPLETED'
  | 'CHECKLIST_ITEM_TOGGLED'
  | 'MENTOR_VERIFIED';

// Payload shapes
export interface UserRegisteredPayload {
  userId: string;
  studentId: string;   // populated only if role === 'STUDENT'
  role: string;
}

export interface AttemptCompletedPayload {
  attemptId: string;
  studentId: string;
  assessmentId: string;
  overallScore: number;
  technicalScore: number;
  communicationScore: number;
  reportId: string;
}

export interface ChecklistItemToggledPayload {
  progressId: string;
  studentId: string;
  itemId: string;
  mentorUserId: string;  // the student's assigned mentor
}

export interface MentorVerifiedPayload {
  progressId: string;
  studentId: string;
  mentorUserId: string;
}
```

**Rules:**
- Emit events AFTER the database write succeeds, not before
- Emit events within the same try block as the DB write (so if emit crashes, you know the DB write succeeded and can debug)
- Event handlers must be idempotent — they may be called more than once
- Event handlers must never throw back to the emitter — catch internally and log

---

### 3.9 Database Migration Rules

- **Tool:** Plain SQL files, run in order by a startup script
- **File naming:** `NNN_description.sql` where NNN is zero-padded (e.g., `001_create_identity_schema.sql`)
- **Location:** `backend/src/shared/db/migrations/`
- **Run order:** Strictly numeric ascending
- **Rule:** Migrations are append-only — never edit a committed migration file
- **Rollback:** Write a separate `NNN_rollback_description.sql` if rollback is needed
- **Ownership:** Each member writes migrations for their own tables, numbered in the agreed sequence (see Section 7)
- **Idempotency:** Every migration uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`
- **Conflict prevention:** Member 1 reserves migration numbers 001–030. Member 2: 031–060. Member 3: 061–090. Member 4: 091–109. Shared cross-schema FKs: 110–119. Seed data: 120–130. Every migration number has exactly one owner — the ranges do not overlap.

---

### 3.10 Error Class Contract

All modules use a shared domain error base class. Member 1 creates `src/shared/errors/AppError.ts`:

```typescript
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly httpStatus: number,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

// Pre-defined error constructors — add more as needed
export const Errors = {
  notFound: (msg: string) => new AppError('NOT_FOUND', msg, 404),
  unauthorized: () => new AppError('UNAUTHORIZED', 'Authentication required', 401),
  forbidden: () => new AppError('FORBIDDEN', 'You do not have access', 403),
  conflict: (code: string, msg: string) => new AppError(code, msg, 409),
  unprocessable: (code: string, msg: string) => new AppError(code, msg, 422),
  insufficientCredits: () => new AppError('INSUFFICIENT_CREDITS', 'Not enough credits', 402),
  aiUnavailable: () => new AppError('AI_SERVICE_UNAVAILABLE', 'AI service is unavailable', 503),
};
```

The central error handler (`src/shared/middleware/errorHandler.ts`) catches `AppError` and formats the response. Unrecognized errors return 500 with a generic message.

---

### 3.11 Folder / File Naming Rules

| Rule | Example |
|---|---|
| Module folders: `camelCase` | `src/modules/assessmentAttempts/` |
| File names: `camelCase.role.ts` | `students.service.ts` |
| Migration files: `NNN_snake_case.sql` | `001_create_identity_schema.sql` |
| Test files: `moduleName.test.ts` | `auth.test.ts` |
| Shared utilities: `camelCase.ts` | `pagination.ts` |
| Type/interface names: `PascalCase` | `interface StudentProfile {}` |
| Zod schemas: `PascalCase + Schema` | `const CreateStudentSchema = z.object(...)` |
| Constants: `UPPER_SNAKE_CASE` | `const MAX_TAB_SWITCHES = 4` |

---

## 4. MVP Scope Split

### 4.1 MUST HAVE FOR MVP

These features are required for the platform to be functional for the first college pilot. A student must be able to register, take a mock interview, and have their result recorded.

**Member 1 — MVP scope:**
- Register user (all 5 roles)
- Login / logout with JWT
- Get current user (`/api/auth/me`)
- Student profile CRUD (name, email, roll number, department, coding handles)
- Resume upload and text extraction
- Seeded institution, departments, programs, batches, subdivisions (read-only)
- Mentor assignment (assign mentor to student, get my mentees)
- Trainer assignment (onboard, revoke, tenure guard middleware)
- `authenticate` middleware
- `authorize` middleware (role-based only, no permission table for MVP)
- `AuditService` (simple INSERT to `audit_logs`)
- In-process `EventBus` (emit `USER_REGISTERED`)
- Shared DB pool, error classes, response helpers, pagination, validation middleware

**Member 2 — MVP scope:**
- Assessment CRUD (type, components, credit cost)
- Question bank CRUD with skill tagging
- Start assessment attempt (with credit check via direct `CreditService.consume()` call)
- Start assessment session (interview or listening)
- Proctoring event recording (tab-switch counter + flagging)
- Submit response (transcript + speech metrics from AI service)
- AI evaluation integration (call FastAPI, persist `response_evaluations` and `ai_runs`)
- Adaptive difficulty progression
- Complete session + generate assessment report
- `GET /api/reports/:attemptId`
- Emit `ATTEMPT_COMPLETED` event on report generation

**Member 3 — MVP scope:**
- Skills master list (seeded + CRUD)
- Listening stories (seeded + CRUD for admin)
- Performance profile creation on `USER_REGISTERED` event
- Performance profile update on `ATTEMPT_COMPLETED` event
- Performance snapshot creation
- Skill performance aggregation per student
- `GET /api/performance/:studentId`
- `GET /api/skills`
- `GET /api/listening-stories/:id`

**Member 4 — MVP scope:**
- Credit account creation on `USER_REGISTERED` event
- Default credit policy (seeded, read from env var for MVP)
- `CreditService.consume()` (synchronous, callable by Member 2)
- Credit earning on `ATTEMPT_COMPLETED` event
- Credit balance endpoint
- Checklist item CRUD + CSV import
- Student checklist progress toggle
- Mentor verification endpoint
- `GET /api/checklist/my-progress`
- `GET /api/verifications/pending`

---

### 4.2 SHOULD HAVE AFTER MVP

Build these once MVP is working and tested.

- Full RBAC permission table (permissions, role_permissions — tables exist, fill with data)
- Learning plans and learning recommendations (Member 3)
- Placement eligibility calculation (Member 4)
- College-wide eligibility report endpoint (Member 4)
- Admin dashboards (aggregate performance per program/subdivision — Member 3)
- Suggestion system / chatbot (was in original blueprint, not in 4-member allocation)
- Credit policies CRUD (currently seeded from env var — make DB-managed)
- Admin credit adjustment endpoint
- OpenAPI documentation (`/api/docs` Swagger UI)
- Resume grounding in AI question generation (connect resume text to FastAPI prompt)
- Listening session replay limiter enforcement
- Knowledge/RAG system (Member 3: `knowledge_documents`, `knowledge_chunks`, pgvector)
- `GET /api/reports/student/:studentId` (list all reports for a student)
- Student assignment list for trainers (scoped to subdivision)

---

### 4.3 ADVANCED / LATER

Build these after the platform is validated with real users.

- Agent system tables (`agent_definitions`, `agent_runs`, `agent_steps`) — Member 3
- `student_skills` table population logic
- Outbox pattern (replace in-memory EventEmitter with DB-backed outbox)
- Full granular permissions (`permissions` + `role_permissions` populated and enforced)
- Real-time notifications (WebSocket for mentor verification alerts)
- External coding profile integration (LeetCode API, GitHub API)
- Video/gaze proctoring
- CSV export (placement coordinator)
- Senate report generation
- Token refresh / sliding session
- Multi-institution support

---

## 5. Per-Member Implementation Cards

Each card is a complete reference for one developer. It tells them exactly what to build, what to read, what to avoid, and what to publish/consume.

---

### 5.1 Member 1 — Auth, Authorization & Organization

**Exact Responsibility:**  
Build the identity foundation. Every other member depends on your `authenticate` middleware, your `req.user` type, and your event bus before they can build protected routes. Your work must be done and merged to `main` before Phase 2 can begin.

**Tables You Own (write access):**

| Table | Schema |
|---|---|
| `institutions` | `org` |
| `departments` | `org` |
| `programs` | `org` |
| `batches` | `org` |
| `subdivisions` | `org` |
| `users` | `identity` |
| `roles` | `identity` |
| `permissions` | `identity` |
| `role_permissions` | `identity` |
| `role_assignments` | `identity` |
| `students` | `org` |
| `resumes` | `org` |
| `student_mentor_assignments` | `org` |
| `trainer_subdivision_assignments` | `org` |
| `audit_logs` | `system` (create + insert only) |
| `outbox_events` | `system` (create table only — not used in MVP) |

**Tables You May Read (SELECT only, never write):**

None — all other modules call your APIs or import your services. You do not read other members' tables.

**Registration Security — critical rule:**

`POST /api/auth/register` is public. **Do not accept a `role` field from the request body.** The server always sets `role = 'STUDENT'` regardless of what the client sends. Staff accounts are created only through authenticated admin endpoints:

| Staff Role | Created By | Endpoint |
|---|---|---|
| `FACULTY_MENTOR` | `PLACEMENT_COORDINATOR` | `POST /api/admin/faculty-mentors` |
| `PROGRAM_ADMIN` | `PLACEMENT_COORDINATOR` | `POST /api/admin/program-admins` |
| `TRAINER` | `PROGRAM_ADMIN` or `PLACEMENT_COORDINATOR` | `POST /api/trainer-assignments` (creates user + assignment atomically) |
| `PLACEMENT_COORDINATOR` | Seeded at DB startup or by another coordinator | `POST /api/admin/coordinators` (requires existing coordinator JWT) |

**APIs You Must Implement (MVP):**

```
POST   /api/auth/register           ← always creates STUDENT (ignores role field)
POST   /api/auth/login
GET    /api/auth/me
POST   /api/auth/logout             ← increments users.token_version

GET    /api/students
GET    /api/students/:id
PUT    /api/students/:id
PUT    /api/students/:id/coding-handles
POST   /api/students/:id/resume

GET    /api/mentor-assignments/my-mentees
POST   /api/mentor-assignments
DELETE /api/mentor-assignments/:id

POST   /api/trainer-assignments
PUT    /api/trainer-assignments/:id/revoke
GET    /api/trainer-assignments

GET    /api/institutions
GET    /api/departments
GET    /api/programs
GET    /api/batches
GET    /api/subdivisions

POST   /api/admin/faculty-mentors   ← PLACEMENT_COORDINATOR only
GET    /api/admin/faculty-mentors
POST   /api/admin/program-admins    ← PLACEMENT_COORDINATOR only
GET    /api/admin/program-admins
POST   /api/admin/coordinators      ← PLACEMENT_COORDINATOR only
```

**APIs You Depend On:**  
None — you are the foundation.

**Events You Publish:**

| Event | When | Payload type |
|---|---|---|
| `USER_REGISTERED` | After successful student registration | `UserRegisteredPayload` |

**Events You Consume:**  
None.

**Shared Infrastructure You Must Create and Deliver FIRST:**

These files must be committed to `main` before any other member writes a single line of code:

```
backend/src/shared/
  types/
    auth.ts          ← AuthUser interface + Express augmentation
    roles.ts         ← UserRole enum, all role constants
  db/
    pool.ts          ← pg.Pool singleton
    migrations/      ← folder (empty, numbered)
  errors/
    AppError.ts      ← base error class + Errors factory
  middleware/
    authenticate.ts  ← JWT verification → req.user
    authorize.ts     ← role guard factory
    validate.ts      ← zod validation wrapper
    errorHandler.ts  ← centralized error → HTTP response
  events/
    eventBus.ts      ← EventEmitter singleton
    events.ts        ← AppEvent type + payload interfaces
  utils/
    pagination.ts    ← parsePagination + buildPaginatedResponse
    response.ts      ← sendSuccess, sendError helpers
  config/
    env.ts           ← typed environment variable loader
```

**Files / Folders You Own:**

```
backend/src/modules/auth/
backend/src/modules/users/
backend/src/modules/organization/
backend/src/modules/students/
backend/src/modules/mentorAssignments/
backend/src/modules/trainerAssignments/
backend/src/shared/               ← you create and maintain all shared infrastructure
backend/src/shared/db/migrations/001–030_*.sql
```

**What You Must NOT Modify:**  
Any file under `src/modules/assessments/`, `src/modules/performance/`, `src/modules/credits/`, or `src/modules/checklist/`. Pull those API routes into `src/index.ts` yourself via the route-registration pattern. Other members PR their own `index.ts` changes.

**Known Stubs To Provide:**

While Member 4 is building `CreditService`, provide a stub at `src/modules/credits/credits.service.stub.ts` that Member 2 can import in tests:

```typescript
// Stub — replace with real import when Member 4 delivers
export const CreditServiceStub = {
  consume: async (_studentId: string, _amount: number) => ({ newBalance: 50 }),
  earn: async (_studentId: string, _amount: number) => ({ newBalance: 55 }),
};
```

---

### 5.2 Member 2 — Assessment, Interview & AI Evaluation

**Exact Responsibility:**  
Build the core assessment pipeline from attempt creation to report generation. You integrate with the FastAPI AI service. This is the highest-risk module because it coordinates: credit checks (Member 4), AI calls (FastAPI), and performance events (Member 3). Use stubs for dependencies that are not ready.

**Authoritative PostgreSQL Schema Map (reconciled from DATA_MODEL.md and PROJECT_BLUEPRINT.md):**

The platform uses these logical schemas within a single PostgreSQL database. This table is the authoritative reference — it overrides any inconsistency in earlier documents.

| Schema | Tables | Owner |
|---|---|---|
| `identity` | `users`, `roles`, `permissions`, `role_permissions`, `role_assignments` | Member 1 |
| `org` | `institutions`, `departments`, `programs`, `batches`, `subdivisions`, `students`, `resumes`, `student_mentor_assignments`, `trainer_subdivision_assignments` | Member 1 |
| `assessment` | `assessments`, `assessment_components`, `assessment_attempts`, `assessment_reports` | Member 2 |
| `session` | `assessment_sessions`, `question_bank_items`, `question_bank_item_skills`, `questions` | Member 2 |
| `evaluation` | `responses`, `ai_runs`, `response_evaluations` | Member 2 |
| `performance` | `skills`, `student_skills`, `performance_profiles`, `performance_snapshots`, `skill_performances`, `learning_plans`, `learning_recommendations`, `listening_stories` | Member 3 |
| `knowledge` | `knowledge_documents`, `knowledge_chunks` | Member 3 |
| `agent` | `agent_definitions`, `agent_runs`, `agent_steps` | Member 3 |
| `credit` | `credit_accounts`, `credit_transactions`, `credit_policies` | Member 4 |
| `placement` | `checklist_items`, `checklist_progress`, `mentor_verifications`, `placement_eligibility` | Member 4 |
| `system` | `audit_logs`, `outbox_events` | Shared Infrastructure |

> **Note on DATA_MODEL.md:** DATA_MODEL.md refers to `interview_session` and `listening_session` as separate tables. In the final schema these are unified as `session.assessment_sessions` with a `session_type` column (`MOCK_INTERVIEW` or `LISTENING`). This avoids schema drift between the two session types.

**Tables You Own (write access):**

| Table | Schema |
|---|---|
| `assessments` | `assessment` |
| `assessment_components` | `assessment` |
| `assessment_attempts` | `assessment` |
| `assessment_sessions` | `session` |
| `question_bank_items` | `session` |
| `question_bank_item_skills` | `session` |
| `questions` | `session` |
| `responses` | `evaluation` |
| `ai_runs` | `evaluation` |
| `response_evaluations` | `evaluation` |
| `assessment_reports` | `assessment` |

**Tables You May Read (SELECT only, never write):**

| Table | Why |
|---|---|
| `students` | Verify student exists before creating attempt |
| `student_mentor_assignments` | Scope: mentors can only view their mentees' reports |
| `resumes` | Pass resume text to AI service for grounded questions |
| `skills` | Tag question bank items by skill |
| `listening_stories` | Fetch story content when starting a listening session |
| `credit_accounts` | Read balance before attempting (actual deduction done by CreditService) |

**APIs You Must Implement (MVP):**

```
GET    /api/assessments
POST   /api/assessments
GET    /api/assessments/:id
PUT    /api/assessments/:id

GET    /api/question-bank
POST   /api/question-bank
PUT    /api/question-bank/:id
DELETE /api/question-bank/:id     (soft delete: is_active = false)

POST   /api/attempts/start
GET    /api/attempts/:id
PUT    /api/attempts/:id/abandon

POST   /api/sessions/start
GET    /api/sessions/:id
POST   /api/sessions/:id/proctor-event
POST   /api/sessions/:id/complete

POST   /api/responses/submit
GET    /api/responses/:id

GET    /api/reports/:attemptId
```

**APIs You Depend On:**

| API | Provided By | When You Need It |
|---|---|---|
| `CreditService.consume()` | Member 4 | Before `AttemptService.start()` |
| `POST /api/students/:id` (student lookup) | Member 1 | Validate student before attempt |

**Handling Missing Dependencies:**

Use stubs during development. When Member 4 delivers `CreditService`, swap the stub:

```typescript
// src/modules/credits/credits.service.ts  (use stub until Member 4 delivers real version)
// Import from Member 4's module once available:
// import { CreditService } from '../credits/credits.service';
import { CreditServiceStub as CreditService } from '../credits/credits.service.stub';
```

**Events You Publish:**

| Event | When | Payload type |
|---|---|---|
| `ATTEMPT_COMPLETED` | After `assessment_reports` row is inserted | `AttemptCompletedPayload` |

**Events You Consume:**  
None.

**AI Service Contract (FastAPI):**

The AI service must be running at `AI_SERVICE_URL` (default `http://localhost:8000`). Member 2 writes the Node.js HTTP client:

```typescript
// src/modules/evaluation/aiClient.ts
// POST /ai/evaluate-response
interface AIEvaluateRequest {
  transcript: string;
  question_text: string;
  duration_sec: number;
  difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
  resume_context?: string;  // parsed resume text
}
interface AIEvaluateResponse {
  technical_score: number;   // 0–100
  fluency_score: number;
  clarity_score: number;
  pace_wpm: number;
  filler_count: number;
  is_pace_optimal: boolean;  // 120–150 WPM
  feedback: string;
  strengths: string;
  weaknesses: string;
  model_used: string;
  latency_ms: number;
}

// POST /ai/generate-question
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

If the AI service is down, set `response_evaluations.status = 'PENDING'` and return partial session data to the client. Do not block the student's session.

**Score Formula — implement exactly:**

The AI service returns a raw `filler_count` (integer: number of filler words detected). This must be converted to a `fillerScore` (0–100 scale, where **100 = zero filler words, higher is better**) before it can be used in the weighted formula. The conversion is a penalty calculation, but the *result* is a positive score component.

```typescript
const FILLER_PENALTY_PER_WORD = 5; // 5 points deducted per filler word; configurable via env var

// Step 1: Convert raw filler_count → fillerScore (0–100, higher = fewer fillers = better)
function deriveFillerScore(fillerCount: number): number {
  return Math.max(0, 100 - fillerCount * FILLER_PENALTY_PER_WORD);
  // Examples:
  //   0 filler words  → fillerScore = 100
  //   5 filler words  → fillerScore = 75
  //  10 filler words  → fillerScore = 50
  //  20+ filler words → fillerScore = 0
}

// Step 2: Compute weighted overall score
// All inputs are 0–100. All four communication components use the same 0–100 scale.
function calculateOverallScore(
  techAvg: number,      // 0–100, from AI evaluations
  fluencyAvg: number,   // 0–100, from AI evaluations
  clarityAvg: number,   // 0–100, from AI evaluations
  paceAvg: number,      // 0–100, derived: 100 if WPM in 120–150, lower otherwise
  fillerScore: number   // 0–100, derived via deriveFillerScore() — NOT a raw count
): number {
  const commAvg =
    (fluencyAvg  * 0.35) +
    (paceAvg     * 0.25) +
    (fillerScore * 0.20) +   // fillerScore is ADDED positively — more fillers = lower score = lowers commAvg
    (clarityAvg  * 0.20);
  return (techAvg * 0.70) + (commAvg * 0.30);
}
```

**Pace score derivation** (also needed before the formula can run):

```typescript
function derivePaceScore(wpm: number): number {
  if (wpm >= 120 && wpm <= 150) return 100;       // Ideal range
  if (wpm >= 110 && wpm < 120) return 75;          // Slightly slow
  if (wpm > 150 && wpm <= 160) return 75;          // Slightly fast
  if (wpm >= 90  && wpm < 110) return 50;          // Hesitant
  if (wpm > 160 && wpm <= 180) return 50;          // Rushed
  if (wpm < 90)                return 25;           // Very slow
  return 25;                                        // Very fast
}
```

> **Summary of naming:** The BACKEND_BLUEPRINT.md uses the phrase "Filler Word Penalty" as a *component label* within the communication average formula. It does not mean the value is subtracted. The value is a derived score (0–100) called `fillerScore` in code. The raw count from the AI is `filler_count`. These are distinct and must never be confused.
```

**Proctoring Rules — implement exactly:**

```typescript
function applyProctoringRules(tabSwitchCount: number): ProctoringResult {
  if (tabSwitchCount >= 5) return { level: 3, flagged: true,  auditLog: true  };
  if (tabSwitchCount >= 3) return { level: 2, flagged: false, auditLog: true  };
  if (tabSwitchCount >= 1) return { level: 1, flagged: false, auditLog: false };
  return                          { level: 0, flagged: false, auditLog: false };
}
```

**Files / Folders You Own:**

```
backend/src/modules/assessments/
backend/src/modules/attempts/
backend/src/modules/sessions/
backend/src/modules/questions/
backend/src/modules/responses/
backend/src/modules/evaluation/
backend/src/modules/reports/
backend/src/shared/db/migrations/031–060_*.sql
```

**What You Must NOT Modify:**

Files under `src/shared/` (owned by Member 1). If you need a change there, open a PR to Member 1. You must not modify `src/modules/performance/`, `src/modules/credits/`, or `src/modules/checklist/`.

---

### 5.3 Member 3 — Performance, Learning, Knowledge & Agents

**Exact Responsibility:**  
Build the analytics and intelligence layer. Your primary MVP deliverable is: (a) create a performance profile when a student registers, (b) update it when an assessment is completed. Knowledge/RAG and the agent system are post-MVP scope — do not build them in the first sprint.

**Tables You Own (write access):**

| Table | Schema | MVP or Post-MVP |
|---|---|---|
| `skills` | `performance` | MVP |
| `performance_profiles` | `performance` | MVP |
| `performance_snapshots` | `performance` | MVP |
| `skill_performances` | `performance` | MVP |
| `listening_stories` | `performance` | MVP (seed data) |
| `learning_plans` | `performance` | Post-MVP |
| `learning_recommendations` | `performance` | Post-MVP |
| `student_skills` | `performance` | Advanced |
| `knowledge_documents` | `knowledge` | Post-MVP |
| `knowledge_chunks` | `knowledge` | Post-MVP |
| `agent_definitions` | `agent` | Advanced |
| `agent_runs` | `agent` | Advanced |
| `agent_steps` | `agent` | Advanced |

**Tables You May Read (SELECT only, never write):**

| Table | Why |
|---|---|
| `students` | Link performance profile to student |
| `assessment_reports` | Aggregate scores into performance profile |
| `response_evaluations` | Compute per-skill performance scores |
| `questions` + `question_bank_item_skills` | Map responses to skills |

**APIs You Must Implement (MVP):**

```
GET    /api/skills
POST   /api/skills          (admin only — add to taxonomy)
DELETE /api/skills/:id      (soft delete — CHECK for question_bank_item_skills refs first)

GET    /api/performance/:studentId
GET    /api/performance/:studentId/snapshots

GET    /api/skills/student/:studentId    (skill performance breakdown)

GET    /api/listening-stories             (admin list)
POST   /api/listening-stories             (admin create)
GET    /api/listening-stories/:id         (student access during session)
```

**Post-MVP (do not build now):**

```
GET/PUT /api/learning-plans/:studentId
GET/PUT /api/recommendations/:studentId
GET     /api/knowledge/documents
POST    /api/knowledge/documents
GET     /api/knowledge/search
GET     /api/agents
GET     /api/agents/runs
```

**APIs You Depend On:**  
None — you receive events from Member 1 (registration) and Member 2 (attempt completion).

**Events You Publish:**  
None (in MVP).

**Events You Consume:**

| Event | Handler | Action |
|---|---|---|
| `USER_REGISTERED` | `onUserRegistered(payload)` | If `role === 'STUDENT'`, create `performance_profiles` row |
| `ATTEMPT_COMPLETED` | `onAttemptCompleted(payload)` | Create snapshot, update profile, upsert skill_performances |

**Event Handler Registration — register in module startup:**

```typescript
// src/modules/performance/performance.events.ts
import { on } from '../../shared/events/eventBus';
import { PerformanceService } from './performance.service';

export function registerPerformanceEventHandlers(service: PerformanceService) {
  on<UserRegisteredPayload>('USER_REGISTERED', async (payload) => {
    if (payload.role === 'STUDENT' && payload.studentId) {
      await service.initializeProfile(payload.studentId);
    }
  });

  on<AttemptCompletedPayload>('ATTEMPT_COMPLETED', async (payload) => {
    await service.processCompletedAttempt(payload);
  });
}
```

**Performance Aggregation Logic — implement exactly:**

```typescript
// Called after ATTEMPT_COMPLETED event
async processCompletedAttempt(payload: AttemptCompletedPayload): Promise<void> {
  // 1. Fetch assessment_report (cross-schema SELECT — Member 2's table)
  // 2. Insert performance_snapshots (append-only)
  // 3. Upsert skill_performances per skill found in response_evaluations
  // 4. Update performance_profiles:
  //    - Set previous_overall_score = current overall_score
  //    - Set overall_score = payload.overallScore
  //    - Calculate trend from last 3 snapshots:
  //      IMPROVING: current > last by > 2 points
  //      DECLINING: current < last by > 2 points
  //      STABLE:    within 2 points
  // 5. Update performance_profiles.technical_score, communication_score
}
```

**Files / Folders You Own:**

```
backend/src/modules/performance/
backend/src/modules/skills/
backend/src/modules/listeningStories/
backend/src/modules/learning/        (create folder, defer implementation)
backend/src/modules/knowledge/       (create folder, defer implementation)
backend/src/modules/agents/          (create folder, defer implementation)
backend/src/shared/db/migrations/061–090_*.sql
```

**What You Must NOT Modify:**

Files under `src/shared/`, `src/modules/assessments/`, `src/modules/credits/`, or `src/modules/checklist/`. You read from `assessment_reports` and `response_evaluations` with direct SQL SELECT — you never call Member 2's services.

---

### 5.4 Member 4 — Credits, Readiness Checklist & Placement

**Exact Responsibility:**  
Build the credit economy and the checklist verification system. Your `CreditService.consume()` is a hard synchronous dependency for Member 2's attempt creation. Deliver it early. The placement eligibility calculation is post-MVP.

**Tables You Own (write access):**

| Table | Schema | MVP or Post-MVP |
|---|---|---|
| `credit_accounts` | `credit` | MVP |
| `credit_transactions` | `credit` | MVP |
| `credit_policies` | `credit` | Post-MVP (seeded from env var for MVP) |
| `checklist_items` | `placement` | MVP |
| `checklist_progress` | `placement` | MVP |
| `mentor_verifications` | `placement` | MVP |
| `placement_eligibility` | `placement` | Post-MVP |

**Tables You May Read (SELECT only, never write):**

| Table | Why |
|---|---|
| `students` | Verify student exists when creating credit account |
| `student_mentor_assignments` | Verify mentor is authorized to verify a specific student's checklist item |
| `performance_profiles` | Eligibility calculation (post-MVP) |
| `assessment_attempts` | Count completed attempts for eligibility check (post-MVP) |

**APIs You Must Implement (MVP):**

```
GET    /api/credits/balance/:studentId

GET    /api/checklist
POST   /api/checklist
POST   /api/checklist/import-csv
PUT    /api/checklist/:id
DELETE /api/checklist/:id

GET    /api/checklist/my-progress          (student's own checklist)
POST   /api/checklist/:itemId/toggle       (student marks complete)
GET    /api/checklist/mentee/:studentId    (mentor views mentee's checklist)

GET    /api/verifications/pending          (mentor's pending items)
POST   /api/verifications/:progressId/verify
```

**Post-MVP (do not build now):**

```
GET    /api/credits/transactions/:studentId
POST   /api/credits/adjust
GET    /api/credit-policies
POST   /api/credit-policies
PUT    /api/credit-policies/:id
GET    /api/placement-eligibility/:studentId
POST   /api/placement-eligibility/:studentId/recalculate
GET    /api/placement-eligibility/report
```

**The Most Critical Deliverable — `CreditService.consume()`:**

This function must be ready before Member 2 can wire up attempt creation. Deliver it in the first commit of your module.

```typescript
// src/modules/credits/credits.service.ts
export class CreditService {
  
  // Called synchronously by Member 2's AttemptService
  async consume(studentId: string, amount: number, reason: string, referenceId: string): Promise<{ newBalance: number }> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const { rows } = await client.query(
        'SELECT balance FROM credit.credit_accounts WHERE student_id = $1 FOR UPDATE',
        [studentId]
      );
      if (!rows[0]) throw Errors.notFound('Credit account not found');
      
      const currentBalance = rows[0].balance;
      if (currentBalance < amount) throw Errors.insufficientCredits();
      
      const newBalance = currentBalance - amount;
      await client.query(
        'UPDATE credit.credit_accounts SET balance = $1 WHERE student_id = $2',
        [newBalance, studentId]
      );
      await client.query(
        `INSERT INTO credit.credit_transactions (account_id, amount, type, reason, reference_id)
         SELECT id, $1, 'CONSUMPTION', $2, $3 FROM credit.credit_accounts WHERE student_id = $4`,
        [-amount, reason, referenceId, studentId]
      );
      
      await client.query('COMMIT');
      return { newBalance };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async earn(studentId: string, amount: number, reason: string, referenceId: string): Promise<{ newBalance: number }> {
    // Similar pattern — add amount, enforce maximum_balance from env var
  }
}
```

**APIs You Depend On:**

| API | Provided By | When You Need It |
|---|---|---|
| `student_mentor_assignments` table | Member 1 | Verify mentor scope on verification endpoint |

**Events You Publish:**

| Event | When | Payload type |
|---|---|---|
| `CHECKLIST_ITEM_TOGGLED` | After student marks item complete | `ChecklistItemToggledPayload` |
| `MENTOR_VERIFIED` | After mentor signs off | `MentorVerifiedPayload` |

**Events You Consume:**

| Event | Handler | Action |
|---|---|---|
| `USER_REGISTERED` | `onUserRegistered(payload)` | If `role === 'STUDENT'`, create `credit_accounts` with default balance |
| `ATTEMPT_COMPLETED` | `onAttemptCompleted(payload)` | Call `CreditService.earn()` with completion reward |

**Event Handler Registration:**

```typescript
// src/modules/credits/credits.events.ts
export function registerCreditEventHandlers(service: CreditService) {
  on<UserRegisteredPayload>('USER_REGISTERED', async (payload) => {
    if (payload.role === 'STUDENT' && payload.studentId) {
      await service.initializeAccount(payload.studentId);
    }
  });

  on<AttemptCompletedPayload>('ATTEMPT_COMPLETED', async (payload) => {
    const reward = parseInt(process.env.CREDIT_COMPLETION_REWARD ?? '5', 10);
    await service.earn(payload.studentId, reward, 'ASSESSMENT_COMPLETION', payload.attemptId);
  });
}
```

**Business Rules You Must Enforce:**

| Rule | How to enforce |
|---|---|
| Balance cannot go below 0 | `FOR UPDATE` row lock + check before decrement |
| Balance cannot exceed maximum | `Math.min(newBalance, maxBalance)` where `maxBalance` from `CREDIT_MAX_BALANCE` env var (default: 200) |
| Append-only transactions | Never UPDATE or DELETE `credit_transactions` |
| Mentor can only verify own mentees | `SELECT 1 FROM student_mentor_assignments WHERE student_id = $1 AND mentor_user_id = $2 AND is_active = true` |
| Student can only toggle own items | Validate `req.user.id === student.user_id` |

**Files / Folders You Own:**

```
backend/src/modules/credits/
backend/src/modules/checklist/
backend/src/modules/verifications/
backend/src/modules/placement/       (create folder, defer implementation)
backend/src/shared/db/migrations/091–120_*.sql
```

**What You Must NOT Modify:**

Files under `src/shared/` (raise a PR to Member 1), `src/modules/assessments/`, `src/modules/performance/`.

---

## 6. Exact Project Structure Creation Order

Follow this order precisely. Each step must be complete before the next begins.

### Step 0 — Resolve Existing Project Conflicts (Member 1, Before Day 1)

The existing backend has a split that must be resolved before Sprint 1 begins.

**Current state (confirmed by reading the files):**

| File | Language | Entry point in | Routes |
|---|---|---|---|
| `backend/src/server.js` | JavaScript (CommonJS) | `package.json` `"main"` and `"start"` | `/api/interview`, `/api/students`, `/api/portals` |
| `backend/src/index.ts` | TypeScript | Test files (`import app from '../src/index'`) | `/api/auth`, `/api/students`, `/api/tasks`, `/api/interviews`, `/api/listening`, `/api/suggestions`, `/api/admin` |

These are two different servers with different routes, different role names, and different technologies. The tests target `index.ts`. The `server.js` exists only as a running JavaScript prototype.

**Resolution steps for Member 1 (commit to `main` as first PR):**

1. Delete `backend/src/server.js` and the two JavaScript route files it imports (`routes/interviewRoutes.js`, `routes/studentRoutes.js`, `routes/portalRoutes.js`)
2. Update `backend/package.json`:
   ```json
   {
     "scripts": {
       "build": "tsc",
       "start": "node dist/index.js",
       "dev": "tsx watch src/index.ts",
       "test": "jest"
     },
     "dependencies": {
       "express": "^4.21.2",
       "pg": "^8.x",
       "bcryptjs": "^2.x",
       "jsonwebtoken": "^9.x",
       "zod": "^3.x",
       "multer": "^1.x",
       "cors": "^2.8.5",
       "helmet": "^7.x",
       "express-rate-limit": "^7.x",
       "dotenv": "^16.x"
     },
     "devDependencies": {
       "typescript": "^5.x",
       "tsx": "^4.x",
       "@types/express": "^5.x",
       "@types/pg": "^8.x",
       "@types/bcryptjs": "^2.x",
       "@types/jsonwebtoken": "^9.x",
       "@types/multer": "^1.x",
       "jest": "^29.x",
       "ts-jest": "^29.x",
       "supertest": "^6.x",
       "@types/supertest": "^6.x"
     }
   }
   ```
3. Existing TypeScript route stubs (`adminRoutes.ts`, `authRoutes.ts`, `taskRoutes.ts`, etc.) contain `SUPER_ADMIN` references and old URL patterns. These stubs will be **replaced** by the new modular structure — do not try to migrate them. Delete the existing `controllers/` folder too.
4. Keep `backend/tests/` — the test files define integration test expectations that the new implementation must satisfy.

**Verification of server.js references (confirmed safe to delete):**

| File | References server.js? | Action required |
|---|---|---|
| `backend/package.json` | YES — `main`, `start`, `dev` scripts | Updated in step 2 above |
| `backend/tests/auth.test.ts` | NO — imports `'../src/index'` | None |
| `start-all.bat` | NO — runs `npm run dev` | Works after package.json updated |
| `start-all.ps1` | NO — runs `npm run dev` | Works after package.json updated |
| `docker-compose.yml` | Does not exist | None |
| `Dockerfile` | Does not exist | None |
| `README.md` | NO | None |

Deleting `server.js` is safe once `package.json` is updated. The `start-all` scripts call `npm run dev` and will automatically use the TypeScript server after package.json is updated.

After this cleanup, `src/index.ts` is the only entry point and the project is pure TypeScript.

---

### Step 1 — Repository Setup (Member 1, Day 1)

```
backend/
  src/
    index.ts              ← existing, update route registration
    shared/
      config/
        env.ts
      types/
        auth.ts           ← AuthUser + Express augmentation
        roles.ts          ← UserRole enum
      db/
        pool.ts
        migrations/       ← empty folder
      errors/
        AppError.ts
      middleware/
        authenticate.ts
        authorize.ts
        validate.ts
        errorHandler.ts
      events/
        eventBus.ts
        events.ts
      utils/
        pagination.ts
        response.ts
  tests/
    shared/
      helpers.ts          ← test DB setup/teardown
```

Commit message: `feat: add shared backend infrastructure (auth, errors, events, db pool)`

### Step 2 — Database Migrations (All members, after Step 1)

Member 1 writes migrations 001–030. Members 2, 3, 4 write their own migration ranges in parallel (no conflicts because ranges don't overlap).

A migration runner script must be created by Member 1 before others write SQL:

```typescript
// backend/src/shared/db/migrate.ts
// Reads all *.sql files in migrations/ directory, runs them in order
// Uses a migrations_run table to track which files have been applied
```

### Step 3 — Module Scaffolds (All members, parallel after Step 2)

Each member creates their module folder with empty files:

```
touch src/modules/<module>/<module>.routes.ts
touch src/modules/<module>/<module>.controller.ts
touch src/modules/<module>/<module>.service.ts
touch src/modules/<module>/<module>.repository.ts
touch src/modules/<module>/<module>.types.ts
```

Then register empty routers in `src/index.ts`. This lets all four modules exist without conflicting.

### Step 4 — Implementation (parallel, bounded by phases — see Section 9)

---

## 7. Database Migration Rules

### 7.1 Number Assignment

| Range | Owner | Notes |
|---|---|---|
| 001–030 | Member 1 | identity + org schemas |
| 031–060 | Member 2 | assessment, session, evaluation schemas |
| 061–090 | Member 3 | performance, knowledge, agent schemas |
| 091–109 | Member 4 | credit, placement schemas |
| 110–119 | Shared (Member 1 writes, all review) | Cross-schema FK constraints only |
| 120–130 | Shared | Seed data |

> **Rule:** No migration number belongs to more than one owner. Member 4's range ends at 109. Migration 115 (`115_add_cross_schema_fks.sql`) falls in the shared FK range 110–119 — it is NOT in Member 4's range. This eliminates the previous conflict where 115 was simultaneously listed as "Member 4" and "Shared FK".

### 7.2 Required Migration Files (MVP only)

**Member 1 migrations:**
```
001_create_extensions.sql          ← CREATE EXTENSION IF NOT EXISTS "pgcrypto"; vector;
002_create_system_schema.sql       ← audit_logs, outbox_events
003_create_identity_schema.sql     ← users, roles, permissions, role_permissions, role_assignments
004_create_org_schema.sql          ← institutions, departments, programs, batches, subdivisions
005_create_org_students.sql        ← students, resumes, student_mentor_assignments, trainer_subdivision_assignments
006_create_identity_indexes.sql    ← indexes on users.email, students.user_id, etc.
```

**Cross-schema FK dependency problem — must read before writing migrations:**

Two FK constraints cross ownership boundaries in a way that violates run-order:

| Dependent table | FK column | Referenced table | Problem |
|---|---|---|---|
| `session.question_bank_item_skills` | `skill_id` | `performance.skills` | M2 migration 034 runs before M3 migration 061 — `skills` does not exist yet |
| `session.assessment_sessions` | `listening_story_id` | `performance.listening_stories` | M2 migration 033 runs before M3 migration 062 — `listening_stories` does not exist yet |

**Resolution — use a deferred FK migration:**

Create the tables WITHOUT the cross-schema FK constraints in their primary migrations. Add the FK constraints in a dedicated migration that runs AFTER all schemas exist (migration 115, in Member 4's number range so it is the last major structural migration):

```
115_add_cross_schema_fks.sql   ← Member 1 writes; all members review before merge
```

Contents of `115_add_cross_schema_fks.sql`:
```sql
BEGIN;
-- Add FK from question_bank_item_skills → skills (after both tables exist)
ALTER TABLE session.question_bank_item_skills
  ADD CONSTRAINT fk_qbis_skill_id
  FOREIGN KEY (skill_id) REFERENCES performance.skills(id) ON DELETE RESTRICT;

-- Add FK from assessment_sessions → listening_stories (after both tables exist)
ALTER TABLE session.assessment_sessions
  ADD CONSTRAINT fk_sessions_listening_story_id
  FOREIGN KEY (listening_story_id) REFERENCES performance.listening_stories(id) ON DELETE SET NULL;
COMMIT;
```

> **Rule:** Any FK that references a table in a DIFFERENT member's migration range must NOT be included in the primary table-creation migration. It must go in `115_add_cross_schema_fks.sql`. All such constraints are collected in one place for visibility.

**Member 2 migrations:**
```
031_create_schemas.sql             ← CREATE SCHEMA assessment; CREATE SCHEMA session; CREATE SCHEMA evaluation;
032_create_assessment_tables.sql   ← assessments, assessment_components
033_create_attempts.sql            ← assessment_attempts
034_create_sessions.sql            ← assessment_sessions (WITHOUT listening_story_id FK — add in 115)
035_create_questions.sql           ← question_bank_items, questions
036_create_question_skills.sql     ← question_bank_item_skills (WITHOUT skill_id FK — add in 115)
037_create_responses.sql           ← responses, ai_runs, response_evaluations
038_create_reports.sql             ← assessment_reports
039_create_assessment_indexes.sql
```

**Member 3 migrations:**
```
061_create_performance_schema.sql  ← CREATE SCHEMA performance; skills, performance_profiles, performance_snapshots, skill_performances
062_create_listening.sql           ← listening_stories
063_create_learning.sql            ← learning_plans, learning_recommendations (create table, defer use)
064_create_knowledge_schema.sql    ← CREATE SCHEMA knowledge; knowledge_documents, knowledge_chunks (with vector column)
065_create_agent_schema.sql        ← CREATE SCHEMA agent; agent_definitions, agent_runs, agent_steps (create table, defer use)
066_create_performance_indexes.sql
```

**Member 4 migrations (range 091–109):**
```
091_create_credit_schema.sql       ← credit_accounts, credit_transactions, credit_policies
092_create_placement_schema.sql    ← checklist_items, checklist_progress, mentor_verifications, placement_eligibility
093_create_credit_indexes.sql
```

**Shared cross-schema FK migrations (range 110–119, written by Member 1, all members review):**
```
115_add_cross_schema_fks.sql       ← FK constraints that cross member ownership boundaries
```

**Shared seed data (range 120–130):**
```
120_seed_institution.sql           ← INSERT one institution row
121_seed_programs.sql              ← INSERT HOPE Track, PEP Track, Department Stream programs
122_seed_subdivisions.sql          ← INSERT 21 PEP domains + HOPE Elite + HOPE Non-Elite
123_seed_skills.sql                ← INSERT ~50 skills (Full Stack, Cloud, AI/ML, etc.)
124_seed_listening_stories.sql     ← INSERT 3–5 listening stories for testing
125_seed_checklist_items.sql       ← INSERT sample placement criteria tasks
```

### 7.3 Migration File Template

```sql
-- NNN_description.sql
-- Owner: Member X
-- Created: YYYY-MM-DD
-- Description: What this migration does

BEGIN;

CREATE TABLE IF NOT EXISTS schema_name.table_name (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- ... columns
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_table_name_column
  ON schema_name.table_name (column_name);

COMMIT;
```

---

## 8. Git Branch Strategy

### 8.1 Branch Structure

```
main          ← protected, always deployable, requires 1 PR approval
  └── develop ← integration branch, all feature branches merge here first
        ├── feature/M1-shared-infra
        ├── feature/M1-auth
        ├── feature/M1-students
        ├── feature/M2-assessments
        ├── feature/M2-sessions
        ├── feature/M2-ai-client
        ├── feature/M3-performance
        ├── feature/M3-skills
        ├── feature/M4-credits
        ├── feature/M4-checklist
        └── fix/M2-session-state-bug
```

### 8.2 Branch Naming Convention

```
feature/M{1|2|3|4}-short-description
fix/M{1|2|3|4}-short-description
chore/M{1|2|3|4}-short-description
migration/M{1|2|3|4}-NNN-description
```

### 8.3 Rules

| Rule | Reason |
|---|---|
| Never commit directly to `main` or `develop` | Prevents accidental overwrites |
| One PR per logical feature unit | Keeps PRs reviewable (< 400 lines) |
| All PRs merge to `develop` first | `develop` is the integration surface |
| `develop` → `main` is a single PR per milestone | Only after integration testing passes |
| Require 1 approval from a different member | Catches bugs, shares knowledge |
| Delete branch after merge | Keeps repo clean |
| Never merge your own PR | At least one review |

### 8.4 Handling Shared Infrastructure Changes

When a shared file (e.g., `src/shared/types/auth.ts`) needs a change:

1. The member who needs the change opens a PR to `develop` with the change in `src/shared/`
2. Member 1 reviews and approves (Member 1 is the shared infra owner)
3. After merge to `develop`, all other branches must `git rebase develop` before their next PR

### 8.5 Migration Conflict Prevention

Migrations use numbered ranges (see Section 7.1). Members never pick numbers outside their range. If two members try to commit `031_*.sql` on the same day — that cannot happen because Member 2 owns 031–060 exclusively.

### 8.6 Daily Workflow

```bash
# Each morning — sync with develop
git fetch origin
git rebase origin/develop

# Work in feature branch
git checkout -b feature/M2-sessions

# Commit often with conventional commit messages
git commit -m "feat: add session state machine transitions"
git commit -m "test: add session COMPLETED transition test"

# Before opening PR — rebase and check
git rebase origin/develop
npm test
npm run build  # verify TypeScript compiles

# Open PR to develop
gh pr create --base develop --title "feat(M2): session lifecycle endpoints"
```

### 8.7 When Another Member Breaks Your Work

If a merge to `develop` breaks your branch:

1. `git rebase origin/develop` — resolve conflicts
2. If the conflict is in a shared file you did not change, ask the author to help resolve
3. If the conflict is a migration file — check numbering (should not conflict if ranges are followed)
4. If a shared interface changed (e.g., `AuthUser`), update your module's imports

---

## 9. Dependency-Aware Parallel Implementation Order

This schedule shows what each member can work on simultaneously without blocking each other. Work in the same vertical column happens in parallel.

### Sprint 1 — Foundation (Week 1) — All parallel

| Member 1 | Member 2 | Member 3 | Member 4 |
|---|---|---|---|
| Create `src/shared/` infrastructure | Design session state machine (paper/docs) | Design performance aggregation logic (paper/docs) | Design credit ledger rules (paper/docs) |
| Write migrations 001–006 | Write migrations 031–037 (schema only) | Write migrations 061–066 (schema only) | Write migrations 091–093 (schema only) |
| Implement `pool.ts`, `AppError.ts`, `eventBus.ts` | Create module folder scaffolds | Create module folder scaffolds | Create module folder scaffolds |
| Write auth types (`AuthUser`, `UserRole`) | Define AI service request/response types | Write skill seed data SQL | Write checklist seed data SQL |
| **Deliverable:** `shared/` committed to `main` | **Deliverable:** Migrations + scaffolds committed to `develop` | **Deliverable:** Migrations + scaffolds committed to `develop` | **Deliverable:** Migrations + scaffolds committed to `develop` |

**Gate:** Before Sprint 2, Member 1's `shared/` must be on `main`. Others rebase.

---

### Sprint 2 — Auth + Core (Week 2) — Mostly parallel

| Member 1 | Member 2 | Member 3 | Member 4 |
|---|---|---|---|
| `POST /api/auth/register` | `assessments` CRUD (no credit check yet) | Skills CRUD with seed data | **`CreditService.consume()` — PRIORITY** |
| `POST /api/auth/login` | Question bank CRUD | Listening stories seed + CRUD | `credit_accounts` creation handler for `USER_REGISTERED` |
| `GET /api/auth/me` | Question bank skill tagging (reads Member 3's `skills`) | Performance profile init handler for `USER_REGISTERED` | Default credit balance from env var |
| Student profile endpoints | Assessment component config | | Checklist items CRUD |
| Emit `USER_REGISTERED` event | | | |
| **Deliverable:** Auth works end-to-end | **Deliverable:** Can create assessments and question bank | **Deliverable:** Skills available, performance profile created on register | **Deliverable:** `CreditService.consume()` ready for Member 2 to import |

**Gate:** Member 1 auth must be working before Member 2 can test protected routes. Member 4 must deliver `CreditService.consume()` before Sprint 3 attempt creation.

---

### Sprint 3 — Assessment Pipeline (Week 3) — Sequential within M2, parallel across members

| Member 1 | Member 2 | Member 3 | Member 4 |
|---|---|---|---|
| Resume upload endpoint | Wire `CreditService.consume()` into `AttemptService` | Performance aggregation logic for `ATTEMPT_COMPLETED` | Credit earning on `ATTEMPT_COMPLETED` event |
| Trainer tenure middleware | Start attempt endpoint | Snapshot creation | Checklist progress toggle endpoint |
| Mentor assignment endpoints | Start session endpoint | Skill performance aggregation | Mentor verification endpoint |
| | Proctoring telemetry endpoint | | |
| | Submit response + AI client call | | |
| | Response evaluation persistence | | |
| | Complete session + report generation | | |
| | Emit `ATTEMPT_COMPLETED` event | | |
| **Deliverable:** Trainer and mentor flows complete | **Deliverable:** Full assessment flow: start → evaluate → report | **Deliverable:** Performance profile updates after assessment | **Deliverable:** Credit consumed and refunded per assessment |

**Gate:** By end of Sprint 3, the core student journey is complete: register → start assessment → get evaluated → see report → performance updated.

---

### Sprint 4 — Integration, Post-MVP Features, Hardening (Week 4)

| Member 1 | Member 2 | Member 3 | Member 4 |
|---|---|---|---|
| Org hierarchy endpoints (departments, batches) | Listening session replay limiter | Learning plans (basic) | Placement eligibility (basic) |
| College-wide student list with filters | Admin interview assignment | Performance dashboard aggregates | College eligibility report |
| Trainer/mentor scoping verification | Question generation via AI service | Knowledge/RAG (if time permits) | Credit transactions history |
| OpenAPI setup + shared config | OpenAPI for assessment routes | OpenAPI for performance routes | OpenAPI for credit routes |
| Security audit (rate limiting, helmet) | Load test assessment pipeline | | |
| **Deliverable:** All admin portals functional | **Deliverable:** Listening assessment + admin features | **Deliverable:** Performance analytics visible | **Deliverable:** Checklist → eligibility flow end-to-end |

---

## 10. Integration Checkpoints

These are the moments where the team must stop, integrate, and test together before proceeding.

### Checkpoint 1 — End of Sprint 1

**Test:** Database migrates cleanly from zero. All tables exist. No FK errors.

```bash
# Run by all members together
psql $DATABASE_URL < migrations/001_*.sql
# ... all migrations in order
psql $DATABASE_URL -c "\dt identity.*"
psql $DATABASE_URL -c "\dt org.*"
psql $DATABASE_URL -c "\dt assessment.*"
psql $DATABASE_URL -c "\dt performance.*"
psql $DATABASE_URL -c "\dt credit.*"
psql $DATABASE_URL -c "\dt placement.*"
```

---

### Checkpoint 2 — End of Sprint 2

**Test:** Student registration creates the identity records transactionally, and the event-driven dependent records are created asynchronously.

The registration flow has two distinct phases:
1. **Transactional (synchronous):** `POST /api/auth/register` completes a single DB transaction that creates the `identity.users` row and the `org.students` row. If either write fails, both are rolled back. The HTTP response returns only after this transaction commits.
2. **Asynchronous (event-driven):** After the DB transaction commits, Member 1's code emits `USER_REGISTERED`. Two independent handlers fire asynchronously — Member 3 creates `performance.performance_profiles`, Member 4 creates `credit.credit_accounts`. These are NOT part of the registration transaction. If a handler fails, it logs the error but does not affect the HTTP response. The student exists immediately; their profile and credit account are created within milliseconds, but there is a brief window where they may not exist yet.

> **Known limitation (MVP):** Because the EventEmitter is in-process and fire-and-forget, a handler crash leaves a student without a performance profile or credit account. For Sprint 2 testing, run the test on a clean database with no load — handler failures are rare in a test environment. For production, this is the motivation for post-MVP outbox migration (see Section 3.8).

```bash
# POST /api/auth/register with role=STUDENT
# Verify — in two phases:
# Phase 1 (synchronous — must be present in HTTP response):
#   1. users row created in identity.users
#   2. students row created in org.students
#   3. JWT returned with tokenVersion=0, role=STUDENT
# Phase 2 (asynchronous — poll or add small delay in test):
#   4. performance_profiles row created (Member 3 event handler)
#   5. credit_accounts row created with default balance (Member 4 event handler)
```

**All 4 members run this test on a shared test database before declaring Sprint 2 done.**

---

### Checkpoint 3 — End of Sprint 3

**Test:** Full student interview journey works end-to-end.

```
1. Register student (POST /api/auth/register)
2. Upload resume (POST /api/students/:id/resume)
3. Check credit balance (GET /api/credits/balance/:studentId) — should = DEFAULT_CREDIT_BALANCE
4. Start attempt (POST /api/attempts/start) — credit balance decreases
5. Start session (POST /api/sessions/start)
6. Submit response with transcript (POST /api/responses/submit) — AI evaluation runs
7. Complete session (POST /api/sessions/:id/complete) — report generated
8. Verify report (GET /api/reports/:attemptId) — scores present
9. Check performance profile (GET /api/performance/:studentId) — updated scores
10. Check credit balance again — should have earned completion reward
```

This is the **core user journey test**. If it passes, MVP is functionally complete.

---

### Checkpoint 4 — End of Sprint 4

**Test:** Full multi-role platform test.

```
Coordinator: create checklist items
Student: register, take interview, mark checklist items complete
Mentor: view mentee list, verify checklist items
Admin: view student list, view reports
Trainer: (active tenure) view subdivision students
```

---

## 11. Risk Register

| Risk | Probability | Impact | Owner | Mitigation |
|---|---|---|---|---|
| Member 1 delays delivering shared infra | Medium | High (blocks all others) | Member 1 | Allocate first 2 days exclusively to `shared/`. Other members work on paper designs during this time. |
| FastAPI AI service not ready when Member 2 needs it | High | Medium | Member 2 | Build `MockAIClient` that returns deterministic scores. Wire real client behind a flag: `AI_USE_MOCK=true`. |
| `CreditService.consume()` not ready before Sprint 3 attempt creation | Medium | Medium | Member 4 | Member 4 must deliver stub-compatible signature in Sprint 2. Member 1 provides a stub that returns `{ newBalance: 50 }`. |
| Migration numbering collision | Low | Low | All | Strict range enforcement: M1=001–030, M2=031–060, M3=061–090, M4=091–109, Shared FKs=110–119, Seeds=120–130. Every number has exactly one owner. Check at PR review. |
| `ATTEMPT_COMPLETED` payload schema disagreement between M2 and M3/M4 | Medium | Medium | All | Agree and commit `events.ts` type file before Sprint 3 starts. Lock the interface — changes require all-team approval. |
| Member 3 over-scoped (too many tables for MVP) | High | Medium | Member 3 | Section 4 explicitly defers agents, knowledge/RAG, learning plans to post-MVP. Member 3 focuses on performance + skills for MVP. |
| Cross-module table access creates accidental coupling | Medium | Low | All | Rule: only SELECT across module boundaries, never INSERT/UPDATE. Enforced in PR review. |
| PostgreSQL schema naming conflicts (`performance` schema holds both M2 `assessment_reports` and M3 tables) | Medium | Low | All | ISSUE-01 resolved: `assessment_reports` moves to `assessment` schema. Member 2 owns it. |
| Shared `authenticate.ts` changes break other modules mid-sprint | Low | High | Member 1 | Treat `authenticate.ts` as a locked interface after Sprint 1. Changes require all-team approval and rebase. |

---

## 12. FINAL PRE-IMPLEMENTATION STATUS

> This section is the outcome of the internal consistency review. All architectural contradictions identified in the review have been resolved and are listed below. **Read this section before writing a single line of code.**

---

### LOCKED DECISIONS

Every decision here is final. No team member may re-open these during implementation without a full team discussion and a pull request updating this document.

**Technology:**
- Runtime: Node.js 18+, TypeScript strict mode, Express 4
- Entry point: `src/index.ts` only. `server.js` is deleted in Step 0 (safe — no Docker, no standalone script references it; `start-all.bat`/`start-all.ps1` use `npm run dev` which is updated in the same PR)
- Database: Raw `pg` driver, parameterized queries only. No ORM.
- Dependencies added by Member 1: `pg`, `bcryptjs` (salt=10), `jsonwebtoken`, `zod`, `multer`, `cors`, `helmet`, `express-rate-limit`, `dotenv`
- AI service: Python FastAPI, called via HTTP at `AI_SERVICE_URL`

**Schema layout** (authoritative — supersedes all earlier documents including DATA_MODEL.md where it conflicts):

| Schema | Owner | Key tables |
|---|---|---|
| `identity` | M1 | `users`, `roles`, `permissions`, `role_permissions`, `role_assignments` |
| `org` | M1 | `institutions`, `departments`, `programs`, `batches`, `subdivisions`, `students`, `resumes`, `student_mentor_assignments`, `trainer_subdivision_assignments` |
| `assessment` | M2 | `assessments`, `assessment_components`, `assessment_attempts`, `assessment_reports` |
| `session` | M2 | `assessment_sessions`, `question_bank_items`, `question_bank_item_skills`, `questions` |
| `evaluation` | M2 | `responses`, `ai_runs`, `response_evaluations` |
| `performance` | M3 | `skills`, `student_skills`, `performance_profiles`, `performance_snapshots`, `skill_performances`, `learning_plans`, `learning_recommendations`, `listening_stories` |
| `knowledge` | M3 | `knowledge_documents`, `knowledge_chunks` |
| `agent` | M3 | `agent_definitions`, `agent_runs`, `agent_steps` |
| `credit` | M4 | `credit_accounts`, `credit_transactions`, `credit_policies` |
| `placement` | M4 | `checklist_items`, `checklist_progress`, `mentor_verifications`, `placement_eligibility` |
| `system` | Shared | `audit_logs`, `outbox_events` |

> `assessment_reports` is in the `assessment` schema, owned by Member 2. DATA_MODEL.md placed it in `performance` — that was incorrect. This document's placement is final.

**Roles** (the only valid values; `SUPER_ADMIN` is banned):
```
STUDENT | FACULTY_MENTOR | PROGRAM_ADMIN | TRAINER | PLACEMENT_COORDINATOR
```

**API paths** (replacing all legacy stubs):
- `/api/tasks` → `/api/checklist` (Member 4)
- `/api/interviews` or `/api/interview` → `/api/sessions` (Member 2)
- `/api/portals` → split into `/api/admin/*` (Member 1)
- `/api/listening` → kept (Member 2, separate listening sub-flow router)
- `/api/suggestions` → post-MVP (Member 2)
- `register-external` and `verify-email` endpoints → removed from MVP

**Authentication:**
- `POST /api/auth/register` always creates `STUDENT` — `role` field in request body is ignored
- JWT: `{ sub, email, role, tokenVersion, iat, exp }`, expiry `JWT_EXPIRES_IN=7d`
- Token revocation: `token_version` is checked on **every authenticated request** (not just sensitive operations). The `authenticate` middleware queries `identity.users.token_version` and compares it as an integer to `jwt.tokenVersion`. Mismatch → 401. The `iat` field plays no role in revocation.
- Logout: `UPDATE identity.users SET token_version = token_version + 1`

**Registration consistency model:**
- **Transactional** (single DB transaction, rolled back together on failure): `identity.users` + `org.students`
- **Asynchronous / eventually consistent** (created by EventEmitter handlers after the HTTP response): `performance.performance_profiles` (Member 3) + `credit.credit_accounts` (Member 4). These are NOT part of the registration transaction. There is a brief window after registration where they do not exist — handlers are idempotent and run within milliseconds under normal conditions.

**Score formula:**
- AI service returns raw `filler_count` (integer). Convert to `fillerScore = max(0, 100 - filler_count × FILLER_PENALTY_PER_WORD)` before using in formula.
- `commAvg = (fluency × 0.35) + (paceScore × 0.25) + (fillerScore × 0.20) + (clarity × 0.20)`
- `overall = (techAvg × 0.70) + (commAvg × 0.30)`
- Variable name `fillerPenalty` is banned — use `fillerScore`

**Credit deduction:**
- `CreditService.consume()` is a **synchronous direct call** from `AttemptService` — not event-driven. Insufficient credits must block attempt creation synchronously; an async event cannot return a 402 to a waiting HTTP client.

**`question_bank_item_skills.skill_id` FK design:**
- Use `skill_id UUID REFERENCES performance.skills(id) ON DELETE RESTRICT` (not VARCHAR skill_name)
- Rationale: referential integrity is worth the cross-schema dependency; the deferred FK migration (115) already solves the ordering problem
- Constraint is deferred to `115_add_cross_schema_fks.sql`; the column is nullable in the primary migration

**Migration ranges** (every number has exactly one owner — no overlaps):

| Range | Owner |
|---|---|
| 001–030 | Member 1 |
| 031–060 | Member 2 |
| 061–090 | Member 3 |
| 091–109 | Member 4 |
| 110–119 | Shared cross-schema FKs (Member 1 writes, all review) |
| 120–130 | Shared seed data |

Migration 115 is in the shared FK range 110–119. Member 4's range ends at 109.

**EventEmitter:** In-process, fire-and-forget, MVP only. Known limitations documented in Section 3.8. Post-MVP migration path: DB-backed outbox.

**Git:** `main` (protected) ← `develop` ← `feature/M{n}-*`. All PRs target `develop`. `develop → main` only at milestone end. `server.js` deletion is the first commit to `main`.

**Cross-module access:** SELECT across any schema boundary is allowed. INSERT/UPDATE/DELETE across ownership boundary is never allowed. The only documented cross-module service call is `Member 2 → Member 4: CreditService.consume()`.

---

### REMAINING PRODUCT DECISIONS

These are genuine team choices — not resolvable from the architecture documents. They require the 4-person team to agree on values. All 5 are env-var-controlled so the code does not need to be re-written when values change.

| # | Question | Suggested default (env var) | Blocks |
|---|---|---|---|
| OI-01 | Initial credit balance for a new student | `DEFAULT_CREDIT_BALANCE=50` | Member 4: `initializeAccount()` |
| OI-02 | Credit cost per assessment attempt | `CREDIT_COST_PER_ATTEMPT=10` | Member 2: `AttemptService.start()` |
| OI-03 | Credit reward for completing an assessment | `CREDIT_COMPLETION_REWARD=5` | Member 4: `ATTEMPT_COMPLETED` handler |
| OI-04 | Questions per session (by session type) | `MOCK_INTERVIEW_QUESTION_COUNT=5`, `LISTENING_QUESTION_COUNT=3` | Member 2: `SessionService.complete()` |
| OI-06 | How is the initial `PLACEMENT_COORDINATOR` seeded? | Option A: hardcoded credentials in `120_seed_institution.sql` with `SEED_COORDINATOR_EMAIL` / `SEED_COORDINATOR_PASSWORD` env vars | Member 1: seed migration and auth test setup |

---

### IMPLEMENTATION BLOCKERS

These items must be decided **before the first implementation commit for the indicated sprint**.

| Blocker | Must be decided before | Decision owner |
|---|---|---|
| OI-06: Coordinator seeding strategy | Member 1 writes seed migration (Sprint 1) | Full team |
| OI-01: Default credit balance | Member 4 writes `initializeAccount()` (Sprint 2) | Full team |
| OI-02: Credit cost per attempt | Member 2 wires `CreditService.consume()` (Sprint 3) | Full team |
| OI-03: Credit completion reward | Member 4 writes `ATTEMPT_COMPLETED` handler (Sprint 3) | Full team |
| OI-04: Questions per session | Member 2 writes `SessionService.complete()` (Sprint 3) | Full team |

Sprint 1 (infrastructure, scaffolding, migrations) is **not blocked** by any of these — all five are Sprint 2/3 concerns.

---

### READY FOR IMPLEMENTATION

**YES** — Sprint 1 can begin immediately.

All architectural contradictions identified in the consistency review have been resolved:

| Contradiction | Resolution | Where |
|---|---|---|
| Migration 115 was in both M4 range and "Shared FK" | Redesigned ranges: M4=091–109, Shared FKs=110–119 | Sections 3.9, 7.1, 11 |
| Checkpoint 2 described event-driven records as "atomic" | Clarified: users/students are transactional; profiles/accounts are async | Section 10 |
| `token_version` revocation scope was an open question (OI-05) | Locked: checked on every authenticated request (D-03) | Sections 3.3, 12 |
| `assessment_reports` schema disputed (OI-08) | Locked: `assessment` schema, Member 2 owns it (ISSUE-01) | Sections 5.2, 12 |
| `question_bank_item_skills` FK vs VARCHAR was open (OI-07) | Locked: use FK with deferred constraint in migration 115 | Sections 1.2, 7.2, 12 |
| FK table (Section 1.2) had wrong schemas for `session`/`evaluation` tables | Fixed: corrected to `session` and `evaluation` schemas | Section 1.2 |
| `server.js` deletion safety was unverified | Verified: safe; only `package.json` needs updating | Section 6 Step 0 |

Five product decisions (OI-01 through OI-04, OI-06) remain open but do not block Sprint 1. They must be resolved before the specific Sprint 2/3 functions that depend on their values.

---

*Part I of this document (Sections 1–12) covers the team allocation review, resolved design decisions, shared contracts, per-member implementation cards, sprint schedule, and pre-implementation status. Part II below adds the full programme-level architecture specification.*

---

# Part II: Full Architecture Specification

---

## FINAL ARCHITECTURE

The platform uses a strict two-layer backend. Node.js is the application backend. FastAPI is the AI service. These are separate deployable processes with a well-defined HTTP boundary between them. FastAPI does not replace Node.js — it augments it.

```
┌────────────────────────────────────────────────────────┐
│  Browser — React 18 + TypeScript + Vite + Tailwind     │
└────────────────────┬───────────────────────────────────┘
                     │  HTTPS REST + SSE
┌────────────────────▼───────────────────────────────────┐
│  Node.js 18 + Express 4 + TypeScript  (port 5000)      │
│  Main application backend                              │
│  Auth · RBAC · Business rules · REST API               │
│  PostgreSQL persistence · Transactions                 │
│  Credits · Assessment lifecycle · Event orchestration  │
└──┬────────────┬────────────┬─────────────┬─────────────┘
   │ SQL        │ Redis      │ RabbitMQ    │ MinIO/S3
┌──▼──┐  ┌──────▼──────┐ ┌──▼──────────┐ ┌▼──────────┐
│ PG  │  │ Redis 7     │ │ RabbitMQ 3  │ │ MinIO/S3  │
│+vec │  │ rate-limit  │ │ reliable    │ │ files     │
│     │  │ cache · SSE │ │ events      │ │ resumes   │
└─────┘  └─────────────┘ └──┬──────────┘ └───────────┘
                             │ subscribe (post-MVP)
               ┌─────────────▼──────────────────────────┐
               │  FastAPI — Python 3.11  (port 8000)    │
               │  AI service only                       │
               │  LLM calls · AI evaluation             │
               │  Question generation                   │
               │  Communication analysis                │
               │  RAG (pgvector queries)                │
               │  LangGraph agent execution             │
               └─────────────┬──────────────────────────┘
                             │
               ┌─────────────▼──────────────────────────┐
               │  LLM / AI APIs (Groq / OpenAI)         │
               └────────────────────────────────────────┘
```

**Invariant:** Node.js is the only service that writes to PostgreSQL application tables. FastAPI returns structured results to Node.js as HTTP response bodies. Node.js persists them.

---

## FINAL STACK

| Technology | Classification | Reason |
|---|---|---|
| Node.js 18 + Express 4 + TypeScript | **Core MVP** | Main application backend. Already in project. |
| PostgreSQL 16 + pgcrypto | **Core MVP** | Primary database. ACID, schemas, `gen_random_uuid()`. |
| `pg` (node-postgres) | **Core MVP** | Raw SQL driver. Parameterized queries. No ORM. |
| `zod` | **Core MVP** | TypeScript-native request validation. |
| `bcryptjs` + `jsonwebtoken` | **Core MVP** | Password hashing + JWT. |
| `multer` | **Core MVP** | Resume upload. Already imported in project stubs. |
| `helmet` + `express-rate-limit` | **Core MVP** | Basic HTTP security headers + rate limiting. |
| Python 3.11 + FastAPI | **Core MVP** | AI service. Groq integration already working. |
| Groq LLM API | **Core MVP** | LLM evaluation and question generation. Already integrated. |
| Docker + Docker Compose | **Core MVP** | Local dev environment parity. Required for team consistency. |
| Jest + Supertest | **Core MVP** | Node.js unit + integration tests. Already used in project. |
| Pytest + httpx | **Core MVP** | FastAPI test suite. httpx for async HTTP testing. |
| React 18 + TypeScript + Vite + Tailwind | **Core MVP** | Frontend. Already in project. |
| GitHub Actions | **Core MVP** | CI pipeline. Required from Foundation gate (Day 9). |
| Redis 7 | **Required — Foundation** | Rate limiting (Redis store for distributed correctness), response caching, SSE pub/sub state. |
| SSE (Server-Sent Events) | **Required — Alpha** | Assessment completion notifications. Node.js pushes AI result to waiting student. One-directional — no need for WebSocket. Owner: Member 2. |
| SQLAlchemy (Core async) + asyncpg | **Required — Beta** | FastAPI uses async SELECT-only queries for pgvector RAG search on `knowledge.knowledge_chunks`. No Alembic — Node.js owns all migrations. |
| RabbitMQ 3.x | **Required — Beta** | Replace in-process EventEmitter for reliable `USER_REGISTERED` and `ATTEMPT_COMPLETED` events. Programme requirement for message broker. |
| MinIO / S3-compatible | **Required — Beta** | Object storage for resumes and knowledge documents. Dev: MinIO Docker. Prod: S3. Replaces local disk MVP. |
| pgvector (PostgreSQL extension) | **Required — Beta** | Semantic search for RAG. Extension already in migration 001. Column exists; queries deferred until RAG feature built. |
| LangGraph | **Required — Beta** | Adaptive agent workflows in FastAPI. Member 3. Post-MVP. |
| Playwright | **Required — Beta** | E2E tests for student interview flow and mentor verification flow. |
| Postman / Newman | **Required — Beta** | API contract tests in CI. Member 2 defines assessment collection. |
| `pino` (Node.js) + `logging` (Python) | **Required — Alpha** | Structured JSON logs. Required for observability pipeline. |
| OpenTelemetry SDK | **Required — Beta** | Distributed traces through Node.js → FastAPI. |
| Prometheus + Grafana | **Required — Release** | Metrics dashboard. Request rate, evaluation latency, error rate. |
| Loki + Promtail | **Required — Release** | Log aggregation. Queryable logs across services. |
| k6 | **Required — Release** | Performance/load testing for the assessment pipeline. |
| Semgrep | **Required — Release** | Static analysis in CI. OWASP Top 10 rules, secret scanning. |
| Trivy | **Required — Release** | Container image vulnerability scanning in CI. |
| OWASP ZAP | **Required — Release** | Dynamic security testing against running stack. |
| Kubernetes (fundamentals) | **Required — Defence** | Programme gate. Manifests for deployments, services, ingress, HPA. Not runtime-critical for MVP. |
| Terraform (fundamentals) | **Required — Defence** | Programme gate. IaC for cloud resources (DB, Redis, S3, container registry, cluster). |
| Vitest | **Optional** | Frontend unit tests. Lower priority than Playwright E2E. Jest-compatible if needed. |
| Celery / RQ | **Optional** | Python background work. Only needed if FastAPI requires a separate job queue beyond internal async. RabbitMQ consumer in FastAPI is sufficient for most cases. |
| Qdrant | **Not justified** | pgvector on existing PostgreSQL covers RAG at this scale. Separate Qdrant instance adds infra overhead with no benefit. |
| Alembic | **Not justified** | Node.js owns all PostgreSQL migrations via numbered SQL files. FastAPI has no independent schema to manage. |

---

## NODE.JS ↔ FASTAPI RESPONSIBILITY BOUNDARY

### Why the split is correct for this product

Node.js handles all stateful, transactional, business-rule-enforcing operations. FastAPI handles all compute-intensive AI/LLM work that benefits from Python's AI ecosystem (LangGraph, vector operations, Groq SDK). The boundary keeps business logic in one transaction-safe layer and allows the AI service to scale independently if LLM latency becomes a bottleneck.

The programme specifies FastAPI as a backend technology. In this project, FastAPI fulfils that role as the AI backend, while Node.js/Express fulfils the role as the main product API. Both are backend services. They are not in competition.

### Node.js owns:

| Concern | Example |
|---|---|
| Authentication and JWT | Issue tokens, revocation check on every request |
| Authorization / RBAC | `authorize(['FACULTY_MENTOR'])` middleware |
| All REST API endpoints served to the browser | `/api/assessments`, `/api/credits`, etc. |
| All PostgreSQL writes | Every INSERT / UPDATE / DELETE to every schema |
| ACID transactions | Credit deduction + attempt creation in one `BEGIN`/`COMMIT` |
| Business rule enforcement | Credit balance ≥ 0; attempt limit per student |
| Assessment lifecycle state machine | NOT_STARTED → IN_PROGRESS → COMPLETED |
| Session orchestration | Create session, route questions, record proctoring events |
| Event publishing | To EventEmitter (MVP) / RabbitMQ (production) |
| Event consumption | `USER_REGISTERED` → create performance profile + credit account |
| HTTP response formatting | Standard `{ data, pagination }` envelope |
| Rate limiting | `express-rate-limit` with Redis store |
| File upload validation | Multer + MIME type + size limit before writing to storage |
| Audit logging | Every state-changing operation → `system.audit_logs` |
| SSE connection management | Hold open connections; push AI completion events to client |

### FastAPI owns:

| Concern | Example |
|---|---|
| LLM API calls | Groq / OpenAI API with prompt construction and retry |
| Technical evaluation | Score 0–100 per response, strengths, weaknesses, feedback |
| Communication analysis | Fluency, clarity, pace WPM, filler count from transcript |
| AI-generated questions | `POST /ai/generate-question` with resume context |
| RAG retrieval | pgvector similarity search on `knowledge.knowledge_chunks` |
| LangGraph workflow execution | Multi-step adaptive interview agent |
| Embedding generation | Convert document text to vector embeddings |
| AI model configuration | Model name, temperature, token limits |
| AI error handling | Fallback scoring, partial results on timeout |
| AI-specific metrics | Evaluation latency, token usage, model error rate |

### Data flow — response evaluation (the critical path):

```
Student submits transcript
  ↓
Node.js: POST /api/responses/submit
  ↓ authenticate + authorize
  ↓ validate input (zod)
  ↓ INSERT INTO evaluation.responses (transcript, ...)
  ↓ INSERT INTO evaluation.ai_runs (status=PENDING, ...)
  ↓ POST http://AI_SERVICE_URL/ai/evaluate-response
       { transcript, question_text, difficulty, resume_context }
       ↓
       FastAPI: build LLM prompt
       ↓ call Groq API → structured JSON
       ↓ return { technical_score, fluency_score, clarity_score,
                  pace_wpm, filler_count, feedback, strengths, weaknesses }
  ↓
Node.js receives FastAPI response
  ↓ fillerScore = max(0, 100 - filler_count × FILLER_PENALTY_PER_WORD)
  ↓ paceScore = derivePaceScore(pace_wpm)
  ↓ commAvg = fluency×0.35 + pace×0.25 + filler×0.20 + clarity×0.20
  ↓ overall = tech×0.70 + comm×0.30
  ↓ INSERT INTO evaluation.response_evaluations (scores, feedback, ...)
  ↓ UPDATE evaluation.ai_runs SET status=COMPLETED
  ↓ return { data: evaluationResult } to client
```

FastAPI never writes to PostgreSQL in this flow. All DB writes are in Node.js.

### Synchronous vs async AI calls:

| Operation | Pattern | Reason |
|---|---|---|
| Response evaluation | Synchronous Node.js → FastAPI HTTP | Student waits for score; must be blocking |
| Question generation | Synchronous (small latency acceptable) | Student sees question immediately |
| RAG retrieval | Synchronous within FastAPI (fast pgvector) | Needed before LLM call to ground the prompt |
| Knowledge document ingestion | Async background (RabbitMQ consumer in FastAPI) | Does not need to be real-time |
| LangGraph agent execution | Synchronous request per step, async across steps | Steps have human-in-the-loop pauses |

---

## FOUR-MEMBER OWNERSHIP

Full per-member implementation cards are in Section 5. This table is the compact ownership reference.

| Domain | Member | Node.js modules | PostgreSQL schemas | FastAPI routes |
|---|---|---|---|---|
| Auth, Users, Org, Infrastructure | M1 | `auth`, `users`, `students`, `organization`, `mentorAssignments`, `trainerAssignments`, `shared/` | `identity`, `org`, `system` | None |
| Assessments, Sessions, AI Evaluation | M2 | `assessments`, `attempts`, `sessions`, `questions`, `responses`, `evaluation`, `reports` | `assessment`, `session`, `evaluation` | `POST /ai/evaluate-response`, `POST /ai/generate-question`, `POST /ai/evaluate-listening` |
| Performance, Skills, Learning, RAG, Agents | M3 | `performance`, `skills`, `listeningStories`, `learning`, `knowledge`, `agents` | `performance`, `knowledge`, `agent` | `POST /ai/knowledge/ingest`, `POST /ai/knowledge/search`, `POST /ai/agents/run`, `POST /ai/agents/resume` |
| Credits, Checklist, Placement | M4 | `credits`, `checklist`, `verifications`, `placement` | `credit`, `placement` | None |

### Parallel work dependencies:

| Sprint | Gate that others depend on | Owner |
|---|---|---|
| Sprint 1 | `src/shared/` infrastructure committed to `main` | M1 |
| Sprint 2 | Auth endpoints working (protected routes testable) | M1 |
| Sprint 2 | `CreditService.consume()` delivered (attempt creation unblocked) | M4 |
| Sprint 3 | AI client + evaluation endpoints working (performance update testable) | M2 |
| Sprint 4 | RabbitMQ consumer pattern implemented (EventEmitter migration) | All |

---

## DATABASE OWNERSHIP

### Write ownership (INSERT / UPDATE / DELETE):

| Schema | Write owner | Read-by (SELECT only) |
|---|---|---|
| `identity` | M1 | M2 (student lookup), M4 (mentor verify scope) |
| `org` | M1 | M2 (student validation, resume context), M3 (profile link), M4 (mentor scope check) |
| `assessment` | M2 | M3 (aggregate scores into performance profile), M4 (attempt count for eligibility — post-MVP) |
| `session` | M2 | M3 (map responses to skills via question_bank_item_skills) |
| `evaluation` | M2 | M3 (skill performance scores from response_evaluations) |
| `performance` | M3 | M2 (listening_stories content, skills for question tagging), M4 (performance_profiles for eligibility — post-MVP) |
| `knowledge` | M3 (Node.js ingestion) | FastAPI (pgvector SELECT for RAG) |
| `agent` | M3 | FastAPI (read agent_runs state for LangGraph resume) |
| `credit` | M4 | M2 (balance check before attempt) |
| `placement` | M4 | None for MVP |
| `system` | M1 (creates + maintains) | All members INSERT audit log rows |

### FastAPI database access policy:

FastAPI may execute **read-only SELECT** on:
- `knowledge.knowledge_chunks` — pgvector similarity search for RAG
- `agent.agent_runs` — read current run state for LangGraph resumption

FastAPI must **never** execute INSERT / UPDATE / DELETE on any table. All AI results are returned as HTTP response bodies to Node.js, which writes them.

---

## EVENT / QUEUE ARCHITECTURE

### Operation classification — three tiers:

**Tier 1 — Synchronous (must block HTTP response):**
| Operation | Mechanism |
|---|---|
| Credit deduction before attempt | Direct `CreditService.consume()` call — must return balance before HTTP 201 |
| `users` + `students` creation on register | Single `pg` transaction — must commit before JWT is issued |
| AI evaluation of response | Synchronous Node.js → FastAPI HTTP call |

**Tier 2 — Asynchronous best-effort (MVP: EventEmitter; Production: RabbitMQ):**
| Operation | Event | Subscribers |
|---|---|---|
| performance_profiles creation | `USER_REGISTERED` | M3 handler |
| credit_accounts creation | `USER_REGISTERED` | M4 handler |
| Performance profile update | `ATTEMPT_COMPLETED` | M3 handler |
| Credit earning | `ATTEMPT_COMPLETED` | M4 handler |
| Eligibility recalculation | `MENTOR_VERIFIED` | M4 handler |

**Tier 3 — Background / long-running (Post-MVP: RabbitMQ + Python consumer):**
| Operation | Queue | Consumer |
|---|---|---|
| Knowledge document ingestion + embedding | `knowledge.ingest` | FastAPI Python consumer |
| Batch performance aggregation | `analytics.batch` | Node.js consumer |

### EventEmitter (MVP) → RabbitMQ (production) migration:

The payload interfaces (`UserRegisteredPayload`, `AttemptCompletedPayload`, etc.) defined in `src/shared/events/events.ts` are identical in both architectures. Only the transport changes:

```
MVP:
  import { emit } from '../../shared/events/eventBus';
  emit('USER_REGISTERED', payload);

Production:
  import { channel } from '../../shared/queue/rabbitMQ';
  channel.publish('platform.events', 'user.registered', Buffer.from(JSON.stringify(payload)));
```

The two highest-risk events for data loss under MVP EventEmitter are `USER_REGISTERED` (student has no profile or credits if handler crashes) and `ATTEMPT_COMPLETED` (performance not updated). These are the priority migration targets at Beta gate.

---

## REDIS / WORKER ARCHITECTURE

### Justified Redis uses:

| Use | Key pattern | TTL | Owner | Gate |
|---|---|---|---|---|
| API rate limiting | `rl:{ip}:{route}` | 1-minute window | M1 | Foundation |
| GET /api/skills response cache | `cache:skills:all` | 5 minutes | M3 | Sprint 2 |
| GET /api/listening-stories response cache | `cache:listening:all` | 10 minutes | M3 | Sprint 2 |
| SSE client session state | `sse:attempt:{attemptId}` | Duration of attempt | M2 | Alpha |
| Credit operation idempotency keys | `idempotent:credit:{requestId}` | 24 hours | M4 | Sprint 3 |
| In-session proctoring state (tab-switch count) | `proctor:{sessionId}` | Duration of session | M2 | Sprint 3 |
| BullMQ job queue (post-MVP) | `bull:{queueName}:{jobId}` | Per job TTL | M3 | Post-MVP |

### What Redis is NOT used for:
- User session storage (JWT is stateless)
- Primary application data (always PostgreSQL)
- Message queue replacing RabbitMQ (use RabbitMQ for durable events)

### Python background workers (post-MVP):
RabbitMQ + Python consumer in FastAPI service handles knowledge ingestion. Celery/RQ is optional — only needed if tasks become complex enough to require task retry management beyond what RabbitMQ + AMQP acks provide. Not required for MVP.

---

## RAG / LANGGRAPH ARCHITECTURE

### RAG — when and where it applies:

RAG is justified for: grounding LLM evaluation with domain-specific knowledge (placement criteria, technical topic expectations per subdivision), preventing hallucination on programme-specific questions.

RAG is **not MVP** — build at Beta gate.

```
Admin uploads knowledge document
  ↓ POST /api/knowledge/documents (M3, Node.js)
  ↓ Node.js writes file to MinIO bucket
  ↓ INSERT INTO knowledge.knowledge_documents (metadata)
  ↓ Publish to RabbitMQ queue: knowledge.ingest
      ↓
      FastAPI consumer: read document from MinIO
      ↓ chunk text (e.g., 512 tokens with 50-token overlap)
      ↓ generate embeddings via embedding model
      ↓ POST http://NODE_URL/api/knowledge/chunks (Node.js writes to DB)
         INSERT INTO knowledge.knowledge_chunks (content, embedding)

At evaluation time:
FastAPI receives evaluate-response request with question context
  ↓ SELECT content FROM knowledge.knowledge_chunks
    ORDER BY embedding <=> query_embedding LIMIT 5
  ↓ top-k chunks injected into LLM prompt as context
  ↓ grounded evaluation returned
```

**pgvector vs Qdrant:** pgvector on existing PostgreSQL is the choice. Qdrant is not justified at this scale (thousands of document chunks, not millions).

### LangGraph — post-MVP adaptive interview agent:

```
Node.js: POST /api/agents/run (M3 endpoint)
  ↓ authenticate + authorize
  ↓ INSERT agent_runs (status=RUNNING)
  ↓ POST http://AI_SERVICE_URL/ai/agents/run
       FastAPI: build LangGraph StateGraph
         nodes: generate_question → wait_for_response → evaluate_response → decide_next
         edges: adaptive branch (harder / easier / done) based on score
       Returns: { step: 'waiting_for_response', question: '...', run_state }
  ↓ Node.js: UPDATE agent_runs (state=run_state, status=WAITING)
  ↓ return question to student

When student answers:
Node.js: POST /api/agents/:runId/resume (M3 endpoint)
  ↓ POST http://AI_SERVICE_URL/ai/agents/resume { run_state, student_answer }
       FastAPI: resume StateGraph from saved state
       ↓ evaluate answer → decide next node
       ↓ return { step, next_question_or_completion }
  ↓ Node.js updates state, returns next question or completion
```

LangGraph execution lives entirely in FastAPI. Node.js tracks state in `agent.agent_runs` and `agent.agent_steps`. Classified as **post-MVP (Beta gate)**.

---

## STORAGE ARCHITECTURE

| Environment | Provider | Notes |
|---|---|---|
| Development | MinIO (Docker container) | S3-compatible API, local bucket |
| Production | AWS S3 or S3-compatible | Swap by changing env vars only |

### Stored assets:

| Asset | Bucket | Upload owner | Access | Retention |
|---|---|---|---|---|
| Student resumes (PDF) | `resumes` | M1 — `POST /api/students/:id/resume` | Signed URL — student + their assigned mentor only | Kept; soft-deleted on student deactivation |
| Knowledge documents (admin uploads) | `knowledge-docs` | M3 — `POST /api/knowledge/documents` | Admin read; FastAPI consumer read | Kept; versioned by document record |
| Audio recordings | — | Not stored — transient audio only (privacy principle) | n/a | Never persisted |

### Access control:
Files are never served via direct storage URLs. Node.js generates time-limited pre-signed URLs. Scope enforced server-side:
- Student: GET their own resume only
- Mentor: GET their active mentees' resumes (enforced against `student_mentor_assignments`)
- Admin: GET any document in their programme scope

### Migration from local disk:
Current MVP uses local disk (`uploads/` folder, D-08). Transition to MinIO at Beta gate via a `StorageClient` interface:

```typescript
// src/shared/storage/storageClient.ts
interface StorageClient {
  put(bucket: string, key: string, stream: NodeJS.ReadableStream): Promise<string>;
  getSignedUrl(bucket: string, key: string, expiresIn: number): Promise<string>;
  delete(bucket: string, key: string): Promise<void>;
}
// LocalStorageClient (MVP) → MinIOStorageClient (Beta) — swap via STORAGE_DRIVER env var
```

Member 1 creates the `StorageClient` abstraction in Sprint 1 using `LocalStorageClient`. Member 1 or shared PR swaps to `MinIOStorageClient` at Beta gate.

---

## TESTING STRATEGY

| Test type | Technology | Owner | Gate |
|---|---|---|---|
| Node.js unit tests | Jest | All members (own modules) | Foundation |
| Node.js integration/API tests | Jest + Supertest | All members (own routes) | Alpha |
| FastAPI unit tests | Pytest | M2 (evaluation logic), M3 (RAG search) | Alpha |
| FastAPI integration tests | Pytest + httpx | M2, M3 | Beta |
| E2E — student interview flow | Playwright | M2 leads, M1 supports | Beta |
| E2E — mentor verification flow | Playwright | M4 leads, M1 supports | Beta |
| API contract tests | Postman + Newman in CI | M2 (assessment), M4 (credits/checklist) | Beta |
| Coverage enforcement | Jest `--coverage` ≥ 70%, `pytest --cov` ≥ 70% | All members | Beta |
| Performance / load tests | k6 | M2 (assessment pipeline) | Release |
| Static analysis | Semgrep (Node.js + Python rules) | CI (all) | Release |
| Container scanning | Trivy | CI (all) | Release |
| Dynamic security testing | OWASP ZAP | CI (all) | Release |

### Critical test paths that must pass at every gate:

1. Registration → performance profile + credit account created (Checkpoint 2)
2. Full interview journey: register → attempt → evaluate → report → performance updated (Checkpoint 3)
3. Credit balance enforcement: attempt blocked at balance = 0
4. Token revocation: logout immediately invalidates token
5. Role boundary: student cannot reach mentor or admin endpoints

---

## SECURITY / OBSERVABILITY

### Security — by layer:

| Concern | Implementation | Owner | Gate |
|---|---|---|---|
| HTTPS | TLS at reverse proxy (nginx in prod) | Infrastructure | Beta |
| JWT revocation | `token_version` integer check every request | M1 | Foundation |
| Password hashing | bcryptjs, salt rounds = 10 | M1 | Foundation |
| Rate limiting | express-rate-limit + Redis store | M1 | Foundation |
| Input validation | zod on all request bodies and params | All members | Foundation |
| SQL injection prevention | Parameterized `pg` queries only | All members | Foundation |
| File upload validation | MIME type check + 5 MB size limit | M1 | Alpha |
| Role boundary enforcement | `authorize()` middleware on all protected routes | All members | Foundation |
| Dependency scanning | `npm audit` + `pip audit` in CI | CI | Alpha |
| Secret scanning | Semgrep + git-secrets in CI | CI | Beta |
| Container vulnerability scanning | Trivy in CI | CI | Release |
| Dynamic security testing | OWASP ZAP against running stack | CI | Release |
| Static analysis | Semgrep (OWASP Top 10 rules) | CI | Release |

### Observability — by layer:

**Node.js service:**
- Structured JSON logs via `pino` with `requestId` correlation header
- `GET /health` endpoint (DB ping + Redis ping)
- OpenTelemetry SDK: spans for DB queries, external HTTP calls, event emissions
- Prometheus `prom-client`: request rate, response time histogram, error rate, credit operation counter
- Auth events (login, failed login, revocation) to `system.audit_logs`

**FastAPI service:**
- Structured logs via Python `logging` with `requestId` propagated from Node.js
- `GET /health` endpoint
- OpenTelemetry SDK: spans for LLM calls, pgvector queries, LangGraph steps
- `prometheus-fastapi-instrumentator`: request rate, evaluation latency, LLM token usage, AI error rate

**Infrastructure:**
- Prometheus scrapes both services
- Grafana dashboards: request rate, p95 latency, error rate, AI latency, credit transactions/min
- Loki + Promtail: log aggregation, queryable across services by `requestId`

---

## DOCKER / CI/CD / DEPLOYMENT

### Docker Compose services:

| Service | Image | Port | Required | Gate |
|---|---|---|---|---|
| `frontend` | Node.js (Vite dev server) | 5173 | Yes | MVP |
| `backend` | Node.js 18 | 5000 | Yes | MVP |
| `ai-service` | Python 3.11 | 8000 | Yes | MVP |
| `db` | `postgres:16` with pgcrypto + pgvector | 5432 | Yes | MVP |
| `redis` | `redis:7-alpine` | 6379 | Yes | Foundation |
| `rabbitmq` | `rabbitmq:3-management` | 5672 / 15672 | Beta | Beta |
| `minio` | `minio/minio` | 9000 / 9001 | Beta | Beta |
| `prometheus` | `prom/prometheus` | 9090 | Release | Release |
| `grafana` | `grafana/grafana` | 3000 | Release | Release |

### CI pipeline (GitHub Actions):

```
Trigger: push to feature/*, PR to develop, push to main

Jobs (run in order, each depends on previous):

1. lint
   - ESLint (TypeScript)
   - Ruff (Python)

2. type-check
   - tsc --noEmit
   - mypy (FastAPI)

3. test-node
   - Jest + Supertest (unit + integration)
   - Coverage threshold ≥ 70% (enforced at Beta gate)

4. test-python
   - Pytest + httpx
   - Coverage threshold ≥ 70% (enforced at Beta gate)

5. security-scan  (Beta gate and above)
   - Semgrep --config=p/owasp-top-ten
   - npm audit --audit-level=high
   - pip audit

6. build
   - tsc (TypeScript compile)
   - docker build backend --tag backend:$SHA
   - docker build ai-service --tag ai-service:$SHA

7. container-scan  (Beta gate and above)
   - trivy image backend:$SHA
   - trivy image ai-service:$SHA

8. integration-test  (develop + main branches only)
   - docker compose up (all services)
   - Newman (API contract tests)
   - Playwright (E2E tests)

9. dast  (Release gate only)
   - OWASP ZAP against running docker compose stack

10. performance  (Release gate only)
    - k6 run assessment-pipeline.js --vus 50 --duration 60s

11. deploy  (main branch only)
    - push images to container registry
    - deploy to target environment
```

### Kubernetes + Terraform (programme gate):

Both are programme exposure requirements introduced in Sprint 4 / Release gate. They do not block MVP runtime.

- **Kubernetes:** `Deployment`, `Service`, `ConfigMap`, `Secret`, `Ingress` for `backend`, `ai-service`, `frontend`. `HorizontalPodAutoscaler` for backend and ai-service. `PersistentVolumeClaim` for PostgreSQL and MinIO.
- **Terraform:** Cloud resources — managed PostgreSQL, Redis, S3 bucket, container registry, Kubernetes cluster basics. Demonstrates infrastructure-as-code for programme gate.

---

## PROGRAMME GATE ALIGNMENT

| Gate | Day | What must work | Technologies first introduced |
|---|---|---|---|
| Problem | 4 | Architecture documents complete. Problem statement. Four-member allocation confirmed. Tech stack decided. Docker Compose skeleton (services defined, not necessarily running). | — |
| Foundation | 9 | Docker Compose runs: frontend + backend + ai-service + db + redis. DB migrates cleanly from zero. Auth endpoints work (register, login, me, logout). JWT revocation works. GitHub Actions CI: lint + type-check + unit tests. `GET /health` on both services. | Node.js, PostgreSQL, FastAPI, Redis, Docker, GitHub Actions |
| Alpha | 17 | Full assessment pipeline end-to-end: register → credit deducted → start attempt → answer questions → AI evaluates → report generated → performance profile updated → credits earned. SSE streams AI completion status to waiting student. Structured logs with request IDs. Mentor assignment working. | SSE, pino structured logging, OpenTelemetry scaffold |
| Beta | 24 | Mentor verification + placement checklist flow. MinIO replacing local disk for resumes. Knowledge ingestion + RAG retrieval (at least one working query). LangGraph adaptive interview agent (one session type). RabbitMQ replacing EventEmitter for USER_REGISTERED + ATTEMPT_COMPLETED. Playwright E2E tests passing. Newman in CI. Prometheus + Grafana showing metrics. Semgrep + Trivy in CI. | RabbitMQ, MinIO, LangGraph, pgvector queries, Playwright, Newman, Prometheus, Grafana, Semgrep, Trivy |
| Release | 29 | Platform fully functional for a student cohort. k6 passes under 50 concurrent users. OWASP ZAP: no high-severity findings. OpenTelemetry traces visible in Grafana. Loki logs searchable. Kubernetes manifests defined (not necessarily live). Terraform plan defined. Full API documentation. | k6, OWASP ZAP, Loki, Kubernetes manifests, Terraform |
| Defence | 30 | Live demonstration: student registers → takes interview → views performance dashboard → marks checklist items → mentor verifies → eligibility computed. CI pipeline green. Architecture walk-through. Observability dashboard shown. | — |

### Sprint → Gate mapping:

| Sprint | Relative days | Target gate |
|---|---|---|
| Step 0 (cleanup) | Before Day 4 | → Problem (Day 4) |
| Sprint 1 (Foundation infra + migrations) | Days 4–9 | → Foundation (Day 9) |
| Sprint 2 (Auth + core pipeline) | Days 9–17 | → Alpha (Day 17) |
| Sprint 3 (Full pipeline + placement) | Days 17–24 | → Beta (Day 24) |
| Sprint 4 (Hardening + advanced features) | Days 24–29 | → Release (Day 29) |

---

## MVP VS POST-MVP

### MVP (must be working by Alpha gate — Day 17):

| Feature | Owner |
|---|---|
| User registration (STUDENT only via public endpoint) | M1 |
| Login / logout / JWT revocation | M1 |
| Student profile CRUD + resume upload (local disk) | M1 |
| Mentor assignment, trainer assignment + tenure guard | M1 |
| Seeded org hierarchy (read-only) | M1 |
| Shared infrastructure: pool, errors, eventBus, middleware, storageClient | M1 |
| Assessment CRUD | M2 |
| Question bank CRUD with skill tagging | M2 |
| Start attempt with credit check (synchronous) | M2 |
| Start session + serve questions | M2 |
| Submit response → call FastAPI → persist evaluation | M2 |
| Complete session → generate assessment report | M2 |
| SSE stream for AI evaluation completion | M2 |
| Skills master list (seeded + CRUD) | M3 |
| Listening stories (seeded + CRUD) | M3 |
| Performance profile creation on `USER_REGISTERED` event | M3 |
| Performance profile update on `ATTEMPT_COMPLETED` event | M3 |
| Skill performance aggregation | M3 |
| Credit account creation on `USER_REGISTERED` event | M4 |
| `CreditService.consume()` (synchronous) | M4 |
| Credit earning on `ATTEMPT_COMPLETED` event | M4 |
| Checklist items CRUD | M4 |
| Student checklist progress toggle | M4 |
| Mentor verification endpoint | M4 |

### Should have (Beta gate — Day 24):

- RabbitMQ replacing EventEmitter (all members)
- MinIO replacing local disk (M1 + shared infra)
- Knowledge/RAG document ingestion + pgvector search (M3)
- LangGraph adaptive interview agent (M2 Node.js client + M3 FastAPI workflow)
- Placement eligibility calculation (M4)
- Learning plans and recommendations (M3)
- Suggestion / chatbot system (`/api/suggestions`) (M2)
- Full RBAC permissions table populated (M1)
- Admin dashboards — aggregate performance per cohort (M3)
- Credit policy management endpoints (M4)
- College eligibility report (M4)
- Resume grounding in AI question generation (M2)

### Advanced / post-Beta:

- Multi-institution support
- Video/gaze proctoring
- External coding profile integration (LeetCode API, GitHub API)
- Real-time WebSocket notifications (beyond SSE)
- Token refresh / sliding sessions
- CSV exports for placement coordinator
- Full outbox pattern with retry (replaces RabbitMQ simple publish)
- Kubernetes production deployment
- Terraform IaC for cloud provisioning
- Batch analytics jobs
- Agent-based adaptive curriculum (beyond single-session agent)

---

## REMAINING DECISIONS

All architectural decisions are locked. These are the only genuine team choices remaining:

| # | Question | Suggested default (env var) | Blocks |
|---|---|---|---|
| OI-01 | Initial credit balance for a new student | `DEFAULT_CREDIT_BALANCE=50` | M4 writes `initializeAccount()` — Sprint 2 |
| OI-02 | Credit cost per assessment attempt | `CREDIT_COST_PER_ATTEMPT=10` | M2 wires `CreditService.consume()` — Sprint 3 |
| OI-03 | Credit reward for completing an assessment | `CREDIT_COMPLETION_REWARD=5` | M4 writes `ATTEMPT_COMPLETED` handler — Sprint 3 |
| OI-04 | Questions per session by type | `MOCK_INTERVIEW_QUESTION_COUNT=5` / `LISTENING_QUESTION_COUNT=3` | M2 writes `SessionService.complete()` — Sprint 3 |
| OI-06 | Seeding strategy for initial `PLACEMENT_COORDINATOR` | Seed migration with `SEED_COORDINATOR_EMAIL` + `SEED_COORDINATOR_PASSWORD` env vars | M1 writes seed migration — Sprint 1 |
| NEW-01 | Which LLM model for evaluation? | `LLM_MODEL=llama-3.1-70b-versatile` (already in ai-service) | M2 FastAPI client config — Sprint 2 |
| NEW-02 | Maximum resume file size | `MAX_RESUME_SIZE_MB=5` | M1 multer config — Sprint 2 |
| NEW-03 | SSE connection timeout for AI evaluation | `SSE_EVALUATION_TIMEOUT_MS=60000` | M2 SSE implementation — Sprint 3 |
| NEW-04 | RabbitMQ exchange + routing key convention | `platform.events` exchange, `<module>.<event>` routing keys (e.g., `auth.user_registered`) | All members — Sprint 4 |

---

## IMPLEMENTATION READINESS

### Architecture consistency — verified clean:

| Item checked | Contradiction found? | Resolution |
|---|---|---|
| Node.js vs FastAPI role | None — clearly separated | See NODE.JS ↔ FASTAPI RESPONSIBILITY BOUNDARY |
| Migration number ranges | Fixed (M4 was 091–120 overlapping Shared FK 115) | M4=091–109, Shared FKs=110–119 |
| EventEmitter atomicity claim | Fixed ("atomic" was wrong; event-driven records are async) | Checkpoint 2 updated |
| token_version check scope (OI-05) | Fixed (was open question — now locked) | Every authenticated request |
| assessment_reports schema (OI-08) | Fixed (was open question — now locked) | `assessment` schema, M2 owns it |
| question_bank_item_skills FK design (OI-07) | Fixed (was open question — now locked) | FK kept, deferred to migration 115 |
| FK table schema names for session/evaluation tables | Fixed (7 rows had wrong schema) | session and evaluation schemas corrected |
| server.js deletion safety | Verified safe | No Docker, no scripts reference it directly |
| Role name SUPER_ADMIN | Fixed | PLACEMENT_COORDINATOR everywhere |
| API path `/api/tasks` | Fixed | `/api/checklist` |
| API path `/api/interviews` | Fixed | `/api/sessions` |

### READY FOR IMPLEMENTATION: YES

**Sprint 1 can begin immediately.** All architectural decisions are locked. The two-layer Node.js + FastAPI architecture is internally consistent. The four-member ownership boundaries are clear. The database write rules are unambiguous.

**What must happen before the first Sprint 1 commit:**
1. Team resolves OI-06 (coordinator seeding strategy) — needed for M1's seed migration
2. Team agrees on the 4 remaining credit/session values (OI-01 through OI-04) — not needed until Sprint 2/3 functions
3. Member 1 deletes `server.js` and updates `package.json` as documented in Step 0

**What does NOT block Sprint 1:**
- OI-01 through OI-04 (credit values, question counts)
- NEW-01 through NEW-04 (LLM model, file size, SSE timeout, RabbitMQ convention)
- RabbitMQ (EventEmitter is the MVP transport)
- MinIO (local disk is the MVP storage)
- LangGraph (post-MVP)
- RAG (post-MVP)

---

*End of Backend Implementation Plan*

*Part I (Sections 1–12): Team allocation review, design decisions, shared contracts, per-member implementation cards, sprint schedule, consistency review.*
*Part II (Sections 13–28 / Named sections): Full programme-level architecture — stack, boundaries, database ownership, events, Redis, RAG, storage, testing, security, Docker, CI/CD, programme gates, MVP scope, remaining decisions, implementation readiness.*
