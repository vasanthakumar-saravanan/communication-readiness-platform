# Module 1 Implementation Checklist
**Owner:** Member 1 | **Migration range:** 001–030 | **Focus:** Auth, Identity, Organisation

This checklist is the daily working document for Module 1. Check every box as you complete it.
Do **not** start on Module 1 source code until Step 0 and the shared infrastructure are done — M2, M3, and M4 all depend on the foundations this module sets.

---

## 1. Module 1 Ownership Summary

| Area | What M1 builds |
|------|---------------|
| Auth endpoints | Register, Login, Logout, Me |
| Identity tables | `identity.users`, `system.audit_logs` |
| Organisation tables | `org.institutions`, `org.programs`, `org.batches`, `org.subdivisions` |
| People tables | `org.students`, `org.faculty_profiles` |
| Assignment tables | `org.student_mentor_assignments`, `org.trainer_subdivision_assignments` |
| Middleware | `authenticate` (JWT + token_version), `requireRole`, `requireStudentSelfOrStaff`, `requireActiveTrainerTenure` |
| Shared infrastructure | `AppError`, response helpers, `db` pool, `eventBus`, TypeScript types |
| Admin endpoints | List users, patch role, patch status |
| Student endpoints | Get profile, update profile, update resume URL |
| Org read endpoints | List institutions, programs, batches, subdivisions |

---

## 2. MVP Scope

### In scope (build now)
- All items listed in Section 1
- Migrations 001–030
- `authenticate` middleware with **token_version DB check** on every request
- Five roles only: `STUDENT`, `FACULTY_MENTOR`, `PROGRAM_ADMIN`, `TRAINER`, `PLACEMENT_COORDINATOR`
- EventEmitter handlers for `USER_REGISTERED`, `MENTOR_VERIFIED`, `CHECKLIST_ITEM_TOGGLED`
- `LocalStorageClient` stub for resume uploads (filesystem only)

### Out of scope (do not build yet)
- Email verification flow — removed per decision D-22
- External student registration (`register-external`) — removed per D-22
- Redis session cache — post-MVP
- RabbitMQ / Bull queue — post-MVP (EventEmitter is MVP)
- `SUPER_ADMIN` role — permanently banned; do not add
- Soft-delete (logical deletion) — post-MVP
- Pagination on org list endpoints — defer unless list > 200 rows
- Prometheus metrics endpoints — post-MVP

---

## 3. Step 0: Pre-Coding Cleanup

These must be done **before writing a single new line of code**. They are breaking changes to the existing project.

### 3.1 Delete legacy entry point
- [ ] Verify `backend/src/server.js` exists and is not referenced in Docker / CI (no Docker file exists)
- [ ] Confirm `backend/package.json` `main` and `scripts.dev` point to `src/index.ts`, not `server.js`
- [ ] Delete `backend/src/server.js`
- [ ] Confirm `start-all.bat` and `start-all.ps1` use `npm run dev` — they do, no change needed

### 3.2 Remove banned auth routes
The following routes are banned per decision D-22 (no email verification in this system):

| File | Remove |
|------|--------|
| `src/routes/authRoutes.ts` | `POST /register-external` route handler |
| `src/routes/authRoutes.ts` | `POST /verify-email` route handler |
| `src/services/AuthService.ts` | `registerExternalStudent()` method |
| `src/services/AuthService.ts` | `verifyEmailCode()` method |
| `src/index.ts` | Any route prefix registration for those two paths |

### 3.3 Fix UserRole type
- [ ] Open `src/types/index.ts`
- [ ] Remove `'SUPER_ADMIN'` from the `UserRole` union/enum
- [ ] Confirm the five allowed values: `'STUDENT' | 'FACULTY_MENTOR' | 'PROGRAM_ADMIN' | 'TRAINER' | 'PLACEMENT_COORDINATOR'`

### 3.4 Rename existing route prefixes
| Current path in `src/index.ts` | Must become |
|-------------------------------|-------------|
| `/api/tasks` | `/api/checklist` |
| `/api/interviews` | `/api/sessions` |

### 3.5 Fix `upload.maxFileSizeMb` in env config
- [ ] Open `src/config/env.ts`
- [ ] Change `maxFileSizeMb: 10` → `maxFileSizeMb: 5`

---

## 4. Shared Infrastructure — Build Before Anything Else

M2, M3, and M4 import from `src/shared/`. **This must be complete before other modules start coding.**

### 4.1 Folder structure to create
```
backend/src/shared/
  db/
    pool.ts          ← re-export existing src/config/database.ts as-is (or move it here)
  errors/
    AppError.ts      ← structured error class
  helpers/
    response.ts      ← sendSuccess / sendError helpers
    pagination.ts    ← page/limit/offset helpers  [NEEDS CONFIRMATION — defer if not used in M1]
  events/
    eventBus.ts      ← EventEmitter wrapper
    events.ts        ← Event name constants + payload types
  types/
    auth.ts          ← AuthUser interface (with tokenVersion)
    roles.ts         ← UserRole enum
    api.ts           ← ApiResponse<T> envelope type
  storage/
    StorageClient.ts       ← interface
    LocalStorageClient.ts  ← MVP implementation
```

### 4.2 `AppError` class
```typescript
// src/shared/errors/AppError.ts
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

Checklist:
- [ ] `AppError` class created
- [ ] Global error handler in `src/index.ts` catches `AppError` and returns correct HTTP status
- [ ] Global error handler turns unknown errors into HTTP 500
- [ ] `AppError(409, ...)` for duplicate registration
- [ ] `AppError(401, ...)` for wrong password / invalid token
- [ ] `AppError(403, ...)` for insufficient role
- [ ] `AppError(404, ...)` for resource not found
- [ ] `AppError(422, ...)` for validation errors

### 4.3 Response envelope
All API responses must use this envelope — existing tests will need updating:
```typescript
// Success
{ "status": "success", "data": { ... } }

// Error
{ "status": "error", "message": "...", "code": "DUPLICATE_EMAIL" }
```
- [ ] `sendSuccess(res, data, statusCode = 200)` helper created
- [ ] `sendError(res, error)` helper created
- [ ] All M1 controllers use these helpers — no bare `res.json()`

### 4.4 `AuthUser` type (JWT payload shape)
```typescript
// src/shared/types/auth.ts
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  tokenVersion: number;   // ← CRITICAL — must be present for revocation to work
}
```
- [ ] `AuthUser` interface updated to include `tokenVersion: number`
- [ ] Existing `src/middleware/auth.ts` `AuthUser` import updated

### 4.5 `eventBus`
```typescript
// src/shared/events/eventBus.ts
import EventEmitter from 'events';
export const eventBus = new EventEmitter();
eventBus.setMaxListeners(20);
```
- [ ] `eventBus` singleton created
- [ ] Event name constants defined: `USER_REGISTERED`, `ATTEMPT_COMPLETED`, `CHECKLIST_ITEM_TOGGLED`, `MENTOR_VERIFIED`
- [ ] Payload types defined for each event
- [ ] M1 handlers for `USER_REGISTERED`, `MENTOR_VERIFIED`, `CHECKLIST_ITEM_TOGGLED` registered at startup

### 4.6 `db` pool
The existing `src/config/database.ts` is correct and usable. Either:
- Re-export it from `src/shared/db/pool.ts`, or
- Have modules import directly from `src/config/database.ts`

[NEEDS CONFIRMATION — agree with the team on import path before writing modules]

- [ ] Import path agreed: `import { db } from '../shared/db/pool'` (recommended) or `'../config/database'`
- [ ] All new M1 code uses the agreed import path
- [ ] Slow query warning threshold kept at 500ms

### 4.7 `StorageClient` (resume upload)
- [ ] `StorageClient` interface created with `upload(file, path): Promise<string>` and `getUrl(path): string`
- [ ] `LocalStorageClient` implementation writes to `uploads/` directory
- [ ] `STORAGE_DRIVER=local` is the only value for MVP; `minio` is post-Beta
- [ ] File size validated at controller layer (≤ 5 MB — matches env config fix in Step 0)
- [ ] Accepted MIME types: `application/pdf` only for resumes

---

## 5. Database Tables

### 5.1 `identity.users`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` default |
| `name` | VARCHAR(255) NOT NULL | |
| `email` | VARCHAR(255) UNIQUE NOT NULL | stored lowercase |
| `password_hash` | VARCHAR(255) NOT NULL | bcrypt, cost 10 |
| `role` | role_enum NOT NULL | see Section 13 |
| `token_version` | INTEGER NOT NULL DEFAULT 0 | incremented on logout/password change |
| `status` | status_enum NOT NULL DEFAULT 'ACTIVE' | `ACTIVE`, `INACTIVE`, `SUSPENDED` |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | updated by trigger |

**Gap vs. existing code:** `schema.sql` does not have `token_version`. Migration 003 must add it. The existing `AuthService.generateToken()` also does not include it in the JWT payload — M1 must fix this.

### 5.2 `system.audit_logs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID NOT NULL | no FK — log survives user deletion |
| `action` | VARCHAR(100) NOT NULL | e.g., `LOGIN`, `LOGOUT`, `ROLE_CHANGED` |
| `resource_type` | VARCHAR(50) | e.g., `USER`, `STUDENT` |
| `resource_id` | UUID | |
| `metadata` | JSONB | additional context |
| `ip_address` | INET | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Gap vs. existing code:** `schema.sql` has `identity.audit_logs`. The plan uses `system.audit_logs`. Migration must create it in `system` schema.

### 5.3 `org.institutions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | VARCHAR(255) NOT NULL | |
| `code` | VARCHAR(50) UNIQUE NOT NULL | e.g., `SNSCT` |
| `type` | VARCHAR(50) | `ENGINEERING_COLLEGE`, `UNIVERSITY`, etc. |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

### 5.4 `org.programs`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `institution_id` | UUID FK → `org.institutions` | |
| `name` | VARCHAR(255) NOT NULL | e.g., `B.E. Computer Science` |
| `code` | VARCHAR(50) NOT NULL | e.g., `BE_CSE` |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

### 5.5 `org.batches`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `program_id` | UUID FK → `org.programs` | |
| `name` | VARCHAR(100) NOT NULL | e.g., `2022–2026 CSE` |
| `year` | INTEGER NOT NULL | graduation year |
| `track` | track_enum NOT NULL | `HOPE_ELITE`, `HOPE_NON_ELITE`, `PEP`, `DEPARTMENT` |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

### 5.6 `org.subdivisions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `batch_id` | UUID FK → `org.batches` | |
| `name` | VARCHAR(100) NOT NULL | e.g., `Section A`, `Domain 3` |
| `type` | VARCHAR(50) | `SECTION`, `DOMAIN`, `GROUP` [NEEDS CONFIRMATION] |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

### 5.7 `org.students`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID UNIQUE FK → `identity.users` | |
| `roll_number` | VARCHAR(50) UNIQUE NOT NULL | |
| `batch_id` | UUID FK → `org.batches` | replaces old `batch_year` + `department` |
| `subdivision_id` | UUID FK → `org.subdivisions` | replaces old `domain_id` |
| `coding_handles` | JSONB | `{github, leetcode, hackerrank, codeforces, codechef, leetcode_solved, github_repos}` |
| `resume_url` | TEXT | set after upload; null until uploaded |
| `resume_verified` | BOOLEAN DEFAULT FALSE | set by Faculty Mentor |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Gap vs. existing code:** `college.students` has `mentor_id`, `department` (text), `batch_year` (int). The plan removes all three and uses `batch_id` FK, `subdivision_id` FK, and a separate `student_mentor_assignments` table.

### 5.8 `org.faculty_profiles`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID UNIQUE FK → `identity.users` | |
| `department` | VARCHAR(100) | |
| `designation` | VARCHAR(100) | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

### 5.9 `org.student_mentor_assignments`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `student_id` | UUID FK → `org.students` | |
| `mentor_id` | UUID FK → `identity.users` | role must be `FACULTY_MENTOR` |
| `assigned_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| `assigned_by` | UUID FK → `identity.users` | who made the assignment |
| `is_active` | BOOLEAN DEFAULT TRUE | only one active assignment per student |

### 5.10 `org.trainer_subdivision_assignments`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `trainer_id` | UUID FK → `identity.users` | role must be `TRAINER` |
| `subdivision_id` | UUID FK → `org.subdivisions` | |
| `start_date` | DATE NOT NULL | |
| `end_date` | DATE | NULL = currently active |
| `assigned_by` | UUID FK → `identity.users` | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Gap vs. existing code:** `schema.sql` has `college.trainer_tenures`. This table replaces it.

---

## 6. Database Relationships (M1 Tables Only)

```
identity.users
    ↑ (user_id)
    ├── org.students (one-to-one)
    ├── org.faculty_profiles (one-to-one)
    ├── org.student_mentor_assignments.mentor_id (one-to-many as mentor)
    ├── org.student_mentor_assignments.assigned_by
    └── org.trainer_subdivision_assignments.trainer_id

org.institutions
    └── org.programs (one-to-many)
            └── org.batches (one-to-many)
                    └── org.subdivisions (one-to-many)
                            ├── org.students (one-to-many)
                            └── org.trainer_subdivision_assignments

org.students
    └── org.student_mentor_assignments (one-to-many, but only one active)
```

Cross-schema FKs (deferred to migration 115 — do not add in 001–030):
- `org.students.id` ← `performance.performance_profiles.student_id` (M3)
- `org.students.id` ← `credit.credit_accounts.student_id` (M4)
- `org.students.id` ← `session.assessment_sessions.student_id` (M2)

---

## 7. Required Migrations (001–030)

Create files in `backend/src/database/migrations/`. Filename format: `NNN_description.sql`.

| File | Purpose | Notes |
|------|---------|-------|
| `001_extensions.sql` | `CREATE EXTENSION IF NOT EXISTS "uuid-ossp", "pgcrypto", "pg_trgm", "btree_gist"` | Run first, no deps |
| `002_schemas.sql` | Create all 11 schemas: `identity, org, assessment, session, evaluation, performance, knowledge, agent, credit, placement, system` | Run before all tables |
| `003_identity_users.sql` | Create `identity.users` with `token_version` column | Includes `updated_at` trigger |
| `004_system_audit_logs.sql` | Create `system.audit_logs` | No FK to users (survives deletion) |
| `005_org_institutions.sql` | Create `org.institutions` | |
| `006_org_programs.sql` | Create `org.programs` (FK → institutions) | |
| `007_org_batches.sql` | Create `org.batches` with track enum | |
| `008_org_subdivisions.sql` | Create `org.subdivisions` | |
| `009_org_students.sql` | Create `org.students` with `coding_handles` JSONB | |
| `010_org_faculty_profiles.sql` | Create `org.faculty_profiles` | |
| `011_org_trainer_subdivision_assignments.sql` | Create `org.trainer_subdivision_assignments` | |
| `012_org_student_mentor_assignments.sql` | Create `org.student_mentor_assignments` | |
| `013_identity_indexes.sql` | Indexes on `identity.users(email)`, `identity.users(role)` | |
| `014_org_indexes.sql` | Indexes on `org.students(user_id)`, `org.students(roll_number)`, `org.students(batch_id)`, assignment tables | |
| `015_updated_at_triggers.sql` | `updated_at` auto-update triggers for `identity.users` and `org.students` | |
| `016_030_placeholder.sql` | Reserved for M1 additions discovered during implementation | Rename as needed |

> Migrations 031–060 belong to M2. Do not create files in that range.
> Migrations 110–119 (shared FKs) and 120–130 (seeds) are separate runs coordinated with the full team.

### Migration runner
- [ ] `backend/src/database/migrate.ts` script exists (or `package.json` has `npm run migrate`)
- [ ] Migrations run in numeric order
- [ ] Already-applied migrations are skipped (use `system.migrations` tracking table, or a library like `node-pg-migrate`)
- [ ] `npm run migrate` documented in project README

---

## 8. API Endpoints

### Base URL: `/api`
### Auth header: `Authorization: Bearer <jwt>` (all authenticated routes)

#### Auth routes — `/api/auth`
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| POST | `/api/auth/register` | No | — | Create account + org.students record |
| POST | `/api/auth/login` | No | — | Verify password, return JWT |
| POST | `/api/auth/logout` | Yes | All | Increment token_version (invalidate JWT) |
| GET | `/api/auth/me` | Yes | All | Return current user + student_id if student |

#### Student routes — `/api/students`
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/students/:studentId` | Yes | STUDENT (self), FACULTY_MENTOR, PROGRAM_ADMIN, TRAINER, PLACEMENT_COORDINATOR | Get student profile |
| PATCH | `/api/students/:studentId` | Yes | STUDENT (self only), PROGRAM_ADMIN | Update coding handles, basic info |
| PATCH | `/api/students/:studentId/resume` | Yes | STUDENT (self only) | Upload resume PDF, store URL |

#### Org routes — `/api/org` (read-only for MVP)
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/org/institutions` | Yes | All | List all institutions |
| GET | `/api/org/programs` | Yes | All | List programs (optional `?institution_id=`) |
| GET | `/api/org/batches` | Yes | All | List batches (optional `?program_id=`) |
| GET | `/api/org/subdivisions` | Yes | All | List subdivisions (optional `?batch_id=`) |

#### Mentor assignment routes — `/api/mentors`
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| POST | `/api/mentors/assign` | Yes | PROGRAM_ADMIN | Assign mentor to student |
| GET | `/api/mentors/my-students` | Yes | FACULTY_MENTOR | List students assigned to caller |
| PATCH | `/api/students/:studentId/verify-resume` | Yes | FACULTY_MENTOR | Mark `resume_verified = true`; emits `MENTOR_VERIFIED` event |

#### Trainer assignment routes — `/api/trainers`
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| POST | `/api/trainers/assign` | Yes | PROGRAM_ADMIN | Assign trainer to subdivision |
| GET | `/api/trainers/my-subdivisions` | Yes | TRAINER | List subdivisions assigned to caller |

#### Admin routes — `/api/admin`
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/admin/users` | Yes | PROGRAM_ADMIN | List all users (with filters) |
| PATCH | `/api/admin/users/:userId/role` | Yes | PROGRAM_ADMIN | Change user role |
| PATCH | `/api/admin/users/:userId/status` | Yes | PROGRAM_ADMIN | Activate / suspend user |

---

## 9. Request / Response Contracts

### POST `/api/auth/register`
**Request body:**
```json
{
  "name": "Arjun Sharma",
  "email": "arjun@snsct.ac.in",
  "password": "SecurePass123!",
  "rollNumber": "22CS1001",
  "batchId": "uuid",
  "subdivisionId": "uuid"
}
```
- `role` field is **ignored** — all registrations create `STUDENT` accounts
- `batchId` and `subdivisionId`: required for students; null-safe for staff [NEEDS CONFIRMATION — confirm if staff can self-register or are only admin-created]
- Password: minimum 8 characters (validate at controller)

**Success response (201):**
```json
{
  "status": "success",
  "data": {
    "token": "eyJ...",
    "user": {
      "id": "uuid",
      "name": "Arjun Sharma",
      "email": "arjun@snsct.ac.in",
      "role": "STUDENT"
    },
    "studentId": "uuid"
  }
}
```

**Error responses:**
| Condition | HTTP | code |
|-----------|------|------|
| Email already exists | 409 | `DUPLICATE_EMAIL` |
| Missing required field | 422 | `VALIDATION_ERROR` |
| Invalid batchId / subdivisionId | 404 | `NOT_FOUND` |

**Gap vs. existing code:** `AuthService.register()` currently throws a bare `Error` for duplicates → controller returns 500. M1 must throw `AppError(409, ...)` and update the controller.

### POST `/api/auth/login`
**Request body:**
```json
{
  "email": "arjun@snsct.ac.in",
  "password": "SecurePass123!"
}
```

**Success response (200):**
```json
{
  "status": "success",
  "data": {
    "token": "eyJ...",
    "user": { "id": "uuid", "name": "Arjun Sharma", "email": "arjun@snsct.ac.in", "role": "STUDENT" },
    "studentId": "uuid"
  }
}
```

**Error responses:**
| Condition | HTTP | code |
|-----------|------|------|
| Wrong email or password | 401 | `INVALID_CREDENTIALS` |
| Account suspended | 403 | `ACCOUNT_SUSPENDED` |

**Note:** Do NOT confirm whether the email exists — always say "Invalid email or password" for both cases (security).

### POST `/api/auth/logout`
No body. Requires `Authorization: Bearer <token>`.
- Server finds user from `req.user.id`
- `UPDATE identity.users SET token_version = token_version + 1 WHERE id = $1`

**Success response (200):**
```json
{ "status": "success", "data": { "message": "Logged out successfully" } }
```

### GET `/api/auth/me`
No body. Requires `Authorization: Bearer <token>`.

**Success response (200):**
```json
{
  "status": "success",
  "data": {
    "user": { "id": "uuid", "name": "...", "email": "...", "role": "STUDENT" },
    "studentId": "uuid"
  }
}
```

### PATCH `/api/students/:studentId`
**Request body (all fields optional):**
```json
{
  "codingHandles": {
    "github": "arjun-gh",
    "leetcode": "arjun-lc",
    "hackerrank": "arjun-hr",
    "codeforces": "arjun-cf",
    "codechef": "arjun-cc",
    "leetcodeSolved": 120,
    "githubRepos": 8
  }
}
```

**Success response (200):**
```json
{ "status": "success", "data": { "student": { ... } } }
```

### PATCH `/api/students/:studentId/resume`
- Multipart form upload: field name `resume`, MIME type `application/pdf`, max 5 MB
- Stores file via `LocalStorageClient`, saves URL to `org.students.resume_url`
- Sets `resume_verified = false` (new upload invalidates previous verification)

**Success response (200):**
```json
{ "status": "success", "data": { "resumeUrl": "/uploads/resumes/uuid.pdf" } }
```

---

## 10. Authentication Flow

### Registration (two-phase, one transaction for identity data)
```
Client → POST /api/auth/register
  │
  ├─ Validate body (name, email, password, rollNumber, batchId, subdivisionId)
  ├─ Hash password (bcrypt, cost 10)
  ├─ BEGIN TRANSACTION
  │     INSERT INTO identity.users (name, email, password_hash, role='STUDENT', token_version=0, status='ACTIVE')
  │     INSERT INTO org.students (user_id, roll_number, batch_id, subdivision_id, coding_handles='{}')
  │  COMMIT
  ├─ eventBus.emit('USER_REGISTERED', { userId, studentId, email })
  │     [async — M1 handler: write audit log; M3 handler: create performance_profile]
  │     [async — M4 handler: create credit_account]
  ├─ Sign JWT (payload includes tokenVersion: 0)
  └─ Return 201 { token, user, studentId }
```

The `identity.users` + `org.students` inserts are one atomic transaction. The `performance_profiles` and `credit_accounts` are created asynchronously by EventEmitter handlers — they may not exist immediately after `POST /register` returns. M2, M3, M4 must handle this gracefully.

### Login
```
Client → POST /api/auth/login
  │
  ├─ SELECT id, password_hash, role, status, token_version FROM identity.users WHERE email = $1
  ├─ Check status = 'ACTIVE' (403 if not)
  ├─ bcrypt.compare(password, hash) (401 if fail)
  ├─ Sign JWT with { id, email, role, name, tokenVersion: row.token_version }
  └─ Return 200 { token, user, studentId }
```

### Token verification on every authenticated request
```
Client → ANY /api/* route with Authorization header
  │
  ├─ Extract Bearer token
  ├─ jwt.verify(token, JWT_SECRET) → decoded   [401 if invalid/expired]
  ├─ SELECT token_version FROM identity.users WHERE id = decoded.id
  │    [401 if no user found]
  ├─ Compare decoded.tokenVersion === row.token_version (as integers)
  │    [401 if mismatch — token was revoked by logout]
  ├─ Attach decoded as req.user
  └─ next()
```

**Gap vs. existing code:** The current `src/middleware/auth.ts` `authenticate` function does NOT do the DB lookup. The token_version check must be added. This is a security gap.

---

## 11. JWT Payload Structure

```typescript
{
  id: string;           // identity.users.id (UUID)
  email: string;        // identity.users.email
  role: UserRole;       // one of the 5 valid roles
  name: string;         // identity.users.name
  tokenVersion: number; // identity.users.token_version at login time
  iat: number;          // issued at (set by jsonwebtoken)
  exp: number;          // expiry (set by jsonwebtoken)
}
```

- `expiresIn`: use `config.jwt.expiresIn` from env (default `'7d'`)
- `secret`: use `config.jwt.secret` — must be at least 32 chars in production
- The `tokenVersion` in the payload is compared to the DB value on every request

---

## 12. Token Version Revocation Flow

| Action | Effect on token_version |
|--------|------------------------|
| User logs in | `token_version` not changed; new JWT minted with current value |
| User calls `POST /logout` | `UPDATE ... SET token_version = token_version + 1` — all existing JWTs become invalid |
| Admin changes user password | `token_version + 1` (force re-login) |
| Admin suspends user | `status = 'SUSPENDED'` — caught at login, NOT by token_version |

- [ ] `logout` endpoint increments `token_version`
- [ ] `authenticate` middleware checks `token_version` via DB query on every request
- [ ] `AuthUser.tokenVersion` is typed as `number` (integer comparison, not string)
- [ ] Password change (future feature) also increments `token_version`

---

## 13. Role Authorization Rules

### Five valid roles
| Role | Who |
|------|-----|
| `STUDENT` | Registered student in the programme |
| `FACULTY_MENTOR` | Faculty assigned to mentor students |
| `PROGRAM_ADMIN` | Admin managing the programme |
| `TRAINER` | Trainer delivering sessions |
| `PLACEMENT_COORDINATOR` | Staff managing placement readiness |

### Endpoint access by role
| Endpoint | STUDENT | FACULTY_MENTOR | PROGRAM_ADMIN | TRAINER | PLACEMENT_COORDINATOR |
|----------|---------|---------------|--------------|---------|----------------------|
| POST /register | — | — | — | — | — |
| POST /login | — | — | — | — | — |
| POST /logout | Self | Self | Self | Self | Self |
| GET /me | Self | Self | Self | Self | Self |
| GET /students/:id | Self only | Any | Any | Any | Any |
| PATCH /students/:id | Self only | No | Any | No | No |
| PATCH /students/:id/resume | Self only | No | No | No | No |
| PATCH /verify-resume | No | Assigned students | No | No | No |
| GET /org/* | Yes | Yes | Yes | Yes | Yes |
| POST /mentors/assign | No | No | Yes | No | No |
| GET /mentors/my-students | No | Self | No | No | No |
| POST /trainers/assign | No | No | Yes | No | No |
| GET /trainers/my-subdivisions | No | No | No | Self | No |
| GET /admin/users | No | No | Yes | No | No |
| PATCH /admin/users/:id/role | No | No | Yes | No | No |
| PATCH /admin/users/:id/status | No | No | Yes | No | No |

---

## 14. Middleware to Build

### `authenticate` — rewrite required
Location: `src/middleware/auth.ts`

Current problems:
- Does not check `token_version` in DB (security gap)
- `AuthUser` interface missing `tokenVersion`

Required behaviour:
1. Extract `Authorization: Bearer <token>`
2. `jwt.verify` — catch errors → 401
3. DB lookup: `SELECT token_version FROM identity.users WHERE id = $1`
4. Integer compare: `decoded.tokenVersion !== row.token_version` → 401
5. `req.user = decoded as AuthUser`
6. `next()`

- [ ] Rewrite `authenticate` with token_version DB check
- [ ] `AuthUser` interface has `tokenVersion: number`
- [ ] Import `AppError` and throw correctly on failures
- [ ] Add `req.user` type augmentation to Express `Request`

### `requireRole` — fix required
Location: `src/middleware/rbac.ts`

Current problems:
- `requireStudentSelfOrStaff` references `SUPER_ADMIN` — remove it
- `requireActiveTrainerTenure` queries `college.trainer_tenures` — change to `org.trainer_subdivision_assignments`
- `requireStudentSelfOrStaff` queries `college.students` — change to `org.students`

- [ ] Remove all `SUPER_ADMIN` references from `rbac.ts`
- [ ] Update schema references: `college.students` → `org.students`
- [ ] Update schema references: `college.trainer_tenures` → `org.trainer_subdivision_assignments`
- [ ] `requireRole(...roles)` accepts any subset of the 5 valid roles
- [ ] `requireStudentSelfOrStaff` authorises: student accessing own data, or any staff role
- [ ] `requireActiveTrainerTenure` authorises: trainer with an active assignment for the requested subdivision

### `validateBody` — new helper
- [ ] Thin wrapper around a validation library (Zod recommended) or manual checks
- [ ] Used at controller entry point before any DB call
- [ ] Throws `AppError(422, 'Validation failed', 'VALIDATION_ERROR')`

---

## 15. Shared Utilities Summary

| Utility | File | Used by |
|---------|------|---------|
| `db.query` / `pool` | `src/config/database.ts` (or `src/shared/db/pool.ts`) | All modules |
| `AppError` | `src/shared/errors/AppError.ts` | All modules |
| `sendSuccess` / `sendError` | `src/shared/helpers/response.ts` | All modules |
| `eventBus` | `src/shared/events/eventBus.ts` | M1 (emit), M2 (emit), M3 (listen), M4 (listen) |
| `UserRole` enum | `src/shared/types/roles.ts` | All modules |
| `AuthUser` interface | `src/shared/types/auth.ts` | All modules (via middleware) |
| `ApiResponse<T>` type | `src/shared/types/api.ts` | All modules |
| `StorageClient` | `src/shared/storage/` | M1 (resume upload), M2 (audio — post-MVP) |

---

## 16. What Module 1 Provides to M2, M3, and M4

M2, M3, M4 **must not start their modules** until these M1 deliverables are done:

### For all modules (M2, M3, M4)
- [ ] `authenticate` middleware ready and tested
- [ ] `requireRole` middleware ready and tested
- [ ] `AppError`, `sendSuccess`, `sendError` available
- [ ] `db` pool connection working
- [ ] `eventBus` singleton exported
- [ ] Event name constants exported from `src/shared/events/events.ts`
- [ ] `UserRole` type finalized (no `SUPER_ADMIN`)
- [ ] `AuthUser` type finalized (includes `tokenVersion`)
- [ ] Migrations 001–015 run on shared dev DB

### Specifically for M2 (Assessment, Sessions)
- [ ] `org.students` table exists with `id`, `user_id`, `batch_id`, `subdivision_id`
- [ ] `identity.users` table exists with `id`, `role`
- [ ] `eventBus.emit('ATTEMPT_COMPLETED', ...)` documented in `events.ts`
- [ ] `GET /api/students/:studentId` returns `studentId` that M2 can use as FK

### Specifically for M3 (Performance, Reports)
- [ ] `eventBus` handler signature for `USER_REGISTERED` → M3 listens to create `performance_profiles`
- [ ] `org.students.id` is the FK key M3 uses in `performance.performance_profiles`
- [ ] `identity.users.id` is the FK key for `performance.performance_snapshots`

### Specifically for M4 (Credits, Recommendations)
- [ ] `eventBus` handler signature for `USER_REGISTERED` → M4 listens to create `credit_accounts`
- [ ] `CreditService.consume()` interface documented (M4 implements, M2 calls synchronously)
- [ ] `org.students.id` is the FK key M4 uses in `credit.credit_accounts`

---

## 17. Implementation Order

Work in this exact order. Do not move to the next step until the current one passes its tests.

### Phase 1: Foundation (team unblocked after this)
1. - [ ] **Step 0 cleanup** — delete server.js, remove banned routes, fix UserRole, rename route prefixes
2. - [ ] **Create `src/shared/` folder structure** — all subfolders
3. - [ ] **Build `AppError`** — the error class used everywhere
4. - [ ] **Build response helpers** — `sendSuccess`, `sendError`
5. - [ ] **Build `UserRole` enum** (5 roles, no SUPER_ADMIN)
6. - [ ] **Build `AuthUser` interface** (with `tokenVersion`)
7. - [ ] **Build `eventBus`** — EventEmitter singleton + event constants + payload types
8. - [ ] **Confirm db import path** with team, re-export if needed from `src/shared/db/pool.ts`
9. - [ ] **Run migration 001** (extensions) → confirm Postgres has uuid-ossp etc.
10. - [ ] **Run migration 002** (create all 11 schemas) → this unblocks M2/M3/M4 to write their own migrations

### Phase 2: Identity and Org tables
11. - [ ] **Run migrations 003–004** (identity.users with token_version, system.audit_logs)
12. - [ ] **Run migrations 005–012** (all org tables: institutions, programs, batches, subdivisions, students, faculty_profiles, assignments)
13. - [ ] **Run migrations 013–015** (indexes and triggers)

### Phase 3: Auth middleware (M2/M3/M4 need these to test their modules)
14. - [ ] **Rewrite `authenticate` middleware** with token_version DB check
15. - [ ] **Fix `requireRole` / `rbac.ts`** — remove SUPER_ADMIN, fix schema names
16. - [ ] **Build `validateBody` helper**
17. - [ ] **Test middleware in isolation** — mock Express req/res, verify edge cases

### Phase 4: Auth endpoints
18. - [ ] **Rewrite `AuthService`** — remove `registerExternalStudent`, `verifyEmailCode`; add token_version to JWT; fix schema names (college → org); use AppError not bare Error; use transaction for register
19. - [ ] **Rewrite auth controller** — use `sendSuccess`/`sendError`; correct HTTP status codes (409, 401, 403)
20. - [ ] **Implement `POST /logout`** endpoint (increment token_version)
21. - [ ] **Register eventBus handlers** for `USER_REGISTERED` in M1 (audit log write)
22. - [ ] **Test auth endpoints** — registration, login, logout, me, duplicate email (409), bad password (401)

### Phase 5: Student and Org endpoints
23. - [ ] **Build `StudentService`** — get profile, update coding handles, update resume URL
24. - [ ] **Build `LocalStorageClient`** — file upload to `uploads/` folder
25. - [ ] **Student controller + routes** — with `requireStudentSelfOrStaff` guard
26. - [ ] **Org controller + routes** — read-only list endpoints for institutions, programs, batches, subdivisions
27. - [ ] **Test student endpoints**

### Phase 6: Mentor and Trainer assignments
28. - [ ] **Build assignment services** — mentor assign, trainer assign
29. - [ ] **Implement `POST /mentors/assign`** (PROGRAM_ADMIN only)
30. - [ ] **Implement `GET /mentors/my-students`** (FACULTY_MENTOR only)
31. - [ ] **Implement `PATCH /students/:studentId/verify-resume`** — sets `resume_verified=true`, emits `MENTOR_VERIFIED`
32. - [ ] **Register `MENTOR_VERIFIED` handler** in M1 (audit log)
33. - [ ] **Implement trainer assignment endpoints**
34. - [ ] **Implement `requireActiveTrainerTenure`** middleware

### Phase 7: Admin endpoints
35. - [ ] **Admin service + controller** — list users, change role, change status
36. - [ ] **Test admin endpoints**

### Phase 8: Handoff to M2/M3/M4
37. - [ ] **Notify team: schemas exist, middleware ready, shared utilities exported**
38. - [ ] **Share a working `GET /api/auth/me`** call as integration smoke test
39. - [ ] **Seed data**: run migration 120 (institution seed) so other modules have test data

---

## 18. Existing Code Audit

### What exists vs. what the plan requires

| File | Exists? | Status | Action |
|------|---------|--------|--------|
| `src/server.js` | Yes | Legacy — must delete | Delete in Step 0 |
| `src/index.ts` | Yes | Mostly OK; wrong route names | Fix route names (`/tasks→/checklist`, `/interviews→/sessions`) |
| `src/config/database.ts` | Yes | Usable | Re-export from shared or use directly |
| `src/config/env.ts` | Yes | `maxFileSizeMb=10` wrong | Fix to 5 |
| `src/middleware/auth.ts` | Yes | **CRITICAL: no token_version check** | Rewrite |
| `src/middleware/rbac.ts` | Yes | Wrong schema names, SUPER_ADMIN ref | Fix |
| `src/services/AuthService.ts` | Yes | Wrong schemas, bare Error throws, banned methods | Major rewrite |
| `src/routes/authRoutes.ts` | Yes | Has banned routes | Remove banned routes |
| `src/types/index.ts` | Yes | `SUPER_ADMIN` in UserRole | Remove SUPER_ADMIN |
| `src/database/schema.sql` | Yes | Reference only — NOT for migrations | Do not use for migrations; keep as reference |
| `backend/tests/auth.test.ts` | Yes | Wrong response format + wrong HTTP codes | Update after auth rewrite |

### Critical gaps to fix (in priority order)

1. **`authenticate` missing token_version DB check** — security gap; fix before any feature work
2. **`SUPER_ADMIN` in UserRole** — wrong business rule; causes authorization failures
3. **`AuthService` uses `college` schema** — queries will fail after migrations run with `org` schema
4. **Registration not atomic** — existing code inserts `users` and `students` separately; must use transaction
5. **`AuthService.generateToken()` missing `tokenVersion`** — JWT revocation will not work
6. **Test response format** — tests expect `res.body.token` but plan requires `res.body.data.token`
7. **Test HTTP codes** — tests expect 500 for errors but plan requires 409/401

### What to keep unchanged
- `src/config/env.ts` structure (just fix `maxFileSizeMb`)
- `src/config/database.ts` pool logic
- `bcrypt` cost 10
- JWT library (`jsonwebtoken`)
- `src/index.ts` middleware setup (CORS, body-parser, etc.) — only fix route names

---

## 19. Test Checklist

### Unit tests
- [ ] `AppError` instantiates with correct statusCode and message
- [ ] `sendSuccess` produces `{ status: 'success', data: ... }` envelope
- [ ] `sendError` maps AppError statusCode to HTTP response
- [ ] `authenticate` middleware: valid token + matching token_version → calls next()
- [ ] `authenticate` middleware: valid token + mismatched token_version → 401
- [ ] `authenticate` middleware: expired token → 401
- [ ] `authenticate` middleware: missing header → 401
- [ ] `requireRole(['PROGRAM_ADMIN'])`: student role → 403
- [ ] `requireRole(['PROGRAM_ADMIN'])`: admin role → calls next()

### Integration tests (hit the DB)
- [ ] POST `/api/auth/register` creates `identity.users` row
- [ ] POST `/api/auth/register` creates `org.students` row in same transaction
- [ ] POST `/api/auth/register` with duplicate email → 409
- [ ] POST `/api/auth/login` with correct credentials → 200 with token
- [ ] POST `/api/auth/login` with wrong password → 401
- [ ] GET `/api/auth/me` with valid token → 200 with user data
- [ ] GET `/api/auth/me` with expired token → 401
- [ ] POST `/api/auth/logout` increments `token_version` in DB
- [ ] POST `/api/auth/logout` followed by GET `/api/auth/me` with old token → 401
- [ ] PATCH `/api/students/:id` by different student → 403
- [ ] PATCH `/api/students/:id` by owner → 200
- [ ] PATCH `/api/students/:id/resume` with oversized file → 422/413

### Tests to update (existing failing tests)
- [ ] `backend/tests/auth.test.ts` — update to use `res.body.data.token` instead of `res.body.token`
- [ ] `backend/tests/auth.test.ts` — update expected HTTP codes: duplicate → 409, bad password → 401
- [ ] `backend/tests/auth.test.ts` — remove `role: 'STUDENT'` from register body (or confirm server ignores it)

---

## 20. Integration Checklist

These are the gates before M1 can declare itself complete and unblock the rest of the team.

- [ ] Migrations 001–015 run cleanly on a fresh Postgres database with no errors
- [ ] `GET /api/auth/me` works end-to-end with a real JWT from a real login
- [ ] `authenticate` middleware rejects a logged-out user's token (token_version check verified)
- [ ] `requireRole` blocks a student from calling a PROGRAM_ADMIN-only endpoint
- [ ] `eventBus.emit('USER_REGISTERED')` fires on registration (verify via console log or test handler)
- [ ] `org.students` table has `batch_id` and `subdivision_id` FKs (not `batch_year` text or `domain_id`)
- [ ] `system.audit_logs` table exists (not `identity.audit_logs`)
- [ ] `org.trainer_subdivision_assignments` table exists (not `college.trainer_tenures`)
- [ ] `org.student_mentor_assignments` table exists (not `mentor_id` column on students)
- [ ] Shared utilities (`AppError`, `sendSuccess`, `db`, `eventBus`, `UserRole`, `AuthUser`) importable by other modules
- [ ] M2 can use `authenticate` and `requireRole` in their routes without modification
- [ ] All 5 valid roles work in RBAC; `SUPER_ADMIN` causes a compile/runtime error
- [ ] `STORAGE_DRIVER=local` resume upload works; file appears in `uploads/` folder

---

## 21. Needs Confirmation — Ambiguous Items

| # | Item | Default assumption | Where to check |
|---|------|--------------------|----------------|
| NC-01 | Can staff (FACULTY_MENTOR, TRAINER, etc.) self-register via `POST /register`, or are staff accounts only admin-created? | Admin-created only; `POST /register` produces STUDENT always | BACKEND_IMPLEMENTATION_PLAN.md Section 5 |
| NC-02 | Does `org.subdivisions.type` use a specific enum or free-text VARCHAR? | Free-text VARCHAR(50) for MVP | BACKEND_IMPLEMENTATION_PLAN.md |
| NC-03 | What exact fields are editable via `PATCH /api/students/:id`? Only `codingHandles`, or also `rollNumber`, `batchId`, `subdivisionId`? | Only `codingHandles` for MVP (other fields set at registration) | API_REFERENCE.md M1 section |
| NC-04 | Should `GET /api/org/*` endpoints be authenticated (require JWT) or public? | Authenticated (require JWT) for MVP | Security posture decision |
| NC-05 | Is `batch_id` required at registration or optional (can a student exist without a batch assignment)? | Required — student must belong to a batch | BACKEND_IMPLEMENTATION_PLAN.md |
| NC-06 | For `org.student_mentor_assignments` — can a student have multiple active assignments or exactly one? | Exactly one active (enforce via `is_active` flag or unique constraint on `(student_id, is_active=true)`) | BACKEND_IMPLEMENTATION_PLAN.md |
| NC-07 | Agreed import path for `db` pool — `src/shared/db/pool.ts` or `src/config/database.ts`? | `src/config/database.ts` for now (move later if team agrees) | Decide before Phase 1 starts |

---

## 22. Later — Post-MVP (Do Not Build Now)

| Feature | Reason deferred |
|---------|----------------|
| Email verification | Decision D-22 — removed from scope |
| Redis token blacklist | EventEmitter + token_version is sufficient for MVP |
| RabbitMQ / Bull queue | EventEmitter is MVP; swap at Beta gate |
| Soft delete (deleted_at column) | Add after MVP is stable |
| MinIO storage | `LocalStorageClient` is MVP; swap at Beta gate via `STORAGE_DRIVER` env var |
| Pagination on org list endpoints | Only needed if institution has > 200 rows |
| Prometheus `/metrics` endpoint | Observability gate is post-Alpha |
| Refresh token flow | Single JWT with token_version revocation is MVP |
| SSO / OAuth | Not in programme scope |

---

## Quick Reference Card

### First migration to write
`001_extensions.sql` — enables UUID generation. Nothing else can run without it.

### First API to implement
`POST /api/auth/register` — but only after:
1. Migrations 001–012 run (tables exist)
2. `AppError` and response helpers exist
3. `authenticate` middleware rewritten

### Biggest risk
The `authenticate` middleware missing the `token_version` DB check. If this ships without the fix, logout does nothing and revoked tokens stay valid indefinitely. Fix this before any feature testing.

### Handoff gate
When M1 can run this sequence without errors, notify the team:
```bash
curl -X POST /api/auth/register ...      # → 201 with token
curl -X GET  /api/auth/me -H "Bearer T"  # → 200
curl -X POST /api/auth/logout -H "Bearer T"  # → 200
curl -X GET  /api/auth/me -H "Bearer T"  # → 401  ← token_version check working
```
