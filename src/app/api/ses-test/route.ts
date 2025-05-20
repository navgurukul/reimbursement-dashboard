// Path: src/app/api/ses-test/route.ts

import { NextResponse } from "next/server";
import { SESClient, GetSendQuotaCommand } from "@aws-sdk/client-ses";

export async function GET() {
  try {
    console.log("Testing SES connection with IAM role...");
    
    const sesClient = new SESClient({
      region: process.env.NEXT_REGION || "ap-south-1",
      // No credentials - use IAM role
    });
    
    // Test connection by getting quotas
    const command = new GetSendQuotaCommand({});
    const response = await sesClient.send(command);
    
    return NextResponse.json({
      success: true,
      message: "SES connection successful using IAM role",
      quotas: response,
      environment: {
        region: process.env.REGION || "ap-south-1",
        senderEmail: process.env.SES_SENDER_EMAIL,
        baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
      }
    });
  } catch (error: any) {
    console.error("SES connection test error:", error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code,
      name: error.name,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      metadata: error.$metadata,
    }, { status: 500 });
  }
}