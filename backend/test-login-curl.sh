#!/bin/bash

echo "========================================"
echo "Testing Student Login Flow"
echo "========================================"

echo ""
echo "[1/3] Login with student.test01@example.com..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student.test01@example.com","password":"Test@123456"}')

echo "$LOGIN_RESPONSE"

# Extract token if login succeeded
if echo "$LOGIN_RESPONSE" | grep -q '"token"'; then
  echo "✅ Login response received"
  TOKEN=$(echo "$LOGIN_RESPONSE" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')
  STUDENT_ID=$(echo "$LOGIN_RESPONSE" | sed -n 's/.*"studentId":"\([^"]*\)".*/\1/p')
  
  echo ""
  echo "[2/3] Testing /auth/me with token..."
  curl -s -X GET http://localhost:5000/api/auth/me \
    -H "Authorization: Bearer $TOKEN"
  
  if [ -n "$STUDENT_ID" ]; then
    echo ""
    echo ""
    echo "[3/3] Testing /students/$STUDENT_ID with token..."
    curl -s -X GET "http://localhost:5000/api/students/$STUDENT_ID" \
      -H "Authorization: Bearer $TOKEN"
    echo ""
  fi
else
  echo "❌ Login failed"
fi
