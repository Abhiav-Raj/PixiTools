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
  Layers3,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// Helpers
type SelFile = {
  file: File;
  range: string; // e.g. "1-3,5" (leave blank for all)
};

const parseRange = (range: string, total: number): number[] => {
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

const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

// Strictly normalize to a plain ArrayBuffer (never SharedArrayBuffer)
const toStrictArrayBuffer = (
  data: Uint8Array | ArrayBufferLike
): ArrayBuffer => {
  if (data instanceof Uint8Array) {
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    return copy.buffer; // fresh ArrayBuffer
  }
  const view = new Uint8Array(data); // handles ArrayBuffer or SharedArrayBuffer
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer; // fresh ArrayBuffer
};

const downloadBlob = (bytes: Uint8Array | ArrayBufferLike, name: string) => {
  const ab = toStrictArrayBuffer(bytes);
  const blob = new Blob([ab], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const PDFMerger: React.FC = () => {
  const [items, setItems] = useState<SelFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [addToc, setAddToc] = useState(true);
  const [outputName, setOutputName] = useState("merged.pdf");
  const { toast } = useToast();

  const acceptTypes = useMemo(() => ["application/pdf"], []);

  const onFiles = (files: File[]) => {
    const pdfs = files.filter((f) => f.type === "application/pdf");
    if (pdfs.length === 0) {
      toast({
        title: "No PDFs",
        description: "Please select one or more PDF files.",
        variant: "destructive",
      });
      return;
    }
    setItems((prev) => [...prev, ...pdfs.map((f) => ({ file: f, range: "" }))]);
    setProgress(0);
  };

  const removeAt = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    setItems((prev) => {
      const copy = [...prev];
      [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
      return copy;
    });
  };

  const moveDown = (idx: number) => {
    if (idx === items.length - 1) return;
    setItems((prev) => {
      const copy = [...prev];
      [copy[idx + 1], copy[idx]] = [copy[idx], copy[idx + 1]];
      return copy;
    });
  };

  const updateRange = (idx: number, val: string) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], range: val };
      return copy;
    });
  };

  const makeTOCPage = async (
    doc: PDFDocument,
    sections: { title: string; startPage: number }[]
  ) => {
    const page = doc.addPage();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const { width, height } = page.getSize();
    let y = height - 60;
    page.drawText("Contents", {
      x: 50,
      y,
      size: 24,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 30;
    for (const s of sections) {
      page.drawText(`${s.title} — starts at page ${s.startPage}`, {
        x: 50,
        y,
        size: 12,
        font,
        color: rgb(0, 0, 0),
      });
      y -= 18;
      if (y < 60) {
        y = height - 60;
        doc.addPage();
      }
    }
    // Move TOC to front by rotating pages: insert at 0
    const last = doc.getPages().pop()!;
    doc.insertPage(0, last);
  };

  const merge = async () => {
    if (items.length === 0) {
      toast({
        title: "No PDFs",
        description: "Please add at least one PDF to merge.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const out = await PDFDocument.create();
      const sections: { title: string; startPage: number }[] = [];

      let totalSteps = items.length;
      let step = 0;

      for (let i = 0; i < items.length; i++) {
        const { file, range } = items[i];
        const bytes = await file.arrayBuffer();
        const src = await PDFDocument.load(bytes);
        const total = src.getPageCount();
        const indices =
          range.trim().length > 0
            ? parseRange(range, total).map((n) => n - 1)
            : src.getPageIndices();
        if (indices.length === 0) continue;

        const startPage = out.getPageCount() + 1;
        sections.push({
          title: file.name.replace(/\.[^.]+$/, ""),
          startPage,
        });

        const pages = await out.copyPages(src, indices);
        pages.forEach((p) => out.addPage(p));

        step += 1;
        setProgress(Math.round((step / totalSteps) * 90));
      }

      if (addToc && sections.length > 1) {
        await makeTOCPage(out, sections);
      }

      const mergedBytes = await out.save();
      downloadBlob(mergedBytes, outputName || "merged.pdf");

      setProgress(100);
      toast({
        title: "Merged",
        description: `Created ${outputName || "merged.pdf"} successfully.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to merge PDFs.",
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
            <Layers3 className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">PDF Merger</h1>
              <p className="text-lg text-white/90">
                Combine multiple PDFs into a single document with custom
                ordering.
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
                  Drag and drop or pick multiple PDFs, then reorder or set page
                  ranges.
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
                    onChange={(e) => {
                      const f = e.target.files
                        ? Array.from(e.target.files)
                        : [];
                      onFiles(f);
                    }}
                  />
                </div>

                {items.length > 0 && (
                  <div className="mt-4">
                    <Label>Queue (reorder and set ranges)</Label>
                    <div className="grid grid-cols-1 gap-3 mt-3">
                      {items.map((it, idx) => (
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
                                disabled={idx === items.length - 1}
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

                          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                              <Label>Page range (optional)</Label>
                              <Input
                                className="mt-1"
                                placeholder='e.g. "1-3,5"'
                                value={it.range}
                                onChange={(e) =>
                                  updateRange(idx, e.target.value)
                                }
                              />
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
                      <span>Merging...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Merge Settings</CardTitle>
                <CardDescription>Order, TOC, and output name.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Switch
                    id="toc"
                    checked={addToc}
                    onCheckedChange={setAddToc}
                  />
                  <Label htmlFor="toc">
                    Add TOC page at start (bookmark alternative)
                  </Label>
                </div>

                <div>
                  <Label>Output filename</Label>
                  <Input
                    className="mt-2"
                    value={outputName}
                    onChange={(e) => setOutputName(e.target.value)}
                    placeholder="merged.pdf"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    onClick={merge}
                    disabled={items.length === 0 || isProcessing}
                    size="lg"
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Merging ({progress}%)
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Merge PDFs
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
                  <Layers3 className="w-5 h-5 mr-2" /> PDF Merger
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      Popular
                    </Badge>
                    <span className="text-muted-foreground">
                      Drag & drop • Page order • Fast merge
                    </span>
                  </div>
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Features:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• Combine multiple PDFs client‑side</li>
                      <li>• Reorder files and set per‑file page ranges</li>
                      <li>• Optional TOC page as a bookmarks alternative</li>
                      <li>• Quick copy‑pages merging for speed</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {items.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Selected Files</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {items.map((it, i) => (
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
                      <span>{items.length}</span>
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

export default PDFMerger;
