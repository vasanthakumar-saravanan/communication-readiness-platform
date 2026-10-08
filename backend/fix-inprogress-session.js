const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres.nkpdhoeluselsrfuqhai:TamilVasanth12345@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres'
});

async function fixSession() {
  try {
    // Mark all IN_PROGRESS sessions for student.real01 as ABANDONED
    const { rows: students } = await pool.query(`
      SELECT s.id
      FROM org.students s
      JOIN identity.users u ON u.id = s.user_id
      WHERE u.email = 'student.real01@example.com'
    `);

    if (students.length === 0) {
      console.log('❌ Student not found');
      await pool.end();
      return;
    }

    const studentId = students[0].id;

    // Update all IN_PROGRESS attempts to ABANDONED
    const { rowCount } = await pool.query(`
      UPDATE assessment.assessment_attempts
      SET status = 'ABANDONED', completed_at = now()
      WHERE student_id = $1 AND status = 'IN_PROGRESS'
    `, [studentId]);

    console.log(`✅ Marked ${rowCount} IN_PROGRESS session(s) as ABANDONED for student.real01@example.com`);
    console.log('✅ Student can now start a fresh interview session');

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

fixSession();
