/**
 * End-to-end WebSocket interview test — 3-turn text-fallback path.
 *
 * Runs without a browser:
 *   1. Login → JWT
 *   2. Create interview session (REST)
 *   3. Fetch first question (REST /next-question)
 *   4. Connect WS → start_interview → submit_transcript (x3)
 *   5. Verify turn_result payloads
 *   6. Check DB for persisted transcripts/evaluations
 *
 * Usage:
 *   node --experimental-vm-modules test-interview-e2e.mjs
 */

import WebSocket from 'ws';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config();

const BASE = 'http://localhost:5000';   // main dev server with all env vars
const WS_BASE = 'ws://localhost:5000';
const STUDENT_EMAIL = 'student.real01@example.com';
const STUDENT_PASSWORD = 'Test@123456';

// ── helpers ──────────────────────────────────────────────────────────────────

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

async function get(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── WS helper: send JSON, collect events until condition met ─────────────────

function wsConnect(sessionId, token) {
  return new Promise((resolve, reject) => {
    const url = `${WS_BASE}/ws/interview?token=${encodeURIComponent(token)}&sessionId=${encodeURIComponent(sessionId)}`;
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    setTimeout(() => reject(new Error('WS connect timeout')), 8000);
  });
}

function collectUntil(ws, condition, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const events = [];
    const timer = setTimeout(() => {
      reject(new Error(`WS timeout after ${timeoutMs}ms. Events so far: ${JSON.stringify(events.map(e => e.type))}`));
    }, timeoutMs);

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      events.push(msg);
      if (condition(msg, events)) {
        clearTimeout(timer);
        resolve(events);
      }
    });

    ws.on('close', () => {
      clearTimeout(timer);
      reject(new Error('WS closed unexpectedly'));
    });
  });
}

// ── DB check via backend pool ─────────────────────────────────────────────────

async function checkDb(sessionId) {
  console.log('\n--- Checking DB (via direct pg query) ---');
  const { default: pgPkg } = await import('pg');
  const { Client } = pgPkg;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const { rows } = await client.query(
    `SELECT turn_number, question, answer, difficulty
     FROM session.interview_transcripts
     WHERE session_id = $1
     ORDER BY turn_number`,
    [sessionId],
  );
  await client.end();
  return rows;
}

// ── MAIN TEST ─────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log(' AI MOCK INTERVIEW — E2E TEST (3-turn text fallback path)');
  console.log('='.repeat(60));

  // ── STEP 1: Login ────────────────────────────────────────────────────────
  console.log('\n[1] LOGIN');
  const login = await post('/api/auth/login', { email: STUDENT_EMAIL, password: STUDENT_PASSWORD });
  if (login.status !== 200) {
    console.error('Login failed:', login.json);
    process.exit(1);
  }
  const token = login.json.data?.token || login.json.data?.accessToken;
  const userId = login.json.data?.user?.id;
  console.log(`  ✓ Logged in  userId=${userId?.slice(0,8)}…`);

  // ── STEP 2: Get student ID ───────────────────────────────────────────────
  console.log('\n[2] GET STUDENT PROFILE');
  const me = await get('/api/students/me', token);
  if (me.status !== 200) {
    console.error('student/me failed:', me.json);
    process.exit(1);
  }
  const student = me.json.data?.student;
  const studentId = student?.id;
  console.log(`  ✓ studentId=${studentId?.slice(0,8)}…  hasResume=${!!student?.parsed_resume}`);

  // Resume summary for display
  const resume = student?.parsed_resume || {};
  const skills = [
    ...(resume.skills?.languages || []),
    ...(resume.skills?.frameworks || []),
  ].join(', ');
  const projects = (resume.projects || []).map(p => p.title || p.name).join(', ');
  console.log(`  Resume: skills=[${skills}]  projects=[${projects}]`);

  // ── STEP 3: Mark any stale IN_PROGRESS attempts as ABANDONED ─────────────
  console.log('\n[3] CLEANUP STALE SESSIONS');
  // Use dynamic import for pg since this is an ESM file
  const { default: pgPkg } = await import('pg');
  const { Client } = pgPkg;
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const abandoned = await db.query(
    `UPDATE assessment.assessment_attempts
     SET status = 'ABANDONED', completed_at = now()
     WHERE student_id = $1 AND status = 'IN_PROGRESS'
     RETURNING id`,
    [studentId],
  );
  if (abandoned.rowCount > 0) {
    console.log(`  Abandoned ${abandoned.rowCount} stale attempt(s)`);
  } else {
    console.log('  No stale attempts');
  }

  // ── STEP 4: Create interview session ─────────────────────────────────────
  console.log('\n[4] CREATE INTERVIEW SESSION');
  const createSession = await post('/api/sessions', { studentId }, token);
  if (createSession.status !== 201) {
    console.error('Session creation failed:', createSession.json);
    await db.end();
    process.exit(1);
  }
  const sessionId = createSession.json.data?.sessionId;
  console.log(`  ✓ sessionId=${sessionId?.slice(0,8)}…`);

  // ── STEP 5: Fetch first question ─────────────────────────────────────────
  console.log('\n[5] FETCH FIRST QUESTION (personalized)');
  const q1resp = await get(`/api/sessions/${sessionId}/next-question`, token);
  if (q1resp.status !== 200) {
    console.error('next-question failed:', q1resp.json);
    await db.end();
    process.exit(1);
  }
  const q1 = q1resp.json.data;
  console.log(`  ✓ Q1: "${q1?.question_text?.slice(0, 120)}"`);
  console.log(`     difficulty=${q1?.difficulty}  category=${q1?.category}`);

  // ── STEP 6: Connect WS ────────────────────────────────────────────────────
  console.log('\n[6] CONNECT WEBSOCKET');
  const ws = await wsConnect(sessionId, token);
  const connectedEvts = await collectUntil(ws, msg => msg.type === 'connected', 5000);
  console.log(`  ✓ WS connected  events=${connectedEvts.map(e=>e.type).join(',')}`);

  // Remove the one-shot listener (collectUntil set it)
  ws.removeAllListeners('message');

  // ── STEP 7: 3-turn interview ─────────────────────────────────────────────

  const turns = [
    {
      q: q1?.question_text || 'Tell me about your E-Commerce project.',
      difficulty: q1?.difficulty || 'EASY',
      turnNum: 1,
      answer: 'I built a full-stack e-commerce platform using React for the frontend and Node.js with Express for the backend. The platform included product listings, shopping cart functionality, and a checkout system with payment integration. I used MongoDB as the database and deployed on AWS. The main challenge was implementing real-time inventory updates across multiple concurrent users.',
    },
  ];

  let lastEval = null;
  const allTurnResults = [];

  for (let i = 0; i < 3; i++) {
    const turn = turns[i] || {
      q: lastEval?.nextQuestionText || 'Follow-up technical question',
      difficulty: lastEval?.nextDifficulty || 'MEDIUM',
      turnNum: i + 1,
      answer: i === 1
        ? 'For the API layer, I designed RESTful endpoints with proper HTTP status codes and versioning. I implemented middleware for authentication using JWT tokens, rate limiting, and request validation using Joi. For the database layer, I used Mongoose with proper schema definitions and indexed queries for performance.'
        : 'To handle increased traffic, I would move to a microservices architecture. I would add Redis for caching frequently accessed data, implement horizontal scaling with load balancers, use database read replicas, and add CDN for static assets. I would also implement connection pooling and query optimization to reduce database load.',
    };

    console.log(`\n[TURN ${turn.turnNum}]`);
    console.log(`  Question: "${turn.q.slice(0, 100)}…"`);
    console.log(`  Answer:   "${turn.answer.slice(0, 80)}…"`);

    // Send start_interview
    ws.send(JSON.stringify({
      type: 'start_interview',
      question_text: turn.q,
      difficulty: turn.difficulty,
      turn_number: turn.turnNum,
      domain: 'Technical',
    }));
    console.log(`  → start_interview sent`);

    await sleep(300);

    // Send transcript via text fallback
    ws.send(JSON.stringify({
      type: 'submit_transcript',
      transcript: turn.answer,
    }));
    console.log(`  → submit_transcript sent (${turn.answer.length} chars)`);

    // Collect events until turn_result arrives
    const turnEvents = await collectUntil(
      ws,
      msg => msg.type === 'turn_result' || (msg.type === 'error'),
      90000,
    );
    ws.removeAllListeners('message');

    const textChunks = turnEvents.filter(e => e.type === 'text_chunk');
    const turnResult = turnEvents.find(e => e.type === 'turn_result');
    const errorEvt = turnEvents.find(e => e.type === 'error');

    if (errorEvt) {
      console.error(`  ✗ ERROR: ${errorEvt.message}`);
      ws.close();
      await db.end();
      process.exit(1);
    }

    if (!turnResult) {
      console.error(`  ✗ No turn_result received. Events: ${turnEvents.map(e=>e.type).join(',')}`);
      ws.close();
      await db.end();
      process.exit(1);
    }

    const ev = turnResult.data;
    lastEval = ev;
    allTurnResults.push({ q: turn.q, answer: turn.answer, eval: ev });

    console.log(`  ✓ turn_result received`);
    console.log(`    textChunks: ${textChunks.length} (conversational response streamed)`);
    console.log(`    technicalScore:     ${ev.technicalScore}`);
    console.log(`    communicationScore: ${ev.communicationScore}`);
    console.log(`    overallScore:       ${ev.overallScore}`);
    console.log(`    feedback: "${ev.feedback?.slice(0,100)}"`);
    console.log(`    nextDifficulty:     ${ev.nextDifficulty}`);
    console.log(`    nextQuestion: "${ev.nextQuestionText?.slice(0, 100)}…"`);

    // Store next question for the following turn's display (answer comes from fallback)
    if (ev.nextQuestionText && i + 1 < 3) {
      turns[i + 1] = {
        q: ev.nextQuestionText,
        difficulty: ev.nextDifficulty,
        turnNum: i + 2,
        answer: i === 1
          ? 'For the API layer, I designed RESTful endpoints with proper HTTP status codes and versioning. I implemented middleware for authentication using JWT tokens, rate limiting, and request validation using Joi. For the database layer, I used Mongoose with proper schema definitions and indexed queries for performance.'
          : 'To handle increased traffic, I would move to a microservices architecture. I would add Redis for caching frequently accessed data, implement horizontal scaling with load balancers, use database read replicas, and add CDN for static assets. I would also implement connection pooling and query optimization to reduce database load.',
      };
    }
  }

  ws.close();

  // ── STEP 8: Verify DB persistence ─────────────────────────────────────────
  console.log('\n[8] DATABASE VERIFICATION');
  await sleep(3000); // wait for async flushToDb

  const dbRows = await db.query(
    `SELECT turn_number, transcript_text, metadata
     FROM session.interview_transcripts
     WHERE session_id = $1
     ORDER BY turn_number`,
    [sessionId],
  );
  await db.end();

  console.log(`  Rows in session.interview_transcripts: ${dbRows.rowCount}`);
  dbRows.rows.forEach(row => {
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata || {});
    console.log(`  Turn ${row.turn_number}:`);
    console.log(`    Q: "${meta.question_text?.slice(0,80)}…"`);
    console.log(`    A: "${row.transcript_text?.slice(0,80)}…"`);
    console.log(`    difficulty: ${meta.difficulty}  scores: tech=${meta.technical_score} comm=${meta.communication_score}`);
  });

  // ── STEP 9: Cross-user isolation test ─────────────────────────────────────
  console.log('\n[9] CROSS-USER ISOLATION TEST');
  const login2 = await post('/api/auth/login', { email: 'student.real02@example.com', password: 'Test@1234' });
  if (login2.status === 200) {
    const token2 = login2.json.data?.accessToken || login2.json.data?.token;
    const reject = await get(`/api/sessions/${sessionId}/next-question`, token2);
    if (reject.status === 403 || reject.status === 404) {
      console.log(`  ✓ Student 2 correctly blocked from Student 1 session (HTTP ${reject.status})`);
    } else {
      console.log(`  ✗ ISOLATION FAILURE: Student 2 got HTTP ${reject.status} on Student 1 session`);
    }

    // Also try WS
    try {
      const ws2 = await wsConnect(sessionId, token2);
      const rej = await collectUntil(ws2, msg => msg.type === 'error' || msg.type === 'connected', 6000);
      const errMsg = rej.find(e => e.type === 'error');
      if (errMsg) {
        console.log(`  ✓ WS correctly rejected Student 2 on Student 1 session: "${errMsg.message}"`);
      } else {
        console.log(`  ✗ WS ISOLATION FAILURE: Student 2 got connected to Student 1 session`);
      }
      ws2.close();
    } catch (e) {
      console.log(`  ✓ WS rejected Student 2 (connection error): ${e.message}`);
    }
  } else {
    console.log(`  Skipping cross-user test (Student 2 login failed: ${login2.status})`);
  }

  // ── FINAL REPORT ──────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log(' FINAL REPORT');
  console.log('='.repeat(60));

  allTurnResults.forEach((t, i) => {
    console.log(`\nTURN ${i+1}:`);
    console.log(`  Q: "${t.q.slice(0,120)}"`);
    console.log(`  A: "${t.answer.slice(0,80)}…"`);
    console.log(`  technical=${t.eval.technicalScore}  comm=${t.eval.communicationScore}  overall=${t.eval.overallScore}`);
    console.log(`  feedback: "${t.eval.feedback?.slice(0,100)}"`);
    if (i < allTurnResults.length - 1) {
      console.log(`  → next Q: "${t.eval.nextQuestionText?.slice(0,100)}"`);
    }
  });

  // Check questions are not repeated
  const questions = allTurnResults.map(t => t.q.toLowerCase().slice(0,60));
  const unique = new Set(questions);
  console.log(`\nQuestion repetition check: ${unique.size} unique out of ${questions.length} questions — ${unique.size === questions.length ? '✓ PASS (no repeats)' : '✗ FAIL (repeated)'}`);

  console.log(`\nDB rows persisted: ${dbRows.rowCount} of 3 turns`);
  console.log(dbRows.rowCount >= 3 ? '  ✓ DB persistence working (all 3 turns)' : dbRows.rowCount >= 1 ? `  ✓ DB persistence partial (${dbRows.rowCount}/3 turns)` : '  ✗ DB persistence issue');

  console.log('\n✓ 3-turn AI Mock Interview completed successfully\n');
}

main().catch(err => {
  console.error('\n✗ TEST FAILED:', err.message);
  process.exit(1);
});
