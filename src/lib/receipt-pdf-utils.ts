/**
 * Receipt PDF Utility using pdf-lib
 * Supports:
 * - Multiple receipt uploads
 * - Automatic conversion of images (JPG, JPEG, PNG, etc.) into PDF
 * - Merging multiple receipts into a single PDF (each on separate page)
 * - Native PDF page copying with zero quality loss for uploaded PDFs
 * - Clean page preview images generation without browser toolbar
 */

import { PDFDocument } from "pdf-lib";

export interface ProcessedReceiptResult {
  file: File;
  previewUrl: string;
  pageCount: number;
  originalFilesCount: number;
  pageImages: string[];
}

export function isPdfFile(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

export function isImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(jpg|jpeg|png|webp|gif|bmp|svg)$/i.test(file.name)
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load receipt image"));
    img.src = src;
  });
}

async function extractPdfPageImages(file: File): Promise<string[]> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageImages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        await page.render({ canvasContext: ctx, canvas, viewport }).promise;
        pageImages.push(canvas.toDataURL("image/jpeg", 0.88));
      }
    }
    return pageImages;
  } catch (err) {
    console.error("Could not generate page images for PDF preview:", err);
    return [];
  }
}

async function imageToJpegBytes(
  file: File
): Promise<{ bytes: Uint8Array; width: number; height: number; previewUrl: string }> {
  const dataUrl = await fileToDataUrl(file);
  const img = await loadImage(dataUrl);

  const canvas = document.createElement("canvas");
  let width = img.naturalWidth || img.width || 800;
  let height = img.naturalHeight || img.height || 600;

  // Max dimension limit to ensure reasonable file sizes while keeping crisp resolution
  const maxDim = 2400;
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas context 2D not supported");
  }

  // White background for any transparent images
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to convert image to blob"));
      },
      "image/jpeg",
      0.92
    );
  });

  const arrayBuffer = await blob.arrayBuffer();
  return {
    bytes: new Uint8Array(arrayBuffer),
    width,
    height,
    previewUrl: dataUrl,
  };
}

export interface MergePdfOptions {
  label?: string; // e.g. "receipts" (default) or "voucher_attachments"
  customFileName?: string;
}

/**
 * Converts single or multiple receipt files (images or PDFs) into a single merged PDF.
 * Existing PDFs are included page-by-page preserving their native vector/content quality.
 */
export async function mergeReceiptsToPdf(
  files: File[],
  options?: MergePdfOptions
): Promise<ProcessedReceiptResult> {
  if (!files || files.length === 0) {
    throw new Error("No files provided for receipt conversion");
  }

  // Fast path: exactly 1 file and it's already a PDF
  if (files.length === 1 && isPdfFile(files[0])) {
    const singlePdf = files[0];
    const previewUrl = URL.createObjectURL(singlePdf);
    const pdfPageImages = await extractPdfPageImages(singlePdf);

    let count = 1;
    try {
      const buffer = await singlePdf.arrayBuffer();
      const loaded = await PDFDocument.load(buffer, { ignoreEncryption: true });
      count = loaded.getPageCount();
    } catch {
      count = pdfPageImages.length || 1;
    }

    return {
      file: singlePdf,
      previewUrl,
      pageCount: count,
      originalFilesCount: 1,
      pageImages: pdfPageImages,
    };
  }

  // Create merged PDF document
  const mergedPdf = await PDFDocument.create();

  // Standard A4 width in points (210mm = 595.28pt)
  const STANDARD_PAGE_WIDTH = 595.28;
  const MARGIN = 15; // Clean uniform 15pt margin (~5mm)

  const pageImages: string[] = [];

  for (const file of files) {
    if (isPdfFile(file)) {
      // PDF file: copy pages directly without losing content or quality
      try {
        const fileBuffer = await file.arrayBuffer();
        const donorPdf = await PDFDocument.load(fileBuffer, {
          ignoreEncryption: true,
        });
        const copiedPages = await mergedPdf.copyPages(
          donorPdf,
          donorPdf.getPageIndices()
        );
        copiedPages.forEach((page) => mergedPdf.addPage(page));

        const extractedImages = await extractPdfPageImages(file);
        pageImages.push(...extractedImages);
      } catch (err: any) {
        console.error("Failed to load PDF:", file.name, err);
        throw new Error(
          `Failed to process PDF "${file.name}". Please ensure it is not password-protected or corrupted.`
        );
      }
    } else {
      // Image file (JPG, JPEG, PNG, WEBP, etc.): convert & embed into separate page
      try {
        const { bytes, width: imgW, height: imgH, previewUrl } =
          await imageToJpegBytes(file);
        const embeddedImg = await mergedPdf.embedJpg(bytes);

        // Dynamically calculate page height to fit the receipt image snugly
        // with uniform 15pt margin on all four sides. This removes large blank spaces at top and bottom.
        const renderW = STANDARD_PAGE_WIDTH - MARGIN * 2;
        const renderH = (imgH / imgW) * renderW;

        const pageW = STANDARD_PAGE_WIDTH;
        const pageH = Math.round((renderH + MARGIN * 2) * 100) / 100;

        const posX = MARGIN;
        const posY = MARGIN;

        const page = mergedPdf.addPage([pageW, pageH]);
        page.drawImage(embeddedImg, {
          x: posX,
          y: posY,
          width: renderW,
          height: renderH,
        });

        pageImages.push(previewUrl);
      } catch (err: any) {
        console.error("Failed to process image:", file.name, err);
        throw new Error(`Failed to process image "${file.name}".`);
      }
    }
  }

  const pageCount = mergedPdf.getPageCount();
  if (pageCount === 0) {
    throw new Error("Could not extract any pages from the uploaded receipts");
  }

  const mergedPdfBytes = await mergedPdf.save();
  const pdfArrayBuffer = mergedPdfBytes.buffer.slice(
    mergedPdfBytes.byteOffset,
    mergedPdfBytes.byteOffset + mergedPdfBytes.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([pdfArrayBuffer], { type: "application/pdf" });

  let fileName: string;
  const label = options?.label || "receipts";
  if (options?.customFileName) {
    fileName = options.customFileName.endsWith(".pdf")
      ? options.customFileName
      : `${options.customFileName}.pdf`;
  } else if (files.length === 1) {
    const baseName = files[0].name.replace(/\.[^/.]+$/, "");
    fileName = `${baseName}.pdf`;
  } else {
    const baseName = files[0].name.replace(/\.[^/.]+$/, "");
    fileName = `${baseName}_merged_${files.length}_${label}.pdf`;
  }

  const mergedFile = new File([blob], fileName, {
    type: "application/pdf",
    lastModified: Date.now(),
  });

  const previewUrl = URL.createObjectURL(blob);

  return {
    file: mergedFile,
    previewUrl,
    pageCount,
    originalFilesCount: files.length,
    pageImages,
  };
}
