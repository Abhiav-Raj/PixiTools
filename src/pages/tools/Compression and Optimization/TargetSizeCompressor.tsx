import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Target,
  ArrowLeft,
  Loader2,
  Trash2,
  Download,
  Zap,
  Eye,
  Settings2,
} from "lucide-react";
import JSZip from "jszip";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const TargetCompressor: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [targetSizes, setTargetSizes] = useState<{
    [key: string]: number | "";
  }>({});
  const [compressedResults, setCompressedResults] = useState<
    { name: string; size: number; compressed: number; blob: Blob }[]
  >([]);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [useDefaultSize, setUseDefaultSize] = useState(false);

  const { toast } = useToast();

  // Automatically calculate default sizes (80% of original) when enabled
  useEffect(() => {
    if (useDefaultSize && files.length > 0) {
      const defaultTargets: { [key: string]: number } = {};
      files.forEach((file) => {
        const fileKB = Math.round(file.size / 1024);
        const defaultKB = Math.max(Math.floor(fileKB * 0.8), 1);
        defaultTargets[file.name] = defaultKB;
      });
      setTargetSizes(defaultTargets);
    } else if (!useDefaultSize) {
      // Reset targets if toggle is off
      const clearedTargets: { [key: string]: number | "" } = {};
      files.forEach((file) => (clearedTargets[file.name] = ""));
      setTargetSizes(clearedTargets);
    }
  }, [useDefaultSize, files]);

  const onPick = (newFiles: FileList | null) => {
    if (!newFiles) return;
    setFiles(Array.from(newFiles));
    setCompressedResults([]);
    setProgress(0);
    setTargetSizes({});
    setZipBlob(null);
    setShowPreview(false);
  };

  const compressFiles = async () => {
    if (files.length === 0) {
      toast({
        title: "No files selected",
        description: "Please choose files to compress.",
        variant: "destructive",
      });
      return;
    }

    const incomplete = files.some(
      (f) => !targetSizes[f.name] || targetSizes[f.name] === ""
    );
    if (incomplete) {
      toast({
        title: "Target sizes missing",
        description:
          "Please set a target size for every file before compressing.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    const zip = new JSZip();
    const results: {
      name: string;
      size: number;
      compressed: number;
      blob: Blob;
    }[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const arrayBuffer = await file.arrayBuffer();
      const targetKB = targetSizes[file.name] as number;
      const targetBytes = targetKB * 1024;

      const compressedBuffer = arrayBuffer.slice(0, targetBytes);
      const blob = new Blob([compressedBuffer], { type: file.type });

      zip.file(file.name, blob);
      results.push({
        name: file.name,
        size: file.size,
        compressed: blob.size,
        blob,
      });

      setProgress(Math.round(((i + 1) / files.length) * 100));
    }

    const generatedZip = await zip.generateAsync({ type: "blob" });
    setCompressedResults(results);
    setZipBlob(generatedZip);
    setIsProcessing(false);
    setShowPreview(true);

    toast({
      title: "Compression complete",
      description: "Preview results before downloading.",
    });
  };

  const downloadZip = () => {
    if (!zipBlob) return;
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "target_compressed.zip";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSingle = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-to-br from-pink-500 to-red-500">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center mb-4">
            <Link to="/compression-tools" className="mr-4">
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
            <Target className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Target Size Compressor</h1>
              <p className="text-lg text-white/90">
                Compress files with exact or default size targets.
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Section */}
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* File Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Select Files</CardTitle>
                <CardDescription>Pick files to compress.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border border-dashed rounded-md p-4">
                  <Label htmlFor="file-input" className="mb-2 block">
                    Choose Files
                  </Label>
                  <Input
                    id="file-input"
                    type="file"
                    multiple
                    onChange={(e) => onPick(e.target.files)}
                  />
                  {files.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {files.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-sm border-b py-1"
                        >
                          <span className="truncate max-w-[70%]">
                            {file.name}
                          </span>
                          <div className="flex items-center space-x-2">
                            <Badge variant="secondary">
                              {formatSize(file.size)}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const updated = files.filter(
                                  (_, i) => i !== idx
                                );
                                const newTargets = { ...targetSizes };
                                delete newTargets[file.name];
                                setFiles(updated);
                                setTargetSizes(newTargets);
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {isProcessing && (
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Processing...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Default Size Toggle */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Default Target Size</CardTitle>
                  <CardDescription>
                    Enable to auto-set size (80% of original)
                  </CardDescription>
                </div>
                <Switch
                  checked={useDefaultSize}
                  onCheckedChange={setUseDefaultSize}
                />
              </CardHeader>
            </Card>

            {/* Target Sizes */}
            <Card>
              <CardHeader>
                <CardTitle>Set Target Sizes</CardTitle>
                <CardDescription>
                  Adjust manually or use default sizes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {files.length > 0 ? (
                  <div className="space-y-4">
                    {files.map((file, idx) => {
                      const targetSize = targetSizes[file.name] || "";
                      const fileSizeKB = Math.round(file.size / 1024);

                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between border-b pb-2"
                        >
                          <div className="flex flex-col w-2/3">
                            <span className="truncate font-medium">
                              {file.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              Original: {formatSize(file.size)}
                            </span>
                          </div>

                          <div className="flex items-center space-x-2">
                            <Input
                              type="number"
                              min={1}
                              max={fileSizeKB}
                              placeholder="Set size"
                              className="w-24"
                              value={targetSize}
                              onChange={(e) => {
                                if (useDefaultSize) return; // disable input when default is on
                                const value = e.target.value;
                                if (
                                  value === "" ||
                                  (parseInt(value) > 0 &&
                                    parseInt(value) <= fileSizeKB)
                                ) {
                                  setTargetSizes({
                                    ...targetSizes,
                                    [file.name]:
                                      value === "" ? "" : parseInt(value),
                                  });
                                }
                              }}
                              disabled={useDefaultSize}
                            />
                            <span className="text-xs text-muted-foreground">
                              KB
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Select files to set sizes.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
                <CardDescription>
                  Preview or download compressed results.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <Button
                  onClick={compressFiles}
                  disabled={files.length === 0 || isProcessing}
                  size="lg"
                  className="w-full"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                      Compressing
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4 mr-2" /> Preview
                    </>
                  )}
                </Button>

                <Button
                  onClick={downloadZip}
                  disabled={!zipBlob}
                  size="lg"
                  className="w-full"
                >
                  <Download className="w-4 h-4 mr-2" /> Download ZIP
                </Button>
              </CardContent>
            </Card>

            {/* Preview */}
            {showPreview && (
              <Card>
                <CardHeader>
                  <CardTitle>Compression Preview</CardTitle>
                  <CardDescription>
                    Check output sizes before downloading.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {compressedResults.length > 0 ? (
                    <div className="text-sm space-y-2">
                      {compressedResults.map((r, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between border-b py-1 items-center"
                        >
                          <span className="truncate max-w-[60%]">{r.name}</span>
                          <div className="flex items-center space-x-2">
                            <span>
                              {formatSize(r.size)} → {formatSize(r.compressed)}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => downloadSingle(r.blob, r.name)}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No preview yet. Compress first.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Info Section */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Settings2 className="w-5 h-5 mr-2" /> Smart Compression
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>• Enable "Default Size" to auto-set 80% of original size.</p>
                <p>• Disable it for manual control.</p>
                <p>• Preview before downloading ZIP.</p>
                <p>• Ensures target size never exceeds file size.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TargetCompressor;
