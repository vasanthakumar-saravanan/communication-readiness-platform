# Edge Cases — Communication Readiness Platform

> Generated: 2026-09-25
> Audit scope: All modules, with special focus on M2 cross-module interactions.
> Source of truth: static code analysis, migration inspection, and documentation review.
> No live database was available — all statuses reflect static analysis only.

---

## Module 1 — Auth, Students, Organization

### EC-M1-001: Student logs out mid-assessment
- **Trigger:** Student calls `POST /api/auth/logout` while an assessment attempt is ACTIVE and a session is ACTIVE.
- **Current behavior:** M1 increments `identity.users.token_version`. The JWT is immediately invalidated. The attempt remains `IN_PROGRESS` and the session remains `ACTIVE` in the database indefinitely. There is no cleanup hook, no session termination, and no event emitted to M2.
- **Expected behavior:** Logout should not forcibly terminate an assessment (the student can re-authenticate and resume). However, if a session expiry policy exists, it should be evaluated at next reconnect. The attempt and session states are intentionally preserved to allow resume.
- **Impact on other modules:** M2 attempt and session rows remain open. M4 credits already consumed. No cleanup needed unless a configurable session timeout is added.
- **Required API/table/service:** `session.assessment_sessions.expires_at` — currently exists in migration but never populated. A timeout policy would populate this at session creation. Not currently enforced.
- **Implementation status:** Logout itself works correctly. Session/attempt cleanup on logout is intentionally absent (resume is the expected flow). `expires_at` enforcement: Not currently implemented.

---

### EC-M1-002: JWT expires mid-assessment
- **Trigger:** Student's JWT (`JWT_EXPIRES_IN=7d`) expires while an assessment session is still ACTIVE.
- **Current behavior:** The next M2 API call returns 401 UNAUTHORIZED. The attempt remains `IN_PROGRESS` and the session remains `ACTIVE`.
- **Expected behavior:** The student should be able to re-authenticate (login) and resume. The session is preserved server-side. On reconnect, the student calls `POST /api/sessions/start` with the same `attemptId` — the existing ACTIVE session is found and returned.
- **Impact on other modules:** Same as EC-M1-001. No data loss.
- **Required API/table/service:** Resume path via `POST /api/sessions/start` (already implemented — finds existing ACTIVE session and returns it). Works correctly for this case.
- **Implementation status:** Resume path for ACTIVE session is implemented and correct. JWT expiry is handled at middleware level correctly.

---

### EC-M1-003: Student account deactivated mid-attempt
- **Trigger:** An admin sets `identity.users.is_active = false` for a student while their assessment is in progress.
- **Current behavior:** M1's `authenticate` middleware does not check `is_active` — it only checks `token_version`. The student's existing JWT remains valid until logout or token_version increment.
- **Expected behavior:** A deactivated account should be rejected on all subsequent requests, even with a valid JWT.
- **Impact on other modules:** M2 attempt and session remain open with a deactivated student. M4 credits remain consumed.
- **Required API/table/service:** `authenticate.ts` should add `WHERE id = $1 AND is_active = true` to the `token_version` lookup query.
- **Implementation status:** Not currently implemented in M1's authenticate middleware. Architecture decision for M1 to fix.

---

### EC-M1-004: USER_REGISTERED event lost (process crash)
- **Trigger:** Student registers successfully (DB write completes), but the Node.js process crashes between the DB INSERT and the `eventBus.emit(USER_REGISTERED)` call.
- **Current behavior:** The student account exists in `identity.users` and `org.students`, but M3's performance profile and M4's credit account are never created. The student cannot start an assessment (M4 CreditService.consume() will fail with "Credit account not found").
- **Expected behavior:** Event handlers must be idempotent. A re-registration or admin trigger should be able to re-create missing downstream records.
- **Impact on other modules:** M3 performance profile missing — M3 performance update on ATTEMPT_COMPLETED will fail. M4 credit account missing — M2's `POST /api/attempts/start` will 402 or throw once real CreditService is wired.
- **Required API/table/service:** Admin endpoint to manually trigger credit account and performance profile creation. Or: outbox pattern (BACKEND_IMPLEMENTATION_PLAN.md Section 3.8 documents this as a post-MVP mitigation).
- **Implementation status:** Known limitation of in-process EventEmitter. Not mitigated for MVP. Outbox pattern deferred to post-MVP.

---

### EC-M1-005: Non-STUDENT role calls STUDENT-only M2 endpoints
- **Trigger:** A `FACULTY_MENTOR` or `PROGRAM_ADMIN` calls `POST /api/attempts/start`, `POST /api/sessions/start`, or `POST /api/responses/submit`.
- **Current behavior:** `requireRole('STUDENT')` middleware is applied to all three endpoints. Non-STUDENT roles receive `403 FORBIDDEN` immediately.
- **Expected behavior:** Correct — non-students should not be able to create attempts or submit responses.
- **Impact on other modules:** None.
- **Required API/table/service:** None — already handled correctly.
- **Implementation status:** Implemented correctly.

---

## Module 2 — Assessments, Sessions, AI Evaluation

### EC-M2-001: Student JWT expires with ACTIVE session — reconnect flow
- **Trigger:** Student's JWT expires while session is ACTIVE. Student logs in again and tries to resume.
- **Current behavior:** Student calls `POST /api/sessions/start` with the original `attemptId`. Code finds existing ACTIVE session and returns it with the current question. Resume works correctly for ACTIVE sessions.
- **Expected behavior:** Correct behavior. Session preserved server-side.
- **Implementation status:** IMPLEMENTED correctly.
- **Bug ID:** None.
- **Required fix/API/table:** None.
- **Dependencies:** M1 (authenticate middleware).

---

### EC-M2-002: Student re-authenticates with PAUSED session
- **Trigger:** Student's session was somehow PAUSED (see EC-M2-039), then student logs out and back in.
- **Current behavior:** `POST /api/sessions/start` finds PAUSED session, updates to ACTIVE, returns current question. Resume works.
- **Expected behavior:** Correct.
- **Implementation status:** IMPLEMENTED (PAUSED → ACTIVE resume path exists).
- **Bug ID:** None.
- **Required fix/API/table:** None. However, no API endpoint currently transitions a session to PAUSED — see EC-M2-039.
- **Dependencies:** M1.

---

### EC-M2-003: Two devices — same student on two browsers simultaneously
- **Trigger:** Student starts session on Device A, then opens a second browser on Device B with the same JWT.
- **Current behavior:** Both devices share the same server-side session (attempt_id UNIQUE). `GET /api/sessions/:id` on Device B returns the same state as Device A. Both can call `POST /api/responses/submit` — the second submission for the same question will hit the `UNIQUE (attempt_id, question_id)` constraint and return a 500 (unhandled DB error). See B12.
- **Expected behavior:** Second device should either be rejected or see a read-only view. Concurrent submissions should return 409 not 500.
- **Implementation status:** BUG (B12 — duplicate attempt+question constraint not gracefully handled).
- **Bug ID:** B12.
- **Required fix/API/table:** Catch `23505` PostgreSQL unique violation on `uq_responses_attempt_question` and return 409 DUPLICATE_RESPONSE.
- **Dependencies:** None.

---

### EC-M2-004: Browser crashes before response is saved
- **Trigger:** Student submits a response but the browser crashes before the HTTP request reaches the server (or before the server saves it).
- **Current behavior:** No data written. On reconnect, student can resubmit the same question. `GET /api/sessions/:id` shows the last `current_sequence_no`, so the current question is still available.
- **Expected behavior:** Correct — no data loss risk. Student resubmits.
- **Implementation status:** IMPLEMENTED correctly (stateless HTTP; session preserves sequence_no server-side).
- **Bug ID:** None.
- **Required fix/API/table:** None.
- **Dependencies:** None.

---

### EC-M2-005: Browser crashes after response saved but before AI evaluation completes
- **Trigger:** `evaluation.responses` row is inserted but the `POST /ai/evaluate-turn` call is in-flight when the browser crashes. The axios call continues server-side.
- **Current behavior:** `ai_runs` was written as PENDING. If the AI call completes, `response_evaluations` is written. The HTTP response to the crashed client is lost. On reconnect with the same `idempotencyKey`, the duplicate check finds the response and returns the existing evaluation. On reconnect without `idempotencyKey`, a new random UUID is generated → attempts to insert a second response for the same `(attempt_id, question_id)` → UNIQUE constraint violation → 500.
- **Expected behavior:** If idempotencyKey is preserved client-side, retry is safe. Frontend must persist idempotencyKey locally (e.g., localStorage) across crashes.
- **Implementation status:** PARTIAL. Server-side idempotency by key works. DB-level deduplication by (attempt, question) prevents data corruption but returns 500 instead of 409.
- **Bug ID:** B12 (for the 500 case).
- **Required fix/API/table:** Catch unique constraint violation on `uq_responses_attempt_question` → return 409 DUPLICATE_RESPONSE. Frontend should persist idempotencyKey.
- **Dependencies:** None.

---

### EC-M2-006: Browser crashes after evaluation but before next question loaded
- **Trigger:** `response_evaluations` written successfully, but client crashes before receiving `nextQuestion` in the response.
- **Current behavior:** On reconnect, `GET /api/sessions/:id` returns the current `current_sequence_no`. If `session.current_sequence_no` was already incremented (it is, when `nextQuestion` is not null), the next question row exists in `session.questions` and the student can continue. If `current_sequence_no` was NOT incremented (no nextQuestion was found), the student is on the same question and can resubmit — idempotency key handles deduplication.
- **Expected behavior:** Safe recovery. No data loss.
- **Implementation status:** IMPLEMENTED correctly.
- **Bug ID:** None.
- **Required fix/API/table:** None.
- **Dependencies:** None.

---

### EC-M2-007: Network disconnect during FastAPI call (30s timeout)
- **Trigger:** FastAPI hangs or network breaks during `POST /ai/evaluate-turn`. Axios timeout fires after 30 seconds.
- **Current behavior:** axios throws a timeout/network error → caught in `evaluateResponse()` → returns `{ unreachable: true }` → `ai_runs` status set to FAILED → HTTP 503 returned to client with `responseId` in body. Response row is saved.
- **Expected behavior:** Correct graceful degradation. Student knows response was saved.
- **Implementation status:** IMPLEMENTED correctly.
- **Bug ID:** None.
- **Required fix/API/table:** None. Post-MVP: retry with exponential backoff.
- **Dependencies:** FastAPI service.

---

### EC-M2-008: Duplicate response submission — same idempotency key
- **Trigger:** Client retries `POST /api/responses/submit` with the same `idempotencyKey`.
- **Current behavior:** Duplicate check finds existing response row → returns existing evaluation (or null if eval pending) with `{ duplicate: true }`.
- **Expected behavior:** Correct idempotent handling.
- **Implementation status:** IMPLEMENTED correctly.
- **Bug ID:** None.
- **Required fix/API/table:** None.
- **Dependencies:** None.

---

### EC-M2-009: Duplicate response submission — different idempotency key, same attempt+question
- **Trigger:** Client retries without preserving the idempotencyKey (generates a new UUID). Same `attemptId` + `questionId`.
- **Current behavior:** Idempotency check passes (different key). `INSERT INTO evaluation.responses` hits `UNIQUE (attempt_id, question_id)` constraint → PostgreSQL raises error 23505 → `sendError(res, err)` treats it as a 500 Internal Server Error.
- **Expected behavior:** Should return 409 DUPLICATE_RESPONSE.
- **Implementation status:** BUG (B12).
- **Bug ID:** B12.
- **Required fix/API/table:** Catch `err.code === '23505'` from pg and throw `new AppError(409, 'Response already submitted for this question', 'DUPLICATE_RESPONSE')`.
- **Dependencies:** None.

---

### EC-M2-010: Student reconnects after crash — session resume
- **Trigger:** Student's browser crashes. Student opens new browser tab, logs in, and needs to resume.
- **Current behavior:** Student calls `POST /api/sessions/start` with the original `attemptId`. If session is ACTIVE → returns current question (correct resume). If session is PAUSED → transitions to ACTIVE (correct resume). If session is COMPLETED or TERMINATED → transitions to ACTIVE (CRITICAL BUG B3).
- **Expected behavior:** Only ACTIVE and PAUSED sessions should be resumable. COMPLETED and TERMINATED sessions must return an error.
- **Implementation status:** BUG (B3) — COMPLETED/TERMINATED sessions incorrectly re-activate.
- **Bug ID:** B3.
- **Required fix/API/table:** Add guard: `if (['COMPLETED', 'TERMINATED'].includes(existing[0].state)) throw new AppError(409, 'Session already ended', 'SESSION_ENDED')`.
- **Dependencies:** None.

---

### EC-M2-011: Student abandons via PUT /attempts/:id/abandon
- **Trigger:** Student calls `PUT /api/attempts/:id/abandon` on an IN_PROGRESS attempt.
- **Current behavior:** Attempt status set to ABANDONED. The associated `session.assessment_sessions` row remains ACTIVE. No ATTEMPT_COMPLETED event emitted. No credit refund. No reason stored.
- **Expected behavior:** Corresponding session should be set to TERMINATED. An optional reason should be storable. Credit refund policy should be defined (currently not defined — architecture decision for M4).
- **Implementation status:** BUG (B6) — session not terminated.
- **Bug ID:** B6.
- **Required fix/API/table:** Add `UPDATE session.assessment_sessions SET state = 'TERMINATED', updated_at = now() WHERE attempt_id = $1` inside the abandon handler. Add optional `reason` field to request body and store in attempt record (requires schema change — `reason VARCHAR` column on `assessment_attempts`).
- **Dependencies:** M4 (credit refund policy — architecture decision required).

---

### EC-M2-012: Student closes browser without explicitly abandoning
- **Trigger:** Student simply closes the browser tab during an active assessment. No API is called.
- **Current behavior:** Session remains ACTIVE indefinitely. Attempt remains IN_PROGRESS indefinitely. `expires_at` is never set so there is no server-side timeout. The session occupies a slot that blocks future attempts for the same assessment (due to the `ATTEMPT_IN_PROGRESS` guard).
- **Expected behavior:** After a configurable timeout (e.g., 30 minutes of inactivity), the session should be automatically marked EXPIRED/TERMINATED and the attempt ABANDONED. Currently no such mechanism exists.
- **Implementation status:** MISSING — `expires_at` exists in migration but is never set or checked.
- **Bug ID:** B7.
- **Required fix/API/table:** Either: (a) a background job/cron that terminates sessions where `last_activity_at < NOW() - interval` and state = 'ACTIVE', or (b) set `expires_at` at session creation and check it on every session endpoint. Neither is currently implemented.
- **Dependencies:** None (M2-only concern).

---

### EC-M2-013: Emergency abandonment — no reschedule API
- **Trigger:** Student has a family emergency and must stop the assessment immediately. They want to reschedule.
- **Current behavior:** Student can call `PUT /api/attempts/:id/abandon` to mark attempt ABANDONED. There is no reschedule API. No cooldown period. No future slot booking. Credits are not refunded.
- **Expected behavior:** A reschedule flow would: (1) abandon current attempt, (2) optionally refund credits, (3) allow creating a new attempt later. Currently only step 1 is partially implemented.
- **Implementation status:** MISSING — no reschedule API.
- **Bug ID:** None (missing feature, not a bug).
- **Required fix/API/table:** `POST /api/attempts/:id/reschedule` — architecture decision required for credit refund policy. Cleanest design: abandon current attempt, create a credit refund transaction (M4), create new attempt on next session. The old attempt should be marked ABANDONED with a reason.
- **Dependencies:** M4 (credit refund), M1 (calendar/slot booking — not in scope for MVP).

---

### EC-M2-014: TERMINATED session leaves attempt IN_PROGRESS
- **Trigger:** Student exceeds `MAX_TAB_SWITCH_LIMIT + 1` tab switches. Session state transitions to TERMINATED in `POST /api/sessions/:id/proctor-event`.
- **Current behavior:** Session state = TERMINATED. Attempt status remains IN_PROGRESS. Student is locked out of the session (cannot submit responses — session not ACTIVE) but the attempt is never closed. No ATTEMPT_COMPLETED event emitted.
- **Expected behavior:** When a session is TERMINATED due to proctoring, the attempt should also be transitioned (either to ABANDONED or a new TERMINATED status). An ATTEMPT_COMPLETED or ATTEMPT_ABANDONED event should be emitted.
- **Implementation status:** BUG (B5).
- **Bug ID:** B5.
- **Required fix/API/table:** After `UPDATE session.assessment_sessions SET state = 'TERMINATED'`, add `UPDATE assessment.assessment_attempts SET status = 'ABANDONED', completed_at = now() WHERE id = $attemptId`. Optionally emit a new event or log the reason.
- **Dependencies:** None (M2-only fix).

---

### EC-M2-015: Duplicate proctor events
- **Trigger:** The browser sends the same proctoring event twice (network retry, frontend bug).
- **Current behavior:** Each `POST /api/sessions/:id/proctor-event` call independently increments `tab_switch_count` in `state_data`. Two identical events = two increments. The counter can be inflated beyond what actually occurred.
- **Expected behavior:** Proctor events should be deduplicated using the `timestamp` field provided by the client, or by enforcing server-side event deduplication (e.g., a short-TTL Redis key or a deduplicated event log).
- **Implementation status:** MISSING — no deduplication.
- **Bug ID:** None (architectural gap, not a code bug per se).
- **Required fix/API/table:** Add client-side idempotency key to proctor event requests. Or validate that the `timestamp` has not been seen before within a short window. Not critical for MVP but important for fairness.
- **Dependencies:** None.

---

### EC-M2-016: Session terminated but ATTEMPT_COMPLETED event not emitted
- **Trigger:** Session is TERMINATED via proctoring (EC-M2-014). No report is generated (student didn't complete the assessment).
- **Current behavior:** No ATTEMPT_COMPLETED event emitted. M3 performance profile not updated. M4 credit reward not granted (correct — incomplete assessment should not earn credits).
- **Expected behavior:** Correct that no reward is earned. But M3 may want an ATTEMPT_ABANDONED event for tracking purposes. Currently no such event is defined.
- **Implementation status:** MISSING — no ATTEMPT_ABANDONED event defined.
- **Bug ID:** B5 (related).
- **Required fix/API/table:** Define `ATTEMPT_ABANDONED` event in `events.ts` if M3/M4 need to track abandoned attempts.
- **Dependencies:** M3, M4 (define whether they care about abandoned attempts).

---

### EC-M2-017: FastAPI returns scores outside 0–10 range
- **Trigger:** FastAPI LLM returns a malformed score, e.g., `technical_score: 12` (out of 0–10 range).
- **Current behavior:** `ai-client.ts` multiplies by 10: `12 * 10 = 120`. Score of 120 stored in `response_evaluations`. Report computation can produce overall scores > 100.
- **Expected behavior:** Scores should be clamped to 0–100 after normalization.
- **Implementation status:** MISSING — no clamping.
- **Bug ID:** None (unvalidated input from external service).
- **Required fix/API/table:** Add `Math.min(100, Math.max(0, score))` clamping in `ai-client.ts` after normalization. One line fix.
- **Dependencies:** FastAPI (Pydantic validates 0–10 range on FastAPI side, but network/parsing issues could bypass it).

---

### EC-M2-018: Duplicate AI evaluation attempt
- **Trigger:** `POST /api/responses/submit` is called twice with the same idempotency key — first call saves response and creates evaluation; second call hits duplicate check and returns early. But if the AI write partially succeeded on the first call (ai_run written, but evaluation INSERT failed), a retry might attempt to insert a second evaluation.
- **Current behavior:** `response_evaluations` has `UNIQUE (response_id)` constraint. A second INSERT for the same `response_id` would fail with a PostgreSQL 23505 error. The error is unhandled — returns 500.
- **Expected behavior:** Should return the existing evaluation or handle the conflict gracefully.
- **Implementation status:** BUG (partial — the unique constraint protects data integrity but error handling is missing).
- **Bug ID:** Related to B12.
- **Required fix/API/table:** Catch `23505` on `response_evaluations` INSERT and return the existing evaluation row via a SELECT.
- **Dependencies:** None.

---

### EC-M2-019: AI evaluation succeeds but response_evaluations INSERT fails
- **Trigger:** `ai_runs` status updated to COMPLETED, but the subsequent `INSERT INTO evaluation.response_evaluations` fails (transient DB error, connection timeout).
- **Current behavior:** `ai_runs` shows COMPLETED but no `response_evaluations` row exists. When `POST /api/sessions/:id/complete` aggregates evaluations, this response contributes 0 to all scores. The report is artificially deflated.
- **Expected behavior:** The whole response submit handler (`INSERT response`, `INSERT ai_run`, `UPDATE ai_run`, `INSERT response_evaluations`) should be wrapped in a single database transaction. Currently it is not.
- **Implementation status:** MISSING — no transaction wrapping in `POST /api/responses/submit`.
- **Bug ID:** None (architectural gap).
- **Required fix/API/table:** Wrap the entire `POST /api/responses/submit` handler in a `BEGIN/COMMIT` transaction. Use a pooled client.
- **Dependencies:** None.

---

### EC-M2-020: POST /api/sessions/:id/complete with 0 responses
- **Trigger:** Student starts a session, then calls complete without submitting any responses (e.g., immediately closes the session).
- **Current behavior:** `evals.length === 0` → throws `AppError(422, 'No responses submitted', 'NO_RESPONSES')`. Session remains ACTIVE. Attempt remains IN_PROGRESS.
- **Expected behavior:** Either (a) allow completion with a 0 score if the student chose to submit nothing, or (b) allow an explicit "give up" flow that terminates the session and marks the attempt ABANDONED.
- **Implementation status:** PARTIAL — error is thrown, but no cleanup path exists for the student to gracefully exit.
- **Bug ID:** None (intentional guard, but missing cleanup path).
- **Required fix/API/table:** Add the abandon path from the complete endpoint, or document that `PUT /api/attempts/:id/abandon` should be called instead.
- **Dependencies:** None.

---

### EC-M2-021: COMPLETED or TERMINATED session re-activated via /sessions/start (CRITICAL)
- **Trigger:** Student calls `POST /api/sessions/start` with an `attemptId` whose session is already COMPLETED or TERMINATED.
- **Current behavior:** Code only checks `if (existing[0].state === 'ACTIVE') → 409`. Any other state (including COMPLETED and TERMINATED) → `UPDATE SET state = 'ACTIVE'`. The session is incorrectly reactivated.
- **Expected behavior:** If state is COMPLETED or TERMINATED, return 409 SESSION_ENDED. Only PAUSED sessions should be resumable.
- **Implementation status:** CRITICAL BUG (B3).
- **Bug ID:** B3.
- **Required fix/API/table:** Add `if (['COMPLETED', 'TERMINATED'].includes(existing[0].state)) throw new AppError(409, 'Session has already ended', 'SESSION_ENDED')` before the resume UPDATE.
- **Dependencies:** None.

---

### EC-M2-022: PAUSED state is unreachable — no endpoint sets it
- **Trigger:** The session state machine defines PAUSED as a valid state (in migration CHECK constraint). No endpoint transitions a session to PAUSED.
- **Current behavior:** PAUSED state exists in DB schema but is dead code. No code path writes `state = 'PAUSED'`.
- **Expected behavior:** Either implement a `POST /api/sessions/:id/pause` endpoint, or remove PAUSED from the state machine if not intended for MVP.
- **Implementation status:** MISSING — PAUSED transition has no entry point.
- **Bug ID:** None (feature gap).
- **Required fix/API/table:** Either add `POST /api/sessions/:id/pause` endpoint, or document PAUSED as a reserved state for post-MVP.
- **Dependencies:** None.

---

### EC-M2-023: Credits consumed but attempt INSERT fails (atomicity gap)
- **Trigger:** `CreditService.consume()` succeeds and deducts 1 credit. The subsequent `INSERT INTO assessment.assessment_attempts` fails (FK violation, DB error, connection loss).
- **Current behavior:** Credits are consumed. No attempt record is created. No rollback or compensation. The student has lost a credit with nothing to show.
- **Expected behavior:** Credit deduction and attempt creation should be atomic. If attempt creation fails, credits should be refunded.
- **Implementation status:** BUG (B4) — no transaction atomicity.
- **Bug ID:** B4.
- **Required fix/API/table:** Option A — wrap the entire handler in a BEGIN/COMMIT, calling `CreditService.consume()` with the same DB client (requires M4 to accept a client parameter). Option B — if attempt INSERT fails, call `CreditService.refund()` (M4 must implement this). Option B is simpler to implement without redesigning CreditService signature.
- **Dependencies:** M4 (CreditService refund or transaction-aware consume).

---

### EC-M2-024: Race condition — two concurrent /attempts/start for same student+assessment
- **Trigger:** Student double-clicks "Start Assessment" and two concurrent HTTP requests reach the server within milliseconds of each other.
- **Current behavior:** Both requests pass the `ATTEMPT_IN_PROGRESS` check (race window). Both call `CreditService.consume()` — with stub, both succeed (double credit deduction with real M4). Both insert a new attempt row. There is no UNIQUE constraint on `(student_id, assessment_id, status='IN_PROGRESS')` in the migration.
- **Expected behavior:** Only one attempt should be created. Credits should be deducted only once.
- **Implementation status:** BUG (B4-related) — no lock/constraint prevents race condition.
- **Bug ID:** B4 (race condition variant).
- **Required fix/API/table:** Add `INSERT INTO assessment.assessment_attempts ... ON CONFLICT DO NOTHING` or a `SELECT FOR UPDATE` lock before the check. Alternatively, add a partial unique index: `CREATE UNIQUE INDEX uq_active_attempt ON assessment.assessment_attempts (student_id, assessment_id) WHERE status = 'IN_PROGRESS'`.
- **Dependencies:** M4 (CreditService must also be re-entrant-safe with row-level locks).

---

### EC-M2-025: Report generated with partial AI evaluations
- **Trigger:** Some questions were answered but FastAPI was unreachable for 1 or more of them (ai_runs status = FAILED, no response_evaluations row).
- **Current behavior:** `POST /api/sessions/:id/complete` aggregates all `response_evaluations` for the attempt. Questions with no evaluation contribute 0 to the averages. The report is artificially deflated.
- **Expected behavior:** Either: (a) exclude unscored questions from averages (divide only by scored count), or (b) flag the report as "partial" and show which questions lack scores, or (c) retry AI evaluation for PENDING ai_runs at complete time.
- **Implementation status:** PARTIAL — scores are averaged including 0s from unevaluated responses. No flagging.
- **Bug ID:** None (behavioral gap).
- **Required fix/API/table:** Change aggregation to count only questions with non-null `technical_score`. Add `component_scores.unscored_questions` field to the report.
- **Dependencies:** FastAPI (availability).

---

### EC-M2-026: Report called twice (idempotency)
- **Trigger:** `POST /api/sessions/:id/complete` called twice (client retry, double-click).
- **Current behavior:** First call: inserts report, marks session COMPLETED, marks attempt COMPLETED. Second call: session check `state !== 'ACTIVE'` → throws 409 `INVALID_STATUS`. Report and attempt are correctly not duplicated.
- **Expected behavior:** Correct — idempotency is handled.
- **Implementation status:** IMPLEMENTED correctly.
- **Bug ID:** None.
- **Required fix/API/table:** None.
- **Dependencies:** None.

---

### EC-M2-027: GET /api/attempts/:id — FACULTY_MENTOR can access any student's attempt
- **Trigger:** A `FACULTY_MENTOR` calls `GET /api/attempts/:id` for a student that is NOT assigned to them.
- **Current behavior:** No assignment check for FACULTY_MENTOR role. Any authenticated FACULTY_MENTOR can read any student's attempt details.
- **Expected behavior:** FACULTY_MENTOR should only see attempts for their assigned students (same as reports and responses).
- **Implementation status:** BUG (B11).
- **Bug ID:** B11.
- **Required fix/API/table:** Add FACULTY_MENTOR check in `GET /api/attempts/:id` using the same pattern as `reports.routes.ts`: `SELECT FROM org.student_mentor_assignments WHERE student_id = $1 AND mentor_id = $2 AND is_active = true`.
- **Dependencies:** M1 (`org.student_mentor_assignments`).

---

### EC-M2-028: POST /api/responses/submit request body mismatch with API docs
- **Trigger:** Frontend team reads `API_REFERENCE.md` and sends `{ sessionId, transcript, durationSec, mode }`. But the actual implementation expects `{ attemptId, questionId, transcript, inputType, idempotencyKey }`.
- **Current behavior:** Request validation fails (Zod `attemptId: z.string().uuid()` required, not present) → 422 VALIDATION_ERROR.
- **Expected behavior:** Either the docs or the implementation must be aligned. The implementation's schema is more complete and correct (it requires `questionId` explicitly). The docs should be updated.
- **Implementation status:** INFORMATIONAL (B9) — implementation is internally consistent; docs are outdated.
- **Bug ID:** B9.
- **Required fix/API/table:** Update `API_REFERENCE.md` and `MODULE_2_IMPLEMENTATION_CHECKLIST.md` to reflect actual request body: `{ attemptId, questionId, transcript, inputType?, idempotencyKey?, durationSec? }`.
- **Dependencies:** Frontend team must be notified.

---

### EC-M2-029: ATTEMPT_COMPLETED event payload missing fields
- **Trigger:** `POST /api/sessions/:id/complete` emits ATTEMPT_COMPLETED.
- **Current behavior:** Payload emitted: `{ attemptId, studentId, assessmentType, overallScore }`. BACKEND_IMPLEMENTATION_PLAN.md specifies: `{ attemptId, studentId, assessmentId, overallScore, technicalScore, communicationScore, reportId }`.
- **Expected behavior:** M3 and M4 handlers may need `assessmentId`, `technicalScore`, `communicationScore`, and `reportId` to fully process the event.
- **Implementation status:** BUG (B10) — payload incomplete vs documented spec.
- **Bug ID:** B10.
- **Required fix/API/table:** Update `events.ts` `AttemptCompletedPayload` interface and the `sessions.routes.ts` emit call to include all required fields. The data is available in the handler context (`session.assessment_id`, `techAvg`, `commAvg`, `reportRows[0]?.id`).
- **Dependencies:** M3, M4 (must agree on final payload shape before implementing their handlers).

---

### EC-M2-030: assessment_reports in performance schema (conflicts with plan)
- **Trigger:** M3 implements ATTEMPT_COMPLETED handler and tries to read from `assessment.assessment_reports` per the documented plan resolution.
- **Current behavior:** M2 writes to `performance.assessment_reports` (migration 041 + all M2 code). The BACKEND_IMPLEMENTATION_PLAN.md ISSUE-01 says reports should be in `assessment` schema.
- **Expected behavior:** The schema location must be agreed and communicated to M3. Currently M2's implementation is internally consistent but contradicts the plan.
- **Implementation status:** INFORMATIONAL (B8) — code and migration are consistent. Plan document is contradicted.
- **Bug ID:** B8.
- **Required fix/API/table:** Update `BACKEND_IMPLEMENTATION_PLAN.md` Section 5.2 table and Section 1.1 ISSUE-01 resolution to say `performance.assessment_reports`. Inform M3 to query `performance.assessment_reports`.
- **Dependencies:** M3 (must know correct schema location before implementing performance update handler).

---

## Module 3 — Performance, Skills, Listening

### EC-M3-001: ATTEMPT_COMPLETED event received with no handler registered
- **Trigger:** M2 emits ATTEMPT_COMPLETED after report generation. M3 has no event handler registered yet.
- **Current behavior:** EventEmitter emits the event. No M3 listener is registered. Event is silently dropped. Performance profile is not updated.
- **Expected behavior:** M3 should register `on('ATTEMPT_COMPLETED', handler)` at startup. The handler must be idempotent (safe to call multiple times for the same attempt).
- **Impact on other modules:** M2 is unaffected. M4 has the same gap. Downstream: student sees stale performance data.
- **Required API/table/service:** M3 must implement `performance_profiles`, `performance_snapshots`, `skill_performances` tables and event handler. Migrations 061+ not yet executed.
- **Implementation status:** Not currently implemented (M3 not built).

---

### EC-M3-002: USER_REGISTERED event received with no M3 handler
- **Trigger:** Student registers. M1 emits USER_REGISTERED. M3 has no handler.
- **Current behavior:** Event silently dropped. `performance.performance_profiles` row never created for the student.
- **Expected behavior:** On ATTEMPT_COMPLETED, M3's handler tries to UPDATE the profile → fails if profile doesn't exist.
- **Impact on other modules:** M2 unaffected. Student's performance page will be empty or error.
- **Required API/table/service:** M3 must implement USER_REGISTERED handler → INSERT performance_profiles.
- **Implementation status:** Not currently implemented.

---

### EC-M3-003: performance.listening_stories table not created — blocks M2 listening routes
- **Trigger:** M2 implements `POST /api/listening/start` and tries to SELECT from `performance.listening_stories`.
- **Current behavior:** Table does not exist in current migrations (migrations 031–043 only). M2 listening routes are not yet implemented, so no current runtime error.
- **Expected behavior:** M3 must deliver migration 062+ creating `performance.listening_stories` and seed at least one story before M2 listening routes can be tested.
- **Impact on other modules:** M2 listening routes (POST /api/listening/start, GET /api/listening/:id/replay, POST /api/listening/:id/submit) are completely blocked.
- **Required API/table/service:** M3 migration: `performance.listening_stories`. M3 API: `GET /api/listening-stories/:id`.
- **Implementation status:** Not currently implemented.

---

### EC-M3-004: performance.skills table not seeded — skill tagging is unenforced
- **Trigger:** `POST /api/question-bank` with `skillIds` → inserts into `session.question_bank_item_skills` with UUID skill IDs.
- **Current behavior:** No FK from `skill_id` to `performance.skills` (intentionally deferred to migration 115). Invalid skill UUIDs can be stored without error.
- **Expected behavior:** Once M3 delivers skills table and migration 115 adds the FK, invalid skill IDs will start failing. Any pre-existing rows with invalid skill IDs would violate the constraint.
- **Impact on other modules:** M2 question bank skill tags are currently unchecked. M3's skill performance aggregation may malfunction if unrecognized skill IDs are present.
- **Required API/table/service:** M3 migration 061+ (performance.skills). Shared migration 115 (cross-schema FK). M3 must seed skills before M2 uses skill tagging.
- **Implementation status:** Intentionally deferred. Not a bug — documented design decision.

---

### EC-M3-005: ATTEMPT_COMPLETED payload missing technicalScore and communicationScore
- **Trigger:** M3's performance handler receives ATTEMPT_COMPLETED event. Handler tries to update `technical_score` and `communication_score` in `performance_profiles`.
- **Current behavior:** Current payload only has `overallScore`. `technicalScore` and `communicationScore` are absent (B10).
- **Expected behavior:** M3 handler needs individual scores. It can fetch them from `performance.assessment_reports` directly using `reportId` (also missing from payload), or M2 must include them in the payload.
- **Impact on other modules:** M3 performance update will be incomplete (only overall score updated, not component scores).
- **Required API/table/service:** Fix B10 in M2 to include `technicalScore`, `communicationScore`, `reportId` in payload.
- **Implementation status:** Blocked by B10 in M2.

---

## Module 4 — Credits, Checklist, Placement

### EC-M4-001: USER_REGISTERED event received with no M4 handler
- **Trigger:** Student registers. M1 emits USER_REGISTERED. M4 has no handler.
- **Current behavior:** Event silently dropped. `credit.credit_accounts` row never created.
- **Expected behavior:** New student must have a credit account before they can start an assessment. Without it, real `CreditService.consume()` will throw "Credit account not found."
- **Impact on other modules:** M2's `POST /api/attempts/start` will fail with 404 or 500 once real CreditService is wired in.
- **Required API/table/service:** M4 must implement USER_REGISTERED handler → INSERT credit_accounts with default balance.
- **Implementation status:** Not currently implemented. Stub masks the issue.

---

### EC-M4-002: ATTEMPT_COMPLETED event received with no M4 handler
- **Trigger:** M2 emits ATTEMPT_COMPLETED. M4 has no handler.
- **Current behavior:** Event silently dropped. Student does not earn completion credits.
- **Expected behavior:** M4 credits handler must call `CreditService.earn(studentId, reward)`.
- **Impact on other modules:** Students never earn credits back. Eventually all students run out of credits.
- **Required API/table/service:** M4 must implement ATTEMPT_COMPLETED handler.
- **Implementation status:** Not currently implemented.

---

### EC-M4-003: Real CreditService not delivered — stub always succeeds
- **Trigger:** `POST /api/attempts/start` calls `CreditService.consume()` from the stub.
- **Current behavior:** Stub always returns `{ newBalance: 50 }`. No credits are actually deducted. Balance check is bypassed. Student can start unlimited assessments.
- **Expected behavior:** Real implementation must: SELECT FOR UPDATE on credit_accounts, check balance >= amount, UPDATE balance, INSERT transaction row, COMMIT.
- **Impact on other modules:** M2 attempt creation is functionally incomplete. All credit-related tests are meaningless until M4 delivers the real service.
- **Required API/table/service:** M4: `credit.credit_accounts`, `credit.credit_transactions` tables + real `CreditService.consume()` + `CreditService.earn()`.
- **Implementation status:** Stub in place. Real implementation: Not currently implemented.

---

### EC-M4-004: CreditService throws non-AppError exception
- **Trigger:** Real `CreditService.consume()` throws a native JavaScript error (e.g., DB connection timeout) rather than an `AppError`.
- **Current behavior:** `sendError(res, err)` in M2's attempt handler receives a non-AppError. The error handler checks if it's an AppError (by `instanceof`) → if not, returns 500 with a generic message. Credit deduction state is unknown.
- **Expected behavior:** Non-AppError exceptions from CreditService should be caught and wrapped, and the error response should be informative. The attempt should not be created.
- **Impact on other modules:** M2 returns 500 instead of a meaningful error. Student may retry, triggering EC-M2-024.
- **Required API/table/service:** M4 must ensure CreditService only throws AppError instances. M2 should add specific try/catch around CreditService call.
- **Implementation status:** Risk — depends on M4 implementation quality.

---

### EC-M4-005: No credit refund on attempt abandon
- **Trigger:** Student calls `PUT /api/attempts/:id/abandon`.
- **Current behavior:** Attempt status set to ABANDONED. No credit refund. No event emitted from M2 to M4.
- **Expected behavior:** Whether credits are refunded on abandon is an architecture decision for M4. Options: (a) always refund, (b) never refund, (c) refund within a time window. Currently undefined.
- **Impact on other modules:** Students who abandon lose credits permanently. No policy mechanism exists.
- **Required API/table/service:** M4 needs to define and implement a refund policy. M2 should emit an ATTEMPT_ABANDONED event (or M4 listens to the abandon endpoint via event).
- **Implementation status:** Architecture decision required. Not currently implemented.

---

## Cross-Module Edge Cases

### EC-CROSS-001: M1 org.students schema changes break M2 silently
- **Source module:** M1
- **Affected module:** M2
- **Trigger:** M1 renames a column or changes a JOIN path in `org.students` or `org.batches`.
- **Current behavior:** M2 queries hard-code `JOIN org.batches b ON b.id = s.batch_id` and `SELECT b.program_id`. If M1 changes this schema, M2 queries silently break at runtime.
- **Expected behavior:** Cross-module schema access should be documented as a contract. Breaking changes require coordinated migration.
- **Required contract/API/event/table:** Documented read-only contract between M1 and M2. No FK enforcement (by design — cross-schema reads use plain SELECT).
- **Implementation exists:** Informal — documented in `BACKEND_IMPLEMENTATION_PLAN.md` Section 5.2 but not enforced technically.
- **Blocked by:** Nothing — risk is ongoing.

---

### EC-CROSS-002: M2 ATTEMPT_COMPLETED payload insufficient for M3 performance handler
- **Source module:** M2
- **Affected module:** M3
- **Trigger:** M2 emits ATTEMPT_COMPLETED with `{ attemptId, studentId, assessmentType, overallScore }`.
- **Current behavior:** M3 handler (when implemented) receives only 4 fields. If M3 needs `technicalScore`, `communicationScore`, or `reportId`, it must make a separate DB query to `performance.assessment_reports` to fetch them.
- **Expected behavior:** The plan specifies a richer payload. M3 should not need to make additional queries.
- **Required contract/API/event/table:** Align `AttemptCompletedPayload` in `events.ts` to include all fields from the BACKEND_IMPLEMENTATION_PLAN.md spec. Fix B10.
- **Implementation exists:** Partially — payload exists but is incomplete.
- **Blocked by:** B10 fix in M2 required before M3 implements its handler.

---

### EC-CROSS-003: M2 ATTEMPT_COMPLETED payload insufficient for M4 credit handler
- **Source module:** M2
- **Affected module:** M4
- **Trigger:** M4 implements ATTEMPT_COMPLETED handler for credit earning. Receives current payload.
- **Current behavior:** `studentId` and `overallScore` are present. M4 likely only needs `studentId` and possibly `attemptId` for the transaction referenceId.
- **Expected behavior:** M4's basic credit earn flow can work with current payload (`studentId` is sufficient). However, if M4 wants to record `assessmentId` as a reference, it's missing.
- **Required contract/API/event/table:** B10 fix (add `assessmentId` to payload).
- **Implementation exists:** Payload is functional for basic M4 credit earning but incomplete.
- **Blocked by:** B10 fix (low priority for M4 basic flow).

---

### EC-CROSS-004: M3 reads performance.assessment_reports expecting assessment schema
- **Source module:** M2
- **Affected module:** M3
- **Trigger:** M3 implements ATTEMPT_COMPLETED handler and queries for the report.
- **Current behavior:** M2 stores reports in `performance.assessment_reports`. BACKEND_IMPLEMENTATION_PLAN.md ISSUE-01 says reports should be in `assessment.assessment_reports`.
- **Expected behavior:** M3 must query `performance.assessment_reports` (where M2 actually writes), not `assessment.assessment_reports`.
- **Required contract/API/event/table:** Update BACKEND_IMPLEMENTATION_PLAN.md and inform M3 of the correct table path. Fix documentation (B8).
- **Implementation exists:** M2 code and migration are consistent at `performance.assessment_reports`. Documentation is wrong.
- **Blocked by:** Documentation update (B8) — must happen before M3 implements handler.

---

### EC-CROSS-005: M2 listening routes blocked by M3's listening_stories table
- **Source module:** M3
- **Affected module:** M2
- **Trigger:** M2 wants to implement `POST /api/listening/start` which SELECTs from `performance.listening_stories`.
- **Current behavior:** Table does not exist. M2 listening routes are not implemented.
- **Expected behavior:** M3 must deliver: (1) migration creating `performance.listening_stories`, (2) seed data with at least one story, (3) `GET /api/listening-stories/:id` endpoint. M2 can then implement the listening sub-flow.
- **Required contract/API/event/table:** M3 migration 062, M3 API `GET /api/listening-stories/:id`, seed data.
- **Implementation exists:** Not currently implemented.
- **Blocked by:** M3 not yet implemented.

---

### EC-CROSS-006: M4 credit account missing at attempt start (M4 not implemented)
- **Source module:** M4
- **Affected module:** M2
- **Trigger:** M4's real `CreditService.consume()` is wired in. New student tries `POST /api/attempts/start`.
- **Current behavior:** With stub — always succeeds. With real M4 — `SELECT FROM credit.credit_accounts WHERE student_id = $1` returns 0 rows → throws "Credit account not found."
- **Expected behavior:** Credit account must exist before attempt start. M4 USER_REGISTERED handler must create it at registration.
- **Required contract/API/event/table:** M4 USER_REGISTERED handler + `credit.credit_accounts` INSERT.
- **Implementation exists:** Not currently implemented. Stub masks the gap.
- **Blocked by:** M4 not yet implemented.

---

### EC-CROSS-007: M1 → M2: student_mentor_assignments column name discrepancy in docs
- **Source module:** M1
- **Affected module:** M2
- **Trigger:** Any code that queries `org.student_mentor_assignments`.
- **Current behavior:** Actual M1 migration 012 uses column name `mentor_id`. M2 code correctly uses `mentor_id`. The `database_schema` design document uses `mentor_user_id`. The code is correct; the design doc is stale.
- **Expected behavior:** Design docs should be updated to reflect `mentor_id`. Any M3/M4 code that references this column based on the design doc will fail at runtime.
- **Required contract/API/event/table:** Update `docs/database_schema` to reflect `mentor_id` (not `mentor_user_id`).
- **Implementation exists:** M2 code is correct. Documentation is wrong.
- **Blocked by:** Documentation update.

---

### EC-CROSS-008: M1 audit_logs column name discrepancy in docs
- **Source module:** M1
- **Affected module:** M2
- **Trigger:** Any code that inserts into `system.audit_logs`.
- **Current behavior:** Actual M1 migration 004 uses column name `user_id`. M2 code correctly uses `user_id`. The `database_schema` design document uses `actor_user_id`.
- **Expected behavior:** Design docs should be updated. Any module that implements audit logging based on the design doc will fail at runtime.
- **Required contract/API/event/table:** Update `docs/database_schema` to reflect `user_id` (not `actor_user_id`).
- **Implementation exists:** M2 code is correct. Documentation is stale.
- **Blocked by:** Documentation update.

---

### EC-CROSS-009: In-process event bus — event lost on process crash
- **Source module:** All
- **Affected module:** M3, M4
- **Trigger:** Any event (USER_REGISTERED, ATTEMPT_COMPLETED) emitted via `eventBus.emit()` when the Node.js process crashes between the DB write and the emit.
- **Current behavior:** Event is lost. M3 performance profile and M4 credit account/reward may never be created/applied.
- **Expected behavior:** Known MVP limitation (documented in BACKEND_IMPLEMENTATION_PLAN.md Section 3.8). Post-MVP mitigation: outbox pattern.
- **Required contract/API/event/table:** `system.outbox_events` table (created in migration but unused). Outbox worker.
- **Implementation exists:** Table exists, worker not implemented.
- **Blocked by:** Post-MVP scope.

---

### EC-CROSS-010: M3/M4 event handlers not idempotent — duplicate event delivery risk
- **Source module:** M2 (emit), M3/M4 (consume)
- **Affected module:** M3, M4
- **Trigger:** In edge cases, ATTEMPT_COMPLETED could theoretically be emitted twice (e.g., B3 session re-activation triggers second complete call, which hits ON CONFLICT DO NOTHING on report but still emits the event).
- **Current behavior:** Second `POST /api/sessions/:id/complete` call: session check `state !== 'ACTIVE'` → 409 INVALID_STATUS before reaching the emit. So duplicate emission via B3 is blocked by the session check. However, if B3 is exploited before the fix, a second complete on a re-activated session could emit again.
- **Expected behavior:** Event handlers must be idempotent regardless. M3 and M4 handlers must use INSERT ... ON CONFLICT DO NOTHING or UPDATE ... WHERE conditions to guard against double-processing.
- **Required contract/API/event/table:** M3 and M4 handler implementations must be idempotent.
- **Implementation exists:** Not yet implemented (M3/M4 not built). Must be designed in from the start.
- **Blocked by:** M3, M4 implementation.

---

*End of edge case catalogue.*
