const axios = require('axios');

const AI_SERVICE_URL = 'http://127.0.0.1:8002';

async function testEasyQuestion() {
  console.log('=== TESTING EASY QUESTION GENERATION ===\n');

  const payload = {
    student_name: "Test Student",
    skills: ["JavaScript", "TypeScript", "Java", "React", "Node.js", "Spring Boot"],
    projects: [
      {
        title: "Full Stack App",
        tech_stack: ["React", "Node.js", "PostgreSQL"]
      }
    ],
    resume_context: "Full Stack Developer with React, Node.js, Spring Boot",
    previous_turns: [],
    difficulty: "EASY",
    domain: "Technical"
  };

  try {
    console.log('Request payload:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('\n--- Calling /ai/generate-question ---\n');

    const response = await axios.post(`${AI_SERVICE_URL}/ai/generate-question`, payload, {
      timeout: 30000
    });

    console.log('✅ Response:');
    console.log(JSON.stringify(response.data, null, 2));

    const question = response.data.question_text;
    const difficulty = response.data.difficulty;

    console.log('\n=== VALIDATION ===');
    console.log('Question:', question);
    console.log('Difficulty:', difficulty);

    // Check for forbidden keywords and patterns
    const forbiddenKeywords = [
      'kafka', 'rabbitmq', 'microservices', 'microservice', 'kubernetes',
      'distributed', 'load balanc', 'message queue', 'ci/cd', 'backpressure',
      'architecture', 'system design', 'deployment', 'orchestration',
      'data fetch', 'error handling', 'state management', 'loading state',
      'useeffect', 'api call', 'rest api', 'backend integration'
    ];

    const projectPhrases = [
      'you built', 'you handled', 'your project', 'your app', 'you implemented',
      'walk me through', 'how did you', 'in that specific project', 'in that project'
    ];

    const questionLower = question.toLowerCase();
    const foundForbidden = forbiddenKeywords.filter(kw => questionLower.includes(kw));
    const foundProjectPhrases = projectPhrases.filter(p => questionLower.includes(p));

    if (foundForbidden.length > 0) {
      console.log('❌ FAIL: Question contains forbidden keywords:', foundForbidden);
      console.log('This is TOO ADVANCED for EASY difficulty!');
      process.exit(1);
    } else if (foundProjectPhrases.length > 0) {
      console.log('❌ FAIL: Question is project-specific (contains:', foundProjectPhrases.join(', ') + ')');
      console.log('EASY questions should be textbook-style definitions, NOT about specific projects!');
      process.exit(1);
    } else {
      console.log('✅ PASS: No forbidden keywords or project phrases found');
      console.log('Question is appropriate for EASY/BEGINNER level');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.response) {
      console.error('Response:', err.response.data);
    }
    process.exit(1);
  }
}

testEasyQuestion();
