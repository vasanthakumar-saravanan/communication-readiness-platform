require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seed() {
  const meta = JSON.stringify({
    questions: [
      { questionId: 'q1', questionText: 'What should you present before explaining individual components?', keywords: ['high-level', 'architecture', 'overview'], expectedAnswer: 'Start with the high-level architecture overview' },
      { questionId: 'q2', questionText: 'What is equally important alongside explaining?', keywords: ['listening', 'active', 'paraphrasing'], expectedAnswer: 'Active listening and confirming understanding by paraphrasing' }
    ]
  });
  
  const { rows } = await pool.query(
    `INSERT INTO knowledge.listening_stories (title, content, difficulty, source_type, metadata, is_active)
     VALUES ($1, $2, 'EASY', 'MANUAL', $3, true)
     RETURNING id, title`,
    [
      'Technical Communication Fundamentals',
      'Effective technical communication requires clarity, structure, and precision. When explaining a system design, start with the high-level architecture before diving into individual components. Use concrete examples and measurable metrics to support your points. Active listening is equally important — confirm understanding by paraphrasing key requirements back to the stakeholder before proceeding.',
      meta
    ]
  );
  
  console.log('Seeded story:', rows[0]?.id ?? '(none inserted - may already exist)');
  await pool.end();
}

seed().catch(e => { console.error('Error:', e.message); process.exit(1); });
