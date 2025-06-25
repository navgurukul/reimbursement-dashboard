// app/api/debug-env/route.ts (for App Router)
// or
// pages/api/debug-env.ts (for Pages Router)

import { NextResponse } from "next/server"; // For App Router
// import type { NextApiRequest, NextApiResponse } from 'next'; // For Pages Router

export async function GET() {
  // For App Router
  // export default function handler(req: NextApiRequest, res: NextApiResponse) { // For Pages Router
  // Get all environment variables related to Google Drive
  const vars = {
    // Public vars (safe to expose)
    NEXT_PUBLIC_ENABLE_GOOGLE_DRIVE:
      process.env.NEXT_PUBLIC_ENABLE_GOOGLE_DRIVE,

    // For private vars, just check if they exist and show first few chars
    GOOGLE_DRIVE_CLIENT_EMAIL: process.env.GOOGLE_DRIVE_CLIENT_EMAIL
      ? `${process.env.GOOGLE_DRIVE_CLIENT_EMAIL.substring(0, 10)}...`
      : null,
    GOOGLE_DRIVE_PRIVATE_KEY: process.env.GOOGLE_DRIVE_PRIVATE_KEY
      ? `${process.env.GOOGLE_DRIVE_PRIVATE_KEY.substring(0, 20)}...`
      : null,
    GOOGLE_DRIVE_FOLDER_ID: process.env.GOOGLE_DRIVE_FOLDER_ID
      ? `${process.env.GOOGLE_DRIVE_FOLDER_ID.substring(0, 5)}...`
      : null,
  };

  const allPresent = !!(
    process.env.GOOGLE_DRIVE_CLIENT_EMAIL &&
    process.env.GOOGLE_DRIVE_PRIVATE_KEY &&
    process.env.GOOGLE_DRIVE_FOLDER_ID
  );

  return NextResponse.json({
    // For App Router
    // return res.status(200).json({ // For Pages Router
    variables: vars,
    allPresent,
    nodeEnv: process.env.NODE_ENV,
  });
}
