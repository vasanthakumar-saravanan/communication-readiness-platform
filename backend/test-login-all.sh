#!/bin/bash

echo "Testing Student Login + Profile Flow"
echo "====================================="

test_student() {
  local email=$1
  local num=$2
  
  echo ""
  echo "[$num/3] Testing $email..."
  
  LOGIN_RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"Test@123456\"}")
  
  if echo "$LOGIN_RESPONSE" | grep -q '"token"'; then
    echo "  ✅ Login successful"
    
    TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | sed 's/"token":"\([^"]*\)"/\1/')
    STUDENT_ID=$(echo "$LOGIN_RESPONSE" | grep -o '"studentId":"[^"]*"' | sed 's/"studentId":"\([^"]*\)"/\1/')
    
    if [ "$num" = "1" ] && [ -n "$STUDENT_ID" ]; then
      echo "  Testing profile fetch..."
      PROFILE_RESPONSE=$(curl -s -X GET "http://localhost:5000/api/students/$STUDENT_ID" \
        -H "Authorization: Bearer $TOKEN")
      
      if echo "$PROFILE_RESPONSE" | grep -q '"student"'; then
        echo "  ✅ Profile fetch successful"
        return 0
      else
        echo "  ❌ Profile fetch failed"
        echo "  Response: $PROFILE_RESPONSE"
        return 1
      fi
    fi
    return 0
  else
    echo "  ❌ Login failed"
    echo "  Response: $LOGIN_RESPONSE"
    return 1
  fi
}

test_student "student.test01@example.com" "1"
TEST1=$?

test_student "student.test02@example.com" "2"
TEST2=$?

test_student "student.test03@example.com" "3"
TEST3=$?

echo ""
echo "====================================="
echo "Results:"
[ $TEST1 -eq 0 ] && echo "✅ Student 1: PASS" || echo "❌ Student 1: FAIL"
[ $TEST2 -eq 0 ] && echo "✅ Student 2: PASS" || echo "❌ Student 2: FAIL"
[ $TEST3 -eq 0 ] && echo "✅ Student 3: PASS" || echo "❌ Student 3: FAIL"
echo "====================================="

exit $(($TEST1 + $TEST2 + $TEST3))
