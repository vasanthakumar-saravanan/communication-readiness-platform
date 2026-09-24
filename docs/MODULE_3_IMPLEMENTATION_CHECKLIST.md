# Module 3 Implementation Checklist
**Owner:** Member 3 | **Migration range:** 061–090 | **Focus:** Performance, Skills & Learning

This checklist is the daily working document for Member 3. Member 3 owns the student performance profile — tracking skill growth over time, maintaining the skills taxonomy, and providing learning story content for listening assessments.

**Read this first:** Module 3 is primarily a consumer of events from M1 and M2. You listen on `USER_REGISTERED` (from M1) and `ATTEMPT_COMPLETED` (from M2). Your two most critical tables are `performance.performance_profiles` and `performance.performance_snapshots` — these are updated every time a student completes an assessment. You also own the `performance.skills` taxonomy which M2 depends on to tag questions, so the skills seed data must be available before M2 can do question tagging.

---

## 1. Module 3 Ownership Summary

| Area | What M3 builds |
|------|---------------|
| Skill taxonomy | `performance.skills` table + CRUD APIs + seed data |
| Performance profiles | `performance.performance_profiles` — one per student |
| Performance snapshots | `performance.performance_snapshots` — one per completed attempt |
| Skill performance records | `performance.skill_performances` — per-skill scores per snapshot |
| Listening stories | `performance.listening_stories` — audio/text content for M2's listening sessions |
| Event handler: USER_REGISTERED | Create `performance_profiles` entry for new student (async) |
| Event handler: ATTEMPT_COMPLETED | Update profile + create snapshot + update skill scores (async) |
| Performance APIs | GET profile, GET history, GET skill breakdown |
| Skills APIs | CRUD for skill taxonomy |
| Listening stories APIs | Upload + list stories |
| Learning plans | Post-MVP |
| Knowledge base | Post-MVP |
| Agent runs | Post-MVP |

---

## 2. MVP Scope

### In scope — build now
- All tables in `performance` schema (6 tables)
- `knowledge.knowledge_documents`, `knowledge.knowledge_chunks` — structure only; population is post-MVP
- Skills seed data (at least 20 predefined skills across 4 domains)
- `USER_REGISTERED` event handler — creates performance_profiles entry
- `ATTEMPT_COMPLETED` event handler — updates profile, creates snapshot, updates skill_performances
- All MVP API endpoints in Section 7
- Listening stories upload + list + serve for M2

### Out of scope — do not build yet
- `GET /api/performance/students` (admin view, pagination) — post-MVP
- `/api/learning-plans/*` — post-MVP
- `/api/learning-recommendations/*` — post-MVP
- `agent.agent_definitions`, `agent.agent_runs`, `agent.agent_steps` — post-MVP
- Trend calculation algorithms beyond simple running average
- Knowledge base population + semantic search — post-MVP

---

## 3. Database Tables

### 3.1 `performance.skills`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `name` | VARCHAR(100) NOT NULL | e.g., `System Design`, `Communication`, `Data Structures` |
| `domain` | VARCHAR(50) NOT NULL | `TECHNICAL`, `COMMUNICATION`, `BEHAVIORAL`, `DOMAIN_SPECIFIC` |
| `description` | TEXT | |
| `is_active` | BOOLEAN DEFAULT TRUE | |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

**M2 depends on this table.** Seed at least 20 skills before M2 writes question-bank skill tags. Seed in migration 080 (skills seed), or as a standalone seed migration.

### 3.2 `performance.performance_profiles`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `student_id` | UUID FK → `org.students` UNIQUE | One profile per student |
| `overall_score` | DECIMAL(5,2) DEFAULT 0 | Running average of all overall_scores |
| `technical_score` | DECIMAL(5,2) DEFAULT 0 | Running average of all technical_scores |
| `communication_score` | DECIMAL(5,2) DEFAULT 0 | Running average |
| `assessment_count` | INTEGER DEFAULT 0 | Total completed assessments |
| `last_assessment_at` | TIMESTAMPTZ | Updated on each ATTEMPT_COMPLETED |
| `updated_at` | TIMESTAMPTZ DEFAULT now() | |

**How it is created:** M3's event handler fires on `USER_REGISTERED` event (emitted by M1). The handler inserts a row with all scores at 0.

### 3.3 `performance.performance_snapshots`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `profile_id` | UUID FK → `performance.performance_profiles` | |
| `attempt_id` | UUID FK → `performance.assessment_reports` | Read from M2 table |
| `overall_score` | DECIMAL(5,2) NOT NULL | Snapshot of scores at this point in time |
| `technical_score` | DECIMAL(5,2) NOT NULL | |
| `communication_score` | DECIMAL(5,2) NOT NULL | |
| `session_type` | VARCHAR(30) NOT NULL | |
| `is_proctor_flagged` | BOOLEAN NOT NULL | Copied from assessment_reports |
| `recorded_at` | TIMESTAMPTZ DEFAULT now() | |

**Immutable.** One snapshot per completed attempt. Never update a snapshot.

### 3.4 `performance.skill_performances`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `profile_id` | UUID FK → `performance.performance_profiles` | |
| `skill_id` | UUID FK → `performance.skills` | |
| `score` | DECIMAL(5,2) NOT NULL DEFAULT 0 | Running average for this skill |
| `attempt_count` | INTEGER NOT NULL DEFAULT 0 | Times this skill was assessed |
| `last_seen_at` | TIMESTAMPTZ | |
| UNIQUE | `(profile_id, skill_id)` | One row per student per skill |

**How it is updated:** On `ATTEMPT_COMPLETED`, look up which skills were tagged on the questions answered in that session (via `session.question_bank_item_skills`). UPSERT `skill_performances` with updated running average.

### 3.5 `performance.listening_stories`
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `title` | VARCHAR(255) NOT NULL | |
| `content_text` | TEXT NOT NULL | Transcript of the story |
| `audio_storage_path` | VARCHAR(500) | Path via LocalStorageClient |
| `difficulty` | VARCHAR(10) NOT NULL | `EASY`, `MEDIUM`, `ADVANCED` |
| `duration_sec` | INTEGER | |
| `is_active` | BOOLEAN DEFAULT TRUE | |
| `created_by` | UUID FK → `identity.users` | |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

M2 reads this table via `GET /api/listening/:id/replay`. M3 is responsible for loading content.

### 3.6 `knowledge.knowledge_documents` — structure only for MVP
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `title` | VARCHAR(255) NOT NULL | |
| `source_url` | VARCHAR(500) | |
| `domain` | VARCHAR(50) | |
| `content_text` | TEXT | |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

### 3.7 `knowledge.knowledge_chunks` — structure only for MVP
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `document_id` | UUID FK → `knowledge.knowledge_documents` | |
| `chunk_index` | INTEGER NOT NULL | |
| `content_text` | TEXT NOT NULL | |
| `embedding_vector` | TEXT | Reserved for pgvector; NULL in MVP |
| `created_at` | TIMESTAMPTZ DEFAULT now() | |

---

## 4. Database Relationships

```
org.students (M1 owns)
    └── (1:1) performance.performance_profiles [created on USER_REGISTERED event]
                  ├── (1:N) performance.performance_snapshots [created on ATTEMPT_COMPLETED]
                  │             └── references performance.assessment_reports (M2 writes)
                  └── (1:N) performance.skill_performances [UPSERT on ATTEMPT_COMPLETED]
                                └── (N:1) performance.skills

performance.skills (M3 owns)
    ← (N:N) session.question_bank_item_skills (M2 writes, references M3's skills)

performance.listening_stories (M3 owns)
    ← used by M2's listening session endpoint

knowledge.knowledge_documents (M3 owns)
    └── (1:N) knowledge.knowledge_chunks
```

Cross-schema FKs in migration 115 (shared, NOT written by M3):
- `org.students.id` ← `performance.performance_profiles.student_id`
- `performance.assessment_reports.id` ← `performance.performance_snapshots.attempt_id`
- `performance.skills.id` ← `session.question_bank_item_skills.skill_id`

---

## 5. Required Migrations (061–090)

| File | Creates |
|------|---------|
| `061_performance_skills.sql` | `performance.skills` table |
| `062_performance_profiles.sql` | `performance.performance_profiles` table |
| `063_performance_snapshots.sql` | `performance.performance_snapshots` table |
| `064_performance_skill_performances.sql` | `performance.skill_performances` table |
| `065_performance_listening_stories.sql` | `performance.listening_stories` table |
| `066_knowledge_documents.sql` | `knowledge.knowledge_documents` table |
| `067_knowledge_chunks.sql` | `knowledge.knowledge_chunks` table |
| `068_m3_indexes.sql` | Indexes on profile_id, skill_id, student_id |
| `069_m3_updated_at_triggers.sql` | `updated_at` trigger on performance_profiles |
| `080_seed_skills.sql` | Insert at least 20 skills across domains |
| `081_090_placeholder.sql` | Reserved for M3 additions |

> M3 does NOT write migrations 091+ (those belong to M4, shared FKs, and seeds).

---

## 6. Skills Seed Data (Migration 080)

Insert these skills in migration `080_seed_skills.sql` so M2 can use them immediately:

| Domain | Skills |
|--------|--------|
| TECHNICAL | System Design, Data Structures & Algorithms, Object-Oriented Programming, Database Design, REST APIs, Cloud Architecture, Problem Solving |
| COMMUNICATION | Fluency, Clarity, Confidence, Active Listening, Pace Control, Filler Word Avoidance |
| BEHAVIORAL | Teamwork, Leadership, Time Management, Adaptability, Conflict Resolution |
| DOMAIN_SPECIFIC | Data Science, Web Development, Mobile Development |

---

## 7. API Endpoints

### Skills
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/skills` | Yes | Any | List all active skills |
| GET | `/api/skills/:id` | Yes | Any | Get skill detail |
| POST | `/api/skills` | Yes | PROGRAM_ADMIN, FACULTY_MENTOR | Add skill |
| PUT | `/api/skills/:id` | Yes | PROGRAM_ADMIN, FACULTY_MENTOR | Update skill |
| DELETE | `/api/skills/:id` | Yes | PROGRAM_ADMIN | Soft-delete (`is_active = false`) |

### Performance
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/performance/:studentId` | Yes | STUDENT (own), FACULTY_MENTOR (mentee), PROGRAM_ADMIN | Get current profile scores + skill breakdown |
| GET | `/api/performance/:studentId/history` | Yes | STUDENT (own), FACULTY_MENTOR (mentee), PROGRAM_ADMIN | Get snapshots over time (last N assessments) |
| GET | `/api/performance/:studentId/skills` | Yes | STUDENT (own), FACULTY_MENTOR (mentee), PROGRAM_ADMIN | Get per-skill score breakdown |

### Listening Stories
| Method | Path | Auth | Roles | Purpose |
|--------|------|------|-------|---------|
| GET | `/api/listening-stories` | Yes | STUDENT, FACULTY_MENTOR, PROGRAM_ADMIN | List active stories |
| GET | `/api/listening-stories/:id` | Yes | STUDENT, FACULTY_MENTOR | Get story + content |
| POST | `/api/listening-stories` | Yes | FACULTY_MENTOR, TRAINER, PROGRAM_ADMIN | Upload new story (audio optional) |
| PUT | `/api/listening-stories/:id` | Yes | FACULTY_MENTOR, PROGRAM_ADMIN | Update story |
| DELETE | `/api/listening-stories/:id` | Yes | PROGRAM_ADMIN | Soft-delete (`is_active = false`) |

---

## 8. Request / Response Contracts

### GET `/api/performance/:studentId`
```json
{ "data": {
  "studentId": "uuid",
  "overallScore": 74.2,
  "technicalScore": 76.0,
  "communicationScore": 70.1,
  "assessmentCount": 7,
  "lastAssessmentAt": "ISO string",
  "topSkills": [
    { "skillId": "uuid", "skillName": "System Design", "score": 85.0, "attemptCount": 4 }
  ],
  "weakSkills": [
    { "skillId": "uuid", "skillName": "Filler Word Avoidance", "score": 55.0, "attemptCount": 3 }
  ]
}}
```

`topSkills` = top 3 skills by score with attemptCount ≥ 2.
`weakSkills` = bottom 3 skills by score with attemptCount ≥ 2.

### GET `/api/performance/:studentId/history`
```json
{ "data": {
  "studentId": "uuid",
  "snapshots": [
    {
      "snapshotId": "uuid",
      "attemptId": "uuid",
      "overallScore": 74.2,
      "technicalScore": 76.0,
      "communicationScore": 70.1,
      "sessionType": "MOCK_INTERVIEW",
      "isProctorFlagged": false,
      "recordedAt": "ISO string"
    }
  ],
  "trend": "IMPROVING | STABLE | DECLINING"
}}
```

`trend` calculation: compare average of last 3 snapshots vs. average of prior 3 snapshots.
- difference > +5 → `IMPROVING`
- difference < -5 → `DECLINING`
- otherwise → `STABLE`
If fewer than 3 snapshots exist → return `STABLE`.

### GET `/api/skills`
```json
{ "data": {
  "skills": [
    { "id": "uuid", "name": "System Design", "domain": "TECHNICAL", "description": "...", "isActive": true }
  ]
}}
```

### POST `/api/listening-stories`
```
Content-Type: multipart/form-data
fields: title, contentText, difficulty, durationSec (optional)
file: audioFile (optional, max 5MB via M1's upload config)
```

```json
// Response 201
{ "data": { "storyId": "uuid", "title": "string", "audioPath": "/listening/uuid.mp3" } }
```

---

## 9. Event Handlers

### Handler 1: USER_REGISTERED (emitted by M1 on student registration)

```typescript
// src/modules/performance/handlers/user-registered.handler.ts
import { eventBus, Events } from '../../../shared/events/eventBus';

eventBus.on(Events.USER_REGISTERED, async (payload: UserRegisteredPayload) => {
  // Payload: { userId, studentId, organizationId, role }

  if (payload.role !== 'STUDENT') return; // Only create profiles for students

  await db.query(`
    INSERT INTO performance.performance_profiles (id, student_id, overall_score, technical_score, communication_score, assessment_count)
    VALUES (gen_random_uuid(), $1, 0, 0, 0, 0)
    ON CONFLICT (student_id) DO NOTHING
  `, [payload.studentId]);
});
```

**Important:**
- Must be registered in `src/index.ts` (or module init) before any requests are handled.
- ON CONFLICT DO NOTHING is a safety net — idempotent.
- If `payload.studentId` is null (non-student registration) → do nothing.

### Handler 2: ATTEMPT_COMPLETED (emitted by M2 after report generation)

```typescript
// src/modules/performance/handlers/attempt-completed.handler.ts
import { eventBus, Events } from '../../../shared/events/eventBus';

eventBus.on(Events.ATTEMPT_COMPLETED, async (payload: AttemptCompletedPayload) => {
  // Payload: { attemptId, studentId, sessionType, overallScore }

  // Step 1: Get full report from assessment_reports (M2 writes)
  const report = await db.query(
    'SELECT * FROM performance.assessment_reports WHERE attempt_id = $1',
    [payload.attemptId]
  );
  if (!report.rows[0]) return; // Report not ready yet — should not happen but guard it

  // Step 2: Find or get profile
  const profile = await db.query(
    'SELECT * FROM performance.performance_profiles WHERE student_id = $1',
    [payload.studentId]
  );
  if (!profile.rows[0]) return; // Profile missing — USER_REGISTERED handler may have failed

  // Step 3: Upsert snapshot (idempotent — unique on attempt_id)
  await db.query(`
    INSERT INTO performance.performance_snapshots
      (id, profile_id, attempt_id, overall_score, technical_score, communication_score, session_type, is_proctor_flagged)
    VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT DO NOTHING
  `, [profile.rows[0].id, payload.attemptId, report.rows[0].overall_score, ...]);

  // Step 4: Update running average on profile
  await db.query(`
    UPDATE performance.performance_profiles SET
      overall_score = (overall_score * assessment_count + $1) / (assessment_count + 1),
      technical_score = (technical_score * assessment_count + $2) / (assessment_count + 1),
      communication_score = (communication_score * assessment_count + $3) / (assessment_count + 1),
      assessment_count = assessment_count + 1,
      last_assessment_at = now()
    WHERE student_id = $4
  `, [report.rows[0].overall_score, ..., payload.studentId]);

  // Step 5: Update skill_performances for each skill tagged on questions in this session
  // (Join: session.questions -> session.question_bank_item_skills -> skill)
  const skillScores = await db.query(`
    SELECT qbis.skill_id, AVG(re.technical_score) AS avg_score
    FROM session.questions q
    JOIN session.question_bank_item_skills qbis ON qbis.question_bank_item_id = q.bank_item_id
    JOIN evaluation.responses r ON r.question_id = q.id
    JOIN evaluation.response_evaluations re ON re.response_id = r.id
    WHERE q.session_id = (
      SELECT id FROM session.assessment_sessions WHERE attempt_id = $1 LIMIT 1
    )
    GROUP BY qbis.skill_id
  `, [payload.attemptId]);

  for (const row of skillScores.rows) {
    await db.query(`
      INSERT INTO performance.skill_performances (id, profile_id, skill_id, score, attempt_count, last_seen_at)
      VALUES (gen_random_uuid(), $1, $2, $3, 1, now())
      ON CONFLICT (profile_id, skill_id) DO UPDATE SET
        score = (skill_performances.score * skill_performances.attempt_count + $3)
                / (skill_performances.attempt_count + 1),
        attempt_count = skill_performances.attempt_count + 1,
        last_seen_at = now()
    `, [profile.rows[0].id, row.skill_id, row.avg_score]);
  }
});
```

**Important:** Both event handlers are fire-and-forget. M2 emits the event and does NOT wait for this handler. If the handler throws, it should log the error but NOT crash the process.

---

## 10. Dependencies

### What M3 needs from other members

| Source | What | When needed |
|--------|------|-------------|
| M1 | `authenticate`, `requireRole` middlewares | Before ANY protected route |
| M1 | `AppError`, `sendSuccess`, `sendError` from `src/shared/` | Before any controller |
| M1 | `eventBus` from `src/shared/events/` | Before registering event handlers |
| M1 | `USER_REGISTERED` event with `{ userId, studentId, role }` | Before M3's handler can fire |
| M1 | `org.students` table (FK source for performance_profiles) | Before creating M3's tables |
| M2 | `ATTEMPT_COMPLETED` event with payload | Core of M3's profile update flow |
| M2 | `performance.assessment_reports` readable | Handler reads it in Step 1 |
| M2 | `evaluation.response_evaluations` readable | Handler reads for skill scores in Step 5 |
| M2 | `session.questions` + `session.question_bank_item_skills` readable | Handler reads in Step 5 |

### What M3 provides to others

| Consumer | Provides |
|----------|----------|
| M2 | `performance.skills` table — FK target for question bank skill tagging |
| M2 | `performance.listening_stories` — content for listening sessions |
| M4 | `performance.performance_profiles` — readable for placement eligibility assessment |
| Mentor APIs (M1) | `performance.skill_performances` — readable by mentor to see mentee progress |

### What M3 must NOT modify
- `identity.*` and `org.*` — M1 owns
- `assessment.*`, `session.*`, `evaluation.*` — M2 owns
- `performance.assessment_reports` — M2 writes, M3 reads only
- `credit.*`, `placement.*` — M4 owns

---

## 11. Implementation Order

### Phase 1: Foundation and seed data (no event dependencies)
1. - [ ] Confirm M1 has delivered `authenticate`, `requireRole`, `AppError`, `sendSuccess`, `sendError`
2. - [ ] Write migrations 061–069 (all M3 structural tables)
3. - [ ] Write migration 080: seed skills data (20+ skills)
4. - [ ] Run migrations — verify skills table is populated
5. - [ ] Notify M2 that `performance.skills` is ready for question tagging

### Phase 2: Skills CRUD API
6. - [ ] Build `skills` module: list, get, create, update, soft-delete
7. - [ ] Unit tests for skills CRUD

### Phase 3: Listening stories API
8. - [ ] Build `listening-stories` module: list, get, upload, update, soft-delete
9. - [ ] Wire `LocalStorageClient` for audio file upload
10. - [ ] Unit tests for listening stories

### Phase 4: Event handlers (requires eventBus from M1)
11. - [ ] Confirm `eventBus` is exported from `src/shared/events/eventBus`
12. - [ ] Build `user-registered.handler.ts` — creates performance_profiles on student registration
13. - [ ] Register handler in module init
14. - [ ] Test: fire USER_REGISTERED manually → verify performance_profiles row created
15. - [ ] Build `attempt-completed.handler.ts` — full profile update flow
16. - [ ] Register handler in module init
17. - [ ] Test: fire ATTEMPT_COMPLETED with mock attempt data → verify snapshot + profile update

### Phase 5: Performance read APIs
18. - [ ] Build `performance` module: GET profile, GET history, GET skill breakdown
19. - [ ] Implement `trend` calculation in GET history (compare last 3 vs prior 3 snapshots)
20. - [ ] Scope guard: student sees own profile; mentor sees assigned mentees only
21. - [ ] Unit tests for trend calculation
22. - [ ] Integration tests for GET performance/:studentId

### Phase 6: Cross-module integration check
23. - [ ] Full E2E test: Register student → complete assessment → check performance profile updated
24. - [ ] Verify M2 can read `performance.skills` for question-bank skill tagging
25. - [ ] Verify M2 can read `performance.listening_stories` for listening sessions

---

## 12. Testing Checklist

### Unit tests
- [ ] USER_REGISTERED with role = STUDENT → creates profile
- [ ] USER_REGISTERED with role = FACULTY_MENTOR → does NOT create profile
- [ ] USER_REGISTERED fires twice for same student → ON CONFLICT DO NOTHING (no error, no duplicate)
- [ ] ATTEMPT_COMPLETED with no prior assessments → profile: `assessment_count = 1`, `overall_score = attempt_score`
- [ ] ATTEMPT_COMPLETED with 3 prior assessments → running average is correct
- [ ] Trend = IMPROVING: last 3 avg > prior 3 avg by > 5 points
- [ ] Trend = DECLINING: last 3 avg < prior 3 avg by > 5 points
- [ ] Trend = STABLE: fewer than 3 snapshots
- [ ] Trend = STABLE: difference ≤ 5 points
- [ ] Skill score UPSERT: first occurrence → `score = attempt_score, attempt_count = 1`
- [ ] Skill score UPSERT: second occurrence → running average applied
- [ ] Listening story replay: `GET /api/listening/:id/replay` returns content_text and audio_storage_path
- [ ] Listening story soft-delete: is_active = false; not returned in list

### Integration tests (require database)
- [ ] GET /api/performance/:studentId returns 200 with correct profile
- [ ] GET /api/performance/:studentId/history returns snapshots in descending order
- [ ] GET /api/performance/:studentId/skills returns top/weak skills
- [ ] Non-student role cannot GET /api/performance for a student they are not assigned to
- [ ] Full flow: register → attempt → profile has 1 snapshot
- [ ] POST /api/listening-stories uploads file and returns storagePath

### Regression: after wiring event handlers
- [ ] M1's auth flow still works (registering handlers does not break existing routes)
- [ ] M2's POST /sessions/:id/complete still returns 200 after M3 handler fires

---

## 13. Integration Checklist

Before declaring Module 3 complete:

- [ ] `performance.skills` seeded and M2 can create question-bank items with skill tags
- [ ] `USER_REGISTERED` event from M1 successfully creates `performance.performance_profiles` row
- [ ] `ATTEMPT_COMPLETED` event from M2 successfully creates snapshot + updates profile
- [ ] M3 event handler does NOT crash Node process if M2's data is not yet written (guard added)
- [ ] `GET /api/performance/:studentId` returns correct running averages after 3 assessments
- [ ] M2 can read `performance.listening_stories` for its listening session endpoint
- [ ] STUDENT can only GET their own performance profile (scope guard)
- [ ] FACULTY_MENTOR can GET performance for assigned mentees only
- [ ] All response envelopes: `{ "data": {...} }` (no bare objects)
- [ ] All errors: `{ "error": { "code": "...", "message": "..." } }` (AppError via sendError)
- [ ] No raw SQL visible in error messages

---

## 14. Needs Confirmation

| # | Item | Default assumption |
|---|------|--------------------|
| NC-01 | `USER_REGISTERED` payload fields — does M1 include `studentId` (from `org.students`) or only `userId` (from `identity.users`)? | Assume both `userId` and `studentId` are in payload; if only `userId` included, M3 must do a JOIN to get student_id |
| NC-02 | What happens to performance profile if a student is deleted? | `[NEEDS CONFIRMATION]` — CASCADE vs. SET NULL on FK |
| NC-03 | `learning_plans` and `learning_recommendations` tables — same schema as `performance` or separate `learning` schema? | `[NEEDS CONFIRMATION]` — architecture docs show no separate learning schema; defaulting to `performance` schema |
| NC-04 | Should ATTEMPT_COMPLETED handler skip updating skills if session has `is_proctor_flagged = true`? | `[NEEDS CONFIRMATION]` — assumption: flagged sessions still update scores |
| NC-05 | Knowledge schema (`knowledge_documents`, `knowledge_chunks`) — is pgvector available in MVP database? | Assumption: pgvector NOT available in MVP; `embedding_vector` column stored as TEXT (NULL) |
| NC-06 | Trend calculation window — use last 6 snapshots (3 vs 3), or different window? | Default: last 6 snapshots, 3 vs 3 |
| NC-07 | What is the `topSkills` / `weakSkills` minimum attempt count threshold? | Default: 2+ attempts before a skill appears in top/weak list |

---

## 15. Post-MVP (Do Not Build Now)

| Feature | Reason deferred |
|---------|----------------|
| `/api/learning-plans/*` | Depends on skill analysis + AI recommendation engine |
| `/api/learning-recommendations/*` | Depends on knowledge base population |
| `agent.agent_definitions`, `agent.agent_runs`, `agent.agent_steps` | LangGraph infrastructure not available |
| Knowledge base semantic search | Requires pgvector + embedding pipeline |
| Knowledge base population automation | Requires web scraping or manual curation pipeline |
| `GET /api/performance/students` (admin list) | Low-priority; pagination complexity |
| Adaptive learning path generation | Requires M4 credit system integration + ML model |

---

## 16. Quick Reference

```
Schemas owned: performance (6 tables), knowledge (2 tables, structure only)
Migration range: 061–090 + seed at 080
Events consumed: USER_REGISTERED (from M1), ATTEMPT_COMPLETED (from M2)
Events emitted: none
Critical deliverable: skills seed data (unblocks M2 question tagging)
Critical dependency: M1 must emit USER_REGISTERED before profiles can be created
Biggest risk: ATTEMPT_COMPLETED handler queries across 3 schemas (M2's data) — test with realistic data
```
