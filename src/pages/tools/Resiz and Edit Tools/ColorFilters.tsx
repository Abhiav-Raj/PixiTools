import React, { useState, useEffect, useMemo } from "react";
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
import { ArrowLeft, Download, Loader2, Filter } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FileUploader from "@/components/FileUploader";

// ---------- utilities ----------

// Safe clamp to 0..255
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

// Apply a 3x3 convolution on the current pixels of targetCanvas.
// Auto-normalizes by kernel sum when appropriate to avoid dark/black results.
function applyConvolution(
  targetCanvas: HTMLCanvasElement,
  kernel: number[],
  divisor?: number,
  bias = 0
) {
  const ctx = targetCanvas.getContext("2d");
  if (!ctx) return;
  const w = targetCanvas.width;
  const h = targetCanvas.height;

  const src = ctx.getImageData(0, 0, w, h);
  const dst = ctx.createImageData(w, h);

  const kw = Math.sqrt(kernel.length);
  if (kw !== 3) throw new Error("Only 3x3 kernels supported here");

  // If divisor not provided, use the kernel sum when > 0, else 1 (common practice).
  const ksum = kernel.reduce((s, k) => s + k, 0);
  const usedDiv = typeof divisor === "number" ? divisor : ksum > 0 ? ksum : 1;

  const half = 1; // 3x3
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0,
        g = 0,
        b = 0;
      // keep alpha from source (don’t convolve alpha to avoid artifacts)
      const a = src.data[(y * w + x) * 4 + 3];

      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const px = x + kx;
          const py = y + ky;
          if (px >= 0 && px < w && py >= 0 && py < h) {
            const si = (py * w + px) * 4;
            const ki = (ky + half) * 3 + (kx + half);
            const kval = kernel[ki];
            r += src.data[si] * kval;
            g += src.data[si + 1] * kval;
            b += src.data[si + 2] * kval;
          }
        }
      }

      const di = (y * w + x) * 4;
      dst.data[di] = clamp255(r / usedDiv + bias);
      dst.data[di + 1] = clamp255(g / usedDiv + bias);
      dst.data[di + 2] = clamp255(b / usedDiv + bias);
      dst.data[di + 3] = a;
    }
  }
  ctx.putImageData(dst, 0, 0);
}

// Processes a single file with CSS-like filters; sharpening done via convolution.
async function processImageFile(
  file: File,
  {
    grayscale,
    blur,
    brightness,
    contrast,
    sharpen,
    sharpenAmount,
  }: {
    grayscale: boolean;
    blur: number;
    brightness: number;
    contrast: number;
    sharpen: boolean;
    sharpenAmount: number;
  },
  outputType: "image/png" | "image/jpeg" = "image/png",
  quality?: number
) {
  const imgUrl = URL.createObjectURL(file);
  const img: HTMLImageElement = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = imgUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  // CSS-like filters (order doesn’t matter for these)
  const filters: string[] = [];
  if (grayscale) filters.push("grayscale(1)");
  if (blur && blur > 0) filters.push(`blur(${Number(blur).toFixed(1)}px)`);
  if (typeof brightness === "number") filters.push(`brightness(${brightness})`);
  if (typeof contrast === "number") filters.push(`contrast(${contrast})`);
  ctx.filter = filters.join(" ") || "none";
  ctx.drawImage(img, 0, 0);

  if (sharpen && sharpenAmount > 0) {
    // Cross-shaped sharpen kernel with corners = 0, neighbors = -a, center = 1 + 4a.
    // This keeps kernel sum = 1 so overall brightness is preserved.
    const a = Math.max(0, Math.min(2, sharpenAmount));
    const kernel = [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0];
    // Auto-normalize by kernel sum (which is 1 here) to avoid black frames.
    applyConvolution(canvas, kernel);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
      outputType,
      outputType === "image/jpeg" && typeof quality === "number"
        ? quality
        : undefined
    );
  });

  URL.revokeObjectURL(imgUrl);
  return blob;
}

const ColorFilters = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processedFiles, setProcessedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [livePreviewUrl, setLivePreviewUrl] = useState<string | null>(null);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  // Filter settings (defaults)
  const defaultSettings = useMemo(
    () => ({
      grayscale: false,
      blur: 0,
      brightness: 1,
      contrast: 1,
      sharpen: false,
      sharpenAmount: 1,
    }),
    []
  );

  const [grayscale, setGrayscale] = useState(defaultSettings.grayscale);
  const [blur, setBlur] = useState(defaultSettings.blur); // px
  const [brightness, setBrightness] = useState(defaultSettings.brightness); // 0.5 - 2.0
  const [contrast, setContrast] = useState(defaultSettings.contrast); // 0.5 - 2.0
  const [sharpen, setSharpen] = useState(defaultSettings.sharpen);
  const [sharpenAmount, setSharpenAmount] = useState(
    defaultSettings.sharpenAmount
  );

  // Export options
  const [exportJpeg, setExportJpeg] = useState(false);
  const [jpegQuality, setJpegQuality] = useState(90);

  // Track active preset to allow toggle-reset on second click
  const [activePreset, setActivePreset] = useState<
    "bw" | "soft" | "vivid" | null
  >(null);

  const { toast } = useToast();

  // Live preview effect
  useEffect(() => {
    if (!selectedFiles.length) return;
    let cancelled = false;

    (async () => {
      const file = selectedFiles[currentFileIndex];
      if (!file) return;
      try {
        const blob = await processImageFile(
          file,
          { grayscale, blur, brightness, contrast, sharpen, sharpenAmount },
          exportJpeg ? "image/jpeg" : "image/png",
          exportJpeg ? jpegQuality / 100 : undefined
        );
        if (cancelled) return;
        const url = URL.createObjectURL(blob as Blob);
        setLivePreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return url;
        });
      } catch (err) {
        console.error("Preview generation failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    selectedFiles,
    currentFileIndex,
    grayscale,
    blur,
    brightness,
    contrast,
    sharpen,
    sharpenAmount,
    exportJpeg,
    jpegQuality,
  ]);

  const previewUrl = useMemo(() => {
    const p = processedFiles[currentFileIndex];
    if (p) return URL.createObjectURL(p);
    const s = selectedFiles[currentFileIndex];
    if (s) return URL.createObjectURL(s);
    return null;
  }, [selectedFiles, processedFiles, currentFileIndex]);

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    setProcessedFiles([]);
    setCurrentFileIndex(0);
    setProgress(0);
  };

  const handleRemoveFile = (index: number) => {
    const updatedSelected = selectedFiles.filter((_, i) => i !== index);
    const updatedProcessed = processedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updatedSelected);
    setProcessedFiles(updatedProcessed);
    if (currentFileIndex >= updatedSelected.length) {
      setCurrentFileIndex(Math.max(0, updatedSelected.length - 1));
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const blobToFile = (blob: Blob, fileName: string, mimeType?: string) => {
    const type =
      mimeType || blob.type || (exportJpeg ? "image/jpeg" : "image/png");
    return new File([blob], fileName, { type });
  };

  const processCurrentImage = async () => {
    if (!selectedFiles.length) {
      toast({
        title: "No files",
        description: "Please upload at least one image.",
        variant: "destructive",
      });
      return;
    }
    const file = selectedFiles[currentFileIndex];
    await processAndSetFile(file, currentFileIndex);
  };

  const processAllImages = async () => {
    if (!selectedFiles.length) {
      toast({
        title: "No files",
        description: "Please upload at least one image.",
        variant: "destructive",
      });
      return;
    }
    setIsProcessing(true);
    setProgress(0);
    const output: File[] = [];
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const f = selectedFiles[i];
        const blob = (await processImageFile(
          f,
          { grayscale, blur, brightness, contrast, sharpen, sharpenAmount },
          exportJpeg ? "image/jpeg" : "image/png",
          exportJpeg ? jpegQuality / 100 : undefined
        )) as Blob;

        const actualType =
          blob.type || (exportJpeg ? "image/jpeg" : "image/png");
        const ext =
          actualType === "image/jpeg"
            ? ".jpg"
            : actualType === "image/png"
            ? ".png"
            : `.${actualType.split("/")[1] || "bin"}`;
        const base = f.name.replace(/\.[^.]+$/, "");
        const newName = `${base}_filtered${ext}`;
        output.push(new File([blob], newName, { type: actualType }));

        setProgress(((i + 1) / selectedFiles.length) * 100);
      }
      setProcessedFiles(output);
      toast({
        title: "Images processed",
        description: `Processed ${output.length} image${
          output.length > 1 ? "s" : ""
        }.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "An error occurred during processing.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const processAndSetFile = async (file: File, index: number) => {
    setIsProcessing(true);
    setProgress(0);
    try {
      const blob = await processImageFile(
        file,
        { grayscale, blur, brightness, contrast, sharpen, sharpenAmount },
        exportJpeg ? "image/jpeg" : "image/png",
        exportJpeg ? jpegQuality / 100 : undefined
      );
      const extension = exportJpeg ? ".jpg" : ".png";
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const newName = `${baseName}_filtered${extension}`;
      const newFile = blobToFile(blob as Blob, newName, (blob as Blob).type);
      setProcessedFiles((prev) => {
        const copy = [...prev];
        copy[index] = newFile;
        return copy;
      });
      toast({
        title: "Image processed",
        description: `${file.name} has been processed.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to process image.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProgress(100);
      setTimeout(() => setProgress(0), 500);
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
    processedFiles.forEach((file, idx) =>
      setTimeout(() => downloadFile(file), idx * 120)
    );
  };

  // Toggleable presets: click once to apply, click again to reset to defaults.
  const applyPreset = (preset: "bw" | "soft" | "vivid") => {
    if (activePreset === preset) {
      // reset to defaults
      setGrayscale(defaultSettings.grayscale);
      setBlur(defaultSettings.blur);
      setBrightness(defaultSettings.brightness);
      setContrast(defaultSettings.contrast);
      setSharpen(defaultSettings.sharpen);
      setSharpenAmount(defaultSettings.sharpenAmount);
      setActivePreset(null);
      return;
    }

    if (preset === "bw") {
      setGrayscale(true);
      setBlur(0);
      setBrightness(1);
      setContrast(1);
      setSharpen(false);
      setSharpenAmount(1);
    } else if (preset === "soft") {
      setGrayscale(false);
      setBlur(2);
      setBrightness(1.05);
      setContrast(1.02);
      setSharpen(false);
      setSharpenAmount(1);
    } else if (preset === "vivid") {
      setGrayscale(false);
      setBlur(0);
      setBrightness(1.05);
      setContrast(1.2);
      setSharpen(true);
      setSharpenAmount(0.8);
    }
    setActivePreset(preset);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-primary">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center mb-4">
            <Link to="/resize-edit" className="mr-4">
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
            <Filter className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Color Filters & Effects</h1>
              <p className="text-lg text-white/90">
                Apply professional filters and effects to enhance your images.
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
                  Upload images to apply filters. Supports JPG, PNG, WebP.
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
                <CardTitle>Filters & Effects</CardTitle>
                <CardDescription>
                  Enable filters, tweak sliders and see a live preview.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {selectedFiles.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCurrentFileIndex((p) => Math.max(0, p - 1))
                          }
                          disabled={currentFileIndex === 0}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setCurrentFileIndex((p) =>
                              Math.min(selectedFiles.length - 1, p + 1)
                            )
                          }
                          disabled={
                            currentFileIndex === selectedFiles.length - 1
                          }
                        >
                          Next
                        </Button>
                        <span className="text-sm text-muted-foreground ml-2">
                          Image {currentFileIndex + 1} of {selectedFiles.length}
                        </span>
                      </div>

                      <div className="text-sm text-muted-foreground">
                        {selectedFiles[currentFileIndex]
                          ? selectedFiles[currentFileIndex].name
                          : ""}
                      </div>
                    </div>

                    <div className="w-full h-64 bg-gray-100 border rounded flex items-center justify-center overflow-hidden">
                      {livePreviewUrl ? (
                        <img
                          src={livePreviewUrl}
                          alt="Filtered Preview"
                          className="max-h-full max-w-full object-contain transition-transform duration-300"
                        />
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          No image selected
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyPreset("bw")}
                  >
                    Black & White Preset
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyPreset("soft")}
                  >
                    Soft
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyPreset("vivid")}
                  >
                    Vivid
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="grayscale"
                      checked={grayscale}
                      onCheckedChange={setGrayscale}
                    />
                    <Label htmlFor="grayscale" className="cursor-pointer">
                      Grayscale
                    </Label>
                  </div>

                  <div className="space-y-2">
                    <Label>Blur: {blur}px</Label>
                    <Slider
                      value={[blur]}
                      onValueChange={(v) =>
                        setBlur(Array.isArray(v) ? v[0] : v)
                      }
                      min={0}
                      max={10}
                      step={0.5}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Brightness: {Math.round(brightness * 100)}%</Label>
                    <Slider
                      value={[brightness]}
                      onValueChange={(v) =>
                        setBrightness(Array.isArray(v) ? v[0] : v)
                      }
                      min={0.5}
                      max={2}
                      step={0.01}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Contrast: {Math.round(contrast * 100)}%</Label>
                    <Slider
                      value={[contrast]}
                      onValueChange={(v) =>
                        setContrast(Array.isArray(v) ? v[0] : v)
                      }
                      min={0.5}
                      max={2}
                      step={0.01}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <Switch
                      id="sharpen"
                      checked={sharpen}
                      onCheckedChange={setSharpen}
                    />
                    <Label htmlFor="sharpen" className="cursor-pointer">
                      Sharpen
                    </Label>
                  </div>

                  <div className="space-y-2">
                    <Label>Sharpen Amount: {sharpenAmount}</Label>
                    <Slider
                      value={[sharpenAmount]}
                      onValueChange={(v) =>
                        setSharpenAmount(Array.isArray(v) ? v[0] : v)
                      }
                      min={0}
                      max={2}
                      step={0.1}
                    />
                  </div>

                  <div className="col-span-2 flex items-center space-x-2">
                    <Switch
                      checked={exportJpeg}
                      onCheckedChange={setExportJpeg}
                      id="export-jpeg"
                    />
                    <Label htmlFor="export-jpeg">
                      Export as JPEG with quality
                    </Label>
                  </div>

                  {exportJpeg && (
                    <div className="col-span-2 space-y-2">
                      <Label>JPEG Quality: {jpegQuality}%</Label>
                      <Slider
                        value={[jpegQuality]}
                        onValueChange={(v) =>
                          setJpegQuality(Array.isArray(v) ? v[0] : v)
                        }
                        min={30}
                        max={100}
                        step={5}
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Button
                    onClick={processCurrentImage}
                    disabled={selectedFiles.length === 0 || isProcessing}
                    className="w-full"
                    size="lg"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                        Processing...
                      </>
                    ) : (
                      <>
                        <Filter className="w-4 h-4 mr-2" /> Process Current
                      </>
                    )}
                  </Button>

                  <Button
                    onClick={processAllImages}
                    disabled={selectedFiles.length === 0 || isProcessing}
                    className="w-full"
                    size="lg"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                        Processing...
                      </>
                    ) : (
                      <>
                        <Filter className="w-4 h-4 mr-2" /> Process All (
                        {selectedFiles.length})
                      </>
                    )}
                  </Button>
                </div>

                {isProcessing && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Processing...</span>
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
                  <Filter className="w-5 h-5 mr-2" /> Filters & Effects
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      Free
                    </Badge>
                    <span className="text-muted-foreground">
                      100% Browser-based
                    </span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Badge variant="outline" className="mr-2">
                      Fast
                    </Badge>
                    <span className="text-muted-foreground">
                      No uploads to server
                    </span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Badge variant="outline" className="mr-2">
                      Safe
                    </Badge>
                    <span className="text-muted-foreground">
                      Files never leave your device
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Features:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Grayscale</li>
                    <li>• Blur / Sharpen</li>
                    <li>• Brightness</li>
                    <li>• Contrast</li>
                    <li>• Batch & per-image processing</li>
                    <li>• Download processed images</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {selectedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Original Files</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {selectedFiles.map((file, idx) => {
                      if (!file) return null;
                      return (
                        <div key={idx} className="flex justify-between text-sm">
                          <span className="truncate mr-2">
                            {file.name || "Unnamed file"}
                          </span>
                          <span className="text-muted-foreground">
                            {formatFileSize(file.size || 0)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {processedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Processed Images</span>
                    <Badge variant="default">
                      {processedFiles.length} files
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Download processed files individually or all at once.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button onClick={downloadAllFiles} className="w-full">
                    <Download className="w-4 h-4 mr-2" /> Download All (
                    {processedFiles.length})
                  </Button>

                  <div className="space-y-2">
                    {processedFiles.map((file, idx) => {
                      if (!file) return null;
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 border rounded"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">
                              {file.name || "Unnamed file"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(file.size || 0)}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadFile(file)}
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
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

export default ColorFilters;
