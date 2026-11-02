"use client";

import React, { useRef, useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Upload,
  Trash2,
  Plus,
  ExternalLink,
  CheckCircle2,
  Loader2,
  X,
  FileCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  mergeReceiptsToPdf,
  isPdfFile,
  isImageFile,
} from "@/lib/receipt-pdf-utils";

interface ReceiptUploaderProps {
  id: string;
  label?: string;
  required?: boolean;
  error?: string;
  receiptFile: File | null;
  previewUrl: string | null;
  onReceiptProcessed: (
    data: { file: File; previewUrl: string } | null
  ) => void;
  disabled?: boolean;
}

export default function ReceiptUploader({
  id,
  label = "Receipt",
  required = true,
  error,
  receiptFile,
  previewUrl,
  onReceiptProcessed,
  disabled = false,
}: ReceiptUploaderProps) {
  const [rawFiles, setRawFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pageCount, setPageCount] = useState<number>(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const appendInputRef = useRef<HTMLInputElement | null>(null);

  // Sync rawFiles if parent clears receiptFile
  useEffect(() => {
    if (!receiptFile && rawFiles.length > 0) {
      setRawFiles([]);
    }
  }, [receiptFile]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const processFiles = async (filesToProcess: File[]) => {
    if (filesToProcess.length === 0) {
      setRawFiles([]);
      onReceiptProcessed(null);
      return;
    }

    setIsProcessing(true);
    try {
      const result = await mergeReceiptsToPdf(filesToProcess);
      setRawFiles(filesToProcess);
      setPageCount(result.pageCount);
      onReceiptProcessed({
        file: result.file,
        previewUrl: result.previewUrl,
      });

      if (filesToProcess.length > 1) {
        toast.success(
          `Merged ${filesToProcess.length} receipts into 1 PDF (${result.pageCount} pages)`
        );
      } else if (!isPdfFile(filesToProcess[0])) {
        toast.success("Receipt image converted to PDF");
      }
    } catch (err: any) {
      console.error("Receipt conversion/merge error:", err);
      toast.error(
        err?.message || "Failed to process receipt into PDF. Please try again."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInitialFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    // Filter valid images or PDFs
    const validFiles = selected.filter(
      (f) => isPdfFile(f) || isImageFile(f)
    );

    if (validFiles.length < selected.length) {
      toast.error("Some files were skipped. Only images and PDFs are supported.");
    }

    if (validFiles.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    await processFiles(validFiles);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAppendFileSelect = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length === 0) return;

    const validFiles = selected.filter(
      (f) => isPdfFile(f) || isImageFile(f)
    );

    if (validFiles.length === 0) {
      if (appendInputRef.current) appendInputRef.current.value = "";
      return;
    }

    const updated = [...rawFiles, ...validFiles];
    await processFiles(updated);
    if (appendInputRef.current) appendInputRef.current.value = "";
  };

  const handleRemoveItem = async (indexToRemove: number) => {
    const updated = rawFiles.filter((_, idx) => idx !== indexToRemove);
    if (updated.length === 0) {
      setRawFiles([]);
      onReceiptProcessed(null);
    } else {
      await processFiles(updated);
    }
  };

  const handleClearAll = () => {
    setRawFiles([]);
    onReceiptProcessed(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (appendInputRef.current) appendInputRef.current.value = "";
  };

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500 ml-0.5">*</span>}
        </Label>
        {receiptFile && !isProcessing && (
          <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> PDF Ready
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-0.5 mb-2">
        Upload single or multiple receipt images / PDFs. They will be automatically converted and merged into a single PDF.
      </p>

      {/* Primary File Input (hidden when receipt already processed) */}
      {!receiptFile && !isProcessing && (
        <div className="mt-1">
          <input
            ref={fileInputRef}
            id={id}
            name={id}
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={handleInitialFileSelect}
            disabled={disabled}
            className="hidden"
          />

          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-5 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:border-blue-400 hover:bg-blue-50/30 ${
              error
                ? "border-red-400 bg-red-50/20"
                : "border-gray-300 bg-gray-50/50"
            }`}
          >
            <div className="p-2.5 rounded-full bg-blue-100 text-blue-600 mb-2">
              <Upload className="w-5 h-5" />
            </div>
            <p className="text-sm font-medium text-gray-800">
              Click to choose receipt(s)
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Supports multiple PNG, JPG, JPEG, or PDF files
            </p>
          </div>
        </div>
      )}

      {/* Loading / Processing State */}
      {isProcessing && (
        <div className="mt-2 p-4 border rounded-lg bg-blue-50/50 border-blue-200 flex items-center justify-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          <span className="text-sm font-medium text-blue-700">
            Converting and merging receipts into PDF...
          </span>
        </div>
      )}

      {/* Merged Receipt Display */}
      {receiptFile && !isProcessing && (
        <div className="mt-2 space-y-2">
          {/* Main Merged PDF Card */}
          <div className="border border-emerald-200 bg-emerald-50/40 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                <FileCheck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 truncate max-w-[280px] sm:max-w-[340px]">
                  {receiptFile.name}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-600 mt-0.5">
                  <span className="bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-medium">
                    PDF Document
                  </span>
                  <span>{formatFileSize(receiptFile.size)}</span>
                  <span>•</span>
                  <span>
                    {pageCount} page{pageCount > 1 ? "s" : ""}
                  </span>
                  {rawFiles.length > 1 && (
                    <>
                      <span>•</span>
                      <span className="text-gray-500">
                        Merged from {rawFiles.length} files
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              {previewUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(previewUrl, "_blank")}
                  className="h-8 gap-1.5 text-xs text-blue-700 border-blue-200 hover:bg-blue-50"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Preview PDF
                </Button>
              )}

              {/* Hidden file input for appending more receipts */}
              <input
                ref={appendInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf"
                onChange={handleAppendFileSelect}
                className="hidden"
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => appendInputRef.current?.click()}
                className="h-8 gap-1 text-xs hover:bg-gray-100"
                title="Add more files to this merged PDF"
              >
                <Plus className="w-3.5 h-3.5" />
                Add More
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                title="Remove and re-upload"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* List of individual source files if user merged multiple */}
          {rawFiles.length > 1 && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5">
              <p className="text-xs font-medium text-gray-600 mb-1.5">
                Included Source Files ({rawFiles.length}):
              </p>
              <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {rawFiles.map((f, idx) => (
                  <div
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded px-2 py-1"
                  >
                    <div className="flex items-center gap-1.5 truncate pr-2">
                      <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate text-gray-700">{f.name}</span>
                      <span className="text-gray-400 shrink-0">
                        ({formatFileSize(f.size)})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-gray-400 hover:text-red-600 p-0.5 rounded transition-colors"
                      title="Remove file from merge"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Validation Error Message */}
      {error && (
        <p id={`${id}-error`} className="text-red-500 text-sm mt-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
