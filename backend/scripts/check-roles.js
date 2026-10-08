require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  const { rows } = await pool.query(
    `SELECT email, role, status FROM identity.users WHERE role NOT IN ('STUDENT') ORDER BY role, email LIMIT 20`
  );
  rows.forEach(r => console.log(`${r.role}: ${r.email} (${r.status})`));
  await pool.end();
}
check().catch(e => { console.error(e.message); process.exit(1); });
