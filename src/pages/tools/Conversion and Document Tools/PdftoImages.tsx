// Key changes: (1) new generateImages() handles single vs multi-page export,
// (2) small helper downloadBlob(), (3) minor cleanup in render params.

import React, { useMemo, useRef, useState } from "react";
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
  FileImage,
  Loader2,
  Trash2,
  FileText,
} from "lucide-react";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
// Vite-friendly worker import and assignment via workerPort
import PDFWorker from "pdfjs-dist/build/pdf.worker.mjs?worker";
pdfjsLib.GlobalWorkerOptions.workerPort = new PDFWorker();

// shadcn toast hook
import { useToast } from "@/hooks/use-toast";

type ImgFormat = "PNG" | "JPEG";

const DEFAULT_DPI = 144;
const MIN_DPI = 72;
const MAX_DPI = 300;

const parsePageRange = (range: string, total: number): number[] => {
  if (!range.trim()) return Array.from({ length: total }, (_, i) => i + 1);
  const out = new Set<number>();
  for (const part of range.split(",")) {
    const p = part.trim();
    if (!p) continue;
    if (p.includes("-")) {
      const [a, b] = p.split("-").map((x) => parseInt(x.trim(), 10));
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const start = Math.max(1, Math.min(a, b));
        const end = Math.min(total, Math.max(a, b));
        for (let i = start; i <= end; i++) out.add(i);
      }
    } else {
      const n = parseInt(p, 10);
      if (Number.isFinite(n) && n >= 1 && n <= total) out.add(n);
    }
  }
  return Array.from(out).sort((x, y) => x - y);
};

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const PDFToImages: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [imgFormat, setImgFormat] = useState<ImgFormat>("PNG");
  const [jpegQuality, setJpegQuality] = useState([92]); // percent
  const [dpi, setDpi] = useState([DEFAULT_DPI]); // DPI target
  const [transparentPng, setTransparentPng] = useState(true);
  const [pageRange, setPageRange] = useState(""); // e.g. "1-3,5"

  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const acceptTypes = useMemo(() => ["application/pdf"], []);

  const handleFileChange = (files: File[]) => {
    setPdfFile(files && files[0] ? files[0] : null);
    setProgress(0);
  };

  const reset = () => {
    setPdfFile(null);
    setProgress(0);
  };

  const renderPageToBlob = async (
    pdf: pdfjsLib.PDFDocumentProxy,
    pageNum: number,
    targetDpi: number,
    fmt: ImgFormat,
    qualityPct: number,
    transparent: boolean
  ): Promise<{ blob: Blob; filename: string }> => {
    const page = await pdf.getPage(pageNum);
    const scale = targetDpi / 72; // PDF user space is 72 DPI
    const viewport = page.getViewport({ scale });

    const canvas =
      canvasRef.current ||
      (canvasRef.current = document.createElement("canvas"));
    const ctx = canvas.getContext("2d")!;
    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    // Background handling
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fmt === "PNG" && transparent) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.restore();

    const renderContext: any = {
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      transform:
        outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      viewport,
    };

    await page.render(renderContext).promise;

    const type = fmt === "PNG" ? "image/png" : "image/jpeg";
    const q =
      fmt === "JPEG" ? Math.min(1, Math.max(0.4, qualityPct / 100)) : undefined;

    const blob: Blob = await new Promise((resolve) => {
      if (fmt === "PNG") {
        canvas.toBlob((b) => resolve(b || new Blob()), type);
      } else {
        canvas.toBlob((b) => resolve(b || new Blob()), type, q);
      }
    });

    const baseName = (pdfFile?.name || "document").replace(/\.[^.]+$/, "");
    const filename = `${baseName}_page_${String(pageNum).padStart(
      3,
      "0"
    )}.${fmt.toLowerCase()}`;
    return { blob, filename };
  };

  const generateImages = async () => {
    if (!pdfFile) {
      toast({
        title: "No PDF",
        description: "Please upload a PDF file to convert.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const arrayBuf = await pdfFile.arrayBuffer();
      const task = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuf) });
      const pdf = await task.promise;

      const pages = parsePageRange(pageRange, pdf.numPages);
      if (pages.length === 0) {
        toast({
          title: "Invalid range",
          description: "No pages match the given range.",
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }

      // Single page: render and download the image directly (no ZIP)
      if (pages.length === 1) {
        const p = pages[0];
        const { blob, filename } = await renderPageToBlob(
          pdf,
          p,
          dpi[0],
          imgFormat,
          jpegQuality[0],
          transparentPng
        );
        downloadBlob(blob, filename);
        toast({
          title: "Image created",
          description: `Exported page ${p} as ${imgFormat}.`,
        });
        return;
      }

      // Multiple pages: package into a ZIP with progress
      const zip = new JSZip();
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const { blob, filename } = await renderPageToBlob(
          pdf,
          p,
          dpi[0],
          imgFormat,
          jpegQuality[0],
          transparentPng
        );
        zip.file(filename, blob);
        setProgress(Math.round(((i + 1) / pages.length) * 80));
      }

      const content = await zip.generateAsync(
        {
          type: "blob",
          compression: "DEFLATE",
          compressionOptions: { level: 6 },
        },
        (meta) => {
          const z = 80 + Math.round((meta.percent || 0) * 0.2);
          setProgress(Math.min(100, z));
        }
      );

      const base = pdfFile.name.replace(/\.[^.]+$/, "");
      downloadBlob(content, `${base}_images_${Date.now()}.zip`);

      toast({
        title: "ZIP created",
        description: `Exported ${pages.length} page image(s).`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to convert PDF to images.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const singleOrMultiLabel = () => {
    if (!pdfFile) return "Export Images";
    // Best-effort label: single vs multi once file is known; exact range may change, keep generic if needed.
    return "Export Images";
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
            <FileImage className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">PDF → Images</h1>
              <p className="text-lg text-white/90">
                Convert PDF pages to PNG/JPEG with DPI and quality control.
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
                <CardTitle>Select PDF</CardTitle>
                <CardDescription>
                  Upload a single PDF to convert.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border border-dashed rounded-md p-4">
                  <Label htmlFor="pdf-input" className="mb-2 block">
                    Choose PDF
                  </Label>
                  <Input
                    id="pdf-input"
                    type="file"
                    accept={acceptTypes.join(",")}
                    onChange={(e) =>
                      handleFileChange(
                        e.target.files ? Array.from(e.target.files) : []
                      )
                    }
                  />
                  {pdfFile && (
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4" />
                        <span className="text-sm">{pdfFile.name}</span>
                        <Badge variant="secondary">Selected</Badge>
                      </div>
                      <Button size="sm" variant="ghost" onClick={reset}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {isProcessing && (
                  <div className="space-y-2 mt-4">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Processing...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Image Settings</CardTitle>
                <CardDescription>
                  Format, DPI, range, and options.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Image Format</Label>
                    <select
                      className="w-full mt-2 p-2 rounded border"
                      value={imgFormat}
                      onChange={(e) =>
                        setImgFormat(e.target.value as ImgFormat)
                      }
                    >
                      <option value="PNG">PNG</option>
                      <option value="JPEG">JPEG</option>
                    </select>
                  </div>

                  <div>
                    <Label>DPI: {dpi[0]}</Label>
                    <Slider
                      value={dpi}
                      onValueChange={setDpi}
                      min={MIN_DPI}
                      max={MAX_DPI}
                      step={1}
                      className="mt-2"
                    />
                    <div className="grid grid-cols-2 text-sm text-muted-foreground">
                      <span>Smaller</span>
                      <span className="text-right">Sharper</span>
                    </div>
                  </div>
                </div>

                {imgFormat === "JPEG" && (
                  <div className="space-y-2">
                    <Label>JPEG Quality: {jpegQuality[0]}%</Label>
                    <Slider
                      value={jpegQuality}
                      onValueChange={setJpegQuality}
                      min={40}
                      max={100}
                      step={1}
                    />
                    <div className="grid grid-cols-2 text-sm text-muted-foreground">
                      <span>Smaller file</span>
                      <span className="text-right">Higher quality</span>
                    </div>
                  </div>
                )}

                {imgFormat === "PNG" && (
                  <div className="flex items-center space-x-3">
                    <Switch
                      id="transparent"
                      checked={transparentPng}
                      onCheckedChange={setTransparentPng}
                    />
                    <Label htmlFor="transparent">Transparent background</Label>
                  </div>
                )}

                <div>
                  <Label>Page Range</Label>
                  <Input
                    className="mt-2"
                    placeholder='e.g. "1-3,5" or leave empty for all'
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    onClick={generateImages}
                    disabled={!pdfFile || isProcessing}
                    size="lg"
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {singleOrMultiLabel()} ({progress}%)
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        {singleOrMultiLabel()}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileImage className="w-5 h-5 mr-2" /> PDF to Images
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      Popular
                    </Badge>
                    <span className="text-muted-foreground">
                      Page images • Direct or ZIP export
                    </span>
                  </div>
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Features:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• PDF pages → PNG/JPEG images</li>
                      <li>• DPI and quality controls</li>
                      <li>• Page range selection</li>
                      <li>• Transparent PNG background option</li>
                      <li>• Single page = direct download; multi-page = ZIP</li>
                      <li>• Browser-only processing — secure</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {pdfFile && (
              <Card>
                <CardHeader>
                  <CardTitle>Selected File</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm py-2 border-b">
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="font-medium truncate">
                          {pdfFile.name}
                        </div>
                      </div>
                    </div>
                    <div className="pt-2 border-t mt-2 flex justify-between font-medium">
                      <span>Total Files</span>
                      <span>1</span>
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

export default PDFToImages;
