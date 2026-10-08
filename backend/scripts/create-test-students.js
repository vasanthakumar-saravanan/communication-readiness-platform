/**
 * Creates test student accounts for frontend testing
 * Run with: node scripts/create-test-students.js
 *
 * Prerequisites:
 * 1. DATABASE_URL must be set in backend/.env with valid Supabase connection
 * 2. Database migrations must be applied
 * 3. At least one batch must exist in org.batches table
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');

// Load .env from backend directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const testStudents = [
  {
    name: 'Test Student One',
    email: 'student.test01@example.com',
    password: 'Test@123456',
  },
  {
    name: 'Test Student Two',
    email: 'student.test02@example.com',
    password: 'Test@123456',
  },
  {
    name: 'Test Student Three',
    email: 'student.test03@example.com',
    password: 'Test@123456',
  },
];

async function createTestStudents() {
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

    console.log('\n👤 Creating test students...\n');

    for (const student of testStudents) {
      try {
        // Check if user already exists
        const { rows: existing } = await client.query(
          'SELECT id FROM identity.users WHERE email = $1',
          [student.email]
        );

        if (existing.length > 0) {
          console.log(`⚠️  ${student.email} already exists - skipping`);
          continue;
        }

        await client.query('BEGIN');

        // Create user
        const passwordHash = await bcrypt.hash(student.password, 10);
        const { rows: userRows } = await client.query(
          `INSERT INTO identity.users (name, email, password_hash, role, token_version, status)
           VALUES ($1, $2, $3, 'STUDENT', 0, 'ACTIVE')
           RETURNING id`,
          [student.name, student.email, passwordHash]
        );
        const userId = userRows[0].id;

        // Create student record (no program_id column, it's obtained from batch)
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

    console.log('\n✅ Test student creation complete!\n');
    console.log('📋 Test Credentials:');
    console.log('━'.repeat(60));
    testStudents.forEach((s, i) => {
      console.log(`\nStudent ${i + 1}:`);
      console.log(`  Email: ${s.email}`);
      console.log(`  Password: ${s.password}`);
    });
    console.log('\n━'.repeat(60));
    console.log('\n🚀 You can now login with these credentials at http://localhost:5173\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

createTestStudents();
