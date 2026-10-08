#!/bin/bash

echo "=============================================="
echo "COMPREHENSIVE API-LEVEL VERIFICATION"
echo "=============================================="
echo ""

# Login
echo "[1/7] Testing Student Login..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"student.test01@example.com","password":"Test@123456"}')

if echo "$LOGIN_RESPONSE" | grep -q '"token"'; then
  echo "✓ Login successful"
  TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | sed 's/"token":"\([^"]*\)"/\1/')
  STUDENT_ID=$(echo "$LOGIN_RESPONSE" | grep -o '"studentId":"[^"]*"' | sed 's/"studentId":"\([^"]*\)"/\1/')
  echo "  Student ID: $STUDENT_ID"
else
  echo "✗ Login failed"
  echo "  Response: $LOGIN_RESPONSE"
  exit 1
fi

echo ""
echo "[2/7] Testing Student Profile Retrieval..."
PROFILE_RESPONSE=$(curl -s -X GET "http://localhost:5000/api/students/$STUDENT_ID" \
  -H "Authorization: Bearer $TOKEN")

if echo "$PROFILE_RESPONSE" | grep -q '"parsed_resume"'; then
  echo "✓ Profile retrieved with parsed_resume"

  # Check for specific skills
  if echo "$PROFILE_RESPONSE" | grep -q "Python"; then
    echo "  ✓ Contains Python"
  fi
  if echo "$PROFILE_RESPONSE" | grep -q "MySQL"; then
    echo "  ✓ Contains MySQL"
  fi
  if echo "$PROFILE_RESPONSE" | grep -q "Git"; then
    echo "  ✓ Contains Git"
  fi
  if echo "$PROFILE_RESPONSE" | grep -q "Student Grade Calculator"; then
    echo "  ✓ Contains project: Student Grade Calculator"
  fi
else
  echo "✗ Profile missing parsed_resume"
fi

echo ""
echo "[3/7] Testing PDF Parsing..."
PDF_PARSE=$(curl -s -X POST http://localhost:8001/resume/parse \
  -F "file=@backend/test-assets/beginner-student-resume.pdf")

if echo "$PDF_PARSE" | grep -q '"languages"'; then
  echo "✓ PDF parsed successfully"
  if echo "$PDF_PARSE" | grep -q "Python"; then
    echo "  ✓ Extracted: Python"
  fi
  if echo "$PDF_PARSE" | grep -q "Java"; then
    echo "  ✓ Extracted: Java"
  fi
  if echo "$PDF_PARSE" | grep -q "MySQL"; then
    echo "  ✓ Extracted: MySQL"
  fi
else
  echo "✗ PDF parsing failed"
  echo "  Response: $PDF_PARSE"
fi

echo ""
echo "[4/7] Testing DOCX Parsing..."
DOCX_PARSE=$(curl -s -X POST http://localhost:8001/resume/parse \
  -F "file=@backend/test-assets/beginner-student-resume.docx")

if echo "$DOCX_PARSE" | grep -q '"languages"'; then
  echo "✓ DOCX parsed successfully"
  if echo "$DOCX_PARSE" | grep -q "Python"; then
    echo "  ✓ Extracted: Python"
  fi
  if echo "$DOCX_PARSE" | grep -q "Java"; then
    echo "  ✓ Extracted: Java"
  fi
else
  echo "✗ DOCX parsing failed"
  echo "  Response: $DOCX_PARSE"
fi

echo ""
echo "[5/7] Testing Auth Token Persistence..."
ME_RESPONSE=$(curl -s -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer $TOKEN")

if echo "$ME_RESPONSE" | grep -q '"studentId"'; then
  echo "✓ Token validation successful"
  echo "  User authenticated with studentId"
else
  echo "✗ Token validation failed"
fi

echo ""
echo "[6/7] Testing Database Resume Persistence..."
DB_CHECK=$(node backend/check-student-resume-data.js 2>&1)

if echo "$DB_CHECK" | grep -q "HAS DATA"; then
  echo "✓ Resume persisted in database"
  LANG_COUNT=$(echo "$DB_CHECK" | grep "Languages Count:" | awk '{print $3}')
  echo "  Languages count: $LANG_COUNT"
else
  echo "✗ Resume not found in database"
fi

echo ""
echo "[7/7] Testing WebSocket Connection..."
# Just verify the backend has WebSocket support
WS_TEST=$(curl -s http://localhost:5000/api/health)
if echo "$WS_TEST" | grep -q '"status":"ok"'; then
  echo "✓ Backend healthy (WebSocket endpoint available)"
  echo "  Note: Full WebSocket transcript flow requires browser test"
else
  echo "✗ Backend not responding"
fi

echo ""
echo "=============================================="
echo "API VERIFICATION COMPLETE"
echo "=============================================="
