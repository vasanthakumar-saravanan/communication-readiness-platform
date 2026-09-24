import 'dotenv/config';
import app from './app';
import { env } from './config/env';
import { eventBus } from './shared/events/eventBus';
import { Events, UserRegisteredPayload } from './shared/events/events';
import { db } from './shared/db/pool';

// M1 handler: write audit log on registration (non-blocking)
eventBus.on(Events.USER_REGISTERED, async (payload: UserRegisteredPayload) => {
  try {
    await db.query(
      `INSERT INTO system.audit_logs (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, 'USER_REGISTERED', 'USER', $1::uuid, $2)`,
      [payload.userId, JSON.stringify({ studentId: payload.studentId, email: payload.email })]
    );
  } catch (err) {
    console.error('[eventBus] USER_REGISTERED handler error:', err);
  }
});

const server = app.listen(env.PORT, () => {
  console.log(`[backend] http://localhost:${env.PORT}  (${env.NODE_ENV})`);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
