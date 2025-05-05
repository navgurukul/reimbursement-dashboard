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
    currency: 'USD',
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
    if (!dataURL || !dataURL.startsWith("data:image/")) {
      throw new Error("Invalid signature data URL");
    }

    // Convert to blob
    const blob = dataURLtoBlob(dataURL);

    // Make sure blob is valid
    if (blob.size === 0) {
      throw new Error("Empty signature");
    }

    // Create a unique filename
    const timestamp = new Date().getTime();
    const randomString = Math.random().toString(36).substring(2, 10);
    const fileName = `sig_${type}_${timestamp}_${randomString}.png`;
    const filePath = `${userId}/${orgId}/${fileName}`;

    console.log(`Uploading ${type} signature to ${filePath}`);

    // Upload to Supabase
    const { error } = await supabase.storage
      .from("voucher-signatures")
      .upload(filePath, blob, {
        contentType: "image/png",
        cacheControl: "3600",
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



