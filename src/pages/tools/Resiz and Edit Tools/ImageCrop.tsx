import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import Cropper from "react-easy-crop";
import getCroppedImg from "@/utils/getCroppedImg";
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
import { ArrowLeft, Crop, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FileUploader from "@/components/FileUploader";

const ImageCrop = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processedFiles, setProcessedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  // Cropper state
  const [crop, setCrop] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);

  // Manual input
  const [manualX, setManualX] = useState<number>(0);
  const [manualY, setManualY] = useState<number>(0);
  const [manualWidth, setManualWidth] = useState<string>("800");
  const [manualHeight, setManualHeight] = useState<string>("600");

  const { toast } = useToast();

  // ✅ Ref for auto-scroll to preview
  const previewRef = useRef<HTMLDivElement | null>(null);

  // Safe aspect ratio (prevents NaN / division by zero)
  const aspect = useMemo(() => {
    const w = parseFloat(manualWidth);
    const h = parseFloat(manualHeight);
    return Number.isFinite(w) && Number.isFinite(h) && h > 0 ? w / h : 1;
  }, [manualWidth, manualHeight]);

  // File selection handlers
  const handleFilesSelected = (files: File[]) => {
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

  const handleRemoveFile = (index: number) => {
    const updatedFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updatedFiles);
    if (currentFileIndex >= updatedFiles.length) {
      setCurrentFileIndex(Math.max(0, updatedFiles.length - 1));
    }
  };

  // Cropper -> state (one-way)
  const onCropComplete = useCallback((_, croppedPixels: any) => {
    setCroppedAreaPixels(croppedPixels);
    setManualX(Math.round(croppedPixels.x));
    setManualY(Math.round(croppedPixels.y));
  }, []);

  // Input handlers
  const onWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManualWidth(e.target.value);
  };
  const onHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManualHeight(e.target.value);
  };
  const onXChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setManualX(Number.isFinite(v) ? v : 0);
  };
  const onYChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setManualY(Number.isFinite(v) ? v : 0);
  };

  // Crop handler
  const handleCrop = async () => {
    if (!selectedFiles.length) {
      toast({
        title: "No files selected",
        description: "Please select at least one image to crop.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const file = selectedFiles[currentFileIndex];

      const cropPixels = croppedAreaPixels ?? {
        x: manualX,
        y: manualY,
        width: parseFloat(manualWidth) || 1,
        height: parseFloat(manualHeight) || 1,
      };

      const croppedBlob = await getCroppedImg(
        URL.createObjectURL(file),
        cropPixels
      );

      const newFile = new File(
        [croppedBlob as Blob],
        file.name.replace(/\.[^.]+$/, `_cropped$&`),
        { type: file.type }
      );

      setProcessedFiles((prev) => {
        const updated = [...prev];
        updated[currentFileIndex] = newFile;
        return updated;
      });

      toast({
        title: "Image cropped successfully!",
        description: `${file.name} has been cropped.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error cropping image",
        description: "An error occurred while cropping your image.",
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
            <Crop className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Crop Tool</h1>
              <p className="text-lg text-white/90">
                Crop images visually or manually by coordinates
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
                  Upload images to crop. Supports JPG, PNG, WebP.
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

            {selectedFiles.length > 1 && (
              <div className="flex items-center justify-between mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentFileIndex((prev) => Math.max(prev - 1, 0))
                  }
                  disabled={currentFileIndex === 0}
                >
                  Previous
                </Button>
                <p className="text-sm text-muted-foreground">
                  Image {currentFileIndex + 1} of {selectedFiles.length}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentFileIndex((prev) =>
                      Math.min(prev + 1, selectedFiles.length - 1)
                    )
                  }
                  disabled={currentFileIndex === selectedFiles.length - 1}
                >
                  Next
                </Button>
              </div>
            )}

            {selectedFiles.length > 0 && (
              // ✅ Attach scroll ref here
              <Card ref={previewRef}>
                <CardHeader>
                  <CardTitle>Crop Image</CardTitle>
                  <CardDescription>
                    Drag and resize the crop box or change values manually.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="relative w-full h-80 bg-gray-200">
                    <Cropper
                      image={URL.createObjectURL(
                        selectedFiles[currentFileIndex]
                      )}
                      crop={crop}
                      zoom={zoom}
                      aspect={aspect}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={onCropComplete}
                      cropShape="rect"
                      showGrid
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="x">X</Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={manualX}
                        onChange={onXChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="y">Y</Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        value={manualY}
                        onChange={onYChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="width">Width</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={manualWidth}
                        onChange={onWidthChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="height">Height</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={manualHeight}
                        onChange={onHeightChange}
                      />
                    </div>
                  </div>

                  <Button
                    onClick={handleCrop}
                    disabled={isProcessing}
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                        Processing...
                      </>
                    ) : (
                      <>
                        <Crop className="w-4 h-4 mr-2" /> Crop Images
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Crop className="w-5 h-5 mr-2" /> Crop Tool
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
                    <li>• Freehand crop</li>
                    <li>• Ratio presets</li>
                    <li>• Grid overlay</li>
                    <li>• Undo/redo support</li>
                    <li>• High-quality output</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {processedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Cropped Images</span>
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
                    <Download className="w-4 h-4 mr-2" /> Download All
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

export default ImageCrop;
