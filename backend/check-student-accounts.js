require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkStudentAccounts() {
  try {
    console.log('Checking STUDENT accounts...\n');

    const students = await pool.query(`
      SELECT
        u.id as user_id,
        u.email,
        u.role,
        u.status as is_active,
        CASE WHEN s.user_id IS NOT NULL THEN 'YES' ELSE 'NO' END as has_student_record
      FROM identity.users u
      LEFT JOIN org.students s ON u.id = s.user_id
      WHERE u.role = 'STUDENT'
      ORDER BY u.created_at
    `);

    console.log('=== STUDENT ACCOUNTS ===\n');
    students.rows.forEach((row, i) => {
      console.log(`Student ${i + 1}:`);
      console.log(`  Email: ${row.email}`);
      console.log(`  Role: ${row.role}`);
      console.log(`  Active: ${row.is_active}`);
      console.log(`  Has org.students record: ${row.has_student_record}`);
      console.log();
    });

    console.log(`Total: ${students.rows.length} student accounts\n`);

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkStudentAccounts();
