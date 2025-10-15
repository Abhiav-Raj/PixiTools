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

  const { toast } = useToast();

  const presetSizes = {
    custom: { width: 0, height: 0, label: "Custom Size" },
    hd: { width: 1920, height: 1080, label: "HD (1920×1080)" },
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

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    setProcessedFiles([]);
    setProgress(0);
  };

  const handleRemoveFile = (index: number) => {
    const updatedFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updatedFiles);
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

    const width = parseInt(customWidth);
    const height = parseInt(customHeight);

    if (!width || !height || width <= 0 || height <= 0) {
      toast({
        title: "Invalid dimensions",
        description: "Please enter valid width and height values.",
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

        // Get original dimensions for display
        const originalDimensions = await getImageDimensions(file);

        const resizedFile = await resizeImage(
          file,
          width,
          height,
          maintainAspectRatio
        );

        // Rename file to include dimensions
        const newName = file.name.replace(
          /(\.[^.]+)$/,
          `_${width}x${height}$1`
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
                Resize images with presets or custom dimensions
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

            {/* Resize Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Resize Settings</CardTitle>
                <CardDescription>
                  Choose a preset size or enter custom dimensions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Preset Selection */}
                <div className="space-y-2">
                  <Label htmlFor="preset">Size Preset</Label>
                  <Select value={presetSize} onValueChange={handlePresetChange}>
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

                {/* Custom Dimensions */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="width">Width (px)</Label>
                    <Input
                      id="width"
                      type="number"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(e.target.value)}
                      placeholder="800"
                      min="1"
                      max="10000"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height">Height (px)</Label>
                    <Input
                      id="height"
                      type="number"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(e.target.value)}
                      placeholder="600"
                      min="1"
                      max="10000"
                    />
                  </div>
                </div>

                {/* Aspect Ratio Lock */}
                <div className="flex items-center space-x-2">
                  <Switch
                    id="aspect-ratio"
                    checked={maintainAspectRatio}
                    onCheckedChange={setMaintainAspectRatio}
                  />
                  <Label htmlFor="aspect-ratio">Maintain aspect ratio</Label>
                </div>

                {/* Process Button */}
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

                {/* Progress */}
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
                  <Crop className="w-5 h-5 mr-2" />
                  Image Resizer
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
                      No file size limits
                    </span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Badge variant="outline" className="mr-2">
                      Privacy
                    </Badge>
                    <span className="text-muted-foreground">
                      Files never uploaded
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Features:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Social media presets</li>
                    <li>• Custom dimensions</li>
                    <li>• Aspect ratio control</li>
                    <li>• Batch processing</li>
                    <li>• High quality output</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Results */}
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
                    Click individual files to download or download all at once.
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
