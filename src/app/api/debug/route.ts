// src/app/api/debug/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // Collect email-related environment variables
  const emailConfig = {
    // SMTP configuration
    SMTP_HOST: process.env.SMTP_HOST || "not set",
    SMTP_PORT: process.env.SMTP_PORT || "not set",
    SMTP_SECURE: process.env.SMTP_SECURE || "not set",
    SMTP_USER: process.env.SMTP_USER ? "is set" : "not set",
    SMTP_PASSWORD: process.env.SMTP_PASSWORD ? "is set (masked)" : "not set",
    SMTP_FROM: process.env.SMTP_FROM || "not set",

    // AWS configuration (if using SES)
    AWS_REGION: process.env.AWS_REGION || "not set",

    // Supabase configuration
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? "is set"
      : "not set",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? "is set (masked)"
      : "not set",

    // Application URLs
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || "not set",

    // General environment
    NODE_ENV: process.env.NODE_ENV || "not set",
  };

  // Additional checks for SMTP connection
  const smtpConnectionDetails = {
    description: "Details about how the SMTP connection would be configured",
    host: process.env.SMTP_HOST || "(default: localhost)",
    port: process.env.SMTP_PORT
      ? parseInt(process.env.SMTP_PORT)
      : "(default: 587)",
    secure: process.env.SMTP_SECURE === "true",
    authProvided: !!(process.env.SMTP_USER && process.env.SMTP_PASSWORD),
  };

  return NextResponse.json({
    emailConfig,
    smtpConnectionDetails,
    message: "Environment variables information",
  });
}
