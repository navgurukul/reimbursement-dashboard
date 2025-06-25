// import { useState, useCallback } from "react";
// import { toast } from "sonner";
// import {
//   uploadToGoogleDrive,
//   uploadMultipleToGoogleDrive,
//   createReceiptFileName,
//   validateGoogleDriveConfig,
// } from "@/lib/googleDriveApi";

// interface UseGoogleDriveReturn {
//   uploading: boolean;
//   uploadFile: (
//     file: File,
//     customFileName?: string
//   ) => Promise<{
//     success: boolean;
//     fileId?: string;
//     webViewLink?: string;
//     error?: string;
//   }>;
//   uploadReceiptFile: (file: File) => Promise<{
//     success: boolean;
//     fileId?: string;
//     webViewLink?: string;
//     error?: string;
//   }>;
//   uploadMultipleFiles: (files: File[]) => Promise<any[]>;
//   isConfigured: boolean;
// }

// export const useGoogleDrive = (): UseGoogleDriveReturn => {
//   const [uploading, setUploading] = useState(false);

//   const isConfigured = validateGoogleDriveConfig();

//   const uploadFile = useCallback(
//     async (file: File, customFileName?: string) => {
//       if (!isConfigured) {
//         const error = "Google Drive is not configured";
//         toast.error(error);
//         return { success: false, error };
//       }

//       setUploading(true);

//       try {
//         const result = await uploadToGoogleDrive(file, customFileName);

//         if (result.success) {
//           toast.success("File uploaded to Google Drive successfully!");
//         } else {
//           toast.error(`Upload failed: ${result.error}`);
//         }

//         return result;
//       } catch (error) {
//         const errorMessage =
//           error instanceof Error ? error.message : "Unknown error";
//         toast.error(`Upload failed: ${errorMessage}`);
//         return { success: false, error: errorMessage };
//       } finally {
//         setUploading(false);
//       }
//     },
//     [isConfigured]
//   );

//   const uploadReceiptFile = useCallback(
//     async (file: File) => {
//       const receiptFileName = createReceiptFileName(file.name);
//       return uploadFile(file, receiptFileName);
//     },
//     [uploadFile]
//   );

//   const uploadMultipleFiles = useCallback(
//     async (files: File[]) => {
//       if (!isConfigured) {
//         toast.error("Google Drive is not configured");
//         return [];
//       }

//       setUploading(true);

//       try {
//         const results = await uploadMultipleToGoogleDrive(files);

//         const successCount = results.filter((r) => r.success).length;
//         const failCount = results.length - successCount;

//         if (failCount === 0) {
//           toast.success(`All ${successCount} files uploaded successfully!`);
//         } else if (successCount === 0) {
//           toast.error(`All ${failCount} files failed to upload`);
//         } else {
//           toast.warning(`${successCount} files uploaded, ${failCount} failed`);
//         }

//         return results;
//       } catch (error) {
//         toast.error("Batch upload failed");
//         return [];
//       } finally {
//         setUploading(false);
//       }
//     },
//     [isConfigured]
//   );

//   return {
//     uploading,
//     uploadFile,
//     uploadReceiptFile,
//     uploadMultipleFiles,
//     isConfigured,
//   };
// };
