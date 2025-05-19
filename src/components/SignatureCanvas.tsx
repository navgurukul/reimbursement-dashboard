// src/components/SignatureCanvas.tsx
import React, { useRef, useState, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { X, Check, RefreshCw } from "lucide-react";

interface SignatureCanvasProps {
  onSave: (signatureDataUrl: string) => void;
  label: string;
  signatureUrl?: string;
  userSignatureUrl?: string; // Add this - for prefilled user signature
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
  const [isSigning, setIsSigning] = useState(
    !signatureUrl && !userSignatureUrl
  );
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(
    signatureUrl || userSignatureUrl
  );
  const [useExistingSignature, setUseExistingSignature] = useState(
    Boolean(userSignatureUrl && !signatureUrl)
  );

  useEffect(() => {
    // If we get a user signature and no current signature, use the user signature
    if (userSignatureUrl && !signatureUrl && !previewUrl) {
      setPreviewUrl(userSignatureUrl);
      setIsSigning(false);
      setUseExistingSignature(true);
      // Also pass the signature back to the parent component
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
      // Use a lower quality to reduce size
      const dataURL = sigCanvas.current
        .getTrimmedCanvas()
        .toDataURL("image/png", 0.8);
      setPreviewUrl(dataURL);
      setIsSigning(false);
      setUseExistingSignature(false); // Now using new signature
      onSave(dataURL);
    } catch (error) {
      console.error("Error saving signature:", error);
    }
  };

  const startSigning = () => {
    setIsSigning(true);
    setPreviewUrl(undefined);
    setUseExistingSignature(false);
    // Allow the canvas to render before clearing
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
            Redraw Signature
          </Button>
        )}
      </div>

      {isSigning ? (
        <div className="border border-gray-200 rounded-lg bg-white">
          <SignatureCanvas
            ref={sigCanvas as React.RefObject<SignatureCanvas>}
            penColor="black"
            canvasProps={{
              className: "w-full h-32 rounded-lg",
              style: { width: "100%", height: "128px" },
            }}
          />
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
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clear}
                className="mr-2"
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
            </div>
          </div>
        </div>
      ) : previewUrl ? (
        <div className="border border-gray-200 rounded-lg p-2 flex items-center justify-center bg-white">
          <img
            src={previewUrl}
            alt={`${label} signature`}
            className="max-h-24 max-w-full"
          />
          {useExistingSignature && (
            <span className="absolute top-0 right-0 bg-blue-100 text-blue-700 text-xs py-0.5 px-2 rounded-bl-md rounded-tr-md">
              Saved
            </span>
          )}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg p-4 h-32 flex flex-col items-center justify-center bg-gray-50">
          <p className="text-sm text-gray-500">No signature</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={startSigning}
            className="mt-2"
          >
            Click to sign
          </Button>
        </div>
      )}
    </div>
  );
}
