import { useState, useMemo, useEffect, useRef } from "react";
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
  RotateCw,
  Loader2,
  RotateCw as RotateIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FileUploader from "@/components/FileUploader";

/**
 * ✅ Process image with rotation, flip, output format, and quality
 */
async function processImageFile(
  file,
  angleDeg = 0,
  flipH = false,
  flipV = false,
  outputType = "image/png",
  quality
) {
  const imgUrl = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = imgUrl;
  });

  const angle = (angleDeg % 360) * (Math.PI / 180);
  const sin = Math.abs(Math.sin(angle));
  const cos = Math.abs(Math.cos(angle));
  const newW = Math.ceil(img.width * cos + img.height * sin);
  const newH = Math.ceil(img.width * sin + img.height * cos);

  const canvas = document.createElement("canvas");
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext("2d");

  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(angle);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height);

  const blob = await new Promise((resolve, reject) => {
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

const ImageRotate = () => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [processedFiles, setProcessedFiles] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [livePreviewUrl, setLivePreviewUrl] = useState(null);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  const [angle, setAngle] = useState(0);
  const [customAngle, setCustomAngle] = useState("0");
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [applyQualityOption, setApplyQualityOption] = useState(false);
  const [jpegQuality, setJpegQuality] = useState([90]);
  const { toast } = useToast();

  // ✅ Ref for scrolling to preview
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!selectedFiles.length) return;
    let isCancelled = false;

    (async () => {
      const file = selectedFiles[currentFileIndex];
      if (!file) return;

      try {
        const qualityVal = applyQualityOption
          ? jpegQuality[0] / 100
          : undefined;
        const blob = await processImageFile(
          file,
          angle,
          flipH,
          flipV,
          applyQualityOption ? "image/jpeg" : "image/png",
          qualityVal
        );
        if (isCancelled) return;
        const previewUrl = URL.createObjectURL(blob as Blob);
        setLivePreviewUrl(previewUrl);
      } catch (err) {
        console.error("Preview generation failed", err);
      }
    })();

    return () => {
      isCancelled = true;
      if (livePreviewUrl) URL.revokeObjectURL(livePreviewUrl);
    };
  }, [
    selectedFiles,
    currentFileIndex,
    angle,
    flipH,
    flipV,
    applyQualityOption,
    jpegQuality,
  ]);

  const previewUrl = useMemo(() => {
    const p = processedFiles[currentFileIndex];
    if (p) return URL.createObjectURL(p);
    const s = selectedFiles[currentFileIndex];
    if (s) return URL.createObjectURL(s);
    return null;
  }, [selectedFiles, processedFiles, currentFileIndex]);

  const handleFilesSelected = (files) => {
    setSelectedFiles(files);
    setProcessedFiles([]);
    setCurrentFileIndex(0);
    setProgress(0);

    // ✅ Smooth scroll to crop preview
    setTimeout(() => {
      previewRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 300);
  };

  const handleRemoveFile = (index) => {
    const updatedSelected = selectedFiles.filter((_, i) => i !== index);
    const updatedProcessed = processedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updatedSelected);
    setProcessedFiles(updatedProcessed);
    if (currentFileIndex >= updatedSelected.length) {
      setCurrentFileIndex(Math.max(0, updatedSelected.length - 1));
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const blobToFile = (blob, fileName, mimeType) => {
    const type =
      mimeType ||
      blob.type ||
      (applyQualityOption ? "image/jpeg" : "image/png");
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
        const qualityVal = applyQualityOption
          ? jpegQuality[0] / 100
          : undefined;
        const requestedType = qualityVal ? "image/jpeg" : "image/png";
        const blob = await processImageFile(
          f,
          angle,
          flipH,
          flipV,
          requestedType,
          qualityVal
        );
        const actualType = (blob as Blob).type || requestedType;
        const ext =
          actualType === "image/jpeg"
            ? ".jpg"
            : actualType === "image/png"
            ? ".png"
            : `.${actualType.split("/")[1] || "bin"}`;
        const base = f.name.replace(/\.[^.]+$/, "");
        const newName = `${base}_rotated_${Math.round(angle)}${
          flipH ? "_fh" : ""
        }${flipV ? "_fv" : ""}${ext}`;
        const newFile = new File([blob as Blob], newName, { type: actualType });
        output.push(newFile);
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

  const processAndSetFile = async (file, index) => {
    setIsProcessing(true);
    setProgress(0);
    try {
      const qualityVal = applyQualityOption ? jpegQuality[0] / 100 : undefined;
      const blob = await processImageFile(
        file,
        angle,
        flipH,
        flipV,
        qualityVal ? "image/jpeg" : "image/png",
        qualityVal
      );
      const extension = qualityVal ? ".jpg" : ".png";
      const baseName = file.name.replace(/\.[^.]+$/, "");
      const newName = `${baseName}_rotated_${Math.round(angle)}${
        flipH ? "_fh" : ""
      }${flipV ? "_fv" : ""}${extension}`;
      const newFile = blobToFile(blob, newName, (blob as Blob).type);

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

  const downloadFile = (file) => {
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

  const applyPreset = (deg) => {
    setAngle(deg);
    setCustomAngle(String(deg));
  };

  const onCustomAngleChange = (e) => {
    const v = e.target.value;
    if (v === "" || /^-?\d+(\.\d+)?$/.test(v) || v === "-") {
      setCustomAngle(v);
      const parsed = parseFloat(v);
      if (!Number.isNaN(parsed)) setAngle(parsed);
    }
  };

  const onAngleSliderChange = (val) => {
    const v = Array.isArray(val) ? val[0] : val;
    setAngle(v);
    setCustomAngle(String(v));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
            <RotateIcon className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Rotate & Flip</h1>
              <p className="text-lg text-white/90">
                Rotate images by any angle and flip them horizontally or
                vertically.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left: Upload & Controls */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Select Images</CardTitle>
                <CardDescription>
                  Upload images to rotate/flip. Supports JPG, PNG, WebP.
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

            {/* ✅ Scroll target */}
            <Card ref={previewRef}>
              <CardHeader>
                <CardTitle>Rotate & Flip Settings</CardTitle>
                <CardDescription>
                  Use presets or set a custom angle. Toggle flips as needed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Navigation + Preview */}
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
                          alt="Rotated Preview"
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

                {/* Presets */}
                <div className="flex items-center space-x-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyPreset(90)}
                  >
                    Rotate 90°
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyPreset(180)}
                  >
                    Rotate 180°
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyPreset(0)}
                  >
                    Rotate 0°
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => applyPreset(-90)}
                  >
                    Rotate -90°
                  </Button>
                </div>

                {/* Custom angle */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Angle: {Math.round(angle)}°</Label>
                    <div className="w-32">
                      <Input
                        type="text"
                        value={customAngle}
                        onChange={onCustomAngleChange}
                        className="text-right"
                        aria-label="Custom angle"
                      />
                    </div>
                  </div>

                  <Slider
                    value={[Math.round(angle)]}
                    onValueChange={(v) =>
                      onAngleSliderChange(Array.isArray(v) ? v[0] : v)
                    }
                    min={-180}
                    max={180}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Flip toggles */}
                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="flip-h"
                      checked={flipH}
                      onCheckedChange={setFlipH}
                    />
                    <Label htmlFor="flip-h" className="cursor-pointer">
                      Flip Horizontal
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="flip-v"
                      checked={flipV}
                      onCheckedChange={setFlipV}
                    />
                    <Label htmlFor="flip-v" className="cursor-pointer">
                      Flip Vertical
                    </Label>
                  </div>
                </div>

                {/* Optional JPEG quality toggle */}
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={applyQualityOption}
                    onCheckedChange={setApplyQualityOption}
                    id="quality-toggle"
                  />
                  <Label htmlFor="quality-toggle">
                    Export as JPEG with quality
                  </Label>
                </div>
                {applyQualityOption && (
                  <div className="space-y-2">
                    <Label>JPEG Quality: {jpegQuality[0]}%</Label>
                    <Slider
                      value={jpegQuality}
                      onValueChange={setJpegQuality}
                      min={30}
                      max={100}
                      step={5}
                    />
                  </div>
                )}

                {/* Action Buttons */}
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
                        <RotateCw className="w-4 h-4 mr-2" /> Process Current
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
                        <RotateIcon className="w-4 h-4 mr-2" /> Process All (
                        {selectedFiles.length})
                      </>
                    )}
                  </Button>
                </div>

                {/* Progress */}
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

          {/* Right: Info & Results */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <RotateIcon className="w-5 h-5 mr-2" />
                  Rotate & Flip
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
                    <li>• 90°/180° presets</li>
                    <li>• Custom angle (-180° to 180°)</li>
                    <li>• Flip horizontal & vertical</li>
                    <li>• Batch & per-image processing</li>
                    <li>• Download processed images</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Original Files */}
            {selectedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Original Files</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {selectedFiles.map((file, idx) => {
                      if (!file) return null; // ✅ safety check
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

            {/* Processed Files */}
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
                      if (!file) return null; // ✅ safety check
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

export default ImageRotate;
