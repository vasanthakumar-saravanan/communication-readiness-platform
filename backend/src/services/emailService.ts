import * as nodemailer from 'nodemailer';
import { env } from '../config/env';

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: false, // STARTTLS
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return _transporter;
}

export interface StaffWelcomeEmailOptions {
  to: string;
  name: string;
  role: string;
  password: string;
  createdBy: string;
}

// Names and emails come from admin input; never let them inject markup into the email.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendStaffWelcomeEmail(opts: StaffWelcomeEmailOptions): Promise<void> {
  if (!env.SMTP_USER) {
    console.warn('[emailService] SMTP_USER not set — skipping welcome email for', opts.to);
    return;
  }

  const roleName = opts.role
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 32px 16px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; border: 1px solid #e5e7eb; padding: 40px;">
    <div style="margin-bottom: 28px;">
      <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 6px">${env.APP_NAME}</h1>
      <p style="color: #6b7280; margin: 0; font-size: 14px;">Your account has been created</p>
    </div>

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">Hi <strong>${escapeHtml(opts.name)}</strong>,</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      <strong>${escapeHtml(opts.createdBy)}</strong> has created a <strong>${escapeHtml(roleName)}</strong> account for you on ${env.APP_NAME}.
      Use the credentials below to sign in.
    </p>

    <div style="background: #f3f4f6; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="color: #6b7280; padding: 4px 0; width: 90px;">Login URL</td>
          <td style="color: #111827; font-weight: 500;"><a href="${env.APP_URL}/login" style="color: #2563eb;">${env.APP_URL}/login</a></td>
        </tr>
        <tr>
          <td style="color: #6b7280; padding: 4px 0;">Email</td>
          <td style="color: #111827; font-weight: 500; font-family: monospace;">${escapeHtml(opts.to)}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; padding: 4px 0;">Password</td>
          <td style="color: #111827; font-weight: 600; font-family: monospace; font-size: 16px; letter-spacing: 1px;">${escapeHtml(opts.password)}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; padding: 4px 0;">Role</td>
          <td style="color: #111827; font-weight: 500;">${escapeHtml(roleName)}</td>
        </tr>
      </table>
    </div>

    <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 13px; color: #92400e;">
        <strong>Please change your password</strong> immediately after your first login via Account Settings.
      </p>
    </div>

    <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0; border-top: 1px solid #f3f4f6; padding-top: 16px;">
      This email was sent by ${env.APP_NAME}. If you did not expect this, please contact your administrator.
    </p>
  </div>
</body>
</html>`;

  const info = await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: opts.to,
    subject: `Your ${env.APP_NAME} account credentials`,
    html,
  });
  console.log('[emailService] Email sent OK messageId=', info.messageId, 'to=', opts.to);
}

export interface PasswordResetEmailOptions {
  to: string;
  name: string;
  resetToken: string;
}

export async function sendPasswordResetEmail(opts: PasswordResetEmailOptions): Promise<void> {
  if (!env.SMTP_USER) {
    console.warn('[emailService] SMTP_USER not set — cannot send password reset email to', opts.to);
    throw new Error('Email service is not configured. Please contact support.');
  }

  const resetUrl = `${env.APP_URL}/?reset_token=${opts.resetToken}`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 32px 16px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; border: 1px solid #e5e7eb; padding: 40px;">
    <div style="margin-bottom: 28px;">
      <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 6px">${env.APP_NAME}</h1>
      <p style="color: #6b7280; margin: 0; font-size: 14px;">Password Reset Request</p>
    </div>

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">Hi <strong>${escapeHtml(opts.name)}</strong>,</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      We received a request to reset the password for your ${env.APP_NAME} account. Click the button below to create a new password.
    </p>

    <div style="margin: 32px 0;">
      <a href="${resetUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;">Reset Your Password</a>
    </div>

    <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
      Or copy and paste this link into your browser:
    </p>
    <p style="font-family: monospace; font-size: 12px; color: #4b5563; background: #f3f4f6; padding: 12px; border-radius: 6px; word-break: break-all;">
      ${resetUrl}
    </p>

    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px 16px; margin: 24px 0;">
      <p style="margin: 0; font-size: 13px; color: #991b1b;">
        <strong>Security Notice:</strong> This link expires in 15 minutes and can only be used once. If you did not request a password reset, please ignore this email or contact support if you're concerned about your account security.
      </p>
    </div>

    <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0; border-top: 1px solid #f3f4f6; padding-top: 16px;">
      This email was sent by ${env.APP_NAME}. If you did not request this password reset, you can safely ignore this email.
    </p>
  </div>
</body>
</html>`;

  const info = await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: opts.to,
    subject: `Reset your ${env.APP_NAME} password`,
    html,
  });
  console.log('[emailService] Password reset email sent OK messageId=', info.messageId, 'to=', opts.to);
}

export interface SuperAdminInvitationEmailOptions {
  to: string;
  firstName: string;
  lastName: string;
  institutionName: string;
  inviteToken: string;
}

export async function sendSuperAdminInvitationEmail(opts: SuperAdminInvitationEmailOptions): Promise<void> {
  if (!env.SMTP_USER) {
    console.warn('[emailService] SMTP_USER not set — cannot send invitation email to', opts.to);
    throw new Error('Email service is not configured. Please contact support.');
  }

  const inviteUrl = `${env.APP_URL}/?invite_token=${opts.inviteToken}`;
  const fullName = `${opts.firstName} ${opts.lastName}`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; margin: 0; padding: 32px 16px;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; border: 1px solid #e5e7eb; padding: 40px;">
    <div style="margin-bottom: 28px;">
      <h1 style="font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 6px">${env.APP_NAME}</h1>
      <p style="color: #6b7280; margin: 0; font-size: 14px;">Super Admin Invitation</p>
    </div>

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">Hi <strong>${escapeHtml(fullName)}</strong>,</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      You've been invited to be the <strong>Super Admin</strong> for <strong>${escapeHtml(opts.institutionName)}</strong> on ${env.APP_NAME}.
    </p>

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      As Super Admin, you'll have full administrative access to manage programs, departments, students, faculty, and institutional settings.
    </p>

    <div style="margin: 32px 0;">
      <a href="${inviteUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;">Accept Invitation</a>
    </div>

    <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
      Or copy and paste this link into your browser:
    </p>
    <p style="font-family: monospace; font-size: 12px; color: #4b5563; background: #f3f4f6; padding: 12px; border-radius: 6px; word-break: break-all;">
      ${inviteUrl}
    </p>

    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 14px 16px; margin: 24px 0;">
      <p style="margin: 0; font-size: 13px; color: #991b1b;">
        <strong>Security Notice:</strong> This invitation expires in 7 days and can only be used once. If you did not expect this invitation, please contact ${env.APP_NAME} support.
      </p>
    </div>

    <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
      <p style="margin: 0; font-size: 13px; color: #1e40af;">
        <strong>Institution:</strong> ${escapeHtml(opts.institutionName)}<br>
        <strong>Role:</strong> Super Admin<br>
        <strong>Email:</strong> ${escapeHtml(opts.to)}
      </p>
    </div>

    <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0; border-top: 1px solid #f3f4f6; padding-top: 16px;">
      This email was sent by ${env.APP_NAME}. Need help? Contact support at ${env.SMTP_FROM}.
    </p>
  </div>
</body>
</html>`;

  const info = await getTransporter().sendMail({
    from: env.SMTP_FROM,
    to: opts.to,
    subject: `You're invited to be Super Admin at ${opts.institutionName} - ${env.APP_NAME}`,
    html,
  });
  console.log('[emailService] Super Admin invitation email sent OK messageId=', info.messageId, 'to=', opts.to);
}
