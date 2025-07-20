import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import supabase from "./supabase";


export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}


export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'INR',
  }).format(amount)
}


export function dataURLtoBlob(dataURL: string): Blob {
  // Convert base64/URLEncoded data component to raw binary data
  let byteString;
  if (dataURL.split(",")[0].indexOf("base64") >= 0) {
    byteString = atob(dataURL.split(",")[1]);
  } else {
    byteString = decodeURIComponent(dataURL.split(",")[1]);
  }

  // Separate out the mime component
  const mimeString = dataURL.split(",")[0].split(":")[1].split(";")[0];

  // Write the bytes of the string to a typed array
  const ia = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  return new Blob([ia], { type: mimeString });
}

/**
 * Uploads a signature to Supabase Storage
 */
export async function uploadSignature(
  dataURL: string,
  userId: string,
  orgId: string,
  type: "user" | "approver"
): Promise<{ path: string; error: Error | null }> {
  try {
    if (!dataURL) {
      console.error(`Empty signature data URL for ${type}`);
      return { path: "", error: new Error("Empty signature data") };
    }

    if (!dataURL.startsWith("data:image/")) {
      console.error(
        `Invalid signature format for ${type}: ${dataURL.substring(0, 30)}`
      );
      return {
        path: "",
        error: new Error("Invalid signature format - must be a data URL"),
      };
    }

    // Convert to blob
    const blob = dataURLtoBlob(dataURL);

    // Make sure blob is valid
    if (blob.size === 0) {
      console.error(`Empty signature blob for ${type}`);
      return { path: "", error: new Error("Empty signature") };
    }

    // Create a unique filename
    const timestamp = new Date().getTime();
    const randomString = Math.random().toString(36).substring(2, 10);
    const filePath = `${userId}.png`;

    console.log(`Uploading ${type} signature to ${filePath}`);

    // Upload to Supabase
    const { error } = await supabase.storage
      .from("user-signatures")
      .upload(filePath, blob, {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: true, // Overwrite if exists
      });

    if (error) {
      console.error(`Error uploading ${type} signature:`, error);
      return { path: "", error: new Error(error.message) };
    }

    console.log(`${type} signature uploaded successfully to ${filePath}`);
    return { path: filePath, error: null };
  } catch (error) {
    console.error(`Error processing ${type} signature:`, error);
    return {
      path: "",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}


// Updated uploadProfileSignature function for utils.ts
export async function uploadProfileSignature(
  dataURL: string,
  userId: string,
  orgId: string
): Promise<{ path: string; error: Error | null }> {
  try {
    if (!dataURL || !dataURL.startsWith("data:image/")) {
      throw new Error("Invalid signature data URL");
    }

    // Convert to blob
    const blob = dataURLtoBlob(dataURL);

    // Make sure blob is valid
    if (blob.size === 0) {
      throw new Error("Empty signature");
    }

    // Create a filename with org/user path structure
    const timestamp = new Date().getTime();
    const randomString = Math.random().toString(36).substring(2, 10);

    // Important: Create directories for organization and user if they don't exist
    const filePath = `${userId}.png`;

    console.log(`Uploading profile signature to ${filePath}`);

    // Upload to Supabase - using user-signatures bucket
    const { data, error } = await supabase.storage
      .from("user-signatures")
      .upload(filePath, blob, {
        contentType: "image/png",
        cacheControl: "3600",
        // Make it public - often helps with permission issues
        upsert: true
      });

    if (error) {
      console.error(`Error uploading profile signature:`, error);
      return { path: "", error: new Error(error.message) };
    }

    console.log(`Profile signature uploaded successfully to ${filePath}`);
    return { path: filePath, error: null };
  } catch (error) {
    console.error(`Error processing profile signature:`, error);
    return {
      path: "",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}





export async function updateProfileWithSignature(
  userId: string,
  signaturePath: string
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from("profiles")
      .update({ signature_url: signaturePath })
      .eq("user_id", userId);

    if (error) {
      console.error("Error updating profile with signature:", error);
      return { success: false, error: new Error(error.message) };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error("Error in updateProfileWithSignature:", error);
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
/**
 * Gets a download URL for a user signature from user-signatures bucket
 */
export async function getProfileSignatureUrl(
  path: string
): Promise<{ url: string; error: Error | null }> {
  try {
    const { data, error } = await supabase.storage
      .from("user-signatures")
      .createSignedUrl(path, 3600); // URL valid for 1 hour

    if (error) {
      return { url: "", error: new Error(error.message) };
    }

    return { url: data.signedUrl, error: null };
  } catch (error) {
    console.error("Error getting profile signature URL:", error);
    return {
      url: "",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}


// In utils.ts or a new file called signature-utils.ts

/**
 * Complete function to upload a signature and update the user's profile
 */
export async function saveUserSignature(
  dataURL: string,
  userId: string,
  orgId: string
): Promise<{ success: boolean; path: string; error: Error | null }> {
  try {
    console.log('Starting signature save process...');

    if (!dataURL || !dataURL.startsWith("data:image/")) {
      console.error("Invalid signature data URL");
      return { success: false, path: "", error: new Error("Invalid signature data") };
    }

    // Step 1: Convert to blob
    const blob = dataURLtoBlob(dataURL);
    if (blob.size === 0) {
      console.error("Empty signature blob");
      return { success: false, path: "", error: new Error("Empty signature") };
    }

    // Step 2: Create a unique filename
    const timestamp = new Date().getTime();
    const randomString = Math.random().toString(36).substring(2, 10);

    // Store in userId.png format
    const filePath = `${userId}.png`;
    console.log(`Uploading signature to path: ${filePath}`);

    // Step 3: Upload the signature to storage
    const { error: uploadError } = await supabase.storage
      .from("user-signatures")
      .upload(filePath, blob, {
        contentType: "image/png",
        upsert: true
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return {
        success: false,
        path: "",
        error: new Error(`Upload failed: ${uploadError.message}`)
      };
    }

    console.log("Signature file uploaded successfully");

    // Step 4: Update the user's profile with the signature path
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ signature_url: filePath })
      .eq("user_id", userId);

    if (updateError) {
      console.error("Profile update error:", updateError);
      return {
        success: false,
        path: filePath, // We did upload the file, so return the path
        error: new Error(`Profile update failed: ${updateError.message}`)
      };
    }

    console.log("Profile updated successfully with signature path");
    return { success: true, path: filePath, error: null };
  } catch (error) {
    console.error("Unexpected error in saveUserSignature:", error);
    return {
      success: false,
      path: "",
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}

/**
 * Function to get the user's saved signature URL
 */
export async function getUserSignatureUrl(
  userId: string
): Promise<{ url: string | null; error: Error | null }> {
  try {
    console.log("Fetching signature for user:", userId);

    // Step 1: Get the signature path from the user's profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("signature_url")
      .eq("user_id", userId)
      .single();

    if (profileError) {
      console.error("Error fetching profile:", profileError);
      return { url: null, error: new Error(`Profile fetch failed: ${profileError.message}`) };
    }

    if (!profile || !profile.signature_url) {
      console.log("No signature found in profile");
      return { url: null, error: null };
    }

    console.log("Found signature path:", profile.signature_url);

    // Step 2: Get a download URL for the signature
    const { data: urlData, error: urlError } = await supabase.storage
      .from("user-signatures")
      .createSignedUrl(profile.signature_url, 3600);

    if (urlError) {
      console.error("Error creating signed URL:", urlError);
      return { url: null, error: new Error(`URL creation failed: ${urlError.message}`) };
    }

    if (!urlData || !urlData.signedUrl) {
      console.log("No signed URL returned");
      return { url: null, error: new Error("No URL returned from storage") };
    }

    console.log("Successfully retrieved signature URL");
    return { url: urlData.signedUrl, error: null };
  } catch (error) {
    console.error("Unexpected error in getUserSignatureUrl:", error);
    return {
      url: null,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}



// export async function uploadPdf(file: File, filePath: string): Promise<{ path: string | null; error: Error | null }> {
//   try {
//     const { data, error } = await supabase.storage
//       .from("policies-bucket")
//       .upload(filePath, file, {
//         contentType: "application/pdf",
//         upsert: true,
//       });

//     if (error) return { path: null, error: new Error(error.message) };
//     return { path: data?.path ?? null, error: null };
//   } catch (err) {
//     return { path: null, error: err instanceof Error ? err : new Error(String(err)) };
//   }
// }

// export function getPdfPublicUrl(filePath: string): string {
//   const { data } = supabase.storage.from("policies-bucket").getPublicUrl(filePath);
//   return data?.publicUrl ?? "";
// }


import { SupabaseClient } from '@supabase/supabase-js';

// Define a return type for better type safety
type UploadResult = {
  path: string | null;
  publicUrl: string | null;
  error: Error | null;
};

export async function uploadPdf(
  supabase: SupabaseClient,
  file: File,
  filePath: string,
  options?: {
    upsert?: boolean;
    cacheControl?: string;
  }
): Promise<UploadResult> {
  // Validate inputs
  if (!file || !(file instanceof File)) {
    return {
      path: null,
      publicUrl: null,
      error: new Error('Invalid file provided'),
    };
  }

  if (!filePath) {
    return {
      path: null,
      publicUrl: null,
      error: new Error('File path is required'),
    };
  }

  // Validate file type
  if (!file.type.includes('pdf')) {
    return {
      path: null,
      publicUrl: null,
      error: new Error('Only PDF files are allowed'),
    };
  }

  // Validate file size (5MB limit)
  if (file.size > 5 * 1024 * 1024) {
    return {
      path: null,
      publicUrl: null,
      error: new Error('File size exceeds 5MB limit'),
    };
  }

  try {
    // Upload the file
    const { data, error } = await supabase.storage
      .from('policies-bucket')
      .upload(filePath, file, {
        contentType: 'application/pdf',
        upsert: options?.upsert ?? false,
        cacheControl: options?.cacheControl ?? '3600', // 1 hour cache
      });

    if (error) {
      return {
        path: null,
        publicUrl: null,
        error: new Error(`Upload failed: ${error.message}`),
      };
    }

    // Get public URL
    const publicUrl = getPdfPublicUrl(supabase, data.path);

    return {
      path: data.path,
      publicUrl,
      error: null,
    };
  } catch (err) {
    return {
      path: null,
      publicUrl: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

export function getPdfPublicUrl(
  supabase: SupabaseClient,
  filePath: string
): string {
  if (!filePath) return '';

  try {
    const { data } = supabase.storage
      .from('policies-bucket')
      .getPublicUrl(filePath);
    return data?.publicUrl ?? '';
  } catch (err) {
    console.error('Error generating public URL:', err);
    return '';
  }
}