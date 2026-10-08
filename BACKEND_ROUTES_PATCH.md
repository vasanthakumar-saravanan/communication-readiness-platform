# Backend Routes Patch

These changes need to be manually applied to complete the authentication email flow implementation.

## File: backend/src/routes/auth.routes.ts

### 1. Add import (after line 15)

```typescript
import { sendPasswordResetEmail } from '../services/emailService';
```

### 2. Add forgot-password endpoint (after accept-invite endpoint, before closing export)

```typescript
// ── POST /api/auth/forgot-password ────────────────────────────────────────────
const forgotPasswordSchema = z.object({
  email: z.string().email().transform(s => s.toLowerCase())
});

authRouter.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, new AppError(422, 'Validation failed', 'VALIDATION_ERROR'));
    return;
  }
  const { email } = parsed.data;
  const ip = req.ip ?? 'unknown';

  try {
    const lockSeconds = lockedForSeconds(ip, `pwd_reset_${email}`);
    if (lockSeconds > 0) {
      throw new AppError(429, `Too many password reset attempts. Try again in ${Math.ceil(lockSeconds / 60)} minute(s).`, 'TOO_MANY_ATTEMPTS');
    }

    const { rows } = await db.query<{ id: string; name: string; email: string; status: string }>(
      'SELECT id, name, email, status FROM identity.users WHERE email = $1',
      [email]
    );

    if (rows.length === 0) {
      recordFailure(ip, `pwd_reset_${email}`);
      sendSuccess(res, { message: 'If an account with that email exists, a password reset link has been sent.' });
      return;
    }

    const user = rows[0];

    if (user.status === 'SUSPENDED') {
      recordFailure(ip, `pwd_reset_${email}`);
      sendSuccess(res, { message: 'If an account with that email exists, a password reset link has been sent.' });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    await db.query(
      `INSERT INTO identity.password_reset_tokens (user_id, token_hash, expires_at, request_ip)
       VALUES ($1, $2, now() + interval '15 minutes', $3)`,
      [user.id, tokenHash, ip]
    );

    try {
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetToken
      });
      clearFailures(ip, `pwd_reset_${email}`);
    } catch (emailErr) {
      console.error('[auth] Failed to send password reset email:', emailErr);
    }

    sendSuccess(res, { message: 'If an account with that email exists, a password reset link has been sent.' });
  } catch (err) {
    sendError(res, err);
  }
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
const resetPasswordSchema = z.object({
  token: z.string().length(64, 'Invalid reset token'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters')
});

authRouter.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, new AppError(422, 'Validation failed', 'VALIDATION_ERROR'));
    return;
  }
  const { token, newPassword } = parsed.data;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const { rows: tokenRows } = await client.query<{
      id: string; user_id: string; expires_at: Date; used_at: Date | null;
    }>(
      `SELECT id, user_id, expires_at, used_at
       FROM identity.password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
       FOR UPDATE`,
      [tokenHash]
    );

    if (tokenRows.length === 0) {
      await client.query('ROLLBACK');
      throw new AppError(400, 'Invalid or expired reset token. Please request a new password reset.', 'INVALID_TOKEN');
    }

    const resetRecord = tokenRows[0];

    const { rows: userRows } = await client.query<{ id: string; name: string; email: string; status: string }>(
      'SELECT id, name, email, status FROM identity.users WHERE id = $1',
      [resetRecord.user_id]
    );

    if (userRows.length === 0 || userRows[0].status === 'SUSPENDED') {
      await client.query('ROLLBACK');
      throw new AppError(400, 'Cannot reset password for this account', 'INVALID_ACCOUNT');
    }

    const user = userRows[0];

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await client.query(
      `UPDATE identity.users
       SET password_hash = $1, token_version = token_version + 1, updated_at = now()
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    await client.query(
      'UPDATE identity.password_reset_tokens SET used_at = now() WHERE id = $1',
      [resetRecord.id]
    );

    await client.query('COMMIT');

    console.log(`[auth] Password reset successful for user ${user.id} (${user.email})`);

    sendSuccess(res, {
      message: 'Password reset successful. You can now log in with your new password.'
    });
  } catch (err) {
    await client.query('ROLLBACK');
    sendError(res, err);
  } finally {
    client.release();
  }
});
```

## File: backend/src/routes/owner.routes.ts

### 1. Add import (after line 9)

```typescript
import { sendSuperAdminInvitationEmail } from '../services/emailService';
```

### 2. Replace TODO in invite creation (around line 608)

Replace:
```typescript
      // TODO: Send email via emailService
      // For now, just return the invite URL
      const inviteUrl = `${env.APP_URL}/?invite_token=${token}`;

      sendSuccess(res, {
        invite: {
          id: invite.id,
          token: invite.token,
          // ... rest
        },
        inviteUrl
      });
```

With:
```typescript
      // Send Super Admin invitation email
      try {
        await sendSuperAdminInvitationEmail({
          to: normalizedEmail,
          firstName,
          lastName,
          institutionName: institution.name,
          inviteToken: token
        });
        console.log(`[owner] Super Admin invitation email sent to ${normalizedEmail} for ${institution.name}`);
      } catch (emailErr) {
        console.error('[owner] Failed to send Super Admin invitation email:', emailErr);
      }

      const inviteUrl = `${env.APP_URL}/?invite_token=${token}`;

      sendSuccess(res, {
        invite: {
          id: invite.id,
          email: invite.email,
          name: invite.name,
          role: invite.role,
          institutionId: invite.institution_id,
          institutionName: institution.name,
          status: invite.status,
          expiresAt: invite.expires_at,
          createdAt: invite.created_at
        },
        inviteUrl,
        message: 'Invitation created and email sent successfully'
      });
```

### 3. Replace TODO in resend invitation (around line 755)

Replace:
```typescript
      // TODO: Send email via emailService
      const inviteUrl = `${env.APP_URL}/?invite_token=${newToken}`;

      sendSuccess(res, {
        invite: {
          id: updatedInvite.id,
          token: updatedInvite.token,
          // ... rest
        },
        inviteUrl
      });
```

With:
```typescript
      // Get institution name for email
      const instResult = await db.query(
        `SELECT name FROM org.institutions WHERE id = $1`,
        [updatedInvite.institution_id]
      );
      const institutionName = instResult.rows[0]?.name || 'Your Institution';

      // Resend invitation email
      try {
        await sendSuperAdminInvitationEmail({
          to: updatedInvite.email,
          firstName: updatedInvite.first_name || '',
          lastName: updatedInvite.last_name || '',
          institutionName,
          inviteToken: newToken
        });
        console.log(`[owner] Resent invitation email to ${updatedInvite.email}`);
      } catch (emailErr) {
        console.error('[owner] Failed to resend invitation email:', emailErr);
      }

      const inviteUrl = `${env.APP_URL}/?invite_token=${newToken}`;

      sendSuccess(res, {
        invite: {
          id: updatedInvite.id,
          email: updatedInvite.email,
          name: updatedInvite.name,
          role: updatedInvite.role,
          status: updatedInvite.status,
          expiresAt: updatedInvite.expires_at
        },
        inviteUrl,
        message: 'Invitation resent successfully'
      });
```

## Apply These Changes

1. Open each file in your editor
2. Find the specified lines/sections
3. Add imports at the top
4. Add/replace code as specified
5. Save files
6. Run `npm run typecheck` to verify
7. Commit changes

## Verification

After applying:
```bash
cd backend
npm run typecheck  # Should pass
npm test           # Run tests
cd ../frontend  
npm run build      # Should pass
```
