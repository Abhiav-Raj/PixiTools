import React, { useState, useRef } from "react";
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
  FileText,
  Download,
  Loader2,
  Image as ImageIcon,
  MoveUp,
  MoveDown,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FileUploader from "@/components/FileUploader";
import { jsPDF } from "jspdf";
import JSZip from "jszip"; // NEW

// Page size map in points (1 pt = 1/72 inch).
const PAGE_SIZES = {
  A4: { width: 595.28, height: 841.89 }, // 210mm x 297mm
  Letter: { width: 612, height: 792 },
};

// Target output DPI inside PDF for raster resampling (balance of clarity/size)
const TARGET_DPI = 144; // 2× 72pt per inch for crisp results without huge files

const ImageToPDF = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pageSize, setPageSize] = useState<"A4" | "Letter" | "Original">("A4");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">(
    "portrait"
  );
  const [includeMargins, setIncludeMargins] = useState(true);
  const [imageQuality, setImageQuality] = useState([92]); // percent for JPEG
  const [fitToPage, setFitToPage] = useState(true);

  const { toast } = useToast();
  const downloadRef = useRef<HTMLAnchorElement | null>(null);

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    setProgress(0);
  };

  const handleRemoveFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updated);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const copy = [...selectedFiles];
    [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
    setSelectedFiles(copy);
  };

  const moveDown = (index: number) => {
    if (index === selectedFiles.length - 1) return;
    const copy = [...selectedFiles];
    [copy[index + 1], copy[index]] = [copy[index], copy[index + 1]];
    setSelectedFiles(copy);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Utility to load image into an HTMLImageElement
  const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = URL.createObjectURL(file);
    });
  };

  const calculatePageDims = (img: HTMLImageElement) => {
    if (pageSize === "Original") {
      const pxToPt = (px: number) => (px * 72) / 96;
      const w = pxToPt(img.width);
      const h = pxToPt(img.height);
      if (orientation === "portrait") return { width: w, height: h };
      return { width: h, height: w };
    }
    const base = PAGE_SIZES[pageSize];
    if (orientation === "portrait")
      return { width: base.width, height: base.height };
    return { width: base.height, height: base.width };
  };

  // Shared helpers
  const pxToPt = (px: number) => (px * 72) / 96;
  const ptToPxAt = (pt: number, dpi: number) => Math.round((pt / 72) * dpi);

  // Build one page for a given image file and return a PDF Blob
  const buildSinglePagePdfBlob = async (file: File) => {
    const img = await loadImage(file);
    const pageDims = calculatePageDims(img);
    const doc = new jsPDF({
      unit: "pt",
      format: [pageDims.width, pageDims.height],
      orientation,
    });

    const margin = includeMargins ? 36 : 0; // 0.5 in
    const usableWidth = pageDims.width - margin * 2;
    const usableHeight = pageDims.height - margin * 2;

    // Desired on‑page size in pt while preserving aspect
    const ar = img.width / img.height;
    let drawWpt = pxToPt(img.width);
    let drawHpt = pxToPt(img.height);
    if (fitToPage) {
      if (usableWidth / usableHeight < ar) {
        drawWpt = Math.min(usableWidth, drawWpt);
        drawHpt = drawWpt / ar;
      } else {
        drawHpt = Math.min(usableHeight, drawHpt);
        drawWpt = drawHpt * ar;
      }
    } else {
      if (drawWpt > usableWidth) {
        drawWpt = usableWidth;
        drawHpt = drawWpt / ar;
      }
      if (drawHpt > usableHeight) {
        drawHpt = usableHeight;
        drawWpt = drawHpt * ar;
      }
    }

    // Resample once at target DPI, never upscale
    const needPxW = Math.min(img.width, ptToPxAt(drawWpt, TARGET_DPI));
    const needPxH = Math.min(img.height, ptToPxAt(drawHpt, TARGET_DPI));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, needPxW);
    canvas.height = Math.max(1, needPxH);
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const q = imageQuality[0] / 100;
    const dataURL = canvas.toDataURL("image/jpeg", q);
    const x = margin + (usableWidth - drawWpt) / 2;
    const y = margin + (usableHeight - drawHpt) / 2;
    doc.addImage(dataURL, "JPEG", x, y, drawWpt, drawHpt);

    try {
      URL.revokeObjectURL(img.src);
    } catch {}

    return doc.output("blob");
  };

  const generatePDF = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No images",
        description: "Please upload at least one image to convert.",
        variant: "destructive",
      });
      return;
    }
    setIsProcessing(true);
    setProgress(0);

    try {
      // First page based on first image
      const firstImg = await loadImage(selectedFiles[0]);
      const firstDims = calculatePageDims(firstImg);
      const doc = new jsPDF({
        unit: "pt",
        format: [firstDims.width, firstDims.height],
        orientation,
      });

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const img = i === 0 ? firstImg : await loadImage(file);

        const pageDims = i === 0 ? firstDims : calculatePageDims(img);
        if (i > 0) doc.addPage([pageDims.width, pageDims.height], orientation);
        else doc.setPage(1);

        const margin = includeMargins ? 36 : 0;
        const usableWidth = pageDims.width - margin * 2;
        const usableHeight = pageDims.height - margin * 2;

        const ar = img.width / img.height;
        let drawWpt = pxToPt(img.width);
        let drawHpt = pxToPt(img.height);
        if (fitToPage) {
          if (usableWidth / usableHeight < ar) {
            drawWpt = Math.min(usableWidth, drawWpt);
            drawHpt = drawWpt / ar;
          } else {
            drawHpt = Math.min(usableHeight, drawHpt);
            drawWpt = drawHpt * ar;
          }
        } else {
          if (drawWpt > usableWidth) {
            drawWpt = usableWidth;
            drawHpt = drawWpt / ar;
          }
          if (drawHpt > usableHeight) {
            drawHpt = usableHeight;
            drawWpt = drawHpt * ar;
          }
        }

        const needPxW = Math.min(img.width, ptToPxAt(drawWpt, TARGET_DPI));
        const needPxH = Math.min(img.height, ptToPxAt(drawHpt, TARGET_DPI));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, needPxW);
        canvas.height = Math.max(1, needPxH);
        const ctx = canvas.getContext("2d")!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const q = imageQuality[0] / 100;
        const dataURL = canvas.toDataURL("image/jpeg", q);
        const x = margin + (usableWidth - drawWpt) / 2;
        const y = margin + (usableHeight - drawHpt) / 2;
        doc.addImage(dataURL, "JPEG", x, y, drawWpt, drawHpt);

        try {
          URL.revokeObjectURL(img.src);
        } catch {}

        setProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
      }

      const pdfBlob = doc.output("blob");
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `images_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "PDF created",
        description: `Generated PDF with ${selectedFiles.length} page${
          selectedFiles.length > 1 ? "s" : ""
        }.`,
      });
    } catch (err) {
      console.error("Error generating PDF", err);
      toast({
        title: "Error",
        description: "An error occurred while creating the PDF.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  // NEW: generate individual one‑page PDFs and download as a ZIP
  const generateIndividualPdfsZip = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No images",
        description: "Please upload at least one image to convert.",
        variant: "destructive",
      });
      return;
    }
    setIsProcessing(true);
    setProgress(0);
    try {
      const zip = new JSZip();

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const pdfBlob = await buildSinglePagePdfBlob(file);
        const base = file.name.replace(/\.[^.]+$/, "");
        zip.file(`${base}.pdf`, pdfBlob); // add each PDF to archive
        setProgress(Math.round(((i + 1) / selectedFiles.length) * 70)); // 0-70% for building
      }

      // Generate ZIP with progress feedback
      const content = await zip.generateAsync(
        {
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        },
        (meta) => setProgress(70 + Math.round(meta.percent * 0.3)) // 70-100% for zipping
      );
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `images_${Date.now()}_individual_pdfs.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "ZIP created",
        description: `Generated ${selectedFiles.length} individual PDFs in a ZIP.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to create individual PDFs ZIP.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-gradient-to-br from-purple-500 to-pink-600">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center mb-4">
            <Link to="/conversion-tools" className="mr-4">
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
            <FileText className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Image → PDF</h1>
              <p className="text-lg text-white/90">
                Convert single or multiple images into a professional PDF
                document.
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
                  Upload images to include in the PDF. Supported: JPG, PNG,
                  WebP.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileUploader
                  onFilesSelected={handleFilesSelected}
                  acceptedTypes={["image/jpeg", "image/png", "image/webp"]}
                  maxFiles={50}
                  files={selectedFiles}
                  onRemoveFile={handleRemoveFile}
                />

                {/* Preview strip with reorder buttons and page index */}
                {selectedFiles.length > 0 && (
                  <div className="mt-4">
                    <Label>Preview (use the buttons to reorder)</Label>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-3">
                      {selectedFiles.map((file, idx) => (
                        <div
                          key={idx}
                          className="border rounded p-2 flex flex-col"
                        >
                          <div className="flex-1 mb-2 h-28 bg-muted rounded flex items-center justify-center overflow-hidden">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={file.name}
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                          <div className="text-xs truncate mb-1">
                            {file.name}
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{formatFileSize(file.size)}</span>
                            <Badge variant="secondary">Page {idx + 1}</Badge>
                          </div>

                          <div className="flex items-center justify-between mt-2">
                            <div className="flex space-x-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => moveUp(idx)}
                                disabled={idx === 0}
                              >
                                <MoveUp className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => moveDown(idx)}
                                disabled={idx === selectedFiles.length - 1}
                              >
                                <MoveDown className="w-3 h-3" />
                              </Button>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRemoveFile(idx)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>PDF Settings</CardTitle>
                <CardDescription>
                  Page size, orientation, margins and quality.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Page Size</Label>
                    <select
                      className="w-full mt-2 p-2 rounded border"
                      value={pageSize}
                      onChange={(e) => setPageSize(e.target.value as any)}
                    >
                      <option value="A4">A4</option>
                      <option value="Letter">Letter</option>
                      <option value="Original">
                        Original (use image size)
                      </option>
                    </select>
                  </div>

                  <div>
                    <Label>Orientation</Label>
                    <select
                      className="w-full mt-2 p-2 rounded border"
                      value={orientation}
                      onChange={(e) => setOrientation(e.target.value as any)}
                    >
                      <option value="portrait">Portrait</option>
                      <option value="landscape">Landscape</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Switch
                    id="margins"
                    checked={includeMargins}
                    onCheckedChange={setIncludeMargins}
                  />
                  <Label htmlFor="margins">
                    Include standard margins (0.5 in)
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label>Image Quality: {imageQuality[0]}%</Label>
                  <Slider
                    value={imageQuality}
                    onValueChange={setImageQuality}
                    min={40}
                    max={100}
                    step={1}
                  />
                  <div className="grid grid-cols-2 text-sm text-muted-foreground">
                    <span>Smaller file</span>
                    <span className="text-right">Higher quality</span>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Switch
                    id="fittopage"
                    checked={fitToPage}
                    onCheckedChange={setFitToPage}
                  />
                  <Label htmlFor="fittopage">
                    Fit images to page (keep aspect ratio)
                  </Label>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    onClick={generatePDF}
                    disabled={selectedFiles.length === 0 || isProcessing}
                    size="lg"
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                        Generating PDF ({progress}%)
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" /> Create PDF (
                        {selectedFiles.length} page
                        {selectedFiles.length > 1 ? "s" : ""})
                      </>
                    )}
                  </Button>

                  {/* NEW: Individual PDFs ZIP */}
                  <Button
                    onClick={generateIndividualPdfsZip}
                    disabled={selectedFiles.length === 0 || isProcessing}
                    size="lg"
                    className="w-full"
                    variant="outline"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                        Creating ZIP ({progress}%)
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" /> Individual PDFs
                        (ZIP)
                      </>
                    )}
                  </Button>
                </div>

                {isProcessing && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Processing images...</span>
                      <span>{progress}%</span>
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
                  <ImageIcon className="w-5 h-5 mr-2" /> Image to PDF
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      Popular
                    </Badge>
                    <span className="text-muted-foreground">
                      Single PDF output • Batch convert
                    </span>
                  </div>
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Features:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Multiple images → single PDF</li>
                      <li>• Individual PDFs as ZIP</li>
                      <li>• Page size & orientation</li>
                      <li>• Reorder pages (preview shows page numbers)</li>
                      <li>• Image quality control</li>
                      <li>• Browser-only processing — secure</li>
                    </ul>
                  </div>
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
                    {selectedFiles.map((file, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center text-sm py-2 border-b"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="font-medium truncate">
                            {file.name}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatFileSize(file.size)}
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t mt-2 flex justify-between font-medium">
                      <span>Total Files</span>
                      <span>{selectedFiles.length}</span>
                    </div>
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

export default ImageToPDF;
