#!/bin/bash

echo "Testing Resume Upload for student.test01@example.com"
echo "===================================================="

# Step 1: Login
echo ""
echo "[1/3] Logging in..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student.test01@example.com","password":"Test@123456"}')

if ! echo "$LOGIN_RESPONSE" | grep -q '"token"'; then
  echo "❌ Login failed"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | sed 's/"token":"\([^"]*\)"/\1/')
STUDENT_ID=$(echo "$LOGIN_RESPONSE" | grep -o '"studentId":"[^"]*"' | sed 's/"studentId":"\([^"]*\)"/\1/')

echo "✅ Login successful"
echo "   Student ID: $STUDENT_ID"

# Step 2: Upload resume
echo ""
echo "[2/3] Uploading resume PDF..."
UPLOAD_RESPONSE=$(curl -s -X PATCH "http://localhost:5000/api/students/$STUDENT_ID/resume" \
  -H "Authorization: Bearer $TOKEN" \
  -F "resume=@test-assets/beginner-student-resume.pdf")

echo "$UPLOAD_RESPONSE" | python -m json.tool 2>/dev/null || echo "$UPLOAD_RESPONSE"

if echo "$UPLOAD_RESPONSE" | grep -q '"languages"'; then
  echo ""
  echo "✅ Resume uploaded and parsed successfully"
else
  echo ""
  echo "⚠️  Resume uploaded but parsing may have failed"
fi

# Step 3: Verify in database
echo ""
echo "[3/3] Verifying database..."
node check-student-resume-data.js

echo ""
echo "===================================================="
echo "Done!"
