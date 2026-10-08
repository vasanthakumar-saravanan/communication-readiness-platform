/**
 * SMTP Email Configuration Test
 *
 * Tests if your SMTP credentials are correctly configured and can send emails.
 *
 * Usage:
 *   node test-smtp.js recipient@example.com
 */

const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const path = require('path');

// Load .env file
dotenv.config({ path: path.join(__dirname, '.env') });

const recipientEmail = process.argv[2];

if (!recipientEmail) {
  console.error('\n❌ Error: Please provide recipient email address');
  console.log('\nUsage: node test-smtp.js recipient@example.com\n');
  process.exit(1);
}

console.log('\n🔍 Testing SMTP Configuration...\n');
console.log('Configuration:');
console.log(`  SMTP_HOST: ${process.env.SMTP_HOST || '(not set)'}`);
console.log(`  SMTP_PORT: ${process.env.SMTP_PORT || '(not set)'}`);
console.log(`  SMTP_USER: ${process.env.SMTP_USER || '(not set)'}`);
console.log(`  SMTP_PASS: ${process.env.SMTP_PASS ? '***' + process.env.SMTP_PASS.slice(-4) : '(not set)'}`);
console.log(`  SMTP_FROM: ${process.env.SMTP_FROM || '(not set)'}`);
console.log(`  APP_NAME: ${process.env.APP_NAME || '(not set)'}`);
console.log(`  APP_URL: ${process.env.APP_URL || '(not set)'}`);
console.log('');

if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.error('❌ SMTP_USER or SMTP_PASS not configured in .env\n');
  console.log('For Gmail:');
  console.log('1. Enable 2-Factor Authentication on your Google account');
  console.log('2. Generate an App Password at: https://myaccount.google.com/apppasswords');
  console.log('3. Add to backend/.env:');
  console.log('   SMTP_USER=your-email@gmail.com');
  console.log('   SMTP_PASS=your-16-character-app-password\n');
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false, // STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const testEmail = {
  from: process.env.SMTP_FROM || 'noreply@test.com',
  to: recipientEmail,
  subject: `SMTP Test — ${new Date().toISOString()}`,
  html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: sans-serif; padding: 20px; background: #f9fafb;">
  <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 8px; padding: 30px; border: 1px solid #e5e7eb;">
    <h2 style="color: #10b981; margin: 0 0 10px;">✓ SMTP Test Successful</h2>
    <p style="color: #374151; margin: 0;">Your SMTP configuration is working correctly.</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
    <p style="font-size: 12px; color: #9ca3af; margin: 0;">
      Sent from: ${process.env.APP_NAME || 'AI Interview Platform'}<br>
      Timestamp: ${new Date().toISOString()}
    </p>
  </div>
</body>
</html>`
};

console.log(`📧 Sending test email to ${recipientEmail}...\n`);

transporter.sendMail(testEmail, (error, info) => {
  if (error) {
    console.error('❌ SMTP Test FAILED\n');
    console.error('Error:', error.message);

    if (error.message.includes('Invalid login')) {
      console.log('\n💡 Troubleshooting:');
      console.log('  • For Gmail, use App Password (not regular password)');
      console.log('  • Generate at: https://myaccount.google.com/apppasswords');
      console.log('  • Enable 2-Factor Authentication first');
    } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Troubleshooting:');
      console.log('  • Check SMTP_HOST and SMTP_PORT');
      console.log('  • Verify internet connection');
      console.log('  • Check firewall settings');
    }
    process.exit(1);
  }

  console.log('✓ SMTP Test PASSED\n');
  console.log('Message ID:', info.messageId);
  console.log(`Email sent to: ${recipientEmail}`);
  console.log('\n✅ Your SMTP configuration is working correctly!');
  console.log('   Platform Owner invites will now be delivered.\n');
});
