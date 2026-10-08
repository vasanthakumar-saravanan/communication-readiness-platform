require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const possiblePasswords = [
  'Test@123456',
  'test123',
  'password123',
  'Password123',
  'student123',
  'Student@123'
];

async function testAllPasswords() {
  try {
    const { rows } = await pool.query(`
      SELECT email, password_hash
      FROM identity.users
      WHERE email IN ('student.test01@example.com', 'student.test02@example.com', 'student.test03@example.com')
      ORDER BY email
    `);

    console.log('Testing passwords for student accounts...\n');

    for (const user of rows) {
      console.log(`${user.email}:`);
      for (const pwd of possiblePasswords) {
        const isValid = await bcrypt.compare(pwd, user.password_hash);
        if (isValid) {
          console.log(`  ✅ WORKS: '${pwd}'`);
          break;
        }
      }
      console.log();
    }

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

testAllPasswords();
