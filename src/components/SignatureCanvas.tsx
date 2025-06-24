// src/components/SignatureCanvas.tsx
import React, { useRef, useState, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { X, Check, RefreshCw, Upload, Pen } from "lucide-react";

interface SignatureCanvasProps {
  onSave: (signatureDataUrl: string) => void;
  label: string;
  signatureUrl?: string;
  userSignatureUrl?: string;
}

type SignaturePadRef = SignatureCanvas & {
  clear: () => void;
  isEmpty: () => boolean;
  getTrimmedCanvas: () => HTMLCanvasElement;
};

export default function SignaturePad({
  onSave,
  label,
  signatureUrl,
  userSignatureUrl,
}: SignatureCanvasProps) {
  const sigCanvas = useRef<SignaturePadRef | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSigning, setIsSigning] = useState(
    !signatureUrl && !userSignatureUrl
  );
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(
    signatureUrl || userSignatureUrl
  );
  const [useExistingSignature, setUseExistingSignature] = useState(
    Boolean(userSignatureUrl && !signatureUrl)
  );
  const [signatureMode, setSignatureMode] = useState<"draw" | "upload">("draw");
  const [uploadError, setUploadError] = useState<string>("");

  useEffect(() => {
    if (userSignatureUrl && !signatureUrl && !previewUrl) {
      setPreviewUrl(userSignatureUrl);
      setIsSigning(false);
      setUseExistingSignature(true);
      if (userSignatureUrl !== previewUrl) {
        onSave(userSignatureUrl);
      }
    }
  }, [userSignatureUrl, signatureUrl, previewUrl, onSave]);

  const clear = () => {
    if (sigCanvas.current) {
      sigCanvas.current.clear();
    }
  };

  const save = () => {
    if (!sigCanvas.current || sigCanvas.current.isEmpty()) {
      return;
    }

    try {
      const dataURL = sigCanvas.current
        .getTrimmedCanvas()
        .toDataURL("image/png", 0.8);
      setPreviewUrl(dataURL);
      setIsSigning(false);
      setUseExistingSignature(false);
      onSave(dataURL);
    } catch (error) {
      console.error("Error saving signature:", error);
    }
  };

  const startSigning = () => {
    setIsSigning(true);
    setPreviewUrl(undefined);
    setUseExistingSignature(false);
    setSignatureMode("draw");
    setUploadError("");
    setTimeout(() => {
      if (sigCanvas.current) {
        sigCanvas.current.clear();
      }
    }, 50);
  };

  const useExisting = () => {
    if (userSignatureUrl) {
      setPreviewUrl(userSignatureUrl);
      setIsSigning(false);
      setUseExistingSignature(true);
      onSave(userSignatureUrl);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadError("");

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setUploadError("Please upload an image file (PNG, JPG, GIF, etc.)");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image size should be less than 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) {
        // Create an image to validate and process
        const img = new Image();
        img.onload = () => {
          try {
            // Create a canvas to process the image
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            if (!ctx) {
              setUploadError("Failed to process image");
              return;
            }

            // Set reasonable dimensions for signatures
            const maxWidth = 400;
            const maxHeight = 200;

            let { width, height } = img;

            // Scale down if too large while maintaining aspect ratio
            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = width * ratio;
              height = height * ratio;
            }

            canvas.width = width;
            canvas.height = height;

            // Fill with white background
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, width, height);

            // Draw the image
            ctx.drawImage(img, 0, 0, width, height);

            // Get the processed image as data URL
            const processedDataUrl = canvas.toDataURL("image/png", 0.8);

            setPreviewUrl(processedDataUrl);
            setIsSigning(false);
            setUseExistingSignature(false);
            setUploadError("");
            onSave(processedDataUrl);
          } catch (error) {
            console.error("Error processing uploaded image:", error);
            setUploadError("Failed to process uploaded image");
          }
        };

        img.onerror = () => {
          setUploadError("Invalid image file");
        };

        img.src = result;
      }
    };

    reader.onerror = () => {
      setUploadError("Failed to read file");
    };

    reader.readAsDataURL(file);

    // Clear the input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const switchToUpload = () => {
    setSignatureMode("upload");
    setUploadError("");
  };

  const switchToDraw = () => {
    setSignatureMode("draw");
    setUploadError("");
  };

  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <p className="text-sm font-medium text-gray-700">{label}</p>
        {!isSigning && previewUrl && (
          <Button
            variant="outline"
            size="sm"
            onClick={startSigning}
            className="text-xs"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Change Signature
          </Button>
        )}
      </div>

      {isSigning ? (
        <div className="border border-gray-200 rounded-lg bg-white">
          {/* Mode Selection */}
          <div className="flex border-b border-gray-100 bg-gray-50 rounded-t-lg">
            <button
              type="button"
              onClick={switchToDraw}
              className={`flex-1 flex items-center justify-center py-2 px-4 text-sm font-medium transition-colors ${
                signatureMode === "draw"
                  ? "bg-white text-black border-b-2 border-black"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Pen className="h-4 w-4 mr-2" />
              Draw
            </button>
            <button
              type="button"
              onClick={switchToUpload}
              className={`flex-1 flex items-center justify-center py-2 px-4 text-sm font-medium transition-colors ${
                signatureMode === "upload"
                  ? "bg-white text-black border-b-2 border-black"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </button>
          </div>

          {/* Content Area */}
          <div className="relative">
            {/* Drawing Canvas */}
            {signatureMode === "draw" && (
              <SignatureCanvas
                ref={sigCanvas as React.RefObject<SignatureCanvas>}
                penColor="black"
                canvasProps={{
                  className: "w-full h-32",
                  style: { width: "100%", height: "128px" },
                }}
              />
            )}

            {/* Upload Area */}
            {signatureMode === "upload" && (
              <div
                className="h-32 flex items-center justify-center border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors cursor-pointer"
                onClick={triggerFileUpload}
              >
                <div className="text-center">
                  <Upload className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600 mb-1">
                    Click to upload signature image
                  </p>
                  <p className="text-xs text-gray-500">PNG, JPG up to 5MB</p>
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {uploadError && (
            <div className="p-2 bg-red-50 border-t border-red-200">
              <p className="text-sm text-red-600">{uploadError}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between p-2 border-t border-gray-100 bg-gray-50 rounded-b-lg">
            <div>
              {userSignatureUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={useExisting}
                  className="mr-2"
                >
                  Use Existing
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {signatureMode === "draw" && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clear}
                  >
                    <X className="h-4 w-4 mr-1" /> Clear
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={save}
                    className="bg-black text-white hover:bg-black/90"
                  >
                    <Check className="h-4 w-4 mr-1" /> Save
                  </Button>
                </>
              )}
              {signatureMode === "upload" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={triggerFileUpload}
                >
                  <Upload className="h-4 w-4 mr-1" /> Choose File
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : previewUrl ? (
        <div className="border border-gray-200 rounded-lg p-2 flex items-center justify-center bg-white relative">
          <img
            src={previewUrl}
            alt={`${label} signature`}
            className="max-h-24 max-w-full"
          />
          {useExistingSignature && (
            <span className="absolute top-1 right-1 bg-blue-100 text-blue-700 text-xs py-0.5 px-2 rounded">
              Saved
            </span>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg p-4 h-32 flex flex-col items-center justify-center bg-gray-50">
          <p className="text-sm text-gray-500 mb-2">No signature</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={startSigning}
            >
              <Pen className="h-4 w-4 mr-1" />
              Draw
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setIsSigning(true);
                setSignatureMode("upload");
                setTimeout(triggerFileUpload, 100);
              }}
            >
              <Upload className="h-4 w-4 mr-1" />
              Upload
            </Button>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  );
}
