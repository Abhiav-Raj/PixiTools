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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";

// Types
type SelFile = { file: File };
type Mode = "text" | "image";
type PosKey = "tl" | "tc" | "tr" | "ml" | "mc" | "mr" | "bl" | "bc" | "br";

// Helpers
const formatSize = (bytes: number) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024,
    sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
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

const parseRange = (text: string, total: number): number[] => {
  if (!text.trim()) return Array.from({ length: total }, (_, i) => i + 1);
  const out = new Set<number>();
  for (const part of text.split(",")) {
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

// Component
const PDFWatermark: React.FC = () => {
  const [items, setItems] = useState<SelFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Watermark options
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("CONFIDENTIAL");
  const [fontSize, setFontSize] = useState<number>(36);
  const [opacity, setOpacity] = useState<number>(0.15);
  const [diagonal, setDiagonal] = useState(true);
  const [allPages, setAllPages] = useState(true);
  const [range, setRange] = useState("");

  // Multiple text positions
  const [positions, setPositions] = useState<Record<PosKey, boolean>>({
    tl: true,
    tc: false,
    tr: true,
    ml: false,
    mc: true,
    mr: false,
    bl: true,
    bc: false,
    br: true,
  });
  const [margin, setMargin] = useState<number>(24); // px from edges

  // Image mode
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageScale, setImageScale] = useState<number>(0.5);

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
    setItems((prev) => [...prev, ...pdfs.map((f) => ({ file: f }))]);
    setProgress(0);
  };

  const removeAt = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));
  const moveUp = (idx: number) =>
    setItems((prev) => {
      if (idx === 0) return prev;
      const copy = [...prev];
      [copy[idx - 1], copy[idx]] = [copy[idx], copy[idx - 1]];
      return copy;
    });
  const moveDown = (idx: number) =>
    setItems((prev) => {
      if (idx === prev.length - 1) return prev;
      const copy = [...prev];
      [copy[idx + 1], copy[idx]] = [copy[idx], copy[idx + 1]];
      return copy;
    });

  const selectedPositions = (): PosKey[] =>
    (Object.keys(positions) as PosKey[]).filter((k) => positions[k]);

  const computeTextXY = (
    pos: PosKey,
    width: number,
    height: number,
    textW: number,
    textH: number,
    m: number
  ) => {
    const cx = width / 2;
    const cy = height / 2;
    switch (pos) {
      case "tl":
        return { x: m, y: height - m - textH };
      case "tc":
        return { x: cx - textW / 2, y: height - m - textH };
      case "tr":
        return { x: width - m - textW, y: height - m - textH };
      case "ml":
        return { x: m, y: cy - textH / 2 };
      case "mc":
        return { x: cx - textW / 2, y: cy - textH / 2 };
      case "mr":
        return { x: width - m - textW, y: cy - textH / 2 };
      case "bl":
        return { x: m, y: m };
      case "bc":
        return { x: cx - textW / 2, y: m };
      case "br":
        return { x: width - m - textW, y: m };
    }
  };

  const embedWatermarkOnDoc = async (
    bytes: ArrayBuffer,
    opts: {
      mode: Mode;
      text?: string;
      fontSize: number;
      opacity: number;
      diagonal: boolean;
      positions: PosKey[];
      margin: number;
      imageFile?: File | null;
      imageScale: number;
      pageIndices?: number[]; // 1-based pages
    }
  ) => {
    const doc = await PDFDocument.load(bytes);
    const pages = doc.getPages();
    const indices =
      opts.pageIndices && opts.pageIndices.length > 0
        ? opts.pageIndices
            .map((n) => n - 1)
            .filter((i) => i >= 0 && i < pages.length)
        : pages.map((_, i) => i);

    if (opts.mode === "text") {
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const label = opts.text || "";
      const size = Math.max(6, opts.fontSize);
      for (const i of indices) {
        const page = pages[i];
        const { width, height } = page.getSize();
        const textW = font.widthOfTextAtSize(label, size);
        const textH = size; // approximate height at size
        const rot = opts.diagonal ? degrees(45) : undefined;
        for (const pos of opts.positions) {
          const { x, y } = computeTextXY(
            pos,
            width,
            height,
            textW,
            textH,
            Math.max(0, opts.margin)
          );
          page.drawText(label, {
            x,
            y,
            size,
            font,
            color: rgb(0.6, 0.6, 0.6),
            opacity: Math.max(0, Math.min(1, opts.opacity)),
            rotate: rot,
          });
        }
      }
    } else {
      if (!opts.imageFile) throw new Error("No image selected for watermark.");
      const imgBytes = new Uint8Array(await opts.imageFile.arrayBuffer());
      const isPng = opts.imageFile.type === "image/png";
      const embedded = isPng
        ? await doc.embedPng(imgBytes)
        : await doc.embedJpg(imgBytes);
      for (const i of indices) {
        const page = pages[i];
        const { width, height } = page.getSize();
        const factor = Math.max(0.05, Math.min(1, opts.imageScale));
        const dims = embedded.scale(factor);
        const rot = opts.diagonal ? degrees(45) : undefined;
        // For image mode, use center only if multiple positions are not meaningful
        // or reuse the same grid positions
        for (const pos of opts.positions) {
          const { x, y } = computeTextXY(
            pos,
            width,
            height,
            dims.width,
            dims.height,
            Math.max(0, opts.margin)
          );
          page.drawImage(embedded, {
            x,
            y,
            width: dims.width,
            height: dims.height,
            opacity: Math.max(0, Math.min(1, opts.opacity)),
            rotate: rot,
          });
        }
      }
    }

    return await doc.save();
  };

  const run = async () => {
    if (items.length === 0) {
      toast({
        title: "No PDFs",
        description: "Please add at least one PDF to watermark.",
        variant: "destructive",
      });
      return;
    }
    if (mode === "image" && !imageFile) {
      toast({
        title: "No image",
        description: "Please choose an image for the watermark.",
        variant: "destructive",
      });
      return;
    }
    if (mode === "text" && !text.trim()) {
      toast({
        title: "No text",
        description: "Please enter watermark text.",
        variant: "destructive",
      });
      return;
    }
    const posList = selectedPositions();
    if (posList.length === 0) {
      toast({
        title: "No positions",
        description: "Select at least one position for the watermark.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      let step = 0;
      const total = items.length;

      for (const it of items) {
        const ab = await it.file.arrayBuffer();
        const src = await PDFDocument.load(ab);
        const totalPages = src.getPageCount();
        const pageList = allPages ? [] : parseRange(range, totalPages);

        const outBytes = await embedWatermarkOnDoc(ab, {
          mode,
          text,
          fontSize,
          opacity,
          diagonal,
          positions: posList,
          margin,
          imageFile,
          imageScale,
          pageIndices: pageList.length > 0 ? pageList : undefined,
        });

        const base = it.file.name.replace(/\.[^.]+$/, "");
        downloadBlob(outBytes, `${base}_watermarked.pdf`);
        step += 1;
        setProgress(Math.round((step / total) * 100));
      }

      toast({
        title: "Watermark applied",
        description: `Processed ${items.length} document${
          items.length > 1 ? "s" : ""
        }.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to apply watermark.",
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
              <h1 className="text-3xl font-bold">PDF Watermark</h1>
              <p className="text-lg text-white/90">
                Add text or image watermarks with multi‑position layout and
                opacity control.
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
                  Pick one or more PDFs to watermark.
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

                {items.length > 0 && (
                  <div className="mt-4">
                    <Label>Queue</Label>
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
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {isProcessing && (
                  <div className="space-y-2 mt-4">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Watermarking...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Watermark Settings</CardTitle>
                <CardDescription>
                  Text/image, positions, diagonal, opacity, pages.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Type</Label>
                    <select
                      className="w-full mt-2 p-2 rounded border"
                      value={mode}
                      onChange={(e) => setMode(e.target.value as Mode)}
                    >
                      <option value="text">Text</option>
                      <option value="image">Image</option>
                    </select>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Switch
                      id="diagonal"
                      checked={diagonal}
                      onCheckedChange={setDiagonal}
                    />
                    <Label htmlFor="diagonal">Diagonal layout</Label>
                  </div>
                </div>

                {mode === "text" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Text</Label>
                      <Input
                        className="mt-2"
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Font size</Label>
                      <Input
                        className="mt-2"
                        type="number"
                        min={6}
                        max={300}
                        step={1}
                        value={fontSize}
                        onChange={(e) =>
                          setFontSize(
                            Math.min(
                              300,
                              Math.max(6, parseInt(e.target.value || "36", 10))
                            )
                          )
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Watermark image (PNG/JPEG)</Label>
                      <Input
                        className="mt-2"
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={(e) =>
                          setImageFile(
                            e.target.files ? e.target.files[0] : null
                          )
                        }
                      />
                    </div>
                    <div>
                      <Label>Image scale (0.05–1)</Label>
                      <Input
                        className="mt-2"
                        type="number"
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={imageScale}
                        onChange={(e) =>
                          setImageScale(
                            Math.min(
                              1,
                              Math.max(
                                0.05,
                                parseFloat(e.target.value || "0.5")
                              )
                            )
                          )
                        }
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Opacity (0–1)</Label>
                    <Input
                      className="mt-2"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={opacity}
                      onChange={(e) =>
                        setOpacity(
                          Math.min(
                            1,
                            Math.max(0, parseFloat(e.target.value || "0.15"))
                          )
                        )
                      }
                    />
                  </div>

                  <div>
                    <Label>Edge margin (px)</Label>
                    <Input
                      className="mt-2"
                      type="number"
                      min={0}
                      max={200}
                      step={1}
                      value={margin}
                      onChange={(e) =>
                        setMargin(
                          Math.max(0, parseInt(e.target.value || "24", 10))
                        )
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label>Positions</Label>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                    {(
                      [
                        ["tl", "Top‑Left"],
                        ["tc", "Top‑Center"],
                        ["tr", "Top‑Right"],
                        ["ml", "Middle‑Left"],
                        ["mc", "Center"],
                        ["mr", "Middle‑Right"],
                        ["bl", "Bottom‑Left"],
                        ["bc", "Bottom‑Center"],
                        ["br", "Bottom‑Right"],
                      ] as [PosKey, string][]
                    ).map(([k, label]) => (
                      <label
                        key={k}
                        className="flex items-center space-x-2 p-2 border rounded"
                      >
                        <input
                          type="checkbox"
                          checked={positions[k]}
                          onChange={(e) =>
                            setPositions((prev) => ({
                              ...prev,
                              [k]: e.target.checked,
                            }))
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <Switch
                    id="allPages"
                    checked={allPages}
                    onCheckedChange={setAllPages}
                  />
                  <Label htmlFor="allPages">Apply to all pages</Label>
                </div>

                {!allPages && (
                  <div>
                    <Label>Page range</Label>
                    <Input
                      className="mt-2"
                      placeholder='e.g. "1-3,5"'
                      value={range}
                      onChange={(e) => setRange(e.target.value)}
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    onClick={run}
                    disabled={
                      items.length === 0 ||
                      isProcessing ||
                      (mode === "image" && !imageFile) ||
                      (mode === "text" && !text.trim()) ||
                      selectedPositions().length === 0
                    }
                    size="lg"
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Applying ({progress}%)
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Apply watermark
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
                  <FileText className="w-5 h-5 mr-2" /> PDF Watermark
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      Popular
                    </Badge>
                    <span className="text-muted-foreground">
                      Text & images • Multi‑position • Opacity
                    </span>
                  </div>
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Features:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>
                        • Multiple text positions with precise alignment using
                        widthOfTextAtSize. [web:217]
                      </li>
                      <li>
                        • Rotation and opacity via PDFPage draw options for text
                        and images. [web:219]
                      </li>
                      <li>
                        • Apply to all pages or a specific page range
                        client‑side. [web:171]
                      </li>
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

export default PDFWatermark;
