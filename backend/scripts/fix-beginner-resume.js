/**
 * Fix test student resumes — replace DevOps/advanced profiles with
 * a realistic first-year B.Tech IT/CS beginner profile.
 *
 * Run from backend/ dir: node scripts/fix-beginner-resume.js
 */
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BEGINNER_RESUME = (name) => ({
  name,
  profile: 'First-Year B.Tech IT/CS Student',
  education: 'B.Tech Information Technology, Year 1',
  skills: {
    languages: ['Java', 'Python', 'C'],
    fundamentals: [
      'Variables', 'Data Types', 'Loops', 'Conditions',
      'Functions', 'Arrays', 'Strings', 'Basic OOP',
    ],
    cs_fundamentals: [
      'Basic DBMS', 'Basic SQL',
      'Basic Computer Networks', 'Basic Operating Systems',
    ],
    frameworks: [],
  },
  projects: [
    {
      title: 'Student Grade Calculator',
      tech_stack: ['Java'],
      description: 'Console app to calculate and display student grades using conditional logic',
    },
    {
      title: 'Simple To-Do List',
      tech_stack: ['Python'],
      description: 'Basic task manager using Python lists and functions',
    },
    {
      title: 'Basic Student Management System',
      tech_stack: ['C'],
      description: 'CRUD operations for student records using arrays and structs',
    },
  ],
  experience_years: 0,
  level: 'BEGINNER',
});

const TARGET_EMAILS = [
  'student.real03@example.com',
  'logesh.sekar@testuniversity.edu',
  'aravind.kumar@testuniversity.edu',
  'deepika.rajan@testuniversity.edu',
  'nithya.priya@testuniversity.edu',
  'ranjith.selvan@testuniversity.edu',
  'sowmya.kannan@testuniversity.edu',
  'thilaga.veni@testuniversity.edu',
  'vasanth.raj@testuniversity.edu',
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const email of TARGET_EMAILS) {
      const { rows } = await client.query(
        `SELECT u.name, s.id as student_id
         FROM org.students s
         JOIN identity.users u ON u.id = s.user_id
         WHERE u.email = $1`,
        [email],
      );

      if (rows.length === 0) {
        console.log(`[skip]   ${email} — student record not found`);
        continue;
      }

      const { name, student_id } = rows[0];
      const resume = BEGINNER_RESUME(name);

      await client.query(
        `UPDATE org.students SET parsed_resume = $1 WHERE id = $2`,
        [JSON.stringify(resume), student_id],
      );

      console.log(`[ok]     ${email} (${student_id.slice(0, 8)}) → beginner resume set`);
    }

    await client.query('COMMIT');
    console.log('\n✅  All done.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌  Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
