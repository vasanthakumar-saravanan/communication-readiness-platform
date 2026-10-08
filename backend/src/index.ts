import 'dotenv/config';
import app from './app';
import { env } from './config/env';
import { eventBus } from './shared/events/eventBus';
import { Events, UserRegisteredPayload } from './shared/events/events';
import { db } from './shared/db/pool';
import { registerModule3Handlers } from './shared/events/module3Handlers';
import { recoverDeadRuns } from './agents/agentRunner';
import { createInterviewWsServer } from './routes/interviewWs';

// Module 3 event handlers
registerModule3Handlers();

// M1 handler: write audit log on registration (non-blocking)
// DBML §21: audit_logs uses actor_user_id + after_data (not user_id / metadata)
eventBus.on(Events.USER_REGISTERED, async (payload: UserRegisteredPayload) => {
  try {
    await db.query(
      `INSERT INTO system.audit_logs (actor_user_id, action, resource_type, resource_id, after_data)
       VALUES ($1, 'USER_REGISTERED', 'USER', $1::uuid, $2)`,
      [payload.userId, JSON.stringify({ studentId: payload.studentId, email: payload.email })]
    );
  } catch (err) {
    console.error('[eventBus] USER_REGISTERED handler error:', err);
  }
});

const server = app.listen(env.PORT, '0.0.0.0', async () => {
  console.log(`[backend] http://localhost:${env.PORT}  (${env.NODE_ENV})`);
  // Recover any agent runs that were RUNNING when the previous process died
  try {
    await recoverDeadRuns();
  } catch (err) {
    console.error('[startup] recoverDeadRuns error:', err);
  }
});

// Attach WebSocket interview server to the same HTTP server
createInterviewWsServer(server);

process.on('SIGTERM', () => server.close(() => process.exit(0)));
