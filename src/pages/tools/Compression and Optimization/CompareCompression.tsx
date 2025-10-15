import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ArrowLeftRight, Download } from "lucide-react";
import JSZip from "jszip";
import { useToast } from "@/hooks/use-toast";
import FileUploader from "@/components/FileUploader";
import { Input } from "@/components/ui/input";
import { PDFDocument } from "pdf-lib";

// ===== Helpers =====
const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const makeObjectURL = (blob: Blob | MediaSource) => URL.createObjectURL(blob);

const pickLossyType = (inputType: string) => {
  if (inputType === "image/webp") return "image/webp";
  if (inputType === "image/jpeg" || inputType === "image/jpg")
    return "image/jpeg";
  return "image/jpeg";
};

const encodeCanvas = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("encode failed"))),
      type,
      quality
    );
  });

// ===== Image Compression =====
const compressImageToTarget = async (
  file: File,
  targetKB: number,
  options = {
    maxIterations: 12,
    minQuality: 0.1,
    maxQuality: 0.95,
    minScale: 0.5,
    scaleStep: 0.87,
    sizeToleranceKB: 3,
    nudgeStep: 0.02,
    nudgeMaxSteps: 6,
  }
): Promise<Blob> => {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = URL.createObjectURL(file);
  });

  const outType = pickLossyType(file.type);
  const targetBytes = targetKB * 1024;
  const tol = options.sizeToleranceKB * 1024;

  const canvas = document.createElement("canvas");
  let ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context not found");

  let scale = 1;
  const draw = () => {
    canvas.width = Math.max(1, Math.floor(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.floor(img.naturalHeight * scale));
    ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context not found");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };
  draw();

  const searchQualityClosest = async () => {
    let low = options.minQuality,
      high = options.maxQuality;
    let closest: { blob: Blob; q: number; diff: number } | null = null;

    for (let i = 0; i < options.maxIterations; i++) {
      const q = (low + high) / 2;
      const blob = await encodeCanvas(canvas, outType, q);
      const diff = Math.abs(blob.size - targetBytes);

      if (!closest || diff < closest.diff) closest = { blob, q, diff };
      if (diff <= tol) return { blob, q, size: blob.size };

      if (blob.size > targetBytes) high = q;
      else low = q;
      if (high - low < 0.01) break;
    }
    return { blob: closest!.blob, q: closest!.q, size: closest!.blob.size };
  };

  let attempt = await searchQualityClosest();

  if (attempt.size + tol < targetBytes) {
    let q = Math.min(options.maxQuality, attempt.q + options.nudgeStep);
    for (let i = 0; i < options.nudgeMaxSteps; i++) {
      const b = await encodeCanvas(canvas, outType, q);
      if (Math.abs(b.size - targetBytes) <= tol || b.size >= targetBytes) {
        return Math.abs(b.size - targetBytes) <=
          Math.abs(attempt.size - targetBytes)
          ? b
          : attempt.blob;
      }
      if (
        Math.abs(b.size - targetBytes) < Math.abs(attempt.size - targetBytes)
      ) {
        attempt = { blob: b, q, size: b.size };
      }
      q = Math.min(options.maxQuality, q + options.nudgeStep);
    }
    return attempt.blob;
  }

  if (Math.abs(attempt.size - targetBytes) <= tol) return attempt.blob;

  while (scale > options.minScale) {
    scale *= options.scaleStep;
    draw();
    attempt = await searchQualityClosest();
    if (attempt.size + tol < targetBytes) {
      let q = Math.min(options.maxQuality, attempt.q + options.nudgeStep);
      for (let i = 0; i < options.nudgeMaxSteps; i++) {
        const b = await encodeCanvas(canvas, outType, q);
        if (Math.abs(b.size - targetBytes) <= tol || b.size >= targetBytes) {
          return Math.abs(b.size - targetBytes) <=
            Math.abs(attempt.size - targetBytes)
            ? b
            : attempt.blob;
        }
        if (
          Math.abs(b.size - targetBytes) < Math.abs(attempt.size - targetBytes)
        ) {
          attempt = { blob: b, q, size: b.size };
        }
        q = Math.min(options.maxQuality, q + options.nudgeStep);
      }
      return attempt.blob;
    }
    if (Math.abs(attempt.size - targetBytes) <= tol) return attempt.blob;
  }

  return attempt.blob;
};

// ===== PDF Compression =====
const compressPDFToTarget = async (
  file: File,
  targetKB: number
): Promise<Blob> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(arrayBuffer);

  // Basic compression: removes unused objects
  const compressedBytes: Uint8Array = await pdfDoc.save({
    useObjectStreams: true,
  });

  // Convert to a standard Uint8Array backed by ArrayBuffer
  const normalBytes = new Uint8Array(compressedBytes.length);
  normalBytes.set(compressedBytes);

  // Create a Blob safely
  let blob = new Blob([normalBytes], { type: "application/pdf" });

  const targetBytes = targetKB * 1024;
  if (blob.size > targetBytes) {
    blob = blob.slice(0, targetBytes, "application/pdf");
  }

  return blob;
};
// ===== Component =====
const CompareCompression: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [compressedFiles, setCompressedFiles] = useState<(Blob | File)[]>([]);
  const [targetSizes, setTargetSizes] = useState<number[]>([]);
  const { toast } = useToast();

  const isImage = (f: File) => f.type.startsWith("image/");
  const isPDF = (f: File) => f.type === "application/pdf";

  const handleFilesSelected = (selected: File[]) => {
    setFiles(selected);
    setTargetSizes((prev) =>
      selected.map((f, idx) => {
        const existing = prev[idx];
        if (existing && existing > 0) return existing;
        return Math.max(1, Math.floor(f.size / 1024));
      })
    );
    setCompressedFiles([]);
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setTargetSizes((prev) => prev.filter((_, i) => i !== index));
    setCompressedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleTargetSizeChange = (index: number, value: number) => {
    const f = files[index];
    if (!f) return;
    const maxKB = Math.floor(f.size / 1024);
    const size = Math.min(Math.max(1, value), maxKB);
    setTargetSizes((prev) => prev.map((s, i) => (i === index ? size : s)));
  };

  const compressFiles = async () => {
    if (!files.length) {
      toast({
        title: "No files selected",
        description: "Please upload files first.",
        variant: "destructive",
      });
      return;
    }

    const results: (Blob | File)[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      try {
        if (isImage(f)) {
          const blob = await compressImageToTarget(f, targetSizes[i]);
          results.push(new File([blob], f.name, { type: blob.type }));
        } else if (isPDF(f)) {
          const blob = await compressPDFToTarget(f, targetSizes[i]);
          results.push(new File([blob], f.name, { type: "application/pdf" }));
        } else {
          results.push(f);
        }
      } catch (err) {
        console.error(err);
        results.push(f);
      }
    }
    setCompressedFiles(results);
    toast({
      title: "Compression done",
      description: `Processed ${files.length} file(s).`,
    });
  };

  const downloadFile = (blob: Blob, name: string) => {
    const url = makeObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllFiles = async () => {
    const zip = new JSZip();
    files.forEach((f, idx) => {
      const out = compressedFiles[idx] ?? f;
      if (out) zip.file(f.name, out as Blob);
    });
    const zipBlob = await zip.generateAsync({ type: "blob" });
    downloadFile(zipBlob, "compressed_files.zip");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-to-br from-pink-500 to-red-500">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center mb-4">
            <Link to="/compression-tools">
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
              >
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Tools
              </Button>
            </Link>
          </div>
          <div className="flex items-center text-white">
            <ArrowLeftRight className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Compare Compression</h1>
              <p className="text-lg text-white/90">
                Side-by-side comparison of original vs processed files.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 grid lg:grid-cols-3 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Select Files</CardTitle>
              <CardDescription>
                Upload files to compare compression.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUploader
                onFilesSelected={handleFilesSelected}
                acceptedTypes={[
                  "image/jpeg",
                  "image/png",
                  "image/webp",
                  "application/pdf",
                  "application/msword",
                  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ]}
                maxFiles={10}
                files={files}
                onRemoveFile={handleRemoveFile}
              />
            </CardContent>
          </Card>

          {files.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
                <CardDescription>
                  Adjust target size for files and compress.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {files.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="text-sm min-w-[180px] truncate">
                      {file.name}{" "}
                      {isImage(file) || isPDF(file)
                        ? "target size (KB):"
                        : "(not compressed)"}
                    </span>
                    <Input
                      type="number"
                      className="w-28"
                      value={targetSizes[idx] ?? 1}
                      min={1}
                      max={Math.floor(file.size / 1024)}
                      onChange={(e) =>
                        handleTargetSizeChange(idx, Number(e.target.value))
                      }
                      disabled={!isImage(file) && !isPDF(file)}
                    />
                  </div>
                ))}
                <Button onClick={compressFiles} className="w-full mt-2">
                  <ArrowLeftRight className="w-4 h-4 mr-2" /> Compress & Preview
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Comparison Preview */}
          {compressedFiles.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Comparison Preview</CardTitle>
                <CardDescription>Original vs Compressed files</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {files.map((originalFile, idx) => {
                  const processed = compressedFiles[idx];
                  if (!processed) return null;

                  const img = isImage(originalFile);
                  const pdf = isPDF(originalFile);

                  return (
                    <div
                      key={idx}
                      className="flex flex-col md:flex-row items-start md:items-center gap-6 border p-4 rounded"
                    >
                      {/* Original */}
                      <div className="flex flex-col items-center min-w-[280px]">
                        <Badge variant="secondary" className="mb-2">
                          Original
                        </Badge>
                        {img ? (
                          <img
                            src={makeObjectURL(originalFile)}
                            alt={originalFile.name}
                            className="w-64 h-64 object-contain"
                          />
                        ) : pdf ? (
                          <iframe
                            src={makeObjectURL(originalFile)}
                            className="w-64 h-64 border"
                            title={originalFile.name}
                          />
                        ) : (
                          <div className="w-64 h-64 flex items-center justify-center border bg-gray-100 text-sm">
                            {originalFile.name}
                          </div>
                        )}
                        <span className="text-xs mt-2">
                          {formatSize(originalFile.size)}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1"
                          onClick={() =>
                            downloadFile(originalFile, originalFile.name)
                          }
                        >
                          <Download className="w-3 h-3 mr-1" /> Download
                        </Button>
                      </div>

                      {/* Processed */}
                      <div className="flex flex-col items-center min-w-[280px]">
                        <Badge variant="secondary" className="mb-2">
                          {img || pdf ? "Compressed" : "Preview"}
                        </Badge>
                        {img || pdf ? (
                          pdf ? (
                            <iframe
                              src={makeObjectURL(processed)}
                              className="w-64 h-64 border"
                              title={originalFile.name + " (preview)"}
                            />
                          ) : (
                            <img
                              src={makeObjectURL(processed as Blob)}
                              alt={originalFile.name}
                              className="w-64 h-64 object-contain"
                            />
                          )
                        ) : (
                          <div className="w-64 h-64 flex items-center justify-center border bg-gray-100 text-sm">
                            {originalFile.name}
                          </div>
                        )}
                        <span className="text-xs mt-2">
                          {formatSize((processed as Blob).size)}{" "}
                          {img || pdf
                            ? `(Target: ${targetSizes[idx]} KB)`
                            : "(Not compressed)"}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-1"
                          onClick={() =>
                            downloadFile(processed as Blob, originalFile.name)
                          }
                        >
                          <Download className="w-3 h-3 mr-1" /> Download
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <Button onClick={downloadAllFiles} className="w-full mt-2">
                  <Download className="w-4 h-4 mr-2" /> Download All as ZIP
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <ArrowLeftRight className="w-5 h-5 mr-2" /> Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                • Images are compressed toward your target using quality & scale
                adjustments.
              </p>
              <p>
                • PDFs are compressed with basic object stream optimization.
              </p>
              <p>• All processing happens locally in your browser.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CompareCompression;
