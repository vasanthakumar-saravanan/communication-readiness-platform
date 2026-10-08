const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'crp',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function checkUsers() {
  try {
    console.log('Checking database users...\n');

    const allUsers = await pool.query(
      'SELECT id, name, email, role, status FROM identity.users ORDER BY created_at DESC LIMIT 20'
    );

    console.log('=== All Users (last 20) ===');
    console.table(allUsers.rows);

    const students = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, s.roll_number, s.batch_id
       FROM identity.users u
       LEFT JOIN org.students s ON s.user_id = u.id
       WHERE u.role = 'STUDENT'
       LIMIT 10`
    );

    console.log('\n=== Student Users ===');
    console.table(students.rows);

    const studentRealCheck = await pool.query(
      `SELECT id, name, email, role, status FROM identity.users WHERE email = $1`,
      ['student.real01@example.com']
    );

    console.log('\n=== student.real01@example.com check ===');
    if (studentRealCheck.rows.length > 0) {
      console.table(studentRealCheck.rows);
    } else {
      console.log('⚠️  student.real01@example.com NOT FOUND in database');
    }

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkUsers();
