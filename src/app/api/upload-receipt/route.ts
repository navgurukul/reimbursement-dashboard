// app/api/upload-receipt/route.ts
import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { JWT } from "google-auth-library";
import fetch from "node-fetch";

export async function POST(request: NextRequest) {
  try {
    console.log("Receipt upload API called");

    // Get credentials
    const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    // Check credentials
    if (!clientEmail || !privateKeyRaw || !folderId) {
      console.error("Missing Google Drive configuration");
      return NextResponse.json(
        {
          success: false,
          error: "Google Drive configuration missing",
          details: {
            hasClientEmail: !!clientEmail,
            hasPrivateKey: !!privateKeyRaw,
            hasFolderId: !!folderId,
          },
        },
        { status: 500 }
      );
    }

    // Process form data
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      console.error("No file provided in request");
      return NextResponse.json(
        {
          success: false,
          error: "No file provided",
        },
        { status: 400 }
      );
    }

    console.log("File received:", {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    // Create timestamp-based filename
    const timestamp = new Date().toISOString().split("T")[0];
    const timeString = new Date()
      .toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      })
      .replace(":", "");

    const uniqueFileName = `receipt_${timestamp}_${timeString}_${file.name}`;

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log("File converted to buffer, size:", buffer.length);

    // Setup Google Drive API - Get access token
    const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

    const auth = new JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/drive.file"],
    });

    // Get access token
    const credentials = await auth.authorize();
    const accessToken = credentials.access_token;

    if (!accessToken) {
      console.error("Failed to get access token");
      return NextResponse.json(
        {
          success: false,
          error: "Authentication failed - could not get access token",
        },
        { status: 500 }
      );
    }

    console.log("Obtained access token, creating resumable upload session...");

    // Create a resumable upload session
    const sessionResponse = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": file.type || "application/octet-stream",
          "X-Upload-Content-Length": buffer.length.toString(),
        },
        body: JSON.stringify({
          name: uniqueFileName,
          parents: [folderId],
        }),
      }
    );

    if (!sessionResponse.ok) {
      const errorText = await sessionResponse.text();
      console.error("Failed to create upload session:", errorText);
      return NextResponse.json(
        {
          success: false,
          error: `Failed to create upload session: ${sessionResponse.status} ${errorText}`,
        },
        { status: 500 }
      );
    }

    // Get the upload URL from the Location header
    const uploadUrl = sessionResponse.headers.get("Location");

    if (!uploadUrl) {
      console.error("No upload URL returned from session creation");
      return NextResponse.json(
        {
          success: false,
          error: "Failed to get upload URL from Google Drive API",
        },
        { status: 500 }
      );
    }

    console.log("Upload URL obtained, uploading file...");

    // Upload the file
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "Content-Length": buffer.length.toString(),
      },
      body: buffer,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error("Upload failed:", errorText);
      return NextResponse.json(
        {
          success: false,
          error: `Upload failed: ${uploadResponse.status} ${errorText}`,
        },
        { status: 500 }
      );
    }

    // Parse the response
    const uploadResult = await uploadResponse.json() as { id: string };

    console.log("File uploaded successfully:", uploadResult);

    // Get the file link
    const drive = google.drive({ version: "v3", auth });
    const fileInfo = await drive.files.get({
      fileId: uploadResult.id,
      fields: "webViewLink",
    });

    return NextResponse.json({
      success: true,
      fileId: uploadResult.id,
      webViewLink: fileInfo.data.webViewLink,
      fileName: uniqueFileName,
    });
  } catch (error) {
    console.error("Google Drive upload error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
