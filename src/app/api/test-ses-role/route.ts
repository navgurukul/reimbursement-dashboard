// Path: src/app/api/test-ses-role/route.ts

import { NextResponse } from "next/server";
import {
  SESClient,
  GetSendQuotaCommand,
  ListIdentitiesCommand,
} from "@aws-sdk/client-ses";

// Define result type structures to fix TypeScript errors
interface TestResult {
  attempted: boolean;
  successful: boolean;
  error: string | null;
  details: Record<string, any> | null;
}

interface TestResults {
  environmentInfo: Record<string, any>;
  roleTest: TestResult;
  credentialTest: TestResult;
  sesConnectionTest: TestResult;
  identitiesTest: TestResult;
}

export async function GET() {
  // Initialize with proper typing
  const results: TestResults = {
    environmentInfo: {},
    roleTest: {
      attempted: false,
      successful: false,
      error: null,
      details: null,
    },
    credentialTest: {
      attempted: false,
      successful: false,
      error: null,
      details: null,
    },
    sesConnectionTest: {
      attempted: false,
      successful: false,
      error: null,
      details: null,
    },
    identitiesTest: {
      attempted: false,
      successful: false,
      error: null,
      details: null,
    },
  };

  try {
    // Step 1: Get environment information
    results.environmentInfo = {
      region: process.env.REGION || "ap-south-1",
      nodeEnv: process.env.NODE_ENV,
      isProduction: process.env.NODE_ENV === "production",
      isAmplify: !!process.env.AWS_REGION || !!process.env.AMPLIFY_REGION,
      amplifyRegion:
        process.env.AWS_REGION || process.env.AMPLIFY_REGION || "unknown",
      runtimeRegion:
        process.env.AWS_REGION || process.env.REGION || "ap-south-1",
    };

    console.log("Environment info:", results.environmentInfo);

    // Step 2: Test AWS credentials with default credential provider chain
    try {
      results.roleTest.attempted = true;
      console.log("Testing role-based authentication...");

      // Create SES client using default credential provider chain
      const roleClient = new SESClient({
        region: process.env.REGION || "ap-south-1",
        // No explicit credentials - will use AWS credential provider chain
      });

      // Test connection by getting quotas
      const quotaCommand = new GetSendQuotaCommand({});
      const quotaResponse = await roleClient.send(quotaCommand);

      results.roleTest.successful = true;
      results.roleTest.details = {
        quotas: quotaResponse,
        message: "Successfully connected to SES using Amplify service role",
      };

      // Step 3: Test listing SES identities
      try {
        results.identitiesTest.attempted = true;
        console.log("Testing SES identities listing...");

        const listCommand = new ListIdentitiesCommand({
          IdentityType: "EmailAddress",
          MaxItems: 10,
        });

        const identitiesResponse = await roleClient.send(listCommand);

        results.identitiesTest.successful = true;
        results.identitiesTest.details = {
          identities: identitiesResponse.Identities,
          message: "Successfully listed SES identities using service role",
        };
      } catch (identityError: any) {
        results.identitiesTest.successful = false;
        results.identitiesTest.error = identityError.message;
        console.error("Failed to list SES identities:", identityError);
      }
    } catch (roleError: any) {
      results.roleTest.successful = false;
      results.roleTest.error = roleError.message;
      console.error("Role-based authentication failed:", roleError);
    }

    // Step 4: Test with explicit credentials as fallback
    try {
      results.credentialTest.attempted = true;
      console.log("Testing explicit credentials as fallback...");

      // Get AWS credentials from environment variables
      const accessKeyId = process.env.ACCESS_KEY_ID || "";
      const secretAccessKey = process.env.SECRET_ACCESS_KEY || "";

      // Check if credentials are available
      if (!accessKeyId || !secretAccessKey) {
        results.credentialTest.successful = false;
        results.credentialTest.error =
          "Explicit credentials not found in environment variables";
      } else {
        // Create SES client with explicit credentials
        const credentialClient = new SESClient({
          region: process.env.REGION || "ap-south-1",
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });

        // Test connection
        const quotaCommand = new GetSendQuotaCommand({});
        const quotaResponse = await credentialClient.send(quotaCommand);

        results.credentialTest.successful = true;
        results.credentialTest.details = {
          hasAccessKey: !!accessKeyId,
          hasSecretKey: !!secretAccessKey,
          quotas: quotaResponse,
          message: "Successfully connected to SES using explicit credentials",
        };
      }
    } catch (credError: any) {
      results.credentialTest.successful = false;
      results.credentialTest.error = credError.message;
      console.error("Explicit credential authentication failed:", credError);
    }

    // Step 5: Test overall SES connectivity
    try {
      results.sesConnectionTest.attempted = true;
      console.log("Testing general SES connectivity...");

      // Determine which client to use based on previous tests
      let sesClient;

      if (results.roleTest.successful) {
        // Use role-based client if it was successful
        sesClient = new SESClient({
          region: process.env.REGION || "ap-south-1",
        });
        results.sesConnectionTest.details = { authMethod: "service_role" };
      } else if (results.credentialTest.successful) {
        // Fall back to explicit credentials if role-based auth failed
        const accessKeyId = process.env.ACCESS_KEY_ID || "";
        const secretAccessKey = process.env.SECRET_ACCESS_KEY || "";

        sesClient = new SESClient({
          region: process.env.REGION || "ap-south-1",
          credentials: {
            accessKeyId,
            secretAccessKey,
          },
        });
        results.sesConnectionTest.details = {
          authMethod: "explicit_credentials",
        };
      } else {
        throw new Error(
          "No authentication method worked, cannot test SES connectivity"
        );
      }

      // Test connection with a simple command
      const command = new GetSendQuotaCommand({});
      const response = await sesClient.send(command);

      if (results.sesConnectionTest.details === null) {
        results.sesConnectionTest.details = {};
      }

      results.sesConnectionTest.successful = true;
      results.sesConnectionTest.details = {
        ...results.sesConnectionTest.details,
        quotas: response,
        message: "Successfully connected to SES",
      };
    } catch (sesError: any) {
      results.sesConnectionTest.successful = false;
      results.sesConnectionTest.error = sesError.message;
      console.error("SES connectivity test failed:", sesError);
    }

    // Return results
    return NextResponse.json({
      success: results.roleTest.successful || results.credentialTest.successful,
      message: "SES authentication tests completed",
      results: results,
    });
  } catch (error: any) {
    console.error("Overall test failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        results: results,
      },
      { status: 500 }
    );
  }
}
