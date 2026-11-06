import "server-only";

import nodemailer from "nodemailer";

/**
 * SMTP settings for server-side email. SMTP_* are the server-only names; the
 * old NEXT_PUBLIC_SMTP_* names are still read until the hosting env is renamed.
 */
export const smtpConfig = {
  host: process.env.SMTP_HOST || process.env.NEXT_PUBLIC_SMTP_HOST,
  port: parseInt(
    process.env.SMTP_PORT || process.env.NEXT_PUBLIC_SMTP_PORT || "587"
  ),
  secure:
    (process.env.SMTP_SECURE || process.env.NEXT_PUBLIC_SMTP_SECURE) === "true",
  user: process.env.SMTP_USER || process.env.NEXT_PUBLIC_SMTP_USER,
  password: process.env.SMTP_PASSWORD || process.env.NEXT_PUBLIC_SMTP_PASSWORD,
  from: process.env.SMTP_FROM || process.env.NEXT_PUBLIC_SMTP_FROM,
};

export function isSmtpConfigured() {
  return Boolean(smtpConfig.host && smtpConfig.user);
}

export function createSmtpTransport() {
  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.password,
    },
  });
}

/** The From header: SMTP_FROM, or the SMTP user with the app's name. */
export function smtpFrom() {
  return smtpConfig.from || `"Reimbursement App" <${smtpConfig.user}>`;
}
