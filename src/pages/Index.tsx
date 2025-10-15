import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Crop, 
  FileImage, 
  Zap, 
  Download, 
  Shield, 
  Smartphone,
  ArrowRight,
  Sparkles
} from "lucide-react";

const Index = () => {
  const toolCategories = [
    {
      title: "Resize & Edit Tools",
      description: "Resize, crop, rotate, add watermarks, remove backgrounds, and apply filters to your images.",
      icon: Crop,
      path: "/resize-edit",
      tools: ["Image Resizer", "Crop Tool", "Background Remover", "Watermark", "Filters"],
      color: "from-blue-500 to-purple-600"
    },
    {
      title: "Conversion & Document Tools", 
      description: "Convert between formats, merge/split PDFs, and manage your documents with ease.",
      icon: FileImage,
      path: "/conversion-tools",
      tools: ["Image to PDF", "PDF to Image", "PDF Merger", "PDF Splitter", "Sign PDF"],
      color: "from-purple-500 to-pink-600"
    },
    {
      title: "Compression & Optimization",
      description: "Compress images and PDFs to reduce file sizes while maintaining quality.",
      icon: Zap,
      path: "/compression-tools", 
      tools: ["Image Compressor", "PDF Compressor", "Batch Optimizer", "Web Optimizer"],
      color: "from-pink-500 to-red-500"
    }
  ];

  const features = [
    {
      icon: Download,
      title: "100% Browser-Based",
      description: "All processing happens locally in your browser. No uploads to our servers."
    },
    {
      icon: Shield,
      title: "Privacy First",
      description: "Your files never leave your device. Complete privacy and security guaranteed."
    },
    {
      icon: Smartphone,
      title: "Works Everywhere",
      description: "Fully responsive design that works on desktop, tablet, and mobile devices."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="relative overflow-hidden bg-gradient-hero">
        <div className="absolute inset-0 bg-black/10"></div>
        <div className="relative container mx-auto px-4 py-20 text-center">
          <div className="animate-fade-in">
            <Badge variant="secondary" className="mb-6 bg-white/20 text-white border-white/30">
              <Sparkles className="w-4 h-4 mr-2" />
              100% Free & Browser-Based
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
              PixiTools
            </h1>
            <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto leading-relaxed">
              All-in-One Image & PDF Toolkit
            </p>
            <p className="text-lg text-white/80 mb-10 max-w-2xl mx-auto">
              Compress, Resize, Convert, Edit, Watermark, and Manage images and PDFs — 100% free and browser-based.
            </p>
            <Button size="lg" className="btn-hero text-lg px-8 py-6 animate-scale-in">
              Get Started Free
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Tool Categories */}
      <section className="py-20 container mx-auto px-4">
        <div className="text-center mb-16 animate-slide-up">
          <h2 className="text-4xl font-bold mb-4">Choose Your Tool Category</h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Professional-grade tools organized by category for your convenience
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {toolCategories.map((category, index) => {
            const Icon = category.icon;
            return (
              <Link 
                key={category.title} 
                to={category.path}
                className="group"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <Card className="card-glass hover-lift h-full group-hover:border-primary/50 transition-all duration-300">
                  <CardHeader className="text-center pb-4">
                    <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br ${category.color} flex items-center justify-center shadow-elevated`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <CardTitle className="text-2xl mb-2 group-hover:text-primary transition-colors">
                      {category.title}
                    </CardTitle>
                    <CardDescription className="text-base leading-relaxed">
                      {category.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 mb-6">
                      {category.tools.map((tool) => (
                        <div key={tool} className="flex items-center text-sm text-muted-foreground">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary mr-3"></div>
                          {tool}
                        </div>
                      ))}
                    </div>
                    <Button 
                      variant="outline" 
                      className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300"
                    >
                      Explore Tools
                      <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-gradient-secondary">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Why Choose PixiTools?</h2>
            <p className="text-xl text-muted-foreground">
              Professional-grade tools with privacy and security at the core
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div 
                  key={feature.title} 
                  className="text-center animate-fade-in"
                  style={{ animationDelay: `${index * 200}ms` }}
                >
                  <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-primary">
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-4">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t">
        <div className="container mx-auto px-4 text-center">
          <p className="text-muted-foreground mb-4">
            Made with ❤️ for creators and professionals worldwide
          </p>
          <p className="text-sm text-muted-foreground">
            © 2024 PixiTools. All rights reserved. Your privacy is our priority.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;