import { useState } from "react";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Download, Zap, Loader2, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FileUploader from "@/components/FileUploader";

// ---------- low-level helpers ----------

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  type?: string,
  quality?: number
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("toBlob failed"));
      },
      type,
      quality
    );
  });

const loadImageFromFile = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });

const hasAlphaChannel = (img: HTMLImageElement): boolean => {
  const w = 64;
  const h = Math.max(1, Math.round((img.height / img.width) * w));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return true;
  }
  return false;
};

const decideOutputType = (fileType: string, alpha: boolean): string => {
  if (fileType === "image/jpeg") return "image/jpeg";
  if (fileType === "image/webp") return "image/webp";
  if (fileType === "image/png" && alpha) return "image/webp"; // keep alpha + quality
  if (fileType === "image/png" && !alpha) return "image/jpeg";
  return "image/webp";
};

const extFromType = (type: string): string => {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/png") return "png";
  return "bin";
};

const drawToCanvas = (
  img: HTMLImageElement,
  width: number,
  height: number,
  flattenToWhite: boolean
): HTMLCanvasElement => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  if (flattenToWhite) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
};

// Binary search quality to find the largest quality whose size <= targetBytes at fixed dimensions.
// Returns bestUnder when available; if not found, returns minQualityBlob that is still > target.
const searchQualityForTarget = async (
  canvas: HTMLCanvasElement,
  type: string,
  targetBytes: number,
  {
    minQ = 0.05,
    maxQ = 1.0,
    maxIter = 16,
  }: { minQ?: number; maxQ?: number; maxIter?: number } = {}
): Promise<
  | { kind: "under"; blob: Blob; quality: number }
  | { kind: "above"; blobAtMinQ: Blob }
> => {
  let low = minQ;
  let high = maxQ;
  let bestUnder: { blob: Blob; q: number; diff: number } | null = null;

  // Probe min quality up-front to know if downscaling is required.
  const minBlob = await canvasToBlob(canvas, type, minQ);
  if (minBlob.size > targetBytes) {
    return { kind: "above", blobAtMinQ: minBlob };
  }

  // Probe max quality; if already <= target, that's ideal at these dimensions.
  const maxBlob = await canvasToBlob(canvas, type, maxQ);
  if (maxBlob.size <= targetBytes) {
    return { kind: "under", blob: maxBlob, quality: maxQ };
  }

  // Binary search between min and max quality to approach target from below.
  for (let i = 0; i < maxIter && high - low > 0.001; i++) {
    const mid = (low + high) / 2;
    const blob = await canvasToBlob(canvas, type, mid);
    if (blob.size <= targetBytes) {
      const diff = targetBytes - blob.size;
      if (!bestUnder || diff < bestUnder.diff) {
        bestUnder = { blob, q: mid, diff };
      }
      low = mid;
    } else {
      high = mid;
    }
  }

  if (bestUnder) {
    return { kind: "under", blob: bestUnder.blob, quality: bestUnder.q };
  }
  // Should not happen because minQ was already <= target, but keep a guard.
  return { kind: "under", blob: minBlob, quality: minQ };
};

// ---------- main compression utility ----------

const compressImageToTarget = async (
  file: File,
  targetSize?: number,
  qualityWhenNoTarget?: number
): Promise<File> => {
  const img = await loadImageFromFile(file);

  // If no target supplied, single encode at requested quality.
  if (!targetSize) {
    const alpha = hasAlphaChannel(img);
    const outType = decideOutputType(file.type, alpha);
    const flatten = outType === "image/jpeg" && alpha;
    const canvas = drawToCanvas(img, img.width, img.height, flatten);
    const q =
      typeof qualityWhenNoTarget === "number" ? qualityWhenNoTarget : 0.9;
    const blob = await canvasToBlob(canvas, outType, q);
    const base = file.name.replace(/\.[^.]+$/, "");
    return new File([blob], `${base}_compressed.${extFromType(outType)}`, {
      type: outType,
    });
  }

  // If original already under target, return original.
  if (file.size <= targetSize) return file;

  const alpha = hasAlphaChannel(img);
  const outType = decideOutputType(file.type, alpha);
  const flatten = outType === "image/jpeg" && alpha;

  const MAX_STEPS = 10;
  const SCALE = 0.9;
  const MIN_DIM = 64;

  let width = img.width;
  let height = img.height;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (width < MIN_DIM || height < MIN_DIM) break;

    const canvas = drawToCanvas(
      img,
      Math.round(width),
      Math.round(height),
      flatten
    );
    const res = await searchQualityForTarget(canvas, outType, targetSize, {
      minQ: 0.05,
      maxQ: 1.0,
      maxIter: 16,
    });

    // If we can achieve <= target at these dimensions, return immediately;
    // do NOT downscale further, as that only reduces size/quality unnecessarily.
    if (res.kind === "under") {
      const base = file.name.replace(/\.[^.]+$/, "");
      const outExt = extFromType(outType);
      return new File([res.blob], `${base}_compressed.${outExt}`, {
        type: outType,
      });
    }

    // Otherwise, even the smallest quality is still above target -> downscale and try again.
    width = Math.max(MIN_DIM, Math.floor(width * SCALE));
    height = Math.max(MIN_DIM, Math.floor(height * SCALE));
  }

  // Final fallback: smallest we could make at the last attempted size.
  {
    const canvas = drawToCanvas(
      img,
      Math.max(MIN_DIM, Math.round(width)),
      Math.max(MIN_DIM, Math.round(height)),
      flatten
    );
    const blob = await canvasToBlob(canvas, outType, 0.05);
    const base = file.name.replace(/\.[^.]+$/, "");
    const outExt = extFromType(outType);
    return new File([blob], `${base}_compressed.${outExt}`, { type: outType });
  }
};

// ---------- React component ----------

const ImageCompress = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);

  const [qualityLevel, setQualityLevel] = useState([80]);
  const [targetSizeKB, setTargetSizeKB] = useState<string>("100");
  const [useTargetSize, setUseTargetSize] = useState(false);

  const { toast } = useToast();

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    setProcessedFiles([]);
    setProgress(0);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const calculateCompressionRatio = (
    originalSize: number,
    compressedSize: number
  ) => (((originalSize - compressedSize) / originalSize) * 100).toFixed(1);

  const handleCompress = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No files selected",
        description: "Select at least one image.",
        variant: "destructive",
      });
      return;
    }

    if (useTargetSize) {
      const target = parseInt(targetSizeKB);
      if (!target || target <= 0) {
        toast({
          title: "Invalid target size",
          description: "Enter a valid target size in KB.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsProcessing(true);
    setProgress(0);
    const compressedFiles: {
      file: File;
      originalSize: number;
      compressedSize: number;
    }[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const originalSize = file.size;

        let compressedFile: File;
        if (useTargetSize) {
          const targetBytes = parseInt(targetSizeKB) * 1024;
          compressedFile = await compressImageToTarget(file, targetBytes);
        } else {
          compressedFile = await compressImageToTarget(
            file,
            undefined,
            qualityLevel[0] / 100
          );
        }

        const compressionRatio = calculateCompressionRatio(
          originalSize,
          compressedFile.size
        );
        const outExt =
          compressedFile.type === "image/jpeg"
            ? "jpg"
            : compressedFile.type === "image/webp"
            ? "webp"
            : compressedFile.type === "image/png"
            ? "png"
            : "bin";
        const base = file.name.replace(/\.[^.]+$/, "");
        const newName = `${base}_compressed_${compressionRatio}%.${outExt}`;
        const renamedFile = new File([compressedFile], newName, {
          type: compressedFile.type,
        });

        compressedFiles.push({
          file: renamedFile,
          originalSize,
          compressedSize: compressedFile.size,
        });

        setProgress(((i + 1) / selectedFiles.length) * 100);
      }

      setProcessedFiles(compressedFiles.map((x) => x.file));

      const totalOriginal = compressedFiles.reduce(
        (s, x) => s + x.originalSize,
        0
      );
      const totalCompressed = compressedFiles.reduce(
        (s, x) => s + x.compressedSize,
        0
      );
      const totalSavings = calculateCompressionRatio(
        totalOriginal,
        totalCompressed
      );

      toast({
        title: "Compression complete!",
        description: `Processed ${compressedFiles.length} image(s). Space saved: ${totalSavings}%`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Compression error",
        description: "Failed to compress images.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAllFiles = () => {
    processedFiles.forEach((file) => setTimeout(() => downloadFile(file), 100));
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
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tools
              </Button>
            </Link>
          </div>
          <div className="flex items-center text-white">
            <Zap className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Image Compressor</h1>
              <p className="text-lg text-white/90">
                Reduce file sizes while maintaining visual quality
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
                <CardTitle>Select Images</CardTitle>
                <CardDescription>
                  Upload images to compress. Supports JPG, PNG, WebP formats.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileUploader
                  onFilesSelected={handleFilesSelected}
                  acceptedTypes={["image/jpeg", "image/png", "image/webp"]}
                  maxFiles={20}
                  files={selectedFiles}
                  onRemoveFile={handleRemoveFile}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Compression Settings</CardTitle>
                <CardDescription>
                  Choose between quality-based or target size compression.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={useTargetSize}
                    onCheckedChange={setUseTargetSize}
                  />
                  <Label className="flex items-center">
                    <Target className="w-4 h-4 mr-1" /> Compress to target file
                    size
                  </Label>
                </div>

                {useTargetSize ? (
                  <div className="space-y-2">
                    <Label>Target Size (KB)</Label>
                    <Input
                      type="number"
                      value={targetSizeKB}
                      onChange={(e) => setTargetSizeKB(e.target.value)}
                      min={1}
                      max={10000}
                    />
                    <p className="text-sm text-muted-foreground">
                      Images will be compressed to approximately this size
                      (quality + resizing).
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Label>Quality Level: {qualityLevel[0]}%</Label>
                    <Slider
                      value={qualityLevel}
                      onValueChange={setQualityLevel}
                      min={10}
                      max={100}
                      step={5}
                    />
                  </div>
                )}

                <Button
                  onClick={handleCompress}
                  disabled={selectedFiles.length === 0 || isProcessing}
                  className="w-full"
                  size="lg"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Compressing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Compress Images ({selectedFiles.length})
                    </>
                  )}
                </Button>

                {isProcessing && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Compressing images...</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="w-5 h-5 mr-2" />
                  Image Compressor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      Free
                    </Badge>
                    <span className="text-muted-foreground">
                      Unlimited usage
                    </span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Badge variant="outline" className="mr-2">
                      Smart
                    </Badge>
                    <span className="text-muted-foreground">
                      Advanced algorithms
                    </span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Badge variant="outline" className="mr-2">
                      Secure
                    </Badge>
                    <span className="text-muted-foreground">
                      Browser-based processing
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {selectedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Original Files</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="truncate mr-2">{file.name}</span>
                      <span className="text-muted-foreground">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                  ))}
                  <div className="pt-2 border-t flex justify-between font-medium">
                    <span>Total Size:</span>
                    <span>
                      {formatFileSize(
                        selectedFiles.reduce((sum, f) => sum + f.size, 0)
                      )}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {processedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Compressed Images</span>
                    <Badge variant="default">
                      {processedFiles.length} files
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Download individual files or all at once.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button onClick={downloadAllFiles} className="w-full">
                    <Download className="w-4 h-4 mr-2" />
                    Download All ({processedFiles.length})
                  </Button>
                  {processedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 border rounded"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {file.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadFile(file)}
                      >
                        <Download className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageCompress;
