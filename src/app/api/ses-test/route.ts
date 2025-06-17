// Path: src/app/api/ses-test/route.ts

import { NextResponse } from "next/server";
import { SESClient, GetSendQuotaCommand } from "@aws-sdk/client-ses";

export async function GET() {
  try {
    console.log("Testing SES connection...");

    // Get AWS credentials
    const accessKeyId = process.env.ACCESS_KEY_ID || "";
    const secretAccessKey = process.env.SECRET_ACCESS_KEY || "";
    const region = process.env.REGION || "ap-south-1";

    console.log("Environment variables check:", {
      region,
      accessKeyId,
      secretAccessKey,
      senderEmail: process.env.SES_SENDER_EMAIL,
      baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
    });

    const sesClient = new SESClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Test connection by getting quotas
    const command = new GetSendQuotaCommand({});
    const response = await sesClient.send(command);

    return NextResponse.json({
      success: true,
      message: "SES connection successful",
      quotas: response,
      environment: {
        region,
        accessKeyId,
        secretAccessKey,
        senderEmail: process.env.SES_SENDER_EMAIL,
        baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
      },
    });
  } catch (error: any) {
    console.error("SES connection test error:", error);

    // Get AWS credentials for error diagnostics
    const accessKeyId = process.env.ACCESS_KEY_ID || "";
    const secretAccessKey = process.env.SECRET_ACCESS_KEY || "";
    const region = process.env.REGION || "ap-south-1";

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: error.code,
        name: error.name,
        requestId: error.$metadata?.requestId,
        environment: {
          region,
          accessKeyId,
          secretAccessKey,
          senderEmail: process.env.SES_SENDER_EMAIL,
        },
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
        metadata: error.$metadata,
      },
      { status: 500 }
    );
  }
}
