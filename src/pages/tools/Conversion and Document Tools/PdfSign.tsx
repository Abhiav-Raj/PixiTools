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
import { PDFDocument, degrees } from "pdf-lib";

// Types
type SelFile = { file: File };
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
    const c = new Uint8Array(data.byteLength);
    c.set(data);
    return c.buffer;
  }
  const v = new Uint8Array(data);
  const c = new Uint8Array(v.byteLength);
  c.set(v);
  return c.buffer;
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

// Rotation-aware anchor mapping so "top-left" is the visible top-left.
const mapAnchorForPageRotation = (pos: PosKey, angle: number): PosKey => {
  const a = ((angle % 360) + 360) % 360;
  if (a === 0) return pos;
  const map90: Record<PosKey, PosKey> = {
    tl: "tr",
    tc: "mr",
    tr: "br",
    ml: "tc",
    mc: "mc",
    mr: "bc",
    bl: "tl",
    bc: "ml",
    br: "bl",
  };
  const map180: Record<PosKey, PosKey> = {
    tl: "br",
    tc: "bc",
    tr: "bl",
    ml: "mr",
    mc: "mc",
    mr: "ml",
    bl: "tr",
    bc: "tc",
    br: "tl",
  };
  const map270: Record<PosKey, PosKey> = {
    tl: "bl",
    tc: "ml",
    tr: "tl",
    ml: "bc",
    mc: "mc",
    mr: "tc",
    bl: "br",
    bc: "mr",
    br: "tr",
  };
  if (a === 90) return map90[pos];
  if (a === 180) return map180[pos];
  if (a === 270) return map270[pos];
  return pos;
};

// Compute x,y origin so the rotated image remains centered on the anchor point.
const computeAnchorXY = (
  pos: PosKey,
  pageW: number,
  pageH: number,
  boxW: number,
  boxH: number,
  margin: number,
  angleRad: number
) => {
  const cx = pageW / 2;
  const cy = pageH / 2;
  let ax = cx,
    ay = cy;
  switch (pos) {
    case "tl":
      ax = margin + boxW / 2;
      ay = pageH - margin - boxH / 2;
      break;
    case "tc":
      ax = cx;
      ay = pageH - margin - boxH / 2;
      break;
    case "tr":
      ax = pageW - margin - boxW / 2;
      ay = pageH - margin - boxH / 2;
      break;
    case "ml":
      ax = margin + boxW / 2;
      ay = cy;
      break;
    case "mc":
      ax = cx;
      ay = cy;
      break;
    case "mr":
      ax = pageW - margin - boxW / 2;
      ay = cy;
      break;
    case "bl":
      ax = margin + boxW / 2;
      ay = margin + boxH / 2;
      break;
    case "bc":
      ax = cx;
      ay = margin + boxH / 2;
      break;
    case "br":
      ax = pageW - margin - boxW / 2;
      ay = margin + boxH / 2;
      break;
  }
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const x = ax - (boxW / 2) * cos + (boxH / 2) * sin;
  const y = ay - (boxW / 2) * sin - (boxH / 2) * cos;
  return { x, y };
};

const PDFSign: React.FC = () => {
  const [items, setItems] = useState<SelFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // Signature image(s)
  const [sigFiles, setSigFiles] = useState<File[]>([]);
  // Proportional width of signature relative to page width (0.05..0.8 recommended)
  const [sigWidthRatio, setSigWidthRatio] = useState<number>(0.35);
  const [opacity, setOpacity] = useState<number>(1);
  const [rotateDeg, setRotateDeg] = useState<number>(0);

  // Positions grid
  const [positions, setPositions] = useState<Record<PosKey, boolean>>({
    bl: true,
    bc: false,
    br: false,
    ml: false,
    mc: false,
    mr: false,
    tl: false,
    tc: false,
    tr: false,
  });
  const [margin, setMargin] = useState<number>(16);
  const [allPages, setAllPages] = useState(false);
  const [range, setRange] = useState<string>("");

  const [outputSuffix, setOutputSuffix] = useState("_signed");

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

  const onSignatures = (files: File[]) => {
    const imgs = files.filter(
      (f) => f.type === "image/png" || f.type === "image/jpeg"
    );
    if (imgs.length === 0) {
      toast({
        title: "No signature",
        description: "Upload PNG or JPEG signature image(s).",
        variant: "destructive",
      });
      return;
    }
    setSigFiles(imgs);
  };

  const selectedPositions = (): PosKey[] =>
    (Object.keys(positions) as PosKey[]).filter((k) => positions[k]);

  const applySignatures = async (
    bytes: ArrayBuffer,
    opts: {
      sigFiles: File[];
      widthRatio: number; // fraction of page width
      opacity: number;
      rotateDeg: number;
      positions: PosKey[];
      margin: number;
      pageIndices?: number[]; // 1-based
    }
  ): Promise<Uint8Array> => {
    const doc = await PDFDocument.load(bytes);
    const pages = doc.getPages();
    const indices =
      opts.pageIndices && opts.pageIndices.length > 0
        ? opts.pageIndices
            .map((n) => n - 1)
            .filter((i) => i >= 0 && i < pages.length)
        : pages.map((_, i) => i);

    // Embed once
    const embeddedList = [];
    for (const f of opts.sigFiles) {
      const data = new Uint8Array(await f.arrayBuffer());
      const isPng = f.type === "image/png";
      const img = isPng ? await doc.embedPng(data) : await doc.embedJpg(data);
      embeddedList.push(img);
    }

    const angleRad = ((opts.rotateDeg || 0) * Math.PI) / 180;

    for (const idx of indices) {
      const page = pages[idx];
      const { width: pageW, height: pageH } = page.getSize();
      const pageRot = page.getRotation().angle || 0;

      for (const img of embeddedList) {
        // Size the signature as a fraction of page width
        const ratio = Math.max(0.05, Math.min(0.8, opts.widthRatio));
        const targetW = Math.max(24, pageW * ratio);
        const scaleFactor = targetW / img.width;
        const boxW = img.width * scaleFactor;
        const boxH = img.height * scaleFactor;

        for (const pos of opts.positions) {
          const mapped = mapAnchorForPageRotation(pos, pageRot);
          const { x, y } = computeAnchorXY(
            mapped,
            pageW,
            pageH,
            boxW,
            boxH,
            Math.max(0, opts.margin),
            angleRad
          );
          page.drawImage(img, {
            x,
            y,
            width: boxW,
            height: boxH,
            opacity: Math.max(0, Math.min(1, opts.opacity)),
            rotate: opts.rotateDeg ? degrees(opts.rotateDeg) : undefined,
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
        description: "Please add at least one PDF to sign.",
        variant: "destructive",
      });
      return;
    }
    if (sigFiles.length === 0) {
      toast({
        title: "No signature",
        description: "Upload one or more signature images (PNG/JPEG).",
        variant: "destructive",
      });
      return;
    }
    if (selectedPositions().length === 0) {
      toast({
        title: "No positions",
        description: "Select at least one position.",
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

        const outBytes = await applySignatures(ab, {
          sigFiles,
          widthRatio: sigWidthRatio,
          opacity,
          rotateDeg,
          positions: selectedPositions(),
          margin,
          pageIndices: pageList.length > 0 ? pageList : undefined,
        });

        const base = it.file.name.replace(/\.[^.]+$/, "");
        downloadBlob(outBytes, `${base}${outputSuffix || "_signed"}.pdf`);
        step += 1;
        setProgress(Math.round((step / total) * 100));
      }

      toast({
        title: "Signatures applied",
        description: `Processed ${items.length} document${
          items.length > 1 ? "s" : ""
        }.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to sign PDF(s).",
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
              <h1 className="text-3xl font-bold">Sign PDF</h1>
              <p className="text-lg text-white/90">
                Add PNG/JPEG signatures with multiple positions and precise
                sizing.
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
                  Pick one or more PDFs to sign.
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
                      <span>Signing...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Signature Settings</CardTitle>
                <CardDescription>
                  Upload signature images and choose placement.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Signature images (PNG/JPEG)</Label>
                    <Input
                      className="mt-2"
                      type="file"
                      accept="image/png,image/jpeg"
                      multiple
                      onChange={(e) =>
                        onSignatures(
                          e.target.files ? Array.from(e.target.files) : []
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label>Signature width (% of page)</Label>
                    <Input
                      className="mt-2"
                      type="number"
                      min={5}
                      max={80}
                      step={1}
                      value={Math.round(sigWidthRatio * 100)}
                      onChange={(e) => {
                        const pct = Math.max(
                          5,
                          Math.min(80, parseInt(e.target.value || "35", 10))
                        );
                        setSigWidthRatio(pct / 100);
                      }}
                    />
                  </div>
                </div>

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
                            Math.max(0, parseFloat(e.target.value || "1"))
                          )
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label>Rotation (deg)</Label>
                    <Input
                      className="mt-2"
                      type="number"
                      min={-180}
                      max={180}
                      step={1}
                      value={rotateDeg}
                      onChange={(e) =>
                        setRotateDeg(
                          Math.max(
                            -180,
                            Math.min(180, parseInt(e.target.value || "0", 10))
                          )
                        )
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                          Math.max(0, parseInt(e.target.value || "16", 10))
                        )
                      }
                    />
                  </div>
                  <div className="flex items-center space-x-3">
                    <Switch
                      id="allPages"
                      checked={allPages}
                      onCheckedChange={setAllPages}
                    />
                    <Label htmlFor="allPages">Apply to all pages</Label>
                  </div>
                </div>

                {!allPages && (
                  <div>
                    <Label>Page range</Label>
                    <Input
                      className="mt-2"
                      placeholder='e.g. "1" (first) or "2-3"'
                      value={range}
                      onChange={(e) => setRange(e.target.value)}
                    />
                  </div>
                )}

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
                            setPositions((p) => ({
                              ...p,
                              [k]: e.target.checked,
                            }))
                          }
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Filename suffix</Label>
                  <Input
                    className="mt-2"
                    value={outputSuffix}
                    onChange={(e) => setOutputSuffix(e.target.value)}
                    placeholder="_signed"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    onClick={async () => {
                      await run();
                    }}
                    disabled={
                      items.length === 0 ||
                      isProcessing ||
                      sigFiles.length === 0 ||
                      selectedPositions().length === 0
                    }
                    size="lg"
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Signing ({progress}%)
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Apply signatures
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
                  <FileText className="w-5 h-5 mr-2" /> Sign PDF
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      Professional
                    </Badge>
                    <span className="text-muted-foreground">
                      PNG/JPEG signatures • Multi‑position • Precise sizing
                    </span>
                  </div>
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">Features:</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>
                        • Rotation-safe anchor math keeps signatures aligned to
                        corners/edges. [web:219]
                      </li>
                      <li>
                        • Page rotation handled so “top‑left” is always the
                        visible corner. [web:219]
                      </li>
                      <li>
                        • Proportional width for consistent look across page
                        sizes. [web:219]
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

export default PDFSign;
