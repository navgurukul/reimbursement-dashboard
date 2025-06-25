interface GoogleDriveUploadResult {
  success: boolean;
  fileId?: string;
  webViewLink?: string;
  error?: string;
}

/**
 * Check if Google Drive is configured
 */
export const isGoogleDriveConfigured = (): boolean => {
  // Since we're using an API route approach, we just need to check
  // if the feature should be enabled in the UI
  return process.env.NEXT_PUBLIC_ENABLE_GOOGLE_DRIVE === "true";
};
console.log("Google Drive config check:", {
  enabled:
    process.env.NEXT_PUBLIC_ENABLE_GOOGLE_DRIVE ||
    process.env.NEXT_PUBLIC_GOOGLE_DRIVE_ENABLED,
});
export const silentUploadToGoogleDrive = async (
  file: File,
  fileName?: string
): Promise<GoogleDriveUploadResult> => {
  try {
    console.log("Starting Google Drive upload via API...");

    // Create form data for the upload
    const formData = new FormData();
    formData.append("file", file, fileName || file.name);

    // Send to API route
    const response = await fetch("/api/upload-receipt", {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "Google Drive upload API failed:",
        response.status,
        errorText
      );
      return {
        success: false,
        error: `Upload failed: ${response.statusText || errorText}`,
      };
    }

    const result = await response.json();
    console.log("File uploaded to Google Drive successfully:", result);

    return {
      success: true,
      fileId: result.fileId,
      webViewLink: result.webViewLink,
    };
  } catch (error) {
    console.error("Google Drive upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
