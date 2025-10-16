import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Download, Crop, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FileUploader from "@/components/FileUploader";
import { resizeImage, getImageDimensions } from "@/utils/imageProcessing";

const ImageResize = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedFiles, setProcessedFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);

  // Resize settings
  const [customWidth, setCustomWidth] = useState<string>("800");
  const [customHeight, setCustomHeight] = useState<string>("600");
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [presetSize, setPresetSize] = useState<string>("custom");

  // New features
  const [unit, setUnit] = useState("px"); // px, cm, in
  const [dpi, setDpi] = useState(96); // used when unit is cm/in
  const [resizeMode, setResizeMode] = useState("dimension"); // dimension | percentage
  const [percentage, setPercentage] = useState(100);

  // Image previews
  const [previews, setPreviews] = useState<string[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  const presetSizes = {
    custom: { width: 0, height: 0, label: "Custom Size" },
    hd: { width: 1280, height: 720, label: "HD (1280×720)" },
    fullhd: { width: 1920, height: 1080, label: "Full HD (1920×1080)" },
    "instagram-square": {
      width: 1080,
      height: 1080,
      label: "Instagram Square (1080×1080)",
    },
    "instagram-story": {
      width: 1080,
      height: 1920,
      label: "Instagram Story (1080×1920)",
    },
    "facebook-cover": {
      width: 1200,
      height: 630,
      label: "Facebook Cover (1200×630)",
    },
    "twitter-header": {
      width: 1500,
      height: 500,
      label: "Twitter Header (1500×500)",
    },
    "linkedin-banner": {
      width: 1584,
      height: 396,
      label: "LinkedIn Banner (1584×396)",
    },
    thumbnail: { width: 400, height: 300, label: "Thumbnail (400×300)" },
  };

  // 🔹 Handle file selection and preview
  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    setProcessedFiles([]);
    setProgress(0);
    setPreviews(files.map((file) => URL.createObjectURL(file)));

    // Smooth scroll to preview
    setTimeout(() => {
      previewRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 400);
  };

  const handleRemoveFile = (index: number) => {
    const updatedFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updatedFiles);
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePresetChange = (value: string) => {
    setPresetSize(value);
    if (value !== "custom") {
      const preset = presetSizes[value as keyof typeof presetSizes];
      setCustomWidth(preset.width.toString());
      setCustomHeight(preset.height.toString());
    }
  };

  const handleResize = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select at least one image to resize.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    const resizedFiles: File[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const original = await getImageDimensions(file);
        let width: number;
        let height: number;

        if (resizeMode === "percentage") {
          width = (original.width * percentage) / 100;
          height = (original.height * percentage) / 100;
        } else {
          width = parseFloat(customWidth);
          height = parseFloat(customHeight);

          if (unit === "cm") {
            width = (width / 2.54) * dpi;
            height = (height / 2.54) * dpi;
          } else if (unit === "in") {
            width = width * dpi;
            height = height * dpi;
          }
        }

        if (!width || !height || width <= 0 || height <= 0) {
          toast({
            title: "Invalid dimensions",
            description: "Please enter valid width and height values.",
            variant: "destructive",
          });
          setIsProcessing(false);
          return;
        }

        const resizedFile = await resizeImage(
          file,
          Math.round(width),
          Math.round(height),
          maintainAspectRatio
        );

        const newName = file.name.replace(
          /(\.[^.]+)$/,
          resizeMode === "percentage"
            ? `_scaled-${percentage}%$1`
            : `_${Math.round(width)}x${Math.round(height)}${
                unit === "px" ? "px" : ""
              }$1`
        );

        const renamedFile = new File([resizedFile], newName, {
          type: resizedFile.type,
        });

        resizedFiles.push(renamedFile);
        setProgress(((i + 1) / selectedFiles.length) * 100);
      }

      setProcessedFiles(resizedFiles);
      toast({
        title: "Images resized successfully!",
        description: `Processed ${resizedFiles.length} image${
          resizedFiles.length > 1 ? "s" : ""
        }.`,
      });

      // Smooth scroll to results
      setTimeout(() => {
        resultRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 400);
    } catch (error) {
      console.error("Error resizing images:", error);
      toast({
        title: "Error resizing images",
        description:
          "An error occurred while processing your images. Please try again.",
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
    processedFiles.forEach((file) => {
      setTimeout(() => downloadFile(file), 100);
    });
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
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Tools
              </Button>
            </Link>
          </div>
          <div className="flex items-center text-white">
            <Crop className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Image Resizer</h1>
              <p className="text-lg text-white/90">
                Resize images by pixels, centimeters, inches, or percentage
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
                  Upload images to resize. Supports JPG, PNG, WebP formats.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileUploader
                  onFilesSelected={handleFilesSelected}
                  acceptedTypes={["image/jpeg", "image/png", "image/webp"]}
                  maxFiles={10}
                  files={selectedFiles}
                  onRemoveFile={handleRemoveFile}
                />
              </CardContent>
            </Card>

            {/* Live Preview */}
            {previews.length > 0 && (
              <motion.div
                ref={previewRef}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <Card className="border-primary/20 shadow-lg">
                  <CardHeader>
                    <CardTitle>Preview ({previews.length})</CardTitle>
                    <CardDescription>Uploaded image preview</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {previews.map((src, idx) => (
                        <motion.img
                          key={idx}
                          src={src}
                          alt={`Preview ${idx}`}
                          className="rounded-lg shadow border hover:scale-[1.02] transition-transform"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.1 }}
                        />
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Resize Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Resize Settings</CardTitle>
                <CardDescription>
                  Choose preset, set units, or resize by percentage.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Mode */}
                <div className="space-y-2">
                  <Label>Resize Mode</Label>
                  <Select value={resizeMode} onValueChange={setResizeMode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dimension">By Dimensions</SelectItem>
                      <SelectItem value="percentage">By Percentage</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {resizeMode === "dimension" && (
                  <>
                    {/* Preset */}
                    <div className="space-y-2">
                      <Label htmlFor="preset">Size Preset</Label>
                      <Select
                        value={presetSize}
                        onValueChange={handlePresetChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a preset" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(presetSizes).map(([key, preset]) => (
                            <SelectItem key={key} value={key}>
                              {preset.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Width/Height */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="width">Width</Label>
                        <Input
                          id="width"
                          type="number"
                          value={customWidth}
                          onChange={(e) => setCustomWidth(e.target.value)}
                          min="1"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="height">Height</Label>
                        <Input
                          id="height"
                          type="number"
                          value={customHeight}
                          onChange={(e) => setCustomHeight(e.target.value)}
                          min="1"
                        />
                      </div>
                    </div>

                    {/* Unit & DPI */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-1 space-y-2">
                        <Label htmlFor="unit">Unit</Label>
                        <Select value={unit} onValueChange={setUnit}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="px">Pixels (px)</SelectItem>
                            <SelectItem value="cm">Centimeters (cm)</SelectItem>
                            <SelectItem value="in">Inches (in)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {unit !== "px" && (
                        <div className="col-span-2 space-y-2">
                          <Label htmlFor="dpi">Resolution (DPI)</Label>
                          <Input
                            id="dpi"
                            type="number"
                            value={dpi}
                            onChange={(e) => setDpi(Number(e.target.value))}
                            placeholder="96"
                            min="50"
                            max="1200"
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}

                {resizeMode === "percentage" && (
                  <div className="space-y-2">
                    <Label>Scale (%)</Label>
                    <Input
                      type="number"
                      value={percentage}
                      onChange={(e) => setPercentage(Number(e.target.value))}
                      min="1"
                      max="500"
                    />
                  </div>
                )}

                {/* Aspect Ratio */}
                <div className="flex items-center space-x-2">
                  <Switch
                    id="aspect-ratio"
                    checked={maintainAspectRatio}
                    onCheckedChange={setMaintainAspectRatio}
                  />
                  <Label htmlFor="aspect-ratio">Maintain aspect ratio</Label>
                </div>

                {/* Button */}
                <Button
                  onClick={handleResize}
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
                      <Crop className="w-4 h-4 mr-2" />
                      Resize Images ({selectedFiles.length})
                    </>
                  )}
                </Button>

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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Crop className="w-5 h-5 mr-2" />
                  Image Resizer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>• Resize in px, cm, or inches</p>
                  <p>• Adjust DPI for print or web</p>
                  <p>• Resize by scale percentage</p>
                  <p>• Maintains high-quality output</p>
                </div>
              </CardContent>
            </Card>

            {processedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Processed Images</span>
                    <Badge>{processedFiles.length} files</Badge>
                  </CardTitle>
                  <CardDescription>
                    Click to download individual files or all at once.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button onClick={downloadAllFiles} className="w-full">
                    <Download className="w-4 h-4 mr-2" />
                    Download All ({processedFiles.length})
                  </Button>
                  <div className="space-y-2">
                    {processedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(file.size / 1024).toFixed(1)} KB
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

export default ImageResize;
