# Module 4 Implementation Checklist
**Owner:** Member 4 | **Migration range:** 091–109 | **Focus:** Credits, Checklist & Placement

This checklist is the daily working document for Member 4. Member 4 owns the credit economy, the placement readiness checklist, and the mentor verification pipeline.

**Read this first:** Member 4 has the highest priority deliverable in the entire backend — `CreditService.consume()`. Member 2 CANNOT implement `POST /api/attempts/start` without it. Your first task after setting up your file structure is to deliver a working stub for `CreditService`, even if the real database tables are not yet ready. The stub must match the exact interface M2 will call.

---

## 1. Module 4 Ownership Summary

| Area | What M4 builds |
|------|---------------|
| Credit accounts | `credit.credit_accounts` — one per student; created on USER_REGISTERED |
| Credit transactions | `credit.credit_transactions` — immutable ledger; every credit change is a row |
| Credit policies | `credit.credit_policies` — configurable earn/cost rules |
| CreditService | `consume()` and `earn()` — the core financial operations |
| Checklist items | `placement.checklist_items` — platform-defined requirements for placement |
| Checklist progress | `placement.checklist_progress` — per-student per-item toggle |
| Mentor verifications | `placement.mentor_verifications` — mentor signs off on student requirement |
| Placement eligibility | `placement.placement_eligibility` — per-student eligibility record |
| Event handler: USER_REGISTERED | Creates `credit_accounts` row with initial balance |
| Event handler: ATTEMPT_COMPLETED | Credits earned; placement eligibility recalculated |
| CHECKLIST_ITEM_TOGGLED event | Emitted when student marks/unmarks a checklist item |
| MENTOR_VERIFIED event | Emitted when mentor signs off a verification |
| CSV import | POST /api/checklist/import for bulk item upload |
| Credits APIs | Balance, history, consume, earn, policy management |
| Checklist APIs | Items CRUD, student progress, mentor verifications |
| Placement APIs | Eligibility check, eligibility list |

---

## 2. MVP Scope

### In scope — build now
- All tables in `credit` schema (3 tables)
- All tables in `placement` schema (4 tables)
- `CreditService` stub — deliver FIRST before database tables
- `CreditService` real implementation — after tables are created
- `USER_REGISTERED` event handler — creates credit account
- `ATTEMPT_COMPLETED` event handler — earn credits + update eligibility
- All MVP API endpoints in Section 7
- CSV import for checklist items
- `CHECKLIST_ITEM_TOGGLED` event emission
- `MENTOR_VERIFIED` event emission
- Mentor verification scope guard (mentor can only verify their assigned students)

### Out of scope — do not build yet
- `/api/placement/export` (CSV export for placement office) — post-MVP
- `/api/credits/refund` — post-MVP (refund policy TBD)
- `/api/credits/admin-adjust` — post-MVP
- Placement eligibility audit trail — post-MVP
- Automated credit policy configuration UI — post-MVP

---

## 3. Database Tables

### 3.1 `credit.credit_accounts`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `student_id` | UUID FK → `org.students` UNIQUE | One account per student |
| `balance` | INTEGER NOT NULL DEFAULT 0 | Current credit balance (integer, not decimal) |
| `total_earned` | INTEGER NOT NULL DEFAULT 0 | Lifetime credits earned |
| `total_consumed` | INTEGER NOT NULL DEFAULT 0 | Lifetime credits spent |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ DEFAULT now() | |

**Never allow `balance < 0`.** This constraint must be enforced at the service layer AND as a DB CHECK constraint: `CHECK (balance >= 0)`.

### 3.2 `credit.credit_transactions`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `account_id` | UUID FK → `credit.credit_accounts` | |
| `amount` | INTEGER NOT NULL | Positive = earn, negative = spend |
| `type` | VARCHAR(20) NOT NULL | `EARN`, `CONSUME` |
| `reason` | VARCHAR(100) NOT NULL | Human-readable label e.g. `ASSESSMENT_START`, `ATTEMPT_COMPLETED` |
| `reference_id` | UUID | FK to triggering entity (attempt_id, checklist_item_id, etc.) |
| `balance_after` | INTEGER NOT NULL | Snapshot of balance AFTER this transaction |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

**Immutable.** Never UPDATE or DELETE a credit_transactions row. Corrections are new offsetting rows.

### 3.3 `credit.credit_policies`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `policy_key` | VARCHAR(100) UNIQUE NOT NULL | e.g. `EARN_ATTEMPT_COMPLETED`, `COST_ASSESSMENT_START` |
| `amount` | INTEGER NOT NULL | Credits to earn or cost |
| `description` | TEXT | |
| `is_active` | BOOLEAN DEFAULT TRUE | |
| `updated_by` | UUID FK → `identity.users` | |
| `updated_at` | TIMESTAMPTZ DEFAULT now() | |

**Initial seed values** (put in migration 105_seed_credit_policies.sql):
- `INITIAL_BALANCE`: 50 — credits given to new students on account creation
- `EARN_ATTEMPT_COMPLETED`: 10 — credits earned per completed assessment
- `COST_ASSESSMENT_START`: read from `assessment.assessments.configuration` JSONB (default 10)

### 3.4 `placement.checklist_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `title` | VARCHAR(255) NOT NULL | |
| `description` | TEXT | |
| `category` | VARCHAR(50) NOT NULL | `RESUME`, `SKILLS`, `ASSESSMENTS`, `BEHAVIOR`, `OTHER` |
| `requires_mentor_verification` | BOOLEAN DEFAULT FALSE | If true → student toggle alone is not sufficient |
| `is_required` | BOOLEAN DEFAULT TRUE | Required items block placement eligibility |
| `is_active` | BOOLEAN DEFAULT TRUE | |
| `created_by` | UUID FK → `identity.users` | |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

### 3.5 `placement.checklist_progress`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `student_id` | UUID FK → `org.students` | |
| `checklist_item_id` | UUID FK → `placement.checklist_items` | |
| `is_completed` | BOOLEAN DEFAULT FALSE | |
| `completed_at` | TIMESTAMPTZ | |
| `verified_by_mentor_id` | UUID FK → `org.students` | NULL until mentor verifies |
| `verification_id` | UUID FK → `placement.mentor_verifications` | |
| UNIQUE | `(student_id, checklist_item_id)` | |

**Note:** `verified_by_mentor_id` points to `org.students` (faculty mentor row) — `[NEEDS CONFIRMATION]` whether this should point to `identity.users` instead.

### 3.6 `placement.mentor_verifications`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `student_id` | UUID FK → `org.students` | |
| `checklist_item_id` | UUID FK → `placement.checklist_items` | |
| `mentor_id` | UUID FK → `org.students` | The faculty mentor performing verification |
| `status` | VARCHAR(20) NOT NULL | `PENDING`, `APPROVED`, `REJECTED` |
| `note` | TEXT | Optional mentor comment |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |
| `resolved_at` | TIMESTAMPTZ | |

**Scope guard:** The mentor can only verify items for students assigned to them (check M1's mentor assignment table).

### 3.7 `placement.placement_eligibility`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `student_id` | UUID FK → `org.students` UNIQUE | One record per student |
| `is_eligible` | BOOLEAN DEFAULT FALSE | |
| `checklist_completion_pct` | DECIMAL(5,2) DEFAULT 0 | 0–100; required items only |
| `performance_score` | DECIMAL(5,2) DEFAULT 0 | Snapshot from performance_profiles.overall_score |
| `credit_balance` | INTEGER DEFAULT 0 | Snapshot at time of last recalculation |
| `last_evaluated_at` | TIMESTAMPTZ | |
| `reason` | TEXT | Human-readable explanation of ineligibility |

**Not immutable.** Updated every time `ATTEMPT_COMPLETED` fires or a checklist item is toggled. The eligibility determination rules are in Section 8.

---

## 4. Database Relationships

```
org.students (M1 owns)
    ├── (1:1) credit.credit_accounts [created on USER_REGISTERED]
    │           └── (1:N) credit.credit_transactions [immutable ledger]
    │
    ├── (1:N) placement.checklist_progress
    │           └── (1:1) placement.mentor_verifications (optional)
    │
    └── (1:1) placement.placement_eligibility [recalculated on events]

placement.checklist_items (M4 owns)
    └── (1:N) placement.checklist_progress

credit.credit_policies (platform config)
    ← read by CreditService.consume() and CreditService.earn()

performance.performance_profiles (M3 owns)
    ← read by M4's eligibility recalculation
```

Cross-schema FKs in migration 115 (shared, NOT written by M4):
- `org.students.id` ← `credit.credit_accounts.student_id`
- `org.students.id` ← `placement.placement_eligibility.student_id`

---

## 5. Required Migrations (091–109)

| File | Creates |
|------|---------|
| `091_credit_credit_accounts.sql` | `credit.credit_accounts` table + CHECK balance >= 0 |
| `092_credit_credit_transactions.sql` | `credit.credit_transactions` table |
| `093_credit_credit_policies.sql` | `credit.credit_policies` table |
| `094_placement_checklist_items.sql` | `placement.checklist_items` table |
| `095_placement_checklist_progress.sql` | `placement.checklist_progress` table |
| `096_placement_mentor_verifications.sql` | `placement.mentor_verifications` table |
| `097_placement_placement_eligibility.sql` | `placement.placement_eligibility` table |
| `098_m4_indexes.sql` | Indexes on student_id, account_id, item_id |
| `099_m4_updated_at_triggers.sql` | `updated_at` triggers for credit_accounts, placement_eligibility |
| `105_seed_credit_policies.sql` | Insert INITIAL_BALANCE + EARN_ATTEMPT_COMPLETED policies |
| `106_seed_checklist_items.sql` | Insert initial checklist items (sample, can expand) |
| `107_109_placeholder.sql` | Reserved for M4 additions |

> M4 does NOT write migrations 110+ (those belong to shared FKs and seeds).

---

## 6. API Endpoints

### Credits
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/credits/balance` | Yes | STUDENT (own) | Get own credit balance |
| GET | `/api/credits/history` | Yes | STUDENT (own), PROGRAM_ADMIN | Get transaction history |
| GET | `/api/credits/policies` | Yes | PROGRAM_ADMIN | List credit policies |
| PUT | `/api/credits/policies/:key` | Yes | PROGRAM_ADMIN | Update policy amount |

### Checklist Items (platform administration)
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/checklist` | Yes | Any | List all active checklist items |
| POST | `/api/checklist` | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | Add single item |
| PUT | `/api/checklist/:id` | Yes | PROGRAM_ADMIN, PLACEMENT_COORDINATOR | Update item |
| DELETE | `/api/checklist/:id` | Yes | PROGRAM_ADMIN | Soft-delete item |
| POST | `/api/checklist/import` | Yes | PROGRAM_ADMIN | CSV bulk import |

### Student Checklist Progress
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/checklist/progress/:studentId` | Yes | STUDENT (own), FACULTY_MENTOR (mentee), PROGRAM_ADMIN | Get student's checklist progress |
| POST | `/api/checklist/progress/:itemId/toggle` | Yes | STUDENT (own) | Mark/unmark item complete |

### Mentor Verifications
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/verifications/pending` | Yes | FACULTY_MENTOR | List pending verifications for assigned students |
| POST | `/api/verifications/:id/approve` | Yes | FACULTY_MENTOR | Approve verification (scope-guarded) |
| POST | `/api/verifications/:id/reject` | Yes | FACULTY_MENTOR | Reject verification (scope-guarded) |
| POST | `/api/verifications/request` | Yes | STUDENT | Request mentor verification for a checklist item |

### Placement Eligibility
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/placement/eligibility/:studentId` | Yes | STUDENT (own), FACULTY_MENTOR (mentee), PROGRAM_ADMIN, PLACEMENT_COORDINATOR | Get eligibility record |
| GET | `/api/placement/eligible-students` | Yes | PLACEMENT_COORDINATOR, PROGRAM_ADMIN | List all eligible students |

---

## 7. Request / Response Contracts

### GET `/api/credits/balance`
```json
{ "data": { "balance": 40, "totalEarned": 60, "totalConsumed": 20, "accountId": "uuid" } }
```

### GET `/api/credits/history`
```json
{ "data": {
  "transactions": [
    {
      "id": "uuid",
      "amount": -10,
      "type": "CONSUME",
      "reason": "ASSESSMENT_START",
      "referenceId": "attempt-uuid",
      "balanceAfter": 40,
      "createdAt": "ISO string"
    }
  ]
}}
```

### POST `/api/checklist/progress/:itemId/toggle`
```json
// Request — no body needed; toggle means flip is_completed
// Response 200
{ "data": {
  "itemId": "uuid",
  "isCompleted": true,
  "completedAt": "ISO string",
  "requiresMentorVerification": false
}}
```

If `requires_mentor_verification = true` and student toggles to completed → create a `mentor_verifications` entry with `status = PENDING` instead of marking `is_completed = true`.

### POST `/api/checklist/import`
```
Content-Type: multipart/form-data
file: items.csv
```

CSV format:
```csv
title,description,category,requires_mentor_verification,is_required
Upload resume,Upload latest resume to profile,RESUME,false,true
Complete mock interview,Score ≥ 60 in MOCK_INTERVIEW,ASSESSMENTS,false,true
Get mentor sign-off on communication,Mentor reviews communication score,SKILLS,true,true
```

```json
// Response 201
{ "data": { "imported": 3, "skipped": 0, "errors": [] } }
```

### POST `/api/verifications/:id/approve`
```json
// Request
{ "note": "Student demonstrated strong communication skills in last session" }

// Response 200
{ "data": { "verificationId": "uuid", "status": "APPROVED", "resolvedAt": "ISO string" } }
// Side effect: checklist_progress.is_completed = true, verified_by_mentor_id = mentor's student id
// Side effect: eventBus.emit(MENTOR_VERIFIED, { verificationId, studentId, checklistItemId, mentorId, outcome: 'APPROVED' })
```

### GET `/api/placement/eligibility/:studentId`
```json
{ "data": {
  "studentId": "uuid",
  "isEligible": true,
  "checklistCompletionPct": 87.5,
  "performanceScore": 74.2,
  "creditBalance": 40,
  "lastEvaluatedAt": "ISO string",
  "reason": null
}}
```

If `isEligible = false`:
```json
{ "data": {
  "isEligible": false,
  "reason": "Required checklist items incomplete (Resume not uploaded). Performance score below threshold (current: 45.0, minimum: 60.0)"
}}
```

---

## 8. CreditService — M4's Most Critical Deliverable

### Interface (deliver this stub FIRST — unblocks M2)

```typescript
// src/modules/credits/credits.service.ts

export interface ConsumeResult {
  newBalance: number;
  transactionId: string;
}

export interface EarnResult {
  newBalance: number;
  transactionId: string;
}

export class CreditService {
  async consume(
    studentId: string,
    amount: number,
    reason: string,
    referenceId: string
  ): Promise<ConsumeResult>

  async earn(
    studentId: string,
    amount: number,
    reason: string,
    referenceId: string
  ): Promise<EarnResult>
}
```

### Stub (deliver on Day 1 — before tables exist)

```typescript
// src/modules/credits/credits.service.stub.ts
// Delete this file when real implementation is ready.
export class CreditServiceStub {
  async consume(_studentId: string, _amount: number, _reason: string, _referenceId: string) {
    return { newBalance: 50, transactionId: 'stub-transaction-id' };
  }
  async earn(_studentId: string, _amount: number, _reason: string, _referenceId: string) {
    return { newBalance: 60, transactionId: 'stub-transaction-id' };
  }
}
```

**Tell M2 the stub is ready** so they can start implementing `POST /api/attempts/start`.

### Real Implementation — `CreditService.consume()`

```typescript
async consume(studentId: string, amount: number, reason: string, referenceId: string): Promise<ConsumeResult> {
  return await db.transaction(async (trx) => {
    // SELECT FOR UPDATE prevents concurrent double-spend
    const account = await trx.query(
      'SELECT * FROM credit.credit_accounts WHERE student_id = $1 FOR UPDATE',
      [studentId]
    );

    if (!account.rows[0]) {
      throw new AppError(404, 'Credit account not found', 'ACCOUNT_NOT_FOUND');
    }

    if (account.rows[0].balance < amount) {
      throw new AppError(402, 'Insufficient credits', 'INSUFFICIENT_CREDITS');
    }

    const newBalance = account.rows[0].balance - amount;

    await trx.query(
      'UPDATE credit.credit_accounts SET balance = $1, total_consumed = total_consumed + $2 WHERE student_id = $3',
      [newBalance, amount, studentId]
    );

    const tx = await trx.query(`
      INSERT INTO credit.credit_transactions (id, account_id, amount, type, reason, reference_id, balance_after)
      VALUES (gen_random_uuid(), $1, $2, 'CONSUME', $3, $4, $5)
      RETURNING id
    `, [account.rows[0].id, -amount, reason, referenceId, newBalance]);

    return { newBalance, transactionId: tx.rows[0].id };
  });
}
```

### Real Implementation — `CreditService.earn()`

```typescript
async earn(studentId: string, amount: number, reason: string, referenceId: string): Promise<EarnResult> {
  return await db.transaction(async (trx) => {
    const account = await trx.query(
      'SELECT * FROM credit.credit_accounts WHERE student_id = $1 FOR UPDATE',
      [studentId]
    );

    if (!account.rows[0]) {
      throw new AppError(404, 'Credit account not found', 'ACCOUNT_NOT_FOUND');
    }

    const newBalance = account.rows[0].balance + amount;

    await trx.query(
      'UPDATE credit.credit_accounts SET balance = $1, total_earned = total_earned + $2 WHERE student_id = $3',
      [newBalance, amount, studentId]
    );

    const tx = await trx.query(`
      INSERT INTO credit.credit_transactions (id, account_id, amount, type, reason, reference_id, balance_after)
      VALUES (gen_random_uuid(), $1, $2, 'EARN', $3, $4, $5)
      RETURNING id
    `, [account.rows[0].id, amount, reason, referenceId, newBalance]);

    return { newBalance, transactionId: tx.rows[0].id };
  });
}
```

---

## 9. Events

### Handlers M4 registers

#### USER_REGISTERED → create credit account
```typescript
eventBus.on(Events.USER_REGISTERED, async (payload: UserRegisteredPayload) => {
  if (payload.role !== 'STUDENT') return;

  const policy = await db.query(
    "SELECT amount FROM credit.credit_policies WHERE policy_key = 'INITIAL_BALANCE' AND is_active = true"
  );
  const initialBalance = policy.rows[0]?.amount ?? 50;

  await db.query(`
    INSERT INTO credit.credit_accounts (id, student_id, balance, total_earned)
    VALUES (gen_random_uuid(), $1, $2, $2)
    ON CONFLICT (student_id) DO NOTHING
  `, [payload.studentId, initialBalance]);

  // Record the initial balance as an EARN transaction
  const account = await db.query('SELECT id FROM credit.credit_accounts WHERE student_id = $1', [payload.studentId]);
  await db.query(`
    INSERT INTO credit.credit_transactions (id, account_id, amount, type, reason, balance_after)
    VALUES (gen_random_uuid(), $1, $2, 'EARN', 'INITIAL_BALANCE', $2)
  `, [account.rows[0].id, initialBalance]);
});
```

#### ATTEMPT_COMPLETED → earn credits + update eligibility
```typescript
eventBus.on(Events.ATTEMPT_COMPLETED, async (payload: AttemptCompletedPayload) => {
  // Step 1: Earn credits
  const earnPolicy = await db.query(
    "SELECT amount FROM credit.credit_policies WHERE policy_key = 'EARN_ATTEMPT_COMPLETED' AND is_active = true"
  );
  const earnAmount = earnPolicy.rows[0]?.amount ?? 10;

  await CreditService.earn(payload.studentId, earnAmount, 'ATTEMPT_COMPLETED', payload.attemptId);

  // Step 2: Recalculate placement eligibility
  await EligibilityService.recalculate(payload.studentId);
});
```

### Events M4 emits

#### CHECKLIST_ITEM_TOGGLED
```typescript
// After POST /api/checklist/progress/:itemId/toggle
eventBus.emit(Events.CHECKLIST_ITEM_TOGGLED, {
  studentId: string,
  checklistItemId: string,
  isCompleted: boolean
});
```

#### MENTOR_VERIFIED
```typescript
// After POST /api/verifications/:id/approve or /reject
eventBus.emit(Events.MENTOR_VERIFIED, {
  verificationId: string,
  studentId: string,
  checklistItemId: string,
  mentorId: string,
  outcome: 'APPROVED' | 'REJECTED'
});
```

---

## 10. Placement Eligibility Rules

Implemented in `EligibilityService.recalculate(studentId)`:

```
1. Fetch checklist_items WHERE is_required = true AND is_active = true
2. Fetch checklist_progress WHERE student_id = studentId AND is_completed = true
3. checklist_completion_pct = (completed required items / total required items) * 100
4. Fetch performance_profiles.overall_score (from M3)
5. Fetch credit_accounts.balance (from M4)

6. is_eligible = true IF ALL of:
   - checklist_completion_pct >= 100    (all required items done)
   - performance_score >= 60.0          [NEEDS CONFIRMATION: threshold value]
   - credit_balance >= 0               (no restriction; just snapshot)

7. UPSERT placement.placement_eligibility
```

**Note:** Eligibility thresholds (`60.0` performance score) are `[NEEDS CONFIRMATION]` — use as default and document clearly.

---

## 11. Mentor Verification Scope Guard

On `POST /api/verifications/:id/approve` and `/reject`:

```typescript
// In VerificationService.resolve():
// 1. Fetch the mentor_verification row
// 2. Get mentorId from req.user.id → look up org.students for this user
// 3. Check M1's mentor assignment: does this mentor have this student assigned?
//    Query: SELECT * FROM college.students WHERE id = verification.student_id AND faculty_mentor_id = mentorStudentId
//    [NEEDS CONFIRMATION: M1's assignment table name — 'college.students' vs 'org.students']
// 4. If no assignment → throw AppError(403, 'You are not assigned to this student', 'FORBIDDEN')
```

---

## 12. Dependencies

### What M4 needs from other members

| Source | What | When needed |
|--------|------|-------------|
| M1 | `authenticate`, `requireRole` middlewares | Before ANY protected route |
| M1 | `AppError`, `sendSuccess`, `sendError` from `src/shared/` | Before any controller |
| M1 | `eventBus` from `src/shared/events/` | Before registering event handlers |
| M1 | `USER_REGISTERED` event with `{ userId, studentId, role }` | Before M4's handler can fire |
| M1 | `org.students` table (FK source for credit_accounts) | Before creating M4's tables |
| M1 | Mentor assignment table (for verification scope guard) | Before mentor verification routes |
| M2 | `ATTEMPT_COMPLETED` event | M4 earns credits on this event |
| M3 | `performance.performance_profiles.overall_score` | M4 reads for eligibility recalculation |

### What M4 provides to others

| Consumer | Provides |
|----------|----------|
| M2 | `CreditService.consume()` stub — unblocks `POST /api/attempts/start` |
| M2 | `CreditService.consume()` real — production credit deduction |
| M3 | none (M4 reads from M3; M3 does not depend on M4) |
| M1/Admin | Placement eligibility data |

### What M4 must NOT modify
- `identity.*` and `org.*` — M1 owns
- `assessment.*`, `session.*`, `evaluation.*` — M2 owns
- `performance.*` — M3 owns (M4 reads performance_profiles but NEVER writes to it)

---

## 13. Implementation Order

### Priority 0: Stub delivery (do this before database tables)
1. - [ ] Create `src/modules/credits/credits.service.ts` with full interface
2. - [ ] Create `src/modules/credits/credits.service.stub.ts` with working stub
3. - [ ] Tell M2 the stub is ready so they can start `POST /api/attempts/start`

### Phase 1: Database setup
4. - [ ] Write migrations 091–099
5. - [ ] Write seed migrations 105–106
6. - [ ] Run migrations — verify all tables created
7. - [ ] Verify CHECK constraint on credit_accounts: `balance >= 0`

### Phase 2: CreditService real implementation
8. - [ ] Implement `CreditService.consume()` with `SELECT FOR UPDATE`
9. - [ ] Implement `CreditService.earn()`
10. - [ ] Unit test: consume with sufficient balance → balance decremented
11. - [ ] Unit test: consume with insufficient balance → 402 INSUFFICIENT_CREDITS
12. - [ ] Unit test: concurrent consume (double-spend) → only one succeeds
13. - [ ] Unit test: every consume/earn writes a credit_transactions row
14. - [ ] Unit test: `balance_after` in transaction matches actual account balance

### Phase 3: Event handlers
15. - [ ] Implement `USER_REGISTERED` handler → create credit account with initial balance
16. - [ ] Register handler in module init
17. - [ ] Test: fire USER_REGISTERED → credit_accounts row created with INITIAL_BALANCE credits
18. - [ ] Test: fire USER_REGISTERED twice → ON CONFLICT DO NOTHING (no error)
19. - [ ] Implement `ATTEMPT_COMPLETED` handler → earn credits + recalculate eligibility
20. - [ ] Register handler in module init
21. - [ ] Test: fire ATTEMPT_COMPLETED → balance increases, eligibility updated

### Phase 4: Credits APIs
22. - [ ] Build `GET /api/credits/balance`
23. - [ ] Build `GET /api/credits/history`
24. - [ ] Build credit policies CRUD (GET list, PUT update)
25. - [ ] Tests for all credits endpoints

### Phase 5: Checklist items
26. - [ ] Build checklist CRUD: list, create, update, soft-delete
27. - [ ] Build CSV import endpoint
28. - [ ] Test CSV import: 3 rows → 3 items created
29. - [ ] Test CSV import: duplicate title → show in errors array

### Phase 6: Student checklist progress
30. - [ ] Build `GET /api/checklist/progress/:studentId`
31. - [ ] Build `POST /api/checklist/progress/:itemId/toggle`
32. - [ ] If `requires_mentor_verification = true` → create pending mentor_verifications entry instead of toggling
33. - [ ] After toggle → emit `CHECKLIST_ITEM_TOGGLED` event
34. - [ ] After toggle → call `EligibilityService.recalculate(studentId)`
35. - [ ] Test: toggle an item → CHECKLIST_ITEM_TOGGLED fires
36. - [ ] Test: toggle item with requires_mentor_verification → mentor_verifications created PENDING

### Phase 7: Mentor verifications
37. - [ ] Build `GET /api/verifications/pending` (filtered to requesting mentor's assigned students)
38. - [ ] Build `POST /api/verifications/request` (student requests mentor sign-off)
39. - [ ] Build `POST /api/verifications/:id/approve` with scope guard + MENTOR_VERIFIED emit
40. - [ ] Build `POST /api/verifications/:id/reject` with scope guard + MENTOR_VERIFIED emit
41. - [ ] Test: mentor approves → checklist_progress.is_completed = true
42. - [ ] Test: mentor approves for non-assigned student → 403

### Phase 8: Placement eligibility
43. - [ ] Implement `EligibilityService.recalculate(studentId)`
44. - [ ] Build `GET /api/placement/eligibility/:studentId`
45. - [ ] Build `GET /api/placement/eligible-students`
46. - [ ] Test: all required items done + score ≥ 60 → is_eligible = true
47. - [ ] Test: one required item missing → is_eligible = false with descriptive reason

### Phase 9: Replace M2's stub
48. - [ ] Confirm M2 is ready to switch from stub to real implementation
49. - [ ] M2 removes stub import; switches to real CreditService
50. - [ ] Integration test: `POST /api/attempts/start` with real database + insufficient credits → 402

---

## 14. Testing Checklist

### Unit tests
- [ ] `consume(balance=50, amount=10)` → balance = 40, transaction written
- [ ] `consume(balance=5, amount=10)` → AppError(402, INSUFFICIENT_CREDITS) thrown
- [ ] `consume()` writes `credit_transactions` with correct `balance_after` snapshot
- [ ] `earn()` increases balance and total_earned
- [ ] `earn()` writes `credit_transactions` with correct `balance_after`
- [ ] `USER_REGISTERED` handler: role = STUDENT → account created
- [ ] `USER_REGISTERED` handler: role = FACULTY_MENTOR → no account created
- [ ] `USER_REGISTERED` handler idempotent: same studentId twice → no duplicate
- [ ] `ATTEMPT_COMPLETED` handler: earn credits fired after attempt
- [ ] Eligibility recalculate: 100% checklist + score 70 → eligible
- [ ] Eligibility recalculate: 80% checklist → ineligible with reason
- [ ] Eligibility recalculate: score 45 → ineligible with reason
- [ ] Toggle `requires_mentor_verification = true` → creates PENDING verification, NOT direct toggle
- [ ] Mentor scope guard: mentor approves non-assigned student → 403
- [ ] CSV import: valid 3-row file → 3 items created, imported=3
- [ ] CSV import: row with missing title → listed in errors array, not imported

### Ledger integrity tests
- [ ] After 10 transactions, SUM of credit_transactions.amount = credit_accounts.balance for each account
- [ ] `balance_after` on each row equals previous `balance_after + amount` (running reconciliation)
- [ ] No balance below 0 at any point in transaction history

### Integration tests (require database)
- [ ] Register student → credit account created with initial balance
- [ ] Complete assessment → earn credits → balance increased
- [ ] `POST /api/attempts/start` (M2 route) + real CreditService: balance=0 → 402
- [ ] Full flow: register → start attempt (–10) → complete attempt (+10) → balance = initial

---

## 15. Integration Checklist

Before declaring Module 4 complete:

- [ ] M2 can call `CreditService.consume()` and receive 402 on low balance
- [ ] `USER_REGISTERED` from M1 → `credit.credit_accounts` row created
- [ ] `ATTEMPT_COMPLETED` from M2 → credits earned; eligibility updated
- [ ] `GET /api/placement/eligibility/:studentId` reflects latest performance score from M3
- [ ] Checklist toggle → `CHECKLIST_ITEM_TOGGLED` fires
- [ ] Mentor approve → `MENTOR_VERIFIED` fires
- [ ] Mentor cannot approve items for students they are not assigned to (scope guard confirmed)
- [ ] All credit transaction rows are immutable (no UPDATE paths in CreditService)
- [ ] Ledger reconciliation passes: sum of transactions = current balance
- [ ] All response shapes use `{ "data": {...} }` envelope
- [ ] All errors use `{ "error": { "code": "...", "message": "..." } }` via AppError + sendError
- [ ] No SQL injection: all DB calls use parameterized queries

---

## 16. Needs Confirmation

| # | Item | Default assumption |
|---|------|--------------------|
| NC-01 | Initial credit balance for new students | Default: 50 (from credit_policies seed) |
| NC-02 | Credits earned per completed assessment | Default: 10 (from credit_policies seed) |
| NC-03 | Performance score threshold for placement eligibility | Default: 60.0 — `[NEEDS CONFIRMATION]` |
| NC-04 | Checklist completion must be 100% or can it be lower (e.g. 80%)? | Default: 100% required items |
| NC-05 | `verified_by_mentor_id` in checklist_progress — should this point to `identity.users` or `org.students`? | `[NEEDS CONFIRMATION]` |
| NC-06 | Mentor assignment table name — `college.students.faculty_mentor_id` or a separate `org.mentor_assignments` table? | `[NEEDS CONFIRMATION]` — depends on M1 schema |
| NC-07 | Does abandoning an assessment (`PUT /api/attempts/:id/abandon`) trigger a credit refund? | Default: NO refund (M4 decides and documents this policy) |
| NC-08 | CSV import maximum file size — use same 5MB limit as other uploads? | Default: 5MB (matches `config.upload.maxFileSizeMb`) |
| NC-09 | Can a placement coordinator manually override `is_eligible = true`? | Default: No manual override — only computed values |

---

## 17. Post-MVP (Do Not Build Now)

| Feature | Reason deferred |
|---------|----------------|
| `/api/placement/export` (CSV for placement office) | Low complexity but low priority |
| `/api/credits/refund` | Refund policy not defined |
| `/api/credits/admin-adjust` | Manual adjustment risk; policy not defined |
| Placement eligibility audit trail | Adds complexity; derived from events |
| Automated credit policy UI | Admin can use PUT /api/credits/policies/:key for now |
| Credit expiry / TTL per credit | Not in MVP scope |

---

## 18. Quick Reference

```
Schemas owned: credit (3 tables), placement (4 tables)
Migration range: 091–109 + seeds at 105–106
Events consumed: USER_REGISTERED (M1), ATTEMPT_COMPLETED (M2)
Events emitted: CHECKLIST_ITEM_TOGGLED, MENTOR_VERIFIED
Critical deliverable: CreditService stub (Day 1 — unblocks M2)
Critical dependency: M1 must define mentor assignment table (for scope guard)
Biggest risk: SELECT FOR UPDATE in consume() — verify DB pool supports transactions
```
