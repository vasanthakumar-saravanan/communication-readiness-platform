/**
 * Reset test student accounts by deleting and recreating them
 * Run with: node scripts/reset-test-students.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const testEmails = [
  'student.test01@example.com',
  'student.test02@example.com',
  'student.test03@example.com'
];

const testStudents = [
  { name: 'Test Student One', email: 'student.test01@example.com', password: 'Test@123456' },
  { name: 'Test Student Two', email: 'student.test02@example.com', password: 'Test@123456' },
  { name: 'Test Student Three', email: 'student.test03@example.com', password: 'Test@123456' },
];

async function resetTestStudents() {
  const client = await pool.connect();

  try {
    console.log('🔍 Checking database connection...');
    const { rows: dbCheck } = await client.query('SELECT current_database()');
    console.log('✅ Connected to database:', dbCheck[0].current_database);

    console.log('\n🔍 Finding available batch...');
    const { rows: batches } = await client.query(
      'SELECT id, program_id, name FROM org.batches LIMIT 1'
    );

    if (batches.length === 0) {
      throw new Error('No batches found. Please create a batch first.');
    }

    const batch = batches[0];
    console.log(`✅ Using batch: ${batch.name || batch.id}`);

    // Delete existing test accounts
    console.log('\n🗑️  Deleting existing test accounts...\n');
    for (const email of testEmails) {
      try {
        const { rows: userRows } = await client.query(
          'SELECT id FROM identity.users WHERE email = $1',
          [email]
        );

        if (userRows.length > 0) {
          const userId = userRows[0].id;

          await client.query('BEGIN');

          // Delete from org.students first (FK constraint)
          await client.query('DELETE FROM org.students WHERE user_id = $1', [userId]);

          // Delete from identity.users
          await client.query('DELETE FROM identity.users WHERE id = $1', [userId]);

          await client.query('COMMIT');
          console.log(`✅ Deleted: ${email}`);
        } else {
          console.log(`⚠️  Not found: ${email}`);
        }
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Failed to delete ${email}:`, err.message);
      }
    }

    // Create new test accounts
    console.log('\n👤 Creating test students...\n');

    for (const student of testStudents) {
      try {
        await client.query('BEGIN');

        const passwordHash = await bcrypt.hash(student.password, 10);
        const { rows: userRows } = await client.query(
          `INSERT INTO identity.users (name, email, password_hash, role, token_version, status)
           VALUES ($1, $2, $3, 'STUDENT', 0, 'ACTIVE')
           RETURNING id`,
          [student.name, student.email, passwordHash]
        );
        const userId = userRows[0].id;

        const rollNumber = `STU-${Date.now()}-${Math.floor(Math.random() * 9000) + 1000}`;
        const { rows: studentRows } = await client.query(
          `INSERT INTO org.students (user_id, roll_number, batch_id)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [userId, rollNumber, batch.id]
        );
        const studentId = studentRows[0].id;

        await client.query('COMMIT');

        console.log(`✅ Created: ${student.email}`);
        console.log(`   User ID: ${userId}`);
        console.log(`   Student ID: ${studentId}`);
        console.log(`   Roll Number: ${rollNumber}\n`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`❌ Failed to create ${student.email}:`, err.message);
      }
    }

    console.log('\n✅ Test student reset complete!\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetTestStudents();
