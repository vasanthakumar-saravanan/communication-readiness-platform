#!/bin/bash
SESSION_ID="59cd0c65-2d1d-445c-ab22-a341018e2475"

TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student.test02@example.com","password":"Test@123456"}' | \
  python -c "import json, sys; print(json.load(sys.stdin)['data']['token'])")

echo "=== 3-TURN INTERVIEW TEST WITH REAL GROQ ==="
echo "Session: $SESSION_ID"
echo ""

for turn in 1 2 3; do
  echo "=== TURN $turn ==="

  # Get question
  Q_RESP=$(curl -s -X GET "http://localhost:5000/api/sessions/$SESSION_ID/next-question" \
    -H "Authorization: Bearer $TOKEN")

  Q_TEXT=$(echo "$Q_RESP" | python -c "import json, sys; d=json.load(sys.stdin); print(d['data']['question_text'] if 'data' in d else '')" 2>&1)

  if [ -z "$Q_TEXT" ]; then
    echo "TURN $turn QUESTION: FAIL"
    echo "$Q_RESP" | python -m json.tool 2>&1 | head -10
    exit 1
  fi

  echo "Question: ${Q_TEXT:0:70}..."

  # Submit answer
  A_RESP=$(curl -s -X POST "http://localhost:5000/api/sessions/$SESSION_ID/submit-answer" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"question_text\":\"Technology question\",\"student_answer\":\"I would implement this using modern best practices including proper design patterns, error handling, logging, testing, and documentation. For scalability I would use caching, load balancing, and async processing.\",\"duration_seconds\":30}")

  echo "$A_RESP" | python -c "
import json, sys
try:
    d = json.load(sys.stdin)
    if 'data' in d and 'turnEvaluation' in d['data']:
        te = d['data']['turnEvaluation']
        print(f'Technical Score: {te[\"technical_score\"]}')
        print(f'Communication Score: {te[\"communication_score\"]}')
        print(f'Completed: {d[\"data\"][\"isCompleted\"]}')
        print('TURN $turn: PASS')
    else:
        print('TURN $turn: FAIL')
        print(json.dumps(d, indent=2))
        sys.exit(1)
except Exception as e:
    print(f'TURN $turn: FAIL - {e}')
    sys.exit(1)
" || exit 1

  echo ""
  sleep 2
done

echo ""
echo "=== INTERVIEW INTEGRATION: PASS ==="
echo "All 3 turns completed successfully with real Groq!"
