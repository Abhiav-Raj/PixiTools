import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  FileImage,
  FileText,
  Merge,
  Split,
  FileSignature,
  Lock,
  Edit,
  BookOpen,
  Eye,
  ArrowRight,
} from "lucide-react";

const ConversionTools = () => {
  const tools = [
    {
      title: "Image to PDF",
      description:
        "Convert single or multiple images into a professional PDF document.",
      icon: FileText,
      path: "/tools/image-to-pdf",
      badge: "Popular",
      features: [
        "Multiple formats",
        "Page sizing",
        "Quality settings",
        "Batch convert",
      ],
    },
    {
      title: "PDF to Image",
      description:
        "Extract images from PDF files or convert PDF pages to image formats.",
      icon: FileImage,
      path: "/tools/pdf-to-image",
      features: ["All pages", "Page range", "High DPI", "Format choice"],
    },
    {
      title: "PDF Merger",
      description:
        "Combine multiple PDF files into a single document with custom ordering.",
      icon: Merge,
      path: "/tools/pdf-merge",
      features: ["Drag & drop", "Page order", "Bookmarks", "Fast merge"],
    },
    {
      title: "PDF Splitter",
      description:
        "Split large PDF files into smaller documents by page range or bookmarks.",
      icon: Split,
      path: "/tools/pdf-split",
      features: ["Page ranges", "Single pages", "By bookmarks", "Batch split"],
    },
    {
      title: "PDF to Word/Excel",
      description:
        "Convert PDFs into fully editable Word or Excel documents while preserving layout.",
      icon: BookOpen,
      path: "/tools/pdf-to-word",
      features: [
        "Editable text",
        "Table detection",
        "Preserve formatting",
        "Fast conversion",
      ],
    },
    {
      title: "PDF Watermark",
      description:
        "Add text or image watermarks to PDF documents with full control.",
      icon: FileText,
      path: "/tools/pdf-watermark",
      features: [
        "Text & images",
        "Diagonal layout",
        "Opacity control",
        "All pages",
      ],
    },
    {
      title: "PDF Editor",
      description:
        "Edit text, highlight, annotate, and modify PDF pages directly in your browser.",
      icon: Edit,
      path: "/tools/pdf-editor",
      badge: "New",
      features: ["Add text", "Annotations", "Highlight text", "Shape tools"],
    },
    {
      title: "Sign PDF",
      description:
        "Add digital signatures to PDF documents with uploaded signature images.",
      icon: FileSignature,
      path: "/tools/pdf-sign",
      features: [
        "PNG signatures",
        "Multiple positions",
        "Resize signatures",
        "Professional look",
      ],
    },
    {
      title: "Password Protect PDF",
      description:
        "Add password protection to your PDF files for enhanced security.",
      icon: Lock,
      path: "/tools/pdf-password",
      badge: "Security",
      features: [
        "User passwords",
        "Owner passwords",
        "Print restrictions",
        "Copy protection",
      ],
    },
    {
      title: "AI Text Extractor (OCR)",
      description:
        "Extract text, tables, and handwriting from scanned PDFs or images with AI.",
      icon: Eye,
      path: "/tools/pdf-ocr",
      badge: "AI",
      features: [
        "OCR support",
        "Handwriting recognition",
        "Export to TXT/Word",
        "Multi-language",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-to-br from-purple-500 to-pink-600">
        <div className="container mx-auto px-4 py-12">
          <div className="flex items-center mb-6">
            <Link to="/" className="mr-4">
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </Link>
          </div>
          <div className="text-center text-white">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              Conversion & Document Tools
            </h1>
            <p className="text-xl text-white/90 max-w-2xl mx-auto">
              Convert, edit, extract, and secure documents with
              professional-grade tools.
            </p>
          </div>
        </div>
      </header>

      {/* Tools Grid */}
      <section className="py-16 container mx-auto px-4">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool, index) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.title}
                to={tool.path}
                className="group"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <Card className="card-glass hover-lift h-full group-hover:border-primary/50 transition-all">
                  <CardHeader>
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      {tool.badge && (
                        <Badge
                          variant={
                            tool.badge === "Popular"
                              ? "default"
                              : tool.badge === "Security"
                              ? "destructive"
                              : tool.badge === "AI"
                              ? "secondary"
                              : tool.badge === "New"
                              ? "default"
                              : "outline"
                          }
                          className="text-xs"
                        >
                          {tool.badge}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">
                      {tool.title}
                    </CardTitle>
                    <CardDescription className="leading-relaxed">
                      {tool.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 mb-4">
                      {tool.features.map((feature) => (
                        <div
                          key={feature}
                          className="flex items-center text-sm text-muted-foreground"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-primary mr-3"></div>
                          {feature}
                        </div>
                      ))}
                    </div>
                    <Button
                      variant="outline"
                      className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300"
                    >
                      Open Tool
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default ConversionTools;
