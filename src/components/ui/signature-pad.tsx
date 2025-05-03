"use client";

import { useRef, useState, useEffect } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Button } from "./button";
import { Trash2 } from "lucide-react";
import { vouchers } from "@/lib/db";
import VoucherForm from "../../expenses/new/VoucherForm";

interface SignaturePadProps {
  onSave: (signature: string) => void;
  disabled?: boolean;
  label: string;
  defaultValue?: string;
}

export function SignaturePad({
  onSave,
  disabled = false,
  label,
  defaultValue,
}: SignaturePadProps) {
  const sigCanvas = useRef<SignatureCanvas>(null);
  const [hasSignature, setHasSignature] = useState(!!defaultValue);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadSignature = async () => {
      if (defaultValue && !defaultValue.startsWith("data:")) {
        // It's a path, get the signed URL
        const { url, error } = await vouchers.getSignatureUrl(defaultValue);
        if (!error && url) {
          setSignatureUrl(url);
        }
      }
    };
    loadSignature();
  }, [defaultValue]);

  const clear = () => {
    if (sigCanvas.current) {
      sigCanvas.current.clear();
      setHasSignature(false);
      setSignatureUrl(null);
      onSave("");
    }
  };

  const save = () => {
    if (sigCanvas.current) {
      setTimeout(() => {
        const signature = sigCanvas.current.toDataURL("image/png");
        // Log the full base64 string for debugging
        console.log("[SignaturePad] Captured signature:", signature);
        setHasSignature(true);
        onSave(signature);
      }, 100); // 100ms delay
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {hasSignature && !disabled && (
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="border rounded-lg overflow-hidden">
        <SignatureCanvas
          ref={sigCanvas}
          penColor={disabled ? "transparent" : "black"}
          canvasProps={{
            className: "w-full h-32 bg-white",
            style: { display: hasSignature && defaultValue ? "none" : "block" },
          }}
          onEnd={save}
        />
        {hasSignature && (defaultValue || signatureUrl) && (
          <img
            src={signatureUrl || defaultValue}
            alt="Signature"
            className="w-full h-32 object-contain bg-white"
          />
        )}
      </div>
    </div>
  );
}
