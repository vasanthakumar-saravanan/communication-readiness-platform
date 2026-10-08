const { createClient } = require('redis');

const sessionId = 'ffc91529-4275-4669-a1c2-846db681d580'; // IN_PROGRESS session

async function checkRedis() {
  const redis = createClient({ url: 'redis://localhost:6379' });

  try {
    await redis.connect();
    console.log('✅ Connected to Redis\n');

    // Check session state
    const stateKey = `session:${sessionId}:state`;
    const state = await redis.get(stateKey);

    console.log('=== SESSION STATE ===');
    if (state) {
      const parsed = JSON.parse(state);
      console.log('Current Turn:', parsed.current_turn);
      console.log('Current Difficulty:', parsed.current_difficulty);
      console.log('Active Topic:', parsed.active_topic);
      console.log('Current Question:', parsed.current_question?.substring(0, 200) || 'None');
      console.log('Do Not Ask:', parsed.do_not_ask_or_repeat?.slice(0, 3));
    } else {
      console.log('❌ No state found in Redis');
    }

    // Check turn context
    const contextKey = `session:${sessionId}:context`;
    const contextLen = await redis.lLen(contextKey);
    console.log('\n=== TURN CONTEXT ===');
    console.log('Number of turns in Redis:', contextLen);

    if (contextLen > 0) {
      const lastTurn = await redis.lIndex(contextKey, -1);
      console.log('Last turn:', JSON.parse(lastTurn));
    }

    // Check resume
    const resumeKey = `session:${sessionId}:resume`;
    const resume = await redis.get(resumeKey);
    console.log('\n=== RESUME IN REDIS ===');
    if (resume) {
      const parsed = JSON.parse(resume);
      console.log('Skills:', parsed.skills);
      console.log('Resume text (first 200 chars):', (parsed.text || '').substring(0, 200));
    } else {
      console.log('❌ No resume in Redis');
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await redis.quit();
  }
}

checkRedis();
