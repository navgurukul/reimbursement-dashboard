// src/components/SignatureCanvas.tsx
import React, { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { X, Check, RefreshCw } from "lucide-react";

interface SignatureCanvasProps {
  onSave: (signatureDataUrl: string) => void;
  label: string;
  signatureUrl?: string;
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
}: SignatureCanvasProps) {
  const sigCanvas = useRef<SignaturePadRef | null>(null);
  const [isSigning, setIsSigning] = useState(!signatureUrl);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(
    signatureUrl
  );

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
      onSave(dataURL);
    } catch (error) {
      console.error("Error saving signature:", error);
    }
  };

  const startSigning = () => {
    setIsSigning(true);
    setPreviewUrl(undefined);
    // Allow the canvas to render before clearing
    setTimeout(() => {
      if (sigCanvas.current) {
        sigCanvas.current.clear();
      }
    }, 50);
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
            Redo Signature
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
          <div className="flex justify-end p-2 border-t border-gray-100 bg-gray-50 rounded-b-lg">
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
      ) : previewUrl ? (
        <div className="border border-gray-200 rounded-lg p-2 flex items-center justify-center bg-white">
          <img
            src={previewUrl}
            alt={`${label} signature`}
            className="max-h-24 max-w-full"
          />
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
