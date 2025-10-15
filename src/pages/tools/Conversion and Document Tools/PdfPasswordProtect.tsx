import React, { useMemo, useState, useEffect } from "react";
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
import { Lock, ArrowLeft, Download, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import createQpdfModule from "qpdf-wasm";

type SelFile = { file: File };

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
  const v = new Uint8Array(data as ArrayBufferLike);
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

const PdfPasswordProtect: React.FC = () => {
  const [items, setItems] = useState<SelFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const [userPassword, setUserPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [useSamePassword, setUseSamePassword] = useState(false); // ✅ NEW toggle state

  const [keyLength, setKeyLength] = useState<number>(256);
  const [allowPrint, setAllowPrint] = useState(true);
  const [allowCopy, setAllowCopy] = useState(true);
  const [allowModify, setAllowModify] = useState(true);
  const [allowAnnotate, setAllowAnnotate] = useState(true);

  const [qpdf, setQpdf] = useState<any>(null);
  const { toast } = useToast();
  const acceptTypes = useMemo(() => ["application/pdf"], []);

  useEffect(() => {
    const initQpdf = async () => {
      try {
        const instance = await createQpdfModule({
          locateFile: (path: string) =>
            path.endsWith(".wasm")
              ? "/qpdf.wasm"
              : path.endsWith(".js")
              ? `/${path}`
              : path,
          noInitialRun: true,
        });
        setQpdf(instance);
      } catch (err) {
        console.error("Failed to load qpdf-wasm:", err);
        toast({
          title: "Engine Error",
          description:
            "Could not load PDF engine. Check qpdf.wasm and qpdf.js paths.",
          variant: "destructive",
        });
      }
    };
    initQpdf();
  }, [toast]);

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

  const buildAllowArg = () => {
    const allow: string[] = [];
    if (allowPrint) allow.push("print");
    if (allowCopy) allow.push("copy");
    if (allowModify) allow.push("modify");
    if (allowAnnotate) allow.push("annotate");
    return allow.length > 0 ? allow.join(",") : "none";
  };

  const protectWithQpdf = async (file: File) => {
    if (!qpdf) throw new Error("QPDF engine not ready yet.");

    const base = file.name.replace(/\.[^.]+$/, "");
    const outName = `/out_${Date.now()}_${base}.pdf`;
    const allowArg = buildAllowArg();

    const finalOwnerPassword = useSamePassword
      ? userPassword
      : ownerPassword || "";

    const args: string[] = [];

    if (userPassword || finalOwnerPassword) {
      args.push("--encrypt");
      args.push(userPassword || "");
      args.push(finalOwnerPassword || "");
      args.push(String(keyLength));

      if (keyLength < 256 && allowArg !== "none") {
        args.push("--allow=" + allowArg);
      }
      args.push("--");
    }

    args.push("/in.pdf");
    args.push(outName);

    const Module = qpdf;
    const inBytes = new Uint8Array(await file.arrayBuffer());

    try {
      Module.FS.writeFile("/in.pdf", inBytes);
    } catch {
      if (Module.FS && Module.FS.createDataFile) {
        Module.FS.createDataFile("/", "in.pdf", inBytes, true, true);
      } else {
        throw new Error("Failed to write input file to FS.");
      }
    }

    try {
      Module.callMain(args);
      const outBytes = Module.FS.readFile(outName, { encoding: "binary" });
      return outBytes as Uint8Array;
    } finally {
      try {
        Module.FS.unlink("/in.pdf");
        Module.FS.unlink(outName);
      } catch {}
    }
  };

  const run = async () => {
    if (items.length === 0) {
      toast({
        title: "No PDFs",
        description: "Please add at least one PDF to protect.",
        variant: "destructive",
      });
      return;
    }

    if (!userPassword && !ownerPassword && !useSamePassword) {
      toast({
        title: "No password",
        description: "Enter at least a user or owner password.",
        variant: "destructive",
      });
      return;
    }

    if (!qpdf) {
      toast({
        title: "Engine not ready",
        description: "PDF engine is still loading. Please wait a moment.",
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
        const outBytes: Uint8Array = await protectWithQpdf(it.file);
        const base = it.file.name.replace(/\.[^.]+$/, "");
        downloadBlob(outBytes, `${base}_protected.pdf`);

        step += 1;
        setProgress(Math.round((step / total) * 100));
      }

      toast({
        title: "PDFs protected",
        description: `Processed ${items.length} file${
          items.length > 1 ? "s" : ""
        }.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to password-protect PDF(s).",
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
            <Lock className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Password Protect PDF</h1>
              <p className="text-lg text-white/90">
                Add password protection to your PDF files for enhanced security.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* FILE SELECTOR */}
            <Card>
              <CardHeader>
                <CardTitle>Select PDFs</CardTitle>
                <CardDescription>
                  Pick one or more PDF files to protect.
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
                                variant="ghost"
                                onClick={() => removeAt(idx)}
                                title="Remove"
                              >
                                Remove
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
                      <span>Processing...</span>
                      <span>{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* SETTINGS */}
            <Card>
              <CardHeader>
                <CardTitle>Protection Settings</CardTitle>
                <CardDescription>
                  Set passwords and permissions.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>User password (required to open)</Label>
                    <Input
                      className="mt-2"
                      type="password"
                      value={userPassword}
                      onChange={(e) => setUserPassword(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Leave blank to allow opening without password (not
                      recommended).
                    </p>
                  </div>
                  <div>
                    <Label>Owner password (permissions)</Label>
                    <Input
                      className="mt-2"
                      type="password"
                      value={useSamePassword ? userPassword : ownerPassword}
                      disabled={useSamePassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                    />
                    <div className="flex items-center space-x-2 mt-2">
                      <Switch
                        checked={useSamePassword}
                        onCheckedChange={setUseSamePassword}
                      />
                      <span className="text-sm">Use same as user password</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Encryption strength</Label>
                    <select
                      className="mt-2 w-full p-2 border rounded"
                      value={keyLength}
                      onChange={(e) =>
                        setKeyLength(parseInt(e.target.value, 10))
                      }
                    >
                      <option value={40}>40-bit (weak)</option>
                      <option value={128}>128-bit (recommended)</option>
                      <option value={256}>256-bit (strong)</option>
                    </select>
                  </div>
                  <div>
                    <Label>Permissions</Label>
                    <div className="mt-2 space-y-1 text-sm">
                      <label className="flex items-center space-x-2">
                        <Switch
                          checked={allowPrint}
                          onCheckedChange={setAllowPrint}
                        />
                        <span>Allow printing</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <Switch
                          checked={allowCopy}
                          onCheckedChange={setAllowCopy}
                        />
                        <span>Allow copying/extraction</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <Switch
                          checked={allowModify}
                          onCheckedChange={setAllowModify}
                        />
                        <span>Allow modifying</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <Switch
                          checked={allowAnnotate}
                          onCheckedChange={setAllowAnnotate}
                        />
                        <span>Allow annotations</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Button
                    onClick={async () => {
                      await run();
                    }}
                    disabled={
                      items.length === 0 ||
                      isProcessing ||
                      (!userPassword && !ownerPassword && !useSamePassword)
                    }
                    size="lg"
                    className="w-full"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Protecting ({progress}%)
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Apply protection
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* SIDEBAR INFO */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="w-5 h-5 mr-2" /> Password Protect PDF
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      Security
                    </Badge>
                    <span className="text-muted-foreground">
                      User passwords • Owner passwords • Print restrictions •
                      Copy protection
                    </span>
                  </div>
                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-2">How it works</h4>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>
                        • Works fully in the browser using qpdf compiled to
                        WebAssembly.
                      </li>
                      <li>
                        • The file never leaves the user’s machine — no backend
                        required.
                      </li>
                      <li>
                        • Choose encryption strength and allowed permissions.
                      </li>
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

export default PdfPasswordProtect;
