import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Use Service Role key (ONLY on server, NEVER in client)
console.log("Initializing Supabase client...");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  console.log("POST handler triggered");
  try {
    console.log("Parsing formData...");
    const formData = await request.formData();

    console.log("Extracting file from formData...");
    const file = formData.get("file") as File | null;

    if (!file) {
      console.warn("No file found in formData");
      return NextResponse.json(
        { success: false, error: "No file uploaded" },
        { status: 400 }
      );
    }
    console.log("File received:", file.name, "Type:", file.type, "Size:", file.size);

    // Check type
    if (file.type !== "application/pdf") {
      console.warn("File type not allowed:", file.type);
      return NextResponse.json(
        { success: false, error: "Only PDF files are allowed" },
        { status: 400 }
      );
    }

    console.log("Converting file to buffer...");
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    console.log("Buffer created, size:", buffer.length);

    //Unique file path inside "policies" folder in your bucket
    const fileName = `${Date.now()}-${file.name}`;
    console.log("Generated file name:", fileName);

    console.log("Uploading file to Supabase Storage...");
    const { error: uploadError } = await supabase.storage
      .from("policies-bucket")
      .upload(fileName, buffer, {
        contentType: "application/pdf",
        upsert: false, // prevent overwriting
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json(
        {
          success: false,
          error: "Upload failed",
          detail: uploadError.message,
        },
        { status: 500 }
      );
    }

    console.log("Fetching public URL for uploaded file...");
    const { data: { publicUrl } } = supabase.storage
      .from("policies-bucket")
      .getPublicUrl(fileName);

    console.log("File uploaded successfully:", publicUrl);

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName: file.name,
    });
  } catch (error: any) {
    console.error("Server error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Server error",
        detail: error.message,
      },
      { status: 500 }
    );
  }
}
