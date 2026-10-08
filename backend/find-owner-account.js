require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function findOwnerAccount() {
  try {
    const { rows } = await pool.query(`
      SELECT email, role, status
      FROM identity.users
      WHERE role = 'PLATFORM_OWNER' AND status = 'ACTIVE'
      LIMIT 5
    `);

    console.log('Platform Owner accounts:');
    rows.forEach(row => {
      console.log(`  ${row.email} (${row.status})`);
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

findOwnerAccount();
