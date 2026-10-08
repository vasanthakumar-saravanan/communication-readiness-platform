/**
 * Seed script: Test University Faculty + Student users
 *
 * Creates:
 * - HOPE Elite + HOPE Non-Elite subdivisions under HOPE program
 * - PEP domain subdivisions (Full Stack, Cyber Security, AI&ML, Data Science, Cloud Computing)
 * - 4 faculty users (HOPE Admin, PEP Admin, Multi-scope Faculty, Single-scope Faculty)
 * - 10 test students spread across subdivisions
 * - Faculty scope assignments in identity.role_assignments
 *
 * Run with:  node scripts/seed-test-university.js
 */

// Load .env from backend directory
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '../backend/.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Known IDs from DB ──────────────────────────────────────────────────────────
const TU_INSTITUTION_ID = '1ffa509b-8081-4b36-88dd-30c7568ff955'; // Test University
const HOPE_PROGRAM_ID   = '1bf2f4f2-d922-48c1-a448-3dd10735b518'; // HOPE
const PEP_PROGRAM_ID    = '7d795d60-e2b5-4274-8055-11d5c498c3af'; // PEP
const HOPE_BATCH_ID     = '2166e798-1c26-4469-8fdc-2df51068711e'; // HOPE IMPORT batch
const PEP_BATCH_ID      = '96acc40d-96a7-4fd5-9433-087f1cefd909'; // PEP IMPORT batch

// Test password (synthetic — safe for development only)
const TEST_PASSWORD = 'TestUni2026!';

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const hash = await bcrypt.hash(TEST_PASSWORD, 10);
    console.log('[seed] Password hashed. Starting...');

    // ── 1. Create subdivisions ──────────────────────────────────────────────────

    // Subdivisions: table has (id, batch_id, name, type, created_at) — no code or program_id column
    const subdivisions = [
      // HOPE
      { key: 'HOPE_ELITE',     batch_id: HOPE_BATCH_ID, name: 'HOPE Elite',              type: 'DOMAIN' },
      { key: 'HOPE_NON_ELITE', batch_id: HOPE_BATCH_ID, name: 'HOPE Non-Elite',           type: 'DOMAIN' },
      // PEP
      { key: 'FS',    batch_id: PEP_BATCH_ID, name: 'Full Stack Development', type: 'DOMAIN' },
      { key: 'CYBER', batch_id: PEP_BATCH_ID, name: 'Cyber Security',         type: 'DOMAIN' },
      { key: 'AIML',  batch_id: PEP_BATCH_ID, name: 'AI & Machine Learning',  type: 'DOMAIN' },
      { key: 'DS',    batch_id: PEP_BATCH_ID, name: 'Data Science',           type: 'DOMAIN' },
      { key: 'CC',    batch_id: PEP_BATCH_ID, name: 'Cloud Computing',        type: 'DOMAIN' },
    ];

    const subMap = {};

    for (const s of subdivisions) {
      // Check if a subdivision with this name already exists in this batch
      const existing = await client.query(
        `SELECT id FROM org.subdivisions WHERE batch_id=$1 AND name=$2`,
        [s.batch_id, s.name]
      );
      if (existing.rows.length > 0) {
        subMap[s.key] = existing.rows[0].id;
      } else {
        const r = await client.query(
          `INSERT INTO org.subdivisions (batch_id, name, type) VALUES ($1,$2,$3) RETURNING id`,
          [s.batch_id, s.name, s.type]
        );
        subMap[s.key] = r.rows[0].id;
      }
    }
    console.log('[seed] Subdivisions:', Object.entries(subMap).map(([k,v]) => `${k}=${v.slice(0,8)}`).join(', '));

    // ── 2. Create faculty users ────────────────────────────────────────────────

    const faculty = [
      {
        id: uuidv4(),
        email: 'hope.admin@testuniversity.edu',
        name: 'Dr. Priya Nair',
        firstName: 'Priya',
        lastName: 'Nair',
        role: 'PROGRAM_ADMIN',
        scopes: [],  // PROGRAM_ADMIN — no scope restrictions
      },
      {
        id: uuidv4(),
        email: 'pep.admin@testuniversity.edu',
        name: 'Prof. Karthik Raj',
        firstName: 'Karthik',
        lastName: 'Raj',
        role: 'PROGRAM_ADMIN',
        scopes: [],  // PROGRAM_ADMIN — no scope restrictions
      },
      {
        id: uuidv4(),
        email: 'faculty.multi@testuniversity.edu',
        name: 'Dr. Anitha Suresh',
        firstName: 'Anitha',
        lastName: 'Suresh',
        role: 'FACULTY_MENTOR',
        scopes: ['FS', 'CYBER'],  // Two PEP domains
      },
      {
        id: uuidv4(),
        email: 'faculty.single@testuniversity.edu',
        name: 'Mr. Bala Murugan',
        firstName: 'Bala',
        lastName: 'Murugan',
        role: 'FACULTY_MENTOR',
        scopes: ['FS'],  // One PEP domain only
      },
    ];

    // Look up role UUIDs from identity.roles
    const roleRows = await client.query(`SELECT id, name FROM identity.roles`);
    const roleIdMap = {};
    for (const r of roleRows.rows) roleIdMap[r.name] = r.id;
    console.log('[seed] Available roles:', Object.keys(roleIdMap).join(', '));

    for (const f of faculty) {
      // identity.users: id, name, email, password_hash, role (enum), status (enum)
      const r = await client.query(
        `INSERT INTO identity.users (id, name, email, password_hash, role, status)
         VALUES ($1,$2,$3,$4,$5,'ACTIVE')
         ON CONFLICT (email) DO UPDATE
           SET password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, status='ACTIVE'
         RETURNING id, email, role`,
        [f.id, f.name, f.email, hash, f.role]
      );
      const actualId = r.rows[0].id;
      console.log(`[seed] Faculty: ${f.email} role=${f.role} id=${actualId.slice(0,8)}`);

      // Create scope assignments for FACULTY_MENTOR
      const roleUuid = roleIdMap['FACULTY_MENTOR'];
      if (!roleUuid) { console.log('[seed] WARNING: FACULTY_MENTOR role not found in identity.roles'); continue; }

      for (const code of f.scopes) {
        const subdivId = subMap[code];
        if (!subdivId) { console.log(`[seed] WARNING: no subdivision found for code ${code}`); continue; }
        await client.query(
          `INSERT INTO identity.role_assignments
             (user_id, role_id, institution_id, program_id, subdivision_id, scope_type, is_active)
           VALUES ($1, $2, $3, $4, $5, 'FACULTY_SCOPE', true)
           ON CONFLICT DO NOTHING`,
          [actualId, roleUuid, TU_INSTITUTION_ID, PEP_PROGRAM_ID, subdivId]
        );
        console.log(`[seed]   Scope: ${code} → ${subdivId.slice(0,8)}`);
      }
    }

    // ── 3. Create test students ────────────────────────────────────────────────

    const students = [
      { email: 'aravind.kumar@testuniversity.edu',   name: 'Aravind Kumar',   programId: HOPE_PROGRAM_ID, batchId: HOPE_BATCH_ID, subdivCode: 'HOPE_ELITE'     },
      { email: 'deepika.rajan@testuniversity.edu',   name: 'Deepika Rajan',   programId: HOPE_PROGRAM_ID, batchId: HOPE_BATCH_ID, subdivCode: 'HOPE_NON_ELITE' },
      { email: 'logesh.sekar@testuniversity.edu',    name: 'Logesh Sekar',    programId: PEP_PROGRAM_ID,  batchId: PEP_BATCH_ID,  subdivCode: 'FS'             },
      { email: 'nithya.priya@testuniversity.edu',    name: 'Nithya Priya',    programId: PEP_PROGRAM_ID,  batchId: PEP_BATCH_ID,  subdivCode: 'FS'             },
      { email: 'ranjith.selvan@testuniversity.edu',  name: 'Ranjith Selvan',  programId: PEP_PROGRAM_ID,  batchId: PEP_BATCH_ID,  subdivCode: 'CYBER'          },
      { email: 'sowmya.kannan@testuniversity.edu',   name: 'Sowmya Kannan',   programId: PEP_PROGRAM_ID,  batchId: PEP_BATCH_ID,  subdivCode: 'CYBER'          },
      { email: 'thilaga.veni@testuniversity.edu',    name: 'Thilaga Veni',    programId: PEP_PROGRAM_ID,  batchId: PEP_BATCH_ID,  subdivCode: 'AIML'           },
      { email: 'vasanth.raj@testuniversity.edu',     name: 'Vasanth Raj',     programId: PEP_PROGRAM_ID,  batchId: PEP_BATCH_ID,  subdivCode: 'DS'             },
    ];

    // Student roll number counter
    let rollSeq = 2001;

    for (const s of students) {
      const subdivId = subMap[s.subdivCode];
      const userId = uuidv4();
      const ur = await client.query(
        `INSERT INTO identity.users (id, name, email, password_hash, role, status)
         VALUES ($1,$2,$3,$4,'STUDENT','ACTIVE')
         ON CONFLICT (email) DO UPDATE
           SET password_hash=EXCLUDED.password_hash, status='ACTIVE'
         RETURNING id, email`,
        [userId, s.name, s.email, hash]
      );
      const actualUserId = ur.rows[0].id;

      // Generate unique roll number (use timestamp + seq to avoid conflicts)
      const rollNumber = `TU${Date.now().toString().slice(-6)}${rollSeq++}`;

      // Create org.students record: id, user_id, roll_number, batch_id, subdivision_id
      await client.query(
        `INSERT INTO org.students (user_id, roll_number, batch_id, subdivision_id)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id) DO UPDATE
           SET batch_id=EXCLUDED.batch_id, subdivision_id=EXCLUDED.subdivision_id
         RETURNING id`,
        [actualUserId, rollNumber, s.batchId, subdivId || null]
      );

      console.log(`[seed] Student: ${s.email} subdiv=${s.subdivCode} id=${actualUserId.slice(0,8)}`);
    }

    await client.query('COMMIT');
    console.log('\n[seed] ✅ Done. All users created/updated with password: [HIDDEN]');
    console.log('[seed] Faculty emails:');
    for (const f of faculty) console.log(`  ${f.role.padEnd(16)} ${f.email}`);
    console.log('[seed] Student emails (sample):');
    console.log('  logesh.sekar@testuniversity.edu  (PEP Full Stack)');
    console.log('  ranjith.selvan@testuniversity.edu (PEP Cyber Security)');
    console.log('  aravind.kumar@testuniversity.edu  (HOPE Elite)');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] ❌ Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
