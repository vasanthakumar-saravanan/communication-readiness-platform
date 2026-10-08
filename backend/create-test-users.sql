-- Create test users for multi-user authentication testing
-- Password for all test users: "student123" (hashed with bcrypt rounds=10)
-- Hash generated: bcrypt.hashSync('student123', 10)

-- First, create an institution if it doesn't exist
INSERT INTO org.institutions (id, name, code, is_active)
VALUES ('10000000-0000-0000-0000-000000000002', 'Test College', 'TEST', true)
ON CONFLICT (code) DO NOTHING;

-- Create a program
INSERT INTO org.programs (id, institution_id, name, code, is_active)
VALUES ('20000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000002',
        'Computer Science', 'CS', true)
ON CONFLICT (institution_id, code) DO NOTHING;

-- Create a batch
INSERT INTO org.batches (id, program_id, name, year, is_active)
VALUES ('30000000-0000-0000-0000-000000000002',
        '20000000-0000-0000-0000-000000000002',
        'Batch 2026', 2026, true)
ON CONFLICT DO NOTHING;

-- Student 1: student.real01@example.com
INSERT INTO identity.users (
  id, name, email, password_hash, role,
  institution_id, first_name, last_name, is_active, token_version, status
)
VALUES (
  '50000000-0000-0000-0000-000000000011',
  'Student Real One',
  'student.real01@example.com',
  '$2a$10$DqmiDH/h7iGyayoxAEUWdugpFZXJIK.urcAKDOJL0Ku0E/9nJB5Oq',
  'STUDENT',
  '10000000-0000-0000-0000-000000000002',
  'Student', 'RealOne', true, 0, 'ACTIVE'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  token_version = 0;

INSERT INTO org.students (
  id, user_id, roll_number, program_id, batch_id, subdivision_id
)
VALUES (
  '60000000-0000-0000-0000-000000000011',
  '50000000-0000-0000-0000-000000000011',
  '22CS1101',
  '20000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  NULL
)
ON CONFLICT (user_id) DO NOTHING;

-- Student 2: student.real02@example.com
INSERT INTO identity.users (
  id, name, email, password_hash, role,
  institution_id, first_name, last_name, is_active, token_version, status
)
VALUES (
  '50000000-0000-0000-0000-000000000012',
  'Student Real Two',
  'student.real02@example.com',
  '$2a$10$DqmiDH/h7iGyayoxAEUWdugpFZXJIK.urcAKDOJL0Ku0E/9nJB5Oq',
  'STUDENT',
  '10000000-0000-0000-0000-000000000002',
  'Student', 'RealTwo', true, 0, 'ACTIVE'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  token_version = 0;

INSERT INTO org.students (
  id, user_id, roll_number, program_id, batch_id, subdivision_id
)
VALUES (
  '60000000-0000-0000-0000-000000000012',
  '50000000-0000-0000-0000-000000000012',
  '22CS1102',
  '20000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  NULL
)
ON CONFLICT (user_id) DO NOTHING;

-- Student 3: student.real03@example.com
INSERT INTO identity.users (
  id, name, email, password_hash, role,
  institution_id, first_name, last_name, is_active, token_version, status
)
VALUES (
  '50000000-0000-0000-0000-000000000013',
  'Student Real Three',
  'student.real03@example.com',
  '$2a$10$DqmiDH/h7iGyayoxAEUWdugpFZXJIK.urcAKDOJL0Ku0E/9nJB5Oq',
  'STUDENT',
  '10000000-0000-0000-0000-000000000002',
  'Student', 'RealThree', true, 0, 'ACTIVE'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  token_version = 0;

INSERT INTO org.students (
  id, user_id, roll_number, program_id, batch_id, subdivision_id
)
VALUES (
  '60000000-0000-0000-0000-000000000013',
  '50000000-0000-0000-0000-000000000013',
  '22CS1103',
  '20000000-0000-0000-0000-000000000002',
  '30000000-0000-0000-0000-000000000002',
  NULL
)
ON CONFLICT (user_id) DO NOTHING;

-- Create performance profiles for all students
INSERT INTO performance.performance_profiles (student_id)
VALUES
  ('60000000-0000-0000-0000-000000000011'),
  ('60000000-0000-0000-0000-000000000012'),
  ('60000000-0000-0000-0000-000000000013')
ON CONFLICT (student_id) DO NOTHING;
