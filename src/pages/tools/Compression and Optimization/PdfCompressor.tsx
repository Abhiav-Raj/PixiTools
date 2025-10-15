import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  Trash2,
  Zap,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PDFDocument } from "pdf-lib";

const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024,
    sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const sanitizeBase = (name: string) =>
  name.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_");

const toStrictArrayBuffer = (
  data: Uint8Array | ArrayBufferLike
): ArrayBuffer => {
  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
  }
  const view = new Uint8Array(data);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
};

const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const PDFCompressor: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Target requested by the user (KB)
  const [targetKB, setTargetKB] = useState<string>("");

  // Analysis results
  const [originalSize, setOriginalSize] = useState<number | null>(null);
  const [optimizedSize, setOptimizedSize] = useState<number | null>(null);
  const [optimizedBytes, setOptimizedBytes] = useState<Uint8Array | null>(null);
  const [meetsTarget, setMeetsTarget] = useState<boolean | null>(null);

  const { toast } = useToast();
  const acceptTypes = useMemo(() => ["application/pdf"], []);

  const resetAnalysis = () => {
    setOriginalSize(null);
    setOptimizedSize(null);
    setOptimizedBytes(null);
    setMeetsTarget(null);
    setProgress(0);
  };

  const onPick = (files: File[]) => {
    const f = files.find((x) => x.type === "application/pdf") || null;
    if (!f) {
      toast({
        title: "No PDF",
        description: "Please choose a PDF file to optimize.",
        variant: "destructive",
      });
      return;
    }
    setFile(f);
    resetAnalysis();
    // Set original size immediately for input max binding
    setOriginalSize(f.size);
    // Clamp any existing target to the new max
    const maxKB = Math.max(1, Math.floor(f.size / 1024));
    const current = parseInt((targetKB || "").trim(), 10);
    if (!isNaN(current) && current > maxKB) setTargetKB(String(maxKB));
  };

  // Lossless compaction using pdf-lib: object streams + metadata cleanup
  const optimizeLossless = async (bytes: Uint8Array) => {
    const doc = await PDFDocument.load(bytes);
    doc.setTitle("");
    doc.setAuthor("");
    doc.setSubject("");
    doc.setKeywords([]);
    doc.setProducer("");
    doc.setCreator("");
    const out = await doc.save({ useObjectStreams: true });
    return out;
  };

  // Step 1: Analyze/Estimate (compute optimized bytes but do not download)
  const analyze = async () => {
    if (!file) {
      toast({
        title: "No PDF",
        description: "Please choose a PDF to optimize.",
        variant: "destructive",
      });
      return;
    }
    // Validate target not exceeding original max
    if (originalSize != null && targetKB) {
      const maxKB = Math.max(1, Math.floor(originalSize / 1024));
      const n = parseInt((targetKB || "").trim(), 10);
      if (!isNaN(n) && n > maxKB) {
        toast({
          title: "Invalid target",
          description: `Target exceeds original size. Max allowed is ${maxKB} KB.`,
          variant: "destructive",
        });
        return;
      }
    }

    setIsProcessing(true);
    setProgress(0);
    try {
      const baseBytes = new Uint8Array(await file.arrayBuffer());
      const baseSize = baseBytes.byteLength;
      setOriginalSize(baseSize);

      setProgress(25);
      const outBytes = await optimizeLossless(baseBytes);

      setOptimizedBytes(outBytes);
      setOptimizedSize(outBytes.byteLength);
      setProgress(90);

      // Compute target feasibility (lossless cannot force a size)
      const targetVal = parseInt((targetKB || "").trim(), 10);
      if (!isNaN(targetVal) && targetVal > 0) {
        const targetBytes = targetVal * 1024;
        setMeetsTarget(outBytes.byteLength <= targetBytes);
      } else {
        setMeetsTarget(null);
      }

      setProgress(100);

      // Show non-blocking info only; do not auto-download
      const pct = Math.max(
        0,
        100 - Math.round((outBytes.byteLength / baseSize) * 100)
      );
      toast({
        title: "Analysis complete",
        description: `Estimated ${formatSize(baseSize)} → ${formatSize(
          outBytes.byteLength
        )} (≈${pct}% reduction).`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Optimization analysis failed.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  // Step 2: Download (only after analysis, and only when user clicks)
  const download = async () => {
    if (!file || !optimizedBytes) {
      toast({
        title: "No result",
        description: "Please run analysis first.",
        variant: "destructive",
      });
      return;
    }
    const baseName = sanitizeBase(file.name);
    const outBlob = new Blob([toStrictArrayBuffer(optimizedBytes)], {
      type: "application/pdf",
    });
    downloadBlob(outBlob, `${baseName}_optimized.pdf`);
  };

  const reduction =
    originalSize != null && optimizedSize != null
      ? Math.max(0, 100 - Math.round((optimizedSize / originalSize) * 100))
      : null;

  // Dynamic max for the target input
  const maxTargetKB =
    originalSize != null ? Math.max(1, Math.floor(originalSize / 1024)) : null;
  const targetKBNum = parseInt((targetKB || "").trim(), 10);
  const targetTooLarge = !!(
    maxTargetKB &&
    !isNaN(targetKBNum) &&
    targetKBNum > maxTargetKB
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-to-br from-pink-500 to-red-500">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center mb-4">
            <Link to="/compression-tools" className="mr-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tools
              </Button>
            </Link>
          </div>
          <div className="flex items-center text-white">
            <Zap className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">PDF Compressor</h1>
              <p className="text-lg text-white/90">
                Lossless optimization with previewed size before download.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Select PDF</CardTitle>
                <CardDescription>
                  Pick a PDF to optimize losslessly.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border border-dashed rounded-md p-4">
                  <Label htmlFor="pdf-input" className="mb-2 block">
                    Choose PDF
                  </Label>
                  <Input
                    id="pdf-input"
                    type="file"
                    accept={acceptTypes.join(",")}
                    onChange={(e) =>
                      onPick(e.target.files ? Array.from(e.target.files) : [])
                    }
                  />
                  {file && (
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4" />
                        <span className="text-sm">{file.name}</span>
                        <Badge variant="secondary">
                          {formatSize(file.size)}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setFile(null);
                          setTargetKB("");
                          resetAnalysis();
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {isProcessing && (
                  <div className="space-y-2 mt-4">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Analyzing...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Target & Actions</CardTitle>
                <CardDescription>
                  Enter a desired size in KB up to the original file size.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Desired size (KB)</Label>
                    <Input
                      className="mt-2"
                      placeholder={
                        maxTargetKB
                          ? `≤ ${maxTargetKB} KB`
                          : "Select a PDF first"
                      }
                      type="number"
                      min={1}
                      max={maxTargetKB ?? undefined}
                      step={1}
                      value={targetKB}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          setTargetKB("");
                          return;
                        }
                        const n = parseInt(v, 10);
                        if (isNaN(n) || n < 1) {
                          setTargetKB("1");
                          return;
                        }
                        if (maxTargetKB && n > maxTargetKB) {
                          setTargetKB(String(maxTargetKB));
                        } else {
                          setTargetKB(String(n));
                        }
                      }}
                      disabled={!file}
                    />
                    {file && maxTargetKB && (
                      <div
                        className={`mt-2 text-xs ${
                          targetTooLarge
                            ? "text-amber-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        Max allowed: {maxTargetKB} KB
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    onClick={analyze}
                    disabled={!file || isProcessing || targetTooLarge}
                    size="lg"
                    className="w-full"
                    title={
                      targetTooLarge
                        ? "Target exceeds original size."
                        : "Analyze lossless optimization"
                    }
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Analyzing
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Analyze (no download)
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={download}
                    disabled={!optimizedBytes || targetTooLarge}
                    size="lg"
                    className="w-full"
                    variant={targetTooLarge ? "outline" : "default"}
                    title={
                      targetTooLarge
                        ? "Target exceeds original size; adjust the value."
                        : "Download optimized PDF"
                    }
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download optimized
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Compression estimate */}
            <Card>
              <CardHeader>
                <CardTitle>Compression estimate</CardTitle>
                <CardDescription>
                  Results from the latest analysis.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {originalSize != null && optimizedSize != null ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Original size</span>
                      <span>{formatSize(originalSize)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Estimated optimized size</span>
                      <span>{formatSize(optimizedSize)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Reduction</span>
                      <span>{reduction}%</span>
                    </div>
                    {targetKB && maxTargetKB && (
                      <div
                        className={`mt-2 rounded px-3 py-2 ${
                          targetTooLarge
                            ? "bg-amber-50 text-amber-700"
                            : "bg-green-50 text-green-700"
                        }`}
                      >
                        {targetTooLarge
                          ? `Target exceeds original (${maxTargetKB} KB max).`
                          : `Target is within the allowed range.`}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Run “Analyze” to see the estimated lossless size and
                    reduction before downloading.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="w-5 h-5 mr-2" /> PDF Compressor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      Lossless
                    </Badge>
                    <span className="text-muted-foreground">
                      Object streams • Metadata cleanup
                    </span>
                  </div>
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Notes:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>
                        • Lossless optimization uses pdf‑lib save with
                        useObjectStreams for compaction without altering images.
                      </li>
                      <li>
                        • Exact KB targets usually require lossy image
                        recompression, which is outside this lossless tool.
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {file && (
              <Card>
                <CardHeader>
                  <CardTitle>Selected File</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm py-2 border-b">
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="font-medium truncate">{file.name}</div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatSize(file.size)}
                      </div>
                    </div>
                    <div className="pt-2 border-t mt-2 flex justify-between font-medium">
                      <span>Total Files</span>
                      <span>1</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PDFCompressor;
