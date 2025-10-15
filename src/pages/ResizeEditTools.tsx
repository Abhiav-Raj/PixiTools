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
  Crop,
  RotateCw,
  Type,
  Eraser,
  Palette,
  Calendar,
  FileSignature,
  Filter,
  ArrowRight,
} from "lucide-react";

const ResizeEditTools = () => {
  const tools = [
    {
      title: "Image Resizer",
      description:
        "Resize images with presets or custom dimensions while maintaining aspect ratio.",
      icon: Crop,
      path: "/tools/resize",
      badge: "Popular",
      features: [
        "Preset sizes",
        "Custom dimensions",
        "Aspect ratio lock",
        "Batch resize",
      ],
    },
    {
      title: "Crop Tool",
      description:
        "Crop images to focus on what matters most with precision controls.",
      icon: Crop,
      path: "/tools/crop",
      features: ["Freehand crop", "Ratio presets", "Grid overlay", "Undo/redo"],
    },
    {
      title: "Rotate & Flip",
      description:
        "Rotate images by any angle and flip them horizontally or vertically.",
      icon: RotateCw,
      path: "/tools/rotate",
      features: [
        "90°/180° presets",
        "Custom angles",
        "Flip options",
        "Preview mode",
      ],
    },
    {
      title: "Add Text/Watermark",
      description:
        "Add custom text, logos, or watermarks to protect your images.",
      icon: Type,
      path: "/tools/watermark",
      badge: "Pro",
      features: [
        "Custom text",
        "Logo overlay",
        "Position control",
        "Opacity settings",
      ],
    },
    {
      title: "Add Name & Date",
      description: "Automatically add filename and date stamps to your images.",
      icon: Calendar,
      path: "/tools/name-date",
      features: [
        "Auto filename",
        "Date formats",
        "Position options",
        "Font styles",
      ],
    },
    {
      title: "Add Signature",
      description: "Add your signature overlay to images and documents.",
      icon: FileSignature,
      path: "/tools/signature",
      features: [
        "PNG signatures",
        "Size adjustment",
        "Transparency",
        "Multiple positions",
      ],
    },

    {
      title: "Background Changer",
      description:
        "Replace image backgrounds with solid colors or custom images.",
      icon: Palette,
      path: "/tools/bg-change",
      features: [
        "Color picker",
        "Image backgrounds",
        "Blend modes",
        "Preview options",
      ],
    },
    {
      title: "Color Filters & Effects",
      description:
        "Apply professional filters and effects to enhance your images.",
      icon: Filter,
      path: "/tools/filters",
      features: ["Grayscale", "Blur/Sharpen", "Brightness", "Contrast"],
    },
    {
      title: "Background Remover",
      description:
        "Remove backgrounds from images automatically with AI precision.",
      icon: Eraser,
      // path: "/tools/bg-remove",
      badge: "AI",
      features: [
        "Auto detection",
        "Edge refinement",
        "Transparent output",
        "High quality",
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-primary">
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
              Resize & Edit Tools
            </h1>
            <p className="text-xl text-white/90 max-w-2xl mx-auto">
              Professional image editing tools to resize, crop, rotate, and
              enhance your images
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
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      {tool.badge && (
                        <Badge
                          variant={
                            tool.badge === "Popular"
                              ? "default"
                              : tool.badge === "AI"
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
                      variant={
                        tool.title === "Background Remover"
                          ? "secondary"
                          : "outline"
                      }
                      className={`w-full transition-all duration-300 ${
                        tool.title === "Background Remover"
                          ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                          : "group-hover:bg-primary group-hover:text-primary-foreground"
                      }`}
                      disabled={tool.title === "Background Remover"}
                    >
                      {tool.title === "Background Remover"
                        ? "Coming Soon"
                        : "Open Tool"}
                      {tool.title !== "Background Remover" && (
                        <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      )}
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

export default ResizeEditTools;
