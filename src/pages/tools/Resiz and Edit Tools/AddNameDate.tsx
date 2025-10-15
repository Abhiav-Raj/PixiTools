import { useState, useRef, useEffect } from "react";
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
import { ArrowLeft, Download, Loader2, Target, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FileUploader from "@/components/FileUploader";

/**
 * Updated AddNameDate component
 * - No template input; fixed layout (Name / Date or either)
 * - Two-line format when both selected:
 *   Line1: Name
 *   Line2: Date
 * - White full-width footer + black centered text
 * - Real-time preview for currentIndex
 * - Name editable for current image (per-file override stored)
 * - Date format dropdown with corresponding inputs (DD/MM/YYYY, YYYY-MM-DD, Month DD, YYYY)
 * - Process Current and Process All operations
 * - Auto-scroll to Preview after upload
 */

const dateFormats = [
  { key: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { key: "YYYY-MM-DD", label: "YYYY-MM-DD" },
  { key: "Month DD, YYYY", label: "Month DD, YYYY" },
];

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad2 = (n: number) => String(n).padStart(2, "0");

const AddNameDate = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processedFiles, setProcessedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  // current preview/index
  const [currentIndex, setCurrentIndex] = useState(0);

  // Mode: what to include
  const [includeName, setIncludeName] = useState(true);
  const [includeDate, setIncludeDate] = useState(true);

  // Per-file name overrides stored by original filename key
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>(
    {}
  );

  // Date selection state (per overall - user fills date to stamp)
  const [dateFormat, setDateFormat] = useState<string>("DD/MM/YYYY");
  const [day, setDay] = useState<string>(pad2(new Date().getDate()));
  const [monthNumeric, setMonthNumeric] = useState<string>(
    pad2(new Date().getMonth() + 1)
  );
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [monthName, setMonthName] = useState<string>(
    months[new Date().getMonth()]
  );

  // Visual style controls
  const [fontSizePercent, setFontSizePercent] = useState<number>(5); // % of min dim
  const [barOpacity, setBarOpacity] = useState<number>(100); // default fully opaque white background
  const { toast } = useToast();
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Auto-scroll refs/flags
  const previewSectionRef = useRef<HTMLDivElement | null>(null);
  const [shouldScrollToPreview, setShouldScrollToPreview] = useState(false);

  // File upload handler
  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    setProcessedFiles([]);
    setProgress(0);
    setCurrentIndex(0);

    // initialize name overrides with filename without extension
    const map: Record<string, string> = {};
    files.forEach((f) => {
      const base = f.name.replace(/\.[^/.]+$/, "");
      map[f.name] = base;
    });
    setNameOverrides(map);

    // trigger scroll to preview after first upload
    setShouldScrollToPreview(true);
  };

  const handleRemoveFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updated);
    // adjust currentIndex
    const newIndex = Math.max(
      0,
      Math.min(currentIndex, Math.max(0, updated.length - 1))
    );
    setCurrentIndex(newIndex);

    // rebuild overrides map
    const newOverrides: Record<string, string> = {};
    updated.forEach((f) => {
      newOverrides[f.name] =
        nameOverrides[f.name] ?? f.name.replace(/\.[^/.]+$/, "");
    });
    setNameOverrides(newOverrides);

    if (processedFiles.length > 0) {
      setProcessedFiles((p) => p.filter((_, i) => i !== index));
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Build the date string according to selected format and user inputs
  const buildDateString = () => {
    if (!includeDate) return "";
    switch (dateFormat) {
      case "DD/MM/YYYY":
        return `${pad2(Number(day))}/${pad2(Number(monthNumeric))}/${year}`;
      case "YYYY-MM-DD":
        return `${year}-${pad2(Number(monthNumeric))}-${pad2(Number(day))}`;
      case "Month DD, YYYY":
        return `${monthName} ${pad2(Number(day))}, ${year}`;
      default:
        return `${pad2(Number(day))}/${pad2(Number(monthNumeric))}/${year}`;
    }
  };

  // Auto-scroll effect
  useEffect(() => {
    if (
      (shouldScrollToPreview || selectedFiles.length > 0) &&
      previewSectionRef.current
    ) {
      // Allow layout to paint first
      requestAnimationFrame(() => {
        previewSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
        setShouldScrollToPreview(false);
      });
    }
  }, [shouldScrollToPreview, selectedFiles.length]);

  // Real-time preview drawing (updates when dependencies change)
  useEffect(() => {
    const drawPreview = async () => {
      const file = selectedFiles[currentIndex];
      const canvas = previewCanvasRef.current;
      if (!file || !canvas) {
        // clear canvas if exists
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
        return;
      }

      const url = URL.createObjectURL(file);
      const img = new Image();
      img.src = url;

      try {
        await new Promise<void>((res, rej) => {
          img.onload = () => res();
          img.onerror = () => rej(new Error("Preview load failed"));
        });

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          return;
        }

        // match canvas to image resolution for accurate preview
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw base image
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Compose text lines
        const nameText = includeName
          ? nameOverrides[file.name] ?? file.name.replace(/\.[^/.]+$/, "")
          : "";
        const dateText = includeDate ? buildDateString() : "";

        const lines: string[] = [];
        if (includeName && nameText) lines.push(nameText);
        if (includeDate && dateText) lines.push(dateText);

        if (lines.length === 0) {
          URL.revokeObjectURL(url);
          return;
        }

        // Font size & metrics
        const minDim = Math.min(canvas.width, canvas.height);
        const fontPx = Math.max(
          12,
          Math.round((fontSizePercent / 100) * minDim)
        );
        ctx.font = `bold ${fontPx}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#000000"; // black text

        // Determine wrapping (basic fit-by-shrinking)
        const paddingX = Math.round(minDim * 0.03);
        const maxTextWidth = canvas.width - paddingX * 2;
        let adjustedFontPx = fontPx;
        const measureLinesWidth = (sizePx: number) => {
          ctx.font = `bold ${sizePx}px sans-serif`;
          let maxW = 0;
          for (const l of lines) {
            const w = ctx.measureText(l).width;
            if (w > maxW) maxW = w;
          }
          return maxW;
        };
        let maxW = measureLinesWidth(adjustedFontPx);
        while (maxW > maxTextWidth && adjustedFontPx > 10) {
          adjustedFontPx -= 1;
          maxW = measureLinesWidth(adjustedFontPx);
        }
        ctx.font = `bold ${adjustedFontPx}px sans-serif`;
        const lineHeight = Math.round(adjustedFontPx * 1.3);

        const footerHeight =
          lineHeight * lines.length + Math.round(minDim * 0.04); // vertical padding

        // Draw white footer bar
        ctx.save();
        ctx.fillStyle = `rgba(255,255,255,${Math.max(
          0,
          Math.min(1, barOpacity / 100)
        )})`;
        ctx.fillRect(
          0,
          canvas.height - footerHeight,
          canvas.width,
          footerHeight
        );
        ctx.restore();

        // Draw lines centered
        ctx.fillStyle = "#000000";
        const startY =
          canvas.height -
          footerHeight / 2 -
          (lines.length - 1) * (lineHeight / 2);
        lines.forEach((line, idx) => {
          const y = startY + idx * lineHeight;
          ctx.fillText(line, canvas.width / 2, y);
        });

        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Preview draw error:", err);
        URL.revokeObjectURL(url);
      }
    };

    drawPreview();
    // run whenever these change
  }, [
    selectedFiles,
    currentIndex,
    includeName,
    includeDate,
    nameOverrides,
    dateFormat,
    day,
    monthNumeric,
    year,
    monthName,
    fontSizePercent,
    barOpacity,
  ]);

  // Processing function that actually renders to a canvas blob and returns a File
  const renderStampedFile = async (
    file: File,
    finalName: string,
    finalDateStr: string
  ): Promise<File> => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("Image load failed"));
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");

    canvas.width = img.width;
    canvas.height = img.height;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const lines: string[] = [];
    if (includeName && finalName) lines.push(finalName);
    if (includeDate && finalDateStr) lines.push(finalDateStr);

    if (lines.length > 0) {
      // font sizing like preview
      const minDim = Math.min(canvas.width, canvas.height);
      let fontPx = Math.max(12, Math.round((fontSizePercent / 100) * minDim));
      ctx.font = `bold ${fontPx}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const paddingX = Math.round(minDim * 0.03);
      const maxTextWidth = canvas.width - paddingX * 2;

      // reduce font until fits
      let maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
      while (maxW > maxTextWidth && fontPx > 10) {
        fontPx -= 1;
        ctx.font = `bold ${fontPx}px sans-serif`;
        maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
      }

      const lineHeight = Math.round(fontPx * 1.3);
      const footerHeight =
        lineHeight * lines.length + Math.round(minDim * 0.04);

      // draw white bar
      ctx.save();
      ctx.fillStyle = `rgba(255,255,255,${Math.max(
        0,
        Math.min(1, barOpacity / 100)
      )})`;
      ctx.fillRect(0, canvas.height - footerHeight, canvas.width, footerHeight);
      ctx.restore();

      // draw text
      ctx.fillStyle = "#000000";
      const startY =
        canvas.height -
        footerHeight / 2 -
        (lines.length - 1) * (lineHeight / 2);
      lines.forEach((line, idx) => {
        const y = startY + idx * lineHeight;
        ctx.fillText(line, canvas.width / 2, y);
      });
    }

    const type =
      file.type && file.type.startsWith("image/") ? file.type : "image/png";
    const blob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b as Blob), type, 0.92)
    );
    URL.revokeObjectURL(url);

    const extMatch = (file.name.match(/(\.[^/.]+)$/) || [".png"])[0];
    const base = file.name.replace(/\.[^/.]+$/, "");
    const outName = `${base}_named${extMatch}`;

    return new File([blob], outName, { type: blob.type });
  };

  // Process currentIndex only
  const handleProcessCurrent = async () => {
    if (!selectedFiles[currentIndex]) {
      toast({
        title: "No file",
        description: "No image selected",
        variant: "destructive",
      });
      return;
    }
    setIsProcessing(true);
    setProgress(0);
    try {
      const file = selectedFiles[currentIndex];
      const finalName =
        nameOverrides[file.name] ?? file.name.replace(/\.[^/.]+$/, "");
      const finalDate = buildDateString();
      const processed = await renderStampedFile(file, finalName, finalDate);

      setProcessedFiles((prev) => {
        const copy = [...prev];
        copy[currentIndex] = processed;
        return copy;
      });

      toast({ title: "Processed", description: `${file.name} processed.` });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to process image.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 400);
    }
  };

  // Process all files
  const handleProcessAll = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select at least one image to process.",
        variant: "destructive",
      });
      return;
    }
    setIsProcessing(true);
    setProgress(0);
    const out: File[] = [];
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const finalName =
          nameOverrides[file.name] ?? file.name.replace(/\.[^/.]+$/, "");
        const finalDate = buildDateString();
        const processed = await renderStampedFile(file, finalName, finalDate);
        out[i] = processed;
        setProgress(Math.round(((i + 1) / selectedFiles.length) * 100));
      }
      setProcessedFiles(out);
      toast({
        title: "Processed",
        description: `Processed ${out.length} image${
          out.length > 1 ? "s" : ""
        }.`,
      });
    } catch (err) {
      console.error(err);
      toast({
        title: "Error",
        description: "Failed to process some images.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 400);
    }
  };

  const downloadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const downloadAllFiles = () => {
    processedFiles.forEach((file, i) =>
      setTimeout(() => downloadFile(file), i * 150)
    );
  };

  // Navigation handlers
  const goPrev = () => setCurrentIndex((p) => Math.max(0, p - 1));
  const goNext = () =>
    setCurrentIndex((p) => Math.min(selectedFiles.length - 1, p + 1));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-primary">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center mb-4">
            <Link to="/resize-edit" className="mr-4">
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
            <Zap className="w-8 h-8 mr-3" />
            <div>
              <h1 className="text-3xl font-bold">Add Name & Date</h1>
              <p className="text-lg text-white/90">
                Automatically add filename and date stamps to your images.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Upload & Settings */}
          <div className="lg:col-span-2 space-y-6">
            {/* File Upload */}
            <Card>
              <CardHeader>
                <CardTitle>Select Images</CardTitle>
                <CardDescription>
                  Upload images to stamp name & date. Supports JPG, PNG, WebP.
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
              </CardContent>
            </Card>

            {/* Real-time Preview + Navigation */}
            {selectedFiles.length > 0 && (
              <Card className="max-w-5xl mx-auto" ref={previewSectionRef}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>Preview</span>
                    <span className="text-sm text-muted-foreground">
                      Image {currentIndex + 1} of {selectedFiles.length}
                    </span>
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Live preview — updates as you edit name/date/format.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goPrev}
                        disabled={currentIndex === 0}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={goNext}
                        disabled={currentIndex === selectedFiles.length - 1}
                      >
                        Next
                      </Button>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {selectedFiles[currentIndex]?.name}
                    </div>
                  </div>

                  <div className="w-full border rounded overflow-hidden bg-muted">
                    <canvas
                      ref={previewCanvasRef}
                      className="w-full max-h-96 object-contain"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Settings: Name & Date sections */}
            <Card>
              <CardHeader>
                <CardTitle>Stamp Settings</CardTitle>
                <CardDescription>
                  Choose what to include and provide values. Preview updates in
                  real-time.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Include toggles */}
                <div className="flex gap-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="include-name"
                      checked={includeName}
                      onCheckedChange={setIncludeName}
                    />
                    <Label htmlFor="include-name">Include Name</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id="include-date"
                      checked={includeDate}
                      onCheckedChange={setIncludeDate}
                    />
                    <Label htmlFor="include-date">Include Date</Label>
                  </div>
                </div>

                {/* Name section: edit name for current image */}
                {includeName && (
                  <div className="space-y-2">
                    <Label>Name (applies to selected image)</Label>
                    <Input
                      value={
                        selectedFiles[currentIndex]
                          ? nameOverrides[selectedFiles[currentIndex].name] ??
                            selectedFiles[currentIndex].name.replace(
                              /\.[^/.]+$/,
                              ""
                            )
                          : ""
                      }
                      onChange={(e) =>
                        setNameOverrides((prev) => {
                          const file = selectedFiles[currentIndex];
                          if (!file) return prev;
                          return { ...prev, [file.name]: e.target.value };
                        })
                      }
                      placeholder="Enter name to stamp"
                    />
                    <p className="text-sm text-muted-foreground">
                      Name is stored per file — switch images and edit names
                      individually.
                    </p>
                  </div>
                )}

                {/* Date section */}
                {includeDate && (
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <div className="flex gap-2 items-center">
                      <div className="flex-1">
                        <div className="flex gap-2 flex-wrap">
                          {dateFormats.map((d) => (
                            <Button
                              key={d.key}
                              variant={
                                dateFormat === d.key ? "default" : "outline"
                              }
                              size="sm"
                              onClick={() => setDateFormat(d.key)}
                            >
                              {d.label}
                            </Button>
                          ))}
                        </div>

                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {dateFormat === "DD/MM/YYYY" && (
                            <>
                              <Input
                                value={day}
                                onChange={(e) =>
                                  setDay(
                                    e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 2)
                                  )
                                }
                                placeholder="DD"
                              />
                              <Input
                                value={monthNumeric}
                                onChange={(e) =>
                                  setMonthNumeric(
                                    e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 2)
                                  )
                                }
                                placeholder="MM"
                              />
                              <Input
                                value={year}
                                onChange={(e) =>
                                  setYear(
                                    e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 4)
                                  )
                                }
                                placeholder="YYYY"
                              />
                            </>
                          )}
                          {dateFormat === "YYYY-MM-DD" && (
                            <>
                              <Input
                                value={year}
                                onChange={(e) =>
                                  setYear(
                                    e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 4)
                                  )
                                }
                                placeholder="YYYY"
                              />
                              <Input
                                value={monthNumeric}
                                onChange={(e) =>
                                  setMonthNumeric(
                                    e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 2)
                                  )
                                }
                                placeholder="MM"
                              />
                              <Input
                                value={day}
                                onChange={(e) =>
                                  setDay(
                                    e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 2)
                                  )
                                }
                                placeholder="DD"
                              />
                            </>
                          )}
                          {dateFormat === "Month DD, YYYY" && (
                            <>
                              <select
                                value={monthName}
                                onChange={(e) => setMonthName(e.target.value)}
                                className="p-2 rounded border"
                              >
                                {months.map((m) => (
                                  <option key={m} value={m}>
                                    {m}
                                  </option>
                                ))}
                              </select>
                              <Input
                                value={day}
                                onChange={(e) =>
                                  setDay(
                                    e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 2)
                                  )
                                }
                                placeholder="DD"
                              />
                              <Input
                                value={year}
                                onChange={(e) =>
                                  setYear(
                                    e.target.value
                                      .replace(/\D/g, "")
                                      .slice(0, 4)
                                  )
                                }
                                placeholder="YYYY"
                              />
                            </>
                          )}
                        </div>

                        <div className="mt-2 text-sm text-muted-foreground">
                          Example:{" "}
                          {includeName
                            ? nameOverrides[
                                selectedFiles[currentIndex]?.name ?? ""
                              ] ??
                              selectedFiles[currentIndex]?.name.replace(
                                /\.[^/.]+$/,
                                ""
                              )
                            : ""}
                          {includeName && includeDate ? " • " : ""}
                          {includeDate ? buildDateString() : ""}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Text style controls */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Font size ({fontSizePercent}%)</Label>
                    <Slider
                      value={[fontSizePercent]}
                      onValueChange={(v) => setFontSizePercent(v[0])}
                      min={2}
                      max={12}
                      step={1}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Footer opacity</Label>
                    <Slider
                      value={[barOpacity]}
                      onValueChange={(v) => setBarOpacity(v[0])}
                      min={0}
                      max={100}
                      step={5}
                    />
                    <div className="text-sm text-muted-foreground">
                      White background opacity (100 = solid).
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div
                  className={`${
                    selectedFiles.length > 1 ? "grid grid-cols-2 gap-3" : "flex"
                  } w-full`}
                >
                  <Button
                    onClick={handleProcessCurrent}
                    disabled={selectedFiles.length === 0 || isProcessing}
                    className="w-full"
                    size="lg"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                        Processing...
                      </>
                    ) : (
                      <>
                        <Target className="w-4 h-4 mr-2" /> Process Current
                      </>
                    )}
                  </Button>

                  {selectedFiles.length > 1 && (
                    <Button
                      onClick={handleProcessAll}
                      disabled={selectedFiles.length === 0 || isProcessing}
                      className="w-full"
                      size="lg"
                      variant="outline"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />{" "}
                          Processing...
                        </>
                      ) : (
                        <>
                          <Target className="w-4 h-4 mr-2" /> Process All
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {isProcessing && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Processing images...</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Results & Info */}
          <div className="space-y-6">
            {/* Tool Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="w-5 h-5 mr-2" /> Add Name & Date
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Badge variant="secondary" className="mr-2">
                      Pro
                    </Badge>
                    <span className="text-muted-foreground">
                      Custom name & date stamping
                    </span>
                  </div>
                  <div className="flex items-center text-sm">
                    <Badge variant="outline" className="mr-2">
                      Secure
                    </Badge>
                    <span className="text-muted-foreground">
                      Browser-based processing
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-medium mb-2">Features:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Name / Date / Both options</li>
                    <li>• Per-file name overrides (edit current image)</li>
                    <li>• Date format inputs with live example</li>
                    <li>
                      • Footer spans full width, auto height (white background)
                    </li>
                    <li>• Download processed images</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* Original Files (simplified) */}
            {selectedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Original Files</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="truncate mr-2">{file.name}</span>
                        <span className="text-muted-foreground">
                          {formatFileSize(file.size)}
                        </span>
                      </div>
                    ))}

                    <div className="pt-2 border-t">
                      <div className="flex justify-between font-medium">
                        <span>Total Size:</span>
                        <span>
                          {formatFileSize(
                            selectedFiles.reduce((sum, f) => sum + f.size, 0)
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Processed Files */}
            {processedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Stamped Images</span>
                    <Badge variant="default">
                      {processedFiles.length} files
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Download individual files or all at once.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button onClick={downloadAllFiles} className="w-full">
                    <Download className="w-4 h-4 mr-2" /> Download All (
                    {processedFiles.length})
                  </Button>

                  <div className="space-y-2">
                    {processedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 border rounded"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadFile(file)}
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
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

export default AddNameDate;
