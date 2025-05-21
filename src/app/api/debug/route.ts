// src/app/api/invite/route.ts
import { NextRequest, NextResponse } from "next/server";
import { invites } from "@/lib/db";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  try {
    const { email, role, orgId, orgName } = await req.json();

    // Validate request
    if (!email || !role || !orgId || !orgName) {
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
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      "https://reimbursement.navgurukul.org";
    const signupUrl = `${baseUrl}/auth/signup?token=${inviteRow.id}`;

    // Configure Nodemailer transporter using NEXT_PUBLIC_ variables
    const transporter = nodemailer.createTransport({
      host: process.env.NEXT_PUBLIC_SMTP_HOST,
      port: parseInt(process.env.NEXT_PUBLIC_SMTP_PORT || "465"),
      secure: process.env.NEXT_PUBLIC_SMTP_SECURE === "true",
      auth: {
        user: process.env.NEXT_PUBLIC_SMTP_USER,
        pass: process.env.NEXT_PUBLIC_SMTP_PASSWORD,
      },
    });

    // Log the configuration for debugging
    console.log("SMTP Configuration:", {
      host: process.env.NEXT_PUBLIC_SMTP_HOST,
      port: process.env.NEXT_PUBLIC_SMTP_PORT,
      secure: process.env.NEXT_PUBLIC_SMTP_SECURE,
      user: process.env.NEXT_PUBLIC_SMTP_USER ? "(set)" : "(not set)",
      pass: process.env.NEXT_PUBLIC_SMTP_PASSWORD ? "(set)" : "(not set)",
    });

    // Email content
    const mailOptions = {
      from:
        process.env.NEXT_PUBLIC_SMTP_FROM ||
        `"Reimbursement App" <${process.env.NEXT_PUBLIC_SMTP_USER}>`,
      to: email,
      subject: `You've been invited to join ${orgName} on the Reimbursement App`,
      text: `You've been invited to join ${orgName} as a ${role} on the Reimbursement App. Click here to accept: ${signupUrl}`,
      html: `
        <!DOCTYPE html>
        <html>
        <!-- Your HTML email template -->
        </html>
      `,
    };

    try {
      // Send the email using Nodemailer
      const info = await transporter.sendMail(mailOptions);
      console.log("Email sent:", info.messageId);

      return NextResponse.json({
        success: true,
        inviteId: inviteRow.id,
        message: "Invitation email sent successfully",
      });
    } catch (emailError: any) {
      console.error("Error sending email with Nodemailer:", emailError);
      return NextResponse.json(
        {
          success: false,
          inviteId: inviteRow.id,
          error: `Invite created but email failed: ${emailError.message}`,
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
