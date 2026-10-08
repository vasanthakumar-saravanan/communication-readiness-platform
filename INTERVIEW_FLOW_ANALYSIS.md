# Interview Flow Integration Analysis

## Executive Summary

The interview system has a **solid backend architecture** (assessment_attempts, assessment_sessions tables) and a **functional AI service** with question generation and evaluation endpoints. However, there's a **critical gap**: the frontend currently uses **client-side mocks** for the entire interview flow, bypassing both the backend and AI service completely.

---

## Current State Analysis

### Frontend Flow (MockInterviewRoom.tsx + AppContext.tsx)
```
User clicks "Start" 
  → startInterview() 
  → api.interview.start(studentId, type) [MOCK - generates questions locally]
  → Displays first question
  
User speaks answer
  → submitAnswer(answerText)
  → api.interview.submitAnswer(sessionId, answer) [MOCK - evaluates locally]
  → Returns { turnEvaluation, nextQuestion, finalReport }
  → Displays next question OR concludes session
```

**Problem**: All question generation and evaluation happens in `frontend/src/services/api.ts` using mock functions:
- `generateDynamicQuestions()` - lines 72-99
- `evaluateDynamicAnswer()` - lines 141-217

### Backend Routes (interview.routes.ts)

✅ **POST /api/sessions** (lines 47-94)
- Creates `assessment_attempt` record
- Creates `assessment_session` record
- Returns: `{ sessionId, attemptId, goal }`
- **Gap**: Does NOT generate or return first question

✅ **POST /api/sessions/:id/conclude** (lines 101-206)
- Marks attempt as COMPLETED
- Stores final scores in `performance.assessment_reports`
- Emits `ATTEMPT_COMPLETED` event (triggers Module 3 agent)
- **Works perfectly** for the conclusion flow

### AI Service Endpoints (ai-service/app/routers/interview.py)

✅ **POST /ai/generate-question** (lines 45-58)
- Input: `{ student_name, skills, projects, previous_turns[], difficulty, domain }`
- Output: `{ question_text, difficulty, category }`
- **Ready to use** - just needs to be called

✅ **POST /ai/evaluate-turn** (lines 60-78)
- Input: `{ question_text, student_answer, difficulty, turn_number, domain }`
- Output: `{ technical_score, communication_score, wpm, filler_words, feedback, strengths, weaknesses, next_recommended_difficulty }`
- **Ready to use** - just needs to be called

✅ **POST /ai/evaluate-listening** (lines 81-98)
- For listening comprehension exercises
- **Ready to use**

---

## Missing Integration Points

### 🔴 Critical: Missing Backend Endpoints

#### 1. **GET /api/sessions/:sessionId/next-question**
**Purpose**: Generate and return the next interview question

**When to call**:
- After session is created (get first question)
- After each turn is submitted (get next question)

**Backend Logic**:
```typescript
1. Fetch session from database
2. Get current turn number from session.current_sequence_no
3. Fetch student profile (skills, projects, resume)
4. Fetch previous turns from database
5. Call AI service: POST /ai/generate-question with:
   - student_name
   - skills (from student profile)
   - projects (from student resume)
   - previous_turns[] (from database)
   - difficulty (based on previous performance)
   - domain (from student program/track)
6. Store generated question in session.turn_records or similar
7. Return: { question_text, difficulty, category, turn_number }
```

#### 2. **POST /api/sessions/:sessionId/submit-answer**
**Purpose**: Submit an answer, get evaluation, and determine if interview continues

**Request Body**:
```json
{
  "question_text": "Walk me through...",
  "student_answer": "The architecture uses...",
  "duration_seconds": 18
}
```

**Backend Logic**:
```typescript
1. Fetch session from database
2. Get current turn number
3. Call AI service: POST /ai/evaluate-turn with:
   - question_text
   - student_answer
   - difficulty (from question)
   - turn_number
   - domain (from student)
4. Store turn result in database:
   - question_text
   - student_answer
   - technical_score
   - communication_score
   - wpm, filler_words
   - feedback, strengths, weaknesses
5. Increment session.current_sequence_no
6. Determine if interview is complete (turn_number >= 3)
7. If not complete, return: { isCompleted: false, turnEvaluation, nextQuestionAvailable: true }
8. If complete, calculate final scores and return: { isCompleted: true, turnEvaluation, finalScores }
```

**Response**:
```json
{
  "isCompleted": false,
  "turnEvaluation": {
    "turn_number": 1,
    "technical_score": 85,
    "communication_score": 78,
    "wpm": 124,
    "filler_words": 2,
    "feedback": "...",
    "strengths": "...",
    "weaknesses": "..."
  },
  "nextQuestionAvailable": true
}
```

---

## Detailed Integration Plan

### Phase 1: Backend Endpoint Creation (Priority: CRITICAL)

**File**: `backend/src/routes/interview.routes.ts`

#### Add Endpoint 1: Get Next Question
```typescript
// ── GET /api/sessions/:sessionId/next-question ─────────────────────────────
// Generates the next interview question by calling the AI service
interviewRouter.get('/:sessionId/next-question', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.sessionId;
    
    // 1. Fetch session
    const { rows: sessionRows } = await db.query(
      `SELECT ss.attempt_id, ss.current_sequence_no, ss.state
       FROM session.assessment_sessions ss WHERE ss.id = $1`,
      [sessionId]
    );
    if (sessionRows.length === 0) {
      throw new AppError(404, 'Session not found', 'NOT_FOUND');
    }
    const session = sessionRows[0];
    
    // 2. Fetch student profile
    const { rows: attemptRows } = await db.query(
      `SELECT student_id FROM assessment.assessment_attempts WHERE id = $1`,
      [session.attempt_id]
    );
    const studentId = attemptRows[0].student_id;
    
    const { rows: studentRows } = await db.query(
      `SELECT name, resume, program_id FROM org.students WHERE id = $1`,
      [studentId]
    );
    const student = studentRows[0];
    
    // 3. Fetch previous turns (if any)
    // TODO: Query turn_records table once created
    
    // 4. Call AI service
    const aiResponse = await fetch(`${AI_SERVICE_URL}/ai/generate-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_name: student.name,
        skills: student.resume?.skills?.languages || [],
        projects: student.resume?.projects || [],
        previous_turns: [], // TODO: populate from turn_records
        difficulty: session.current_sequence_no === 0 ? 'EASY' : 
                    session.current_sequence_no === 1 ? 'MEDIUM' : 'ADVANCED',
        domain: student.program_id || 'Technical'
      })
    });
    
    if (!aiResponse.ok) {
      throw new AppError(502, 'AI service error', 'AI_SERVICE_ERROR');
    }
    
    const question = await aiResponse.json();
    
    sendSuccess(res, {
      question_text: question.question_text,
      difficulty: question.difficulty,
      category: question.category,
      turn_number: session.current_sequence_no + 1
    });
  } catch (err) {
    sendError(res, err);
  }
});
```

#### Add Endpoint 2: Submit Answer
```typescript
// ── POST /api/sessions/:sessionId/submit-answer ────────────────────────────
// Submits an answer, evaluates it via AI service, determines next step
interviewRouter.post('/:sessionId/submit-answer', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.sessionId;
    const { question_text, student_answer, duration_seconds } = req.body;
    
    // 1. Fetch session
    const { rows: sessionRows } = await db.query(
      `SELECT ss.attempt_id, ss.current_sequence_no FROM session.assessment_sessions ss 
       WHERE ss.id = $1`,
      [sessionId]
    );
    const session = sessionRows[0];
    const turnNumber = session.current_sequence_no + 1;
    
    // 2. Call AI service to evaluate
    const aiResponse = await fetch(`${AI_SERVICE_URL}/ai/evaluate-turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question_text,
        student_answer,
        difficulty: turnNumber === 1 ? 'EASY' : turnNumber === 2 ? 'MEDIUM' : 'ADVANCED',
        turn_number: turnNumber,
        domain: 'Technical'
      })
    });
    
    const evaluation = await aiResponse.json();
    
    // 3. Store turn result
    // TODO: Insert into turn_records table
    
    // 4. Update session sequence
    await db.query(
      `UPDATE session.assessment_sessions 
       SET current_sequence_no = $1, last_activity_at = now() 
       WHERE id = $2`,
      [session.current_sequence_no + 1, sessionId]
    );
    
    // 5. Determine if complete (3 turns)
    const isCompleted = turnNumber >= 3;
    
    sendSuccess(res, {
      isCompleted,
      turnEvaluation: {
        turn_number: turnNumber,
        technical_score: evaluation.technical_score,
        communication_score: evaluation.communication_score,
        wpm: evaluation.wpm,
        filler_words: evaluation.filler_words,
        feedback: evaluation.feedback,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses
      },
      nextQuestionAvailable: !isCompleted
    });
  } catch (err) {
    sendError(res, err);
  }
});
```

### Phase 2: Frontend API Client Updates

**File**: `frontend/src/services/api.ts`

Replace mock implementations with real API calls:

```typescript
interview = {
  start: async (studentId: string, type: 'MOCK_INTERVIEW' | 'LISTENING_COMPREHENSION' = 'MOCK_INTERVIEW'): Promise<{ sessionId: string; firstQuestion: QuestionTurn }> => {
    // Call backend to create session
    const sessionResponse = await this.fetchAPI<{ sessionId: string; attemptId: string }>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ studentId, goal: 'Improve technical skills' })
    });
    
    // Call backend to get first question
    const questionResponse = await this.fetchAPI<{ 
      question_text: string; 
      difficulty: string; 
      category: string; 
      turn_number: number 
    }>(`/sessions/${sessionResponse.sessionId}/next-question`);
    
    const firstQuestion: QuestionTurn = {
      id: `q_${questionResponse.turn_number}`,
      questionNumber: questionResponse.turn_number,
      questionText: questionResponse.question_text,
      difficulty: questionResponse.difficulty as Difficulty,
      category: questionResponse.category
    };
    
    return { sessionId: sessionResponse.sessionId, firstQuestion };
  },

  submitAnswer: async (sessionId: string, studentAnswer: string, durationSeconds = 20) => {
    // Get current question from state (passed via context)
    const currentQuestion = /* need to pass this */;
    
    // Call backend to evaluate and get next
    const response = await this.fetchAPI<{
      isCompleted: boolean;
      turnEvaluation: any;
      nextQuestionAvailable: boolean;
    }>(`/sessions/${sessionId}/submit-answer`, {
      method: 'POST',
      body: JSON.stringify({
        question_text: currentQuestion.questionText,
        student_answer: studentAnswer,
        duration_seconds: durationSeconds
      })
    });
    
    let nextQuestion: QuestionTurn | undefined = undefined;
    
    if (!response.isCompleted && response.nextQuestionAvailable) {
      // Fetch next question
      const nextQ = await this.fetchAPI<{ 
        question_text: string; 
        difficulty: string; 
        category: string;
        turn_number: number 
      }>(`/sessions/${sessionId}/next-question`);
      
      nextQuestion = {
        id: `q_${nextQ.turn_number}`,
        questionNumber: nextQ.turn_number,
        questionText: nextQ.question_text,
        difficulty: nextQ.difficulty as Difficulty,
        category: nextQ.category
      };
    }
    
    const turnEvaluation: QuestionTurn = {
      id: currentQuestion.id,
      questionNumber: currentQuestion.questionNumber,
      questionText: currentQuestion.questionText,
      difficulty: currentQuestion.difficulty,
      category: currentQuestion.category,
      studentAnswer,
      technicalScore: response.turnEvaluation.technical_score,
      communicationScore: response.turnEvaluation.communication_score,
      wpm: response.turnEvaluation.wpm,
      fillerWords: response.turnEvaluation.filler_words,
      feedback: response.turnEvaluation.feedback,
      strengths: response.turnEvaluation.strengths,
      weaknesses: response.turnEvaluation.weaknesses
    };
    
    return {
      isCompleted: response.isCompleted,
      turnEvaluation,
      nextQuestion,
      finalReport: response.isCompleted ? await this.interview.finalize(sessionId) : undefined
    };
  }
};
```

### Phase 3: Database Schema Updates

**Needed**: Table to store turn-by-turn data

```sql
-- Create turn_records table in session schema
CREATE TABLE session.turn_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES session.assessment_sessions(id) ON DELETE CASCADE,
  turn_number INT NOT NULL,
  question_text TEXT NOT NULL,
  question_difficulty VARCHAR(20),
  question_category VARCHAR(100),
  student_answer TEXT,
  technical_score DECIMAL(5,2),
  communication_score DECIMAL(5,2),
  wpm INT,
  filler_words INT,
  feedback TEXT,
  strengths TEXT,
  weaknesses TEXT,
  answered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(session_id, turn_number)
);

CREATE INDEX idx_turn_records_session ON session.turn_records(session_id);
```

---

## Configuration Requirements

### Environment Variables

**Backend** (`backend/.env`):
```bash
AI_SERVICE_URL=http://localhost:8001
# or
AI_SERVICE_URL=http://ai-service:8001  # if using Docker
```

**AI Service** (`ai-service/.env`):
Already configured with Groq API key - no changes needed

---

## Testing Checklist

### Backend Endpoints
- [ ] POST /api/sessions creates session successfully
- [ ] GET /api/sessions/:id/next-question returns first question
- [ ] POST /api/sessions/:id/submit-answer evaluates and stores turn
- [ ] GET /api/sessions/:id/next-question returns second question
- [ ] After 3 turns, session marked as complete
- [ ] POST /api/sessions/:id/conclude stores final scores

### AI Service Integration
- [ ] Backend can reach AI service at configured URL
- [ ] Question generation returns valid questions
- [ ] Turn evaluation returns scores and feedback
- [ ] Error handling for AI service failures

### Frontend Flow
- [ ] Start button creates session and displays first question
- [ ] Answer submission shows evaluation feedback
- [ ] Next question loads automatically after evaluation
- [ ] After 3 turns, session concludes and shows report
- [ ] Report includes AI-generated feedback

### End-to-End
- [ ] Complete interview from start to finish
- [ ] Verify all data stored in database
- [ ] Verify Module 3 agent triggered on completion
- [ ] Verify performance report generated correctly

---

## Architecture Notes

### Why This Design?

**Separation of Concerns**:
- **Backend**: Session management, data persistence, orchestration
- **AI Service**: Pure LLM operations (question generation, evaluation)
- **Frontend**: UI/UX, speech recognition, user interaction

**Scalability**:
- AI service can be scaled independently
- Backend can cache AI responses
- Multiple interview sessions can run concurrently

**Maintainability**:
- AI prompts centralized in ai-service
- Database schema handles all interview types
- Frontend doesn't need to change if AI logic changes

### Current Backend Architecture is Solid ✅

The existing schema is well-designed:
- `assessment.assessment_attempts` tracks each interview attempt
- `session.assessment_sessions` manages session state
- `performance.assessment_reports` stores final scores
- Event system (`ATTEMPT_COMPLETED`) triggers Module 3

**We just need to add**:
1. Two new routes in `interview.routes.ts`
2. One new table (`session.turn_records`)
3. Frontend API client updates

---

## Risk Assessment

### Low Risk Changes ✅
- Adding new backend endpoints (no existing code modified)
- Creating new database table (no schema changes to existing tables)
- AI service already tested and working

### Medium Risk Changes ⚠️
- Frontend API client replacement (switching from mock to real)
- **Mitigation**: Keep mock functions as fallback during transition

### High Risk Changes ❌
- None identified - architecture is sound

---

## Implementation Priority

### Phase 1 (CRITICAL - Week 1)
1. Add `GET /sessions/:id/next-question` endpoint
2. Add `POST /sessions/:id/submit-answer` endpoint
3. Create `session.turn_records` table
4. Test backend endpoints with Postman/curl

### Phase 2 (HIGH - Week 1)
1. Update frontend `api.interview.start()` to call real backend
2. Update frontend `api.interview.submitAnswer()` to call real backend
3. Test end-to-end flow

### Phase 3 (MEDIUM - Week 2)
1. Add error handling and retry logic
2. Add AI service response caching
3. Add analytics/logging for AI usage
4. Performance optimization

---

## Summary

**What Works**:
- ✅ Backend session creation (`POST /sessions`)
- ✅ Backend session conclusion (`POST /sessions/:id/conclude`)
- ✅ AI service question generation (`POST /ai/generate-question`)
- ✅ AI service turn evaluation (`POST /ai/evaluate-turn`)
- ✅ Frontend UI and speech recognition
- ✅ Database schema for sessions and attempts

**What's Missing**:
- ❌ Backend endpoint to get questions (`GET /sessions/:id/next-question`)
- ❌ Backend endpoint to submit answers (`POST /sessions/:id/submit-answer`)
- ❌ Database table to store turn records (`session.turn_records`)
- ❌ Frontend integration with backend (currently using mocks)

**Effort Estimate**: 2-3 days for full integration
- Backend endpoints: 4-6 hours
- Database migration: 1 hour
- Frontend integration: 4-6 hours
- Testing: 4-6 hours

**Impact**: Enables AI-powered interview questions and evaluation, replacing static mocks with dynamic LLM-generated content.
