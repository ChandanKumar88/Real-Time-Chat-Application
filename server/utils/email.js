const dns = require("dns").promises;
const nodemailer = require("nodemailer");

let cachedIpv4 = null;
let cachedIpv4Expiry = 0;

async function resolveIpv4Host(host) {
  const now = Date.now();
  if (cachedIpv4 && cachedIpv4Expiry > now) {
    return cachedIpv4;
  }
  try {
    const addresses = await dns.resolve4(host);
    if (addresses && addresses.length > 0) {
      cachedIpv4 = addresses[0];
      cachedIpv4Expiry = now + 10 * 60 * 1000; // cache for 10 minutes
      return cachedIpv4;
    }
  } catch (err) {
    console.warn(`dns.resolve4 for ${host} failed, falling back to hostname:`, err.message);
  }
  return host;
}

async function getTransporter() {
  const rawHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || "quickchat.authmail@gmail.com";
  const pass = process.env.SMTP_PASS || "sbegfxuzhpwfixls";

  const isGmail =
    (rawHost && rawHost.toLowerCase().includes("gmail")) ||
    (user && user.toLowerCase().endsWith("@gmail.com"));

  const targetHostName = isGmail ? "smtp.gmail.com" : rawHost;
  // Resolve host to concrete IPv4 address to eliminate Linux/Docker IPv6 ENETUNREACH issues completely
  const resolvedHostIp = await resolveIpv4Host(targetHostName);

  return nodemailer.createTransport({
    host: resolvedHostIp,
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    tls: {
      rejectUnauthorized: false,
      servername: targetHostName,
    },
  });
}

async function sendSignupOtpEmail({ to, otp }) {
  const appName = process.env.APP_NAME || "QuickChat";
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "QuickChat <quickchat.authmail@gmail.com>";
  const transporter = await getTransporter();

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
  const transporter = await getTransporter();

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
