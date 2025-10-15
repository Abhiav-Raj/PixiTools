import React, { useRef, useState, useEffect } from "react";
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
import { PaintBucket, Zap, ArrowLeft, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FileUploader from "@/components/FileUploader";

type Blend = GlobalCompositeOperation;

export default function BackgroundChanger() {
  // files
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [bgFiles, setBgFiles] = useState<File[]>([]);
  const [processedFiles, setProcessedFiles] = useState<File[]>([]);

  // preview / index
  const [currentIndex, setCurrentIndex] = useState(0);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // mode: color or image
  const [mode, setMode] = useState<"color" | "image">("color");

  // color/background controls
  const [bgColor, setBgColor] = useState<string>("#ffffff");
  const [chromaKey, setChromaKey] = useState<string>("#00ff00");
  const [tolerance, setTolerance] = useState<number>(60); // sensible default for 8‑bit CbCr distance

  // matte tools
  const [featherPx, setFeatherPx] = useState<number>(2); // 0‑4 px
  const [matteBias, setMatteBias] = useState<number>(0); // -3..+3 shrink/expand

  // blend / visual
  const [blendMode, setBlendMode] = useState<Blend>("source-over");
  const [fgOpacity, setFgOpacity] = useState<number>(100);

  // processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const { toast } = useToast();

  // helpers
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleSourceFiles = (files: File[]) => {
    setSourceFiles(files);
    setProcessedFiles([]);
    setCurrentIndex(0);
  };
  const handleBgFiles = (files: File[]) => setBgFiles(files);

  const goPrev = () => setCurrentIndex((p) => Math.max(0, p - 1));
  const goNext = () =>
    setCurrentIndex((p) => Math.min(sourceFiles.length - 1, p + 1));

  // color helpers
  const hexToRgb = (hex: string) => {
    const h = hex.replace("#", "");
    const big = parseInt(
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h,
      16
    );
    return { r: (big >> 16) & 255, g: (big >> 8) & 255, b: big & 255 };
  };
  const rgbToYCbCr = (r: number, g: number, b: number) => {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    return { y, cb, cr };
  };
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const smoothstep = (a: number, b: number, x: number) => {
    const t = clamp01((x - a) / Math.max(1e-6, b - a));
    return t * t * (3 - 2 * t);
  };

  // alpha post-processing
  const blurAlpha3x3 = (
    alpha: Uint8ClampedArray,
    w: number,
    h: number,
    r: number
  ) => {
    if (r <= 0) return alpha;
    const out = new Uint8ClampedArray(alpha);
    for (let k = 0; k < r; k++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let s = 0,
            c = 0;
          for (let j = -1; j <= 1; j++) {
            for (let i = -1; i <= 1; i++) {
              const xx = x + i,
                yy = y + j;
              if (xx >= 0 && yy >= 0 && xx < w && yy < h) {
                s += out[yy * w + xx];
                c++;
              }
            }
          }
          alpha[y * w + x] = s / c;
        }
      }
    }
    return alpha;
  };

  const shrinkExpand = (
    alpha: Uint8ClampedArray,
    w: number,
    h: number,
    steps: number
  ) => {
    if (steps === 0) return alpha;
    const out = new Uint8ClampedArray(alpha);
    const sign = Math.sign(steps);
    const n = Math.abs(steps);
    for (let k = 0; k < n; k++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let extreme = sign > 0 ? 0 : 255;
          for (let j = -1; j <= 1; j++) {
            for (let i = -1; i <= 1; i++) {
              const xx = x + i,
                yy = y + j;
              if (xx >= 0 && yy >= 0 && xx < w && yy < h) {
                const v = out[yy * w + xx];
                extreme =
                  sign > 0 ? Math.max(extreme, v) : Math.min(extreme, v);
              }
            }
          }
          alpha[y * w + x] = extreme;
        }
      }
      out.set(alpha);
    }
    return alpha;
  };

  // core: build matte + despill and return ImageData
  const keyAndDespill = (
    imageData: ImageData,
    keyHex: string,
    tol: number,
    yGate: number,
    feather: number,
    biasSteps: number,
    spillStrength: number
  ) => {
    const { data, width, height } = imageData;
    const key = hexToRgb(keyHex);
    const keyYcc = rgbToYCbCr(key.r, key.g, key.b);

    // 1) build raw alpha from CbCr distance
    const aBuf = new Uint8ClampedArray(width * height);
    const tLow = Math.max(4, tol * 0.65);
    const tHigh = Math.max(tLow + 1, tol);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i],
        g = data[i + 1],
        b = data[i + 2];
      const ycc = rgbToYCbCr(r, g, b);
      const dCb = ycc.cb - keyYcc.cb;
      const dCr = ycc.cr - keyYcc.cr;
      const chromaDist = Math.hypot(dCb, dCr);
      const lumDiff = Math.abs(ycc.y - keyYcc.y);

      // how close to key color (0..1, 1 = identical)
      const near = 1 - smoothstep(tLow, tHigh, chromaDist);
      // gate with luminance difference so bright/dark keys need to be closer
      const gate = clamp01(1 - lumDiff / Math.max(12, yGate));
      const cut = clamp01(near * gate);

      // alpha = solid where far from key; transparent where near key
      const alpha = Math.round(255 * (1 - cut));
      aBuf[p] = alpha;
    }

    // 2) matte tools: shrink/expand then feather
    shrinkExpand(aBuf, width, height, biasSteps);
    blurAlpha3x3(
      aBuf,
      width,
      height,
      Math.max(0, Math.min(4, Math.round(feather)))
    );

    // 3) despill near edges
    const klen = Math.hypot(key.r, key.g, key.b) || 1;
    const kx = key.r / klen,
      ky = key.g / klen,
      kz = key.b / klen;

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const a = aBuf[p];
      // write matte
      data[i + 3] = a;

      // despill only where some transparency (edge pixels)
      if (a > 0 && a < 255) {
        let r = data[i],
          g = data[i + 1],
          b = data[i + 2];

        // project color onto key axis and subtract part of it
        const proj = r * kx + g * ky + b * kz;
        const scale = spillStrength * (1 - a / 255); // stronger when more transparent
        r = Math.round(r - kx * proj * scale);
        g = Math.round(g - ky * proj * scale);
        b = Math.round(b - kz * proj * scale);

        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
      }
    }
    return new ImageData(data, width, height);
  };

  // draw fitted background into ctx
  const drawBackground = async (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ) => {
    if (mode === "color" || !bgFiles[0]) {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const bgUrl = URL.createObjectURL(bgFiles[0]);
    const bgImg = document.createElement("img");
    bgImg.decoding = "async";
    bgImg.src = bgUrl;
    await new Promise<void>((res, rej) => {
      bgImg.onload = () => res();
      bgImg.onerror = () => rej(new Error("BG load failed"));
    });
    try {
      // contain fit, pre-fill with solid color to avoid gaps
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
      const scale = Math.min(w / bgImg.width, h / bgImg.height);
      const bw = Math.round(bgImg.width * scale);
      const bh = Math.round(bgImg.height * scale);
      const x = Math.round((w - bw) / 2);
      const y = Math.round((h - bh) / 2);
      ctx.drawImage(bgImg, x, y, bw, bh);
    } finally {
      URL.revokeObjectURL(bgUrl);
    }
  };

  // build preview
  const drawPreview = async () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const file = sourceFiles[currentIndex];
    if (!file) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const url = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.decoding = "async";
    img.src = url;

    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Preview load failed"));
    });

    try {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      // compose background
      await drawBackground(ctx, canvas.width, canvas.height);

      // make matte + despill on an offscreen
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const octx = off.getContext("2d")!;
      octx.drawImage(img, 0, 0, off.width, off.height);
      const imgData = octx.getImageData(0, 0, off.width, off.height);

      const yGate = Math.max(10, Math.min(80, Math.round(tolerance * 0.25)));
      const processed = keyAndDespill(
        imgData,
        chromaKey,
        Math.max(1, tolerance),
        yGate,
        featherPx,
        Math.round(matteBias),
        0.85
      );

      // draw foreground with chosen blend + opacity
      ctx.save();
      ctx.globalAlpha = fgOpacity / 100;
      ctx.globalCompositeOperation = (blendMode as Blend) || "source-over";
      octx.putImageData(processed, 0, 0);
      ctx.drawImage(off, 0, 0);
      ctx.restore();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  useEffect(() => {
    drawPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sourceFiles,
    bgFiles,
    currentIndex,
    mode,
    bgColor,
    chromaKey,
    tolerance,
    featherPx,
    matteBias,
    blendMode,
    fgOpacity,
  ]);

  // render to a downloadable File (PNG)
  const renderProcessedFile = async (file: File) => {
    const url = URL.createObjectURL(file);
    const img = document.createElement("img");
    img.decoding = "async";
    img.src = url;

    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Image load failed"));
    });

    try {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not available");

      // background
      await drawBackground(ctx, canvas.width, canvas.height);

      // foreground + matte
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const octx = off.getContext("2d")!;
      octx.drawImage(img, 0, 0, off.width, off.height);
      const imgData = octx.getImageData(0, 0, off.width, off.height);

      const yGate = Math.max(10, Math.min(80, Math.round(tolerance * 0.25)));
      const processed = keyAndDespill(
        imgData,
        chromaKey,
        Math.max(1, tolerance),
        yGate,
        featherPx,
        Math.round(matteBias),
        0.85
      );

      ctx.save();
      ctx.globalAlpha = fgOpacity / 100;
      ctx.globalCompositeOperation = (blendMode as Blend) || "source-over";
      octx.putImageData(processed, 0, 0);
      ctx.drawImage(off, 0, 0);
      ctx.restore();

      // blob -> file (PNG keeps full alpha)
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), "image/png", 0.92)
      );
      if (!blob) throw new Error("Failed to create blob");

      const outName = file.name.replace(/\.[^/.]+$/, "") + "_bgchanged.png";
      return new File([blob], outName, { type: "image/png" });
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const handleProcessCurrent = async () => {
    const file = sourceFiles[currentIndex];
    if (!file) {
      toast({
        title: "No file",
        description: "No source image selected",
        variant: "destructive",
      });
      return;
    }
    setIsProcessing(true);
    try {
      const processed = await renderProcessedFile(file);
      setProcessedFiles((p) => {
        const copy = [...p];
        copy[currentIndex] = processed!;
        return copy;
      });
      toast({ title: "Processed", description: `${file.name} processed.` });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to process image.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleProcessAll = async () => {
    if (sourceFiles.length === 0) {
      toast({
        title: "No files",
        description: "Please add source images.",
        variant: "destructive",
      });
      return;
    }
    setIsProcessing(true);
    const out: File[] = [];
    try {
      for (let i = 0; i < sourceFiles.length; i++) {
        setProgress(Math.round((i / sourceFiles.length) * 100));
        out[i] = (await renderProcessedFile(sourceFiles[i]))!;
      }
      setProgress(100);
      setProcessedFiles(out);
      toast({
        title: "Processed",
        description: `Processed ${out.length} images.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to process some images.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 400);
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

  const downloadAll = () => {
    processedFiles.forEach((f, i) =>
      setTimeout(() => downloadFile(f), i * 120)
    );
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
            <PaintBucket className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Background Changer</h1>
              <p className="text-lg text-white/90">
                Replace image backgrounds with a solid color or a custom image
                (client-side).
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
                <CardTitle>Select Source Images</CardTitle>
                <CardDescription>
                  Upload one or many images to change background for (JPG, PNG,
                  WebP).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileUploader
                  onFilesSelected={handleSourceFiles}
                  acceptedTypes={["image/jpeg", "image/png", "image/webp"]}
                  maxFiles={50}
                  files={sourceFiles}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Select Background (optional)</CardTitle>
                <CardDescription>
                  Choose a solid color or upload an image to use as the new
                  background.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3 items-center">
                  <Button
                    variant={mode === "color" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMode("color")}
                  >
                    Solid Color
                  </Button>
                  <Button
                    variant={mode === "image" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMode("image")}
                  >
                    Image Background
                  </Button>
                </div>

                {mode === "color" && (
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-12 h-10 p-0 border rounded"
                    />
                    <Input
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                    />
                  </div>
                )}

                {mode === "image" && (
                  <div>
                    <FileUploader
                      onFilesSelected={handleBgFiles}
                      acceptedTypes={["image/jpeg", "image/png", "image/webp"]}
                      maxFiles={1}
                      files={bgFiles}
                    />
                    <div className="text-sm text-muted-foreground">
                      If no background image is provided, the solid color will
                      be used instead.
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t">
                  <h4 className="font-medium">
                    Chroma Key (background removal)
                  </h4>
                  <div className="flex items-center gap-3 mt-2">
                    <input
                      type="color"
                      value={chromaKey}
                      onChange={(e) => setChromaKey(e.target.value)}
                      className="w-10 h-10 p-0"
                    />
                    <div className="flex-1">
                      <Label>Key color</Label>
                      <div className="text-sm text-muted-foreground">
                        Pick the color to remove from the source image (green,
                        blue, red, etc.).
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <Label>Tolerance ({tolerance})</Label>
                    <Slider
                      value={[tolerance]}
                      onValueChange={(v) => setTolerance(v[0] ?? tolerance)}
                      min={1}
                      max={255}
                      step={1}
                    />
                    <div className="text-sm text-muted-foreground">
                      Higher tolerance removes a wider range of similar colors.
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-4">
                    <div>
                      <Label>Feather ({featherPx}px)</Label>
                      <Slider
                        value={[featherPx]}
                        onValueChange={(v) => setFeatherPx(v[0] ?? featherPx)}
                        min={0}
                        max={4}
                        step={1}
                      />
                    </div>
                    <div>
                      <Label>Matte bias ({matteBias})</Label>
                      <Slider
                        value={[matteBias]}
                        onValueChange={(v) => setMatteBias(v[0] ?? matteBias)}
                        min={-3}
                        max={3}
                        step={1}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {sourceFiles.length > 0 && (
              <Card className="max-w-5xl mx-auto">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>Preview</span>
                    <span className="text-sm text-muted-foreground">
                      Image {currentIndex + 1} of {sourceFiles.length}
                    </span>
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Live preview — updates as chroma key, tolerance and
                    background change.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goPrev}
                        disabled={currentIndex === 0}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goNext}
                        disabled={currentIndex === sourceFiles.length - 1}
                      >
                        Next
                      </Button>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {sourceFiles[currentIndex]?.name}
                    </div>
                  </div>

                  <div className="w-full border rounded overflow-hidden bg-muted">
                    <canvas
                      ref={previewCanvasRef}
                      className="w-full max-h-96 object-contain"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Export</CardTitle>
                <CardDescription>Process and download images.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={handleProcessCurrent}
                    disabled={sourceFiles.length === 0 || isProcessing}
                    className="w-full"
                  >
                    {isProcessing ? "Processing..." : "Process Current"}
                  </Button>
                  <Button
                    onClick={handleProcessAll}
                    disabled={sourceFiles.length === 0 || isProcessing}
                    className="w-full"
                    variant="outline"
                  >
                    {isProcessing ? "Processing..." : "Process All"}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Label>Blend Mode</Label>
                  <select
                    value={blendMode}
                    onChange={(e) => setBlendMode(e.target.value as Blend)}
                    className="p-2 rounded border"
                  >
                    <option value="source-over">Normal</option>
                    <option value="multiply">Multiply</option>
                    <option value="screen">Screen</option>
                    <option value="overlay">Overlay</option>
                    <option value="darken">Darken</option>
                    <option value="lighten">Lighten</option>
                  </select>
                </div>

                <div className="mt-3">
                  <Label>Foreground opacity ({fgOpacity}%)</Label>
                  <Slider
                    value={[fgOpacity]}
                    onValueChange={(v) => setFgOpacity(v[0] ?? fgOpacity)}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>

                {isProcessing && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Processing images...</span>
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
                  <Zap className="w-5 h-5 mr-2" /> Background Changer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      Pro
                    </Badge>
                    <span className="text-muted-foreground">
                      Client-side & private
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Features:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Solid color or image backgrounds</li>
                    <li>
                      • YCbCr chroma key with tolerance and luminance gate
                    </li>
                    <li>• Feather, shrink/expand, blend modes and opacity</li>
                    <li>• Live preview and batch processing</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {sourceFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Source Files</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {sourceFiles.map((f, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="truncate mr-2">{f.name}</span>
                        <span className="text-muted-foreground">
                          {formatFileSize(f.size)}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2 border-t">
                      <div className="flex justify-between font-medium">
                        <span>Total Size:</span>
                        <span>
                          {formatFileSize(
                            sourceFiles.reduce((s, f) => s + f.size, 0)
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {processedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Processed</span>
                    <Badge variant="default">{processedFiles.length}</Badge>
                  </CardTitle>
                  <CardDescription>Download results</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={downloadAll} className="w-full">
                    <Download className="w-4 h-4 mr-2" /> Download All (
                    {processedFiles.length})
                  </Button>
                  <div className="space-y-2 mt-3">
                    {processedFiles.map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {f.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(f.size)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadFile(f)}
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
