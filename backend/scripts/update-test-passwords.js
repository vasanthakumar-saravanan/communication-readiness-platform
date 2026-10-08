/**
 * Update passwords for existing test student accounts
 * Run with: node scripts/update-test-passwords.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const testAccounts = [
  { email: 'student.test01@example.com', password: 'Test@123456' },
  { email: 'student.test02@example.com', password: 'Test@123456' },
  { email: 'student.test03@example.com', password: 'Test@123456' },
];

async function updateTestPasswords() {
  const client = await pool.connect();

  try {
    console.log('🔍 Updating test account passwords...\n');

    for (const account of testAccounts) {
      try {
        const { rows: userRows } = await client.query(
          'SELECT id FROM identity.users WHERE email = $1',
          [account.email]
        );

        if (userRows.length === 0) {
          console.log(`⚠️  Not found: ${account.email}`);
          continue;
        }

        const userId = userRows[0].id;
        const passwordHash = await bcrypt.hash(account.password, 10);

        await client.query(
          'UPDATE identity.users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2',
          [passwordHash, userId]
        );

        console.log(`✅ Updated: ${account.email}`);

      } catch (err) {
        console.error(`❌ Failed to update ${account.email}:`, err.message);
      }
    }

    console.log('\n✅ Password update complete!\n');

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

updateTestPasswords();
