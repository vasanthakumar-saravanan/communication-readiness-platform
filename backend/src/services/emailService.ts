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

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">Hi <strong>${opts.name}</strong>,</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      <strong>${opts.createdBy}</strong> has created a <strong>${roleName}</strong> account for you on ${env.APP_NAME}.
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
          <td style="color: #111827; font-weight: 500; font-family: monospace;">${opts.to}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; padding: 4px 0;">Password</td>
          <td style="color: #111827; font-weight: 600; font-family: monospace; font-size: 16px; letter-spacing: 1px;">${opts.password}</td>
        </tr>
        <tr>
          <td style="color: #6b7280; padding: 4px 0;">Role</td>
          <td style="color: #111827; font-weight: 500;">${roleName}</td>
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

export interface SuperAdminInviteEmailOptions {
  to: string;
  name: string;
  institutionName: string;
  inviteUrl: string;
}

export async function sendSuperAdminInviteEmail(opts: SuperAdminInviteEmailOptions): Promise<boolean> {
  if (!env.SMTP_USER) {
    console.warn('[emailService] SMTP_USER not configured — skipping Super Admin invite email for', opts.to);
    return false;
  }

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

    <p style="color: #374151; font-size: 15px; line-height: 1.6;">Hi <strong>${opts.name}</strong>,</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      You have been invited to become the Super Admin for <strong>${opts.institutionName}</strong> on ${env.APP_NAME}.
      Click the button below to accept your invitation and set up your account.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${opts.inviteUrl}"
         style="display: inline-block; background: #111827; color: white; font-size: 14px; font-weight: 600; padding: 14px 28px; border-radius: 10px; text-decoration: none;">
        Accept Invitation
      </a>
    </div>

    <div style="background: #f3f4f6; border-radius: 8px; padding: 14px 16px; margin-bottom: 24px;">
      <p style="margin: 0 0 6px; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Institution</p>
      <p style="margin: 0; font-size: 14px; font-weight: 600; color: #111827;">${opts.institutionName}</p>
    </div>

    <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0; border-top: 1px solid #f3f4f6; padding-top: 16px;">
      This invitation link expires in 7 days. If you did not expect this invitation, you can safely ignore this email.
    </p>
  </div>
</body>
</html>`;

  try {
    const info = await getTransporter().sendMail({
      from: env.SMTP_FROM,
      to: opts.to,
      subject: `You've been invited as Super Admin — ${opts.institutionName}`,
      html,
    });
    console.log('[emailService] Invite email sent OK messageId=', info.messageId, 'to=', opts.to);
    return true;
  } catch (err: any) {
    console.error('[emailService] Failed to send invite email to', opts.to, ':', err.message);
    return false;
  }
}
