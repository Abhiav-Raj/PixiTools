import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import ResizeEditTools from "./pages/ResizeEditTools";
import ConversionTools from "./pages/ConversionTools";
import CompressionTools from "./pages/CompressionTools";
import ImageResize from "./pages/tools/Resiz and Edit Tools/ImageResize";
import ImageCompress from "./pages/tools/Compression and Optimization/ImageCompress";
import NotFound from "./pages/NotFound";
import ImageCrop from "@/pages/tools/Resiz and Edit Tools/ImageCrop";
import ImageRotate from "./pages/tools/Resiz and Edit Tools/ImageRotate";
import ImageWatermark from "./pages/tools/Resiz and Edit Tools/ImageWatermark";
import AddNameDate from "./pages/tools/Resiz and Edit Tools/AddNameDate";
import AddSignature from "./pages/tools/Resiz and Edit Tools/AddSignature";
import BackgroundChanger from "./pages/tools/Resiz and Edit Tools/BackgroundChanger";
import ColorFilters from "./pages/tools/Resiz and Edit Tools/ColorFilters";
import ImageToPDF from "./pages/tools/Conversion and Document Tools/ImageToPdf";
import PDFToImages from "./pages/tools/Conversion and Document Tools/PdftoImages";
import PDFMerger from "./pages/tools/Conversion and Document Tools/PdfMerger";
import PDFSplitter from "./pages/tools/Conversion and Document Tools/PdfSplitter";
import PDFCompressor from "./pages/tools/Compression and Optimization/PdfCompressor";
import PDFWatermark from "./pages/tools/Conversion and Document Tools/PdfWatermark";
import PDFSign from "./pages/tools/Conversion and Document Tools/PdfSign";
import PdfPasswordProtect from "./pages/tools/Conversion and Document Tools/PdfPasswordProtect";
import WebOptimizer from "./pages/tools/Compression and Optimization/WebOptimizer";
import DocumentConversion from "./pages/tools/Conversion and Document Tools/DocumentConversionTool";
import AITextExtractor from "./pages/tools/Conversion and Document Tools/AITextExtractor";
import BatchCompressor from "./pages/tools/Compression and Optimization/BatchCompressor";
import TargetSizeCompressor from "./pages/tools/Compression and Optimization/TargetSizeCompressor";
import CompareCompression from "./pages/tools/Compression and Optimization/CompareCompression";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/resize-edit" element={<ResizeEditTools />} />
          <Route path="/conversion-tools" element={<ConversionTools />} />
          <Route path="/compression-tools" element={<CompressionTools />} />

          {/* Individual tool routes */}
          <Route path="/tools/resize" element={<ImageResize />} />

          <Route path="/tools/crop" element={<ImageCrop />} />
          <Route path="/tools/rotate" element={<ImageRotate />} />
          <Route path="/tools/watermark" element={<ImageWatermark />} />
          <Route path="/tools/name-date" element={<AddNameDate />} />
          <Route path="/tools/signature" element={<AddSignature />} />
          <Route path="/tools/bg-change" element={<BackgroundChanger />} />
          <Route path="/tools/filters" element={<ColorFilters />} />

          {/*Coversion and Document Tools Routes */}
          <Route path="/tools/image-to-pdf" element={<ImageToPDF />} />
          <Route path="/tools/pdf-to-image" element={<PDFToImages />} />
          <Route path="/tools/pdf-merge" element={<PDFMerger />} />
          <Route path="/tools/pdf-split" element={<PDFSplitter />} />

          <Route path="/tools/pdf-watermark" element={<PDFWatermark />} />
          <Route path="/tools/pdf-sign" element={<PDFSign />} />
          <Route path="/tools/pdf-password" element={<PdfPasswordProtect />} />
          <Route path="/tools/pdf-to-word" element={<DocumentConversion />} />
          <Route path="/tools/pdf-ocr" element={<AITextExtractor />} />

          {/*Compression and Optimization Tools Route*/}
          <Route path="/tools/web-optimize" element={<WebOptimizer />} />
          <Route path="/tools/pdf-compress" element={<PDFCompressor />} />
          <Route path="/tools/image-compress" element={<ImageCompress />} />
          <Route path="/tools/batch-compress" element={<BatchCompressor />} />
          <Route
            path="/tools/target-compress"
            element={<TargetSizeCompressor />}
          />
          <Route
            path="/tools/compare-compression"
            element={<CompareCompression />}
          />

          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
