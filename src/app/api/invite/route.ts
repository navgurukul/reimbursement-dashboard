import { NextResponse } from "next/server";
import { invites } from "@/lib/db";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Configure AWS SES client
const sesClient = new SESClient({
  region: process.env.NEXT_REGION || "ap-south-1",
  credentials: {
    accessKeyId: process.env.NEXT_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.NEXT_SECRET_ACCESS_KEY || "",
  },
});

export async function POST(request: Request) {
  console.log(
    "Received request to create invite and send email using AWS SES"
    ,process.env.NEXT_PUBLIC_BASE_URL, process.env.NEXT_REGION, process.env.NEXT_ACCESS_KEY_ID, process.env.NEXT_SECRET_ACCESS_KEY
  )
  try {
    const body = await request.json();
    const { email, role, orgId, orgName } = body;

    if (!email || !role || !orgId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create the invite in the database
    const { data: inviteRow, error: inviteError } = await invites.create(
      orgId,
      email,
      role
    );

    if (inviteError || !inviteRow) {
      console.error("Error creating invite:", inviteError);
      throw inviteError ?? new Error("Failed to create invite");
    }

    // Build the sign-up URL with the invite token
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const signupUrl = `${baseUrl}/auth/signup?token=${inviteRow.id}`;

    // Email content with responsive HTML template
    const emailParams = {
      Source: process.env.SES_SENDER_EMAIL,
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Subject: {
          Data: `You've been invited to join ${orgName} on the Reimbursement App`,
          Charset: "UTF-8",
        },
        Body: {
          Html: {
            Data: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Invitation to join ${orgName}</title>
                <style>
                  body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    line-height: 1.6;
                    color: #333;
                    margin: 0;
                    padding: 0;
                  }
                  .container {
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                  }
                  .header {
                    background-color: #4f46e5;
                    padding: 20px;
                    text-align: center;
                    border-radius: 8px 8px 0 0;
                  }
                  .header h1 {
                    color: white;
                    margin: 0;
                    font-size: 24px;
                  }
                  .content {
                    background-color: #ffffff;
                    padding: 20px;
                    border: 1px solid #e5e7eb;
                    border-top: none;
                    border-radius: 0 0 8px 8px;
                  }
                  .button {
                    display: inline-block;
                    background-color: #4f46e5;
                    color: white;
                    text-decoration: none;
                    padding: 12px 24px;
                    border-radius: 4px;
                    margin: 20px 0;
                    font-weight: 500;
                  }
                  .footer {
                    text-align: center;
                    margin-top: 20px;
                    font-size: 12px;
                    color: #6b7280;
                  }
                  @media screen and (max-width: 600px) {
                    .container {
                      width: 100%;
                    }
                  }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>You've been invited!</h1>
                  </div>
                  <div class="content">
                    <p>Hello,</p>
                    <p>You've been invited to join <strong>${orgName}</strong> as a <strong>${role}</strong> on the Reimbursement App.</p>
                    <p>Click the button below to accept the invitation and create your account:</p>
                    <p style="text-align: center;">
                      <a href="${signupUrl}" class="button">Accept Invitation</a>
                    </p>
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all;">${signupUrl}</p>
                    <p>This invite link will expire in 7 days.</p>
                    <p>If you have any questions, please contact the organization administrator.</p>
                  </div>
                  <div class="footer">
                    <p>This is an automated message, please do not reply directly to this email.</p>
                  </div>
                </div>
              </body>
              </html>
            `,
            Charset: "UTF-8",
          },
          Text: {
            Data: `You've been invited to join ${orgName} as a ${role} on the Reimbursement App. Click here to accept: ${signupUrl}`,
            Charset: "UTF-8",
          },
        },
      },
    };

    try {
      // Send the email using AWS SES
      const sendCommand = new SendEmailCommand(emailParams);
      await sesClient.send(sendCommand);

      return NextResponse.json({
        success: true,
        inviteId: inviteRow.id,
        message: "Invitation email sent successfully",
      });
    } catch (sesError: any) {
      console.error("Error sending email with SES:", sesError);

      // Even if email fails, we'll still return the invite ID
      // as the invite was created in the database
      return NextResponse.json(
        {
          success: false,
          inviteId: inviteRow.id,
          error: `Invite created but email failed: ${sesError.message}`,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error processing invitation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process invitation" },
      { status: 500 }
    );
  }
}
