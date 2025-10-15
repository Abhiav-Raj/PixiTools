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
  Globe,
  Layers,
  Target,
  Settings,
  ArrowRight,
  ArrowLeftRight, // ✅ Used instead of Compare
} from "lucide-react";

const CompressionTools = () => {
  const tools = [
    {
      title: "Image Compressor",
      description:
        "Reduce image file sizes while maintaining visual quality using advanced algorithms.",
      icon: FileImage,
      path: "/tools/image-compress",
      badge: "Popular",
      features: [
        "Target size",
        "Quality slider",
        "Format optimization",
        "Lossless option",
      ],
    },
    {
      title: "PDF Compressor",
      description:
        "Compress PDF files to reduce storage space and improve sharing speed.",
      icon: FileText,
      path: "/tools/pdf-compress",
      features: [
        "Size targets",
        "Quality levels",
        "Image compression",
        "Text optimization",
      ],
    },
    {
      title: "Web Optimizer",
      description:
        "Optimize images specifically for web use with perfect size-to-quality balance.",
      icon: Globe,
      path: "/tools/web-optimize",
      badge: "Pro",
      features: [
        "Web formats",
        "Progressive JPEG",
        "WebP support",
        "Responsive sizes",
      ],
    },
    {
      title: "Batch Compressor",
      description:
        "Process multiple files at once with consistent compression settings.",
      icon: Layers,
      path: "/tools/batch-compress",
      features: [
        "Multiple files",
        "Folder processing",
        "Consistent settings",
        "Progress tracking",
      ],
    },
    {
      title: "Target Size Compressor",
      description:
        "Compress files to exact target sizes for specific requirements.",
      icon: Target,
      path: "/tools/target-compress",
      badge: "Precision",
      features: [
        "Exact sizes",
        "10KB targets",
        "Email limits",
        "Storage optimization",
      ],
    },
    {
      title: "Compare Compression",
      description:
        "Compare original and compressed files side-by-side for quality check.",
      icon: ArrowLeftRight, // ✅ Replacement icon
      path: "/tools/compare-compression",
      features: [
        "Side-by-side view",
        "Before/after slider",
        "Zoom preview",
        "Detail analysis",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-to-br from-pink-500 to-red-500">
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
              Compression & Optimization
            </h1>
            <p className="text-xl text-white/90 max-w-2xl mx-auto">
              Reduce file sizes while maintaining quality with professional
              compression tools
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
                <Card className="card-glass hover-lift h-full group-hover:border-primary/50">
                  <CardHeader>
                    <div className="flex items-start justify-between mb-3">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      {tool.badge && (
                        <Badge
                          variant={
                            tool.badge === "Popular"
                              ? "default"
                              : tool.badge === "Precision"
                              ? "destructive"
                              : "secondary"
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

export default CompressionTools;
