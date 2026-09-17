const dns = require("dns");
const nodemailer = require("nodemailer");

// Force IPv4 lookup for all socket and TLS connections
function ipv4Lookup(hostname, options, callback) {
  return dns.lookup(hostname, { family: 4 }, callback);
}

function getTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || "quickchat.authmail@gmail.com";
  const pass = process.env.SMTP_PASS || "sbegfxuzhpwfixls";

  const isGmail =
    (host && host.toLowerCase().includes("gmail")) ||
    (user && user.toLowerCase().endsWith("@gmail.com"));

  if (isGmail) {
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      family: 4,
      lookup: ipv4Lookup,
      tls: {
        rejectUnauthorized: false,
        servername: "smtp.gmail.com",
      },
    });
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    family: 4,
    lookup: ipv4Lookup,
    tls: {
      rejectUnauthorized: false,
      servername: host,
    },
  });
}

async function sendSignupOtpEmail({ to, otp }) {
  const appName = process.env.APP_NAME || "QuickChat";
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "QuickChat <quickchat.authmail@gmail.com>";
  const transporter = getTransporter();

  await transporter.sendMail({
    from,
    to,
    subject: `${appName} signup verification code`,
    text: `Your ${appName} verification code is ${otp}. It will expire in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2>${appName} verification</h2>
        <p>Your signup verification code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</p>
        <p>This code will expire in 10 minutes.</p>
      </div>
    `,
  });
}

async function sendPasswordResetOtpEmail({ to, otp }) {
  const appName = process.env.APP_NAME || "QuickChat";
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "QuickChat <quickchat.authmail@gmail.com>";
  const transporter = getTransporter();

  await transporter.sendMail({
    from,
    to,
    subject: `${appName} password reset code`,
    text: `Your ${appName} password reset code is ${otp}. It will expire in 10 minutes.`,
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2>${appName} password reset</h2>
        <p>Your password reset code is:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px">${otp}</p>
        <p>This code will expire in 10 minutes. If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { sendSignupOtpEmail, sendPasswordResetOtpEmail };
