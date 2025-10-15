import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Rnd } from "react-rnd";
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
import { ArrowLeft, Download, ImageIcon } from "lucide-react";
import FileUploader from "@/components/FileUploader";
import { useToast } from "@/hooks/use-toast";

const AddSignature: React.FC = () => {
  const { toast } = useToast();

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

  const [sigX, setSigX] = useState<number>(20);
  const [sigY, setSigY] = useState<number>(20);
  const [sigWidth, setSigWidth] = useState<number>(200);
  const [sigHeight, setSigHeight] = useState<number>(80);
  const [sigOpacity, setSigOpacity] = useState<number>(1);
  const [showSignature, setShowSignature] = useState<boolean>(true);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const baseImageUrl = selectedFiles[currentIndex]
    ? URL.createObjectURL(selectedFiles[currentIndex])
    : null;

  useEffect(() => {
    return () => {
      if (baseImageUrl) URL.revokeObjectURL(baseImageUrl);
      if (signatureUrl) URL.revokeObjectURL(signatureUrl);
    };
  }, [selectedFiles, signatureFile]);

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    setCurrentIndex(0);
    setTimeout(() => {
      previewRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);
  };

  const handleSignatureSelected = (files: File[]) => {
    const file = files?.[0] ?? null;
    if (!file) return;
    if (!file.type.includes("png") && !file.type.includes("image")) {
      toast({
        title: "Invalid file",
        description:
          "Please upload a PNG signature (transparent background recommended)",
        variant: "destructive",
      });
      return;
    }
    setSignatureFile(file);
    const url = URL.createObjectURL(file);
    setSignatureUrl(url);
    setSigWidth(200);
    setSigHeight(80);
    setSigX(20);
    setSigY(20);
  };

  const handleRemoveFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updated);
    setCurrentIndex((prev) => Math.max(0, Math.min(prev, updated.length - 1)));
  };

  const handleNumberChange = (value: string, setter: (n: number) => void) => {
    const num = Number(value);
    if (!isNaN(num)) setter(num);
  };

  const downloadMerged = async () => {
    if (!selectedFiles.length) {
      toast({
        title: "No base image",
        description: "Please upload an image first.",
        variant: "destructive",
      });
      return;
    }

    const baseFile = selectedFiles[currentIndex];
    const baseImg = new Image();
    baseImg.crossOrigin = "anonymous";
    baseImg.src = URL.createObjectURL(baseFile);

    const sigImg = signatureFile ? new Image() : null;
    if (sigImg) {
      sigImg.crossOrigin = "anonymous";
      sigImg.src = signatureUrl as string;
    }

    baseImg.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = baseImg.naturalWidth;
      canvas.height = baseImg.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

      if (sigImg && showSignature) {
        sigImg.onload = () => {
          const container = containerRef.current;
          const imgElement = container?.querySelector("img");
          if (!container || !imgElement) return;

          const displayedW = imgElement.clientWidth;
          const displayedH = imgElement.clientHeight;

          const scaleX = canvas.width / displayedW;
          const scaleY = canvas.height / displayedH;

          const drawW = sigWidth * scaleX;
          const drawH = sigHeight * scaleY;
          const drawX = sigX * scaleX;
          const drawY = sigY * scaleY;

          ctx.globalAlpha = sigOpacity;
          ctx.drawImage(sigImg, drawX, drawY, drawW, drawH);
          ctx.globalAlpha = 1;

          canvas.toBlob((blob) => {
            if (!blob) return;
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = "AddSignature_result.png";
            document.body.appendChild(a);
            a.click();
            a.remove();
            toast({
              title: "Download ready",
              description: "Merged image downloaded.",
            });
          }, "image/png");
        };

        if (sigImg.complete && sigImg.naturalWidth)
          sigImg.onload?.(new Event("load") as any);
      } else {
        canvas.toBlob((blob) => {
          if (!blob) return;
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "AddSignature_result.png";
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast({ title: "Download ready", description: "Image downloaded." });
        }, "image/png");
      }
    };
  };

  const formatFileSize = (size: number) =>
    size > 1024 * 1024
      ? (size / (1024 * 1024)).toFixed(2) + " MB"
      : (size / 1024).toFixed(2) + " KB";

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
            <ImageIcon className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Add Signature</h1>
              <p className="text-lg text-white/90">
                Overlay a PNG signature over your images and download the merged
                result.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* File Upload */}
            <Card>
              <CardHeader>
                <CardTitle>Select Images</CardTitle>
                <CardDescription>
                  Upload images to add signature. Supports JPG, PNG, WebP.
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

            {/* Preview / Workspace */}
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
                    Drag and resize the signature directly on top of the image
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm text-muted-foreground truncate">
                    {selectedFiles[currentIndex]?.name}
                  </div>
                  {/* Image Navigation */}
                  {selectedFiles.length > 1 && (
                    <div className="flex items-center justify-between mb-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCurrentIndex((p) => Math.max(0, p - 1))
                        }
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
                  )}

                  <div
                    ref={containerRef}
                    className="relative w-full border rounded overflow-hidden bg-muted"
                    style={{ height: 520 }}
                  >
                    <img
                      src={baseImageUrl}
                      alt="base"
                      className="w-full h-full object-contain"
                    />
                    {signatureUrl && showSignature && (
                      <Rnd
                        bounds="parent"
                        size={{ width: sigWidth, height: sigHeight }}
                        position={{ x: sigX, y: sigY }}
                        onDragStop={(e, d) => {
                          setSigX(d.x);
                          setSigY(d.y);
                        }}
                        onResizeStop={(e, dir, ref, delta, position) => {
                          setSigWidth(ref.offsetWidth);
                          setSigHeight(ref.offsetHeight);
                          setSigX(position.x);
                          setSigY(position.y);
                        }}
                      >
                        <img
                          src={signatureUrl}
                          alt="signature"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "contain",
                            opacity: sigOpacity,
                            pointerEvents: "none",
                          }}
                        />
                      </Rnd>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Signature Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Signature Settings</CardTitle>
                <CardDescription>
                  Customize signature size, position, and opacity
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Label>Upload Signature</Label>
                <FileUploader
                  onFilesSelected={(files) => handleSignatureSelected(files)}
                  acceptedTypes={["image/png", "image/jpeg", "image/webp"]}
                  maxFiles={1}
                  files={signatureFile ? [signatureFile] : []}
                  onRemoveFile={() => {
                    setSignatureFile(null);
                    setSignatureUrl(null);
                  }}
                />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Opacity</Label>
                    <Input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={sigOpacity}
                      onChange={(e) => setSigOpacity(Number(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Width</Label>
                    <Input
                      type="number"
                      value={sigWidth}
                      onChange={(e) =>
                        handleNumberChange(e.target.value, setSigWidth)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Height</Label>
                    <Input
                      type="number"
                      value={sigHeight}
                      onChange={(e) =>
                        handleNumberChange(e.target.value, setSigHeight)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>X</Label>
                    <Input
                      type="number"
                      value={sigX}
                      onChange={(e) =>
                        handleNumberChange(e.target.value, setSigX)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Y</Label>
                    <Input
                      type="number"
                      value={sigY}
                      onChange={(e) =>
                        handleNumberChange(e.target.value, setSigY)
                      }
                    />
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSigX(20);
                    setSigY(20);
                    setSigWidth(200);
                    setSigHeight(80);
                    setSigOpacity(1);
                  }}
                >
                  Reset
                </Button>

                <Button onClick={downloadMerged} className="w-full">
                  <Download className="w-4 h-4 mr-2" /> Download Merged Image
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <ImageIcon className="w-5 h-5 mr-2" /> Add Signature
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Drag and resize signature</li>
                  <li>• Control opacity and position</li>
                  <li>• Supports JPG, PNG, WebP</li>
                  <li>• Download merged image</li>
                </ul>
              </CardContent>
            </Card>

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
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddSignature;
