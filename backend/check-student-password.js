require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkStudentPassword() {
  try {
    console.log('Checking student.test01@example.com...\n');

    const { rows } = await pool.query(`
      SELECT
        id,
        email,
        role,
        status,
        LENGTH(password_hash) as hash_length,
        SUBSTRING(password_hash, 1, 7) as hash_prefix
      FROM identity.users
      WHERE email = $1
    `, ['student.test01@example.com']);

    if (rows.length === 0) {
      console.log('❌ User not found');
      await pool.end();
      return;
    }

    const user = rows[0];
    console.log('User found:');
    console.log(`  ID: ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Role: ${user.role}`);
    console.log(`  Status: ${user.status}`);
    console.log(`  Password hash length: ${user.hash_length}`);
    console.log(`  Password hash prefix: ${user.hash_prefix}`);
    console.log();

    // Get the full hash to test
    const { rows: fullRows } = await pool.query(
      'SELECT password_hash FROM identity.users WHERE email = $1',
      ['student.test01@example.com']
    );

    const testPassword = 'Test@123456';
    const isValid = await bcrypt.compare(testPassword, fullRows[0].password_hash);

    console.log(`Password test for '${testPassword}': ${isValid ? '✅ VALID' : '❌ INVALID'}`);
    console.log();

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkStudentPassword();
