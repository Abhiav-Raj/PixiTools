import React, { useMemo, useState } from "react";
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
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  MoveUp,
  MoveDown,
  Trash2,
  Split,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import PDFWorker from "pdfjs-dist/build/pdf.worker.mjs?worker";

// Configure pdf.js worker for Vite
pdfjsLib.GlobalWorkerOptions.workerPort = new PDFWorker();

type SelFile = { file: File };
type Mode = "single" | "ranges" | "bookmarks";

// Helpers
const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const sanitizeBase = (name: string) =>
  name.replace(/\.[^.]+$/, "").replace(/[^\w.-]+/g, "_");

const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const toStrictArrayBuffer = (
  data: Uint8Array | ArrayBufferLike
): ArrayBuffer => {
  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer;
  }
  const view = new Uint8Array(data);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
};

// Parse ranges like: 1-3;5;10-12 into groups of 0-based indices
const parseRangeGroups = (text: string, total: number): number[][] => {
  const groups: number[][] = [];
  const chunks = text
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const chunk of chunks) {
    const pages = new Set<number>();
    for (const part of chunk
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (part.includes("-")) {
        const [a, b] = part.split("-").map((x) => parseInt(x.trim(), 10));
        if (Number.isFinite(a) && Number.isFinite(b)) {
          const start = Math.max(1, Math.min(a, b));
          const end = Math.min(total, Math.max(a, b));
          for (let i = start; i <= end; i++) pages.add(i - 1);
        }
      } else {
        const n = parseInt(part, 10);
        if (Number.isFinite(n) && n >= 1 && n <= total) pages.add(n - 1);
      }
    }
    const arr = Array.from(pages).sort((x, y) => x - y);
    if (arr.length > 0) groups.push(arr);
  }
  return groups;
};

// Extract top-level bookmark ranges via pdf.js: [startIndex, endIndexExclusive)
const getTopLevelBookmarkRanges = async (pdfData: Uint8Array) => {
  const task = pdfjsLib.getDocument({ data: pdfData });
  const pdf = await task.promise;
  const outline = await pdf.getOutline();
  const numPages = pdf.numPages;
  if (!outline || outline.length === 0) return null;

  type Entry = { title: string; start: number };
  const entries: Entry[] = [];

  for (const item of outline) {
    let dest = item.dest;
    if (!dest) continue;
    if (typeof dest === "string") {
      dest = await pdf.getDestination(dest);
    }
    if (Array.isArray(dest) && dest[0]) {
      const pageRef = dest[0];
      const pageIndex = await pdf.getPageIndex(pageRef);
      entries.push({
        title: String(item.title || `Section_${entries.length + 1}`),
        start: pageIndex,
      });
    }
  }

  entries.sort((a, b) => a.start - b.start);
  const ranges = entries.map((e, i) => {
    const end = i < entries.length - 1 ? entries[i + 1].start : numPages;
    return { title: e.title, start: e.start, end };
  });
  return { ranges, numPages };
};

const PDFSplitter: React.FC = () => {
  const [files, setFiles] = useState<SelFile[]>([]);
  const [mode, setMode] = useState<Mode>("ranges");
  const [rangesText, setRangesText] = useState("1-3;5;10-12");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const acceptTypes = useMemo(() => ["application/pdf"], []);

  const onFiles = (inFiles: File[]) => {
    const pdfs = inFiles.filter((f) => f.type === "application/pdf");
    if (pdfs.length === 0) {
      toast({
        title: "No PDFs",
        description: "Please select one or more PDF files.",
        variant: "destructive",
      });
      return;
    }
    setFiles((prev) => [...prev, ...pdfs.map((f) => ({ file: f }))]);
    setProgress(0);
  };

  const removeAt = (idx: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  const moveUp = (idx: number) =>
    setFiles((prev) => {
      if (idx === 0) return prev;
      const copy = [...prev];
      [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
      return copy;
    });
  const moveDown = (idx: number) =>
    setFiles((prev) => {
      if (idx === prev.length - 1) return prev;
      const copy = [...prev];
      [copy[idx + 1], copy[idx]] = [copy[idx], copy[idx + 1]];
      return copy;
    });

  const splitOneFile = async (file: File) => {
    const base = sanitizeBase(file.name);
    const srcBytes = new Uint8Array(await file.arrayBuffer());
    const srcDoc = await PDFDocument.load(srcBytes);
    const total = srcDoc.getPageCount();

    type Out = { name: string; bytes: Uint8Array };
    const outputs: Out[] = [];

    if (mode === "single") {
      for (let i = 0; i < total; i++) {
        const out = await PDFDocument.create();
        const [p] = await out.copyPages(srcDoc, [i]);
        out.addPage(p);
        const bytes = await out.save();
        outputs.push({
          name: `${base}_p${String(i + 1).padStart(3, "0")}.pdf`,
          bytes,
        });
      }
      return outputs;
    }

    if (mode === "ranges") {
      const groups = parseRangeGroups(rangesText, total);
      if (groups.length === 0) {
        toast({
          title: "Invalid ranges",
          description: "Please enter ranges like 1-3;5;10-12.",
          variant: "destructive",
        });
        return outputs;
      }
      for (let gi = 0; gi < groups.length; gi++) {
        const indices = groups[gi];
        const out = await PDFDocument.create();
        const pages = await out.copyPages(srcDoc, indices);
        pages.forEach((p) => out.addPage(p));
        const bytes = await out.save();
        outputs.push({
          name: `${base}_part_${String(gi + 1).padStart(2, "0")}.pdf`,
          bytes,
        });
      }
      return outputs;
    }

    // mode === "bookmarks"
    const outlineInfo = await getTopLevelBookmarkRanges(srcBytes);
    if (!outlineInfo) {
      toast({
        title: "No bookmarks",
        description: "No top-level bookmarks found in this PDF.",
        variant: "destructive",
      });
      return outputs;
    }
    const { ranges } = outlineInfo;
    for (let i = 0; i < ranges.length; i++) {
      const { title, start, end } = ranges[i];
      if (start >= end) continue;
      const out = await PDFDocument.create();
      const indices = Array.from({ length: end - start }, (_, k) => start + k);
      const pages = await out.copyPages(srcDoc, indices);
      pages.forEach((p) => out.addPage(p));
      const bytes = await out.save();
      const titleSafe =
        title.replace(/[^\w.-]+/g, "_").slice(0, 40) || `section_${i + 1}`;
      outputs.push({
        name: `${base}_${titleSafe}.pdf`,
        bytes,
      });
    }
    return outputs;
  };

  const runSplit = async () => {
    if (files.length === 0) {
      toast({
        title: "No PDFs",
        description: "Please add at least one PDF to split.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const allOutputs: { name: string; bytes: Uint8Array }[] = [];
      let steps = files.length;
      let step = 0;

      for (const f of files) {
        const outs = await splitOneFile(f.file);
        if (outs && outs.length) {
          allOutputs.push(...outs);
        }
        step += 1;
        setProgress(Math.round((step / steps) * 85));
      }

      if (allOutputs.length === 0) {
        toast({
          title: "No output",
          description: "No documents were produced. Check your settings.",
          variant: "destructive",
        });
        return;
      }

      if (allOutputs.length === 1) {
        const { name, bytes } = allOutputs[0];
        const blob = new Blob([toStrictArrayBuffer(bytes)], {
          type: "application/pdf",
        });
        downloadBlob(blob, name);
        setProgress(100);
        toast({
          title: "Split complete",
          description: `Exported 1 document.`,
        });
        return;
      }

      const zip = new JSZip();
      for (let i = 0; i < allOutputs.length; i++) {
        const { name, bytes } = allOutputs[i];
        zip.file(name, bytes);
        setProgress(85 + Math.round(((i + 1) / allOutputs.length) * 15));
      }
      const content = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });
      const zipName =
        (files.length === 1
          ? sanitizeBase(files[0].file.name)
          : `pdf_split_${Date.now()}`) + "_split.zip";
      downloadBlob(content, zipName);
      toast({
        title: "Split complete",
        description: `Exported ${allOutputs.length} documents (ZIP).`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to split PDF(s).",
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
            <Split className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">PDF Splitter</h1>
              <p className="text-lg text-white/90">
                Split PDFs by ranges, single pages, or top‑level bookmarks.
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
                <CardTitle>Select PDFs</CardTitle>
                <CardDescription>
                  Pick one or multiple PDFs to split.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border border-dashed rounded-md p-4">
                  <Label htmlFor="pdf-input" className="mb-2 block">
                    Choose PDFs
                  </Label>
                  <Input
                    id="pdf-input"
                    type="file"
                    accept={acceptTypes.join(",")}
                    multiple
                    onChange={(e) =>
                      onFiles(e.target.files ? Array.from(e.target.files) : [])
                    }
                  />
                </div>

                {files.length > 0 && (
                  <div className="mt-4">
                    <Label>Queue (reorder if needed)</Label>
                    <div className="grid grid-cols-1 gap-3 mt-3">
                      {files.map((it, idx) => (
                        <div
                          key={`${it.file.name}-${idx}`}
                          className="border rounded p-3 flex flex-col"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2 min-w-0">
                              <FileText className="w-4 h-4" />
                              <div className="truncate">{it.file.name}</div>
                              <Badge variant="secondary">
                                {formatSize(it.file.size)}
                              </Badge>
                              <Badge variant="secondary">File {idx + 1}</Badge>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => moveUp(idx)}
                                disabled={idx === 0}
                                title="Move up"
                              >
                                <MoveUp className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => moveDown(idx)}
                                disabled={idx === files.length - 1}
                                title="Move down"
                              >
                                <MoveDown className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeAt(idx)}
                                title="Remove"
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

                {isProcessing && (
                  <div className="space-y-2 mt-4">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Splitting...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Split Settings</CardTitle>
                <CardDescription>Choose mode and options.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Mode</Label>
                    <select
                      className="w-full mt-2 p-2 rounded border"
                      value={mode}
                      onChange={(e) => setMode(e.target.value as Mode)}
                    >
                      <option value="ranges">By page ranges</option>
                      <option value="single">Split into single pages</option>
                      <option value="bookmarks">By top‑level bookmarks</option>
                    </select>
                  </div>

                  {mode === "ranges" && (
                    <div>
                      <Label>Ranges (groups)</Label>
                      <Input
                        className="mt-2"
                        placeholder='Use ";" to separate groups, e.g. 1-3;5;10-12'
                        value={rangesText}
                        onChange={(e) => setRangesText(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    onClick={runSplit}
                    disabled={files.length === 0 || isProcessing}
                    size="lg"
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Split ({progress}%)
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Split PDF{files.length > 1 ? "s" : ""}
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
                  <Split className="w-5 h-5 mr-2" /> PDF Splitter
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      Popular
                    </Badge>
                    <span className="text-muted-foreground">
                      Page ranges • Single pages • Bookmarks
                    </span>
                  </div>
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Features:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Client‑side splitting with pdf‑lib for privacy</li>
                      <li>
                        • Top‑level bookmarks → sections via pdf.js outline
                      </li>
                      <li>• Direct download (1 file) or ZIP for many</li>
                      <li>• Reorder input files before processing</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {files.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Selected Files</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {files.map((it, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center text-sm py-2 border-b"
                      >
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="font-medium truncate">
                            {it.file.name}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatSize(it.file.size)}
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t mt-2 flex justify-between font-medium">
                      <span>Total Files</span>
                      <span>{files.length}</span>
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

export default PDFSplitter;
