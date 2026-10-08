require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkStudentResume() {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.email,
        s.id as student_id,
        s.resume_url,
        s.resume_verified,
        CASE
          WHEN s.parsed_resume IS NULL THEN 'NULL'
          WHEN s.parsed_resume::text = '{}' THEN 'EMPTY OBJECT'
          ELSE 'HAS DATA'
        END as parsed_resume_status,
        CASE
          WHEN s.parsed_resume IS NOT NULL AND s.parsed_resume::text != '{}'
          THEN jsonb_array_length(COALESCE(s.parsed_resume->'skills'->'languages', '[]'::jsonb))
          ELSE 0
        END as languages_count
      FROM org.students s
      JOIN identity.users u ON u.id = s.user_id
      WHERE u.email = 'student.test01@example.com'
    `);

    if (rows.length === 0) {
      console.log('Student not found');
      await pool.end();
      return;
    }

    const student = rows[0];
    console.log('Student Resume Status:');
    console.log('  Email:', student.email);
    console.log('  Student ID:', student.student_id);
    console.log('  Resume URL:', student.resume_url || 'NOT UPLOADED');
    console.log('  Resume Verified:', student.resume_verified);
    console.log('  Parsed Resume:', student.parsed_resume_status);
    console.log('  Languages Count:', student.languages_count);

    if (student.parsed_resume_status === 'HAS DATA') {
      const { rows: detailRows } = await pool.query(`
        SELECT parsed_resume
        FROM org.students
        WHERE id = $1
      `, [student.student_id]);

      console.log('\nParsed Resume Data:');
      console.log(JSON.stringify(detailRows[0].parsed_resume, null, 2));
    }

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkStudentResume();
