import { useState, useEffect, useRef } from "react";
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
import { ArrowLeft, Download, Loader2, Type } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FileUploader from "@/components/FileUploader";
import { addWatermarkToImage } from "@/utils/imageProcessing";

type PositionType =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center"
  | "all-over";

const ImageWatermark = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processedFiles, setProcessedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [watermarkText, setWatermarkText] = useState("");
  const [opacity, setOpacity] = useState(50);
  const [position, setPosition] = useState<PositionType>("bottom-right");
  const [color, setColor] = useState<string>("#000000");

  const [currentIndex, setCurrentIndex] = useState(0);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null); // 🔹 Ref for scroll target
  const { toast } = useToast();

  // 🔹 Scroll animation when files are selected
  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    setProcessedFiles([]);
    setProgress(0);
    setCurrentIndex(0);

    // Smooth scroll to preview section
    setTimeout(() => {
      previewRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 400);
  };

  const handleRemoveFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    const updatedProcessed = processedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updated);
    setProcessedFiles(updatedProcessed);
    if (currentIndex >= updated.length) {
      setCurrentIndex(Math.max(0, updated.length - 1));
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // 🔹 Real-time watermark preview
  useEffect(() => {
    const drawPreview = async () => {
      const file = selectedFiles[currentIndex];
      if (!file || !previewCanvasRef.current) return;

      const imgUrl = URL.createObjectURL(file);
      const img = new Image();
      await new Promise<void>((res, rej) => {
        img.onload = () => res();
        img.onerror = () => rej(new Error("Preview image load failed"));
        img.src = imgUrl;
      });

      const canvas = previewCanvasRef.current!;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(imgUrl);
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      if (position === "all-over") {
        const t = document.createElement("canvas");
        const tctx = t.getContext("2d")!;
        const base = Math.min(canvas.width, canvas.height);
        const fontSize = Math.max(14, Math.round(base * 0.05));
        tctx.font = `${fontSize}px sans-serif`;
        tctx.textAlign = "center";
        tctx.textBaseline = "middle";

        const textW = Math.ceil(tctx.measureText(watermarkText).width);
        const textH = Math.ceil(fontSize);
        const pad = Math.round(fontSize * 0.75);
        const tileW = textW + pad * 2;
        const tileH = textH + pad * 2;
        t.width = tileW;
        t.height = tileH;

        tctx.font = `${fontSize}px sans-serif`;
        tctx.textAlign = "center";
        tctx.textBaseline = "middle";

        tctx.save();
        tctx.translate(tileW / 2, tileH / 2);
        tctx.rotate(-Math.PI / 4);
        tctx.fillStyle = color;
        tctx.globalAlpha = Math.max(0, Math.min(1, opacity / 100));
        tctx.fillText(watermarkText, 0, 0);
        tctx.restore();

        const pattern = ctx.createPattern(t, "repeat");
        if (pattern) {
          ctx.save();
          ctx.fillStyle = pattern as any;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
      } else {
        const base = Math.min(canvas.width, canvas.height);
        const fontSize = Math.max(14, Math.round(base * 0.05));
        ctx.font = `${fontSize}px sans-serif`;
        ctx.fillStyle = color;
        ctx.globalAlpha = Math.max(0, Math.min(1, opacity / 100));

        const textWidth = ctx.measureText(watermarkText).width;
        let x = 10;
        let y = canvas.height - 10;

        if (position.includes("top")) y = 20 + fontSize;
        if (position.includes("right")) x = canvas.width - textWidth - 10;
        if (position === "center") {
          x = (canvas.width - textWidth) / 2;
          y = canvas.height / 2;
        }

        ctx.fillText(watermarkText, x, y);
        ctx.globalAlpha = 1;
      }

      URL.revokeObjectURL(imgUrl);
    };

    drawPreview().catch(() => {});
  }, [selectedFiles, currentIndex, watermarkText, position, opacity, color]);

  // 🔹 Single Image Processing
  const handleAddWatermarkCurrent = async () => {
    if (!watermarkText) {
      toast({ title: "Enter watermark text", variant: "destructive" });
      return;
    }
    if (selectedFiles.length === 0) {
      toast({ title: "No files selected", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const file = selectedFiles[currentIndex];
      const watermarked = await addWatermarkToImage(
        file,
        watermarkText,
        position,
        opacity / 100,
        color
      );
      setProcessedFiles((prev) => {
        const copy = [...prev];
        copy[currentIndex] = watermarked;
        return copy;
      });
      setProgress(100);
      toast({
        title: "Watermark added",
        description: `${file.name} processed.`,
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: "Failed to add watermark",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 400);
    }
  };

  // 🔹 Batch Processing
  const handleAddWatermarkAll = async () => {
    if (!watermarkText) {
      toast({ title: "Enter watermark text", variant: "destructive" });
      return;
    }
    if (selectedFiles.length === 0) {
      toast({ title: "No files selected", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    const out: File[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const f = selectedFiles[i];
        const w = await addWatermarkToImage(
          f,
          watermarkText,
          position,
          opacity / 100,
          color
        );
        out[i] = w;
        setProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
      }
      setProcessedFiles(out);
      toast({
        title: "Watermark added",
        description: `${out.length} image(s) processed.`,
      });
    } catch (e) {
      console.error(e);
      toast({
        title: "Error",
        description: "Failed to add watermark",
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

  const downloadAllFiles = () => {
    processedFiles.forEach((file, i) =>
      setTimeout(() => downloadFile(file), i * 120)
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
            <Type className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Add Watermark</h1>
              <p className="text-lg text-white/90">
                Protect your images with custom text watermarks
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Upload & Settings */}
          <div className="lg:col-span-2 space-y-6">
            {/* File Upload */}
            <Card>
              <CardHeader>
                <CardTitle>Select Images</CardTitle>
                <CardDescription>
                  Upload images to add watermark. Supports JPG, PNG, WebP.
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

            {/* 🔹 Preview Section (Scroll Target) */}
            {selectedFiles.length > 0 && (
              <Card ref={previewRef} className="max-w-5xl mx-auto">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>Preview</span>
                    <span className="text-sm text-muted-foreground">
                      Image {currentIndex + 1} of {selectedFiles.length}
                    </span>
                  </CardTitle>
                  <CardDescription className="text-sm">
                    See watermark applied in real-time
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm text-muted-foreground truncate">
                    {selectedFiles[currentIndex]?.name}
                  </div>
                  <div className="flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentIndex((p) => Math.max(0, p - 1))}
                      disabled={currentIndex === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentIndex((p) =>
                          Math.min(selectedFiles.length - 1, p + 1)
                        )
                      }
                      disabled={currentIndex === selectedFiles.length - 1}
                    >
                      Next
                    </Button>
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

            {/* Watermark Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Watermark Settings</CardTitle>
                <CardDescription>
                  Customize watermark text, position, color, and opacity.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="watermark-text">Watermark Text</Label>
                  <Input
                    id="watermark-text"
                    value={watermarkText}
                    onChange={(e) => setWatermarkText(e.target.value)}
                    placeholder="Enter watermark text"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Position</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      "top-left",
                      "top-right",
                      "bottom-left",
                      "bottom-right",
                      "center",
                      "all-over",
                    ].map((pos) => (
                      <Button
                        key={pos}
                        variant={
                          position === (pos as PositionType)
                            ? "default"
                            : "outline"
                        }
                        onClick={() => setPosition(pos as PositionType)}
                      >
                        {pos.replace("-", " ")}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Opacity: {opacity}%</Label>
                  <Slider
                    value={[opacity]}
                    onValueChange={(val) => setOpacity(val[0])}
                    min={10}
                    max={100}
                    step={5}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Color</Label>
                  <Input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-12 h-10 p-0 border-0"
                    aria-label="Watermark color"
                  />
                </div>

                <div
                  className={`${
                    selectedFiles.length > 1 ? "grid grid-cols-2 gap-3" : "flex"
                  } w-full`}
                >
                  <Button
                    onClick={handleAddWatermarkCurrent}
                    disabled={selectedFiles.length === 0 || isProcessing}
                    className="w-full"
                    size="lg"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Type className="w-4 h-4 mr-2" />{" "}
                        {selectedFiles.length > 1
                          ? "Process Current"
                          : "Add Watermark"}
                      </>
                    )}
                  </Button>

                  {selectedFiles.length > 1 && (
                    <Button
                      onClick={handleAddWatermarkAll}
                      disabled={selectedFiles.length === 0 || isProcessing}
                      className="w-full"
                      size="lg"
                      variant="outline"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Type className="w-4 h-4 mr-2" /> Add Watermark (All)
                        </>
                      )}
                    </Button>
                  )}
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

          {/* Results & Info */}
          <div className="space-y-6">
            {/* Tool Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Type className="w-5 h-5 mr-2" /> Add Watermark
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      Pro
                    </Badge>
                    <span className="text-muted-foreground">
                      Custom watermarking
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

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Features:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Add custom text</li>
                    <li>• Position control</li>
                    <li>• Color & Opacity settings</li>
                    <li>• Supports JPG, PNG, WebP</li>
                    <li>• Batch processing</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Selected Files */}
            {selectedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Selected Files</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {selectedFiles.map((file, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="truncate mr-2">{file.name}</span>
                        <span className="text-muted-foreground">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Processed Files */}
            {processedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Watermarked Images</span>
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
                    <Download className="w-4 h-4 mr-2" /> Download All (
                    {processedFiles.length})
                  </Button>

                  <div className="space-y-2">
                    {processedFiles.map((file, i) => (
                      <div
                        key={i}
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

export default ImageWatermark;
