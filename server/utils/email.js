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
      cachedIpv4Expiry = now + 10 * 60 * 1000;
      return cachedIpv4;
    }
  } catch (err) {
    console.warn(`dns.resolve4 for ${host} failed:`, err.message);
  }
  return host;
}

async function getTransporter() {
  const rawHost = process.env.SMTP_HOST || "smtp.gmail.com";
  const user = process.env.SMTP_USER || "quickchat.authmail@gmail.com";
  const pass = process.env.SMTP_PASS || "sbegfxuzhpwfixls";

  const isGmail =
    (rawHost && rawHost.toLowerCase().includes("gmail")) ||
    (user && user.toLowerCase().endsWith("@gmail.com"));

  const targetHostName = isGmail ? "smtp.gmail.com" : rawHost;
  const resolvedHostIp = await resolveIpv4Host(targetHostName);

  return nodemailer.createTransport({
    host: resolvedHostIp,
    port: 465,
    secure: true,
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
    tls: {
      rejectUnauthorized: false,
      servername: targetHostName,
    },
  });
}

// Send via Brevo HTTPS REST API (Port 443 HTTPS - Never blocked by cloud firewalls)
async function sendViaBrevoHttp({ apiKey, to, subject, html, text, fromName, fromEmail }) {
  if (apiKey.startsWith("xsmtpsib-")) {
    throw new Error(
      "Brevo API key is an SMTP key (starts with 'xsmtpsib-'). Please generate an API Key (starts with 'xkeysib-') from Brevo Dashboard > API Keys."
    );
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender: {
        name: fromName || "QuickChat",
        email: process.env.BREVO_FROM_EMAIL || fromEmail || process.env.SMTP_USER || "quickchat.authmail@gmail.com",
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Brevo HTTP error ${res.status}`);
  }
  return data;
}

// Send via Resend HTTPS REST API (Port 443 HTTPS - Never blocked by cloud firewalls)
async function sendViaResendHttp({ apiKey, to, subject, html, text, from }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: from || process.env.RESEND_FROM || "QuickChat <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
      text,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || `Resend HTTP error ${res.status}`);
  }
  return data;
}

async function sendEmail({ to, subject, text, html }) {
  const appName = process.env.APP_NAME || "QuickChat";
  const brevoApiKey = process.env.BREVO_API_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const errors = [];

  // 1. Try Brevo HTTP API (Port 443 HTTPS)
  if (brevoApiKey) {
    try {
      await sendViaBrevoHttp({
        apiKey: brevoApiKey,
        to,
        subject,
        html,
        text,
        fromName: appName,
        fromEmail: process.env.BREVO_FROM_EMAIL || process.env.SMTP_USER || "quickchat.authmail@gmail.com",
      });
      return;
    } catch (err) {
      console.warn("Brevo HTTP send failed:", err.message);
      errors.push(`Brevo: ${err.message}`);
    }
  }

  // 2. Try Resend HTTP API (Port 443 HTTPS)
  if (resendApiKey) {
    try {
      await sendViaResendHttp({
        apiKey: resendApiKey,
        to,
        subject,
        html,
        text,
        from: process.env.SMTP_FROM,
      });
      return;
    } catch (err) {
      console.warn("Resend HTTP send failed:", err.message);
      errors.push(`Resend: ${err.message}`);
    }
  }

  // 3. Fallback to Direct Nodemailer SMTP
  try {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || "QuickChat <quickchat.authmail@gmail.com>";
    const transporter = await getTransporter();

    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html,
    });
    return;
  } catch (err) {
    console.warn("Direct SMTP send failed:", err.message);
    errors.push(`SMTP: ${err.message}`);
  }

  throw new Error(`Email delivery failed (${errors.join("; ")})`);
}

async function sendSignupOtpEmail({ to, otp }) {
  const appName = process.env.APP_NAME || "QuickChat";
  await sendEmail({
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
  await sendEmail({
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
