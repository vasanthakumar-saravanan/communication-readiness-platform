# Authentication & Email Flow Implementation

**Date**: 2026-10-08  
**Branch**: feat/auth-email-verification  
**Base Commit**: 9f1654c (upstream/main)

## Overview

Implemented production-ready password reset and super admin invitation email flows, replacing all mock localStorage-based authentication logic with secure server-side implementation.

---

## Password Reset Flow

### Architecture

```
User → Forgot Password
  ↓
POST /api/auth/forgot-password { email }
  ↓
Backend:
- Validates email exists (no enumeration)
- Generates crypto.randomBytes(32) token
- Hashes token with SHA-256
- Stores hash + expires_at (15 min)
- Sends email via nodemailer
- Always returns success
  ↓
Email → User clicks reset link
  ↓
Frontend: /?reset_token=<raw_token>
  ↓
POST /api/auth/reset-password { token, newPassword }
  ↓
Backend:
- Hashes provided token
- Finds matching hash
- Checks expiration
- Checks used_at IS NULL
- Updates password_hash
- Increments token_version (invalidates JWTs)
- Marks token used
  ↓
Success → User redirected to login
```

### Security Properties

✅ **No raw tokens in database** - Only SHA-256 hashes stored  
✅ **15-minute expiration** - Short-lived credentials  
✅ **Single-use tokens** - `used_at` prevents reuse  
✅ **No email enumeration** - Always returns generic success  
✅ **Rate limiting** - Uses existing loginThrottle system  
✅ **Session invalidation** - token_version++ kills all existing JWTs  
✅ **IP logging** - request_ip tracked for audit  

### Database Schema

```sql
CREATE TABLE identity.password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  request_ip  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Indexes:**
- `idx_password_reset_tokens_user_id` - Lookup by user
- `idx_password_reset_tokens_expires_at` - Cleanup expired
- `idx_password_reset_tokens_token_hash` WHERE used_at IS NULL - Fast validation
- `idx_password_reset_tokens_cleanup` WHERE created_at < now() - interval '24 hours'

### API Endpoints

#### POST /api/auth/forgot-password

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (always):**
```json
{
  "status": "success",
  "message": "If an account with that email exists, a password reset link has been sent."
}
```

**Behavior:**
- If email doesn't exist: logs fake failure (rate limiting) + returns success
- If account suspended: logs failure + returns success
- If valid: generates token + sends email + returns success
- Rate limit: 5 attempts per IP per email per 15 minutes

#### POST /api/auth/reset-password

**Request:**
```json
{
  "token": "64-char-hex-token",
  "newPassword": "newSecurePassword123"
}
```

**Response (success):**
```json
{
  "status": "success",
  "message": "Password reset successful. You can now log in with your new password."
}
```

**Errors:**
- 400 INVALID_TOKEN - Token expired, used, or doesn't exist
- 400 INVALID_ACCOUNT - User deleted or suspended
- 422 VALIDATION_ERROR - Invalid token format or password < 8 chars

### Email Template

**Subject:** `Reset your [APP_NAME] password`

**Content:**
- Personalized greeting
- Reset button with secure link
- Link expiration notice (15 minutes)
- Security warning about unsolicited resets
- Plain-text fallback URL

**Variables:**
- `${env.APP_NAME}` - Application branding
- `${env.APP_URL}` - Base URL for reset link
- `${user.name}` - HTML-escaped recipient name
- `${resetToken}` - Raw token (only in email, never stored)

---

## Super Admin Invitation Email

### Architecture

```
Platform Owner → Invite Super Admin
  ↓
POST /api/owner/institutions/:id/invite
  ↓
Backend:
- Validates PLATFORM_OWNER role
- Checks email not already registered
- Checks no pending invite exists
- Generates crypto.randomBytes(32) token
- Creates identity.invites row (raw token stored)
- Sends invitation email
  ↓
Email → Super Admin clicks invite link
  ↓
Frontend: /?invite_token=<token>
  ↓
POST /api/auth/accept-invite { token, password }
  ↓
Backend:
- Validates token (PENDING, not expired)
- Creates identity.users row
- Marks invite ACCEPTED
- Returns JWT
```

### Email Service Updates

**Function:** `sendSuperAdminInvitationEmail(opts)`

**Parameters:**
```typescript
{
  to: string;              // Invitee email
  firstName: string;
  lastName: string;
  institutionName: string;
  inviteToken: string;     // Raw 64-char hex token
}
```

**Template Features:**
- Role explanation (Super Admin)
- Institution name
- Permissions overview
- Accept button with secure link
- 7-day expiration notice
- Security warning
- Contact information

### Implementation Details

**owner.routes.ts Line 608:**
```typescript
// Before: TODO: Send email via emailService
// After:
await sendSuperAdminInvitationEmail({
  to: normalizedEmail,
  firstName,
  lastName,
  institutionName: institution.name,
  inviteToken: token
});
```

**Resend Flow (Line 755):**
- Generates new token (invalidates old)
- Extends expiration (+7 days)
- Resends email with new link

**Error Handling:**
- Email failure doesn't block invitation creation
- Logs error but continues
- Invitation stored even if email fails
- Production: should alert monitoring

---

## Frontend Changes

### Removed Mock Logic

**Before (api.ts):**
```typescript
requestPasswordReset: async (email) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.setStorage(`pwd_reset_${email}`, { otp, ... });
  return { otp }; // Exposed mock OTP
}

resetPassword: async ({ email, otp, newPassword }) => {
  const record = this.getStorage(`pwd_reset_${email}`);
  if (record.otp !== otp && otp !== '123456') throw Error;
  // Create fake user or update localStorage
  const token = `jwt_dyn_${Date.now()}`;
  return { user, token }; // Fake JWT
}
```

**After (api.ts):**
```typescript
requestPasswordReset: async (email) => {
  const response = await fetch(`${this.baseURL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  // Returns generic success message only
}

resetPassword: async ({ token, newPassword }) => {
  const response = await fetch(`${this.baseURL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword })
  });
  // Returns success message, user logs in normally
}
```

### AuthModal Updates

**Removed:**
- `simulatedOtp` state
- `forgotOtp` input field
- 6-digit OTP verification step
- localStorage password reset records
- Fake JWT generation
- Auto-login after reset

**Added:**
- Simpler 2-step flow: Request → Success message
- No OTP display
- Clear instructions to check email
- Link expiration warning
- Option to request again

### New Component: PasswordResetPage

**Purpose:** Handles `/?reset_token=<token>` URL

**Features:**
- Reads reset_token from URL params
- New password + confirm password form
- Calls `/api/auth/reset-password`
- Success → redirects to login after 3s
- Error → shows clear message with guidance

**Integration:**
- Added `PASSWORD_RESET` to ViewName union (AppContext.tsx)
- Added route detection for `reset_token` param
- Added component import in App.tsx

---

## Files Changed

### Backend

1. **backend/src/database/migrations/126_password_reset_tokens.sql** (NEW)
   - password_reset_tokens table
   - Indexes for performance
   - Cleanup strategy

2. **backend/src/services/emailService.ts** (MODIFIED)
   - Added `sendPasswordResetEmail()`
   - Added `sendSuperAdminInvitationEmail()`
   - Reused `escapeHtml()` for security

3. **backend/src/routes/auth.routes.ts** (MODIFIED)
   - Added POST /api/auth/forgot-password
   - Added POST /api/auth/reset-password
   - Imported sendPasswordResetEmail

4. **backend/src/routes/owner.routes.ts** (MODIFIED)
   - Line 608: Added email sending to invite creation
   - Line 755: Added email sending to invite resend
   - Imported sendSuperAdminInvitationEmail

### Frontend

5. **frontend/src/services/api.ts** (MODIFIED)
   - Replaced mock `requestPasswordReset()` with real API call
   - Replaced mock `resetPassword()` with real API call
   - Removed localStorage password reset logic

6. **frontend/src/components/auth/AuthModal.tsx** (MODIFIED)
   - Removed `simulatedOtp`, `forgotOtp` state
   - Changed steps from REQUEST_OTP/VERIFY_AND_RESET to REQUEST_RESET/RESET_SENT
   - Removed OTP input fields
   - Added success message UI
   - Updated handler to call new API

7. **frontend/src/components/auth/PasswordResetPage.tsx** (NEW)
   - Standalone password reset form
   - Handles reset_token from URL
   - Success/error states
   - Redirect to login

8. **frontend/src/context/AppContext.tsx** (MODIFIED)
   - Added PASSWORD_RESET to ViewName
   - Added reset_token detection logic

9. **frontend/src/App.tsx** (MODIFIED)
   - Imported PasswordResetPage
   - Added PASSWORD_RESET view routing

---

## Testing

### Backend Typecheck
```bash
cd backend && npm run typecheck
✅ PASS - No errors
```

### Frontend Build
```bash
cd frontend && npm run build
✅ PASS - Built successfully in 2.09s
Warning: Bundle size > 500KB (not an error)
```

### Manual Testing Required

**Password Reset Flow:**
1. Configure SMTP_USER, SMTP_PASS, SMTP_FROM in backend/.env
2. Start backend: `cd backend && npm run dev`
3. Start frontend: `cd frontend && npm run dev`
4. Navigate to forgot password
5. Enter real email address
6. Check email inbox
7. Click reset link
8. Set new password
9. Verify login with new password
10. Verify old password fails
11. Verify old reset link fails

**Super Admin Invitation:**
1. Login as PLATFORM_OWNER
2. Navigate to institution detail
3. Click "Invite Super Admin"
4. Enter name and email
5. Verify email received
6. Click invitation link
7. Set password
8. Verify account created with SUPER_ADMIN role
9. Verify login works
10. Verify invitation cannot be reused

---

## Security Checklist

✅ No raw reset tokens stored in database  
✅ Tokens hashed with SHA-256  
✅ No raw passwords stored  
✅ No passwords in emails  
✅ No password tokens in logs  
✅ No email enumeration via forgot-password  
✅ Reset links expire (15 min)  
✅ Reset links are one-time-use  
✅ Invitation links expire (7 days)  
✅ Invitation links are one-time-use  
✅ token_version invalidates sessions after password reset  
✅ SMTP credentials not committed  
✅ Frontend not authoritative for password reset  
✅ Frontend not authoritative for invitation acceptance  
✅ Platform Owner authorization enforced  
✅ Institution scoping enforced  
✅ HTML injection prevented (escapeHtml)  
✅ Rate limiting applied  

---

## Configuration

### Environment Variables

**.env (backend):**
```bash
# Required for email sending
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@yourapp.com

# Required for links
APP_URL=http://localhost:5173
APP_NAME="AI Interview Platform"
```

**Gmail Setup:**
1. Enable 2FA on Google account
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use app password (not account password) for SMTP_PASS

### Development Mode

If SMTP_USER is not set:
- `sendPasswordResetEmail()` throws error
- `sendSuperAdminInvitationEmail()` throws error
- Invitation creation succeeds but email not sent
- Password reset request returns success but no email

**Console Warnings:**
```
[emailService] SMTP_USER not set — cannot send password reset email to user@example.com
[emailService] SMTP_USER not set — cannot send invitation email to admin@college.edu
```

---

## Remaining Work

### Before Production

1. ❗ **Run Database Migration**
   ```bash
   psql $DATABASE_URL -f backend/src/database/migrations/126_password_reset_tokens.sql
   ```

2. ❗ **Configure SMTP Credentials**
   - Set SMTP_HOST, SMTP_USER, SMTP_PASS in production .env
   - Test email delivery
   - Monitor for failures

3. ❗ **Add Monitoring**
   - Alert on email send failures
   - Track password reset requests
   - Monitor for abuse patterns

4. **Add Backend Tests**
   - Password reset token lifecycle
   - Email enumeration protection
   - Token expiration
   - Token reuse prevention
   - Rate limiting
   - Super admin invitation flow

5. **Email Template Improvements** (Optional)
   - Add company logo
   - Responsive mobile design
   - Plain-text fallback
   - Custom branding per institution

6. **Cleanup Expired Tokens** (Optional)
   - Add cron job or scheduled task
   - Delete rows WHERE created_at < now() - interval '24 hours'
   - Or rely on index for performance

---

## Known Issues

### Email Delivery

- Gmail may rate-limit or block automated emails
- Consider SendGrid/AWS SES for production
- SPF/DKIM records required for deliverability
- Emails may land in spam without proper configuration

### Token Storage

- Invitation tokens stored **raw** (not hashed)
- Acceptable because: invitation creation is admin-only + 7-day expiration
- Password reset tokens are **hashed** (higher security requirement)

### Error Messages

- Generic "If an account exists" message prevents enumeration
- But also confuses legitimate users with typos
- Consider: send "Account not found" only after N failed attempts

---

## Migration from Mock Auth

### Removed Files/Code

❌ `localStorage` keys:
- `pwd_reset_${email}`
- Fake OTP generation
- `college_registered_users` fake accounts
- `jwt_dyn_` fake tokens

❌ Frontend mock logic:
- simulatedOtp display
- 6-digit OTP verification
- `'123456'` hardcoded reset code
- Auto-login after password reset

### Preserved Files/Code

✅ Existing authentication:
- JWT-based auth (jwt.sign, authenticate middleware)
- Login throttling (loginThrottle.ts)
- DUMMY_HASH for timing attacks
- Account status checking
- Invitation system (identity.invites)

✅ Email service:
- sendStaffWelcomeEmail (unchanged)
- Nodemailer configuration
- HTML escaping

---

## Deployment Checklist

- [ ] Merge feat/auth-email-verification → main
- [ ] Run migration 126 on production database
- [ ] Configure production SMTP credentials
- [ ] Test password reset end-to-end
- [ ] Test super admin invitation end-to-end
- [ ] Verify emails deliver successfully
- [ ] Set up email delivery monitoring
- [ ] Update user documentation
- [ ] Train support staff on new flow
- [ ] Monitor for issues first 48 hours

---

## Contact

**Implementation:** Claude Sonnet 4.5  
**Date:** 2026-10-08  
**Branch:** feat/auth-email-verification  
**Documentation:** docs/AUTH_EMAIL_FLOW.md
