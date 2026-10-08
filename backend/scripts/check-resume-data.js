/**
 * Query database to check resume data for test students
 * READ-ONLY inspection script
 */

const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function checkResumeData() {
  const client = await pool.connect();

  try {
    console.log('📊 BACKEND RESUME STORAGE INSPECTION\n');
    console.log('═'.repeat(80));

    // 1. Check org.students table schema
    console.log('\n1. DATABASE SCHEMA - org.students table:\n');
    const { rows: schemaInfo } = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'org' AND table_name = 'students'
      AND column_name IN ('resume_url', 'resume_verified', 'parsed_resume', 'resume_data')
      ORDER BY ordinal_position
    `);
    console.table(schemaInfo);

    // 2. Check if parsed_resume column exists
    const { rows: parsedResumeExists } = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'org' AND table_name = 'students' AND column_name = 'parsed_resume'
      ) as exists
    `);
    console.log('\n✅ Column "parsed_resume" exists:', parsedResumeExists[0].exists);

    const { rows: resumeDataExists } = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'org' AND table_name = 'students' AND column_name = 'resume_data'
      ) as exists
    `);
    console.log('⚠️  Column "resume_data" exists:', resumeDataExists[0].exists, '(expected in migration 119)');

    // 3. Find test students
    console.log('\n\n2. TEST STUDENTS DATA:\n');
    const { rows: testStudents } = await client.query(`
      SELECT
        s.id,
        u.email,
        u.name,
        s.resume_url,
        s.resume_verified,
        CASE
          WHEN s.parsed_resume IS NULL THEN 'NULL'
          ELSE jsonb_typeof(s.parsed_resume)
        END as parsed_resume_type,
        CASE
          WHEN s.parsed_resume IS NULL THEN 0
          ELSE (SELECT count(*) FROM jsonb_object_keys(s.parsed_resume))
        END as parsed_resume_keys
      FROM org.students s
      JOIN identity.users u ON u.id = s.user_id
      WHERE u.email LIKE 'student.test%@example.com'
         OR u.email LIKE 'student.real%@example.com'
      ORDER BY u.email
    `);

    if (testStudents.length === 0) {
      console.log('⚠️  No test students found with pattern student.test* or student.real*');
    } else {
      console.table(testStudents.map(s => ({
        email: s.email,
        name: s.name,
        has_resume_url: s.resume_url ? '✅ Yes' : '❌ No',
        resume_verified: s.resume_verified ? '✅ Yes' : '❌ No',
        parsed_resume_type: s.parsed_resume_type,
        parsed_keys: s.parsed_resume_keys,
      })));
    }

    // 4. Check all students with resume data
    console.log('\n\n3. ALL STUDENTS WITH RESUME DATA:\n');
    const { rows: studentsWithResumes } = await client.query(`
      SELECT
        u.email,
        s.resume_url IS NOT NULL as has_url,
        s.resume_verified,
        s.parsed_resume IS NOT NULL as has_parsed_data
      FROM org.students s
      JOIN identity.users u ON u.id = s.user_id
      WHERE s.resume_url IS NOT NULL OR s.parsed_resume IS NOT NULL
      LIMIT 10
    `);

    if (studentsWithResumes.length === 0) {
      console.log('❌ No students have resume data yet');
    } else {
      console.table(studentsWithResumes);
    }

    // 5. Check org.resumes table (if it exists)
    console.log('\n\n4. CHECKING org.resumes TABLE:\n');
    const { rows: resumesTableExists } = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'org' AND table_name = 'resumes'
      ) as exists
    `);

    if (resumesTableExists[0].exists) {
      console.log('✅ org.resumes table exists');
      const { rows: resumesCount } = await client.query(`
        SELECT COUNT(*) as count FROM org.resumes
      `);
      console.log(`   Records in org.resumes: ${resumesCount[0].count}`);
    } else {
      console.log('❌ org.resumes table does NOT exist (planned but not implemented)');
    }

    console.log('\n' + '═'.repeat(80));
    console.log('\n✅ Inspection complete\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

checkResumeData();
