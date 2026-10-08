# Email Delivery Setup Guide

## Problem Summary

**Platform Owner invites Super Admin → UI shows success → NO EMAIL RECEIVED**

### Root Cause
SMTP credentials were not configured in `backend/.env`, causing emails to fail silently while the UI displayed success.

### What Was Fixed
1. ✓ Added SMTP configuration template to `backend/.env`
2. ✓ Updated frontend to check `emailSent` status and warn user if email fails
3. ✓ Created SMTP verification script for testing

---

## SMTP Setup Instructions

### Option 1: Gmail (Recommended for Development)

#### Step 1: Enable 2-Factor Authentication
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** if not already enabled

#### Step 2: Generate App Password
1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
2. Select app: **Mail**
3. Select device: **Other (Custom name)** → enter "AI Interview Platform"
4. Click **Generate**
5. Copy the 16-character password (format: `xxxx xxxx xxxx xxxx`)

#### Step 3: Configure Backend .env
Edit `backend/.env` and replace these values:

```env
# SMTP Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com          # Your Gmail address
SMTP_PASS=xxxxxxxxxxxxxxxx              # The 16-character app password (no spaces)
SMTP_FROM=noreply@aiinterview.dev       # Can be any valid email format
APP_NAME=AI Interview Platform
APP_URL=http://localhost:5173           # Frontend URL (update for production)
```

**Important:**
- Use the **App Password**, NOT your regular Gmail password
- Remove spaces from the app password
- For production, update `APP_URL` to your actual domain

#### Step 4: Test SMTP Configuration
```bash
cd backend
node test-smtp.js your-email@gmail.com
```

Expected output:
```
✓ SMTP Test PASSED
Email sent to: your-email@gmail.com
✅ Your SMTP configuration is working correctly!
```

If the test fails, check the troubleshooting section below.

---

### Option 2: Other SMTP Providers

#### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=noreply@yourdomain.com
```

#### Amazon SES
```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-ses-smtp-username
SMTP_PASS=your-ses-smtp-password
SMTP_FROM=noreply@yourdomain.com
```

#### Microsoft 365 / Outlook
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
SMTP_FROM=your-email@outlook.com
```

---

## Testing the Complete Flow

### Step 1: Restart Backend
After updating `.env`, restart the backend server:
```bash
cd backend
npm run dev
```

### Step 2: Test Email Delivery
Run the SMTP test script:
```bash
node test-smtp.js test-recipient@example.com
```

### Step 3: Test Actual Invite Flow
1. Login as **Platform Owner**
2. Go to **Platform Owner Portal**
3. Click on an institution
4. Click **"Invite Super Admin"**
5. Fill in:
   - First Name: Test
   - Last Name: Admin
   - Email: real-email@example.com (use a real email you can access)
6. Click **"Send Invitation"**

### Expected Results
- ✓ **Frontend**: Shows success message "Invitation email sent to..."
- ✓ **Backend logs**: `[emailService] Invite email sent OK messageId=...`
- ✓ **Database**: Record in `identity.invites` table with status `PENDING`
- ✓ **Mailbox**: Email received within 1-2 minutes

### Step 4: Accept Invitation
1. Check recipient mailbox for email
2. Click **"Accept Invitation"** button
3. Should redirect to password creation page
4. Create password and login as Super Admin
5. Verify institution association

---

## Troubleshooting

### Error: "Invalid login: 535-5.7.8 Username and Password not accepted"
**Cause**: Wrong credentials or regular password used instead of App Password

**Fix**:
1. Generate a new App Password at [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Copy the 16-character password (remove spaces)
3. Update `SMTP_PASS` in `.env`
4. Restart backend

### Error: "ENOTFOUND smtp.gmail.com"
**Cause**: Network/DNS issue or wrong SMTP_HOST

**Fix**:
1. Check internet connection
2. Verify `SMTP_HOST=smtp.gmail.com` is correct
3. Check firewall/antivirus settings

### Error: "ECONNREFUSED" or "connect ETIMEDOUT"
**Cause**: Port blocked by firewall or wrong port

**Fix**:
1. Verify `SMTP_PORT=587` (or 465 for SSL)
2. Check firewall allows outbound connections on port 587
3. Try alternate port: `SMTP_PORT=465` with `secure: true` in code

### UI shows "Invite created but EMAIL NOT SENT"
**Cause**: SMTP credentials not configured or invalid

**Fix**:
1. Check `backend/.env` has `SMTP_USER` and `SMTP_PASS` set
2. Run `node test-smtp.js your-email@example.com`
3. Fix credentials based on test result
4. Restart backend

### Email sent but not received
**Cause**: Spam folder or email provider blocking

**Fix**:
1. Check spam/junk folder
2. Whitelist sender email (`SMTP_FROM`)
3. For production, set up SPF, DKIM, DMARC records
4. Use professional email provider (SendGrid, SES)

---

## Production Recommendations

### 1. Use Professional Email Service
For production, switch from Gmail to:
- **SendGrid** (99.9% deliverability, 100 free emails/day)
- **Amazon SES** ($0.10 per 1000 emails)
- **Mailgun** (5,000 free emails/month)

### 2. Secure Credentials
- Never commit `.env` file to git
- Use environment variables in production
- Rotate SMTP passwords regularly

### 3. Email Monitoring
- Add email delivery tracking
- Log failed sends to monitoring service
- Set up alerts for delivery failures

### 4. Rate Limiting
Gmail App Passwords limit: **500 emails/day**

For higher volume:
```typescript
// Add to emailService.ts
const MAX_EMAILS_PER_DAY = 500;
// Implement counter/rate limiter
```

### 5. Domain Authentication
Configure SPF, DKIM, DMARC for your domain:
```
SPF: v=spf1 include:_spf.google.com ~all
DKIM: Generate in Google Workspace or email provider
DMARC: v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com
```

---

## Security Checklist

- [ ] SMTP credentials stored in `.env` (not in code)
- [ ] `.env` added to `.gitignore`
- [ ] App Password used (not regular password)
- [ ] Backend validates email addresses before sending
- [ ] Invitation tokens are cryptographically secure (32 bytes)
- [ ] Invitation links expire after 7 days
- [ ] SMTP connection uses STARTTLS (port 587)
- [ ] Rate limiting implemented for production

---

## Files Modified

### Backend
- ✓ `backend/.env` - Added SMTP configuration
- ✓ `backend/src/services/emailService.ts` - Already implemented correctly
- ✓ `backend/src/routes/owner.routes.ts` - Already returns `emailSent` status
- ✓ `backend/test-smtp.js` - New SMTP verification script

### Frontend
- ✓ `frontend/src/services/api.ts` - Updated to check `emailSent` status
- ✓ `frontend/src/components/portals/PlatformOwnerPortal.tsx` - Shows warning if email fails

---

## Verification Checklist

Run through this checklist to verify everything works:

- [ ] SMTP credentials configured in `backend/.env`
- [ ] Test script passes: `node test-smtp.js your-email@example.com`
- [ ] Backend restarted after `.env` changes
- [ ] Platform Owner can invite Super Admin
- [ ] Invitation email received in mailbox (not spam)
- [ ] Invitation link works and redirects to accept page
- [ ] Super Admin can create password and login
- [ ] Super Admin sees correct institution after login
- [ ] Backend logs show: `[emailService] Invite email sent OK`
- [ ] Frontend shows success (not warning) after invite sent

---

## Support

If you encounter issues not covered here:

1. Check backend logs for `[emailService]` entries
2. Run SMTP test: `node test-smtp.js your-email@example.com`
3. Verify database: `SELECT * FROM identity.invites ORDER BY created_at DESC LIMIT 5;`
4. Check environment: `console.log(process.env.SMTP_USER)` in emailService.ts

For Gmail-specific issues, see: [Google App Passwords Help](https://support.google.com/accounts/answer/185833)
