import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

const baseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>IDEON Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background-color: #f4f4f4; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background-color: #0B1112; padding: 30px; text-align: center; border-bottom: 4px solid #3B8E93; }
    .header h1 { color: #F2F7F7; font-size: 24px; font-weight: 700; }
    .body { padding: 40px 30px; }
    .footer { background-color: #f4f4f4; padding: 20px 30px; text-align: center; color: #999; font-size: 12px; }
    .btn { display: inline-block; padding: 14px 28px; background-color: #FF8A3D; color: #0B1112; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .btn:hover { background-color: #e67a2e; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>IDEON Dashboard</h1>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>© 2025 IDEON. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`

export const sendEmail = async (to, subject, htmlContent) => {
  try {
    const html = baseTemplate(htmlContent)
    const info = await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to,
      subject,
      html,
    })
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('Email send error:', error)
    return { success: false, error: error.message }
  }
}

export const welcomePending = (name) => ({
  subject: 'Account created — pending approval',
  html: `<p>Hello ${name},</p><p>Your account has been created and is pending admin approval. You will receive an email once your account is approved.</p>`,
})

export const welcomeApproved = (name, loginUrl) => ({
  subject: 'Your IDEON account is approved! 🎉',
  html: `<p>Hello ${name},</p><p>Your IDEON account has been approved! You can now log in to your dashboard.</p><a href="${loginUrl}" class="btn">Login to Dashboard</a>`,
})

export const suspendedEmail = (name) => ({
  subject: 'Account suspended',
  html: `<p>Hello ${name},</p><p>Your account has been suspended. Please contact your administrator for more information.</p>`,
})

export const passwordResetEmail = (name, newPassword) => ({
  subject: 'Your password has been reset',
  html: `<p>Hello ${name},</p><p>Your password has been reset by an administrator.</p><p><strong>New Password:</strong> ${newPassword}</p><p>Please change your password after logging in.</p>`,
})

export const projectAssignedEmail = (name, projectName, projectUrl) => ({
  subject: `You've been added to a project: ${projectName}`,
  html: `<p>Hello ${name},</p><p>You have been added to the project <strong>${projectName}</strong>.</p><a href="${projectUrl}" class="btn">View Project</a>`,
})

export const leaveApprovedEmail = (name, dates) => ({
  subject: 'Leave request approved ✓',
  html: `<p>Hello ${name},</p><p>Your leave request for <strong>${dates}</strong> has been approved.</p>`,
})

export const leaveRejectedEmail = (name, dates, reason) => ({
  subject: 'Leave request update',
  html: `<p>Hello ${name},</p><p>Your leave request for <strong>${dates}</strong> has been rejected.</p><p><strong>Reason:</strong> ${reason}</p>`,
})

export const otpEmail = (name, otp) => ({
  subject: 'Your OTP code — expires in 15 minutes',
  html: `<p>Hello ${name},</p><p>Your OTP code is: <strong style="font-size: 24px; color: #3B8E93;">${otp}</strong></p><p>This code will expire in 15 minutes.</p>`,
})

export const adminNewUserEmail = (userName, userEmail, adminUrl) => ({
  subject: 'New user registration awaiting approval',
  html: `<p>A new user has registered:</p><p><strong>Name:</strong> ${userName}</p><p><strong>Email:</strong> ${userEmail}</p><a href="${adminUrl}" class="btn">Review User</a>`,
})

export const attendanceReminderEmail = () => ({
  subject: '⏰ Don\'t forget to mark your attendance today',
  html: `<p>Good morning!</p><p>Don't forget to mark your attendance for today.</p><a href="${process.env.FRONTEND_URL}/dashboard/attendance" class="btn">Mark Attendance</a>`,
})
