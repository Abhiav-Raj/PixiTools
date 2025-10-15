import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  FileText,
  Download,
  Loader2,
  Image as ImageIcon,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FileUploader from "@/components/FileUploader";
import Tesseract from "tesseract.js";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, TextRun } from "docx";
import * as pdfjsLib from "pdfjs-dist";

// ✅ Fix for Vite — proper worker setup
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

const LANGUAGES = [
  { code: "eng", label: "English" },
  { code: "hin", label: "Hindi" },
  { code: "fra", label: "French" },
  { code: "deu", label: "German" },
  { code: "spa", label: "Spanish" },
  { code: "chi_sim", label: "Chinese (Simplified)" },
];

const AITextExtractor = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [extractedText, setExtractedText] = useState<string>("");
  const [language, setLanguage] = useState<string>("eng");
  const [handwriting, setHandwriting] = useState(false);
  const { toast } = useToast();

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    setExtractedText("");
    setProgress(0);
  };

  const handleRemoveFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updated);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // 🧩 Preprocess image to grayscale and threshold
  // 🧩 Preprocess image to grayscale and threshold
  const preprocessImage = async (imageDataUrl: string) => {
    return new Promise<string>((resolve) => {
      const img = new Image();
      img.src = imageDataUrl;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        canvas.width = img.width;
        canvas.height = img.height;

        // Boost clarity
        ctx.filter = "grayscale(100%) contrast(180%) brightness(120%)";
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Simple threshold
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          const v = avg > 170 ? 255 : 0;
          data[i] = data[i + 1] = data[i + 2] = v;
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };
    });
  };

  // 🧠 Clean OCR output (keep only this version)
  const cleanText = (text: string) => {
    return text
      .replace(/(\n\s*){2,}/g, "\n") // collapse blank lines
      .replace(/\s{3,}/g, " ") // collapse spaces
      .replace(/[^a-zA-Z0-9.,:/()@&\-\n\s]/g, "") // remove symbols
      .replace(/(\w)-\s+(\w)/g, "$1$2") // fix hyphen breaks
      .replace(/\b([A-Z]{2,})\b/g, (m) => m.toUpperCase()) // normalize caps
      .trim();
  };

  // 📜 Extract text from PDFs that have actual text
  const extractTextFromPDF = async (file: File) => {
    const pdfData = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item: any) => item.str).join(" ");
      fullText += `=== Page ${i} ===\n${strings}\n\n`;
    }

    return fullText.trim();
  };

  // 🧠 Main OCR Extraction Logic
  const extractText = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No files",
        description: "Please upload at least one image or PDF.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setExtractedText("");
    setProgress(0);

    try {
      let fullText = "";

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        fullText += `=== ${file.name} ===\n\n`;

        if (file.type === "application/pdf") {
          // Try direct text extraction first
          const pdfText = await extractTextFromPDF(file);
          if (pdfText.length > 100) {
            fullText += pdfText + "\n\n";
            continue; // Skip OCR if text extraction succeeded
          }

          // Otherwise fallback to OCR on rendered pages
          const pdfData = new Uint8Array(await file.arrayBuffer());
          const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;

          for (let p = 1; p <= pdf.numPages; p++) {
            const page = await pdf.getPage(p);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement("canvas");
            const context = canvas.getContext("2d")!;
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({ canvas, canvasContext: context, viewport })
              .promise;
            const image = canvas.toDataURL("image/png");
            const cleanImage = await preprocessImage(image);

            const { data } = await Tesseract.recognize(cleanImage, language, {
              logger: (m) => {
                if (m.status === "recognizing text") {
                  setProgress(Math.round(m.progress * 100));
                }
              },
            });

            fullText += `=== PDF Page ${p} ===\n${cleanText(data.text)}\n\n`;
          }
        } else {
          // Handle image files
          const imageUrl = URL.createObjectURL(file);
          const cleanImage = await preprocessImage(imageUrl);

          const { data } = await Tesseract.recognize(cleanImage, language, {
            logger: (m) => {
              if (m.status === "recognizing text") {
                setProgress(Math.round(m.progress * 100));
              }
            },
          });

          fullText += cleanText(data.text) + "\n\n";
        }
      }

      setExtractedText(fullText);
      toast({
        title: "Text extracted",
        description: "OCR completed successfully.",
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to extract text.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const downloadTXT = () => {
    if (!extractedText) return;
    const blob = new Blob([extractedText], {
      type: "text/plain;charset=utf-8",
    });
    saveAs(blob, `extracted_${Date.now()}.txt`);
  };

  const downloadWord = async () => {
    if (!extractedText) return;
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [new Paragraph({ children: [new TextRun(extractedText)] })],
        },
      ],
    });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `extracted_${Date.now()}.docx`);
  };

  // 🧩 UI Rendering
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
                <ArrowLeft className="w-4 h-4 mr-2" /> Back to Tools
              </Button>
            </Link>
          </div>
          <div className="flex items-center text-white">
            <FileText className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">AI Text Extractor (OCR)</h1>
              <p className="text-lg text-white/90">
                Extract text from images and scanned PDFs using AI OCR.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* File Upload Section */}
            <Card>
              <CardHeader>
                <CardTitle>Select Files</CardTitle>
                <CardDescription>
                  Upload images or PDFs for OCR extraction.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FileUploader
                  files={selectedFiles}
                  onFilesSelected={handleFilesSelected}
                  acceptedTypes={["image/*", "application/pdf"]}
                  maxFiles={50}
                  onRemoveFile={handleRemoveFile}
                />

                {selectedFiles.length > 0 && (
                  <div className="mt-4">
                    <Label>Uploaded Files</Label>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-3">
                      {selectedFiles.map((file, idx) => (
                        <div
                          key={idx}
                          className="border rounded p-2 flex flex-col"
                        >
                          <div className="flex-1 mb-2 h-28 bg-muted rounded flex items-center justify-center overflow-hidden">
                            {file.type.startsWith("image") ? (
                              <img
                                src={URL.createObjectURL(file)}
                                alt={file.name}
                                className="max-w-full max-h-full object-contain"
                              />
                            ) : (
                              <FileText className="w-10 h-10 text-muted-foreground" />
                            )}
                          </div>
                          <div className="text-xs truncate mb-1">
                            {file.name}
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{formatFileSize(file.size)}</span>
                            <Badge variant="secondary">{idx + 1}</Badge>
                          </div>
                          <div className="mt-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveFile(idx)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* OCR Options */}
            <Card>
              <CardHeader>
                <CardTitle>OCR Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Language</Label>
                    <select
                      className="w-full mt-2 p-2 rounded border"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      {LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center mt-6 space-x-3">
                    <Switch
                      checked={handwriting}
                      onCheckedChange={setHandwriting}
                      id="handwriting"
                    />
                    <Label htmlFor="handwriting">Handwriting mode</Label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    onClick={extractText}
                    size="lg"
                    disabled={isProcessing || selectedFiles.length === 0}
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                        Extracting ({progress}%)
                      </>
                    ) : (
                      "Start OCR"
                    )}
                  </Button>
                  <Button
                    onClick={downloadTXT}
                    size="lg"
                    variant="outline"
                    disabled={!extractedText}
                    className="w-full"
                  >
                    <Download className="w-4 h-4 mr-2" /> Download TXT
                  </Button>
                  <Button
                    onClick={downloadWord}
                    size="lg"
                    variant="outline"
                    disabled={!extractedText}
                    className="w-full"
                  >
                    <Download className="w-4 h-4 mr-2" /> Download Word
                  </Button>
                </div>
                {isProcessing && <Progress value={progress} />}
              </CardContent>
            </Card>

            {/* Extracted Text */}
            {extractedText && (
              <Card>
                <CardHeader>
                  <CardTitle>Extracted Text</CardTitle>
                </CardHeader>
                <CardContent>
                  <textarea
                    readOnly
                    value={extractedText}
                    className="w-full h-64 p-2 border rounded resize-none"
                  />
                </CardContent>
              </Card>
            )}
          </div>

          {/* Side Info */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <ImageIcon className="w-5 h-5 mr-2" /> AI OCR Features
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      AI
                    </Badge>
                    <span className="text-muted-foreground">
                      Handwriting & multi-language
                    </span>
                  </div>
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Features:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• OCR for images & scanned PDFs</li>
                      <li>• Auto-detects text-based PDFs</li>
                      <li>• Handwriting mode toggle</li>
                      <li>• Multi-language support</li>
                      <li>• Export to TXT or Word</li>
                      <li>• Browser-only processing — private & secure</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AITextExtractor;
