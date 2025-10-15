import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import FileUploader from "@/components/FileUploader";

import * as mammoth from "mammoth";
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx";
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
} from "docx";
import * as pdfjsLib from "pdfjs-dist";
import { saveAs } from "file-saver";
// @ts-ignore
import PptxGenJS from "pptxgenjs";

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

type OutputFormat =
  | "pdf-to-word"
  | "pdf-to-excel"
  | "word-to-pdf"
  | "word-to-excel"
  | "docpdf-to-ppt"
  | "session-ppt-to-pdf";

const DocumentConversionTool: React.FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("pdf-to-word");
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sessionSlides, setSessionSlides] = useState<
    { title?: string; text: string }[]
  >([]);
  const { toast } = useToast();

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    setProgress(0);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((s) => s.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  /** ------------------ PDF helpers ------------------ **/
  const round = (v: number, thresh = 2) => Math.round(v / thresh) * thresh;

  const itemsToXY = (items: any[]) =>
    items.map((it: any) => {
      const transform = it.transform || it.tm || [1, 0, 0, 1, 0, 0];
      return { x: transform[4] ?? 0, y: transform[5] ?? 0, str: it.str ?? "" };
    });

  const groupItemsIntoRows = (
    xyItems: { x: number; y: number; str: string }[],
    yThresh = 4
  ) => {
    const sorted = [...xyItems].sort((a, b) => b.y - a.y || a.x - b.x);
    const rows: { y: number; items: { x: number; str: string }[] }[] = [];
    for (const it of sorted) {
      const yKey = round(it.y, yThresh);
      const found = rows.find((r) => Math.abs(r.y - yKey) <= yThresh);
      if (found) found.items.push({ x: it.x, str: it.str });
      else rows.push({ y: yKey, items: [{ x: it.x, str: it.str }] });
    }
    rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
    rows.sort((a, b) => b.y - a.y);
    return rows;
  };

  const detectColumns = (
    rows: { y: number; items: { x: number; str: string }[] }[]
  ) => {
    const xs: number[] = [];
    for (const r of rows.slice(0, Math.min(rows.length, 30))) {
      for (const it of r.items) xs.push(it.x);
    }
    xs.sort((a, b) => a - b);
    const clusters: number[] = [];
    const clusterThresh = 20;
    for (const x of xs) {
      if (
        !clusters.length ||
        Math.abs(x - clusters[clusters.length - 1]) > clusterThresh
      )
        clusters.push(x);
      else
        clusters[clusters.length - 1] = (clusters[clusters.length - 1] + x) / 2;
    }
    return clusters;
  };

  /** ------------------ Conversion functions ------------------ **/
  const convertWordToPdf = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const doc = new jsPDF();
    const lines = result.value.split("\n");
    const lineHeight = 10;
    const pageHeight = doc.internal.pageSize.height as number;
    let y = 10;

    for (const line of lines) {
      const text = line || " ";
      if (y + lineHeight > pageHeight - 10) {
        doc.addPage();
        y = 10;
      }
      doc.text(text, 10, y);
      y += lineHeight;
    }
    saveAs(doc.output("blob"), file.name.replace(/\.[^.]+$/, ".pdf"));
  };

  const convertWordToExcel = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    const rows = result.value
      .split("\n")
      .filter((r) => r.trim() !== "")
      .map((r) => [r]);
    const ws = XLSX.utils.aoa_to_sheet(rows.length ? rows : [[""]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout]), file.name.replace(/\.[^.]+$/, ".xlsx"));
  };

  const convertPdfToWord = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const sections: any[] = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const xyItems = itemsToXY(content.items);
      const rows = groupItemsIntoRows(xyItems, 4);
      const colXs = detectColumns(rows);

      const avgItemsPerRow = rows.length
        ? rows.reduce((s, r) => s + r.items.length, 0) / rows.length
        : 0;
      const createTable = avgItemsPerRow > 1 && colXs.length > 1;

      if (createTable) {
        const tableRows: TableRow[] = [];
        for (const r of rows) {
          const cells: TableCell[] = [];
          const colTexts: string[] = new Array(colXs.length).fill("");
          for (const it of r.items) {
            let bestIdx = 0;
            let bestDist = Infinity;
            for (let ci = 0; ci < colXs.length; ci++) {
              const d = Math.abs(it.x - colXs[ci]);
              if (d < bestDist) {
                bestDist = d;
                bestIdx = ci;
              }
            }
            colTexts[bestIdx] =
              (colTexts[bestIdx] ? colTexts[bestIdx] + " " : "") + it.str;
          }
          for (const ct of colTexts)
            cells.push(new TableCell({ children: [new Paragraph(ct || "")] }));
          tableRows.push(new TableRow({ children: cells }));
        }
        sections.push({
          children: [
            new Paragraph(`Page ${p}`),
            new Table({ rows: tableRows }),
          ],
        });
      } else {
        const paras: Paragraph[] = rows.map(
          (r) =>
            new Paragraph({
              children: r.items.map((it) => new TextRun(it.str || "")),
            })
        );
        sections.push({
          children: [
            new Paragraph({
              children: [new TextRun({ text: `Page ${p}`, bold: true })],
            }),
            ...paras,
          ],
        });
      }
    }

    const doc = new DocxDocument({ sections });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, file.name.replace(/\.[^.]+$/, ".docx"));
  };

  const convertPdfToExcel = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const rowsOut: string[][] = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const xyItems = itemsToXY(content.items);
      const rows = groupItemsIntoRows(xyItems, 4);
      const colXs = detectColumns(rows);

      if (colXs.length > 1) {
        for (const r of rows) {
          const colTexts: string[] = new Array(colXs.length).fill("");
          for (const it of r.items) {
            let bestIdx = 0;
            let bestDist = Infinity;
            for (let ci = 0; ci < colXs.length; ci++) {
              const d = Math.abs(it.x - colXs[ci]);
              if (d < bestDist) {
                bestDist = d;
                bestIdx = ci;
              }
            }
            colTexts[bestIdx] =
              (colTexts[bestIdx] ? colTexts[bestIdx] + " " : "") + it.str;
          }
          rowsOut.push(colTexts.map((c) => c.trim()));
        }
      } else {
        for (const r of rows)
          rowsOut.push([
            r.items
              .map((it) => it.str)
              .join(" ")
              .trim(),
          ]);
      }
      rowsOut.push([`(Page ${p} end)`]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rowsOut.length ? rowsOut : [[""]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout]), file.name.replace(/\.[^.]+$/, ".xlsx"));
  };

  /** ------------------ DOC/PDF → PPT & Session ------------------ **/
  const convertDocOrPdfToPpt = async (file: File) => {
    const nameBase = file.name.replace(/\.[^.]+$/, "");
    const pptx = new PptxGenJS();
    const slidesForSession: { title?: string; text: string }[] = [];

    if (file.type === "application/pdf") {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((it: any) => it.str)
          .join(" ")
          .trim();
        const slide = pptx.addSlide();
        slide.addText(pageText || `Page ${p}`, {
          x: 0.5,
          y: 0.5,
          w: "90%",
          h: "85%",
          fontSize: 14,
          wrap: true,
        });
        slidesForSession.push({ title: `Page ${p}`, text: pageText || "" });
      }
    } else {
      const arrayBuffer = await file.arrayBuffer();
      const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlResult.value, "text/html");
      const headingTags = ["h1", "h2", "h3"];
      const blocks: { title?: string; text: string }[] = [];
      let current: { title?: string; text: string } | null = null;

      Array.from(doc.body.children).forEach((node) => {
        if (headingTags.includes(node.tagName.toLowerCase())) {
          if (current) blocks.push(current);
          current = { title: node.textContent?.trim() || undefined, text: "" };
        } else if (node.tagName.toLowerCase() === "p") {
          if (!current) current = { text: node.textContent || "" };
          else
            current.text +=
              (current.text ? "\n\n" : "") + (node.textContent || "");
        } else {
          const txt = node.textContent || "";
          if (txt.trim()) {
            if (!current) current = { text: txt };
            else current.text += (current.text ? "\n\n" : "") + txt;
          }
        }
      });
      if (current) blocks.push(current);

      blocks.forEach((b) => {
        const paras = b.text
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean);
        if (b.title) {
          const slide = pptx.addSlide();
          slide.addText(b.title, {
            x: 0.5,
            y: 0.25,
            w: "90%",
            fontSize: 24,
            bold: true,
          });
          slide.addText(paras.slice(0, 4).join("\n\n"), {
            x: 0.5,
            y: 1.2,
            w: "90%",
            h: "75%",
            fontSize: 14,
            wrap: true,
          });
          slidesForSession.push({
            title: b.title,
            text: paras.slice(0, 4).join("\n\n"),
          });
          for (let i = 4; i < paras.length; i += 4) {
            const chunk = paras.slice(i, i + 4).join("\n\n");
            const slide2 = pptx.addSlide();
            slide2.addText(chunk, {
              x: 0.5,
              y: 0.5,
              w: "90%",
              h: "85%",
              fontSize: 14,
              wrap: true,
            });
            slidesForSession.push({ title: undefined, text: chunk });
          }
        } else {
          for (let i = 0; i < paras.length; i += 4) {
            const chunk = paras.slice(i, i + 4).join("\n\n");
            const slide = pptx.addSlide();
            slide.addText(chunk, {
              x: 0.5,
              y: 0.5,
              w: "90%",
              h: "85%",
              fontSize: 14,
              wrap: true,
            });
            slidesForSession.push({ title: undefined, text: chunk });
          }
        }
      });
    }

    setSessionSlides((prev) => [...prev, ...slidesForSession]);
    await pptx.writeFile({ fileName: `${nameBase}.pptx` });
  };

  const convertSessionPptSlidesToPdf = async (
    fileName = "session_slides.pdf"
  ) => {
    if (!sessionSlides.length) {
      toast({
        title: "No session slides",
        description: "There are no slides created in this session.",
        variant: "destructive",
      });
      return;
    }
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height as number;
    const lineHeight = 10;
    let first = true;

    for (const s of sessionSlides) {
      if (!first) doc.addPage();
      first = false;
      const text = (s.title ? s.title + "\n\n" : "") + s.text;
      const lines = text.split("\n").flatMap((ln) => {
        const max = 80;
        if (ln.length <= max) return [ln];
        const out: string[] = [];
        for (let i = 0; i < ln.length; i += max) out.push(ln.slice(i, i + max));
        return out;
      });
      let y = 10;
      for (const line of lines) {
        if (y + lineHeight > pageHeight - 10) {
          doc.addPage();
          y = 10;
        }
        doc.text(String(line), 10, y);
        y += lineHeight;
      }
    }
    saveAs(doc.output("blob"), fileName);
  };

  const handleConvert = async () => {
    if (!selectedFiles.length) {
      toast({
        title: "No files selected",
        description: "Please upload at least one file to convert.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);

    try {
      const total = selectedFiles.length;
      for (let i = 0; i < total; i++) {
        const file = selectedFiles[i];
        switch (outputFormat) {
          case "word-to-pdf":
            await convertWordToPdf(file);
            break;
          case "word-to-excel":
            await convertWordToExcel(file);
            break;
          case "pdf-to-word":
            await convertPdfToWord(file);
            break;
          case "pdf-to-excel":
            await convertPdfToExcel(file);
            break;
          case "docpdf-to-ppt":
            await convertDocOrPdfToPpt(file);
            break;
          case "session-ppt-to-pdf":
            await convertSessionPptSlidesToPdf(
              file.name.replace(/\.[^.]+$/, ".pdf")
            );
            break;
        }
        setProgress(((i + 1) / total) * 100);
      }

      toast({
        title: "Conversion complete",
        description: "All files processed successfully.",
      });
    } catch (err: any) {
      console.error(err);
      toast({
        title: "Conversion error",
        description: err.message || "An error occurred during conversion.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="max-w-4xl mx-auto my-10 shadow-lg border">
      <CardHeader>
        <CardTitle>Document Conversion Tool</CardTitle>
        <CardDescription>
          Convert documents between PDF, Word, Excel, and PowerPoint formats.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Upload Files</Label>
          <FileUploader
            files={selectedFiles}
            onFilesSelected={handleFilesSelected}
          />
          {selectedFiles.length > 0 && (
            <div className="mt-3">
              {selectedFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between text-sm border rounded p-2 mt-1"
                >
                  <span>
                    {file.name} ({formatFileSize(file.size)})
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveFile(i)}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Conversion Type</Label>
          <select
            className="border rounded p-2 w-full"
            value={outputFormat}
            onChange={(e) => setOutputFormat(e.target.value as OutputFormat)}
          >
            <option value="pdf-to-word">PDF ➜ Word</option>
            <option value="pdf-to-excel">PDF ➜ Excel</option>
            <option value="word-to-pdf">Word ➜ PDF</option>
            <option value="word-to-excel">Word ➜ Excel</option>
            <option value="docpdf-to-ppt">DOC/PDF ➜ PPT</option>
            <option value="session-ppt-to-pdf">Session PPT ➜ PDF</option>
          </select>
        </div>

        {isProcessing && (
          <div className="space-y-2">
            <Label>Progress</Label>
            <Progress value={progress} />
          </div>
        )}

        <div className="flex justify-between items-center">
          <Button
            onClick={handleConvert}
            disabled={isProcessing || selectedFiles.length === 0}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Converting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" /> Convert Files
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default DocumentConversionTool;
