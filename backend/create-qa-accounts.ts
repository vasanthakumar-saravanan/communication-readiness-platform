import { Client } from 'pg';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';

dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });
const timestamp = Date.now();

const studentPassword = 'QAStudent' + Math.random().toString(36).substring(2, 10) + '@2026';
const facultyPassword = 'QAFaculty' + Math.random().toString(36).substring(2, 10) + '@2026';

(async () => {
  try {
    await client.connect();
    await client.query('BEGIN');

    // Create QA Student
    const studentEmail = `qa.interview.student.${timestamp}@test.local`;
    const hashedStudentPass = await bcrypt.hash(studentPassword, 10);

    const studentUser = await client.query(`
      INSERT INTO identity.users (email, password_hash, name, role, status)
      VALUES ($1, $2, $3, 'STUDENT', 'ACTIVE')
      RETURNING id
    `, [studentEmail, hashedStudentPass, 'QA Interview Student ' + timestamp]);

    const studentUserId = studentUser.rows[0].id;

    // Get an active institution, program, and batch
    const inst = await client.query('SELECT id FROM org.institutions WHERE is_active = true ORDER BY created_at LIMIT 1');
    if (inst.rows.length === 0) throw new Error('No active institution found');
    const institutionId = inst.rows[0].id;

    const prog = await client.query('SELECT id FROM org.programs WHERE institution_id = $1 AND is_active = true ORDER BY created_at LIMIT 1', [institutionId]);
    if (prog.rows.length === 0) throw new Error('No active program found');
    const programId = prog.rows[0].id;

    const batch = await client.query('SELECT id FROM org.batches WHERE program_id = $1 AND is_active = true ORDER BY created_at LIMIT 1', [programId]);
    if (batch.rows.length === 0) throw new Error('No active batch found');
    const batchId = batch.rows[0].id;

    // Create student profile
    const student = await client.query(`
      INSERT INTO org.students (user_id, batch_id, program_id, subdivision_id, coding_handles, resume_verified)
      VALUES ($1, $2, $3, NULL, '{}', false)
      RETURNING id
    `, [studentUserId, batchId, programId]);

    const studentId = student.rows[0].id;

    // Create performance profile for the student
    await client.query(`
      INSERT INTO performance.performance_profiles (student_id)
      VALUES ($1)
      ON CONFLICT (student_id) DO NOTHING
    `, [studentId]);

    // Create credit account
    await client.query(`
      INSERT INTO credit.credit_accounts (student_id, balance)
      VALUES ($1, 100)
      ON CONFLICT (student_id) DO NOTHING
    `, [studentId]);

    // Create QA Faculty
    const facultyEmail = `qa.interview.faculty.${timestamp}@test.local`;
    const hashedFacultyPass = await bcrypt.hash(facultyPassword, 10);

    const facultyUser = await client.query(`
      INSERT INTO identity.users (email, password_hash, name, role, status)
      VALUES ($1, $2, $3, 'FACULTY_MENTOR', 'ACTIVE')
      RETURNING id
    `, [facultyEmail, hashedFacultyPass, 'QA Interview Faculty ' + timestamp]);

    const facultyUserId = facultyUser.rows[0].id;

    // Create faculty profile (minimal fields - department is nullable)
    await client.query(`
      INSERT INTO org.faculty_profiles (user_id, department, designation)
      VALUES ($1, 'Testing & QA', 'QA Mentor')
    `, [facultyUserId]);

    await client.query('COMMIT');

    console.log('\n=== QA ACCOUNTS CREATED SUCCESSFULLY ===\n');
    console.log('STUDENT ACCOUNT:');
    console.log('  User ID:', studentUserId);
    console.log('  Student ID:', studentId);
    console.log('  Email:', studentEmail);
    console.log('  Password:', studentPassword);
    console.log('  Role: STUDENT');
    console.log('  Status: ACTIVE');
    console.log('  Initial Coins: 100');
    console.log('');
    console.log('FACULTY ACCOUNT:');
    console.log('  User ID:', facultyUserId);
    console.log('  Email:', facultyEmail);
    console.log('  Password:', facultyPassword);
    console.log('  Role: FACULTY_MENTOR');
    console.log('  Status: ACTIVE');
    console.log('');
    console.log('NOTE: These are disposable test credentials.');
    console.log('DO NOT commit these to git.');

    await client.end();
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('✗ QA account creation failed:', err);
    await client.end();
    process.exit(1);
  }
})();
