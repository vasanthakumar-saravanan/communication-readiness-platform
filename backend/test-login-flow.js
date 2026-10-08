/**
 * Test the complete login flow:
 * 1. Login
 * 2. Fetch profile
 * 3. Verify token works
 */

const fetch = require('node-fetch');

const API_URL = 'http://localhost:5000/api';

async function testLoginFlow(email, password) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${email}`);
  console.log('='.repeat(60));

  try {
    // Step 1: Login
    console.log('\n[1/3] Attempting login...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!loginRes.ok) {
      const error = await loginRes.json();
      console.log(`❌ Login failed: ${error.message}`);
      return false;
    }

    const loginData = await loginRes.json();
    const token = loginData.data.token;
    const user = loginData.data.user;
    const studentId = loginData.data.studentId;

    console.log(`✅ Login successful`);
    console.log(`   Role: ${user.role}`);
    console.log(`   User ID: ${user.id}`);
    if (studentId) console.log(`   Student ID: ${studentId}`);

    // Step 2: Fetch /auth/me
    console.log('\n[2/3] Verifying token with /auth/me...');
    const meRes = await fetch(`${API_URL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!meRes.ok) {
      const error = await meRes.json();
      console.log(`❌ /auth/me failed: ${error.message}`);
      return false;
    }

    console.log(`✅ /auth/me successful`);

    // Step 3: Fetch student profile if role is STUDENT
    if (user.role === 'STUDENT' && studentId) {
      console.log('\n[3/3] Fetching student profile...');
      const profileRes = await fetch(`${API_URL}/students/${studentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!profileRes.ok) {
        const error = await profileRes.json();
        console.log(`❌ Profile fetch failed: ${error.message}`);
        return false;
      }

      const profileData = await profileRes.json();
      console.log(`✅ Profile fetch successful`);
      console.log(`   Student email: ${profileData.data.student.email}`);
    } else {
      console.log('\n[3/3] Skipping profile fetch (not a student)');
    }

    console.log('\n✅ COMPLETE LOGIN FLOW SUCCESSFUL\n');
    return true;

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    return false;
  }
}

// Test with the documented test account
testLoginFlow('student.test01@example.com', 'Test@123456')
  .then(success => process.exit(success ? 0 : 1));
