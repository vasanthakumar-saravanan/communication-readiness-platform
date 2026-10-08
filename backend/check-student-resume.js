const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.nkpdhoeluselsrfuqhai:TamilVasanth12345@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'
});

async function checkStudent() {
  try {
    // Find student.real01
    const { rows: students } = await pool.query(`
      SELECT s.id, s.user_id, s.parsed_resume, u.email
      FROM org.students s
      JOIN identity.users u ON u.id = s.user_id
      WHERE u.email = 'student.real01@example.com'
    `);

    if (students.length === 0) {
      console.log('❌ Student student.real01@example.com not found');
      await pool.end();
      return;
    }

    const student = students[0];
    console.log('=== AUTHENTICATED STUDENT ===');
    console.log('Student ID:', student.id);
    console.log('Email:', student.email);
    console.log('');

    console.log('=== PARSED RESUME ===');
    if (!student.parsed_resume) {
      console.log('❌ No parsed_resume found');
    } else {
      console.log('Skills:', JSON.stringify(student.parsed_resume.skills || {}, null, 2));
      console.log('');
      console.log('Resume Text (first 500 chars):');
      const text = student.parsed_resume.text || '';
      console.log(text.substring(0, 500));
      console.log('');

      // Check for advanced keywords
      const advancedKeywords = ['kafka', 'rabbitmq', 'microservices', 'kubernetes', 'docker', 'ci/cd', 'distributed systems'];
      const foundAdvanced = advancedKeywords.filter(kw =>
        text.toLowerCase().includes(kw) ||
        JSON.stringify(student.parsed_resume).toLowerCase().includes(kw)
      );

      if (foundAdvanced.length > 0) {
        console.log('⚠️  FOUND ADVANCED KEYWORDS IN RESUME:', foundAdvanced.join(', '));
      } else {
        console.log('✅ No advanced keywords found in resume');
      }
    }

    // Check for any IN_PROGRESS sessions
    console.log('\n=== RECENT ASSESSMENT ATTEMPTS ===');
    const { rows: attempts } = await pool.query(`
      SELECT aa.id as attempt_id, aa.status, aa.started_at,
             ss.id as session_id, ss.state, ss.current_sequence_no
      FROM assessment.assessment_attempts aa
      LEFT JOIN session.assessment_sessions ss ON ss.attempt_id = aa.id
      WHERE aa.student_id = $1
      ORDER BY aa.started_at DESC
      LIMIT 3
    `, [student.id]);

    if (attempts.length === 0) {
      console.log('No assessment attempts found');
    } else {
      attempts.forEach((att, i) => {
        console.log(`\nAttempt ${i + 1}:`);
        console.log('  Attempt ID:', att.attempt_id);
        console.log('  Status:', att.status);
        console.log('  Session ID:', att.session_id);
        console.log('  Current Sequence:', att.current_sequence_no);
        console.log('  Started:', att.started_at);
      });

      const inProgress = attempts.filter(a => a.status === 'IN_PROGRESS');
      if (inProgress.length > 0) {
        console.log('\n⚠️  FOUND IN_PROGRESS SESSION(S)');
        console.log('This student will RESUME existing session, not start a new one!');
      } else {
        console.log('\n✅ No IN_PROGRESS sessions - will create new session');
      }
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
  } finally {
    await pool.end();
  }
}

checkStudent();
