require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function findWorkingAccounts() {
  try {
    console.log('Finding all active user accounts...\n');

    const { rows } = await pool.query(`
      SELECT
        email,
        role,
        status,
        created_at
      FROM identity.users
      WHERE status = 'ACTIVE'
      ORDER BY created_at DESC
      LIMIT 30
    `);

    console.log('Recent active accounts:');
    console.log('━'.repeat(80));
    rows.forEach(row => {
      const date = new Date(row.created_at).toLocaleDateString();
      console.log(`${row.email.padEnd(45)} ${row.role.padEnd(20)} ${date}`);
    });
    console.log('━'.repeat(80));
    console.log(`\nTotal: ${rows.length} accounts\n`);

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

findWorkingAccounts();
