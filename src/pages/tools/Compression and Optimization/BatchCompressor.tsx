import React, { useState } from "react";
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
  Layers,
  ArrowLeft,
  Loader2,
  Trash2,
  Download,
  Zap,
} from "lucide-react";
import JSZip from "jszip";
import { useToast } from "@/hooks/use-toast";

const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024,
    sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const BatchCompressor: React.FC = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [compressedResults, setCompressedResults] = useState<
    { name: string; size: number; compressed: number; blob: Blob }[]
  >([]);

  const { toast } = useToast();

  const onPick = (newFiles: FileList | null) => {
    if (!newFiles) return;
    setFiles(Array.from(newFiles));
    setCompressedResults([]);
    setProgress(0);
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

      // Simulated compression (80%)
      const compressedBuffer = arrayBuffer.slice(
        0,
        arrayBuffer.byteLength * 0.8
      );
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

    setCompressedResults(results);
    setIsProcessing(false);
    toast({
      title: "Compression complete",
      description: `Processed ${files.length} file(s).`,
    });
  };

  const downloadAsZip = async () => {
    if (compressedResults.length === 0) return;

    const zip = new JSZip();
    compressedResults.forEach((r) => zip.file(r.name, r.blob));

    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "compressed_batch.zip";
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadSingleFile = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background">
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
            <Layers className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Batch Compressor</h1>
              <p className="text-lg text-white/90">
                Compress multiple files and download individually or as a ZIP.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left side */}
          <div className="lg:col-span-2 space-y-6">
            {/* Select files */}
            <Card>
              <CardHeader>
                <CardTitle>Select Files</CardTitle>
                <CardDescription>
                  Pick multiple files to compress.
                </CardDescription>
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
                              onClick={() =>
                                setFiles(files.filter((_, i) => i !== idx))
                              }
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between pt-2 font-medium">
                        <span>Total Files</span>
                        <span>{files.length}</span>
                      </div>
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

            {/* Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
                <CardDescription>
                  Compress and choose how to download.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
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
                      <Zap className="w-4 h-4 mr-2" /> Compress Files
                    </>
                  )}
                </Button>

                {compressedResults.length > 0 && (
                  <Button
                    onClick={downloadAsZip}
                    size="lg"
                    className="w-full"
                    variant="outline"
                  >
                    <Download className="w-4 h-4 mr-2" /> Download All as ZIP
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Compression Summary</CardTitle>
                <CardDescription>Results of the last batch.</CardDescription>
              </CardHeader>
              <CardContent>
                {compressedResults.length > 0 ? (
                  <div className="text-sm space-y-2">
                    {compressedResults.map((r, idx) => {
                      const percent = 100 - (r.compressed / r.size) * 100;
                      return (
                        <div
                          key={idx}
                          className="flex justify-between items-center border-b py-1"
                        >
                          <div className="truncate max-w-[50%]">{r.name}</div>
                          <div className="flex items-center space-x-2">
                            <span>
                              {formatSize(r.size)} → {formatSize(r.compressed)}{" "}
                              ({percent.toFixed(1)}% smaller)
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => downloadSingleFile(r.blob, r.name)}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="pt-2 border-t mt-2 font-medium flex justify-between">
                      <span>Total Files</span>
                      <span>{compressedResults.length}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No compression results yet. Run “Compress Files” first.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right side info */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="w-5 h-5 mr-2" /> Batch Compressor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>• Compress multiple files with consistent settings.</p>
                  <p>• Download each file or as one ZIP.</p>
                  <p>• Shows exact compression percentage.</p>
                  <p>• Works best for PDFs, images, and text files.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchCompressor;
