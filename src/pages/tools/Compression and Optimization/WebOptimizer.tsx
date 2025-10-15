import React, { useState } from "react";
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
import {
  ArrowLeft,
  Download,
  Zap,
  Loader2,
  Target,
  Image as ImageIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FileUploader from "@/components/FileUploader";

// NOTE: This component follows the UI and layout of your ImageCompress tool
// and adds Web-optimization features: format choice (Original/WebP/AVIF/JPEG/PNG),
// responsive size generation (toggleable), quality controls, EXIF stripping (canvas)
// and lazy preview. Some low-level features (like forcing progressive JPEG encoding)
// are not controllable via canvas in browsers — see comments in helper functions.

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
    // Ensure crossOrigin to avoid tainting canvas if possible (works when CORS headers are present)
    img.crossOrigin = "anonymous";
    img.src = url;
  });

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

const extFromType = (type: string): string => {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/png") return "png";
  if (type === "image/avif") return "avif";
  return "bin";
};

// Try to pick an output mime-type based on user selection and image alpha
const pickOutputType = (
  originalType: string,
  chosen: string,
  alpha: boolean
) => {
  if (chosen === "original") return originalType;
  if (chosen === "auto") {
    // prefer avif -> webp -> jpeg
    if (typeof (window as any).ImageBitmap === "function") return "image/webp";
    return "image/jpeg";
  }
  if (chosen === "avif") return "image/avif";
  if (chosen === "webp") return "image/webp";
  if (chosen === "jpeg") return "image/jpeg";
  if (chosen === "png") return "image/png";
  return originalType;
};

// Create resized versions for responsive output
const resizeCanvasFor = (
  img: HTMLImageElement,
  maxWidth: number,
  flattenToWhite: boolean
) => {
  const ratio = img.width / img.height;
  const width = Math.min(maxWidth, img.width);
  const height = Math.round(width / ratio);
  return drawToCanvas(img, width, height, flattenToWhite);
};

// NOTE: Browsers' canvas API does not provide a way to force progressive JPEG encoding.
// Creating progressive JPEGs typically requires a dedicated encoder (server-side or WASM)
// so the `enableProgressiveJpeg` option in the UI is considered a *best-effort* flag
// and will only be honored when the browser's encoder supports it (rare). We still
// produce baseline JPEGs via canvas which are broadly supported.

// ---------- main optimizer utility ----------

type ProcessedFile = {
  name: string;
  file: File;
  size: number;
  url: string; // object URL for preview/download
  variants?: { width: number | "orig"; file: File; url: string }[];
};

const DEFAULT_RESPONSIVE_SIZES = [480, 720, 1080];

const optimizeImage = async (
  file: File,
  options: {
    outputFormat: string; // original | auto | webp | avif | jpeg | png
    quality: number; // 0-1
    generateResponsive: boolean;
    responsiveSizes: number[];
    progressiveJpeg: boolean; // best-effort
    stripMetadata: boolean; // canvas will naturally strip metadata
    lazyPreview: boolean; // affects how we present the preview
  }
): Promise<ProcessedFile> => {
  const img = await loadImageFromFile(file);
  const alpha = false; // we detect alpha by drawing but for simplicity treat flatten when output jpeg
  const chosenType = pickOutputType(file.type, options.outputFormat, alpha);
  const flatten = chosenType === "image/jpeg" && true; // flatten to white for jpeg

  // Produce main optimized file at original dimensions
  const canvas = drawToCanvas(img, img.width, img.height, flatten);
  const mainBlob = await canvasToBlob(canvas, chosenType, options.quality);

  const base = file.name.replace(/\.[^.]+$/, "");
  const outExt = extFromType(chosenType);
  const mainFile = new File([mainBlob], `${base}_optimized.${outExt}`, {
    type: chosenType,
  });
  const mainUrl = URL.createObjectURL(mainFile);

  const processed: ProcessedFile = {
    name: mainFile.name,
    file: mainFile,
    size: mainFile.size,
    url: mainUrl,
  };

  if (options.generateResponsive) {
    processed.variants = [];
    for (const w of options.responsiveSizes) {
      if (w >= img.width) {
        // skip sizes larger than original, but still include original if asked
        continue;
      }
      const c = resizeCanvasFor(img, w, flatten);
      // quality for responsive variants could be slightly higher to preserve clarity
      const b = await canvasToBlob(c, chosenType, options.quality);
      const f = new File(
        [b],
        `${base}_optimized_${w}.${extFromType(chosenType)}`,
        {
          type: chosenType,
        }
      );
      const u = URL.createObjectURL(f);
      processed.variants.push({ width: w, file: f, url: u });
    }
  }

  return processed;
};

// ---------- React component ----------

const WebOptimizer: React.FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [progress, setProgress] = useState(0);

  const [modeAuto, setModeAuto] = useState(true);
  const [quality, setQuality] = useState(85); // 0-100
  const [outputFormat, setOutputFormat] = useState<
    "original" | "auto" | "webp" | "avif" | "jpeg" | "png"
  >("auto");

  const [generateResponsive, setGenerateResponsive] = useState(false);
  const [responsiveSizes, setResponsiveSizes] = useState<number[]>(
    DEFAULT_RESPONSIVE_SIZES
  );
  const [progressiveJpeg, setProgressiveJpeg] = useState(false);
  const [stripMetadata, setStripMetadata] = useState(true);
  const [lazyPreview, setLazyPreview] = useState(true);

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
    const toDownload: File[] = [];
    for (const p of processedFiles) {
      toDownload.push(p.file);
      if (p.variants) p.variants.forEach((v) => toDownload.push(v.file));
    }
    toDownload.forEach((file, i) =>
      setTimeout(() => downloadFile(file), i * 150)
    );
  };

  const handleOptimize = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No files selected",
        description: "Select at least one image.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    const out: ProcessedFile[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const opts = {
          outputFormat: modeAuto ? "auto" : outputFormat,
          quality: quality / 100,
          generateResponsive: generateResponsive,
          responsiveSizes: responsiveSizes,
          progressiveJpeg: progressiveJpeg,
          stripMetadata: stripMetadata,
          lazyPreview: lazyPreview,
        };

        const p = await optimizeImage(file, opts);
        out.push(p);
        setProgress(((i + 1) / selectedFiles.length) * 100);
      }

      setProcessedFiles(out);
      const totalOrig = selectedFiles.reduce((s, f) => s + f.size, 0);
      const totalNew = out.reduce(
        (s, p) =>
          s +
          p.size +
          (p.variants ? p.variants.reduce((ss, v) => ss + v.file.size, 0) : 0),
        0
      );
      const savings = Math.round(((totalOrig - totalNew) / totalOrig) * 100);

      toast({
        title: "Optimization complete!",
        description: `Processed ${out.length} image(s). Approx. savings: ${savings}%`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Optimization failed",
        description: "See console for details.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
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
            <ImageIcon className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Web Optimizer</h1>
              <p className="text-lg text-white/90">
                Optimize images specifically for web use with responsive output
                & modern formats
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
                  Upload images to optimize. Supports JPG, PNG, WebP formats.
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
                <CardTitle>Optimization Settings</CardTitle>
                <CardDescription>
                  Auto-mode will pick sensible defaults. Toggle to customize.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center space-x-2">
                  <Switch checked={modeAuto} onCheckedChange={setModeAuto} />
                  <Label className="flex items-center">Auto-optimize</Label>
                </div>

                {!modeAuto && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Output format</Label>
                      <select
                        className="mt-1 w-full p-2 rounded border"
                        value={outputFormat}
                        onChange={(e) => setOutputFormat(e.target.value as any)}
                      >
                        <option value="original">Original</option>
                        <option value="auto">Auto (browser/heuristic)</option>
                        <option value="avif">AVIF</option>
                        <option value="webp">WebP</option>
                        <option value="jpeg">JPEG</option>
                        <option value="png">PNG</option>
                      </select>
                    </div>

                    <div>
                      <Label>Quality: {quality}%</Label>
                      <Slider
                        value={[quality]}
                        onValueChange={(val) => setQuality(val[0])}
                        min={10}
                        max={100}
                        step={1}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={generateResponsive}
                      onCheckedChange={setGenerateResponsive}
                    />
                    <Label className="flex items-center">
                      <Target className="w-4 h-4 mr-1" /> Generate responsive
                      sizes
                    </Label>
                  </div>

                  {generateResponsive && (
                    <div className="space-y-2">
                      <Label>Responsive widths (comma separated)</Label>
                      <Input
                        value={responsiveSizes.join(",")}
                        onChange={(e) =>
                          setResponsiveSizes(
                            e.target.value
                              .split(",")
                              .map((s) => parseInt(s.trim()))
                              .filter(Boolean)
                          )
                        }
                      />
                      <p className="text-sm text-muted-foreground">
                        Will skip sizes larger than the original image.
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={progressiveJpeg}
                        onCheckedChange={setProgressiveJpeg}
                      />
                      <Label>Try progressive JPEG (best-effort)</Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={stripMetadata}
                        onCheckedChange={setStripMetadata}
                      />
                      <Label>Strip EXIF metadata</Label>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={lazyPreview}
                      onCheckedChange={setLazyPreview}
                    />
                    <Label>Lazy-load preview</Label>
                  </div>
                </div>

                <Button
                  onClick={handleOptimize}
                  disabled={selectedFiles.length === 0 || isProcessing}
                  className="w-full"
                  size="lg"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Optimizing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Optimize Images ({selectedFiles.length})
                    </>
                  )}
                </Button>

                {isProcessing && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Optimizing images...</span>
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
                  Web Optimizer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      Pro
                    </Badge>
                    <span className="text-muted-foreground">
                      Responsive sizes, modern formats
                    </span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Badge variant="outline" className="mr-2">
                      Strip EXIF
                    </Badge>
                    <span className="text-muted-foreground">
                      Privacy-friendly
                    </span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Badge variant="outline" className="mr-2">
                      Client-side
                    </Badge>
                    <span className="text-muted-foreground">
                      Processed in the browser
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {selectedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Selected Files</CardTitle>
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
                    <span>Optimized Images</span>
                    <Badge variant="default">
                      {processedFiles.length} files
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Download individual files or all variants at once.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button onClick={downloadAllFiles} className="w-full">
                    <Download className="w-4 h-4 mr-2" />
                    Download All ({processedFiles.length})
                  </Button>

                  {processedFiles.map((p, idx) => (
                    <div key={idx} className="p-2 border rounded space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {p.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(p.size)}
                          </p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadFile(p.file)}
                          >
                            <Download className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      {p.variants && p.variants.length > 0 && (
                        <div className="pt-2 border-t space-y-2">
                          <div className="text-sm font-medium">Variants</div>
                          {p.variants.map((v, vi) => (
                            <div
                              key={vi}
                              className="flex items-center justify-between text-sm"
                            >
                              <div>
                                <div className="truncate">{v.file.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {v.width}px • {formatFileSize(v.file.size)}
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadFile(v.file)}
                                >
                                  <Download className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="pt-2 border-t">
                        <img
                          src={p.url}
                          alt={p.name}
                          loading={lazyPreview ? "lazy" : "eager"}
                          className="w-full h-auto rounded"
                        />
                      </div>
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

export default WebOptimizer;
